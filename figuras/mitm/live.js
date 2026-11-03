// Parte viva de la figura MITM. build.mjs sustituye __DATA__ por las medidas y rutas.
const DATA = __DATA__;
const { P, KS, CAPS, routes } = DATA;

const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const q = (sel) => svg.querySelector(sel);
const NS = "http://www.w3.org/2000/svg";
const still = matchMedia("(prefers-reduced-motion: reduce)");
const readout = document.querySelector("[data-readout]");
const reads = Object.fromEntries([...document.querySelectorAll("[data-read]")].map((el) => [el.dataset.read, el]));
const win = Object.fromEntries([...svg.querySelectorAll("[data-win]")].map((el) => [el.dataset.win, el]));
const leverEl = q('[data-part="lever"]');
const gripEl = q('[data-part="grip"]');
const needleEl = q('[data-part="needle"]');
const lamps = { ok: q('[data-part="lampOk"]'), alarm: q('[data-part="lampAlarm"]'), seal: q('[data-part="lampSeal"]') };

// ---------------------------------------------------------------- el mensaje y el cifrado
const MSG = { full: "POST /transferir  importe=50&destino=LUIS", short: "PAGA 50€ A LUIS" };
const MOD = { full: "POST /transferir  importe=900&destino=EVA", short: "PAGA 900€ A EVA" };
const HOST = "banco.ejemplo";
// HTTPS: el texto se mezcla con bytes aleatorios que solo comparten la víctima y el servidor
// (claves acordadas en el saludo TLS); detrás va una etiqueta de 16 bytes que hace de sello.
function encrypt(text) {
  const plain = new TextEncoder().encode(text);
  const key = crypto.getRandomValues(new Uint8Array(plain.length + 16));
  const out = new Uint8Array(plain.length + 16);
  plain.forEach((b, i) => (out[i] = b ^ key[i]));
  out.set(key.subarray(plain.length), plain.length);
  return out;
}
const hex = (bytes, n) => [...bytes.subarray(0, n)].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");

// ---------------------------------------------------------------- la cápsula
const capG = q('[data-part="capsule"]');
const maskG = capG.querySelector("[data-mask]");
const mk = (tag, attrs) => {
  const el = document.createElementNS(NS, tag);
  for (const [a, v] of Object.entries(attrs)) el.setAttribute(a, v);
  maskG.appendChild(el);
  return el;
};
const W = 2 * CAPS.r * KS;
const el = {
  edge: mk("path", { class: "mitm-cap-edge", "stroke-width": (W + 1.2).toFixed(2) }),
  fill: mk("path", { class: "mitm-cap-fill", "stroke-width": W.toFixed(2) }),
  capEdge: mk("path", { class: "mitm-cap-edge", "stroke-width": (W + 1.2).toFixed(2) }),
  capFill: mk("path", { class: "mitm-cap-fill", "stroke-width": W.toFixed(2) }),
  paper: mk("path", { class: "mitm-paper" }),
  joint: mk("path", { class: "mitm-cap-line" }),
  seal: mk("circle", { class: "mitm-seal", r: (0.95 * KS).toFixed(2) }),
  stamp: mk("circle", { class: "mitm-stamp", r: (1.05 * KS).toFixed(2) }),
  bodyShape: mk("path", { class: "mitm-cap-shape" }),
  lidShape: mk("path", { class: "mitm-cap-shape" }),
};
// sobre el banco la cápsula abierta se dibuja como dos mitades: punta redonda fuera, corte plano en la junta
function halfShape(outer, joint) {
  if (!outer) return "";
  const t = [outer[0] - joint[0], outer[1] - joint[1]];
  const len = Math.hypot(t[0], t[1]) || 1;
  const u = [t[0] / len, t[1] / len];
  const n = [-u[1] * CAPS.r * KS, u[0] * CAPS.r * KS];
  const pts = [[joint[0] + n[0], joint[1] + n[1]]];
  for (let i = 0; i <= 12; i++) {
    const a = (Math.PI * i) / 12;
    pts.push([outer[0] + n[0] * Math.cos(a) + u[0] * CAPS.r * KS * Math.sin(a), outer[1] + n[1] * Math.cos(a) + u[1] * CAPS.r * KS * Math.sin(a)]);
  }
  pts.push([joint[0] - n[0], joint[1] - n[1]]);
  return dOf(pts) + "Z";
}
const cap = { where: "none", kind: "data", route: null, s: 0, a: null, b: null, open: 0, sealed: false, fake: false };

const lerp = (a, b, t) => a + (b - a) * t;
const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
// puntos de pantalla de la ruta entre las longitudes de arco s0 y s1
function along(route, s0, s1) {
  const r = routes[route];
  s0 = Math.max(0, s0);
  s1 = Math.min(r.total, s1);
  if (s1 - s0 < 0.05) return null;
  const at = (s) => {
    const f = s / r.step;
    const i = Math.min(r.pts.length - 2, Math.floor(f));
    return lerp2(r.pts[i], r.pts[i + 1], f - i);
  };
  const out = [at(s0)];
  for (let i = Math.ceil(s0 / r.step); i * r.step < s1; i++) if (i * r.step > s0) out.push(r.pts[i]);
  out.push(at(s1));
  return out;
}
// eje de la cápsula como función u (0..L desde la cola) -> punto de pantalla
function axisPoints(u0, u1) {
  if (cap.where === "tube") {
    const base = cap.s - CAPS.l / 2;
    const dir = cap.dir;
    // en el tubo la cola es la parte que va detrás
    const a = dir > 0 ? base + u0 : cap.s + CAPS.l / 2 - u1;
    const b = dir > 0 ? base + u1 : cap.s + CAPS.l / 2 - u0;
    return along(cap.route, a, b);
  }
  const p = (u) => iso([lerp(cap.a[0], cap.b[0], u / CAPS.l), lerp(cap.a[1], cap.b[1], u / CAPS.l), CAPS.z], P);
  return [p(u0), p(u1)];
}
const dOf = (pts) => (pts ? "M" + pts.map(([x, y]) => x.toFixed(2) + " " + y.toFixed(2)).join("L") : "");
function setD(node, pts) {
  const d = dOf(pts);
  if (node.getAttribute("d") !== d) node.setAttribute("d", d);
}
function pointAt(u) {
  const pts = axisPoints(Math.max(0, u - 0.5), Math.min(CAPS.l, u + 0.5));
  if (!pts) return null;
  const a = pts[0];
  const b = pts[pts.length - 1];
  return { p: lerp2(a, b, 0.5), t: [b[0] - a[0], b[1] - a[1]] };
}
function drawCapsule() {
  if (cap.where === "none") {
    capG.style.display = "none";
    return;
  }
  capG.style.display = "";
  const mask = cap.where === "tube" ? "url(#mitm-in-tube)" : "url(#mitm-on-bench)";
  if (maskG.getAttribute("mask") !== mask) maskG.setAttribute("mask", mask);
  for (const node of [el.edge, el.fill, el.capEdge, el.capFill]) node.dataset.kind = cap.kind;
  const JOINT = 10;
  const gap = cap.open * 4;
  const split = cap.kind === "data" && cap.where === "bench" && gap > 0.05;
  el.bodyShape.style.display = split ? "" : "none";
  el.lidShape.style.display = split ? "" : "none";
  if (split) {
    const body = axisPoints(0, JOINT);
    const lid = axisPoints(JOINT + gap, CAPS.l + gap);
    el.bodyShape.setAttribute("d", halfShape(body[0], body[1]));
    el.lidShape.setAttribute("d", halfShape(lid[1], lid[0]));
    for (const node of [el.edge, el.fill, el.capEdge, el.capFill]) setD(node, null);
    setD(el.paper, gap > 0.4 ? axisPoints(JOINT - 0.4, JOINT + gap + 0.4) : null);
  } else if (cap.kind === "data") {
    // cuerpo, tapa (que se separa al abrirla) y el rollo de papel que queda a la vista
    const body = axisPoints(0, JOINT);
    const lid = axisPoints(JOINT + gap, CAPS.l + (cap.where === "bench" ? gap : 0));
    setD(el.edge, body);
    setD(el.fill, body);
    setD(el.capEdge, lid);
    setD(el.capFill, lid);
    setD(el.paper, gap > 0.4 ? axisPoints(JOINT + 0.6, JOINT + gap - 0.6) : null);
  } else {
    const whole = axisPoints(0, CAPS.l);
    setD(el.edge, whole);
    setD(el.fill, whole);
    setD(el.capEdge, null);
    setD(el.capFill, null);
    setD(el.paper, null);
  }
  // junta (línea a través de la cápsula), lacre o sello del certificado
  const j = pointAt(cap.kind === "data" ? JOINT : CAPS.l / 2);
  if (j && gap < 0.4) {
    const len = Math.hypot(j.t[0], j.t[1]) || 1;
    const n = [(-j.t[1] / len) * CAPS.r * KS, (j.t[0] / len) * CAPS.r * KS];
    setD(el.joint, cap.kind === "data" ? [[j.p[0] - n[0], j.p[1] - n[1]], [j.p[0] + n[0], j.p[1] + n[1]]] : null);
    const showSeal = cap.kind === "data" && cap.sealed;
    el.seal.style.display = showSeal ? "" : "none";
    el.stamp.style.display = cap.kind === "cert" ? "" : "none";
    for (const node of [el.seal, el.stamp]) {
      node.setAttribute("cx", j.p[0].toFixed(2));
      node.setAttribute("cy", j.p[1].toFixed(2));
    }
    if (cap.fake) el.stamp.setAttribute("data-fake", "");
    else el.stamp.removeAttribute("data-fake");
  } else {
    setD(el.joint, null);
    el.seal.style.display = "none";
    el.stamp.style.display = "none";
  }
}

// ---------------------------------------------------------------- la secuencia de un envío
const flags = { attacker: true, https: false, modify: false };
const SPEED = 115; // unidades por segundo dentro del tubo
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const say = (key, text, tone) => {
  const node = reads[key];
  if (node.textContent !== text) node.textContent = text;
  if (tone) node.dataset.tone = tone;
  else delete node.dataset.tone;
};
const show = (id, text) => {
  if (win[id] && win[id].textContent !== text) win[id].textContent = text;
};
const lampOn = { ok: 0, alarm: 0, seal: 0 };
let transit = 0;

function buildPlan() {
  const f = { ...flags };
  const steps = [];
  const at = (fn) => steps.push({ dur: 0, start: fn });
  const wait = (dur, fn, tick) => steps.push({ dur, start: fn, at: tick });
  const hide = (dur = 0.25) => steps.push({ dur, start: () => (cap.where = "none") });
  const tube = (route, dir) =>
    steps.push({
      dur: (routes[route].total + CAPS.l) / SPEED,
      start: () => Object.assign(cap, { where: "tube", route, dir }),
      at: (u) => {
        const t = ease(u);
        const total = routes[route].total;
        cap.s = dir > 0 ? lerp(-CAPS.l / 2, total + CAPS.l / 2, t) : lerp(total + CAPS.l / 2, -CAPS.l / 2, t);
      },
    });
  const slide = (from, to, dur) =>
    steps.push({
      dur,
      start: () => (cap.where = "bench"),
      at: (u) => {
        const t = ease(u);
        const c = [lerp(from[0], to[0], t), lerp(from[1], to[1], t)];
        cap.a = [c[0], c[1] - CAPS.l / 2];
        cap.b = [c[0], c[1] + CAPS.l / 2];
      },
    });
  const [inX, outX] = CAPS.lanes;
  // por el banco: cae en el receptor, sale a la bandeja, se lee, cruza y entra en el emisor
  const viaBench = (onRead) => {
    hide(0.2);
    tube("branch.out", 1);
    hide(0.15);
    slide([inX, CAPS.laneY - 2], [inX, CAPS.trayY], 0.7);
    onRead();
    slide([inX, CAPS.trayY], [outX, CAPS.trayY], 0.8);
    slide([outX, CAPS.trayY], [outX, CAPS.laneY - 2], 0.7);
    hide(0.15);
    tube("branch.back", -1);
    hide(0.2);
  };

  at(() => {
    Object.assign(cap, { where: "none", open: 0, sealed: false, fake: false, kind: "data" });
    Object.assign(lampOn, { ok: 0, alarm: 0, seal: 0 });
    show("a1", MSG.short);
    show("a2", f.https ? "HTTPS · CONECTANDO" : "HTTP · SIN CIFRAR");
    show("x1", f.attacker ? "ESPERANDO…" : "");
    show("x2", f.attacker ? "" : "");
    show("b1", "—");
    show("b2", "");
    say("sent", "…");
    say("seen", f.attacker ? "…" : "nada: no está en el camino");
    say("got", "…");
    say("step", "La víctima escribe una orden de pago en su navegador.");
  });
  wait(1.1);

  let cert = null;
  if (f.https) {
    at(() => {
      Object.assign(cap, { kind: "cert", fake: false });
      say("step", `Saludo TLS: el servidor manda su certificado (firmado por una autoridad) para que la víctima compruebe que habla con ${HOST}.`);
    });
    tube("line.right", -1);
    if (f.attacker) {
      viaBench(() => {
        wait(1.6, () => {
          show("x1", `CERT: ${HOST.toUpperCase()}`);
          show("x2", f.modify ? "LO CAMBIA POR UNO SUYO" : "LO REENVÍA TAL CUAL");
          say("step", f.modify ? "Para poder abrir lo que venga después, el atacante cambia el certificado por uno suyo: suplanta al servidor." : "El atacante ve el certificado (es público) pero no puede falsificar la firma: lo reenvía tal cual.");
        }, (u) => {
          if (f.modify && u > 0.55) cap.fake = true;
        });
      });
    } else hide();
    tube("line.left", -1);
    if (f.attacker && f.modify) {
      at(() => {
        cap.where = "none";
        lampOn.alarm = 1;
        show("a1", "ENVÍO CANCELADO");
        show("a2", "¡CERT. NO VÁLIDO!");
        show("x1", "SOLO VIO EL SALUDO");
        show("x2", "NO HAY MENSAJE");
        show("b1", "—");
        show("b2", "NADA RECIBIDO");
        say("sent", "nada: el navegador avisó de que el certificado no es válido y canceló", "alert");
        say("seen", "solo el saludo TLS; su certificado falso fue rechazado");
        say("got", "nada");
        say("step", `Aviso: el certificado no está firmado por una autoridad de confianza para ${HOST}. La comprobación falla y la víctima no envía el mensaje.`);
      });
      wait(4.2);
      return steps;
    }
    at(() => {
      cap.where = "none";
      lampOn.ok = 1;
      show("a2", "HTTPS · CERT OK");
      say("step", `Certificado válido para ${HOST}: la víctima acuerda claves con el servidor y cifra el mensaje.`);
    });
    wait(0.9);
  }

  at(() => {
    cert = f.https ? encrypt(MSG.full) : null;
    Object.assign(cap, { kind: "data", sealed: f.https, fake: false, open: 0 });
    say("sent", MSG.full + (f.https ? "  (cifrado con TLS)" : ""));
    say("step", f.https ? "La cápsula sale cerrada y lacrada: el contenido va cifrado y la etiqueta de 16 bytes hace de sello." : "La cápsula sale sin cerrar: con HTTP el mensaje viaja en texto claro.");
  });
  tube("line.left", 1);
  let sent = MSG;
  if (f.attacker) {
    if (f.https) {
      viaBench(() =>
        wait(1.8, () => {
          show("x1", hex(cert, 8) + "…");
          show("x2", "LACRADA: NO PUEDE ABRIR");
          say("seen", `solo bytes cifrados hacia ${HOST}:443 (${cert.length} bytes): ${hex(cert, 12)} …`);
          say("step", "En el banco la cápsula no se puede abrir sin romper el lacre: el atacante solo ve bytes cifrados, su tamaño y a qué servidor van. La reenvía intacta.");
        }),
      );
    } else {
      sent = f.modify ? MOD : MSG;
      viaBench(() => {
        wait(0.8, () => say("step", "La válvula ha mandado la cápsula al banco del atacante. Se abre sin romper nada…"), (u) => (cap.open = ease(u)));
        wait(1.3, () => {
          show("x1", MSG.short);
          show("x2", "LO LEE EN CLARO");
          say("seen", MSG.full);
          say("step", "…y el atacante lee el mensaje entero, en texto claro.");
        });
        if (f.modify)
          wait(1.4, () => {
            show("x1", MOD.short);
            show("x2", "→ LO HA CAMBIADO");
            say("seen", `${MSG.full}  → lo cambia a: ${MOD.full}`, "alert");
            say("step", "El atacante cambia el importe y el destinatario. Con HTTP no hay sello que lo delate.");
          });
        wait(0.7, null, (u) => (cap.open = 1 - ease(u)));
      });
    }
  } else hide();
  tube("line.right", 1);
  at(() => {
    cap.where = "none";
    show("b1", sent.short);
    show("b2", f.https ? "SELLO INTACTO" : "SIN COMPROBAR");
    lampOn.seal = f.https ? 1 : 0;
    say("got", sent.full + (sent === MOD ? "  (y no tiene forma de saber que lo alteraron)" : ""), sent === MOD ? "alert" : undefined);
    say(
      "step",
      f.https
        ? "El servidor comprueba el sello, descifra y recibe exactamente lo que envió la víctima."
        : sent === MOD
          ? "El servidor recibe la orden alterada y la ejecuta: para él es una petición normal."
          : f.attacker
            ? "El servidor recibe el mensaje intacto… pero el atacante ya lo ha leído."
            : "Sin nadie en medio, la cápsula va directa y el servidor recibe el mensaje.",
    );
  });
  wait(3.6);
  return steps;
}

// ---------------------------------------------------------------- reloj
let plan = [];
let index = 0;
let clock = 0;
let lever = 0;
let pressure = 0;
const glow = { ok: 0, alarm: 0, seal: 0 };
function begin(i) {
  index = i;
  clock = 0;
  const s = plan[index];
  if (s && s.start) s.start();
  if (s && s.at) s.at(0);
}
function restart() {
  plan = buildPlan();
  begin(0);
  if (still.matches) fastForward();
  describe();
}
function fastForward() {
  // movimiento reducido: el envío se resuelve entero y se muestra el estado final
  while (index < plan.length - 1) {
    const s = plan[index];
    if (s.at) s.at(1);
    begin(index + 1);
  }
  cap.where = "none";
  Object.assign(glow, lampOn);
}
function advance(dt) {
  while (dt > 0 && plan.length) {
    const s = plan[index];
    const left = s.dur - clock;
    if (dt < left) {
      clock += dt;
      if (s.at) s.at(clock / s.dur);
      return;
    }
    dt -= Math.max(0, left);
    if (s.at) s.at(1);
    if (index + 1 >= plan.length) {
      plan = buildPlan();
      begin(0);
    } else begin(index + 1);
  }
}

const leverPath = (a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pathOf([iso([DATA.HUB[0] + c * 3, DATA.HUB[1] + s * 3, DATA.LEVER_Z], P), iso([DATA.HUB[0] + c * 13, DATA.HUB[1] + s * 13, DATA.LEVER_Z], P)]);
};
const needlePath = (share) => {
  const g = DATA.GAUGE;
  const a = Math.PI * 1.25 - share * Math.PI * 1.5;
  return pathOf([iso([g[0], g[1] + 1.2, g[2]], P), iso([g[0] + Math.cos(a) * 4.6, g[1] + 1.2, g[2] + Math.sin(a) * 4.6], P)]);
};
function draw() {
  leverEl.setAttribute("d", leverPath(lever));
  const tip = iso([DATA.HUB[0] + Math.cos(lever) * 13, DATA.HUB[1] + Math.sin(lever) * 13, DATA.LEVER_Z], P);
  gripEl.setAttribute("cx", tip[0].toFixed(2));
  gripEl.setAttribute("cy", tip[1].toFixed(2));
  needleEl.setAttribute("d", needlePath(0.12 + pressure * 0.7));
  for (const key of Object.keys(lamps)) lamps[key].setAttribute("opacity", glow[key].toFixed(2));
  drawCapsule();
}
function settle(dt) {
  const calm = still.matches;
  const target = flags.attacker ? Math.PI / 2 : 0;
  lever = calm ? target : target + (lever - target) * Math.exp(-dt / 0.18);
  transit = cap.where === "tube" ? 1 : 0;
  pressure = calm ? 0 : transit + (pressure - transit) * Math.exp(-dt / 0.35);
  for (const key of Object.keys(glow)) glow[key] = calm ? lampOn[key] : lampOn[key] + (glow[key] - lampOn[key]) * Math.exp(-dt / 0.15);
}

let frame = 0;
let last = 0;
let visible = false;
let paused = false;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  if (!paused && !still.matches) advance(dt);
  settle(dt);
  draw();
  frame = visible && !paused && !still.matches ? requestAnimationFrame(tick) : 0;
}
const run = () => {
  if (!frame && visible && !paused) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

// ---------------------------------------------------------------- controles
function describe() {
  const text = `${flags.https ? "HTTPS" : "HTTP"} · ${flags.attacker ? "atacante en medio" : "sin atacante"}${flags.attacker && flags.modify ? " · intenta modificar" : ""}${paused ? " · en pausa" : ""}`;
  readout.textContent = text;
  stage.setAttribute("aria-description", text);
}
function setFlag(id, value) {
  flags[id] = value;
  document.querySelectorAll(`[data-toggle="${id}"]`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === String(value))));
  restart();
  settle(1 / 60);
  draw();
  run();
}
document.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => setFlag(b.dataset.toggle, b.dataset.value === "true")));
const pauseBtn = document.querySelector('[data-act="pause"]');
function togglePause() {
  paused = !paused;
  pauseBtn.textContent = paused ? "Seguir" : "Pausa";
  describe();
  run();
}
pauseBtn.addEventListener("click", togglePause);
document.querySelector('[data-act="again"]').addEventListener("click", () => {
  restart();
  settle(1 / 60);
  draw();
  run();
});
stage.addEventListener("keydown", (event) => {
  const map = { Digit1: "attacker", Digit2: "https", Digit3: "modify", Numpad1: "attacker", Numpad2: "https", Numpad3: "modify" };
  if (event.code === "Space" || event.key === "Enter") {
    event.preventDefault();
    togglePause();
  } else if (map[event.code]) {
    event.preventDefault();
    setFlag(map[event.code], !flags[map[event.code]]);
  }
});
still.addEventListener("change", () => {
  restart();
  settle(1);
  draw();
  run();
});
restart();
settle(1);
draw();
