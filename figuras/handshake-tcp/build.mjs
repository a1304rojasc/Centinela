// Figura: el handshake TCP de tres pasos como dos estaciones de correo neumático.
// Genera handshake-tcp.html (oscuro) o handshake-tcp-light.html (con --light).
//   node build.mjs
//   node build.mjs --light
//   node build.mjs --audit      (comprueba la geometría: debe terminar en "audit passed")
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import * as G from "./kit/lathe.mjs";
import { tubePieces, tubeSvg } from "./kit/tube.mjs";
import * as A from "./kit/audit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (file) => readFileSync(join(HERE, "kit", file), "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "");

const WIDTH = 600;
const HEIGHT = 380;
const AZ = 58;

// ---------------------------------------------------------------- medidas (1 unidad ≈ 1 cm)
const PLATE = { x: -152, y: -32, w: 304, d: 64, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;

const ST_W = 56;
const ST_D = 40;
const Z_BODY = 4; // la caja se apoya en un zócalo de 4
const Z_TOP = 62; // tapa de la caja
const Z_LID = 65; // cara superior de la tapa
const Z_PORT = 68; // cara superior del puerto donde nace el tubo
const STATIONS = {
  c: { id: "c", x0: -138, cx: -110 },
  s: { id: "s", x0: 82, cx: 110 },
};
for (const st of Object.values(STATIONS)) {
  st.plan = { x: st.x0, y: -ST_D / 2, w: ST_W, d: ST_D, r: 2 };
  st.face = ST_D / 2; // cara frontal (y)
  st.side = st.x0 + ST_W; // cara lateral visible (x)
  st.dial = [st.x0 + 44, 9];
}

const TUBE_R = 5; // tubo de vidrio
const BALL_R = 7.6; // racores en T (bola)
const RIM = Math.sqrt(BALL_R ** 2 - TUBE_R ** 2); // donde el borde del tubo toca la bola
const Z_RUN = 96; // altura del tramo horizontal
const BEND = 14;
const FLANGE_T = 2;
const FLANGE_R = 7.5;
const TEE_ATTACK = -50; // racor del inyector del atacante
const TEE_LOSS = 0; // racor del desviador de pérdidas

const INJ = { x: TEE_ATTACK - 13, y: -13, w: 26, d: 26, r: 2 };
const INJ_H = 30;
const BIN_R = 15;
const BIN_H = 30;
const Z_STUB = 36; // cara superior de los puertos del inyector y del cesto

const CAPSULE = { r: 3.3, len: 14 };

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [-110, 0, Z_RUN + 9], [110, 0, Z_RUN + 9], [0, 0, Z_RUN + BALL_R + 9], [-138, -20, Z_PORT], [138, 20, Z_PORT]],
  WIDTH,
  HEIGHT,
  { pad: 24, azimuth: AZ },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const slab = (plan, z, h, steps = 3, bevel = 0) => k.slabOf(plan, z, h, P, steps, bevel);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const f2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- registro para el audit
const R = A.recorder(P);
const record = R.solid;
function put(name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece: "rig", ...rest });
}
function box(name, plan, z, h, style = {}, { steps = 3, bevel = 0.5, extra = "", inner = "", bias = 0, owner } = {}) {
  const shape = record(A.slab(plan, z, h, { name, owner }, steps));
  put(name, [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], S(slab(plan, z, h, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
function post(name, cx, cy, r, z, h, style = {}, { extra = "", bias = 0, bevel = 0, owner } = {}) {
  const shape = record(A.cylinder(cx, cy, r, z, h, { name, owner }));
  put(name, [cx, cy, z + h / 2], S(k.cylinder(cx, cy, r, z, h, P, Math.max(24, Math.round(r * 6)), bevel), { tone: "mid", ...style }) + extra, [shape], { bias });
  return shape;
}
function discAt(name, F, s0, s1, r, style = {}, { extra = "", bias = 0, owner, bevel = 0 } = {}) {
  const shape = record(A.disc(F, s0, s1, r, { name, owner }));
  put(name, G.pointOf(F, (s0 + s1) / 2, 0, 0), S(G.disc(s0, s1, r, F, P, { bevel }), { tone: "mid", ...style }) + extra, [shape], { bias });
  return shape;
}
function ballAt(name, c, r, style = {}, { extra = "", bias = 0 } = {}) {
  const shape = record(A.ball(c, r, { name }));
  put(name, c, S(G.sphereOf(c, r, P, { steps: 48 }), { tone: "mid", ...style }) + extra, [shape], { bias });
  return shape;
}
function prismAt(name, F, poly, s0, s1, style = {}, { extra = "", bias = 0 } = {}) {
  const shape = record(A.prism(F, poly, s0, s1, { name }));
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  const centre = G.add3(G.add3(G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), G.mul3(F.u, cx)), G.mul3(F.v, cy));
  put(name, centre, S(G.prismOf(F, poly, s0, s1, P), { tone: "mid", ...style }) + extra, [shape], { bias });
  return shape;
}

// Tubo de vidrio: una ruta entre dos montajes, con bridas opcionales en cada extremo.
const GLASS = [];
const GLASS_SHINE = [];
const GLASS_SHADE = []; // cuerpos de vidrio en pantalla, para recortar las cápsulas
function glass(name, control, { flanges = [false, false], bend = BEND } = {}) {
  const route = control.length > 2 ? G.fillet(control, bend, 18, { P, tube: TUBE_R }) : control;
  const total = G.pathLength(route);
  const gaps = [];
  if (flanges[0]) gaps.push([0, FLANGE_T]);
  if (flanges[1]) gaps.push([total - FLANGE_T, total]);
  R.route(name, route, TUBE_R, { gaps, rims: flanges.map((on) => (on ? FLANGE_R : TUBE_R)), piece: "rig" });
  tubePieces(route, TUBE_R, P, { maxLength: 14, spacing: 1.6, gaps }).forEach((piece, index) => {
    GLASS.push(piece.body);
    if (piece.wide) GLASS_SHINE.push(piece.shine), GLASS_SHADE.push(piece.shade);
    // el vidrio se tiñe una sola vez (capa hs-tint); cada tramo solo dibuja sus bordes
    const edges = tubeSvg(piece, { tone: "mid" }).replace(/<path class="tb-(body|shine|shade)"[^>]*\/>/g, "");
    put(`${name}:${index}`, piece.mid, `<g class="hs-glass">${edges}</g>`, [A.tube(piece.points, piece.radii)], { route: name, chunk: index, glass: true });
  });
  [0, 1].forEach((index) => {
    if (!flanges[index]) return;
    const along = index ? total - FLANGE_T / 2 : FLANGE_T / 2;
    const F = G.frameAlong(G.pointAlong(route, along), G.tangentAlong(route, along));
    const face = G.dot3(F.a, V) > 0 ? FLANGE_T / 2 : -FLANGE_T / 2;
    const bolts = Math.abs(G.dot3(F.a, V)) > 0.12 ? Dots(G.dotsOf(F, face, FLANGE_R * 0.8, 6, P, { all: true }), { size: 0.42, tone: "mid" }) : "";
    discAt(`${name}.flange${index}`, F, -FLANGE_T / 2, FLANGE_T / 2, FLANGE_R, { tone: "mid" }, { owner: name, extra: bolts, bias: 0.05 });
  });
  return route;
}

// ---------------------------------------------------------------- base
const back = [];
back.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`);
for (const [x, y] of byDepth(k.corners(PLATE, 20))) {
  back.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
}
back.push(S(slab(PLATE, -PLATE_H, PLATE_H, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -4, P, 8), { tone: "faint" }) }));
back.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
const plateScrews = k.corners(PLATE, 10);
back.push(L(plateScrews.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
back.push(Dots(plateScrews.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
record(A.slab(PLATE, -PLATE_H, PLATE_H, { name: "stand.plate", ground: true }, 8));
// regla graduada a lo largo del frente: la "distancia" que recorre cada cápsula
const RULER = { x: -76, y: 20, w: 152, d: 6, r: 1 };
back.push(S(slab(RULER, 0, 0.6), { tone: "lo", crease: "none" }));
{
  const t = k.topTicks(RULER.x + 4, RULER.x + RULER.w - 4, 4, 5, RULER.y, 0.6, [1.8, 3.4], P);
  back.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  back.push(Dots([at([RULER.x + 2, RULER.y + 3, 0.6]), at([RULER.x + RULER.w - 2, RULER.y + 3, 0.6])], { size: 0.45 }));
}
// placa de características con la única etiqueta grabada
const LABEL = { x: -146, y: 22, w: 40, d: 8, r: 1 };
back.push(S(slab(LABEL, 0, 0.8, 4), { tone: "lo", crease: "none" }));
back.push(L(k.planOutline(k.insetPlan(LABEL, 1.2), 0.8, P, 4), { tone: "faint" }));
back.push(k.faceTextSvg(k.topMatrix([LABEL.x + 3.4, LABEL.y + 4.6], 0.8, P, "x"), "TCP · 3 PASOS", { size: 2.6, tone: "mid" }));
back.push(L(k.lineOnTop([LABEL.x + 3.4, LABEL.y + 6.2], [LABEL.x + 26, LABEL.y + 6.2], 0.8, P), { tone: "lo", free: true }));
back.push(Dots([at([LABEL.x + 2, LABEL.y + 4, 0.8]), at([LABEL.x + LABEL.w - 2, LABEL.y + 4, 0.8])], { size: 0.45 }));

// ---------------------------------------------------------------- estaciones
const FRONT_ROWS = { state: [5, 13], seq: [17, 25], ack: [29, 37] };
const WIN_U = [6, 50];
const DIGITS = 10;
const TAG_W = 10; // franja impresa "SEQ"/"ACK" a la izquierda de los rodillos
const faceOf = (st) => (u, v) => [st.x0 + u, st.face, Z_TOP - v];
const sideOf = (st) => (u, v) => [st.side, st.face - u, Z_TOP - v];
const quadOf = (pt, u0, u1, v0, v1) => [pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1)];
const SIDE_F = (st) => G.frameOf([st.side, 0, 30], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const LEVER = { len: 14.5, from: -52, to: 52, notches: 5 };
const notchAngle = (i) => (LEVER.from + ((LEVER.to - LEVER.from) * i) / (LEVER.notches - 1)) * (Math.PI / 180);
const QUAD_R = 17.5;
const quadrant = () => {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = (-64 + (128 * i) / 24) * (Math.PI / 180);
    pts.push([-Math.sin(a) * QUAD_R, Math.cos(a) * QUAD_R]);
  }
  for (let i = 0; i <= 12; i++) {
    const a = (116 + (128 * i) / 12) * (Math.PI / 180);
    pts.push([-Math.sin(a) * 5, Math.cos(a) * 5]);
  }
  return pts;
};

function windowSvg(st, row, kind) {
  const pt = faceOf(st);
  const [v0, v1] = FRONT_ROWS[row];
  const [u0, u1] = WIN_U;
  const out = [];
  out.push(`<path class="hs-win" d="${path3(quadOf(pt, u0, u1, v0, v1), true)}"/>`);
  out.push(`<path class="hs-wall" d="${path3(quadOf(pt, u0, u1, v0, v0 + 1.1), true)}"/>`);
  out.push(`<path class="hs-wall" d="${path3(quadOf(pt, u0, u0 + 0.8, v0, v1), true)}"/>`);
  const M = k.sideMatrix([st.x0, st.face], Z_TOP, P, "left");
  const clip = `hs-clip-${st.id}-${row}`;
  const texts = [];
  if (kind === "state") {
    texts.push(`<text class="iso-face-text hs-state" data-state="${st.id}" data-tone="hi" x="${(u0 + u1) / 2}" y="${v1 - 2.2}" font-size="4.6" text-anchor="middle">CLOSED</text>`);
  } else {
    const cell = (u1 - u0 - TAG_W) / DIGITS;
    texts.push(`<text class="iso-face-text hs-tag" data-tone="lo" x="${u0 + 1.6}" y="${v1 - 2.4}" font-size="3.2">${kind.toUpperCase()}</text>`);
    for (let i = 0; i < DIGITS; i++) {
      texts.push(`<text class="iso-face-text hs-digit" data-num="${st.id}-${kind}" data-tone="hi" x="${f2(u0 + TAG_W + cell * (i + 0.5))}" y="${v1 - 2.2}" font-size="4.4" text-anchor="middle">-</text>`);
    }
    // divisiones entre rodillos: de borde a borde de la ventana
    const lines = [];
    for (let i = 0; i <= DIGITS - 1; i++) {
      const u = u0 + TAG_W + cell * i;
      lines.push(k.pathOf([at(pt(u, v0)), at(pt(u, v1))]));
    }
    out.push(L(lines.join(""), { tone: "faint" }));
  }
  out.push(`<g transform="${M}"><clipPath id="${clip}"><rect x="${u0}" y="${v0}" width="${u1 - u0}" height="${v1 - v0}"/></clipPath><g clip-path="url(#${clip})">${texts.join("")}</g></g>`);
  out.push(L(path3(quadOf(pt, u0, u1, v0, v1), true), { tone: "lo" }));
  return out.join("");
}

function frontSvg(st) {
  const pt = faceOf(st);
  const out = [windowSvg(st, "state", "state"), windowSvg(st, "seq", "seq"), windowSvg(st, "ack", "ack")];
  // tornillos de las esquinas del frontal
  out.push(Dots([pt(2.4, 2.4), pt(ST_W - 2.4, 2.4), pt(2.4, 50.5), pt(ST_W - 2.4, 50.5)].map(at), { size: 0.45 }));
  if (st.id === "c") {
    // rejilla de ventilación: ranuras cerradas
    for (let i = 0; i < 5; i++) out.push(L(path3(quadOf(pt, 7 + i * 5, 9.4 + i * 5, 41.5, 50), true), { tone: "faint" }));
  } else {
    // casillero de la cola SYN: 8 huecos (backlog = 8)
    QUEUE_SLOTS.forEach(([u, v], i) => {
      const F = G.frameOf(pt(u, v), [0, 1, 0], [1, 0, 0], [0, 0, 1]);
      out.push(`<path class="hs-void" d="${G.circleOf(F, 0, 2.3, P, 28)}"/>`);
      out.push(L(G.circleOf(F, 0, 2.9, P, 32), { tone: "lo" }));
      out.push(`<g data-slot="${i}" style="display:none">${S(G.disc(0, 1.4, 2.1, F, P, { steps: 28 }), { tone: "hi", lit: true })}</g>`);
    });
  }
  return out.join("");
}
const QUEUE_SLOTS = Array.from({ length: 8 }, (_, i) => [8 + (i % 4) * 7.4, i < 4 ? 43 : 49.6]);

function station(st) {
  const name = `st.${st.id}`;
  const plinth = k.insetPlan(st.plan, -2);
  box(`${name}.plinth`, plinth, 0, Z_BODY, { tone: "lo" }, { bevel: 0.6, extra: Dots(k.corners(plinth, 1.4).map(([x, y]) => at([x, y, Z_BODY])), { size: 0.45 }) });
  box(`${name}.body`, st.plan, Z_BODY, Z_TOP - Z_BODY, { tone: "mid" }, { steps: 3, bevel: 0.8, inner: L(k.sideSeam(st.plan, 9, P, 3), { tone: "faint" }), extra: frontSvg(st) + sideSvg(st) });
  const lid = k.insetPlan(st.plan, -1);
  box(`${name}.lid`, lid, Z_TOP, Z_LID - Z_TOP, { tone: "mid" }, { bevel: 0.6, extra: L(k.planOutline(k.insetPlan(lid, 3), Z_LID, P, 3), { tone: "faint" }) + Dots(k.corners(lid, 1.6).map(([x, y]) => at([x, y, Z_LID])), { size: 0.45 }) });
  // puerto del tubo
  post(`${name}.port`, st.cx, 0, 9, Z_LID, Z_PORT - Z_LID, { tone: "mid" }, { bevel: 0.4, extra: Dots([0, 1, 2, 3, 4, 5].map((i) => at([st.cx + Math.cos(i + 0.3) * 8.3, Math.sin(i + 0.3) * 8.3, Z_PORT])), { size: 0.4 }) });
  // reloj de retransmisión (RTO): un reloj comparador cara arriba
  const [dx, dy] = st.dial;
  const top = Z_LID + 5;
  const ticks = k.radialTicks(dx, dy, 6, 16, 4, top, [0.9, 1.8], P);
  post(`${name}.dial`, dx, dy, 7, Z_LID, 5, { tone: "hi", crease: "lo" }, {
    bevel: 0.5,
    extra: L(k.knurl(dx, dy, 7, top - 2, top, 48, P, 0.3), { tone: "lo" }) + L(k.sideArc(dx, dy, 7, top - 2, P, 32), { tone: "faint" }) + L(k.ring(dx, dy, 6, top, P, 48), { tone: "lo" }) + L(ticks.minor, { tone: "lo" }) + L(ticks.major, { tone: "mid" }) + L(k.ring(dx, dy, 0.9, top, P, 14), { tone: "mid" }),
  });
  // pulsador del cliente: "abrir conexión"
  if (st.id === "c") {
    const F = G.frameOf(faceOf(st)(44, 46), [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    discAt(`${name}.bezel`, F, 0, 1.4, 5, { tone: "mid" }, { bevel: 0.3, extra: L(G.circleOf(F, 1.4, 4.1, P, 32), { tone: "faint" }) });
    st.button = F;
  }
  // cuadrante de la palanca de estado en el costado
  const F = SIDE_F(st);
  const notches = [];
  for (let i = 0; i < LEVER.notches; i++) {
    const a = notchAngle(i);
    notches.push(k.pathOf([at(G.pointOf(F, 1, 0, 0).map((v, j) => v + F.u[j] * -Math.sin(a) * QUAD_R + F.v[j] * Math.cos(a) * QUAD_R)), at(G.pointOf(F, 1, 0, 0).map((v, j) => v + F.u[j] * -Math.sin(a) * (QUAD_R - (i === 4 ? 4 : 2.6)) + F.v[j] * Math.cos(a) * (QUAD_R - (i === 4 ? 4 : 2.6))))]));
  }
  prismAt(`${name}.quadrant`, F, quadrant(), 0, 1, { tone: "mid" }, { extra: L(notches.join(""), { tone: "mid" }), bias: 0.1 });
}
function sideSvg(st) {
  const pt = sideOf(st);
  // tornillos de las esquinas del costado
  return Dots([pt(2.4, 2.4), pt(ST_D - 2.4, 2.4), pt(2.4, 50.5), pt(ST_D - 2.4, 50.5)].map(at), { size: 0.45 });
}
station(STATIONS.c);
station(STATIONS.s);

// ---------------------------------------------------------------- inyector del atacante y cesto de pérdidas
box("inj.body", INJ, 0, INJ_H, { tone: "mid" }, {
  bevel: 0.6,
  inner: L(k.sideSeam(INJ, 6, P, 3), { tone: "faint" }),
  extra: (() => {
    // mirilla vertical con la pila de cápsulas falsas
    const y = INJ.y + INJ.d;
    const pts = (u0, u1, z0, z1) => [[INJ.x + u0, y, z0], [INJ.x + u1, y, z0], [INJ.x + u1, y, z1], [INJ.x + u0, y, z1]];
    let s = `<path class="hs-win" d="${path3(pts(9, 17, 9, 26), true)}"/>`;
    for (let i = 0; i < 4; i++) s += L(path3(pts(10, 16, 10 + i * 4, 13 + i * 4), true), { tone: "lo" });
    s += L(path3(pts(9, 17, 9, 26), true), { tone: "lo" });
    s += Dots([[INJ.x + 3, y, 27], [INJ.x + 23, y, 27], [INJ.x + 3, y, 8.5], [INJ.x + 23, y, 8.5]].map(at), { size: 0.45 });
    return s;
  })(),
});
box("inj.lid", k.insetPlan(INJ, -0.8), INJ_H, 2, { tone: "mid" }, { bevel: 0.4, extra: Dots(k.corners(k.insetPlan(INJ, -0.8), 1.4).map(([x, y]) => at([x, y, INJ_H + 2])), { size: 0.45 }) });
post("inj.port", TEE_ATTACK, 0, 8, INJ_H + 2, Z_STUB - INJ_H - 2, { tone: "mid" }, { bevel: 0.3 });
// cesto de pérdidas: un bote cilíndrico con tapa
post("bin.body", TEE_LOSS, 0, BIN_R, 0, BIN_H, { tone: "mid" }, {
  extra: L(k.sideArc(TEE_LOSS, 0, BIN_R, 8, P, 48), { tone: "faint" }) + L(k.sideArc(TEE_LOSS, 0, BIN_R, 22, P, 48), { tone: "faint" }),
});
post("bin.rim", TEE_LOSS, 0, BIN_R + 1, BIN_H, 3, { tone: "mid" }, { bevel: 0.4, extra: Dots([0, 1, 2, 3, 4, 5, 6, 7].map((i) => at([TEE_LOSS + Math.cos(i * 0.785 + 0.4) * 13.6, Math.sin(i * 0.785 + 0.4) * 13.6, BIN_H + 3])), { size: 0.42 }) });
post("bin.port", TEE_LOSS, 0, 8, BIN_H + 3, Z_STUB - BIN_H - 3, { tone: "mid" }, { bevel: 0.3 });

// ---------------------------------------------------------------- tubos y racores
const C = STATIONS.c.cx;
const SX = STATIONS.s.cx;
const RUN_A = glass("tube.a", [[C, 0, Z_PORT], [C, 0, Z_RUN], [TEE_ATTACK - RIM, 0, Z_RUN]], { flanges: [true, false] });
const RUN_B = glass("tube.b", [[TEE_ATTACK + RIM, 0, Z_RUN], [TEE_LOSS - RIM, 0, Z_RUN]]);
const RUN_C = glass("tube.c", [[TEE_LOSS + RIM, 0, Z_RUN], [SX, 0, Z_RUN], [SX, 0, Z_PORT]], { flanges: [false, true] });
const RUN_D = glass("tube.d", [[TEE_ATTACK, 0, Z_STUB], [TEE_ATTACK, 0, Z_RUN - RIM]], { flanges: [true, false] });
const RUN_E = glass("tube.e", [[TEE_LOSS, 0, Z_RUN - RIM], [TEE_LOSS, 0, Z_STUB]], { flanges: [false, true] });
ballAt("tee.attack", [TEE_ATTACK, 0, Z_RUN], BALL_R, { tone: "mid" });
ballAt("tee.loss", [TEE_LOSS, 0, Z_RUN], BALL_R, { tone: "mid" });
// desviador sobre el racor de pérdidas: cuello y caja del actuador con su indicador
const NECK_F = G.frameOf([TEE_LOSS, 0, Z_RUN], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const NECK0 = Math.sqrt(BALL_R ** 2 - 2.4 ** 2);
discAt("tee.loss.neck", NECK_F, NECK0, BALL_R + 2.2, 2.4, { tone: "mid" }, { bias: 0.1 });
const ACT = { x: TEE_LOSS - 5, y: -5, w: 10, d: 10, r: 1 };
const ACT_Z = Z_RUN + BALL_R + 2.2;
const ACT_TOP = ACT_Z + 5;
box("tee.loss.actuator", ACT, ACT_Z, 5, { tone: "mid" }, { bevel: 0.4, bias: 0.2, extra: L(k.ring(TEE_LOSS, 0, 3.6, ACT_TOP, P, 32), { tone: "lo" }) + L(k.ring(TEE_LOSS, 0, 0.9, ACT_TOP, P, 14), { tone: "mid" }) + Dots(k.corners(ACT, 1.2).map(([x, y]) => at([x, y, ACT_TOP])), { size: 0.4 }) });
const pointer = (turn) => {
  const a = turn * (Math.PI / 2);
  return k.lineOnTop([TEE_LOSS + Math.cos(a) * 0.9, Math.sin(a) * 0.9], [TEE_LOSS + Math.cos(a) * 3.6, Math.sin(a) * 3.6], ACT_TOP, P);
};

// ---------------------------------------------------------------- orden de pintado y capas vivas
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const indexOf = (name) => R.items.findIndex((item) => item.name === name);
const slots = new Map();
const addSlot = (index, svg) => slots.set(index, (slots.get(index) ?? "") + svg);
const firstGlass = R.items.findIndex((item) => item.glass);
addSlot(firstGlass - 1, `<g data-part="capsules" clip-path="url(#hs-glass-clip)"></g><g class="hs-tint"><path class="hs-tint-body" d="${GLASS.join("")}"/><path class="hs-tint-shade" d="${GLASS_SHADE.join("")}"/><path class="hs-tint-shine" d="${GLASS_SHINE.join("")}"/></g>`);
for (const st of Object.values(STATIONS)) {
  addSlot(indexOf(`st.${st.id}.quadrant`), `<g data-part="lever-${st.id}"></g>`);
  addSlot(indexOf(`st.${st.id}.dial`), `<path data-part="needle-${st.id}" class="iso-line" data-tone="lit" data-free="start" d="" style="stroke-width:0.9"/>`);
}
addSlot(indexOf("st.c.bezel"), `<g data-part="button"></g>`);
addSlot(indexOf("tee.loss.actuator"), `<path data-part="pointer" class="iso-line" data-tone="hi" d="${pointer(0)}" style="stroke-width:0.9"/>`);
const groups = R.items.map((item, index) => `${item.svg}${slots.get(index) ?? ""}`);
const glassClip = `<clipPath id="hs-glass-clip">${GLASS.map((d) => `<path d="${d}"/>`).join("")}</clipPath>`;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Dos estaciones de correo neumático sobre una bancada, unidas por un tubo de vidrio. La de la izquierda es el cliente y la de la derecha el servidor. Cada una tiene en el frente una ventana con su estado y dos contadores de rodillos, SEQ y ACK, una palanca de estado en el costado y un reloj de retransmisión en la tapa. Por el tubo viajan cápsulas con anillos que marcan las banderas SYN y ACK. En el centro, un racor con desviador puede mandar una cápsula al cesto de pérdidas; a la izquierda, un inyector del atacante puede llenar de cápsulas SYN falsas el casillero de la cola del servidor.",
  body: [`<defs>${glassClip}</defs>`, ...back, `<g class="hs-rig">${groups.join("")}</g>`],
});

// ---------------------------------------------------------------- rutas de las cápsulas (mundo)
const EXT = 18; // tramo oculto dentro de cada estación
const runPoints = (route) => route.map((p) => p.map(f2));
const down = (p, dz) => [p[0], p[1], p[2] - dz];
const MAIN = [down(RUN_A[0], EXT), ...RUN_A, ...RUN_B, ...RUN_C, down(RUN_C[RUN_C.length - 1], EXT)];
const toLoss = (fromLeft) => {
  const side = fromLeft ? [down(RUN_A[0], EXT), ...RUN_A, ...RUN_B] : [down(RUN_C[RUN_C.length - 1], EXT), ...[...RUN_C].reverse()];
  return [...side, [TEE_LOSS, 0, Z_RUN], ...RUN_E, down(RUN_E[RUN_E.length - 1], 14)];
};
const ATTACK = [down(RUN_D[0], 16), ...RUN_D, [TEE_ATTACK, 0, Z_RUN], ...RUN_B, ...RUN_C, down(RUN_C[RUN_C.length - 1], EXT)];
const PATHS = {
  c2s: runPoints(MAIN),
  s2c: runPoints([...MAIN].reverse()),
  c2x: runPoints(toLoss(true)),
  s2x: runPoints(toLoss(false)),
  a2s: runPoints(ATTACK),
};
const lengths = Object.fromEntries(Object.entries(PATHS).map(([key, points]) => [key, f2(G.pathLength(points))]));

const DATA = {
  P,
  capsule: CAPSULE,
  paths: PATHS,
  lengths,
  lever: { ...LEVER, angles: Array.from({ length: LEVER.notches }, (_, i) => notchAngle(i)) },
  sideFrames: { c: SIDE_F(STATIONS.c), s: SIDE_F(STATIONS.s) },
  dials: { c: [...STATIONS.c.dial, Z_LID + 5], s: [...STATIONS.s.dial, Z_LID + 5] },
  button: STATIONS.c.button,
  pointer: { x: TEE_LOSS, z: ACT_TOP },
  digits: DIGITS,
};

// ---------------------------------------------------------------- panel de controles
const panel = `
<div class="hs-panel">
  <div class="hs-actions">
    <button type="button" data-act="connect" class="hs-primary">Iniciar conexión</button>
    <button type="button" data-act="flood">SYN flood</button>
    <button type="button" data-act="reset">Reiniciar</button>
  </div>
  <div class="hs-controls">
    <label class="hs-control" for="hs-speed">
      <span class="hs-control-head">Velocidad<output id="hs-speed-out">×0,15</output></span>
      <input id="hs-speed" type="range" min="0" max="100" step="1" value="32">
    </label>
    <label class="hs-control" for="hs-lose">
      <span class="hs-control-head">Perder un paquete</span>
      <select id="hs-lose">
        <option value="">Ninguno</option>
        <option value="SYN">El SYN (paso 1)</option>
        <option value="SYN-ACK">El SYN-ACK (paso 2)</option>
        <option value="ACK">El ACK (paso 3)</option>
      </select>
    </label>
  </div>
  <p class="hs-step" data-step aria-live="polite">Pulsa «Iniciar conexión»: el cliente está en CLOSED y el servidor escucha en LISTEN.</p>
  <div class="hs-sides">
    <div class="hs-side"><span class="hs-who">Cliente</span><span class="hs-big" data-out="c-state">CLOSED</span><span class="hs-pair">seq <b data-out="c-seq">—</b></span><span class="hs-pair">ack <b data-out="c-ack">—</b></span><span class="hs-pair">RTO <b data-out="c-rto">1,0 s</b></span></div>
    <div class="hs-side"><span class="hs-who">Servidor</span><span class="hs-big" data-out="s-state">LISTEN</span><span class="hs-pair">seq <b data-out="s-seq">—</b></span><span class="hs-pair">ack <b data-out="s-ack">—</b></span><span class="hs-pair">cola SYN <b data-out="s-queue">0 / 8</b></span></div>
  </div>
  <ol class="hs-log" data-log aria-label="Registro de paquetes"></ol>
</div>`;

const CSS = `
.hs-tint path{fill-rule:nonzero}
.hs-tint-body{fill:var(--anatomy-shade-2);fill-opacity:.3}
.hs-tint-shade{fill:var(--anatomy-shade-0);fill-opacity:.35}
.hs-tint-shine{fill:var(--anatomy-top);fill-opacity:.55}
.hs-win{fill:var(--anatomy-shade-0)}
.hs-wall{fill:var(--anatomy-shade-1)}
.hs-void{fill:var(--anatomy-shade-0)}
.iso[data-theme="light"] .hs-win,.iso[data-theme="light"] .hs-void{fill:var(--anatomy-shade-1)}
.hs-digit,.hs-state,.hs-tag{font-family:var(--anatomy-mono);font-variant-numeric:tabular-nums}
.hs-state{letter-spacing:.02em}
.hs-panel{margin-top:22px;display:grid;gap:16px;font-size:13px;color:var(--anatomy-text)}
.hs-actions{display:flex;flex-wrap:wrap;gap:8px}
.hs-actions button{font:12px/1 var(--anatomy-mono);padding:9px 13px;border:0;border-radius:0;background:var(--anatomy-card);color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-mid);cursor:pointer}
.hs-actions button:hover{box-shadow:0 0 0 1px var(--anatomy-hi)}
.hs-actions .hs-primary{box-shadow:0 0 0 1px var(--anatomy-hi)}
.hs-actions button[aria-pressed="true"]{background:var(--anatomy-strong);color:var(--anatomy-card)}
.hs-controls{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.hs-control{display:grid;gap:6px}
.hs-control-head{display:flex;align-items:baseline;gap:6px;color:var(--anatomy-strong)}
.hs-control-head output{margin-left:auto;font-family:var(--anatomy-mono);font-size:11.5px;color:var(--anatomy-text)}
.hs-control input{width:100%;accent-color:var(--anatomy-hi)}
.hs-control select{font:12px var(--anatomy-mono);padding:6px 8px;background:var(--anatomy-card);color:var(--anatomy-strong);border:0;border-radius:0;box-shadow:0 0 0 1px var(--anatomy-mid)}
.hs-step{margin:0;padding:10px 12px;box-shadow:0 0 0 1px var(--anatomy-faint);color:var(--anatomy-strong);min-height:3.2em}
.hs-sides{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--anatomy-faint);box-shadow:0 0 0 1px var(--anatomy-faint)}
.hs-side{display:grid;gap:3px;padding:10px 12px;background:var(--anatomy-card);font-family:var(--anatomy-mono);font-size:12px}
.hs-who{font-family:inherit;color:var(--anatomy-muted);font-size:11.5px}
.hs-big{font:500 17px/1.2 var(--anatomy-mono);color:var(--anatomy-strong)}
.hs-pair b{font-weight:500;color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
.hs-log{margin:0;padding:0 0 0 2.2em;font:12px/1.7 var(--anatomy-mono);color:var(--anatomy-text);min-height:5.1em}
.hs-log li.hs-lost{color:var(--anatomy-muted);text-decoration:line-through}
.hs-actions button:focus-visible,.hs-control input:focus-visible,.hs-control select:focus-visible,.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
@media (max-width:560px){.iso-stage svg{width:104%;margin:-2% 0 -2% -2%}.iso-plate-corner[data-corner="hint"]{display:none}.iso-plate-corner[data-corner="readout"]{white-space:normal;max-width:100%;text-align:right;left:auto}.hs-controls,.hs-sides{grid-template-columns:1fr}}
`;

const latheSource = strip("lathe.mjs");
const tubeSource = strip("tube.mjs");
const geometry = `const G = (() => {${latheSource}\nreturn { viewOf, scaleOf, frameAlong, frameOf, pointOf, disc, sphereOf, prismOf, circleOf, arcOf, dot3, add3, sub3, mul3, unit3, cross3, len3, cut, pathLength, pointAlong, tangentAlong, resample, lightOf, toneOf, bandOf, hullOf, runsOf, fadeOf };})();
const TUBE = (() => {${tubeSource.replace(/\bG\./g, "G.")}\nreturn { tubePieces, tubeSvg };})();
`;
const live = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const body = k.plateHtml({
  fig: "Fig 2",
  title: "Handshake TCP",
  hint: "Pulsa el botón del cliente",
  readout: "cliente CLOSED · servidor LISTEN",
  keys: [
    { mark: "lit", label: "Cápsula: un segmento TCP; sus anillos marcan SYN (delante) y ACK (detrás)" },
    { mark: "raised", label: "Contadores SEQ y ACK, y palanca de estado de cada lado" },
    { mark: "edge", label: "Desviador central: pierde un paquete; inyector: SYN falsos" },
  ],
  caption:
    "El cliente elige un número de secuencia inicial aleatorio x y manda una cápsula SYN (seq = x). El servidor, que escuchaba en LISTEN, guarda la conexión medio abierta en su cola (SYN_RECEIVED), elige su propio número aleatorio y y responde SYN-ACK (seq = y, ack = x + 1). El cliente confirma con ACK (seq = x + 1, ack = y + 1) y los dos quedan en ESTABLISHED. Si una cápsula se pierde, el reloj del que la envió llega al final (RTO inicial de 1 s, que se duplica en cada intento) y la reenvía con el mismo número. En un SYN flood, el atacante manda SYN con IP falsas: cada uno ocupa un hueco de la cola hasta que caduca, el SYN-ACK no lo contesta nadie y, con la cola llena, el SYN legítimo se descarta. Aquí la cola tiene 8 huecos y el servidor reintenta el SYN-ACK 2 veces (Linux usa 5 por defecto, unos 63 s).",
  body: `<div class="iso-stage" tabindex="0" role="group" aria-label="Handshake TCP. Intro o espacio: iniciar conexión. F: SYN flood. R: reiniciar.">${svg}</div>${panel}`,
});

const html = k
  .pageHtml({ title: "Handshake TCP", theme, body, script: strip("iso-kit.mjs") + geometry + live })
  .replace('<html lang="en">', '<html lang="es">')
  .replace("</style>", CSS + "</style>");
const name = theme === "light" ? "handshake-tcp-light.html" : "handshake-tcp.html";
writeFileSync(join(HERE, name), html);
console.log("wrote", name, `${(html.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `escala ${KS.toFixed(3)}`);

A.auditOrExit(R, P, {});
