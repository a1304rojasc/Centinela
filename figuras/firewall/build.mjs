// Figura: un firewall (cadena INPUT de iptables) hecho máquina clasificadora de fichas.
// Genera firewall.html (oscuro) o firewall-light.html (con --light).
//   node build.mjs
//   node build.mjs --light
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const kitScript = () => readFileSync(join(HERE, "kit", "iso-kit.mjs"), "utf8").replace(/^export /gm, "");

const WIDTH = 600;
const HEIGHT = 400;
const AZ = 58;
const EL = 36;

// ---------------------------------------------------------------- modelo: reglas y codificación
// La cadena INPUT por defecto. Las posiciones cambian al reordenar; los cartuchos (id) no.
const RULES = [
  { id: 0, src: "192.168.1.10", proto: "tcp", dport: 22, target: "ACCEPT", note: "SSH solo desde la IP del admin" },
  { id: 1, src: "198.51.100.66", target: "DROP", note: "lista negra: la IP atacante" },
  { id: 2, proto: "tcp", dport: 443, target: "ACCEPT", note: "web HTTPS" },
  { id: 3, proto: "tcp", dport: 80, target: "ACCEPT", note: "web HTTP" },
  { id: 4, proto: "tcp", dport: 22, target: "DROP", note: "SSH desde cualquier otra IP" },
];
const ADMIN = "192.168.1.10";
const ATTACKER = "198.51.100.66";
const CLIENTS = ["203.0.113.5", "203.0.113.23", "203.0.113.42", "203.0.113.77", "203.0.113.101", "203.0.113.150", "192.0.2.200"];
const SCAN = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 3306, 3389, 8080];

// Código de peso constante: cada valor perfora exactamente w de n posiciones, así que
// "todos los palpadores caen en agujeros" equivale a "el valor es igual".
function combos(n, w) {
  const out = [];
  const walk = (start, picked) => {
    if (picked.length === w) return out.push(picked);
    for (let i = start; i < n; i++) walk(i + 1, [...picked, i]);
  };
  walk(0, []);
  return out;
}
const IP_CODES = combos(5, 2); // 10 códigos
const PORT_CODES = combos(6, 3); // 20 códigos
const IPS = [ADMIN, ...CLIENTS, ATTACKER];
const PORTS = [...new Set([...SCAN, 22, 80, 443, 53])].sort((a, b) => a - b);
const CODE = {
  ip: Object.fromEntries(IPS.map((ip, i) => [ip, IP_CODES[i === IPS.length - 1 ? 9 : i]])),
  port: Object.fromEntries(PORTS.map((p, i) => [p, PORT_CODES[i]])),
  proto: { tcp: [0], udp: [1] },
};

// ---------------------------------------------------------------- medidas del mundo
const PITCH = 34; // paso de la cinta indexada = distancia entre estaciones
const STATIONS = 6; // 5 reglas + compuerta de la política
const BELT_Z = 24; // cara superior de la cinta
const TOK = { w: 12, d: 10, h: 2.5 };
const POCKET_Z = 9; // suelo de los bolsillos delanteros
const POCKET_ZB = 16; // los traseros van más altos para verse por encima de la cinta
const PILE_MAX = 3;
const HEAD_Z = 46; // cara inferior de las vigas del cabezal (= cara superior de los raíles)
const BEAM_TOP = 50;
const PAD_REST = 7.5; // reposo del empujador a cada lado de la cinta
const PAD_END = 6; // fin de carrera
const LIFT_SWAP = 24;
const LIFT_OFF = 7;
const PLUNGE_HIT = 3.5; // con todos los palpadores en agujeros: el bloque apoya en la ficha
const PLUNGE_MISS = 2.5; // algún palpador apoya en material: se queda 1 más alto

// columnas de código en la cara de la ficha (x) y posiciones a lo largo (y)
const COLS = {
  ip: { x: -3.5, ys: [-3.2, -1.6, 0, 1.6, 3.2] },
  port: { x: 0.4, ys: [-3.25, -1.95, -0.65, 0.65, 1.95, 3.25] },
  proto: { x: 3.9, ys: [-1.2, 1.2] },
};

const PLATE = { x: -36, y: -38, w: 280, d: 76, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;
const BED = { x: -16, y: -10, w: 232, d: 20, r: 1 };
const BELT = { x: -18, y: -9, w: 236, d: 18, r: 1.6 };
const MAG = { x: -9, y: -12, w: 18, d: 24, r: 1.2 };
const MAG_BOTTOM = BELT_Z + 3.2;
const MAG_TOP = 70;
const POSTS = [17, 119, 221];

const sx = (s) => s * PITCH; // x de la estación s (0 = salida del cargador)

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [MAG.x, MAG.y, MAG_TOP + 4], [MAG.x + MAG.w, MAG.y + MAG.d, MAG_TOP + 4], [sx(6) - 10, -16, BEAM_TOP + 14], [sx(1) - 10, -16, BEAM_TOP + 14]],
  WIDTH,
  HEIGHT,
  { pad: 22, azimuth: AZ, elevation: EL },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const slab = (plan, z, h, steps = 3, bevel = 0) => k.slabOf(plan, z, h, P, steps, bevel);
const box = (x0, y0, x1, y1) => ({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: 0.3 });
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const halo = (plan, z) => `<path class="iso-halo" d="${k.haloOf(k.insetPlan(plan, -2), z, 0.1, P)}" style="filter:blur(3px)"/>`;
// contorno cerrado en una cara vertical +y (ranuras, ventanas)
const slotY = (y, x0, x1, z0, z1) => k.pathOf([at([x0, y, z0]), at([x1, y, z0]), at([x1, y, z1]), at([x0, y, z1])], true);
const slotX = (x, y0, y1, z0, z1) => k.pathOf([at([x, y0, z0]), at([x, y1, z0]), at([x, y1, z1]), at([x, y0, z1])], true);

// ---------------------------------------------------------------- base
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 20))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(slab(PLATE, -PLATE_H, PLATE_H, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -5, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // regla delantera: una marca grande por estación
  const strip = { x: 13, y: 30.5, w: 212, d: 4.5, r: 1 };
  out.push(S(slab(strip, 0, 0.6), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 8.5, 4, strip.y, 0.6, [1.6, 3], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.4, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.4, 0.6])], { size: 0.45 }));
  // placa de características (las rayas representan texto impreso)
  const label = { x: 226, y: -14, w: 12, d: 28, r: 1.2 };
  out.push(S(slab(label, 0, 0.8, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.4), 0.8, P, 4), { tone: "faint" }));
  out.push(L([k.lineOnTop([label.x + 4, label.y + 4], [label.x + 4, label.y + 22], 0.8, P), k.lineOnTop([label.x + 6.2, label.y + 4], [label.x + 6.2, label.y + 17], 0.8, P), k.lineOnTop([label.x + 8.4, label.y + 4], [label.x + 8.4, label.y + 13], 0.8, P)].join(""), { tone: "lo", free: true }));
  out.push(D([at([label.x + 6, label.y + 2.2, 0.8]), at([label.x + 6, label.y + label.d - 2.2, 0.8])], { size: 0.45 }));
  return out.join("");
}

// ---------------------------------------------------------------- bolsillos (bandeja trasera = DROP, delantera = ACCEPT)
const POCKET_X = (s) => sx(s); // centro de bolsillo bajo cada estación
function trough(side) {
  // side +1 delante (ACCEPT), -1 detrás (DROP); devuelve trozos para intercalar las pilas
  const y0 = side > 0 ? 15 : -29;
  const y1 = side > 0 ? 29 : -15;
  const inner = side > 0 ? box(17, 15, 221, 16.2) : box(17, -16.2, 221, -15);
  const outer = side > 0 ? box(17, 27.8, 221, 29) : box(17, -29, 221, -27.8);
  const floor = { x: 17, y: y0, w: 204, d: y1 - y0, r: 0.8 };
  const far = side > 0 ? inner : outer;
  const near = side > 0 ? outer : inner;
  const pz = side > 0 ? POCKET_Z : POCKET_ZB;
  const start = [halo(floor, 0), S(slab(floor, 0, pz, 3, 0.5), { tone: "mid", inner: L(k.sideSeam(floor, pz / 2, P, 3), { tone: "faint" }) })];
  start.push(S(slab(far, pz, 5, 2, 0.2), { tone: "mid" }));
  const walls = [];
  for (let j = 0; j <= STATIONS; j++) {
    const px = 17 + j * PITCH;
    const plan = box(px - 0.6, y0 + 1.2, px + 0.6, y1 - 1.2);
    walls.push(S(slab(plan, pz, 5, 2, 0.2), { tone: "mid" }));
  }
  const end = [S(slab(near, pz, 5, 2, 0.2), { tone: "mid" })];
  // remaches en la cara frontal del muro cercano y en el suelo de cada bolsillo
  const ny = side > 0 ? 29 : -15;
  end.push(D(Array.from({ length: STATIONS }, (_, i) => at([POCKET_X(i + 1), ny, pz + 2.5])), { size: 0.45 }));
  return { start: start.join(""), walls, end: end.join("") };
}

// ---------------------------------------------------------------- pórtico: postes y raíles
function posts(side) {
  const y = side > 0 ? 11 : -15;
  const out = [];
  for (const x of POSTS) {
    out.push(S(slab({ x: x - 2, y: y - 0.6, w: 4, d: 5.2, r: 0.6 }, 0, 1.4, 2, 0.3), { tone: "lo" }));
    out.push(S(slab({ x: x - 1.6, y, w: 3.2, d: 4, r: 0.5 }, 1.4, HEAD_Z - 6 - 1.4, 2, 0.3), { tone: "mid" }));
  }
  return out.join("");
}
function rail(side) {
  const y = side > 0 ? 11 : -15;
  const plan = { x: 13, y: y - 1.5, w: 212, d: 5.5, r: 0.8 };
  const out = [S(slab(plan, HEAD_Z - 6, 6, 3, 0.4), { tone: "mid", inner: L(k.sideSeam(plan, HEAD_Z - 3, P, 3), { tone: "faint" }) })];
  out.push(D(POSTS.map((x) => at([x, y + 2, HEAD_Z])), { size: 0.45 }));
  // topes en los extremos
  for (const x of [13, 223]) out.push(S(slab({ x, y: y - 1.5, w: 2, d: 5.5, r: 0.4 }, HEAD_Z, 2.4, 2, 0.2), { tone: "mid" }));
  return out.join("");
}

// ---------------------------------------------------------------- cinta
function bedBack() {
  // pata trasera del cargador (queda detrás de la bancada)
  return S(slab(box(MAG.x, -12, MAG.x + MAG.w, -10.5), 0, MAG_BOTTOM, 2, 0.3), { tone: "mid" });
}
function bed() {
  const out = [];
  for (const x of [-10, 100, 204]) {
    out.push(halo({ x, y: -9, w: 8, d: 18, r: 1 }, 0));
    out.push(S(slab({ x, y: -9, w: 8, d: 18, r: 1 }, 0, 10, 3, 0.4), { tone: "lo" }));
  }
  out.push(S(slab(BED, 10, 12, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(BED, 15, P, 3), { tone: "faint" }) }));
  // tornillería a lo largo de la cara delantera
  out.push(D(Array.from({ length: 14 }, (_, i) => at([-6 + i * 17, 10, 18.5])), { size: 0.4 }));
  out.push(S(slab(BELT, 22, 2, 4, 0.3), { tone: "lo" }));
  // tambores: tapas de rodamiento en la cara delantera
  for (const x of [-12, 212]) {
    out.push(L(k.sideRing([x, 10, 17], 3.2, "y", P, 28), { tone: "lo" }));
    out.push(L(k.sideRing([x, 10, 17], 1.4, "y", P, 18), { tone: "mid" }));
    out.push(D([at([x, 10, 17])], { size: 0.5 }));
  }
  return out.join("");
}
const BELT_STEP = PITCH / 4;
const beltLines = (offset) => {
  const out = [];
  for (let x = BELT.x + 2 + (offset % BELT_STEP); x < BELT.x + BELT.w - 2; x += BELT_STEP) out.push(k.lineOnTop([x, BELT.y + 0.3], [x, BELT.y + BELT.d - 0.3], BELT_Z, P));
  return out.join("");
};

// ---------------------------------------------------------------- cargador (la interfaz de red)
const WIN = { x0: -3, x1: 3, z0: 36, z1: 64 };
function magazine() {
  const out = [];
  out.push(S(slab(box(MAG.x, 10.5, MAG.x + MAG.w, 12), 0, MAG_BOTTOM, 2, 0.3), { tone: "mid" }));
  out.push(S(slab(MAG, MAG_BOTTOM, MAG_TOP - MAG_BOTTOM, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(MAG, MAG_BOTTOM + 5, P, 3), { tone: "faint" }) }));
  out.push(S(slab({ x: MAG.x - 1, y: MAG.y - 1, w: MAG.w + 2, d: MAG.d + 2, r: 1.6 }, MAG_TOP, 3, 3, 0.5), { tone: "mid" }));
  out.push(D(k.corners({ x: MAG.x - 1, y: MAG.y - 1, w: MAG.w + 2, d: MAG.d + 2 }, 2.2).map(([x, y]) => at([x, y, MAG_TOP + 3])), { size: 0.45 }));
  out.push(L(k.planOutline({ x: -7, y: -5.5, w: 14, d: 11, r: 1 }, MAG_TOP + 3, P, 3), { tone: "lo" }));
  // ventana de la cola: hueco oscuro con el canto de las fichas que esperan
  const y = 12;
  out.push(`<path class="iso-shade" data-shade="0" d="${slotY(y, WIN.x0, WIN.x1, WIN.z0, WIN.z1)}"/>`);
  out.push(`<clipPath id="fw-win"><path d="${slotY(y, WIN.x0, WIN.x1, WIN.z0, WIN.z1)}"/></clipPath>`);
  const edges = [];
  for (let i = -1; i < 12; i++) {
    const z0 = WIN.z0 + i * 2.8 + 0.2;
    edges.push(`<path class="iso-fill" d="${slotY(y, -4, 4, z0, z0 + 2.5)}"/>`);
    edges.push(L(slotY(y, -4, 4, z0, z0 + 2.5), { tone: "mid" }));
  }
  out.push(`<g clip-path="url(#fw-win)"><g data-part="queue">${edges.join("")}</g></g>`);
  out.push(L(slotY(y, WIN.x0, WIN.x1, WIN.z0, WIN.z1), { tone: "lo" }));
  out.push(L(slotY(y, WIN.x0 - 1.4, WIN.x1 + 1.4, WIN.z0 - 1.4, WIN.z1 + 1.4), { tone: "faint" }));
  out.push(D([at([WIN.x0 - 3, y, WIN.z0]), at([WIN.x1 + 3, y, WIN.z0]), at([WIN.x0 - 3, y, WIN.z1]), at([WIN.x1 + 3, y, WIN.z1])], { size: 0.45 }));
  // boca de salida en la cara +x
  out.push(L(slotX(MAG.x + MAG.w, -7, 7, MAG_BOTTOM + 0.6, MAG_BOTTOM + 4), { tone: "lo" }));
  // la única etiqueta grabada: la tarjeta de red por la que entra el tráfico
  out.push(k.faceTextSvg(k.sideMatrix([MAG.x + 3.2, y, MAG_TOP - 3], 0, P, "left"), "eth0", { size: 3, tone: "mid" }));
  return out.join("");
}

// ---------------------------------------------------------------- motor de avance con la leva del ciclo
const DIAL = { x: -16, y: 22.5, r: 5.4, top: 36 };
function motor() {
  const out = [];
  const gear = { x: -26, y: 16, w: 20, d: 13, r: 1.2 };
  out.push(halo(gear, 0));
  out.push(S(slab(gear, 0, 20, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(gear, 8, P, 3), { tone: "faint" }) }));
  out.push(D(k.corners(gear, 2).map(([x, y]) => at([x, y, 20])), { size: 0.45 }));
  // eje al tambor
  out.push(S(slab(box(-13.4, 10, -10.6, 16), 15.6, 2.8, 2, 0.2), { tone: "mid" }));
  out.push(S(slab(box(-14.6, 12, -9.4, 14), 14.4, 5.2, 2, 0.3), { tone: "mid" }));
  // motor con aletas
  out.push(S(k.cylinder(DIAL.x, DIAL.y, 6.4, 20, 1.6, P, 40), { tone: "mid" }));
  out.push(S(k.cylinder(DIAL.x, DIAL.y, 5.6, 21.6, 10, P, 40), { tone: "mid" }));
  out.push(L(k.knurl(DIAL.x, DIAL.y, 5.6, 21.6, 31.6, 30, P, 0.3), { tone: "lo" }));
  // esfera de la leva
  out.push(S(k.cylinder(DIAL.x, DIAL.y, DIAL.r + 0.6, 31.6, DIAL.top - 31.6, P, 48, 0.4), { tone: "hi", crease: "lo" }));
  out.push(L(k.ring(DIAL.x, DIAL.y, DIAL.r - 0.6, DIAL.top, P, 48), { tone: "lo" }));
  const t = k.radialTicks(DIAL.x, DIAL.y, DIAL.r - 0.8, 20, 5, DIAL.top, [0.7, 1.5], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(L(k.ring(DIAL.x, DIAL.y, 0.8, DIAL.top, P, 14), { tone: "mid" }));
  return out.join("");
}
const dialNeedle = (share) => {
  const a = share * Math.PI * 2;
  return k.lineOnTop([DIAL.x - Math.sin(a) * 0.8, DIAL.y + Math.cos(a) * 0.8], [DIAL.x + Math.sin(a) * 4.2, DIAL.y - Math.cos(a) * 4.2], DIAL.top + 0.1, P);
};

// ---------------------------------------------------------------- ficha-paquete (construida en el origen)
const TOKEN_PLAN = { x: -TOK.w / 2, y: -TOK.d / 2, w: TOK.w, d: TOK.d, r: 1 };
function holeSvg(x, y) {
  const d = k.ring(x, y, 0.42, TOK.h, P, 12);
  return `<path class="iso-shade" data-shade="0" d="${d}"/>` + L(d, { tone: "lo" });
}
function tokenSvg() {
  const out = [S(slab(TOKEN_PLAN, 0, TOK.h, 3, 0.3), { tone: "hi", crease: "lo", lit: true })];
  // guía de columnas: tres ranuras finas, cerradas
  for (const [name, col] of Object.entries(COLS)) {
    out.push(`<g data-col="${name}">`);
    col.ys.forEach((y, i) => out.push(`<g data-bit="${i}" style="display:none">${holeSvg(col.x, y)}</g>`));
    out.push(`</g>`);
  }
  return out.join("");
}

// ---------------------------------------------------------------- cabezales de estación (en x de la estación)
function headBack(s) {
  const x = sx(s);
  const out = [];
  out.push(S(slab(box(x - 10, -16, x + 10, -10), HEAD_Z, 4, 2, 0.4), { tone: "mid" }));
  out.push(D([at([x - 7.5, -13, BEAM_TOP]), at([x + 7.5, -13, BEAM_TOP])], { size: 0.45 }));
  // guía del empujador bajo la viga trasera
  out.push(S(slab(box(x - 9.8, -10, x - 8.2, 10), HEAD_Z - 1.5, 1.5, 2, 0.2), { tone: "lo" }));
  out.push(S(slab(box(x - 10, -10, x - 6, 10), HEAD_Z, 4, 2, 0.3), { tone: "mid" }));
  return out.join("");
}
const LAMP = (s) => [sx(s) + 8, 7.9];
function headFront(s) {
  const x = sx(s);
  const out = [S(slab(box(x + 6, -10, x + 10, 10), HEAD_Z, 4, 2, 0.3), { tone: "mid" })];
  // travesaño que cierra el voladizo y piloto de "esta regla decidió"
  out.push(S(slab(box(x - 10, 10, x + 10, 12), HEAD_Z, 4, 2, 0.3), { tone: "mid" }));
  out.push(D([at([x + 8, -7.5, BEAM_TOP])], { size: 0.45 }));
  const [lx, ly] = LAMP(s);
  out.push(S(k.cylinder(lx, ly, 1.9, BEAM_TOP, 1.2, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(lx, ly, 1.3, BEAM_TOP + 1.2, 1.6, P, 24), { tone: "hi", crease: "lo" }));
  return out.join("");
}
const lampLit = (s) => {
  const [lx, ly] = LAMP(s);
  return S(k.cylinder(lx, ly, 1.3, BEAM_TOP + 1.2, 1.6, P, 24), { tone: "hi", lit: true }) + D([at([lx, ly, BEAM_TOP + 2.8])], { size: 0.8, tone: "hi" });
};

// ---------------------------------------------------------------- cartucho-regla (en el origen, asentado)
const PIN_Z = 29; // punta de los palpadores en reposo
function pinsOf(rule) {
  const pins = [];
  const add = (col, bits) => bits.forEach((b) => pins.push([COLS[col].x, COLS[col].ys[b]]));
  if (rule.src) add("ip", CODE.ip[rule.src]);
  if (rule.dport) add("port", CODE.port[rule.dport]);
  if (rule.proto) add("proto", CODE.proto[rule.proto]);
  return byDepth(pins);
}
function plungerSvg(rule) {
  const out = [];
  for (const [x, y] of pinsOf(rule)) out.push(S(k.cylinder(x, y, 0.38, PIN_Z, 0.6, P, 10), { tone: "hi", crease: "none" }));
  const block = { x: -5.5, y: -4.5, w: 11, d: 9, r: 0.8 };
  out.push(S(slab(block, PIN_Z + 0.6, 3, 3, 0.3), { tone: "mid", inner: L(k.sideSeam(block, PIN_Z + 1.6, P, 3), { tone: "faint" }) }));
  out.push(S(slab({ x: -1.2, y: -1.2, w: 2.4, d: 2.4, r: 0.6 }, PIN_Z + 3.6, 16, 2, 0.2), { tone: "mid" }));
  return out.join("");
}
function cartLowerSvg() {
  return S(slab({ x: -5, y: -5, w: 10, d: 10, r: 0.8 }, HEAD_Z - 1, BEAM_TOP - HEAD_Z + 1, 3, 0.3), { tone: "hi", crease: "lo" });
}
function cartUpperSvg(rule) {
  const out = [];
  const flange = { x: -9.5, y: -5.5, w: 19, d: 11, r: 1 };
  out.push(S(slab(flange, BEAM_TOP, 1.4, 3, 0.3), { tone: "hi", crease: "lo" }));
  out.push(D([at([-8, -4, BEAM_TOP + 1.4]), at([8, 4, BEAM_TOP + 1.4]), at([-8, 4, BEAM_TOP + 1.4]), at([8, -4, BEAM_TOP + 1.4])], { size: 0.4 }));
  const body = { x: -5, y: -5, w: 10, d: 10, r: 0.8 };
  out.push(S(slab(body, BEAM_TOP + 1.4, 7, 3, 0.4), { tone: "hi", crease: "lo", inner: L(k.sideSeam(body, BEAM_TOP + 5, P, 3), { tone: "faint" }) }));
  // palanca de destino: apunta a la bandeja que recibirá la ficha
  const side = rule.target === "ACCEPT" ? 1 : -1;
  const top = BEAM_TOP + 8.4;
  out.push(S(k.cylinder(0, 0, 3.2, top, 1.2, P, 28), { tone: "mid" }));
  out.push(L(k.knurl(0, 0, 3.2, top, top + 1.2, 24, P, 0.2), { tone: "lo" }));
  const lever = side > 0 ? box(-0.9, 0, 0.9, 6.5) : box(-0.9, -6.5, 0.9, 0);
  out.push(S(slab(lever, top + 1.2, 1.2, 2, 0.2), { tone: "hi", crease: "lo" }));
  out.push(S(k.cylinder(0, side * 6, 1.2, top + 2.4, 1.4, P, 16), { tone: "hi", crease: "lo" }));
  return out.join("");
}
// selector fijo de la estación de política
function policyLower() {
  return S(slab({ x: -5, y: -5, w: 10, d: 10, r: 0.8 }, HEAD_Z - 4, BEAM_TOP - HEAD_Z + 4, 3, 0.3), { tone: "mid" });
}
function policyUpper(side) {
  const out = [];
  const plate = { x: -9.5, y: -5.5, w: 19, d: 11, r: 1.2 };
  out.push(S(slab(plate, BEAM_TOP, 2, 3, 0.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(plate, 1.4), BEAM_TOP + 2, P, 3), { tone: "faint" }));
  out.push(D([at([-8, -4, BEAM_TOP + 2]), at([8, 4, BEAM_TOP + 2]), at([-8, 4, BEAM_TOP + 2]), at([8, -4, BEAM_TOP + 2])], { size: 0.4 }));
  out.push(S(k.cylinder(0, 0, 3.6, BEAM_TOP + 2, 2, P, 28), { tone: "mid" }));
  out.push(L(k.knurl(0, 0, 3.6, BEAM_TOP + 2, BEAM_TOP + 4, 26, P, 0.2), { tone: "lo" }));
  const z = BEAM_TOP + 4;
  for (const sd of [1, -1]) {
    const lever = sd > 0 ? box(-1, 0, 1, 8) : box(-1, -8, 1, 0);
    out.push(`<g data-policy-lever="${sd > 0 ? "ACCEPT" : "DROP"}"${sd === side ? "" : ' style="display:none"'}>${S(slab(lever, z, 1.4, 2, 0.2), { tone: "hi", crease: "lo" })}${S(k.cylinder(0, sd * 7.4, 1.5, z + 1.4, 2.2, P, 18), { tone: "hi", crease: "lo" })}</g>`);
  }
  return out.join("");
}

// ---------------------------------------------------------------- empujador (en el origen, y = 0)
function paddleSvg() {
  const out = [];
  out.push(S(slab({ x: -10.2, y: -1.4, w: 2.8, d: 2.8, r: 0.4 }, HEAD_Z - 3.5, 2, 2, 0.2), { tone: "mid" }));
  out.push(S(slab({ x: -9.6, y: -0.8, w: 1.6, d: 1.6, r: 0.3 }, BELT_Z + 4.6, HEAD_Z - 3.5 - BELT_Z - 4.6, 2, 0.2), { tone: "mid" }));
  const plate = { x: -9.4, y: -0.6, w: 18.4, d: 1.2, r: 0.3 };
  out.push(S(slab(plate, BELT_Z + 0.6, 4, 2, 0.2), { tone: "mid" }));
  return out.join("");
}

// ---------------------------------------------------------------- montaje
const back = trough(-1);
const front = trough(1);
const pocketGroups = (side, t) => {
  const out = [t.start];
  for (let s = 1; s <= STATIONS; s++) out.push(t.walls[s - 1], `<g data-pocket="${side}${s}"></g>`);
  out.push(t.walls[STATIONS], t.end);
  return out.join("");
};

const heads = [];
for (let s = 1; s <= STATIONS; s++) {
  heads.push(headBack(s));
  if (s < STATIONS) heads.push(`<g data-slot="a${s}"></g>`, headFront(s), `<g data-slot="b${s}"></g>`);
  else heads.push(`<g transform="${k.translateAlong(P, [sx(s), 0, 0])}">${policyLower()}</g>`, headFront(s), `<g data-part="policy" transform="${k.translateAlong(P, [sx(s), 0, 0])}">${policyUpper(-1)}</g>`);
}

const TOKENS = 80;
const pool = Array.from({ length: TOKENS }, (_, i) => `<g data-token="${i}" style="display:none">${tokenSvg()}</g>`).join("");
const cartridges = RULES.map((r) => `<g data-cart="${r.id}" data-part="plunger">${plungerSvg(r)}</g><g data-cart="${r.id}" data-part="lower">${cartLowerSvg()}</g><g data-cart="${r.id}" data-part="upper">${cartUpperSvg(r)}</g>`).join("");
const paddles = Array.from({ length: STATIONS }, (_, i) => `<g data-paddle="${i + 1}">${paddleSvg()}</g>`).join("");

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Una clasificadora de fichas que explica cómo filtra paquetes un firewall. Por la izquierda, un cargador rotulado eth0 deja caer fichas sobre una cinta que avanza a saltos. Cada ficha es un paquete y lleva perforadas tres columnas de agujeros: la IP de origen, el puerto de destino y el protocolo. Sobre la cinta hay cinco cabezales en fila, uno por regla; cada uno lleva un cartucho con palpadores que bajan sobre la ficha. Si todos los palpadores caen en agujeros, la regla coincide y un empujador saca la ficha hacia la bandeja delantera (aceptar) o la trasera (descartar), según la palanca del cartucho. La última estación no palpa nada: es la política por defecto y empuja todo lo que llega hasta ella.",
  body: [
    base(),
    `<g data-layer="back">${pocketGroups("d", back)}</g>`,
    posts(-1),
    rail(-1),
    bedBack(),
    bed(),
    `<path data-part="belt" class="iso-line" data-tone="faint" d="${beltLines(0)}"/>`,
    `<g data-layer="pad-back"></g>`,
    `<g data-layer="belt"></g>`,
    `<g data-layer="pad-front">${paddles}</g>`,
    magazine(),
    motor(),
    `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" d="${dialNeedle(0)}" style="stroke-width:1"/>`,
    heads.join(""),
    Array.from({ length: STATIONS }, (_, i) => `<g data-lamp="${i + 1}" opacity="0">${lampLit(i + 1)}</g>`).join(""),
    `<g data-layer="front">${pocketGroups("a", front)}</g>`,
    `<g data-layer="air"></g>`,
    `<g data-part="pool" style="display:none">${pool}${cartridges}</g>`,
  ],
});

// ---------------------------------------------------------------- panel de control
const fmtRule = (r) => ["-A INPUT", r.src ? `-s ${r.src}` : "", r.proto ? `-p ${r.proto}` : "", r.dport ? `--dport ${r.dport}` : "", `-j ${r.target}`].filter(Boolean).join(" ");
const panel = `
<div class="fw-panel">
  <div class="fw-chain" role="table" aria-label="Cadena INPUT, en orden de evaluación">
    <div class="fw-row fw-head" role="row"><span role="columnheader">n.º</span><span role="columnheader">activa</span><span role="columnheader">regla (iptables)</span><span role="columnheader">paquetes</span><span role="columnheader">orden</span></div>
    <div data-rows></div>
    <div class="fw-row fw-policy" role="row"><span role="cell">—</span><span role="cell"></span><span role="cell"><code>-P INPUT</code>
      <span class="fw-seg" role="radiogroup" aria-label="Política por defecto"><button type="button" data-policy="ACCEPT" aria-pressed="false">ACCEPT</button><button type="button" data-policy="DROP" aria-pressed="true">DROP</button></span>
      <span class="fw-note">política por defecto: lo que no coincide con ninguna regla</span></span><span role="cell" class="fw-pk" data-pk="policy">0</span><span role="cell"></span></div>
  </div>
  <div class="fw-controls">
    <label class="fw-control" for="fw-speed"><span class="fw-control-head">Velocidad de la cinta<output id="fw-speed-out">0,8 paquetes/s</output></span>
      <input id="fw-speed" type="range" min="0.3" max="2.5" step="0.1" value="0.8"></label>
    <div class="fw-actions"><button type="button" data-act="pause">Pausa</button><button type="button" data-act="step">Un paquete</button><button type="button" data-act="reset">Reiniciar</button></div>
  </div>
  <div class="fw-counters" aria-live="off">
    <div class="fw-counter"><span class="fw-num" data-count="acc">0</span><span class="fw-what">aceptados</span></div>
    <div class="fw-counter"><span class="fw-num" data-count="drop">0</span><span class="fw-what">descartados</span></div>
    <div class="fw-counter fw-wide"><span class="fw-num fw-small" data-count="last">—</span><span class="fw-what">decidió el último paquete</span></div>
  </div>
  <ol class="fw-log" data-log aria-label="Últimas decisiones"></ol>
</div>`;

const CSS = `
.fw-panel{margin-top:22px;display:grid;gap:18px;font-size:13px;color:var(--anatomy-text)}
.fw-chain{display:grid;gap:1px;background:var(--anatomy-faint);box-shadow:0 0 0 1px var(--anatomy-faint)}
.fw-row{display:grid;grid-template-columns:34px 52px 1fr 64px 52px;align-items:center;gap:8px;padding:8px 10px;background:var(--anatomy-card)}
.fw-head{font-size:11px;color:var(--anatomy-muted);padding-top:6px;padding-bottom:6px}
.fw-row code{font:12px/1.45 var(--anatomy-mono);color:var(--anatomy-strong);word-break:break-word}
.fw-row[data-off] code{color:var(--anatomy-muted);text-decoration:line-through;text-decoration-color:var(--anatomy-mid)}
.fw-row[data-hot]{box-shadow:inset 2px 0 0 0 var(--anatomy-hi)}
.fw-no{font:12px/1 var(--anatomy-mono);color:var(--anatomy-strong)}
.fw-note{display:block;font-size:11.5px;color:var(--anatomy-muted)}
.fw-pk{font:500 14px/1 var(--anatomy-mono);color:var(--anatomy-strong);font-variant-numeric:tabular-nums;text-align:right}
.fw-row input[type=checkbox]{width:16px;height:16px;accent-color:var(--anatomy-hi);margin:0}
.fw-panel button{font:12px/1 var(--anatomy-mono);padding:8px 12px;border:0;border-radius:0;background:var(--anatomy-card);color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-mid);cursor:pointer}
.fw-panel button:hover:not(:disabled){box-shadow:0 0 0 1px var(--anatomy-hi)}
.fw-panel button:disabled{color:var(--anatomy-muted);box-shadow:0 0 0 1px var(--anatomy-faint);cursor:default}
.fw-up{padding:6px 10px!important}
.fw-seg{display:inline-flex;gap:0;margin:2px 0 4px 8px;vertical-align:middle}
.fw-seg button{padding:5px 9px}
.fw-seg button[aria-pressed="true"]{background:var(--anatomy-strong);color:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-strong)}
.fw-controls{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:end}
.fw-control{display:grid;gap:6px}
.fw-control-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;color:var(--anatomy-strong)}
.fw-control-head output{margin-left:auto;font-family:var(--anatomy-mono);font-size:11.5px;color:var(--anatomy-text);font-variant-numeric:tabular-nums}
.fw-control input{width:100%;accent-color:var(--anatomy-hi)}
.fw-actions{display:flex;gap:8px;flex-wrap:wrap}
.fw-counters{display:grid;grid-template-columns:1fr 1fr 2.4fr;gap:1px;background:var(--anatomy-faint);box-shadow:0 0 0 1px var(--anatomy-faint)}
.fw-counter{display:grid;gap:2px;padding:10px 12px;background:var(--anatomy-card);align-content:start}
.fw-num{font:500 20px/1.1 var(--anatomy-mono);color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
.fw-num.fw-small{font-size:12.5px;line-height:1.45;font-weight:400}
.fw-what{font-size:11.5px;color:var(--anatomy-muted)}
.fw-log{list-style:none;margin:0;padding:0;display:grid;gap:3px;font:11.5px/1.5 var(--anatomy-mono);color:var(--anatomy-text);min-height:calc(6 * 17.25px)}
.fw-log li{display:grid;grid-template-columns:58px 1fr auto;gap:10px}
.fw-log li:first-child{color:var(--anatomy-strong)}
.fw-log b{font-weight:500}
.fw-panel button:focus-visible,.fw-panel input:focus-visible,.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:4px}
@media (max-width:560px){.iso-stage svg{margin:-2% 0}.iso-plate-corner[data-corner="readout"]{white-space:normal;max-width:56%;text-align:right;line-height:1.5}.iso-plate-corner[data-corner="hint"]{white-space:normal;max-width:38%;line-height:1.5}
.fw-row{grid-template-columns:26px 30px 1fr 40px 44px;gap:6px;padding:8px 8px}.fw-row code{font-size:11px}.fw-head{font-size:10px}
.fw-controls{grid-template-columns:1fr}.fw-counters{grid-template-columns:1fr 1fr}.fw-wide{grid-column:1/-1}.fw-log li{grid-template-columns:48px 1fr;}.fw-log li span:last-child{grid-column:2}}
`;

// ---------------------------------------------------------------- comportamiento en vivo
const live = `
const P = ${JSON.stringify(P)};
const RULES = ${JSON.stringify(RULES)};
const CODE = ${JSON.stringify(CODE)};
const ADMIN = ${JSON.stringify(ADMIN)}, ATTACKER = ${JSON.stringify(ATTACKER)};
const CLIENTS = ${JSON.stringify(CLIENTS)}, SCAN = ${JSON.stringify(SCAN)};
const PITCH = ${PITCH}, STATIONS = ${STATIONS}, BELT_Z = ${BELT_Z}, PZ = (side) => (side > 0 ? ${POCKET_Z} : ${POCKET_ZB}), PILE_MAX = ${PILE_MAX}, TOK_H = ${TOK.h};
const PAD_REST = ${PAD_REST}, PAD_END = ${PAD_END}, LIFT_SWAP = ${LIFT_SWAP}, LIFT_OFF = ${LIFT_OFF};
const PLUNGE_HIT = ${PLUNGE_HIT}, PLUNGE_MISS = ${PLUNGE_MISS}, MAG_BOTTOM = ${MAG_BOTTOM};
const BELT = ${JSON.stringify(BELT)}, BELT_STEP = ${BELT_STEP}, DIAL = ${JSON.stringify(DIAL)};
const beltLines = ${beltLines.toString().replace(/k\./g, "")};
const dialNeedle = ${dialNeedle.toString().replace(/k\./g, "")};
const fmtRule = ${fmtRule.toString()};

const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const q = (sel) => svg.querySelector(sel);
const layer = (name) => q('[data-layer="' + name + '"]');
const pocket = (side, s) => q('[data-pocket="' + (side > 0 ? "a" : "d") + s + '"]');
const slotA = (s) => q('[data-slot="a' + s + '"]');
const slotB = (s) => q('[data-slot="b' + s + '"]');
const beltEl = q('[data-part="belt"]');
const needle = q('[data-part="needle"]');
const queueEl = q('[data-part="queue"]');
const lamps = [null, ...Array.from({ length: STATIONS }, (_, i) => q('[data-lamp="' + (i + 1) + '"]'))];
const paddleEls = [null, ...Array.from({ length: STATIONS }, (_, i) => q('[data-paddle="' + (i + 1) + '"]'))];
const policyLevers = Object.fromEntries([...svg.querySelectorAll("[data-policy-lever]")].map((el) => [el.dataset.policyLever, el]));
const tokenEls = [...svg.querySelectorAll("[data-token]")];
const cartEls = RULES.map((r) => ({ plunger: q('[data-cart="' + r.id + '"][data-part="plunger"]'), lower: q('[data-cart="' + r.id + '"][data-part="lower"]'), upper: q('[data-cart="' + r.id + '"][data-part="upper"]') }));
const readout = document.querySelector("[data-readout]");
const counts = Object.fromEntries([...document.querySelectorAll("[data-count]")].map((el) => [el.dataset.count, el]));
const rowsEl = document.querySelector("[data-rows]");
const logEl = document.querySelector("[data-log]");
const speedEl = document.getElementById("fw-speed");
const speedOut = document.getElementById("fw-speed-out");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const write = (el, text) => { if (el.textContent !== text) el.textContent = text; };
const clamp = (v) => Math.min(1, Math.max(0, v));
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const span = (u, a, b) => inOut(clamp((u - a) / (b - a)));
const move = (el, v) => el.setAttribute("transform", translateAlong(P, v));

// ======================= el modelo: una cadena INPUT de verdad =======================
// chain: ids de cartucho en orden de evaluación. La primera regla activa que coincide decide;
// si ninguna coincide, decide la política por defecto.
const cfg = { chain: RULES.map((r) => r.id), on: RULES.map(() => true), policy: "DROP", rate: 0.8 };
const want = { on: [...cfg.on], policy: cfg.policy, rate: cfg.rate, swaps: [] };
let version = 0; // sube con cada cambio de reglas aplicado
const ruleOf = (id) => RULES[id];
function matches(r, p) {
  return (!r.src || r.src === p.src) && (!r.proto || r.proto === p.proto) && (!r.dport || r.dport === p.dport);
}
// lo mismo que hace la máquina, en una línea: para el registro y la comprobación
function verdict(p, c) {
  for (let i = 0; i < c.chain.length; i++) { const id = c.chain[i]; if (c.on[id] && matches(ruleOf(id), p)) return { pos: i + 1, target: ruleOf(id).target }; }
  return { pos: 0, target: c.policy };
}
let seed = 1304;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
let scanAt = 0, made = 0;
function nextPacket() {
  const r = rnd();
  const client = () => CLIENTS[Math.floor(rnd() * (CLIENTS.length - 1))];
  made++;
  if (r < 0.3) return { n: made, src: ATTACKER, proto: "tcp", dport: SCAN[scanAt++ % SCAN.length] };
  if (r < 0.6) return { n: made, src: client(), proto: "tcp", dport: 443 };
  if (r < 0.74) return { n: made, src: client(), proto: "tcp", dport: 80 };
  if (r < 0.83) return { n: made, src: ADMIN, proto: "tcp", dport: 22 };
  if (r < 0.92) return { n: made, src: CLIENTS[CLIENTS.length - 1], proto: "tcp", dport: 22 };
  return { n: made, src: client(), proto: "udp", dport: 53 };
}
const stats = { acc: 0, drop: 0, perCart: RULES.map(() => 0), policy: 0, log: [], last: null };

// ======================= la máquina =======================
// slots[s] = ficha en la estación s (0 = bajo el cargador). Ciclo: avance, palpado, empuje, retorno.
const slots = new Array(STATIONS + 1).fill(null);
let machine = { mode: "idle", t0: 0, dur: 1, decided: [] };
let running = !still.matches, steps = 0;
let now = 0;

const freeTokens = tokenEls.map((el, i) => i).reverse();
const tokens = new Set();
function makeToken(pkt) {
  const i = freeTokens.pop();
  if (i === undefined) return null;
  const el = tokenEls[i];
  for (const [col, bits] of [["ip", CODE.ip[pkt.src]], ["port", CODE.port[pkt.dport]], ["proto", CODE.proto[pkt.proto]]]) {
    el.querySelectorAll('[data-col="' + col + '"] [data-bit]').forEach((h) => (h.style.display = bits.includes(Number(h.dataset.bit)) ? "" : "none"));
  }
  el.style.display = "";
  el.removeAttribute("opacity");
  const t = { i, el, pkt, x: 0, y: 0, z: MAG_BOTTOM, mode: "belt", v: version };
  layer("belt").prepend(el);
  tokens.add(t);
  return t;
}
function freeToken(t) {
  t.el.style.display = "none";
  q('[data-part="pool"]').appendChild(t.el);
  tokens.delete(t);
  freeTokens.push(t.i);
}
const piles = { a: Array.from({ length: STATIONS + 1 }, () => []), d: Array.from({ length: STATIONS + 1 }, () => []) };

// estado visual de cartuchos y empujadores
const carts = RULES.map((r, id) => ({ id, s: id + 1, x: (id + 1) * PITCH, y: 0, lift: 0, plunge: 0, where: "slot" }));
const sideOf = (s) => (s === STATIONS ? (cfg.policy === "ACCEPT" ? 1 : -1) : ruleOf(cfg.chain[s - 1]).target === "ACCEPT" ? 1 : -1);
const pads = Array.from({ length: STATIONS + 1 }, (_, s) => ({ s, y: s ? -sideOf(s) * PAD_REST : 0, z: 0, layer: "" }));
const glow = new Array(STATIONS + 1).fill(0);

function startCycle() {
  // los cambios de configuración entran al empezar el ciclo, nunca a mitad
  if (want.swaps.length) return startSwap(want.swaps.shift());
  const policyWas = cfg.policy;
  if (policyWas !== want.policy || want.on.some((v, i) => v !== cfg.on[i])) version++;
  cfg.on = [...want.on]; cfg.policy = want.policy; cfg.rate = want.rate;
  if (!running && steps <= 0) { machine = { mode: "idle", t0: now, dur: 0.6, policyFrom: policyWas }; return; }
  steps = Math.max(0, steps - 1);
  for (let s = STATIONS; s >= 1; s--) slots[s] = slots[s - 1];
  slots[0] = null;
  machine = { mode: "cycle", t0: now, dur: 1 / cfg.rate, decided: [], spawned: false, read: false, policyFrom: policyWas };
}
function startSwap(pos) {
  // pos: intercambia las posiciones pos y pos+1 (1..5). El modelo cambia ya; la máquina lo muestra.
  const a = cfg.chain[pos - 1], b = cfg.chain[pos];
  const sidesBefore = [sideOf(pos), sideOf(pos + 1)];
  cfg.chain[pos - 1] = b; cfg.chain[pos] = a;
  version++;
  machine = { mode: "swap", t0: now, dur: still.matches ? 0.01 : 2.4, pos, a, b, sidesBefore };
  renderRows();
}

function readStations() {
  // palpado: cada estación con ficha compara su cartucho con la ficha
  const out = [];
  for (let s = 1; s <= STATIONS; s++) {
    const t = slots[s];
    if (!t) continue;
    if (s === STATIONS) { out.push({ s, t, target: cfg.policy, id: null, hit: true }); continue; }
    const id = cfg.chain[s - 1];
    if (!cfg.on[id]) continue;
    const hit = matches(ruleOf(id), t.pkt);
    out.push({ s, t, id, hit, target: ruleOf(id).target });
  }
  return out;
}
function decide(d) {
  const { s, t, id, target } = d;
  const check = verdict(t.pkt, cfg);
  const pos = s === STATIONS ? 0 : s;
  // una ficha que ya estaba en la cinta cuando cambiaron las reglas es un paquete "en vuelo":
  // sólo vio parte de la cadena nueva. Las demás deben coincidir con el modelo.
  if (t.v === version && (check.pos !== pos || check.target !== target)) console.warn("la máquina y el modelo no coinciden", t.pkt, check, pos, target);
  slots[s] = null;
  t.mode = "push"; t.s = s; t.side = target === "ACCEPT" ? 1 : -1; t.tp = now;
  if (target === "ACCEPT") stats.acc++; else stats.drop++;
  if (id === null) stats.policy++; else stats.perCart[id]++;
  stats.last = { pos, target, pkt: t.pkt };
  stats.log.unshift(stats.last);
  stats.log.length = Math.min(stats.log.length, 6);
  glow[s] = 1;
  renderStats();
}

// ======================= animación =======================
function cycleFrame(u) {
  const m = machine;
  const T = m.dur;
  // 1. avance de la cinta
  const e = span(u, 0, 0.32);
  for (let s = 1; s <= STATIONS; s++) { const t = slots[s]; if (t && t.mode === "belt") { t.x = (s - 1 + e) * PITCH; t.y = 0; t.z = BELT_Z; } }
  beltEl.setAttribute("d", beltLines(e * PITCH));
  // 2. el cargador suelta la ficha siguiente
  if (!m.spawned && u >= 0.3) { m.spawned = true; slots[0] = makeToken(nextPacket()); }
  if (slots[0]) { const t = slots[0]; t.x = 0; t.z = BELT_Z + (MAG_BOTTOM - BELT_Z) * (1 - span(u, 0.32, 0.46)); }
  // 3. palpado
  if (!m.read && u >= 0.34) { m.read = true; m.decided = readStations(); }
  for (const c of carts) c.plunge = 0;
  if (m.read) for (const d of m.decided) {
    if (d.s === STATIONS) continue;
    const c = carts[d.id];
    const depth = d.hit ? PLUNGE_HIT : PLUNGE_MISS;
    c.plunge = depth * (span(u, 0.36, 0.46) - span(u, 0.54, 0.64));
  }
  // 4. empuje: sólo las estaciones que coincidieron; un poco escalonadas en orden
  if (m.read) for (const d of m.decided) {
    if (!d.hit) continue;
    const a = 0.5 + 0.015 * d.s;
    if (!d.done && u >= a) { d.done = true; decide(d); }
    const p = pads[d.s];
    const side = d.t.side || (d.target === "ACCEPT" ? 1 : -1);
    const out = span(u, a, a + 0.2) - span(u, 0.82, 0.98);
    p.y = side * (-PAD_REST + (PAD_REST + PAD_END) * out);
    p.dir = side;
  }
}
function swapFrame(u) {
  const m = machine;
  const A = carts[m.a], B = carts[m.b];
  const xs = [m.pos * PITCH, (m.pos + 1) * PITCH];
  const up = span(u, 0, 0.16) - span(u, 0.84, 1);
  const side = span(u, 0.16, 0.28) - span(u, 0.72, 0.84);
  const go = span(u, 0.28, 0.72);
  // A va de pos a pos+1; B de pos+1 a pos
  for (const [c, from, to, dy] of [[A, xs[0], xs[1], -6], [B, xs[1], xs[0], 6]]) {
    c.x = from + (to - from) * go;
    c.y = dy * side;
    c.swapLift = LIFT_SWAP * up;
    c.where = up > 0.999 || (go > 0 && go < 1) ? "air" : "slot";
    c.s = go < 0.5 ? (from === xs[0] ? m.pos : m.pos + 1) : (to === xs[0] ? m.pos : m.pos + 1);
  }
  // empujadores: si las dos reglas tienen distinto destino, cambian de lado por encima de la ficha
  const after = [sideOf(m.pos), sideOf(m.pos + 1)];
  [m.pos, m.pos + 1].forEach((s, i) => {
    const p = pads[s];
    if (m.sidesBefore[i] === after[i]) return;
    const raise = span(u, 0.2, 0.32) - span(u, 0.68, 0.8);
    const go2 = span(u, 0.32, 0.68);
    p.z = 6 * raise;
    p.y = -m.sidesBefore[i] * PAD_REST + (m.sidesBefore[i] - after[i]) * PAD_REST * go2;
  });
  if (u >= 1) for (const c of [A, B]) { c.swapLift = 0; c.y = 0; c.where = "slot"; }
}
function policyFrame(u) {
  // si la política cambió al empezar el ciclo, el empujador final cruza por encima
  const m = machine;
  if (!m.policyFrom || m.policyFrom === cfg.policy) return;
  const from = m.policyFrom === "ACCEPT" ? 1 : -1;
  const to = -from;
  const p = pads[STATIONS];
  const raise = span(u, 0, 0.08) - span(u, 0.24, 0.32);
  p.z = 6 * raise;
  p.y = -from * PAD_REST + (from - to) * PAD_REST * span(u, 0.06, 0.26);
  const show = span(u, 0.06, 0.26) >= 0.5 ? cfg.policy : m.policyFrom;
  policyLevers.ACCEPT.style.display = show === "ACCEPT" ? "" : "none";
  policyLevers.DROP.style.display = show === "DROP" ? "" : "none";
}

function tokenFrame(t, dt) {
  if (t.mode === "push") {
    const T = machine.mode === "cycle" ? machine.dur : 1 / cfg.rate;
    const p = pads[t.s];
    const pushed = t.side * (p.y * t.side + 0.6 + TOK_H * 0 + 5);
    const a = (now - t.tp) / T;
    t.x = t.s * PITCH;
    t.z = BELT_Z;
    t.y = t.side > 0 ? Math.max(0, pushed) : Math.min(0, pushed);
    if (a >= 0.2) { t.mode = "fly"; t.tf = now; t.y0 = t.y; t.fly = Math.min(0.42, 0.36 * T + 0.12); }
  }
  if (t.mode === "fly") {
    const f = clamp((now - t.tf) / t.fly);
    const key = t.side > 0 ? "a" : "d";
    const pile = piles[key][t.s];
    const floor = PZ(t.side) + TOK_H * Math.min(pile.length, PILE_MAX);
    t.y = t.y0 + (t.side * 22 - t.y0) * Math.sin(f * Math.PI / 2);
    t.z = BELT_Z + (floor - BELT_Z) * f * f;
    if (Math.abs(t.y) > 15.6 && t.el.parentNode !== pocket(t.side, t.s)) pocket(t.side, t.s).appendChild(t.el);
    if (f >= 1) {
      t.mode = "pile"; t.y = t.side * 22; t.z = floor;
      pile.push(t);
      if (pile.length > PILE_MAX) { const old = pile.shift(); old.mode = "sink"; old.ts = now; }
    }
  }
  if (t.mode === "pile") {
    const pile = piles[t.side > 0 ? "a" : "d"][t.s];
    const target = PZ(t.side) + TOK_H * pile.indexOf(t);
    t.z += (target - t.z) * (1 - Math.exp(-dt / 0.06));
  }
  if (t.mode === "sink") {
    const f = clamp((now - t.ts) / 0.3);
    t.z = PZ(t.side) - TOK_H * f;
    t.el.setAttribute("opacity", (1 - f).toFixed(2));
    if (f >= 1) { freeToken(t); return; }
  }
  move(t.el, [t.x, t.y, t.z]);
}

function place(c) {
  const lift = (c.swapLift || 0) + c.lift;
  const air = c.where === "air";
  const parentA = air ? layer("air") : slotA(c.s);
  const parentB = air ? layer("air") : slotB(c.s);
  const els = cartEls[c.id];
  if (els.plunger.parentNode !== parentA) {
    parentA.append(els.plunger, els.lower);
    parentB.append(els.upper);
    if (air) { // en el aire: el más cercano (y mayor) se pinta después
      const order = carts.filter((o) => o.where === "air").sort((a, b) => a.y - b.y);
      for (const o of order) { const e = cartEls[o.id]; layer("air").append(e.plunger, e.lower, e.upper); }
    }
  }
  move(els.plunger, [c.x, c.y, lift - c.plunge]);
  move(els.lower, [c.x, c.y, lift]);
  move(els.upper, [c.x, c.y, lift]);
}
function placePad(p) {
  const el = paddleEls[p.s];
  // detrás de su ficha cuando empuja hacia delante (ACCEPT), delante cuando empuja hacia atrás
  const want = p.z < 0.5 && (p.dir ? p.dir > 0 : p.y < 0) ? "pad-back" : "pad-front";
  if (p.layer !== want) {
    p.layer = want;
    const host = layer(want);
    const after = [...host.children].find((c) => Number(c.dataset.paddle) > p.s);
    host.insertBefore(el, after || null);
  }
  move(el, [p.s * PITCH, p.y, p.z]);
}

let last = 0;
function frame(dt) {
  now += dt;
  let u = (now - machine.t0) / machine.dur;
  if (machine.mode === "cycle") cycleFrame(Math.min(u, 1));
  if (machine.mode === "swap") swapFrame(Math.min(u, 1));
  if (machine.mode !== "swap") policyFrame(Math.min(u, 1));
  if (u >= 1) startCycle();
  // cartuchos desactivados: quedan levantados y bloqueados
  for (const c of carts) {
    const target = cfg.on[c.id] ? 0 : LIFT_OFF;
    c.lift += (target - c.lift) * (still.matches ? 1 : 1 - Math.exp(-dt / 0.12));
    place(c);
  }
  // empujadores en reposo al lado contrario de su bandeja
  if (machine.mode === "idle" || machine.mode === "cycle") for (let s = 1; s <= STATIONS; s++) {
    const p = pads[s];
    const busy = machine.mode === "cycle" && machine.read && machine.decided.some((d) => d.s === s && d.hit);
    const moving = s === STATIONS && machine.policyFrom && machine.policyFrom !== cfg.policy && u < 0.33;
    if (!busy && !moving) { p.y = -sideOf(s) * PAD_REST; p.z = 0; p.dir = 0; }
  }
  for (let s = 1; s <= STATIONS; s++) placePad(pads[s]);
  for (const t of [...tokens]) tokenFrame(t, dt);
  // orden de pintado en la cinta: de lejos (x pequeña) a cerca
  const belt = [...tokens].filter((t) => t.el.parentNode === layer("belt")).sort((a, b) => a.x - b.x);
  belt.forEach((t, i) => { if (layer("belt").children[i] !== t.el) layer("belt").insertBefore(t.el, layer("belt").children[i] || null); });
  // pilotos, leva y cola
  for (let s = 1; s <= STATIONS; s++) { glow[s] *= Math.exp(-dt / 0.35); lamps[s].setAttribute("opacity", glow[s].toFixed(2)); }
  const share = machine.mode === "cycle" ? clamp(u) : 0;
  needle.setAttribute("d", dialNeedle(share));
  queueEl.setAttribute("transform", translateAlong(P, [0, 0, -2.8 * (machine.mode === "cycle" ? span(u, 0.3, 0.46) : 0)]));
}

let raf = 0, visible = false;
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  frame(dt);
  raf = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!raf && visible) { last = 0; raf = requestAnimationFrame(tick); } };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);

// ======================= panel =======================
const num = (v) => v.toFixed(1).replace(".", ",");
function renderRows() {
  rowsEl.innerHTML = cfg.chain.map((id, i) => {
    const r = ruleOf(id);
    const on = want.on[id];
    return '<div class="fw-row" role="row" data-id="' + id + '"' + (on ? "" : " data-off") + '><span role="cell" class="fw-no">' + (i + 1) + '</span>'
      + '<span role="cell"><input type="checkbox" aria-label="Regla ' + (i + 1) + ' activa"' + (on ? " checked" : "") + ' data-on="' + id + '"></span>'
      + '<span role="cell"><code>' + fmtRule(r) + '</code><span class="fw-note">' + r.note + '</span></span>'
      + '<span role="cell" class="fw-pk" data-pk="' + id + '">' + stats.perCart[id] + '</span>'
      + '<span role="cell">' + (i ? '<button type="button" class="fw-up" data-up="' + i + '" aria-label="Subir la regla ' + (i + 1) + ' por encima de la ' + i + '">↑</button>' : "") + '</span></div>';
  }).join("");
}
function describePkt(p) { return p.src + " → " + p.dport + "/" + p.proto; }
function renderStats() {
  write(counts.acc, String(stats.acc));
  write(counts.drop, String(stats.drop));
  const l = stats.last;
  write(counts.last, l ? (l.pos ? "regla " + l.pos : "política") + " · " + l.target + " · " + describePkt(l.pkt) : "—");
  for (const id of cfg.chain) { const el = rowsEl.querySelector('[data-pk="' + id + '"]'); if (el) write(el, String(stats.perCart[id])); }
  write(document.querySelector('[data-pk="policy"]'), String(stats.policy));
  rowsEl.querySelectorAll(".fw-row").forEach((row) => (l && l.pos && Number(row.querySelector(".fw-no").textContent) === l.pos ? row.setAttribute("data-hot", "") : row.removeAttribute("data-hot")));
  document.querySelector(".fw-policy").toggleAttribute("data-hot", !!(l && !l.pos));
  logEl.innerHTML = stats.log.map((e) => "<li><b>" + e.target + "</b><span>" + describePkt(e.pkt) + "</span><span>" + (e.pos ? "regla " + e.pos : "política") + "</span></li>").join("");
  write(readout, stats.acc + " aceptados · " + stats.drop + " descartados" + (l ? " · último: " + (l.pos ? "regla " + l.pos : "política") + " " + l.target : ""));
}
rowsEl.addEventListener("change", (e) => {
  const id = e.target.dataset.on;
  if (id === undefined) return;
  want.on[Number(id)] = e.target.checked;
  e.target.closest(".fw-row").toggleAttribute("data-off", !e.target.checked);
});
rowsEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-up]");
  if (!b) return;
  want.swaps.push(Number(b.dataset.up));
  if (machine.mode === "idle") startCycle();
});
document.querySelectorAll("[data-policy]").forEach((b) => b.addEventListener("click", () => {
  want.policy = b.dataset.policy;
  document.querySelectorAll("[data-policy]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
}));
function applySpeed() {
  want.rate = Number(speedEl.value);
  speedOut.textContent = num(want.rate) + " paquetes/s";
}
speedEl.addEventListener("input", applySpeed);
const pauseBtn = document.querySelector('[data-act="pause"]');
function togglePause() {
  running = !running;
  pauseBtn.textContent = running ? "Pausa" : "Seguir";
  stage.setAttribute("aria-valuetext", running ? "en marcha" : "en pausa");
}
pauseBtn.addEventListener("click", togglePause);
document.querySelector('[data-act="step"]').addEventListener("click", () => { steps++; });
document.querySelector('[data-act="reset"]').addEventListener("click", () => {
  for (const t of [...tokens]) freeToken(t);
  slots.fill(null);
  piles.a.forEach((p) => (p.length = 0)); piles.d.forEach((p) => (p.length = 0));
  Object.assign(stats, { acc: 0, drop: 0, perCart: RULES.map(() => 0), policy: 0, log: [], last: null });
  seed = 1304; scanAt = 0; made = 0;
  renderRows(); renderStats();
});
stage.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") { event.preventDefault(); togglePause(); }
  if (event.key === "ArrowRight") { event.preventDefault(); steps++; }
});
if (!running) pauseBtn.textContent = "Seguir";
renderRows();
renderStats();
applySpeed();
for (const c of carts) place(c);
for (let s = 1; s <= STATIONS; s++) placePad(pads[s]);
// arranque: la cinta ya trae paquetes en camino
for (let s = 1; s <= 3; s++) { const t = makeToken(nextPacket()); slots[s] = t; t.x = s * PITCH; t.z = BELT_Z; move(t.el, [t.x, 0, t.z]); }
machine = { mode: "idle", t0: 0, dur: 0.4 };
frame(0);
`;

const body = k.plateHtml({
  fig: "Fig 2",
  title: "Firewall: cadena INPUT",
  hint: "Cambia las reglas abajo",
  readout: "0 aceptados · 0 descartados",
  keys: [
    { mark: "lit", label: "Ficha = paquete: agujeros de IP origen, puerto destino y protocolo" },
    { mark: "raised", label: "Cartucho = regla: sus palpadores y su palanca (ACCEPT delante, DROP detrás)" },
    { mark: "edge", label: "Estación final = política por defecto: empuja todo lo que llega" },
  ],
  caption:
    "Un firewall de filtrado de paquetes hecho máquina. La cinta avanza a saltos y lleva cada ficha bajo las estaciones en orden, de la regla 1 a la 5. En cada una bajan los palpadores del cartucho: si todos caen en agujeros, la regla coincide y el empujador saca la ficha hacia la bandeja delantera (ACCEPT) o la trasera (DROP); esa regla decide y las siguientes ya no ven la ficha. Una zona sin palpadores significa «cualquier valor». Si ninguna regla coincide, la ficha llega a la estación final, la política por defecto (-P INPUT). Los bolsillos bajo cada estación, como los contadores de iptables -L -v, muestran qué regla decidió. Sube la regla 3 por encima de la 2 y el escaneo de 198.51.100.66 al puerto 443 entra antes de llegar a la lista negra (la que mantiene centinela/lista_negra.py con iptables).",
  body: `<div class="iso-stage" tabindex="0" role="group" aria-label="Clasificadora de paquetes. Espacio: pausa. Flecha derecha: un paquete." aria-valuetext="en marcha">${svg}</div>${panel}`,
});

const html = k
  .pageHtml({ title: "Firewall: cadena INPUT", theme, body, script: kitScript() + live, width: 720 })
  .replace('<html lang="en">', '<html lang="es">')
  .replace("</style>", CSS + "</style>");
const name = theme === "light" ? "firewall-light.html" : "firewall.html";
writeFileSync(join(HERE, name), html);
console.log("wrote", name);
