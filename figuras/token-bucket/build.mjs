// Figura: un "token bucket" (cubo de fichas) frenando un ataque de fuerza bruta.
// Genera token-bucket.html (oscuro) o token-bucket-light.html (con --light).
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
const HEIGHT = 380;
const AZ = 52;

// ---------------------------------------------------------------- modelo y medidas
const CMAX = 10; // fichas que caben como máximo en el depósito
const COIN_R = 7.5;
const COIN_T = 3; // grosor = paso de la pila
const Z0 = 6; // suelo de la pila (encima del zócalo)
const CAP_Z = 44; // cara inferior de la tapa
const M = [-83, 0]; // eje del depósito

const PLATE = { x: -112, y: -24, w: 262, d: 66, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;

const PLINTH = { x: -100, y: -13, w: 30, d: 29, r: 2 };
const WALL_X = { x: -93, y: -11, w: 2, d: 22, r: 0.5 };
const WALL_Y = { x: -93, y: -11, w: 21, d: 2, r: 0.5 };
const CAP = { x: -94, y: -12, w: 23, d: 23, r: 2 };
const COLUMN = { x: -98, y: 10.5, w: 4, d: 3.5, r: 0.5 };
const COLUMN_TOP = 41;

const LOCK = { x: -58, y: -16, w: 38, d: 32, r: 2 };
const LOCK_H = 46;
const FACE = LOCK.x + LOCK.w; // -20: cara frontal de la cerradura
const PLUG = [FACE, 0, 26];
const SHUT = { x: -16, y: -9, w: 2, d: 18, r: 0.4 };
const SHUT_Z = 18.5;
const SHUT_H = 15;
const SHUT_LIFT = 17;
const GUIDE_TOP = 56;

const REST = 10; // punta de la llave en reposo (x)
const HIT = SHUT.x + SHUT.w; // -14: choca contra la compuerta
const IN = -28; // punta dentro de la cerradura

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [CAP.x, CAP.y, 56], [CAP.x + CAP.w, CAP.y + CAP.d, 56], [-20, -12, GUIDE_TOP + 3], [-12, 12, GUIDE_TOP + 3]],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: AZ },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const slab = (plan, z, h, steps = 3, bevel = 0) => k.slabOf(plan, z, h, P, steps, bevel);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (const p of pts.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return k.pathOf([...lower.slice(0, -1), ...upper.slice(0, -1)], true);
}

// ---------------------------------------------------------------- base
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 20))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(slab(PLATE, -PLATE_H, PLATE_H, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // regla bajo el recorrido del carro
  const strip = { x: -4, y: 19, w: 92, d: 6, r: 1 };
  out.push(S(slab(strip, 0, 0.6), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 4.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 4.5, 0.6])], { size: 0.45 }));
  // placa de características con una sola etiqueta grabada
  const label = { x: -100, y: 22, w: 40, d: 12, r: 1.2 };
  out.push(S(slab(label, 0, 0.8, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.4), 0.8, P, 4), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 4, label.y + 5.2], 0.8, P, "x"), "1 FICHA = 1 INTENTO", { size: 2.5, tone: "mid" }));
  out.push(L([k.lineOnTop([label.x + 4, label.y + 7.6], [label.x + 30, label.y + 7.6], 0.8, P), k.lineOnTop([label.x + 4, label.y + 9.4], [label.x + 22, label.y + 9.4], 0.8, P)].join(""), { tone: "lo", free: true }));
  out.push(D([at([label.x + 2.2, label.y + 6, 0.8]), at([label.x + label.w - 2.2, label.y + 6, 0.8])], { size: 0.45 }));
  return out.join("");
}

// ---------------------------------------------------------------- depósito de fichas
const coinSvg = () => {
  const [x, y] = M;
  return S(k.cylinder(x, y, COIN_R, 0, COIN_T, P, 48, 0.5), { tone: "hi", crease: "lo", lit: true }) + L(k.ring(x, y, COIN_R - 2.2, COIN_T, P, 40), { tone: "lo" });
};

function magazineBack() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(PLINTH, -2), 0, 0.1, P)}" style="filter:blur(3px)"/>`);
  out.push(S(slab(PLINTH, 0, Z0, 4, 0.6), { tone: "mid" }));
  out.push(D(k.corners(PLINTH, 2.6).map(([x, y]) => at([x, y, Z0])), { size: 0.45 }));
  // labio trasero del canal de salida
  out.push(S(slab({ x: -74, y: -10.4, w: 16, d: 1.2, r: 0.3 }, Z0, 2, 2), { tone: "mid" }));
  out.push(S(slab(WALL_Y, Z0, CAP_Z - Z0, 2, 0.3), { tone: "mid" }));
  out.push(S(slab(WALL_X, Z0, CAP_Z - Z0, 2, 0.3), { tone: "mid" }));
  // ranura de visión en la pared trasera (cerrada: un contorno, no una raya)
  out.push(L(k.pathOf([at([-91, -2, 10]), at([-91, 2, 10]), at([-91, 2, 40]), at([-91, -2, 40])], true), { tone: "faint" }));
  return out.join("");
}

function chute() {
  // bloque puente entre zócalo y cerradura, a ras del suelo de la pila
  return S(slab({ x: -70, y: -10.4, w: 12, d: 20.8, r: 0.4 }, 0, Z0, 2, 0.4), { tone: "mid" });
}

function magazineFront() {
  const out = [];
  out.push(S(slab({ x: -74, y: 9.2, w: 16, d: 1.2, r: 0.3 }, Z0, 2, 2), { tone: "mid" }));
  // tapa
  out.push(S(slab(CAP, CAP_Z, 4, 4, 0.6), { tone: "mid" }));
  out.push(D([[CAP.x + 2.4, CAP.y + 2.4], [CAP.x + CAP.w - 2.4, CAP.y + 2.4], [CAP.x + 2.4, CAP.y + CAP.d - 2.4]].map(([x, y]) => at([x, y, CAP_Z + 4])), { size: 0.45 }));
  // reloj de recarga: un pequeño reloj comparador cara arriba
  const [x, y] = [M[0] + 0.5, M[1] - 0.5];
  const top = CAP_Z + 4 + 6;
  out.push(S(k.cylinder(x, y, 9, CAP_Z + 4, 6, P, 64, 0.6), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, 9, top - 2.4, top, 64, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, 9, top - 2.4, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, 7.4, top, P, 64), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, 7.2, 20, 5, top, [1, 2], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.ring(x, y, 1.1, top, P, 16), { tone: "mid" }));
  return out.join("");
}
const DIAL = { x: M[0] + 0.5, y: M[1] - 0.5, top: CAP_Z + 10 };
const dialNeedle = (share) => {
  const a = share * Math.PI * 2;
  return k.lineOnTop([DIAL.x - Math.sin(a) * 2, DIAL.y + Math.cos(a) * 2], [DIAL.x + Math.sin(a) * 6.4, DIAL.y - Math.cos(a) * 6.4], DIAL.top + 0.15, P);
};

function capacityColumn() {
  const out = [];
  out.push(S(slab(COLUMN, Z0, COLUMN_TOP - Z0, 2, 0.3), { tone: "mid" }));
  // marcas, una por ficha, que nacen del canto izquierdo de la cara frontal
  const minor = [];
  const major = [];
  for (let i = 0; i <= CMAX; i++) {
    const z = Z0 + i * COIN_T;
    (i % 5 === 0 ? major : minor).push(k.segment([COLUMN.x, COLUMN.y + COLUMN.d, z], [COLUMN.x + (i % 5 === 0 ? 3 : 1.8), COLUMN.y + COLUMN.d, z], P));
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  out.push(S(slab({ x: COLUMN.x - 1, y: COLUMN.y - 1, w: COLUMN.w + 2, d: COLUMN.d + 2, r: 0.6 }, COLUMN_TOP, 2, 2, 0.3), { tone: "mid" }));
  return out.join("");
}
// collar del tope de capacidad, construido a altura 0 y movido en z
function collar() {
  const out = [];
  out.push(S(slab({ x: COLUMN.x - 1.2, y: COLUMN.y - 1.2, w: COLUMN.w + 2.4, d: COLUMN.d + 2.4, r: 0.8 }, -1.2, 2.4, 2, 0.3), { tone: "hi", crease: "lo" }));
  out.push(S(slab({ x: COLUMN.x + COLUMN.w + 1.2, y: COLUMN.y + 0.6, w: 2.6, d: 1.8, r: 0.4 }, -0.6, 1.2, 2), { tone: "hi", crease: "lo" }));
  return out.join("");
}

// ---------------------------------------------------------------- cerradura
function lock() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(LOCK, -2), 0, 0.1, P)}" style="filter:blur(3px)"/>`);
  const seam = k.sideSeam(LOCK, 8, P, 4);
  out.push(S(slab(LOCK, 0, LOCK_H, 4, 0.8), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(LOCK, 3.5), LOCK_H, P, 4), { tone: "faint" }));
  out.push(D(k.corners(LOCK, 2).map(([x, y]) => at([x, y, LOCK_H])), { size: 0.45 }));
  // escudo, rotor y ranura de la llave en la cara frontal
  out.push(L(k.sideRing(PLUG, 7.6, "x", P, 48), { tone: "lo" }));
  out.push(L(k.sideRing(PLUG, 5.4, "x", P, 40), { tone: "mid" }));
  out.push(L(k.pathOf([at([FACE, -0.9, 23]), at([FACE, 0.9, 23]), at([FACE, 0.9, 29.5]), at([FACE, -0.9, 29.5])], true), { tone: "hi" }));
  out.push(D([[-13, 40], [13, 40], [-13, 6], [13, 6]].map(([y, z]) => at([FACE, y, z])), { size: 0.45 }));
  // ranura de entrada de fichas en la tapa (cerrada)
  out.push(L(k.planOutline({ x: -52, y: -6, w: 5, d: 12, r: 1 }, LOCK_H, P, 3), { tone: "lo" }));
  // dos pilotos: aceptado y bloqueado
  for (const [x, y] of LAMPS) {
    out.push(S(k.cylinder(x, y, 2.8, LOCK_H, 1.4, P, 24), { tone: "mid" }));
    out.push(S(k.cylinder(x, y, 2, LOCK_H + 1.4, 2, P, 24), { tone: "hi", crease: "lo" }));
  }
  return out.join("");
}
const LAMPS = [[-40, 9], [-30, 9]];
const lampLit = (index) => {
  const [x, y] = LAMPS[index];
  return S(k.cylinder(x, y, 2, LOCK_H + 1.4, 2, P, 24), { tone: "hi", lit: true }) + D([at([x, y, LOCK_H + 3.4])], { size: 0.9, tone: "hi" });
};

const GUIDE_BACK = { x: -20, y: -12.5, w: 8, d: 3, r: 0.5 };
const GUIDE_FRONT = { x: -20, y: 9.5, w: 8, d: 3, r: 0.5 };
function guide(plan) {
  const out = [S(slab(plan, 0, GUIDE_TOP, 2, 0.3), { tone: "mid" })];
  out.push(D([at([plan.x + 6, plan.y + plan.d, 10]), at([plan.x + 6, plan.y + plan.d, 46])].filter(() => plan === GUIDE_FRONT), { size: 0.45 }));
  return out.join("");
}
function bridge() {
  const plan = { x: -21, y: -13, w: 10, d: 26, r: 0.8 };
  const out = [S(slab(plan, GUIDE_TOP, 3, 3, 0.4), { tone: "mid" })];
  out.push(D([at([-16, -10.5, GUIDE_TOP + 3]), at([-16, 10.5, GUIDE_TOP + 3])], { size: 0.45 }));
  return out.join("");
}
function shutter() {
  const out = [S(slab(SHUT, SHUT_Z, SHUT_H, 2, 0.3), { tone: "hi", crease: "lo" })];
  // dos tornillos y un nervio cerrado en la cara frontal
  out.push(L(k.pathOf([at([HIT, -6, SHUT_Z + 3]), at([HIT, 6, SHUT_Z + 3]), at([HIT, 6, SHUT_Z + 12]), at([HIT, -6, SHUT_Z + 12])], true), { tone: "faint" }));
  out.push(D([at([HIT, -7.4, SHUT_Z + 13.4]), at([HIT, 7.4, SHUT_Z + 13.4])], { size: 0.45 }));
  return out.join("");
}

// ---------------------------------------------------------------- raíles, carro y llave
function rails() {
  const out = [];
  for (const y of [-11, 7]) {
    out.push(S(slab({ x: -2, y, w: 90, d: 4, r: 1 }, 0, 3, 3, 0.4), { tone: "mid" }));
    out.push(D([4, 44, 82].map((x) => at([x, y + 2, 3])), { size: 0.4 }));
  }
  for (const x of [-6, 88]) {
    out.push(S(slab({ x, y: -12, w: 4, d: 24, r: 1 }, 0, 7, 3, 0.5), { tone: "mid" }));
    out.push(D([at([x + 2, -9, 7]), at([x + 2, 9, 7])], { size: 0.45 }));
  }
  return out.join("");
}

// Todo el carro se construye con la punta de la llave en x = 0 y se mueve en x.
const KEY_Z = 24.5;
function keyBlade() {
  const out = [];
  // dientes (cortes de la llave) bajo la hoja
  const teeth = [1.4, 2.6, 1.8, 3, 2.2];
  teeth.forEach((h, i) => out.push(S(slab({ x: 3 + i * 4, y: -0.8, w: 2.4, d: 1.6, r: 0.2 }, KEY_Z - h, h, 2), { tone: "hi", crease: "lo" })));
  out.push(S(slab({ x: 0, y: -0.8, w: 25, d: 1.6, r: 0.3 }, KEY_Z, 4, 2, 0.2), { tone: "hi", crease: "lo" }));
  return out.join("");
}
function keyBow() {
  const out = [];
  out.push(S(slab({ x: 25, y: -1.3, w: 2, d: 2.6, r: 0.3 }, KEY_Z - 1.5, 7, 2), { tone: "hi", crease: "lo" }));
  out.push(S(slab({ x: 27, y: -0.9, w: 10, d: 1.8, r: 0.5 }, KEY_Z - 4, 12, 2, 0.3), { tone: "hi", crease: "lo" }));
  out.push(L(k.sideRing([31, 0.9, KEY_Z + 2], 2, "y", P, 24), { tone: "lo" }));
  return out.join("");
}
function carriage() {
  const out = [];
  const plate = { x: 28, y: -14, w: 34, d: 28, r: 2 };
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(plate, 2), 3, 0.1, P)}" style="filter:blur(3px)"/>`);
  out.push(S(slab(plate, 3, 5, 4, 0.6), { tone: "mid" }));
  out.push(L(k.lineOnTop([plate.x, 0], [plate.x + plate.w, 0], 8, P), { tone: "faint" }));
  // casquillos sobre los raíles
  for (const [x, y] of byDepth([[30, -13], [54, -13], [30, 7.5], [54, 7.5]])) {
    out.push(S(slab({ x, y, w: 6, d: 5.5, r: 0.8 }, 8, 2.4, 2, 0.3), { tone: "mid" }));
    out.push(D([at([x + 3, y + 2.75, 10.4])], { size: 0.45 }));
  }
  // columna y mandril que sujetan la llave (el "brazo")
  out.push(S(slab({ x: 35, y: -3.5, w: 7, d: 7, r: 0.8 }, 8, 10, 2, 0.3), { tone: "mid" }));
  out.push(S(slab({ x: 56, y: -4, w: 6, d: 8, r: 0.8 }, 8, 10, 2, 0.3), { tone: "mid" }));
  out.push(D([at([59, -2, 18]), at([59, 2, 18])], { size: 0.45 }));
  // vástago del cilindro: sale del soporte trasero y entra en el cilindro
  out.push(S(slab({ x: 62, y: -1.5, w: 64, d: 3, r: 1.4 }, 12.5, 3, 4, 0.3), { tone: "mid" }));
  return out.join("");
}
function chuck() {
  const out = [];
  out.push(S(slab({ x: 34, y: -5, w: 10, d: 10, r: 1 }, 18, 17, 3, 0.5), { tone: "mid" }));
  out.push(L(k.lineOnTop([34, 0], [44, 0], 35, P), { tone: "faint" }));
  out.push(D([at([36.4, -2.6, 35]), at([41.6, 2.6, 35])], { size: 0.45 }));
  // tornillo de apriete en el costado
  out.push(S(slab({ x: 37.8, y: 5, w: 2.4, d: 2.2, r: 0.5 }, 25, 3, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(39, 8.4, 2.2, 24, 5, P, 20), { tone: "mid" }));
  out.push(L(k.knurl(39, 8.4, 2.2, 24, 29, 16, P), { tone: "lo" }));
  return out.join("");
}

// el recorte que oculta la parte de la llave que ya está dentro de la cerradura
const KEY_CLIP = hull(k.boxCorners({ x: FACE, y: -3, w: 400, d: 6 }, 10, 42).map((p) => at(p)));

function cylinderUnit() {
  const out = [];
  const body = { x: 93, y: -9, w: 41, d: 18, r: 1.6 };
  for (const x of [97, 124]) out.push(S(slab({ x, y: -12, w: 6, d: 24, r: 0.8 }, 0, 4, 2, 0.3), { tone: "mid" }));
  out.push(`<path class="iso-halo" d="${k.haloOf(body, 3, 0.1, P)}" style="filter:blur(3px)"/>`);
  out.push(S(slab({ x: 89, y: -10.5, w: 4, d: 21, r: 1 }, 2.5, 23, 3, 0.4), { tone: "mid" }));
  out.push(S(slab(body, 4, 20, 4, 0.5), { tone: "mid", inner: L(k.sideSeam(body, 14, P, 4), { tone: "faint" }) }));
  out.push(S(slab({ x: 134, y: -10.5, w: 4, d: 21, r: 1 }, 2.5, 23, 3, 0.4), { tone: "mid" }));
  out.push(D([at([91, 8.5, 25.5]), at([91, -8.5, 25.5]), at([136, 8.5, 25.5]), at([136, -8.5, 25.5])], { size: 0.45 }));
  out.push(D([at([138, 7, 22]), at([138, -7, 22]), at([138, 7, 6]), at([138, -7, 6])], { size: 0.45 }));
  // dos tomas de aire tapadas
  for (const x of [100, 127]) {
    out.push(S(k.cylinder(x, 0, 2.4, 24, 2, P, 20), { tone: "mid" }));
    out.push(S(k.cylinder(x, 0, 1.6, 26, 2, P, 20), { tone: "mid" }));
  }
  return out.join("");
}

// ---------------------------------------------------------------- mandos
const KNOBS = [[100, 31], [116, 31], [132, 31]];
const KNOB_SPAN = 1.5 * Math.PI; // 270°
const knobPointer = ([x, y], share) => {
  const a = -KNOB_SPAN / 2 + share * KNOB_SPAN;
  return k.lineOnTop([x + Math.sin(a) * 1.2, y - Math.cos(a) * 1.2], [x + Math.sin(a) * 4.4, y - Math.cos(a) * 4.4], 5.4, P);
};
function knobs() {
  const out = [];
  for (const [x, y] of KNOBS) {
    out.push(S(k.cylinder(x, y, 7.4, 0, 0.8, P, 48), { tone: "lo", crease: "none" }));
    const t = k.radialTicks(x, y, 7, 18, 3, 0.8, [0.9, 1.6], P, -KNOB_SPAN / 2, KNOB_SPAN);
    out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
    out.push(S(k.cylinder(x, y, 4.8, 0.8, 4.6, P, 36), { tone: "mid" }));
    out.push(L(k.knurl(x, y, 4.8, 0.8, 5.4, 28, P), { tone: "lo" }));
  }
  return out.join("");
}

// ---------------------------------------------------------------- figura
const coins = Array.from({ length: CMAX + 3 }, (_, i) => `<g data-coin="${i}" style="display:none">${coinSvg()}</g>`).join("");

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Una máquina de banco que explica un limitador de tipo token bucket. A la izquierda, un depósito vertical guarda una pila de fichas que se rellena a ritmo constante; un reloj en su tapa marca la próxima ficha y un collar en una columna graduada marca la capacidad. En el centro, una cerradura con una compuerta corredera. A la derecha, un cilindro neumático empuja un carro con una llave contra la cerradura. Cada intento gasta una ficha, que levanta la compuerta y deja entrar la llave; sin fichas, la compuerta sigue cerrada y la llave rebota.",
  body: [
    base(),
    magazineBack(),
    chute(),
    `<g data-part="coins">${coins}</g>`,
    magazineFront(),
    `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" d="${dialNeedle(0)}" style="stroke-width:1"/>`,
    capacityColumn(),
    `<g data-part="collar" transform="${k.translateAlong(P, [0, 0, Z0 + 5 * COIN_T])}">${collar()}</g>`,
    lock(),
    `<g data-part="lamp0" opacity="0">${lampLit(0)}</g>`,
    `<g data-part="lamp1" opacity="0">${lampLit(1)}</g>`,
    guide(GUIDE_BACK),
    `<g data-part="shutter">${shutter()}</g>`,
    rails(),
    `<g data-part="carriage" transform="${k.translateAlong(P, [REST, 0, 0])}"><clipPath id="tb-keyclip"><path data-hold d="${KEY_CLIP}"/></clipPath><g clip-path="url(#tb-keyclip)">${keyBlade()}</g>${carriage()}${keyBow()}${chuck()}</g>`,
    guide(GUIDE_FRONT),
    bridge(),
    cylinderUnit(),
    knobs(),
    KNOBS.map((xy, i) => `<path data-knob="${i}" class="iso-line" data-tone="hi" data-free="end" d="${knobPointer(xy, 0.5)}" style="stroke-width:0.9"/>`).join(""),
  ],
});

// ---------------------------------------------------------------- controles
const CONTROLS = [
  { id: "rate", label: "Velocidad del ataque", unit: "intentos/s", min: 0.5, max: 10, step: 0.5, value: 4 },
  { id: "cap", label: "Capacidad del depósito", unit: "fichas", min: 1, max: CMAX, step: 1, value: 5 },
  { id: "fill", label: "Ritmo de recarga", unit: "fichas/s", min: 0.2, max: 3, step: 0.1, value: 1 },
];
const fmt = (v, step) => (step < 1 ? v.toFixed(1) : String(v)).replace(".", ",");
const panel = `
<div class="tb-panel">
  <div class="tb-controls">${CONTROLS.map((c, i) => `
    <label class="tb-control" for="tb-${c.id}">
      <span class="tb-control-head"><span class="tb-knob-no">${i + 1}</span>${c.label}<output id="tb-${c.id}-out">${fmt(c.value, c.step)} ${c.unit}</output></span>
      <input id="tb-${c.id}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}">
    </label>`).join("")}
  </div>
  <div class="tb-counters" aria-live="off">
    <div class="tb-counter"><span class="tb-num" data-count="acc">0</span><span class="tb-what">aceptados</span></div>
    <div class="tb-counter"><span class="tb-num" data-count="blk">0</span><span class="tb-what">bloqueados</span></div>
    <div class="tb-counter"><span class="tb-num" data-count="tok">5,0</span><span class="tb-what">fichas restantes</span></div>
    <div class="tb-counter"><span class="tb-num" data-count="pass">0,0</span><span class="tb-what">aceptados por segundo (10 s)</span></div>
  </div>
  <div class="tb-actions"><button type="button" data-act="pause">Pausa</button><button type="button" data-act="reset">Reiniciar</button></div>
</div>`;

const CSS = `
.tb-panel{margin-top:22px;display:grid;gap:18px;font-size:13px;color:var(--anatomy-text)}
.tb-controls{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.tb-control{display:grid;gap:6px}
.tb-control-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;color:var(--anatomy-strong)}
.tb-control-head output{margin-left:auto;font-family:var(--anatomy-mono);font-size:11.5px;color:var(--anatomy-text);font-variant-numeric:tabular-nums}
.tb-knob-no{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;box-shadow:0 0 0 1px var(--anatomy-mid);font:10px/1 var(--anatomy-mono);color:var(--anatomy-text)}
.tb-control input{width:100%;accent-color:var(--anatomy-hi)}
.tb-counters{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--anatomy-faint);box-shadow:0 0 0 1px var(--anatomy-faint)}
.tb-counter{display:grid;gap:2px;padding:10px 12px;background:var(--anatomy-card)}
.tb-num{font:500 20px/1.1 var(--anatomy-mono);color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
.tb-what{font-size:11.5px;color:var(--anatomy-muted)}
.tb-actions{display:flex;gap:8px}
.tb-actions button{font:12px/1 var(--anatomy-mono);padding:8px 12px;border:0;border-radius:0;background:var(--anatomy-card);color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-mid);cursor:pointer}
.tb-actions button:hover{box-shadow:0 0 0 1px var(--anatomy-hi)}
.tb-actions button:focus-visible,.tb-control input:focus-visible,.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
@media (max-width:560px){.iso-stage{overflow:hidden}.iso-stage svg{width:106%;margin:-4% 0 -4% -4%}.tb-controls{grid-template-columns:1fr}.tb-counters{grid-template-columns:repeat(2,1fr)}}
`;

// ---------------------------------------------------------------- comportamiento en vivo
const live = `
const P = ${JSON.stringify(P)};
const M = ${JSON.stringify(M)}, COIN_T = ${COIN_T}, Z0 = ${Z0}, CAP_Z = ${CAP_Z}, CMAX = ${CMAX};
const REST = ${REST}, HIT = ${HIT}, IN = ${IN}, SHUT_LIFT = ${SHUT_LIFT};
const DIAL = ${JSON.stringify(DIAL)};
const KNOBS = ${JSON.stringify(KNOBS)}, KNOB_SPAN = ${KNOB_SPAN};
const CONTROLS = ${JSON.stringify(CONTROLS)};
const dialNeedle = ${dialNeedle.toString().replace(/k\./g, "")};
const knobPointer = ${knobPointer.toString().replace(/k\./g, "")};

const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const q = (sel) => svg.querySelector(sel);
const coinEls = [...svg.querySelectorAll("[data-coin]")];
const needle = q('[data-part="needle"]');
const collar = q('[data-part="collar"]');
const shutterEl = q('[data-part="shutter"]');
const carriage = q('[data-part="carriage"]');
const lamps = [q('[data-part="lamp0"]'), q('[data-part="lamp1"]')];
const knobEls = [...svg.querySelectorAll("[data-knob]")];
const readout = document.querySelector("[data-readout]");
const counts = Object.fromEntries([...document.querySelectorAll("[data-count]")].map((el) => [el.dataset.count, el]));
const inputs = CONTROLS.map((c) => document.getElementById("tb-" + c.id));
const outputs = CONTROLS.map((c) => document.getElementById("tb-" + c.id + "-out"));
const still = matchMedia("(prefers-reduced-motion: reduce)");
const num = (v, d = 1) => v.toFixed(d).replace(".", ",");
const write = (el, text) => { if (el.textContent !== text) el.textContent = text; };

// --- el modelo: un token bucket de libro ---------------------------------
// fichas += recarga·dt (sin pasar de la capacidad); cada intento gasta 1 ficha
// si la hay (aceptado) o se rechaza (bloqueado).
const model = { rate: 4, cap: 5, fill: 1, tokens: 5, clock: 0, acc: 0, blk: 0, time: 0, log: [] };
function step(dt) {
  model.time += dt;
  model.tokens = Math.min(model.cap, model.tokens + model.fill * dt);
  model.clock += dt;
  const period = 1 / model.rate;
  if (model.clock >= period) {
    model.clock -= period;
    const ok = model.tokens >= 1;
    if (ok) { model.tokens -= 1; model.acc++; model.log.push(model.time); consume(); } else model.blk++;
    startStroke(ok);
  }
  while (model.log.length && model.log[0] < model.time - 10) model.log.shift();
}

// --- lo que se ve ----------------------------------------------------------
const stack = [];   // fichas en la pila: { z, v }
const leaving = []; // fichas camino de la cerradura: { x, t }
function consume() {
  stack.shift();
  if (leaving.length < 3) leaving.push({ t: 0 });
}
function syncStack() {
  const whole = Math.floor(model.tokens + 1e-9);
  while (stack.length > whole) stack.pop();
  while (stack.length < whole) stack.push({ z: still.matches ? Z0 + stack.length * COIN_T : CAP_Z - COIN_T - 0.5, v: 0 });
}
let stroke = null; // { u, ok, dur }
let lampGlow = [0, 0];
function startStroke(ok) {
  stroke = { u: 0, ok, dur: Math.min(0.55, 0.85 / model.rate) };
  lampGlow[ok ? 0 : 1] = 1;
}
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function keyAt(s) {
  if (!s) return { tip: REST, lift: 0 };
  const u = s.u;
  if (s.ok) {
    const lift = smooth(0, 0.2, u) * (1 - smooth(0.85, 1, u));
    if (u < 0.45) return { tip: REST - (REST - IN) * inOut(u / 0.45), lift };
    if (u < 0.55) return { tip: IN, lift };
    return { tip: IN + (REST - IN) * inOut((u - 0.55) / 0.45), lift };
  }
  // sin ficha: avanza, choca con la compuerta cerrada y rebota
  if (u < 0.35) { const t = u / 0.35; return { tip: REST - (REST - HIT) * t * t, lift: 0 }; }
  const w = (u - 0.35) / 0.65;
  const back = 1 - Math.exp(-6 * w) * Math.cos(7 * w);
  return { tip: HIT + (REST - HIT) * Math.min(1.04, back + w * w * (1 - back)), lift: 0, knock: Math.exp(-14 * w) };
}

const ax = (v) => axisVector(P, [v, 0, 0]);
let shownTok = null;
function draw() {
  // pila
  stack.forEach((c, i) => {
    const el = coinEls[i];
    el.style.display = "";
    el.setAttribute("transform", translateAlong(P, [0, 0, c.z]));
  });
  for (let i = stack.length; i < CMAX; i++) coinEls[i].style.display = "none";
  for (let i = 0; i < 3; i++) {
    const el = coinEls[CMAX + i];
    const c = leaving[i];
    if (!c) { el.style.display = "none"; continue; }
    el.style.display = "";
    el.setAttribute("transform", translateAlong(P, [33 * inOut(Math.min(1, c.t)), 0, Z0]));
  }
  // reloj de recarga: fracción de la ficha que se está formando
  const full = model.tokens >= model.cap - 1e-6;
  needle.setAttribute("d", dialNeedle(full ? 0 : model.tokens - Math.floor(model.tokens)));
  // collar de capacidad
  collar.setAttribute("transform", translateAlong(P, [0, 0, Z0 + model.cap * COIN_T]));
  // llave, compuerta y pilotos
  const k = still.matches ? { tip: REST, lift: 0 } : keyAt(stroke);
  const off = ax(k.tip);
  carriage.setAttribute("transform", "translate(" + off[0].toFixed(2) + " " + off[1].toFixed(2) + ")");
  holdStill(carriage, off);
  const knock = k.knock ? Math.sin(k.knock * 40) * k.knock * 0.5 : 0;
  shutterEl.setAttribute("transform", translateAlong(P, [knock, 0, k.lift * SHUT_LIFT]));
  lamps.forEach((el, i) => el.setAttribute("opacity", (still.matches ? (lampGlow[i] > 0.01 ? 1 : 0) : lampGlow[i]).toFixed(2)));
  // lecturas
  const tok = Math.floor(model.tokens * 10) / 10;
  write(counts.acc, String(model.acc));
  write(counts.blk, String(model.blk));
  write(counts.tok, num(tok) + " / " + model.cap);
  write(counts.pass, num(model.log.length / Math.min(10, Math.max(model.time, 1))));
  write(readout, model.acc + " aceptados · " + model.blk + " bloqueados · " + num(tok) + " fichas");
}

function animate(dt) {
  const calm = still.matches;
  stack.forEach((c, i) => {
    const target = Z0 + i * COIN_T;
    if (calm) { c.z = target; c.v = 0; return; }
    if (c.z > target) { c.v += 900 * dt; c.z = Math.max(target, c.z - c.v * dt); }
    if (c.z <= target) { c.z = target; c.v = 0; }
  });
  for (const c of leaving) c.t += calm ? 1 : dt / Math.min(0.5, 0.9 / model.rate);
  while (leaving.length && leaving[0].t >= 1) leaving.shift();
  if (stroke) { stroke.u += dt / stroke.dur; if (stroke.u >= 1) stroke = null; }
  lampGlow = lampGlow.map((g) => g * Math.exp(-dt / 0.22));
}

let frame = 0, last = 0, visible = false, paused = false;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (!paused) {
    // subpasos: el modelo nunca se salta un intento aunque el ataque sea rápido
    const n = Math.ceil(dt / 0.01);
    for (let i = 0; i < n; i++) { step(dt / n); syncStack(); }
    animate(dt);
  }
  draw();
  frame = visible && !paused ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible && !paused) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);

function describe() {
  stage.setAttribute("aria-valuetext", "Ataque " + num(model.rate) + " intentos por segundo, depósito de " + model.cap + " fichas, recarga " + num(model.fill) + " fichas por segundo" + (paused ? ", en pausa" : ""));
}
function apply() {
  const [rate, cap, fill] = inputs.map((el) => Number(el.value));
  Object.assign(model, { rate, cap, fill });
  model.tokens = Math.min(model.tokens, cap);
  model.clock = Math.min(model.clock, 1 / rate);
  syncStack();
  CONTROLS.forEach((c, i) => {
    const v = Number(inputs[i].value);
    outputs[i].textContent = (c.step < 1 ? num(v) : String(v)) + " " + c.unit;
    knobEls[i].setAttribute("d", knobPointer(KNOBS[i], (v - c.min) / (c.max - c.min)));
  });
  stage.setAttribute("aria-valuenow", String(rate));
  describe();
  draw();
}
inputs.forEach((el) => el.addEventListener("input", apply));
const pauseBtn = document.querySelector('[data-act="pause"]');
function togglePause() {
  paused = !paused;
  pauseBtn.textContent = paused ? "Seguir" : "Pausa";
  describe();
  run();
}
pauseBtn.addEventListener("click", togglePause);
document.querySelector('[data-act="reset"]').addEventListener("click", () => {
  Object.assign(model, { tokens: model.cap, clock: 0, acc: 0, blk: 0, time: 0, log: [] });
  stack.length = 0; leaving.length = 0; stroke = null;
  syncStack();
  stack.forEach((c, i) => { c.z = Z0 + i * COIN_T; });
  draw();
});
stage.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") { event.preventDefault(); togglePause(); return; }
  const i = event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : event.key === "ArrowDown" || event.key === "ArrowLeft" ? -1 : 0;
  if (!i) return;
  event.preventDefault();
  const el = inputs[0];
  el.value = String(Math.min(Number(el.max), Math.max(Number(el.min), Number(el.value) + i * Number(el.step) * (event.shiftKey ? 4 : 1))));
  apply();
});
syncStack();
stack.forEach((c, i) => { c.z = Z0 + i * COIN_T; });
apply();
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Token bucket",
  hint: "Mueve los mandos",
  readout: "0 aceptados · 0 bloqueados · 5,0 fichas",
  keys: [
    { mark: "lit", label: "Fichas: cada intento de login gasta una" },
    { mark: "raised", label: "Compuerta: solo se levanta si entra una ficha" },
    { mark: "edge", label: "Mandos 1-2-3: ataque, capacidad y recarga" },
  ],
  caption:
    "Un limitador token bucket hecho máquina. El reloj de la tapa añade fichas al depósito a ritmo constante hasta el collar de capacidad. Cada empujón del cilindro es un intento de login: si hay ficha, cae a la cerradura, levanta la compuerta y la llave entra (el servidor comprueba la contraseña); si no, la llave choca y rebota (HTTP 429). Con un ataque más rápido que la recarga, los aceptados por segundo bajan hasta igualar la recarga.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Limitador token bucket. Flechas: velocidad del ataque. Espacio: pausa." aria-valuemin="0.5" aria-valuemax="10" aria-valuenow="4">${svg}</div>${panel}`,
});

const html = k
  .pageHtml({ title: "Token bucket", theme, body, script: kitScript() + live })
  .replace('<html lang="en">', '<html lang="es">')
  .replace("</style>", CSS + "</style>");
const name = theme === "light" ? "token-bucket-light.html" : "token-bucket.html";
writeFileSync(join(HERE, name), html);
console.log("wrote", name);
