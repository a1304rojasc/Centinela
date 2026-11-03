// Figura: el cifrado asimétrico hecho máquina. Un buzón-caja fuerte con un
// candado de golpe (llave pública) y una cerradura de llave única (llave privada),
// más una prensa de lacre para firmar. Los números son RSA de juguete de verdad.
// Genera cifrado-asimetrico.html (oscuro) o cifrado-asimetrico-light.html (con --light).
//   node build.mjs
//   node build.mjs --light
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import * as rsa from "./rsa.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (file) => readFileSync(join(HERE, file), "utf8").replace(/^export /gm, "");

// ---------------------------------------------------------------- comprobación del modelo
const KEYS = rsa.KEYS;
if (KEYS.n !== 3233 || KEYS.d !== 2753 || (KEYS.e * KEYS.d) % KEYS.phi !== 1) throw new Error("las llaves no cuadran");
for (let m = 0; m < KEYS.n; m += 97) {
  if (!rsa.run(m, "cifrar", false).ok || !rsa.run(m, "firmar", false).ok) throw new Error("RSA falla con m = " + m);
}
for (let m = 65; m <= 90; m++) if (rsa.run(m, "cifrar", true).ok) throw new Error("la llave equivocada abre con m = " + m);

const WIDTH = 600;
const HEIGHT = 390;
const AZ = 52;

// ---------------------------------------------------------------- medidas
const PLATE = { x: -118, y: -46, w: 242, d: 98, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;

const PLINTH = { x: -109, y: -39, w: 60, d: 76, r: 3 };
const BOX = { x: -106, y: -36, w: 54, d: 70, r: 3 };
const BOX_Z = 4;
const TOP = 64;
const FACE = BOX.x + BOX.w; // -52: cara frontal de la caja
const SIDE = BOX.y + BOX.d; // 34: costado izquierdo de la caja

const LANE = { pub: 20, priv: -20 }; // y de cada carril
const KEY_Z = 26; // eje de las cerraduras y de las llaves

const REST = FACE + 30; // punta de la llave en reposo
const IN = FACE - 8; // punta dentro de la cerradura
const SHIFT = REST - 10; // las piezas fijas del carril, medidas desde el reposo

// cuentakilómetros: cuatro tambores en una ventana de la cara frontal
const WIN = { y0: -14, y1: 14, z0: 47, z1: 57 };
const DRUM_W = 7;
const DRUM_Y = [10.5, 3.5, -3.5, -10.5]; // de la cifra de los millares a la de las unidades
const DIGIT_BASE = 49;
const DIGIT_H = 10;
const GLASS_X = FACE + 1.6;

// candado y prensa de lacre
const LOCK_BODY = { x: FACE + 0.4, y: -6.5, w: 5.6, d: 13, r: 1.4 };
const SHACKLE_LIFT = 6;
const SEAL = [-96, -12];
const RAM_DROP = 8.6;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [-102, -32, TOP + 44], [-91, -6, TOP + 44], [BOX.x, SIDE, TOP]],
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
const faceRect = (x, y0, y1, z0, z1) => k.pathOf([at([x, y0, z0]), at([x, y1, z0]), at([x, y1, z1]), at([x, y0, z1])], true);
const sideRect = (y, x0, x1, z0, z1) => k.pathOf([at([x0, y, z0]), at([x1, y, z0]), at([x1, y, z1]), at([x0, y, z1])], true);

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
  // regla bajo el recorrido de la llave pública
  const ruler = { x: -34, y: 37, w: 92, d: 6, r: 1 };
  out.push(S(slab(ruler, 0, 0.6), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(ruler.x + 4, ruler.x + ruler.w - 4, 4, 5, ruler.y, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([ruler.x + 2, ruler.y + 4.5, 0.6]), at([ruler.x + ruler.w - 2, ruler.y + 4.5, 0.6])], { size: 0.45 }));
  // placa de características: la única etiqueta grabada (la llave pública, que no es secreta)
  const label = { x: -106, y: 40, w: 52, d: 10, r: 1.2 };
  out.push(S(slab(label, 0, 0.8, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.4), 0.8, P, 4), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 4.5, label.y + 4.6], 0.8, P, "x"), `PÚBLICA n=${KEYS.n} e=${KEYS.e}`, { size: 2.6, tone: "mid" }));
  out.push(L([k.lineOnTop([label.x + 4.5, label.y + 6.8], [label.x + 34, label.y + 6.8], 0.8, P), k.lineOnTop([label.x + 4.5, label.y + 8.2], [label.x + 24, label.y + 8.2], 0.8, P)].join(""), { tone: "lo", free: true }));
  out.push(D([at([label.x + 2.2, label.y + 5, 0.8]), at([label.x + label.w - 2.2, label.y + 5, 0.8])], { size: 0.45 }));
  // placa de anclaje bajo la caja con cuatro pernos
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(PLINTH, -2), 0, 0.1, P)}" style="filter:blur(3px)"/>`);
  return out.join("");
}

// ---------------------------------------------------------------- caja fuerte (el buzón)
function box() {
  const out = [];
  out.push(S(slab(PLINTH, 0, BOX_Z, 6, 0.6), { tone: "mid" }));
  out.push(D(k.corners(PLINTH, 2).map(([x, y]) => at([x, y, BOX_Z])), { size: 0.5 }));
  const seam = k.sideSeam(BOX, 12, P, 4);
  out.push(S(slab(BOX, BOX_Z, TOP - BOX_Z, 4, 0.9), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(BOX, 3), TOP, P, 4), { tone: "faint" }));
  out.push(D(k.corners(BOX, 1.6).map(([x, y]) => at([x, y, TOP])), { size: 0.45 }));
  // puerta en la cara frontal: contorno cerrado, pernos y bisagras
  out.push(L(faceRect(FACE, -31, 31, 16, 61), { tone: "lo" }));
  out.push(D([[-29, 18], [29, 18], [-29, 59], [29, 59]].map(([y, z]) => at([FACE, y, z])), { size: 0.45 }));
  return out.join("");
}

// llaves públicas de repuesto colgadas en el costado: cualquiera puede coger una
const HOOKS = [-96, -82, -68];
function hangingKey(hx, i) {
  const out = [];
  const y0 = SIDE + 2.6;
  out.push(S(slab({ x: hx - 0.8, y: y0, w: 1.6, d: 1.2, r: 0.2 }, 24, 14, 2), { tone: "hi", crease: "lo" }));
  const teeth = [[26, 1.6], [29, 2.4], [32, 1.4], [35, 2]];
  for (const [z, w] of teeth) out.push(S(slab({ x: hx + 0.8, y: y0, w, d: 1.2, r: 0.2 }, z, 2, 2), { tone: "hi", crease: "lo" }));
  out.push(S(slab({ x: hx - 3.4, y: y0, w: 6.8, d: 1.2, r: 1.4 }, 38, 8, 4, 0.2), { tone: "hi", crease: "lo" }));
  out.push(L(k.sideRing([hx, y0 + 1.2, 43.2], 1.5, "y", P, 20), { tone: "lo" }));
  // la clavija que pasa por el ojo de la llave
  out.push(S(slab({ x: hx - 0.8, y: SIDE + 2.2, w: 1.6, d: 2.4, r: 0.3 }, 42.4, 1.6, 2), { tone: "mid" }));
  return out.join("");
}
function keyRack() {
  const out = [];
  out.push(S(slab({ x: -101, y: SIDE, w: 38, d: 2.2, r: 0.5 }, 46, 4, 3, 0.3), { tone: "mid" }));
  out.push(D([at([-99, SIDE + 2.2, 48]), at([-65, SIDE + 2.2, 48])], { size: 0.45 }));
  HOOKS.forEach((hx, i) => out.push(hangingKey(hx, i)));
  // rejilla de ventilación cerrada bajo el colgador
  for (const z of [9, 12.5, 16]) out.push(L(sideRect(SIDE, -99, -67, z, z + 1.4), { tone: "faint" }));
  return out.join("");
}

// cerraduras de la cara frontal: la izquierda recibe la llave pública, la derecha la privada
function keyholes() {
  const out = [];
  for (const y of [LANE.pub, LANE.priv]) {
    const c = [FACE, y, KEY_Z];
    out.push(L(k.sideRing(c, 7.6, "x", P, 48), { tone: "lo" }));
    out.push(L(k.sideRing(c, 5.4, "x", P, 40), { tone: "mid" }));
    out.push(L(faceRect(FACE, y - 0.9, y + 0.9, KEY_Z - 3, KEY_Z + 3.5), { tone: "hi" }));
    out.push(D([[y - 6.4, KEY_Z + 6.4], [y + 6.4, KEY_Z - 6.4]].map(([yy, z]) => at([FACE, yy, z])), { size: 0.4 }));
  }
  return out.join("");
}

function hinges() {
  const out = [];
  for (const z of [20, 48]) {
    out.push(S(k.cylinder(FACE + 1.2, 32.4, 1.7, z, 9, P, 20), { tone: "mid" }));
    out.push(L(k.sideArc(FACE + 1.2, 32.4, 1.7, z + 4.5, P, 12), { tone: "faint" }));
  }
  return out.join("");
}

// ventana del cuentakilómetros: bisel, hueco oscuro y separadores entre tambores
function counterBezel() {
  const out = [];
  out.push(S(slab({ x: FACE, y: -17, w: 1.6, d: 34, r: 0.6 }, 44, 16, 3, 0.3), { tone: "mid" }));
  out.push(`<path class="ca-well" d="${faceRect(GLASS_X, WIN.y0, WIN.y1, WIN.z0, WIN.z1)}"/>`);
  out.push(D([[-15.6, 45.4], [15.6, 45.4], [-15.6, 58.6], [15.6, 58.6]].map(([y, z]) => at([GLASS_X, y, z])), { size: 0.4 }));
  return out.join("");
}
function counterGlass() {
  const out = [];
  // sombra del tambor (arriba y abajo) para que lean como cilindros
  out.push(`<path class="ca-drum-shade" d="${faceRect(GLASS_X, WIN.y0, WIN.y1, WIN.z1 - 2, WIN.z1)}"/>`);
  out.push(`<path class="ca-drum-shade" d="${faceRect(GLASS_X, WIN.y0, WIN.y1, WIN.z0, WIN.z0 + 1.6)}"/>`);
  out.push(L([7, 0, -7].map((y) => k.segment([GLASS_X, y, WIN.z0], [GLASS_X, y, WIN.z1], P)).join(""), { tone: "lo" }));
  out.push(L(faceRect(GLASS_X, WIN.y0, WIN.y1, WIN.z0, WIN.z1), { tone: "mid" }));
  return out.join("");
}
const digitMatrix = (i, z) => k.sideMatrix([GLASS_X, DRUM_Y[i]], z, P, "right");
const WIN_CLIP = faceRect(GLASS_X, WIN.y0, WIN.y1, WIN.z0, WIN.z1);
function digits() {
  const out = [];
  for (let i = 0; i < 4; i++) {
    out.push(`<g data-drum="${i}">`);
    for (let j = 0; j < 2; j++) out.push(k.faceTextSvg(digitMatrix(i, DIGIT_BASE + j * DIGIT_H), "0", { size: 8, tone: "lit", anchor: "middle" }));
    out.push(`</g>`);
  }
  return `<clipPath id="ca-win"><path d="${WIN_CLIP}"/></clipPath><g clip-path="url(#ca-win)">${out.join("")}</g>`;
}

// candado: placa, grapa, arco (se mueve) y cuerpo
function hasp() {
  const out = [];
  out.push(S(slab({ x: FACE, y: -7.5, w: 1, d: 15, r: 0.5 }, 31, 11, 2, 0.2), { tone: "mid" }));
  out.push(D([at([FACE + 1, -5.8, 40.4]), at([FACE + 1, 5.8, 40.4])], { size: 0.4 }));
  out.push(S(slab({ x: FACE + 1, y: -1.6, w: 1.4, d: 3.2, r: 0.4 }, 34, 6, 2, 0.2), { tone: "mid" }));
  return out.join("");
}
function shackle() {
  const out = [];
  const x = FACE + 2.4;
  out.push(S(slab({ x, y: -5.4, w: 2, d: 2, r: 0.6 }, 26, 13.4, 2), { tone: "hi", crease: "lo" }));
  out.push(S(slab({ x, y: 3.4, w: 2, d: 2, r: 0.6 }, 26, 13.4, 2), { tone: "hi", crease: "lo" }));
  out.push(S(slab({ x, y: -5.4, w: 2, d: 10.8, r: 0.9 }, 39.4, 2.2, 3, 0.2), { tone: "hi", crease: "lo" }));
  return out.join("");
}
function lockBody() {
  const out = [];
  out.push(S(slab(LOCK_BODY, 16, 14, 4, 0.5), { tone: "hi", crease: "lo", inner: L(k.sideSeam(LOCK_BODY, 27.6, P, 4), { tone: "lo" }) }));
  const fx = LOCK_BODY.x + LOCK_BODY.w;
  out.push(L(k.sideRing([fx, 0, 21.6], 2.2, "x", P, 24), { tone: "lo" }));
  out.push(L(faceRect(fx, -0.5, 0.5, 19.6, 22.6), { tone: "mid" }));
  out.push(D([at([fx, -4.6, 18]), at([fx, 4.6, 18])], { size: 0.4 }));
  return out.join("");
}

// tapa: ranura del buzón con trampilla, pilotos y la prensa de lacre
function slot() {
  return L(k.planOutline({ x: -84, y: 6, w: 6, d: 22, r: 1.2 }, TOP, P, 3), { tone: "lo" });
}
function flap() {
  const out = [S(slab({ x: -85.5, y: 4.5, w: 9, d: 25, r: 1.4 }, TOP, 1.2, 3, 0.3), { tone: "mid" })];
  out.push(L(k.lineOnTop([-81, 4.5], [-81, 29.5], TOP + 1.2, P), { tone: "faint" }));
  out.push(D([at([-83.6, 6.4, TOP + 1.2]), at([-83.6, 27.1, TOP + 1.2])], { size: 0.4 }));
  return out.join("");
}
const LAMPS = [[-62, 14], [-62, 24]];
function lamps() {
  const out = [];
  for (const [x, y] of LAMPS) {
    out.push(S(k.cylinder(x, y, 2.8, TOP, 1.4, P, 24), { tone: "mid" }));
    out.push(S(k.cylinder(x, y, 2, TOP + 1.4, 2, P, 24), { tone: "hi", crease: "lo" }));
  }
  return out.join("");
}
const lampLit = (i) => {
  const [x, y] = LAMPS[i];
  return S(k.cylinder(x, y, 2, TOP + 1.4, 2, P, 24), { tone: "hi", lit: true }) + D([at([x, y, TOP + 3.4])], { size: 0.9, tone: "hi" });
};
function sealDisc() {
  const [x, y] = SEAL;
  const out = [S(k.cylinder(x, y, 5.6, TOP, 1.4, P, 40, 0.4), { tone: "hi", crease: "lo", lit: true })];
  out.push(L(k.ring(x, y, 3.6, TOP + 1.4, P, 32), { tone: "lo" }));
  // marca en relieve: dos diámetros que acaban en el anillo
  const r = 3.6 / Math.SQRT2;
  out.push(L(k.lineOnTop([x - r, y - r], [x + r, y + r], TOP + 1.4, P) + k.lineOnTop([x - r, y + r], [x + r, y - r], TOP + 1.4, P), { tone: "lo" }));
  return out.join("");
}
function pressColumn() {
  const out = [];
  out.push(S(slab({ x: -104, y: -34, w: 16, d: 12, r: 1 }, TOP, 3, 3, 0.4), { tone: "mid" }));
  out.push(D([at([-102, -32, TOP + 3]), at([-90, -32, TOP + 3]), at([-102, -24, TOP + 3]), at([-90, -24, TOP + 3])], { size: 0.45 }));
  out.push(S(slab({ x: -100, y: -32, w: 8, d: 7, r: 0.8 }, TOP + 3, 35, 3, 0.4), { tone: "mid", inner: L(k.sideSeam({ x: -100, y: -32, w: 8, d: 7, r: 0.8 }, TOP + 20, P, 3), { tone: "faint" }) }));
  return out.join("");
}
// émbolo del sello, construido arriba y bajado en z
function ram() {
  const [x, y] = SEAL;
  const lo = TOP + 1.4 + RAM_DROP;
  const out = [];
  out.push(S(k.cylinder(x, y, 2.2, lo + 4, 34, P, 24), { tone: "mid", crease: "none" }));
  out.push(L(k.sideArc(x, y, 2.2, lo + 16, P, 12), { tone: "faint" }));
  out.push(S(k.cylinder(x, y, 3.4, lo + 3, 1.2, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 5, lo, 3, P, 40, 0.4), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, 5, lo + 0.4, lo + 3, 40, P, 0.3), { tone: "lo" }));
  return out.join("");
}
function pressArm() {
  const out = [];
  const arm = { x: -101.5, y: -33, w: 11, d: 27, r: 1.2 };
  out.push(S(slab(arm, TOP + 38, 6, 3, 0.5), { tone: "mid" }));
  out.push(D([at([-96, -30.5, TOP + 44]), at([-96, -8.5, TOP + 44])], { size: 0.45 }));
  // guía del émbolo: casquillo sobre el brazo
  out.push(S(k.cylinder(SEAL[0], SEAL[1], 3.2, TOP + 44, 2.4, P, 28), { tone: "mid" }));
  out.push(L(k.ring(SEAL[0], SEAL[1], 2.2, TOP + 46.4, P, 20), { tone: "lo" }));
  // pomo de mando en el costado del brazo
  out.push(S(slab({ x: -97.2, y: -6, w: 2.4, d: 2.4, r: 0.5 }, TOP + 40, 2, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(-96, -2.4, 2.4, TOP + 38.6, 4.8, P, 20), { tone: "mid" }));
  out.push(L(k.knurl(-96, -2.4, 2.4, TOP + 38.6, TOP + 43.4, 16, P), { tone: "lo" }));
  return out.join("");
}

// ---------------------------------------------------------------- carriles, carros y llaves
// Las piezas del carril se construyen con y = 0 y la punta de la llave en x = 0.
const sh = (plan, oy, dx = 0) => ({ ...plan, x: plan.x + dx, y: plan.y + oy });
function rails(oy) {
  const out = [];
  for (const y of [-11, 7]) {
    out.push(S(slab(sh({ x: -2, y, w: 90, d: 4, r: 1 }, oy, SHIFT), 0, 3, 3, 0.4), { tone: "mid" }));
    out.push(D([4, 44, 82].map((x) => at([x + SHIFT, y + 2 + oy, 3])), { size: 0.4 }));
  }
  for (const x of [-6, 88]) {
    out.push(S(slab(sh({ x, y: -12, w: 4, d: 24, r: 1 }, oy, SHIFT), 0, 7, 3, 0.5), { tone: "mid" }));
    out.push(D([at([x + 2 + SHIFT, oy - 9, 7]), at([x + 2 + SHIFT, oy + 9, 7])], { size: 0.45 }));
  }
  return out.join("");
}

// dientes: la pública tiene un corte y la privada otro (por eso no se cambian)
const CUTS = { pub: [1.4, 2.6, 1.8, 3, 2.2], priv: [3, 1.2, 2.8, 1.6, 3.2] };
function blade(oy, cuts, lit) {
  const out = [];
  cuts.forEach((h, i) => out.push(S(slab({ x: 3 + i * 4, y: oy - 0.8, w: 2.4, d: 1.6, r: 0.2 }, KEY_Z - 2 - h, h, 2), { tone: "hi", crease: "lo", lit })));
  out.push(S(slab({ x: 0, y: oy - 0.8, w: 25, d: 1.6, r: 0.3 }, KEY_Z - 2, 4, 2, 0.2), { tone: "hi", crease: "lo", lit }));
  return out.join("");
}
// cabeza de la llave pública: redonda con un ojo, como las del colgador
function bowPub(oy) {
  const out = [];
  out.push(S(slab({ x: 25, y: oy - 1.3, w: 2, d: 2.6, r: 0.3 }, KEY_Z - 3.5, 7, 2), { tone: "hi", crease: "lo" }));
  out.push(S(slab({ x: 27, y: oy - 0.9, w: 10, d: 1.8, r: 0.5 }, KEY_Z - 6, 12, 2, 0.3), { tone: "hi", crease: "lo" }));
  out.push(L(k.sideRing([31, oy + 0.9, KEY_Z], 2, "y", P, 24), { tone: "lo" }));
  return out.join("");
}
// cabeza de la llave privada: más grande, con dos ojos, la pieza que hay que vigilar
function bowPriv(oy) {
  const out = [];
  out.push(S(slab({ x: 25, y: oy - 1.4, w: 2.4, d: 2.8, r: 0.3 }, KEY_Z - 4, 8, 2), { tone: "hi", crease: "lo", lit: true }));
  out.push(S(slab({ x: 27.4, y: oy - 1, w: 9.6, d: 2, r: 0.6 }, KEY_Z - 8, 16, 2, 0.3), { tone: "hi", crease: "lo", lit: true }));
  out.push(L(k.sideRing([30.6, oy + 1, KEY_Z + 4], 1.6, "y", P, 20) + k.sideRing([30.6, oy + 1, KEY_Z - 4], 1.6, "y", P, 20), { tone: "lo" }));
  return out.join("");
}
function carriage(oy) {
  const out = [];
  const plate = { x: 28, y: oy - 14, w: 34, d: 28, r: 2 };
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(plate, 2), 3, 0.1, P)}" style="filter:blur(3px)"/>`);
  out.push(S(slab(plate, 3, 5, 4, 0.6), { tone: "mid" }));
  out.push(L(k.lineOnTop([plate.x, oy], [plate.x + plate.w, oy], 8, P), { tone: "faint" }));
  for (const [x, y] of byDepth([[30, -13], [54, -13], [30, 7.5], [54, 7.5]])) {
    out.push(S(slab({ x, y: y + oy, w: 6, d: 5.5, r: 0.8 }, 8, 2.4, 2, 0.3), { tone: "mid" }));
    out.push(D([at([x + 3, y + oy + 2.75, 10.4])], { size: 0.45 }));
  }
  out.push(S(slab({ x: 35, y: oy - 3.5, w: 7, d: 7, r: 0.8 }, 8, 10, 2, 0.3), { tone: "mid" }));
  out.push(S(slab({ x: 56, y: oy - 4, w: 6, d: 8, r: 0.8 }, 8, 10, 2, 0.3), { tone: "mid" }));
  out.push(D([at([59, oy - 2, 18]), at([59, oy + 2, 18])], { size: 0.45 }));
  out.push(S(slab({ x: 62, y: oy - 1.5, w: 64, d: 3, r: 1.4 }, 12.5, 3, 4, 0.3), { tone: "mid" }));
  return out.join("");
}
function chuck(oy) {
  const out = [];
  out.push(S(slab({ x: 34, y: oy - 5, w: 10, d: 10, r: 1 }, 18, 17, 3, 0.5), { tone: "mid" }));
  out.push(L(k.lineOnTop([34, oy], [44, oy], 35, P), { tone: "faint" }));
  out.push(D([at([36.4, oy - 2.6, 35]), at([41.6, oy + 2.6, 35])], { size: 0.45 }));
  out.push(S(slab({ x: 37.8, y: oy + 5, w: 2.4, d: 2.2, r: 0.5 }, 25, 3, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(39, oy + 8.4, 2.2, 24, 5, P, 20), { tone: "mid" }));
  out.push(L(k.knurl(39, oy + 8.4, 2.2, 24, 29, 16, P), { tone: "lo" }));
  return out.join("");
}
// el recorte que oculta la parte de la llave que ya está dentro de la cerradura
const keyClip = (oy) => hull(k.boxCorners({ x: FACE, y: oy - 3, w: 400, d: 6 }, 10, 44).map((p) => at(p)));

function cylinderUnit(oy) {
  const out = [];
  const body = sh({ x: 93, y: -9, w: 41, d: 18, r: 1.6 }, oy, SHIFT);
  for (const x of [97, 124]) out.push(S(slab(sh({ x, y: -12, w: 6, d: 24, r: 0.8 }, oy, SHIFT), 0, 4, 2, 0.3), { tone: "mid" }));
  out.push(`<path class="iso-halo" d="${k.haloOf(body, 3, 0.1, P)}" style="filter:blur(3px)"/>`);
  out.push(S(slab(sh({ x: 89, y: -10.5, w: 4, d: 21, r: 1 }, oy, SHIFT), 2.5, 23, 3, 0.4), { tone: "mid" }));
  out.push(S(slab(body, 4, 20, 4, 0.5), { tone: "mid", inner: L(k.sideSeam(body, 14, P, 4), { tone: "faint" }) }));
  out.push(S(slab(sh({ x: 134, y: -10.5, w: 4, d: 21, r: 1 }, oy, SHIFT), 2.5, 23, 3, 0.4), { tone: "mid" }));
  const X = (x) => x + SHIFT;
  out.push(D([at([X(91), oy + 8.5, 25.5]), at([X(91), oy - 8.5, 25.5]), at([X(136), oy + 8.5, 25.5]), at([X(136), oy - 8.5, 25.5])], { size: 0.45 }));
  out.push(D([at([X(138), oy + 7, 22]), at([X(138), oy - 7, 22]), at([X(138), oy + 7, 6]), at([X(138), oy - 7, 6])], { size: 0.45 }));
  for (const x of [100, 127]) {
    out.push(S(k.cylinder(X(x), oy, 2.4, 24, 2, P, 20), { tone: "mid" }));
    out.push(S(k.cylinder(X(x), oy, 1.6, 26, 2, P, 20), { tone: "mid" }));
  }
  return out.join("");
}

function lane(name) {
  const oy = LANE[name];
  const priv = name === "priv";
  // en el carril privado hay dos llaves: la buena y una copia de la pública (la equivocada)
  const keys = priv
    ? `<g data-key="right">${blade(oy, CUTS.priv, true)}</g><g data-key="wrong" style="display:none">${blade(oy, CUTS.pub, false)}</g>`
    : blade(oy, CUTS.pub, false);
  const bows = priv ? `<g data-key="right">${bowPriv(oy)}</g><g data-key="wrong" style="display:none">${bowPub(oy)}</g>` : bowPub(oy);
  return [
    rails(oy),
    `<g data-part="carriage-${name}" transform="${k.translateAlong(P, [REST, 0, 0])}"><clipPath id="ca-clip-${name}"><path data-hold d="${keyClip(oy)}"/></clipPath><g clip-path="url(#ca-clip-${name})">${keys}</g>${carriage(oy)}${bows}${chuck(oy)}</g>`,
    cylinderUnit(oy),
  ].join("");
}

// ---------------------------------------------------------------- figura
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Una caja fuerte de banco que explica el cifrado asimétrico. Tiene dos cerraduras en la cara frontal. La de la izquierda recibe la llave pública, de la que cuelgan copias en el costado para quien quiera: al meterla, el candado se cierra de golpe y el contador pasa del mensaje m al cifrado c. La de la derecha solo acepta la llave privada, que es única: al meterla, el candado se abre y el contador vuelve a m. Con una copia de la pública en su lugar, el candado no se abre. Para firmar, la llave privada baja la prensa de lacre de la tapa y deja un sello; luego la pública lo comprueba.",
  body: [
    base(),
    box(),
    keyRack(),
    hinges(),
    keyholes(),
    counterBezel(),
    digits(),
    counterGlass(),
    hasp(),
    `<g data-part="shackle" transform="${k.translateAlong(P, [0, 0, SHACKLE_LIFT])}">${shackle()}</g>`,
    lockBody(),
    slot(),
    `<g data-part="flap">${flap()}</g>`,
    lamps(),
    `<g data-part="lamp0" opacity="0">${lampLit(0)}</g>`,
    `<g data-part="lamp1" opacity="0">${lampLit(1)}</g>`,
    pressColumn(),
    `<g data-part="seal" opacity="0">${sealDisc()}</g>`,
    `<g data-part="ram">${ram()}</g>`,
    pressArm(),
    lane("priv"),
    lane("pub"),
  ],
});

// ---------------------------------------------------------------- panel
const panel = `
<div class="ca-panel">
  <div class="ca-controls">
    <label class="ca-control" for="ca-msg">
      <span class="ca-head"><span class="ca-no">1</span>Mensaje (una letra o un número de 0 a ${KEYS.n - 1})</span>
      <span class="ca-row"><input id="ca-msg" type="text" value="A" maxlength="4" autocomplete="off" spellcheck="false"><output id="ca-msg-out">m = 65</output></span>
    </label>
    <div class="ca-control" role="radiogroup" aria-label="Modo">
      <span class="ca-head"><span class="ca-no">2</span>Modo</span>
      <span class="ca-seg">
        <button type="button" role="radio" aria-checked="true" data-mode="cifrar">Cifrar → descifrar</button>
        <button type="button" role="radio" aria-checked="false" data-mode="firmar">Firmar → verificar</button>
      </span>
    </div>
    <label class="ca-control ca-check" for="ca-wrong">
      <span class="ca-head"><span class="ca-no">3</span>Llave equivocada</span>
      <span class="ca-row"><input id="ca-wrong" type="checkbox"><span>Usar una copia de la <b>pública</b> donde va la <b>privada</b></span></span>
    </label>
  </div>
  <div class="ca-steps" aria-live="polite">
    <div class="ca-step" data-step="0"><span class="ca-what" data-text="t0">1 · Cerrar con la llave pública</span><span class="ca-math" data-text="m0">c = 65^17 mod 3233 = 2790</span></div>
    <div class="ca-step" data-step="1"><span class="ca-what" data-text="t1">2 · Abrir con la llave privada</span><span class="ca-math" data-text="m1">m = 2790^2753 mod 3233 = 65</span></div>
    <div class="ca-step ca-verdict" data-step="2"><span class="ca-what">Resultado</span><span class="ca-math" data-text="v">abre: vuelve a salir m = 65</span></div>
  </div>
  <div class="ca-keys">
    <div class="ca-key"><span class="ca-what">Primos secretos</span><span class="ca-num">p = ${KEYS.p}, q = ${KEYS.q}</span></div>
    <div class="ca-key"><span class="ca-what">Módulo (público)</span><span class="ca-num">n = p·q = ${KEYS.n}</span></div>
    <div class="ca-key"><span class="ca-what">φ(n) = (p−1)(q−1)</span><span class="ca-num">${KEYS.phi}</span></div>
    <div class="ca-key"><span class="ca-what">Llave pública</span><span class="ca-num">(n, e) = (${KEYS.n}, ${KEYS.e})</span></div>
    <div class="ca-key"><span class="ca-what">Llave privada</span><span class="ca-num">(n, d) = (${KEYS.n}, ${KEYS.d})</span></div>
    <div class="ca-key"><span class="ca-what">Comprobación</span><span class="ca-num">e·d mod φ = ${(KEYS.e * KEYS.d) % KEYS.phi}</span></div>
  </div>
  <div class="ca-actions"><button type="button" data-act="run">Repetir</button><button type="button" data-act="pause">Pausa</button></div>
</div>`;

const CSS = `
.ca-well{fill:var(--anatomy-shade-0);stroke:none}
.ca-drum-shade{fill:var(--anatomy-shade-0);opacity:.7;stroke:none}
.iso-face-text[data-tone="lit"]{fill:var(--anatomy-lit)}
.ca-panel{margin-top:22px;display:grid;gap:18px;font-size:13px;color:var(--anatomy-text)}
.ca-controls{display:grid;grid-template-columns:1fr 1.2fr 1.2fr;gap:16px;align-items:start}
.ca-control{display:grid;gap:7px}
.ca-head{display:flex;align-items:baseline;gap:6px;color:var(--anatomy-strong)}
.ca-no{display:inline-grid;place-items:center;flex:none;width:16px;height:16px;border-radius:50%;box-shadow:0 0 0 1px var(--anatomy-mid);font:10px/1 var(--anatomy-mono);color:var(--anatomy-text)}
.ca-row{display:flex;align-items:center;gap:8px}
.ca-row b{color:var(--anatomy-strong);font-weight:500}
.ca-control input[type=text]{width:72px;font:14px/1 var(--anatomy-mono);padding:7px 8px;border:0;border-radius:0;background:var(--anatomy-card);color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-mid)}
.ca-control output{font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-text);font-variant-numeric:tabular-nums}
.ca-check input{accent-color:var(--anatomy-hi);width:15px;height:15px;flex:none}
.ca-seg{display:flex;gap:0}
.ca-seg button,.ca-actions button{font:12px/1.2 var(--anatomy-mono);padding:8px 10px;border:0;border-radius:0;background:var(--anatomy-card);color:var(--anatomy-text);box-shadow:0 0 0 1px var(--anatomy-mid);cursor:pointer}
.ca-seg button+button{margin-left:1px}
.ca-seg button[aria-checked=true]{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-hi);position:relative}
.ca-actions{display:flex;gap:8px}
.ca-actions button{color:var(--anatomy-strong)}
.ca-seg button:hover,.ca-actions button:hover{box-shadow:0 0 0 1px var(--anatomy-hi)}
.ca-panel button:focus-visible,.ca-panel input:focus-visible,.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:4px}
.ca-steps,.ca-keys{display:grid;gap:1px;background:var(--anatomy-faint);box-shadow:0 0 0 1px var(--anatomy-faint)}
.ca-steps{grid-template-columns:1fr 1fr 1fr}
.ca-keys{grid-template-columns:repeat(3,1fr)}
.ca-step,.ca-key{display:grid;gap:3px;padding:10px 12px;background:var(--anatomy-card);align-content:start}
.ca-step{transition:box-shadow .3s}
.ca-step[data-on]{box-shadow:inset 0 0 0 1px var(--anatomy-hi)}
.ca-what{font-size:11.5px;color:var(--anatomy-muted)}
.ca-math{font:500 14px/1.35 var(--anatomy-mono);color:var(--anatomy-strong);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.ca-num{font:13px/1.35 var(--anatomy-mono);color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
.ca-verdict[data-ok="1"] .ca-math{color:var(--anatomy-green)}
.ca-verdict[data-ok="0"] .ca-math{color:var(--anatomy-red)}
@media (max-width:560px){.iso-stage{overflow:hidden}.iso-stage svg{width:112%;margin:-4% 0 -3% -6%}.ca-controls,.ca-steps{grid-template-columns:1fr}.ca-keys{grid-template-columns:1fr 1fr}}
`;

// ---------------------------------------------------------------- comportamiento en vivo
const live = `
${strip("rsa.mjs")}
const P = ${JSON.stringify(P)};
const REST = ${REST}, IN = ${IN}, SHACKLE_LIFT = ${SHACKLE_LIFT}, RAM_DROP = ${RAM_DROP};
const GLASS_X = ${GLASS_X}, DRUM_Y = ${JSON.stringify(DRUM_Y)}, DIGIT_BASE = ${DIGIT_BASE}, DIGIT_H = ${DIGIT_H};
const digitMatrix = ${digitMatrix.toString().replace(/k\./g, "")};

const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const q = (sel) => svg.querySelector(sel);
const parts = {
  pub: q('[data-part="carriage-pub"]'), priv: q('[data-part="carriage-priv"]'),
  shackle: q('[data-part="shackle"]'), flap: q('[data-part="flap"]'), ram: q('[data-part="ram"]'), seal: q('[data-part="seal"]'),
  lamps: [q('[data-part="lamp0"]'), q('[data-part="lamp1"]')],
};
const drums = [...svg.querySelectorAll("[data-drum]")].map((g) => [...g.querySelectorAll("text")]);
const keyRight = [...svg.querySelectorAll('[data-key="right"]')];
const keyWrong = [...svg.querySelectorAll('[data-key="wrong"]')];
const readout = document.querySelector("[data-readout]");
const msgIn = document.getElementById("ca-msg");
const msgOut = document.getElementById("ca-msg-out");
const wrongIn = document.getElementById("ca-wrong");
const modeBtns = [...document.querySelectorAll("[data-mode]")];
const stepEls = [...document.querySelectorAll("[data-step]")];
const texts = Object.fromEntries([...document.querySelectorAll("[data-text]")].map((el) => [el.dataset.text, el]));
const still = matchMedia("(prefers-reduced-motion: reduce)");
const write = (el, text) => { if (el.textContent !== text) el.textContent = text; };
const pad4 = (v) => String(v).padStart(4, "0");

// --- estado ----------------------------------------------------------------
const state = { text: "A", mode: "cifrar", wrong: false, msg: messageOf("A"), plan: null };
// guion de un recorrido (segundos): llave 1, pausa, llave 2, resultado, pausa larga
const T = { push1: [0.4, 1.9], push2: [3.2, 4.7], end: 9 };
let t = 0;
let shown = 0;          // número que enseñan los tambores
let drumPos = [0, 0, 0, 0], drumFrom = [0, 0, 0, 0], drumTo = [0, 0, 0, 0], rollAt = -1;
const ROLL = 0.9;

function plan() {
  state.msg = messageOf(state.text);
  state.plan = run(state.msg.m, state.mode, state.wrong);
}
function setDrums(value, roll) {
  const ds = pad4(value).split("").map(Number);
  if (!roll) { drumPos = ds.slice(); drumFrom = ds.slice(); drumTo = ds.slice(); rollAt = -1; }
  else {
    drumFrom = drumPos.map((p) => p % 10);
    // cada tambor gira hacia delante hasta su cifra, con una vuelta de más
    drumTo = ds.map((d, i) => drumFrom[i] + ((d - drumFrom[i] + 10) % 10) + 10);
    rollAt = t;
  }
  shown = value;
}

// --- posiciones -------------------------------------------------------------
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp = (x) => Math.min(1, Math.max(0, x));
// u en [0,1]: entra (0-0.45), gira en la cerradura (0.45-0.55), sale (0.55-1)
function strokeAt(u) {
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.45) return inOut(u / 0.45);
  if (u < 0.55) return 1;
  return 1 - inOut((u - 0.55) / 0.45);
}
const uOf = ([a, b]) => clamp((t - a) / (b - a));
const CONTACT = 0.45;
// muelle amortiguado para el arco y la trampilla (golpe seco)
const snap = (s) => (s <= 0 ? 0 : 1 - Math.exp(-9 * s) * Math.cos(16 * s));

function poseAt() {
  const p = state.plan;
  const u1 = uOf(T.push1), u2 = uOf(T.push2);
  const c1 = (T.push1[0] + CONTACT * (T.push1[1] - T.push1[0])); // instante en que la llave 1 llega al fondo
  const c2 = (T.push2[0] + CONTACT * (T.push2[1] - T.push2[0]));
  const first = p.mode === "cifrar" ? "pub" : "priv";
  const second = first === "pub" ? "priv" : "pub";
  const pose = { pub: 0, priv: 0, shackle: 1, flap: 0, ram: 0, seal: 0, lamp: [0, 0], knock: 0 };
  pose[first] = strokeAt(u1);
  pose[second] = strokeAt(u2);
  if (p.mode === "cifrar") {
    // 1: el arco cae de golpe (cerrar con la pública); 2: solo se abre si m' = m
    const closed = t >= c1 ? 1 - snap(t - c1) : 1;
    pose.shackle = closed;
    pose.flap = t >= c1 ? Math.exp(-6 * (t - c1)) * Math.abs(Math.sin(10 * (t - c1))) : 0;
    if (t >= c2) {
      if (p.ok) pose.shackle = snap((t - c2) * 0.8);
      else pose.knock = Math.exp(-7 * (t - c2)) * Math.sin(40 * (t - c2));
    }
  } else {
    pose.shackle = 1;
    // 1: la llave privada baja la prensa y deja el sello
    const r = t - c1;
    pose.ram = r < 0 ? 0 : r < 0.25 ? inOut(r / 0.25) : r < 0.5 ? 1 : r < 1.1 ? 1 - inOut((r - 0.5) / 0.6) : 0;
    pose.seal = r >= 0.25 ? 1 : 0;
  }
  if (t >= c2) {
    const g = Math.exp(-Math.max(0, t - c2 - 3.2) / 0.5);
    pose.lamp[p.ok ? 0 : 1] = g;
  }
  return { pose, c1, c2 };
}

const ax = (v) => axisVector(P, v);
let lastPhase = -1;
function draw() {
  const p = state.plan;
  const { pose, c1, c2 } = poseAt();
  const phase = t < c1 ? 0 : t < c2 ? 1 : 2;
  if (phase !== lastPhase) {
    if (phase === 0) setDrums(p.m, false);
    if (phase === 1) setDrums(p.steps[0].to, !still.matches);
    if (phase === 2) setDrums(p.steps[1].to, !still.matches);
    lastPhase = phase;
  }
  for (const name of ["pub", "priv"]) {
    const tip = REST + (IN - REST) * pose[name] + (name === "priv" && p.mode === "cifrar" ? pose.knock * 0.8 : 0) + (name === "pub" && p.mode === "firmar" ? 0 : 0);
    const off = ax([tip, 0, 0]);
    parts[name].setAttribute("transform", "translate(" + off[0].toFixed(2) + " " + off[1].toFixed(2) + ")");
    holdStill(parts[name], off);
  }
  parts.shackle.setAttribute("transform", translateAlong(P, [0, 0, pose.shackle * SHACKLE_LIFT]));
  parts.flap.setAttribute("transform", translateAlong(P, [0, 0, pose.flap * 2.4]));
  parts.ram.setAttribute("transform", translateAlong(P, [0, 0, -pose.ram * RAM_DROP]));
  parts.seal.setAttribute("opacity", String(pose.seal));
  parts.lamps.forEach((el, i) => el.setAttribute("opacity", pose.lamp[i].toFixed(2)));
  // tambores
  if (rollAt >= 0) {
    for (let i = 0; i < 4; i++) {
      const s = clamp((t - rollAt - i * 0.08) / ROLL);
      drumPos[i] = drumFrom[i] + (drumTo[i] - drumFrom[i]) * inOut(s);
    }
    if (t - rollAt > ROLL + 0.4) { drumPos = drumTo.map((v) => v % 10); rollAt = -1; }
  }
  drums.forEach((pair, i) => {
    const pos = drumPos[i];
    const a = Math.floor(pos + 1e-6);
    const f = pos - a;
    write(pair[0], String(((a % 10) + 10) % 10));
    write(pair[1], String((((a + 1) % 10) + 10) % 10));
    pair[0].setAttribute("transform", digitMatrix(i, DIGIT_BASE + f * DIGIT_H));
    pair[1].setAttribute("transform", digitMatrix(i, DIGIT_BASE + (f - 1) * DIGIT_H));
  });
  // panel y lectura
  stepEls.forEach((el, i) => (i === phase - 1 || (phase === 0 && i === 0) ? el.setAttribute("data-on", "") : el.removeAttribute("data-on")));
  const s0 = p.steps[0], s1 = p.steps[1];
  const name0 = p.mode === "cifrar" ? "c" : "s";
  write(readout, "m = " + p.m + " · " + name0 + " = " + (phase >= 1 ? s0.to : "?") + " · " + (phase >= 2 ? (p.ok ? (p.mode === "cifrar" ? "abre" : "firma válida") : (p.mode === "cifrar" ? "no abre" : "firma falsa")) : "llave " + (phase === 0 ? (p.mode === "cifrar" ? "pública" : (state.wrong ? "pública" : "privada")) : (p.mode === "cifrar" ? (state.wrong ? "pública" : "privada") : "pública"))));
}

function describeSteps() {
  const p = state.plan;
  const s0 = p.steps[0], s1 = p.steps[1];
  const m = p.m;
  if (p.mode === "cifrar") {
    write(texts.t0, "1 · Cerrar con la llave pública (e = " + s0.exp + ")");
    write(texts.m0, "c = " + m + "^" + s0.exp + " mod 3233 = " + s0.to);
    write(texts.t1, "2 · Abrir con la llave " + (state.wrong ? "pública (equivocada, e = " : "privada (d = ") + s1.exp + ")");
    write(texts.m1, "m' = " + s0.to + "^" + s1.exp + " mod 3233 = " + s1.to);
    write(texts.v, p.ok ? (state.wrong ? "abre por casualidad: este m es un punto fijo" : "abre: m' = m = " + m) : "no abre: " + s1.to + " ≠ " + m);
  } else {
    write(texts.t0, "1 · Firmar con la llave " + (state.wrong ? "pública (equivocada, e = " : "privada (d = ") + s0.exp + ")");
    write(texts.m0, "s = " + m + "^" + s0.exp + " mod 3233 = " + s0.to);
    write(texts.t1, "2 · Verificar con la llave pública (e = " + s1.exp + ")");
    write(texts.m1, "v = " + s0.to + "^" + s1.exp + " mod 3233 = " + s1.to);
    write(texts.v, p.ok ? (state.wrong ? "válida por casualidad: este m es un punto fijo" : "firma válida: v = m = " + m) : "firma falsa: " + s1.to + " ≠ " + m);
  }
  stepEls[2].dataset.ok = p.ok ? "1" : "0";
  const label = state.msg.label;
  write(msgOut, (state.msg.ok ? "" : "fuera de rango, se usa ") + "m = " + m + (label.startsWith("«") ? " " + label : ""));
  keyRight.forEach((el) => (el.style.display = state.wrong ? "none" : ""));
  keyWrong.forEach((el) => (el.style.display = state.wrong ? "" : "none"));
  stage.setAttribute("aria-valuetext", (p.mode === "cifrar" ? "Cifrar y descifrar" : "Firmar y verificar") + ", m = " + m + (state.wrong ? ", con la llave equivocada" : ""));
}

function restart() {
  plan();
  describeSteps();
  t = still.matches ? T.push2[1] : 0;
  lastPhase = -1;
  draw();
  if (still.matches) { lastPhase = -1; setDrums(state.plan.steps[1].to, false); draw(); }
  run_();
}

let frame = 0, last = 0, visible = false, paused = false;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (!paused && !still.matches) {
    t += dt;
    if (t > T.end) { t = 0; lastPhase = -1; }
  }
  draw();
  frame = visible && !paused && !still.matches ? requestAnimationFrame(tick) : 0;
}
function run_() { if (!frame && visible && !paused && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } }
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run_(); }, { rootMargin: "120px 0px" }).observe(stage);

msgIn.addEventListener("input", () => { state.text = msgIn.value || "A"; restart(); });
wrongIn.addEventListener("change", () => { state.wrong = wrongIn.checked; restart(); });
modeBtns.forEach((b) => b.addEventListener("click", () => {
  state.mode = b.dataset.mode;
  modeBtns.forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  restart();
}));
document.querySelector('[data-act="run"]').addEventListener("click", restart);
const pauseBtn = document.querySelector('[data-act="pause"]');
function togglePause() { paused = !paused; pauseBtn.textContent = paused ? "Seguir" : "Pausa"; run_(); }
pauseBtn.addEventListener("click", togglePause);
stage.addEventListener("keydown", (event) => {
  if (event.key === " ") { event.preventDefault(); togglePause(); }
  else if (event.key === "Enter") { event.preventDefault(); restart(); }
  else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    modeBtns[event.key === "ArrowLeft" ? 0 : 1].click();
  } else if (event.key === "w" || event.key === "W") { wrongIn.checked = !wrongIn.checked; wrongIn.dispatchEvent(new Event("change")); }
});
still.addEventListener("change", restart);
restart();
`;

const body = k.plateHtml({
  fig: "Fig 2",
  title: "Cifrado asimétrico",
  hint: "Elige mensaje, modo y llave",
  readout: "m = 65 · c = ? · llave pública",
  keys: [
    { mark: "lit", label: "Llave privada: única, solo la tiene el dueño" },
    { mark: "raised", label: "Llave pública: copias colgadas para cualquiera" },
    { mark: "edge", label: "Contador: el número que hay dentro (m, c o s)" },
  ],
  caption:
    `Un buzón de banco con candado de golpe. Cualquiera coge una llave pública (n = ${KEYS.n}, e = ${KEYS.e}) del costado, la mete en la cerradura izquierda y el candado se cierra: el contador pasa de m a c = m^e mod n. Solo la llave privada (d = ${KEYS.d}) lo abre: c^d mod n devuelve m. Una copia de la pública no sirve: c^e mod n da otro número y el candado sigue cerrado. Para firmar se usa al revés: la privada baja la prensa y deja un sello s = m^d mod n, y cualquiera lo verifica con la pública (s^e mod n = m). Es RSA de juguete con p = ${KEYS.p} y q = ${KEYS.q}: los números son ciertos, pero el RSA real usa un n de 2048 bits o más (más de 600 cifras), imposible de factorizar a mano.`,
  body: `<div class="iso-stage" tabindex="0" role="group" aria-label="Caja fuerte de cifrado asimétrico. Enter: repetir. Espacio: pausa. Flechas: modo. W: llave equivocada.">${svg}</div>${panel}`,
});

const html = k
  .pageHtml({ title: "Cifrado asimétrico", theme, body, script: strip("kit/iso-kit.mjs") + live })
  .replace('<html lang="en">', '<html lang="es">')
  .replace("</style>", CSS + "</style>");
const name = theme === "light" ? "cifrado-asimetrico-light.html" : "cifrado-asimetrico.html";
writeFileSync(join(HERE, name), html);
console.log("wrote", name);
