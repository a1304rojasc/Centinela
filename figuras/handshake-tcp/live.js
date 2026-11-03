const D = __DATA__;
const P = D.P;

// ---------------------------------------------------------------- el modelo TCP
// Tiempos en segundos simulados. El tubo tarda LINK en un sentido; el RTO inicial
// es 1 s (RFC 6298) y se duplica en cada reintento.
const LINK = 0.15;
const RTO0 = 1;
const SYN_RETRIES = 6; // Linux: net.ipv4.tcp_syn_retries = 6
const SYNACK_RETRIES = 2; // aquí 2; Linux usa 5 por defecto
const BACKLOG = 8; // huecos de la cola SYN de esta figura
const FLOOD_EVERY = 0.025;
const STATES = ["CLOSED", "LISTEN", "SYN_SENT", "SYN_RECEIVED", "ESTABLISHED"];

const rand32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
const plus = (a, b) => (a + b) >>> 0; // aritmética de 32 bits, como TCP
const pad = (n) => (n === null || n === undefined ? "—" : String(n >>> 0));

const model = {};
function resetModel() {
  Object.assign(model, {
    t: 0,
    client: { state: "CLOSED", iss: null, irs: null, rto: RTO0, deadline: null, started: 0, tries: 0 },
    server: { state: "CLOSED", listenAt: 0.25, legit: null, done: null, queue: [] },
    capsules: [],
    lose: null,
    flood: false,
    nextFlood: 0,
    dropped: 0,
    step: "",
    log: [],
  });
}
const sel = document.getElementById("hs-lose");
function log(text, extra = {}) {
  model.log.push({ text, ...extra });
  if (model.log.length > 8) model.log.shift();
  logDirty = true;
}
function say(text) {
  model.step = text;
}

function send(from, kind, seq, ack, { spoof = false, retry = false } = {}) {
  let lost = false;
  if (!spoof && model.lose === kind) {
    lost = true;
    model.lose = null;
  }
  const path = from === "a" ? "a2s" : from === "c" ? (lost ? "c2x" : "c2s") : lost || spoof ? "s2x" : "s2c";
  const capsule = { kind, seq, ack, from, spoof, lost, path, born: model.t, len: D.lengths[path] };
  model.capsules.push(capsule);
  const arrow = from === "s" ? "←" : "→";
  const who = from === "a" ? "atacante" : from === "c" ? "cliente" : "servidor";
  const nums = `seq=${pad(seq)}${ack === null ? "" : ` ack=${pad(ack)}`}`;
  if (!spoof || model.log.filter((l) => l.spoof).length < 2) log(`${arrow} ${kind} ${nums} · ${who}${retry ? " · retransmisión" : ""}${spoof && from === "a" ? " · IP falsa" : ""}`, { capsule, spoof });
  return capsule;
}
const speed = () => D.lengths.c2s / LINK; // unidades de tubo por segundo simulado

// --- cliente
function connect() {
  const c = model.client;
  if (c.state !== "CLOSED") {
    resetAll();
  }
  if (model.server.state === "CLOSED") model.server.listenAt = model.t;
  model.lose = sel.value || null;
  c.iss = rand32();
  c.irs = null;
  c.state = "SYN_SENT";
  c.rto = RTO0;
  c.tries = 0;
  sendSyn();
  say(`Paso 1 de 3 · El cliente elige un número inicial aleatorio x = ${pad(c.iss)} y envía SYN con seq = x. Pasa a SYN_SENT y arranca su reloj (RTO ${num(c.rto)} s).`);
}
function sendSyn(retry = false) {
  const c = model.client;
  send("c", "SYN", c.iss, null, { retry });
  c.started = model.t;
  c.deadline = model.t + c.rto;
}
function clientGets(cap) {
  const c = model.client;
  if (cap.kind !== "SYN-ACK") return;
  if (c.state === "SYN_SENT" && cap.ack === plus(c.iss, 1)) {
    c.irs = cap.seq;
    c.state = "ESTABLISHED";
    c.deadline = null;
    send("c", "ACK", plus(c.iss, 1), plus(c.irs, 1));
    say(`Paso 3 de 3 · El cliente comprueba que ack = x + 1 = ${pad(cap.ack)}: su SYN llegó. Guarda y = ${pad(c.irs)}, pasa a ESTABLISHED y envía ACK con seq = x + 1 y ack = y + 1 = ${pad(plus(c.irs, 1))}.`);
  } else if (c.state === "ESTABLISHED" && cap.seq === c.irs) {
    send("c", "ACK", plus(c.iss, 1), plus(c.irs, 1), { retry: true });
    say("El servidor repitió su SYN-ACK porque no le llegó el ACK. El cliente, ya en ESTABLISHED, vuelve a mandar el mismo ACK.");
  }
}
// --- servidor
function serverGets(cap) {
  const s = model.server;
  if (s.state === "CLOSED") return;
  if (cap.kind === "SYN") {
    const legit = !cap.spoof;
    const known = legit && s.legit && s.legit.irs === cap.seq;
    if (known) {
      synAck(s.legit, true);
      say("Llega otra vez el mismo SYN (el SYN-ACK se perdió y el cliente reintentó). El servidor repite su SYN-ACK con el mismo y.");
      return;
    }
    if (s.queue.length >= BACKLOG) {
      model.dropped++;
      if (legit) {
        log(`× SYN seq=${pad(cap.seq)} descartado: cola SYN llena`);
        say(`La cola SYN del servidor está llena (${BACKLOG} de ${BACKLOG}) de conexiones medio abiertas falsas: el SYN legítimo se descarta. El cliente reintentará cuando venza su RTO.`);
      }
      return;
    }
    const entry = { legit, irs: cap.seq, iss: rand32(), rto: RTO0, tries: 0, deadline: 0, started: 0 };
    s.queue.push(entry);
    if (legit) {
      s.legit = entry;
      s.state = "SYN_RECEIVED";
      say(`Paso 2 de 3 · El servidor recibe el SYN (x = ${pad(entry.irs)}), guarda la conexión medio abierta en su cola y pasa a SYN_RECEIVED. Elige su número aleatorio y = ${pad(entry.iss)} y responde SYN-ACK: seq = y, ack = x + 1 = ${pad(plus(entry.irs, 1))}.`);
    }
    synAck(entry, false);
  } else if (cap.kind === "ACK" && s.legit && s.state === "SYN_RECEIVED" && cap.ack === plus(s.legit.iss, 1)) {
    s.queue = s.queue.filter((e) => e !== s.legit);
    s.done = s.legit;
    s.state = "ESTABLISHED";
    say(`Hecho · El servidor comprueba que ack = y + 1 = ${pad(cap.ack)} y pasa a ESTABLISHED. La conexión está abierta: el cliente enviará su primer byte con seq = ${pad(cap.seq)} y el servidor con seq = ${pad(cap.ack)}.`);
  }
}
function synAck(entry, retry) {
  send("s", "SYN-ACK", entry.iss, plus(entry.irs, 1), { spoof: !entry.legit, retry });
  entry.started = model.t;
  entry.deadline = model.t + entry.rto;
}

function timers() {
  const c = model.client;
  const s = model.server;
  if (s.state === "CLOSED" && model.t >= s.listenAt) s.state = "LISTEN";
  if (c.state === "SYN_SENT" && c.deadline !== null && model.t >= c.deadline) {
    c.tries++;
    if (c.tries > SYN_RETRIES) {
      c.state = "CLOSED";
      c.deadline = null;
      say("El cliente agotó sus reintentos de SYN y se rinde: vuelve a CLOSED (la conexión falla).");
      return;
    }
    c.rto *= 2;
    sendSyn(true);
    say(`Venció el RTO del cliente sin respuesta: reenvía el SYN con el mismo seq = x = ${pad(c.iss)} y duplica su reloj a ${num(c.rto)} s.`);
  }
  for (const e of [...s.queue]) {
    if (model.t < e.deadline) continue;
    e.tries++;
    if (e.tries > SYNACK_RETRIES) {
      s.queue = s.queue.filter((x) => x !== e);
      if (e === s.legit) {
        s.legit = null;
        s.state = "LISTEN";
        say("El servidor agotó sus reintentos de SYN-ACK: borra la conexión medio abierta y vuelve a escuchar.");
      }
      continue;
    }
    e.rto *= 2;
    synAck(e, true);
    if (e === s.legit) say(`Venció el RTO del servidor sin recibir el ACK: reenvía el SYN-ACK con el mismo seq = y = ${pad(e.iss)} y duplica su reloj a ${num(e.rto)} s.`);
  }
  if (model.flood && model.t >= model.nextFlood) {
    model.nextFlood = model.t + FLOOD_EVERY;
    send("a", "SYN", rand32(), null, { spoof: true });
  }
}
function moveCapsules() {
  const v = speed();
  for (const cap of model.capsules) {
    if (cap.gone) continue;
    if ((model.t - cap.born) * v < cap.len) continue;
    cap.gone = true;
    if (cap.lost) {
      log(`  · se perdió el ${cap.kind}${cap.spoof ? " (IP falsa: nadie contesta)" : ""}`, { lost: true });
      if (!cap.spoof) say(`Se perdió el ${cap.kind}: el desviador lo mandó al cesto. Nadie lo confirma, así que el reloj de quien lo envió sigue corriendo hasta el RTO y entonces lo reenvía.`);
      cap.ref = null;
    } else if (cap.path === "s2c") clientGets(cap);
    else if (cap.path === "c2s" || cap.path === "a2s") serverGets(cap);
  }
  model.capsules = model.capsules.filter((cap) => !cap.gone);
}
function stepModel(dt) {
  model.t += dt;
  timers();
  moveCapsules();
}

// ---------------------------------------------------------------- lo que se ve
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const q = (s) => svg.querySelector(s);
const capsLayer = q('[data-part="capsules"]');
const levers = { c: q('[data-part="lever-c"]'), s: q('[data-part="lever-s"]') };
const needles = { c: q('[data-part="needle-c"]'), s: q('[data-part="needle-s"]') };
const buttonEl = q('[data-part="button"]');
const pointerEl = q('[data-part="pointer"]');
const slotEls = [...svg.querySelectorAll("[data-slot]")];
const stateEls = { c: q('[data-state="c"]'), s: q('[data-state="s"]') };
const digitEls = {};
for (const key of ["c-seq", "c-ack", "s-seq", "s-ack"]) digitEls[key] = [...svg.querySelectorAll(`[data-num="${key}"]`)];
const out = Object.fromEntries([...document.querySelectorAll("[data-out]")].map((el) => [el.dataset.out, el]));
const stepEl = document.querySelector("[data-step]");
const logEl = document.querySelector("[data-log]");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const num = (v, d = 1) => v.toFixed(d).replace(".", ",");
const write = (el, text) => {
  if (el && el.textContent !== text) el.textContent = text;
};
let logDirty = true;

const ease = { c: 0, s: 0, press: 0, divert: 0 };
const follow = (x, target, dt, tau) => (still.matches ? target : target + (x - target) * Math.exp(-dt / tau));

function leverSvg(id, a) {
  const F = D.sideFrames[id];
  const d = [-Math.sin(a), Math.cos(a)];
  const n = [Math.cos(a), Math.sin(a)];
  const L = D.lever.len;
  const pt = (t, w) => [d[0] * t + n[0] * w, d[1] * t + n[1] * w];
  const bar = [pt(-2.4, -1.7), pt(-2.4, 1.7), pt(L, 1.05), pt(L, -1.05)];
  const world = ([x, y], s) => [F.o[0] + F.a[0] * s + F.u[0] * x + F.v[0] * y, F.o[1] + F.a[1] * s + F.u[1] * x + F.v[1] * y, F.o[2] + F.a[2] * s + F.u[2] * x + F.v[2] * y];
  const knob = world(pt(L, 0), 2.3);
  return (
    solidSvg(G.prismOf(F, bar, 1, 2.1, P), { tone: "hi", crease: "lo" }) +
    solidSvg(G.disc(2.1, 3, 2.5, F, P, { steps: 28 }), { tone: "mid" }) +
    solidSvg(G.sphereOf(knob, 2.1, P, { steps: 28 }), { tone: "hi", lit: true })
  );
}
const dialNeedle = (id, share) => {
  const [x, y, z] = D.dials[id];
  const a = share * Math.PI * 2;
  return lineOnTop([x - Math.sin(a) * 1.6, y + Math.cos(a) * 1.6], [x + Math.sin(a) * 5.2, y - Math.cos(a) * 5.2], z + 0.15, P);
};
function capsuleSvg(cap) {
  const points = D.paths[cap.path];
  const nose = Math.min(cap.len, (model.t - cap.born) * speed());
  const a = Math.max(0, nose - D.capsule.len);
  if (nose - a < 0.6) return "";
  const r = D.capsule.r;
  const pieces = TUBE.tubePieces(G.cut(points, a, nose), r, P, { maxLength: 200, spacing: 0.8 });
  const lit = !cap.spoof;
  let s = pieces.map((p) => TUBE.tubeSvg(p, { tone: lit ? "lit" : "mid" })).join("");
  const ring = (at, on) => {
    if (at < a + 0.6 || at > nose - 0.6) return "";
    const F = G.frameAlong(G.pointAlong(points, at), G.tangentAlong(points, at));
    const arcs = on ? [-0.6, 0, 0.6].map((o) => G.arcOf(F, o, r, P)).join("") : G.arcOf(F, 0, r, P);
    return `<path class="iso-line" data-tone="${on ? (lit ? "lit" : "hi") : "faint"}" d="${arcs}"${on ? ' style="stroke-width:0.8"' : ""}/>`;
  };
  s += ring(nose - 3.2, cap.kind !== "ACK");
  s += ring(nose - D.capsule.len + 3.4, cap.kind !== "SYN");
  return `<g class="hs-capsule"${lit ? " data-lit" : ""}>${s}</g>`;
}

function setDigits(key, value) {
  const els = digitEls[key];
  const text = value === null || value === undefined ? "-".repeat(D.digits) : String(value >>> 0).padStart(D.digits, "0");
  els.forEach((el, i) => write(el, text[i]));
}
function draw(dt) {
  const c = model.client;
  const s = model.server;
  // palancas de estado
  for (const id of ["c", "s"]) {
    const state = id === "c" ? c.state : s.state;
    const target = D.lever.angles[STATES.indexOf(state)];
    const before = ease[id];
    ease[id] = follow(ease[id], target, dt, 0.12);
    if (Math.abs(before - ease[id]) > 1e-4 || !levers[id].firstChild) levers[id].innerHTML = leverSvg(id, ease[id]);
    write(stateEls[id], state);
  }
  // relojes de retransmisión: fracción del RTO consumida
  const share = (start, deadline) => (deadline ? Math.min(1, Math.max(0, (model.t - start) / (deadline - start))) : 0);
  needles.c.setAttribute("d", dialNeedle("c", c.state === "SYN_SENT" ? share(c.started, c.deadline) : 0));
  const se = s.state === "SYN_RECEIVED" ? s.legit : null;
  needles.s.setAttribute("d", dialNeedle("s", se ? share(se.started, se.deadline) : 0));
  // contadores de rodillos
  const cSeq = c.state === "CLOSED" ? null : c.state === "ESTABLISHED" ? plus(c.iss, 1) : c.iss;
  const cAck = c.state === "ESTABLISHED" ? plus(c.irs, 1) : null;
  const conn = s.state === "SYN_RECEIVED" ? s.legit : s.state === "ESTABLISHED" ? s.done : null;
  const sSeq = conn ? (s.state === "ESTABLISHED" ? plus(conn.iss, 1) : conn.iss) : null;
  const sAck = conn ? plus(conn.irs, 1) : null;
  setDigits("c-seq", cSeq);
  setDigits("c-ack", cAck);
  setDigits("s-seq", sSeq);
  setDigits("s-ack", sAck);
  // casillero de la cola SYN
  slotEls.forEach((el, i) => {
    const show = i < s.queue.length ? "" : "none";
    if (el.style.display !== show) el.style.display = show;
  });
  // pulsador y desviador
  ease.press = follow(ease.press, model.pressUntil > performance.now() ? 1 : 0, dt, 0.05);
  const F = D.button;
  buttonEl.innerHTML = solidSvg(G.disc(1.4, 3.6 - ease.press * 1.4, 3.6, F, P, { steps: 32, bevel: 0.3 }), { tone: "hi", lit: c.state === "SYN_SENT" });
  const diverting = model.capsules.some((cap) => cap.lost) || model.lose ? 1 : 0;
  ease.divert = follow(ease.divert, diverting, dt, 0.15);
  pointerEl.setAttribute("d", pointerPath(ease.divert));
  // cápsulas
  capsLayer.innerHTML = model.capsules.map(capsuleSvg).join("");
  // lecturas
  write(out["c-state"], c.state);
  write(out["s-state"], s.state);
  write(out["c-seq"], pad(cSeq));
  write(out["c-ack"], pad(cAck));
  write(out["s-seq"], pad(sSeq));
  write(out["s-ack"], pad(sAck));
  write(out["c-rto"], `${num(c.rto)} s${c.state === "SYN_SENT" ? ` · quedan ${num(Math.max(0, c.deadline - model.t), 2)} s` : ""}`);
  write(out["s-queue"], `${s.queue.length} / ${BACKLOG}${model.dropped ? ` · ${model.dropped} SYN descartados` : ""}`);
  write(stepEl, model.step || "Pulsa «Iniciar conexión»: el cliente está en CLOSED y el servidor escucha en LISTEN.");
  write(readout, `cliente ${c.state} · servidor ${s.state} · t = ${num(model.t, 2)} s`);
  if (logDirty) {
    logEl.innerHTML = model.log.map((l) => `<li${l.lost || (l.capsule && l.capsule.lost) ? ' class="hs-lost"' : ""}>${l.text}</li>`).join("");
    logDirty = false;
  }
}
const pointerPath = (turn) => {
  const a = turn * (Math.PI / 2);
  const { x, z } = D.pointer;
  return lineOnTop([x + Math.cos(a) * 0.9, Math.sin(a) * 0.9], [x + Math.cos(a) * 3.6, Math.sin(a) * 3.6], z, P);
};

// ---------------------------------------------------------------- tiempo, recorrido automático y mandos
const speedEl = document.getElementById("hs-speed");
const speedOut = document.getElementById("hs-speed-out");
const rateOf = (v) => 0.03 * Math.pow(1 / 0.03, v / 100); // segundos simulados por segundo real
let rate = rateOf(Number(speedEl.value));
speedEl.addEventListener("input", () => {
  rate = rateOf(Number(speedEl.value));
  speedOut.textContent = "×" + num(rate, 2);
});
speedOut.textContent = "×" + num(rate, 2);

let touched = false;
let tourAt = 1.2;
let doneWait = null;
function tour(real) {
  if (touched || still.matches) return;
  if (model.server.state === "ESTABLISHED") {
    doneWait = doneWait === null ? 4 : doneWait - real;
    if (doneWait <= 0) {
      doneWait = null;
      resetAll();
      tourAt = 1.5;
    }
    return;
  }
  tourAt -= real;
  if (tourAt > 0) return;
  if (model.client.state === "CLOSED" && model.server.state === "LISTEN") {
    press();
    connect();
    tourAt = 1e9;
  }
}

function press() {
  model.pressUntil = performance.now() + 220;
}
function resetAll() {
  const lose = sel.value;
  resetModel();
  model.server.listenAt = 0.25;
  sel.value = lose;
  floodBtn.setAttribute("aria-pressed", "false");
  logDirty = true;
}
const floodBtn = document.querySelector('[data-act="flood"]');
function userConnect() {
  touched = true;
  press();
  connect();
  run();
}
function userFlood() {
  touched = true;
  model.flood = !model.flood;
  model.nextFlood = model.t;
  floodBtn.setAttribute("aria-pressed", String(model.flood));
  floodBtn.textContent = model.flood ? "Parar el flood" : "SYN flood";
  if (model.flood) say(`SYN flood · El atacante inyecta SYN con IP de origen falsas. Cada uno ocupa un hueco de la cola SYN (SYN_RECEIVED) y su SYN-ACK va a una dirección que no existe, así que nadie manda el ACK. Prueba ahora «Iniciar conexión».`);
  else say("Flood detenido. Las conexiones medio abiertas caducan cuando el servidor agota sus reintentos de SYN-ACK (1 + 2 + 4 s) y la cola se vacía.");
  run();
}
function userReset() {
  touched = true;
  resetAll();
  floodBtn.textContent = "SYN flood";
  run();
}
document.querySelector('[data-act="connect"]').addEventListener("click", userConnect);
floodBtn.addEventListener("click", userFlood);
document.querySelector('[data-act="reset"]').addEventListener("click", userReset);
sel.addEventListener("change", () => {
  touched = true;
});
buttonEl.style.cursor = "pointer";
buttonEl.addEventListener("click", userConnect);
stage.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    userConnect();
  } else if (event.key === "f" || event.key === "F") userFlood();
  else if (event.key === "r" || event.key === "R") userReset();
});

let frame = 0;
let last = 0;
let visible = false;
function tick(now) {
  const real = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  const dt = real * rate;
  const n = Math.max(1, Math.ceil(dt / 0.005));
  for (let i = 0; i < n; i++) stepModel(dt / n);
  tour(real);
  draw(real);
  frame = visible ? requestAnimationFrame(tick) : 0;
}
function run() {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

resetModel();
draw(1);
