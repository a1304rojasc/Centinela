// Figura: una función hash (SHA-256) hecha máquina de banco, una "troqueladora de resumen".
// Genera hash.html (oscuro) o hash-light.html (con --light).
//   node build.mjs
//   node build.mjs --light
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const kitScript = () => readFileSync(join(HERE, "kit", "iso-kit.mjs"), "utf8").replace(/^export /gm, "");

// ---------------------------------------------------------------- el modelo: SHA-256 (FIPS 180-4)
// Implementación propia y síncrona. La misma función se copia tal cual en la página,
// y aquí se comprueba contra node:crypto antes de escribir nada.
function sha256(bytes) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  // relleno: 0x80, ceros y la longitud en bits (64 bits, big-endian) hasta un múltiplo de 64 bytes
  const n = bytes.length;
  const blocks = Math.floor((n + 8) / 64) + 1;
  const m = new Uint8Array(blocks * 64);
  m.set(bytes);
  m[n] = 0x80;
  const bits = n * 8;
  for (let i = 0; i < 8; i++) m[m.length - 1 - i] = Math.floor(bits / 2 ** (8 * i)) & 0xff;
  const rotr = (x, r) => (x >>> r) | (x << (32 - r));
  const w = new Uint32Array(64);
  for (let b = 0; b < blocks; b++) {
    for (let t = 0; t < 16; t++) {
      const o = b * 64 + t * 4;
      w[t] = (m[o] << 24) | (m[o + 1] << 16) | (m[o + 2] << 8) | m[o + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b2, c, d, e, f, g, h] = H;
    // 64 rondas por bloque
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b2) ^ (a & c) ^ (b2 & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b2; b2 = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b2) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  const out = new Uint8Array(32);
  H.forEach((v, i) => { out[i * 4] = v >>> 24; out[i * 4 + 1] = (v >>> 16) & 0xff; out[i * 4 + 2] = (v >>> 8) & 0xff; out[i * 4 + 3] = v & 0xff; });
  return { digest: out, blocks };
}
{
  const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
  const tests = ["", "abc", "Centinela", "Centinelo", "x".repeat(55), "y".repeat(56), "z".repeat(64), "ñandú 🔒 contraseña", "a".repeat(1000)];
  for (const t of tests) {
    const bytes = new TextEncoder().encode(t);
    const mine = hex(sha256(bytes).digest);
    const ref = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    if (mine !== ref) throw new Error(`SHA-256 propia no coincide para ${JSON.stringify(t)}: ${mine} ≠ ${ref}`);
  }
}

// ---------------------------------------------------------------- medidas (1 unidad ≈ 1 mm)
const WIDTH = 600;
const HEIGHT = 380;
const AZ = 50;

const PLATE = { x: -134, y: -36, w: 228, d: 88, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;

// bandeja de entrada con la cinta plegada en acordeón: un pliegue = un bloque de 64 bytes
const TRAY = { x: -128, y: -15, w: 36, d: 30, r: 1.4 };
const TRAY_FLOOR = 1.5;
const FOLD = { x: -123, y: -10, w: 28, d: 20, r: 0.6 };
const FOLD_T = 1.2;
const FOLD_MAX = 13;

// canal de la cinta
const TAPE = { x: -96, y: -10, w: 66, d: 20, r: 0 };
const TAPE_T = 0.5;
const PITCH = 2.5; // paso entre columnas (un byte por columna)
const COL0 = -93; // columna del byte 0: la cinta se lee de izquierda a derecha y avanza hacia la prensa
const COLS = 17; // columnas visibles antes de que la cinta pase bajo la prensa
const TRACKS = [-8, -6, -4, 0, 2, 4, 6, 8]; // 8 pistas = 8 bits (bit 7 primero); y = -2 es el arrastre
const SPROCKET = -2;

// prensa
const BODY = { x: -30, y: -26, w: 56, d: 52, r: 2 };
const BODY_H = 36;
const FACE_X = BODY.x + BODY.w; // 26: cara de salida de la tarjeta
const FACE_Y = BODY.y + BODY.d; // 26: cara del canal de recortes
const RAM = [-8, 0];
const RAM_R = 3;
const RAM_LEN = 18;
const RAM_UP = 46; // base del punzón arriba
const RAM_DOWN = 39.3; // base del punzón al golpear (sobre la matriz)
const POSTS = [[-8, -18], [-8, 18]];
const BEAM_Z = 66;
const DIAL = { x: 12, y: -13, r: 8, top: BODY_H + 5 };
const RATCHET = { x: 9, y: 13, r: 7 };
const CRANK_LEN = 7.5;

// bandeja de salida y tarjeta
const OUT = { x: FACE_X, y: -26, w: 58, d: 52, r: 1.4 };
const OUT_H = 4;
const CARD = { x: 32, y: -22, w: 44, d: 44, r: 1.2 };
const CARD_T = 0.6;
const CARD_Z = OUT_H + 2 * CARD_T; // encima de dos tarjetas viejas
const CELL = 5;
const CELL_X0 = CARD.x + 2;
const CELL_Y0 = CARD.y + 2;
const CARD_IN = -46; // desplazamiento en x de la tarjeta nueva cuando aún está dentro

// cubo de recortes
const BIN = { x: -24, y: 29, w: 42, d: 17, r: 1 };
const BIN_H = 6;
const CHIPS = 30;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [POSTS[0][0] - 6, -24, BEAM_Z + 5], [POSTS[0][0] + 6, 24, BEAM_Z + 5]],
  WIDTH,
  HEIGHT,
  { pad: 24, azimuth: AZ },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const slab = (plan, z, h, steps = 3, bevel = 0) => k.slabOf(plan, z, h, P, steps, bevel);
const cyl = (x, y, r, z, h, steps = 32, bevel = 0) => k.cylinder(x, y, r, z, h, P, steps, bevel);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const halo = (plan, z, blur = 3) => `<path class="iso-halo" d="${k.haloOf(k.insetPlan(plan, -2), z, 0.1, P)}" style="filter:blur(${blur}px)"/>`;
const faceRect = (x, y0, y1, z0, z1) => k.pathOf([at([x, y0, z0]), at([x, y1, z0]), at([x, y1, z1]), at([x, y0, z1])], true);
const faceRectY = (y, x0, x1, z0, z1) => k.pathOf([at([x0, y, z0]), at([x1, y, z0]), at([x1, y, z1]), at([x0, y, z1])], true);

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
    out.push(S(cyl(x, y, 7, -PLATE_H - FOOT_H, 1.6, 28), { tone: "lo" }));
    out.push(S(cyl(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, 28), { tone: "mid" }));
  }
  out.push(S(slab(PLATE, -PLATE_H, PLATE_H, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // regla bajo la cinta: una marca por byte, una mayor cada 8 bytes
  const strip = { x: -95, y: 15.5, w: 45, d: 6, r: 1 };
  out.push(S(slab(strip, 0, 0.6), { tone: "lo", crease: "none" }));
  const minor = [];
  const major = [];
  for (let j = 0; j < COLS; j++) {
    const x = COL0 + j * PITCH;
    (j % 8 === 0 ? major : minor).push(k.lineOnTop([x, strip.y], [x, strip.y + (j % 8 === 0 ? 3.6 : 2)], 0.6, P));
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 4.5, 0.6]), at([strip.x + strip.w - 4, strip.y + 4.5, 0.6])], { size: 0.45 }));
  // placa de características con la única etiqueta grabada
  const label = { x: -128, y: 24, w: 30, d: 13, r: 1.2 };
  out.push(S(slab(label, 0, 0.8, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.4), 0.8, P, 4), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 4, label.y + 5.4], 0.8, P, "x"), "SHA-256", { size: 3, tone: "mid" }));
  out.push(L([k.lineOnTop([label.x + 4, label.y + 8], [label.x + 22, label.y + 8], 0.8, P), k.lineOnTop([label.x + 4, label.y + 9.8], [label.x + 16, label.y + 9.8], 0.8, P)].join(""), { tone: "lo", free: true }));
  out.push(D([at([label.x + 2.2, label.y + 6.5, 0.8]), at([label.x + label.w - 2.2, label.y + 6.5, 0.8])], { size: 0.45 }));
  return out.join("");
}

// ---------------------------------------------------------------- bandeja de entrada
function trayBack() {
  const out = [halo(TRAY, 0)];
  out.push(S(slab(TRAY, 0, TRAY_FLOOR, 3, 0.4), { tone: "mid" }));
  out.push(S(slab({ x: TRAY.x, y: TRAY.y, w: TRAY.w, d: 1.4, r: 0.4 }, TRAY_FLOOR, 18, 2, 0.3), { tone: "mid" }));
  out.push(S(slab({ x: TRAY.x, y: TRAY.y + 1.4, w: 1.4, d: TRAY.d - 1.4, r: 0.4 }, TRAY_FLOOR, 18, 2, 0.3), { tone: "mid" }));
  // ventana de nivel en la pared trasera (cerrada)
  out.push(L(faceRect(TRAY.x + 1.4, -6, 6, 4, 16), { tone: "faint" }));
  return out.join("");
}
const foldSvg = (i) => {
  const z = TRAY_FLOOR + i * FOLD_T;
  const shift = i % 2 ? 0.5 : 0;
  const plan = { ...FOLD, x: FOLD.x + shift };
  return S(slab(plan, z, FOLD_T, 2, 0.15), { tone: "hi", crease: "lo" }) + L(k.lineOnTop([plan.x + 4, 0], [plan.x + plan.w - 4, 0], z + FOLD_T, P), { tone: "faint", free: true });
};
function trayFront() {
  const out = [];
  out.push(S(slab({ x: TRAY.x + 1.4, y: TRAY.y + TRAY.d - 1.4, w: TRAY.w - 1.4, d: 1.4, r: 0.4 }, TRAY_FLOOR, 3, 2, 0.3), { tone: "mid" }));
  out.push(D([at([TRAY.x + 4, TRAY.y + TRAY.d, 3]), at([TRAY.x + TRAY.w - 4, TRAY.y + TRAY.d, 3])], { size: 0.45 }));
  return out.join("");
}

// ---------------------------------------------------------------- cinta y canal
const railPlan = (y) => ({ x: TAPE.x + 4, y, w: TAPE.w - 4, d: 2.4, r: 0.6 });
function rail(y) {
  return S(slab(railPlan(y), 0, 3, 2, 0.3), { tone: "mid" }) + D([-86, -62, -38].map((x) => at([x, y + 1.2, 3])), { size: 0.4 });
}
function tape() {
  const out = [];
  out.push(S(slab(TAPE, 0, TAPE_T, 2), { tone: "hi", crease: "lo" }));
  // tramo que sube al pliegue inferior de la bandeja
  out.push(S(slab({ x: FOLD.x + FOLD.w, y: TAPE.y, w: TAPE.x - FOLD.x - FOLD.w, d: TAPE.d, r: 0 }, TRAY_FLOOR, TAPE_T, 2), { tone: "hi", crease: "lo" }));
  // agujeros de arrastre: los tiene la cinta en todas las columnas
  const sprockets = [];
  for (let x = COL0; x < -31; x += PITCH) sprockets.push(at([x, SPROCKET, TAPE_T]));
  out.push(D(sprockets, { size: 0.35, tone: "mid" }));
  return out.join("");
}
function bridge() {
  const out = [];
  const plan = { x: -48, y: -14, w: 6, d: 28, r: 0.8 };
  out.push(S(slab({ x: -47, y: -13.8, w: 4, d: 2.8, r: 0.4 }, 3, 2.5, 2), { tone: "mid" }));
  out.push(S(slab({ x: -47, y: 11, w: 4, d: 2.8, r: 0.4 }, 3, 2.5, 2), { tone: "mid" }));
  out.push(S(slab(plan, 5.5, 2.4, 3, 0.4), { tone: "mid" }));
  out.push(D([at([-45, -12.4, 7.9]), at([-45, 12.4, 7.9])], { size: 0.45 }));
  return out.join("");
}

// ---------------------------------------------------------------- prensa
function pressBody() {
  const out = [halo(BODY, 0, 4)];
  out.push(S(slab({ ...k.insetPlan(BODY, -1.5), r: 3 }, 0, 3, 4, 0.5), { tone: "mid" }));
  const seam = k.sideSeam(BODY, 14, P, 4);
  out.push(S(slab(BODY, 3, BODY_H - 3, 4, 0.8), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(BODY, 3.5), BODY_H, P, 4), { tone: "faint" }));
  out.push(D(k.corners(BODY, 2).map(([x, y]) => at([x, y, BODY_H])), { size: 0.45 }));
  // ranura de salida de la tarjeta en la cara x
  out.push(L(faceRect(FACE_X, -23.5, 23.5, CARD_Z - 0.6, CARD_Z + 1.6), { tone: "hi" }));
  // tapa de registro atornillada en la cara x
  out.push(L(faceRect(FACE_X, -16, 16, 18, 31), { tone: "lo" }));
  out.push(D([[-14, 29], [14, 29], [-14, 20], [14, 20]].map(([y, z]) => at([FACE_X, y, z])), { size: 0.45 }));
  // ranura de los recortes en la cara y
  out.push(L(faceRectY(FACE_Y, -20, 14, 13, 15.5), { tone: "hi" }));
  out.push(D([[-26, 30], [22, 30], [-26, 20], [22, 20]].map(([x, z]) => at([x, FACE_Y, z])), { size: 0.45 }));
  return out.join("");
}
function chuteLip() {
  return S(slab({ x: -21, y: FACE_Y, w: 36, d: 4, r: 0.4 }, 12, 1, 2, 0.2), { tone: "mid" });
}
function die() {
  const [x, y] = RAM;
  const out = [S(cyl(x, y, 6.5, BODY_H, 1.2, 40, 0.3), { tone: "mid" })];
  out.push(S(cyl(x, y, 5, BODY_H + 1.2, 2.1, 40, 0.3), { tone: "mid" }));
  out.push(L(k.ring(x, y, RAM_R + 0.4, BODY_H + 3.3, P, 32), { tone: "hi" }));
  out.push(D(k.circleRing(x, y, 5.8, 4).map(([px, py]) => at([px, py, BODY_H + 1.2])), { size: 0.4 }));
  return out.join("");
}
function post([x, y]) {
  const out = [S(cyl(x, y, 3.4, BODY_H, 2, 28, 0.3), { tone: "mid" })];
  out.push(S(cyl(x, y, 2.1, BODY_H + 2, BEAM_Z - BODY_H - 2, 24), { tone: "mid" }));
  return out.join("");
}
function dial() {
  const { x, y, r, top } = DIAL;
  const out = [S(cyl(x, y, r, BODY_H, 5, 64, 0.6), { tone: "hi", crease: "lo" })];
  out.push(L(k.knurl(x, y, r, top - 2.2, top, 64, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, r, top - 2.2, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, r - 1.4, top, P, 64), { tone: "lo" }));
  // 64 marcas, una por ronda; mayor cada 8
  const ticks = k.radialTicks(x, y, r - 1.6, 64, 8, top, [0.8, 1.8], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.ring(x, y, 1, top, P, 16), { tone: "mid" }));
  return out.join("");
}
const dialNeedle = (share) => {
  const a = share * Math.PI * 2;
  return k.lineOnTop([DIAL.x - Math.sin(a) * 1.8, DIAL.y + Math.cos(a) * 1.8], [DIAL.x + Math.sin(a) * 5.6, DIAL.y - Math.cos(a) * 5.6], DIAL.top + 0.15, P);
};
// punzón construido con la base en z = 0 y movido en z
function ram() {
  const [x, y] = RAM;
  return S(cyl(x, y, RAM_R, 0, RAM_LEN, 32, 0.4), { tone: "hi", crease: "lo", lit: true });
}
function sleeve() {
  const [x, y] = RAM;
  const out = [S(cyl(x, y, 4.6, 54, 2, 32, 0.4), { tone: "mid" })];
  out.push(S(cyl(x, y, 4, 56, BEAM_Z - 56, 32), { tone: "mid" }));
  return out.join("");
}
function beam() {
  const plan = { x: RAM[0] - 6, y: -23, w: 12, d: 46, r: 1.4 };
  const out = [S(slab(plan, BEAM_Z, 5, 4, 0.6), { tone: "mid" })];
  out.push(L(k.planOutline(k.insetPlan(plan, 2.2), BEAM_Z + 5, P, 3), { tone: "faint" }));
  out.push(D(POSTS.map(([x, y]) => at([x, y, BEAM_Z + 5])), { size: 0.5 }));
  out.push(L(POSTS.map(([x, y]) => k.ring(x, y, 1.8, BEAM_Z + 5, P, 16)).join(""), { tone: "lo" }));
  return out.join("");
}
function ratchet() {
  const { x, y, r } = RATCHET;
  const out = [S(cyl(x, y, r, BODY_H, 3, 48, 0.4), { tone: "mid" })];
  // dientes del trinquete: estrías en el canto
  out.push(L(k.knurl(x, y, r, BODY_H + 0.4, BODY_H + 3, 24, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(x, y, r - 1.4, BODY_H + 3, P, 48), { tone: "faint" }));
  out.push(S(cyl(x, y, 3, BODY_H + 3, 2, 24, 0.3), { tone: "mid" }));
  return out.join("");
}
// trinquete: el pestillo solo deja girar la rueda en un sentido
function pawl() {
  const out = [];
  const pin = [20.5, 21];
  const [x0, y0] = pin;
  const a = Math.atan2(RATCHET.y + RATCHET.r * 0.72 - y0, RATCHET.x + RATCHET.r * 0.72 - x0);
  const len = Math.hypot(RATCHET.x + RATCHET.r * 0.72 - x0, RATCHET.y + RATCHET.r * 0.72 - y0);
  const nx = -Math.sin(a) * 0.9;
  const ny = Math.cos(a) * 0.9;
  const tip = [x0 + Math.cos(a) * len, y0 + Math.sin(a) * len];
  const ring = [[x0 + nx, y0 + ny], [tip[0] + nx * 0.4, tip[1] + ny * 0.4], [tip[0] - nx * 0.4, tip[1] - ny * 0.4], [x0 - nx, y0 - ny]];
  out.push(S(k.extrude(ring, BODY_H, 2.2, P), { tone: "hi", crease: "lo" }));
  out.push(S(cyl(pin[0], pin[1], 1.5, BODY_H, 3.2, 20), { tone: "mid" }));
  out.push(D([at([pin[0], pin[1], BODY_H + 3.2])], { size: 0.45 }));
  // muelle del pestillo: un taco con su tornillo
  out.push(S(slab({ x: 15.5, y: 22.4, w: 3, d: 2.4, r: 0.4 }, BODY_H, 2.6, 2), { tone: "mid" }));
  return out.join("");
}
// manivela, rehecha en cada fotograma
const crankSvg = (angle) => {
  const { x, y } = RATCHET;
  const z = BODY_H + 5;
  const ex = x + Math.cos(angle) * CRANK_LEN;
  const ey = y + Math.sin(angle) * CRANK_LEN;
  const nx = -Math.sin(angle) * 1.3;
  const ny = Math.cos(angle) * 1.3;
  const ring = [[x + nx - Math.cos(angle) * 1.5, y + ny - Math.sin(angle) * 1.5], [ex + nx, ey + ny], [ex - nx, ey - ny], [x - nx - Math.cos(angle) * 1.5, y - ny - Math.sin(angle) * 1.5]];
  return (
    solidSvg(extrude(ring, z, 1.4, P), { tone: "mid" }) +
    solidSvg(cylinder(x, y, 1.6, z + 1.4, 0.8, P, 16), { tone: "mid" }) +
    solidSvg(cylinder(ex, ey, 1.5, z + 1.4, 6, P, 20, 0.3), { tone: "hi", crease: "lo" })
  );
};

// ---------------------------------------------------------------- bandeja de salida y tarjetas
function outTrayBack() {
  const out = [halo(OUT, 0)];
  out.push(S(slab(OUT, 0, OUT_H, 4, 0.5), { tone: "mid" }));
  out.push(S(slab({ x: OUT.x + 2, y: OUT.y, w: OUT.w - 6, d: 2, r: 0.5 }, OUT_H, 2.4, 2, 0.3), { tone: "mid" }));
  // dos tarjetas viejas en la pila
  out.push(S(slab({ ...CARD, x: CARD.x + 0.8 }, OUT_H, CARD_T, 2, 0.15), { tone: "hi", crease: "lo" }));
  out.push(S(slab({ ...CARD, x: CARD.x - 0.4 }, OUT_H + CARD_T, CARD_T, 2, 0.15), { tone: "hi", crease: "lo" }));
  return out.join("");
}
function outTrayFront() {
  const out = [];
  out.push(S(slab({ x: OUT.x + 2, y: OUT.y + OUT.d - 2, w: OUT.w - 6, d: 2, r: 0.5 }, OUT_H, 2.4, 2, 0.3), { tone: "mid" }));
  out.push(S(slab({ x: OUT.x + OUT.w - 4, y: OUT.y, w: 4, d: OUT.d, r: 0.8 }, OUT_H, 5, 3, 0.4), { tone: "mid" }));
  out.push(D([at([OUT.x + OUT.w - 2, OUT.y + 6, OUT_H + 5]), at([OUT.x + OUT.w - 2, OUT.y + OUT.d - 6, OUT_H + 5])], { size: 0.45 }));
  // regla en la parada: 8 columnas de casillas
  const t = [];
  for (let c = 0; c <= 8; c++) t.push(k.segment([OUT.x + OUT.w, CELL_Y0 + c * CELL, OUT_H + 5], [OUT.x + OUT.w, CELL_Y0 + c * CELL, OUT_H + (c % 4 === 0 ? 2.2 : 3.4)], P));
  out.push(L(t.join(""), { tone: "lo" }));
  return out.join("");
}
// posiciones de los 256 agujeros: casilla i (dígito hex i), bits de mayor a menor en 2×2
const holeXY = (bit) => {
  const cell = bit >> 2;
  const sub = bit & 3;
  const row = cell >> 3;
  const col = cell & 7;
  return [CELL_X0 + col * CELL + (sub & 1 ? 3.5 : 1.5), CELL_Y0 + row * CELL + (sub & 2 ? 3.5 : 1.5)];
};
function cardSvg(name, z) {
  const out = [S(slab(CARD, z, CARD_T, 2, 0.15), { tone: "hi", crease: "lo" })];
  const top = z + CARD_T;
  const grid = [];
  for (let c = 1; c < 8; c++) grid.push(k.lineOnTop([CELL_X0 + c * CELL, CARD.y], [CELL_X0 + c * CELL, CARD.y + CARD.d], top, P));
  for (let r = 1; r < 8; r++) grid.push(k.lineOnTop([CARD.x, CELL_Y0 + r * CELL], [CARD.x + CARD.w, CELL_Y0 + r * CELL], top, P));
  out.push(L(grid.join(""), { tone: "faint" }));
  out.push(L(k.planOutline({ x: CELL_X0, y: CELL_Y0, w: 8 * CELL, d: 8 * CELL, r: 0 }, top, P, 1), { tone: "lo" }));
  // esquina cortada de orientación
  out.push(L(k.lineOnTop([CARD.x, CARD.y + 1.8], [CELL_X0, CARD.y + 1.8], top, P), { tone: "lo" }));
  const holes = [];
  for (let b = 0; b < 256; b++) {
    const [px, py] = at([...holeXY(b), top]);
    holes.push(`<circle class="hs-hole" data-b="${b}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="0.85"/>`);
  }
  out.push(`<g data-holes="${name}">${holes.join("")}</g>`);
  return out.join("");
}

// ---------------------------------------------------------------- cubo de recortes
function binBack() {
  const out = [halo(BIN, 0)];
  out.push(S(slab(BIN, 0, 1.2, 3, 0.3), { tone: "mid" }));
  out.push(S(slab({ x: BIN.x, y: BIN.y, w: BIN.w, d: 1.2, r: 0.3 }, 1.2, BIN_H, 2, 0.2), { tone: "mid" }));
  out.push(S(slab({ x: BIN.x, y: BIN.y + 1.2, w: 1.2, d: BIN.d - 1.2, r: 0.3 }, 1.2, BIN_H, 2, 0.2), { tone: "mid" }));
  return out.join("");
}
// recortes: trocitos de cinta, en posiciones fijas pero repartidas con un generador determinista
const chips = (() => {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const list = [];
  for (let i = 0; i < CHIPS; i++) {
    const cx = BIN.x + 3.5 + rnd() * (BIN.w - 7);
    const cy = BIN.y + 3.5 + rnd() * (BIN.d - 7);
    const a = rnd() * Math.PI;
    const z = 1.2 + rnd() * 0.8;
    list.push({ cx, cy, a, z });
  }
  return byDepth(list.map((c) => [c.cx, c.cy, c])).map((p) => p[2]);
})();
const chipSvg = ({ cx, cy, a, z }) => {
  const u = [Math.cos(a), Math.sin(a)];
  const v = [-u[1], u[0]];
  const hw = 1.3;
  const hd = 0.75;
  const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [cx + u[0] * hw * i + v[0] * hd * j, cy + u[1] * hw * i + v[1] * hd * j]);
  return S(k.extrude(ring, z, 0.4, P), { tone: "hi", crease: "lo" });
};
function binFront() {
  const out = [];
  out.push(S(slab({ x: BIN.x + 1.2, y: BIN.y + BIN.d - 1.2, w: BIN.w - 1.2, d: 1.2, r: 0.3 }, 1.2, BIN_H, 2, 0.2), { tone: "mid" }));
  out.push(S(slab({ x: BIN.x + BIN.w - 1.2, y: BIN.y + 1.2, w: 1.2, d: BIN.d - 2.4, r: 0.3 }, 1.2, BIN_H, 2, 0.2), { tone: "mid" }));
  // asa del cubo
  out.push(S(slab({ x: BIN.x + BIN.w / 2 - 6, y: BIN.y + BIN.d, w: 12, d: 1.6, r: 0.6 }, 3, 2, 3, 0.3), { tone: "mid" }));
  out.push(D([at([BIN.x + BIN.w / 2 - 4.5, BIN.y + BIN.d + 1.6, 4]), at([BIN.x + BIN.w / 2 + 4.5, BIN.y + BIN.d + 1.6, 4])], { size: 0.45 }));
  return out.join("");
}

// ---------------------------------------------------------------- figura
const folds = Array.from({ length: FOLD_MAX }, (_, i) => `<g data-fold="${i}" style="display:none">${foldSvg(i)}</g>`).join("");
const CARD_CLIP = hull(k.boxCorners({ x: FACE_X, y: -40, w: 200, d: 80 }, 0, 20).map((p) => at(p)));

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Una troqueladora de banco que explica una función hash SHA-256. A la izquierda, una bandeja guarda la cinta de entrada plegada en acordeón: un pliegue por cada bloque de 64 bytes. La cinta lleva perforados los bytes del texto, ocho agujeros por columna, y entra en una prensa. Arriba, un punzón golpea en rondas, un contador marca las 64 rondas de cada bloque y una manivela con trinquete solo gira en un sentido. Por delante caen los recortes de la cinta a un cubo: la entrada no sale de la máquina. Por la derecha sale siempre una tarjeta de 64 casillas con 4 agujeros cada una, 256 bits; los agujeros que cambiaron respecto a la tarjeta anterior se iluminan.",
  body: [
    base(),
    trayBack(),
    `<g data-part="folds">${folds}</g>`,
    trayFront(),
    rail(-12.4),
    tape(),
    `<g data-part="bytes"></g>`,
    rail(10),
    bridge(),
    pressBody(),
    die(),
    post(POSTS[0]),
    dial(),
    `<path data-part="needle" class="iso-line" data-tone="hi" data-free="start" d="${dialNeedle(0)}" style="stroke-width:0.9"/>`,
    `<g data-part="ram" transform="${k.translateAlong(P, [0, 0, RAM_UP])}">${ram()}</g>`,
    sleeve(),
    post(POSTS[1]),
    beam(),
    ratchet(),
    pawl(),
    `<g data-part="crank"></g>`,
    chuteLip(),
    binBack(),
    `<g data-part="chips">${chips.map((c, i) => `<g data-chip="${i}" style="display:none">${chipSvg(c)}</g>`).join("")}</g>`,
    binFront(),
    outTrayBack(),
    `<g data-part="card-prev">${cardSvg("prev", CARD_Z)}</g>`,
    `<clipPath id="hs-cardclip"><path d="${CARD_CLIP}"/></clipPath>`,
    `<g clip-path="url(#hs-cardclip)"><g data-part="card-new" style="display:none" transform="${k.translateAlong(P, [CARD_IN, 0, 0])}">${cardSvg("new", CARD_Z + CARD_T)}</g></g>`,
    outTrayFront(),
  ],
});

// ---------------------------------------------------------------- panel de controles
const panel = `
<div class="hs-panel">
  <label class="hs-field" for="hs-in">
    <span class="hs-head">Entrada (cualquier longitud)<output id="hs-len">0 bytes</output></span>
    <textarea id="hs-in" rows="2" spellcheck="false" autocomplete="off">Centinela</textarea>
  </label>
  <div class="hs-actions">
    <button type="button" data-act="flip">Cambiar 1 carácter</button>
    <button type="button" data-act="same">Misma entrada otra vez</button>
    <span class="hs-note" data-note aria-live="polite"></span>
  </div>
  <div class="hs-hex" aria-label="Resumen SHA-256 en hexadecimal"><span class="hs-hex-head">Resumen SHA-256 (64 dígitos hex = 256 bits)</span><code data-hex></code></div>
  <div class="hs-counters" aria-live="off">
    <div class="hs-counter"><span class="hs-num" data-count="bytes">0</span><span class="hs-what">bytes de entrada</span></div>
    <div class="hs-counter"><span class="hs-num" data-count="blocks">1</span><span class="hs-what">bloques de 64 bytes</span></div>
    <div class="hs-counter"><span class="hs-num" data-count="rounds">64</span><span class="hs-what">rondas (64 por bloque)</span></div>
    <div class="hs-counter"><span class="hs-num" data-count="flip">—</span><span class="hs-what">bits que cambiaron</span></div>
  </div>
</div>`;

const CSS = `
.hs-panel{margin-top:22px;display:grid;gap:16px;font-size:13px;color:var(--anatomy-text)}
.hs-field{display:grid;gap:6px}
.hs-head{display:flex;align-items:baseline;gap:6px;color:var(--anatomy-strong)}
.hs-head output{margin-left:auto;font-family:var(--anatomy-mono);font-size:11.5px;color:var(--anatomy-text);font-variant-numeric:tabular-nums}
.hs-field textarea{font:13px/1.45 var(--anatomy-mono);padding:8px 10px;border:0;border-radius:0;resize:vertical;background:var(--anatomy-card);color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-mid)}
.hs-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.hs-actions button{font:12px/1 var(--anatomy-mono);padding:8px 12px;border:0;border-radius:0;background:var(--anatomy-card);color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-mid);cursor:pointer}
.hs-actions button:hover{box-shadow:0 0 0 1px var(--anatomy-hi)}
.hs-note{font:11.5px/1.3 var(--anatomy-mono);color:var(--anatomy-muted)}
.hs-actions button:focus-visible,.hs-field textarea:focus-visible,.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:4px}
.hs-hex{display:grid;gap:6px}
.hs-hex-head{color:var(--anatomy-strong)}
.hs-hex code{font:13px/1.6 var(--anatomy-mono);color:var(--anatomy-text);letter-spacing:.02em}
.hs-hex mark{background:none;color:var(--anatomy-strong);box-shadow:inset 0 -1px 0 var(--anatomy-hi)}
.hs-hex .hs-grp{display:inline-block;white-space:nowrap;margin-right:.5em}
.hs-counters{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--anatomy-faint);box-shadow:0 0 0 1px var(--anatomy-faint)}
.hs-counter{display:grid;gap:2px;padding:10px 12px;background:var(--anatomy-card)}
.hs-num{font:500 20px/1.1 var(--anatomy-mono);color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
.hs-what{font-size:11.5px;color:var(--anatomy-muted)}
.hs-hole{fill:var(--anatomy-dot);opacity:.1;transition:opacity .25s}
.hs-hole[data-on]{opacity:.5}
.hs-hole[data-flip]{fill:var(--anatomy-lit);opacity:1;stroke:var(--anatomy-lit);stroke-width:.5}
.hs-hole[data-flip]:not([data-on]){fill:var(--anatomy-paper)}
.hs-byte circle{fill:var(--anatomy-dot);opacity:.8}
.hs-byte[data-hot] circle{fill:var(--anatomy-lit);opacity:1}
@media (max-width:560px){.hs-counters{grid-template-columns:repeat(2,1fr)}}
`;

// ---------------------------------------------------------------- comportamiento en vivo
const live = `
const P = ${JSON.stringify(P)};
const COL0 = ${COL0}, PITCH = ${PITCH}, COLS = ${COLS}, TRACKS = ${JSON.stringify(TRACKS)}, TAPE_T = ${TAPE_T};
const RAM_UP = ${RAM_UP}, RAM_DOWN = ${RAM_DOWN}, CARD_IN = ${CARD_IN}, FOLD_MAX = ${FOLD_MAX}, CHIPS = ${CHIPS};
const DIAL = ${JSON.stringify(DIAL)}, RATCHET = ${JSON.stringify(RATCHET)}, CRANK_LEN = ${CRANK_LEN}, BODY_H = ${BODY_H};
const sha256 = ${sha256.toString()};
const dialNeedle = ${dialNeedle.toString().replace(/k\./g, "")};
const crankSvg = ${crankSvg.toString()};

const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const q = (sel) => svg.querySelector(sel);
const foldEls = [...svg.querySelectorAll("[data-fold]")];
const chipEls = [...svg.querySelectorAll("[data-chip]")];
const bytesEl = q('[data-part="bytes"]');
const needle = q('[data-part="needle"]');
const ramEl = q('[data-part="ram"]');
const crankEl = q('[data-part="crank"]');
const cardNew = q('[data-part="card-new"]');
const holesPrev = [...q('[data-holes="prev"]').children];
const holesNew = [...q('[data-holes="new"]').children];
const input = document.getElementById("hs-in");
const lenOut = document.getElementById("hs-len");
const hexEl = document.querySelector("[data-hex]");
const noteEl = document.querySelector("[data-note]");
const readout = document.querySelector("[data-readout]");
const counts = Object.fromEntries([...document.querySelectorAll("[data-count]")].map((el) => [el.dataset.count, el]));
const still = matchMedia("(prefers-reduced-motion: reduce)");
const write = (el, text) => { if (el.textContent !== text) el.textContent = text; };
const enc = new TextEncoder();
const hexOf = (u8) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
const bitOf = (u8, i) => (u8[i >> 3] >> (7 - (i & 7))) & 1;

// --- estado ----------------------------------------------------------------
let shown = null;      // { digest, hex, blocks } de la tarjeta en la bandeja
let hot = new Set();   // posiciones de byte (en la cinta) que acaban de cambiar
let cycle = null;      // { u, dur, blocks, next, flips }
let crankAngle = -Math.PI / 2, ramZ = RAM_UP, needleShare = 0, cardX = CARD_IN;

function setHoles(list, digest, flips) {
  list.forEach((el, i) => {
    if (bitOf(digest, i)) el.setAttribute("data-on", ""); else el.removeAttribute("data-on");
    if (flips && flips[i]) el.setAttribute("data-flip", ""); else el.removeAttribute("data-flip");
  });
}
function drawTape(bytes) {
  const out = [];
  for (let j = 0; j < Math.min(COLS, bytes.length); j++) {
    const x = COL0 + j * PITCH;
    const pts = [];
    for (let t = 0; t < 8; t++) if ((bytes[j] >> (7 - t)) & 1) {
      const [px, py] = iso([x, TRACKS[t], TAPE_T], P);
      pts.push('<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="0.75"/>');
    }
    out.push('<g class="hs-byte"' + (hot.has(j) ? " data-hot" : "") + ">" + pts.join("") + "</g>");
  }
  bytesEl.innerHTML = out.join("");
}
function hexHtml(hex, flips) {
  let html = "";
  for (let i = 0; i < 64; i++) {
    let changed = false;
    if (flips) for (let b = 0; b < 4; b++) changed = changed || flips[i * 4 + b];
    html += (i % 8 === 0 ? '<span class="hs-grp">' : "") + (changed ? "<mark>" + hex[i] + "</mark>" : hex[i]) + (i % 8 === 7 ? "</span>" : "");
  }
  return html;
}

// --- una pasada de la máquina ---------------------------------------------
function run(text, note) {
  const bytes = enc.encode(text);
  const { digest, blocks } = sha256(bytes);
  const hex = hexOf(digest);
  const flips = shown ? Array.from({ length: 256 }, (_, i) => bitOf(digest, i) !== bitOf(shown.digest, i)) : null;
  const flipCount = flips ? flips.filter(Boolean).length : null;
  drawTape(bytes);
  foldEls.forEach((el, i) => { el.style.display = i < Math.min(blocks, FOLD_MAX) ? "" : "none"; });
  write(lenOut, bytes.length + (bytes.length === 1 ? " byte" : " bytes"));
  write(counts.bytes, String(bytes.length));
  write(counts.blocks, String(blocks));
  write(counts.rounds, String(blocks * 64));
  write(noteEl, note || "");
  const next = { digest, hex, blocks, flips, flipCount };
  if (still.matches || !shown) { land(next); return; }
  // tarjeta nueva dentro de la máquina: perforada con el resumen nuevo, sin marcas
  setHoles(holesNew, digest, null);
  setHoles(holesPrev, shown.digest, null);
  cycle = { u: 0, dur: 0.9 + 0.3 * Math.min(blocks, 4), blocks, next };
  hexEl.style.opacity = "0.35";
  write(readout, "estampando…");
  start();
}
function land(next) {
  shown = next;
  setHoles(holesPrev, next.digest, next.flips);
  cardNew.style.display = "none";
  hexEl.style.opacity = "";
  hexEl.innerHTML = hexHtml(next.hex, next.flips);
  const n = next.flipCount;
  write(counts.flip, n === null ? "—" : n + " / 256");
  write(readout, n === null ? "256 bits · " + next.hex.slice(0, 8) + "…" : n + " de 256 bits cambiaron (" + Math.round((n / 256) * 100) + " %)");
  chipEls.forEach((el, i) => { el.style.display = i < Math.min(CHIPS, 6 + next.blocks * 4) ? "" : "none"; });
  stage.setAttribute("aria-valuetext", n === null ? "Resumen " + next.hex : n + " de 256 bits cambiaron. Resumen " + next.hex);
}

// --- movimiento ------------------------------------------------------------
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v) => Math.min(1, Math.max(0, v));
function pose() {
  if (!cycle) return;
  const u = cycle.u;
  // 0 … 0,72: rondas (el punzón golpea 8 veces por bloque, el contador da una vuelta por bloque)
  const r = clamp(u / 0.72);
  const strokes = 8 * Math.min(cycle.blocks, 4);
  const s = 0.5 - 0.5 * Math.cos(Math.PI * 2 * strokes * r);
  ramZ = RAM_UP - (RAM_UP - RAM_DOWN) * Math.pow(s, 1.6);
  needleShare = r >= 1 ? 0 : (r * Math.min(cycle.blocks, 4)) % 1;
  crankAngle = -Math.PI / 2 + Math.PI * 2 * Math.min(cycle.blocks, 4) * ease(r);
  // 0,72 … 1: sale la tarjeta
  const e = clamp((u - 0.72) / 0.28);
  cardX = CARD_IN * (1 - ease(e));
}
function draw() {
  ramEl.setAttribute("transform", translateAlong(P, [0, 0, ramZ]));
  needle.setAttribute("d", dialNeedle(needleShare));
  crankEl.innerHTML = crankSvg(crankAngle);
  if (cycle) {
    cardNew.style.display = "";
    cardNew.setAttribute("transform", translateAlong(P, [cardX, 0, 0]));
  }
}

let frame = 0, last = 0, visible = false;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (cycle) {
    cycle.u += dt / cycle.dur;
    if (cycle.u >= 1) { cycle.u = 1; pose(); draw(); const next = cycle.next; cycle = null; ramZ = RAM_UP; land(next); }
    else pose();
  }
  draw();
  tour(dt);
  frame = visible && (cycle || touring) ? requestAnimationFrame(tick) : 0;
}
const start = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) start(); }, { rootMargin: "120px 0px" }).observe(stage);

// --- controles ---------------------------------------------------------------
const ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";
function flipOne(text, at) {
  const chars = Array.from(text);
  if (!chars.length) return { text: "a", note: "entrada vacía: añadido «a»", byteAt: 0 };
  const i = at ?? Math.floor(Math.random() * Math.min(chars.length, COLS));
  const old = chars[i];
  const pool = ALPHA.split("").filter((c) => c !== old.toLowerCase());
  const next = at === undefined ? pool[Math.floor(Math.random() * pool.length)] : (old === "a" ? "o" : "a");
  chars[i] = next;
  const byteAt = enc.encode(chars.slice(0, i).join("")).length;
  return { text: chars.join(""), note: "carácter " + (i + 1) + ": «" + old + "» → «" + next + "»", byteAt, next };
}
let typing = 0;
function onInput() {
  stopTour();
  hot = new Set();
  clearTimeout(typing);
  typing = setTimeout(() => run(input.value, ""), 220);
}
input.addEventListener("input", onInput);
function flip(at) {
  const r = flipOne(input.value, at);
  input.value = r.text;
  const w = enc.encode(r.next || "a").length;
  hot = new Set(Array.from({ length: w }, (_, i) => r.byteAt + i));
  run(r.text, r.note);
}
document.querySelector('[data-act="flip"]').addEventListener("click", () => { stopTour(); flip(); });
document.querySelector('[data-act="same"]').addEventListener("click", () => { stopTour(); hot = new Set(); run(input.value, "misma entrada: mismo resumen"); });
stage.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") { event.preventDefault(); stopTour(); flip(); }
});

// --- visita guiada: alterna un solo carácter mientras nadie toca nada ----------
let touring = !still.matches, tourClock = 0, tourFlip = false;
const TOUR_BASE = input.value;
function tour(dt) {
  if (!touring || cycle) return;
  tourClock += dt;
  if (tourClock < 3.6) return;
  tourClock = 0;
  tourFlip = !tourFlip;
  if (tourFlip) { flip(8); return; }
  input.value = TOUR_BASE;
  hot = new Set([8]);
  run(TOUR_BASE, "carácter 9: vuelve a «a»");
}
function stopTour() { touring = false; }

crankEl.innerHTML = crankSvg(crankAngle);
run(input.value, "");
`;

const body = k.plateHtml({
  fig: "Fig 2",
  title: "Función hash",
  hint: "Escribe o cambia 1 carácter",
  readout: "256 bits",
  keys: [
    { mark: "lit", label: "Agujeros iluminados: bits que cambiaron (anillo = pasó a 0)" },
    { mark: "raised", label: "Cinta: los bytes de la entrada, 8 agujeros por byte" },
    { mark: "edge", label: "Contador: 64 rondas por bloque de 64 bytes" },
  ],
  caption:
    "Una función hash SHA-256 hecha máquina. La cinta lleva tu texto perforado byte a byte y se pliega en bloques de 64 bytes, tantos como haga falta: la entrada puede medir lo que quiera. La prensa mezcla cada bloque en 64 rondas y siempre estampa la misma tarjeta: 64 casillas hex de 4 agujeros, 256 bits. La misma entrada da la misma tarjeta; cambiar un solo carácter voltea cerca de la mitad de los agujeros (efecto avalancha). La manivela tiene trinquete y la cinta acaba picada en el cubo: de la tarjeta no se puede volver al texto. El cálculo es SHA-256 de verdad, hecho en esta página.",
  body: `<div class="iso-stage" tabindex="0" role="button" aria-label="Troqueladora de resumen SHA-256. Intro o espacio: cambiar un carácter.">${svg}</div>${panel}`,
});

const html = k
  .pageHtml({ title: "Función hash", theme, body, script: kitScript() + live })
  .replace('<html lang="en">', '<html lang="es">')
  .replace("</style>", CSS + "</style>");
const name = theme === "light" ? "hash-light.html" : "hash.html";
writeFileSync(join(HERE, name), html);
console.log("wrote", name);
