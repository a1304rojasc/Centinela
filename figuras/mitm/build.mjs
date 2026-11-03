// Figura: un ataque man-in-the-middle explicado con una línea de tubo neumático.
// Genera mitm.html (oscuro) o mitm-light.html (con --light).
//   node build.mjs
//   node build.mjs --light
//   node build.mjs --audit     (comprueba la geometría: debe terminar en "audit passed")
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import * as G from "./kit/lathe.mjs";
import { tubePieces, tubeSvg } from "./kit/tube.mjs";
import * as A from "./kit/audit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const kitScript = () => readFileSync(join(HERE, "kit", "iso-kit.mjs"), "utf8").replace(/^export /gm, "");

const WIDTH = 600;
const HEIGHT = 380;
const AZ = 54;

// ---------------------------------------------------------------- medidas (1 unidad ≈ 1 cm)
const PLATE = { x: -158, y: -38, w: 316, d: 102, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;

const SA = { x: -142, y: -28, w: 44, d: 38, r: 2 }; // estación de la víctima
const SA_H = 38;
const SB = { x: 98, y: -28, w: 44, d: 38, r: 2 }; // estación del servidor
const SB_H = 44;
const CAB = { x: -20, y: -25, w: 40, d: 32, r: 1.6 }; // armario del soplador
const CAB_H = 58;
const VALVE = { x: -16, y: -22, w: 32, d: 26, r: 2 }; // carcasa de la válvula desviadora
const VALVE_Z = CAB_H;
const VALVE_H = 26;
const VTOP = VALVE_Z + VALVE_H;
const BENCH = { x: -38, y: 22, w: 76, d: 34, r: 1.5 }; // banco de lectura del atacante
const BENCH_H = 20;
const TOP = { x: -40, y: 20, w: 80, d: 38, r: 1.5 };
const TOP_Z = BENCH_H + 3;
const BLOCK_H = 11;
const BLOCKS = [-9, 9].map((x) => ({ x: x - 6, y: 24, w: 12, d: 12, r: 1 }));
const BLOCK_TOP = TOP_Z + BLOCK_H;

const LINE_Y = -9; // eje de la línea principal en planta
const LINE_Z = 70;
const MAIN_R = 4;
const BR_R = 3.2;
const BR_Z = 66;
const LANE_Y = 30; // ramales verticales que bajan al banco
const PORT_A = [-120, LINE_Y];
const PORT_B = [120, LINE_Y];
const COLLAR_H = 3;
const CAPS_R = 3; // radio de la cápsula
const CAPS_L = 15;
const TRAY_Y = 45; // centro de la cápsula sobre los raíles del banco
const RAIL_Z = TOP_Z + 1.4;
const CAPS_Z = RAIL_Z + CAPS_R - 0.5;
const POSTS = [-80, 80];

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [PORT_A[0], LINE_Y, LINE_Z + 6], [PORT_B[0], LINE_Y, LINE_Z + 6], [VALVE.x, VALVE.y, VTOP + 6], [VALVE.x + VALVE.w, VALVE.y + VALVE.d, VTOP + 6]],
  WIDTH,
  HEIGHT,
  { pad: 20, azimuth: AZ },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const slab = (plan, z, h, steps = 3, bevel = 0) => k.slabOf(plan, z, h, P, steps, bevel);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const f2 = (v) => Math.round(v * 100) / 100;
const UP = [0, 0, 1];

// ---------------------------------------------------------------- registro para el audit
const R = A.recorder(P);
const record = R.solid;
function put(name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) {
  return R.put({ name: R.nameFor(name), at: ref, bias, svg, shapes, piece: "fig", ...rest });
}
function box(name, plan, z, h, style = {}, { extra = "", inner = "", bias = 0, steps = 3, bevel = 0.4 } = {}) {
  const shape = record(A.slab(plan, z, h, { name }, steps));
  put(name, [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], S(slab(plan, z, h, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
function turned(name, F, profile, style = {}, { extra = "", inner = "", bias = 0, owner } = {}) {
  const shape = record(A.solid(F, profile, { name, owner }));
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  put(name, G.add3(F.o, G.mul3(F.a, mid)), S(G.solidOf(profile, F, P), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
const disc = (name, F, s0, s1, r, style, options) => turned(name, F, [[s0, r], [s1, r]], style, options);
const upFrame = (x, y, z) => G.frameOf([x, y, z], UP, [1, 0, 0], [0, 1, 0]);

// el tubo (vidrio): cada trozo se ordena por su cuenta; bajo bridas y abrazaderas el tubo se corta
const TUBES = {};
const BODY = [];
const SHINE = [];
function pipe(name, control, r, { bands = [], flangeR = 1.55 } = {}) {
  const line = G.fillet(control, Math.max(r * 2.6, 3), 14, { P, tube: r });
  const total = G.pathLength(line);
  const collars = [];
  const thick = Math.max(0.9, r * 0.55);
  [[0, -1], [total, 1]].forEach(([along, sign]) => {
    const tangent = G.tangentAlong(line, along);
    collars.push({ kind: "brida", centre: G.add3(G.pointAlong(line, along), G.mul3(tangent, (-sign * thick) / 2)), tangent, radius: r * flangeR, thick, gap: sign < 0 ? [0, thick] : [total - thick, total] });
  });
  for (const along of bands) {
    const t = r * 1.75;
    collars.push({ kind: "abrazadera", centre: G.pointAlong(line, along), tangent: G.tangentAlong(line, along), radius: r * 1.18, thick: t, gap: [along - t / 2, along + t / 2] });
  }
  const gaps = collars.map(({ gap }) => gap);
  R.route(name, line, r, { owner: name, gaps, rims: [r * flangeR, r * flangeR], piece: "fig" });
  tubePieces(line, r, P, { maxLength: 22, spacing: 1.2, gaps }).forEach((piece, index) => {
    BODY.push(piece.body);
    if (piece.wide) SHINE.push(piece.shine);
    put(`${name}:${index}`, piece.mid, tubeSvg(piece, { tone: "hi" }), [A.tube(piece.points, piece.radii)], { route: name, chunk: index });
  });
  for (const { kind, centre, tangent, radius, thick: t } of collars) {
    const F = G.frameAlong(centre, tangent);
    const facing = G.dot3(F.a, V);
    const toward = facing > 0 ? t / 2 : -t / 2;
    const bolts = kind === "brida" && Math.abs(facing) > 0.12 ? D(G.dotsOf(F, toward, radius * 0.78, 6, P, { all: true }), { size: 0.42, tone: "mid" }) : "";
    const id = `${name}.${kind}`;
    put(id, centre, S(G.disc(-t / 2, t / 2, radius, F, P), { tone: kind === "brida" ? "hi" : "mid" }) + bolts, [record(A.disc(F, -t / 2, t / 2, radius, { name: id, owner: name }))]);
  }
  TUBES[name] = { line, total };
  return line;
}
// longitud de arco donde la ruta cruza x = valor (para colocar las abrazaderas sobre los postes)
function arcAtX(line, x) {
  let s = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const len = G.len3(G.sub3(b, a));
    if ((a[0] - x) * (b[0] - x) <= 0 && Math.abs(b[0] - a[0]) > 1e-9) return s + (len * (x - a[0])) / (b[0] - a[0]);
    s += len;
  }
  throw new Error("la ruta no cruza x = " + x);
}
function planeMatrix(o, ex, ey) {
  const p0 = at(o);
  const px = at(G.add3(o, ex));
  const py = at(G.add3(o, ey));
  const v = (x) => x.toFixed(4);
  return `matrix(${v(px[0] - p0[0])} ${v(px[1] - p0[1])} ${v(py[0] - p0[0])} ${v(py[1] - p0[1])} ${p0[0].toFixed(2)} ${p0[1].toFixed(2)})`;
}
// rectángulo cerrado sobre una cara frontal (+y) o lateral (+x)
const frontRect = (y, x0, x1, z0, z1) => path3([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], true);
const sideRect = (x, y0, y1, z0, z1) => path3([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]], true);
function frontSlot(y, x0, x1, z0, z1, steps = 6) {
  // ranura cerrada con extremos redondos sobre un plano y = cte
  const r = (z1 - z0) / 2;
  const zc = (z0 + z1) / 2;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / steps;
    pts.push([x1 - r + Math.cos(a) * r, y, zc - Math.sin(a) * r]);
  }
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / steps;
    pts.push([x0 + r + Math.cos(a) * r, y, zc - Math.sin(a) * r]);
  }
  return path3(pts, true);
}
// ventana con vidrio oscuro y dos líneas de texto que el programa reescribe
const WINDOWS = {};
function windowOn(id, y, x0, x1, z0, z1, size) {
  const glass = frontRect(y, x0, x1, z0, z1);
  WINDOWS[id] = { x0, x1, z0, z1, size };
  const m = planeMatrix([x0 + 1.6, y, z1], [1, 0, 0], [0, 0, -1]);
  const gap = (z1 - z0 - 2 * size) / 3;
  const line = (n) => `<text class="iso-face-text mitm-text" data-tone="${n === 1 ? "hi" : "mid"}" data-win="${id}${n}" transform="${m}" x="0" y="${f2(gap * n + size * n - size * 0.18)}" font-size="${size}"></text>`;
  return (
    L(frontRect(y, x0 - 1.4, x1 + 1.4, z0 - 1.4, z1 + 1.4), { tone: "lo" }) +
    `<path class="mitm-glass" d="${glass}"/>` +
    `<clipPath id="mitm-clip-${id}"><path d="${glass}"/></clipPath><g clip-path="url(#mitm-clip-${id})">${line(1)}${line(2)}</g>` +
    L(glass, { tone: "mid" })
  );
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
{
  const screws = k.corners(PLATE, 10);
  back.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  back.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
}
record(A.slab(PLATE, -PLATE_H, PLATE_H, { name: "stand.plate", ground: true }, 8));
// regla a lo largo de la línea (frente de la placa)
{
  const strip = { x: 52, y: 44, w: 92, d: 6, r: 1 };
  back.push(S(slab(strip, 0, 0.6), { tone: "lo", crease: "none" }));
  const t = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y, 0.6, [2, 3.6], P);
  back.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  back.push(D([at([strip.x + 2, strip.y + 4.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 4.5, 0.6])], { size: 0.45 }));
}
// placa de características: la única etiqueta grabada
{
  const label = { x: -146, y: 34, w: 48, d: 14, r: 1.2 };
  back.push(S(slab(label, 0, 0.8, 4), { tone: "lo", crease: "none" }));
  back.push(L(k.planOutline(k.insetPlan(label, 1.4), 0.8, P, 4), { tone: "faint" }));
  back.push(k.faceTextSvg(k.topMatrix([label.x + 4, label.y + 5.6], 0.8, P, "x"), "RED LOCAL · LAN", { size: 2.6, tone: "mid" }));
  back.push(L([k.lineOnTop([label.x + 4, label.y + 8.4], [label.x + 34, label.y + 8.4], 0.8, P), k.lineOnTop([label.x + 4, label.y + 10.6], [label.x + 24, label.y + 10.6], 0.8, P)].join(""), { tone: "lo", free: true }));
  back.push(D([at([label.x + 2.2, label.y + 7, 0.8]), at([label.x + label.w - 2.2, label.y + 7, 0.8])], { size: 0.45 }));
}
for (const plan of [SA, SB, CAB, BENCH]) back.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(plan, -2), 0, 0.1, P)}" style="filter:blur(3px)"/>`);

// ---------------------------------------------------------------- estación A: la víctima (emisora)
const LAMP_A = [[-106, -21], [-106, -13]]; // certificado correcto · alarma
box("sta.body", SA, 0, SA_H, { tone: "mid" }, {
  inner: L(k.sideSeam(SA, SA_H - 7, P, 3), { tone: "faint" }),
  extra:
    L(k.planOutline(k.insetPlan(SA, 3), SA_H, P, 3), { tone: "faint" }) +
    D(k.corners(SA, 1.6).map(([x, y]) => at([x, y, SA_H])), { size: 0.45 }) +
    windowOn("a", SA.y + SA.d, SA.x + 5, SA.x + SA.w - 5, 10, 24, 2.8) +
    D([[SA.x + 2.4, 4], [SA.x + SA.w - 2.4, 4], [SA.x + 2.4, 27], [SA.x + SA.w - 2.4, 27]].map(([x, z]) => at([x, SA.y + SA.d, z])), { size: 0.45 }) +
    L([0, 1, 2, 3].map((i) => sideRect(SA.x + SA.w, -23 + i * 6, -19 + i * 6, 8, 24)).join(""), { tone: "lo" }),
});
// teclado: la víctima escribe el mensaje
{
  const pad = { x: SA.x + 3, y: SA.y + SA.d - 10, w: 20, d: 9, r: 0.8 };
  let keys = "";
  for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) keys += S(slab({ x: pad.x + 1.2 + col * 4.6, y: pad.y + 1.2 + row * 3.6, w: 3.6, d: 2.8, r: 0.4 }, SA_H + 1, 0.8, 2, 0.2), { tone: "hi", crease: "lo" });
  const shape = record(A.slab(pad, SA_H, 1.8, { name: "sta.keypad" }, 2));
  put("sta.keypad", [pad.x + pad.w / 2, pad.y + pad.d / 2, SA_H + 1], S(slab(pad, SA_H, 1, 2, 0.2), { tone: "lo" }) + keys, [shape]);
}
turned("sta.port", upFrame(PORT_A[0], PORT_A[1], SA_H), [[0, 8], [1.2, 8], [1.2, 6.6], [COLLAR_H, 6.6]], { tone: "mid" });
for (const [x, y] of LAMP_A) {
  disc("sta.lamp.base", upFrame(x, y, SA_H), 0, 1.2, 3, { tone: "mid" });
  disc("sta.lamp.lens", upFrame(x, y, SA_H + 1.2), 0, 2, 2.1, { tone: "hi" });
}

// ---------------------------------------------------------------- estación B: el servidor (receptora)
const LAMP_B = [122, -22];
box("srv.body", SB, 0, SB_H, { tone: "mid" }, {
  inner: L(k.sideSeam(SB, SB_H - 7, P, 3), { tone: "faint" }),
  extra:
    L(k.planOutline(k.insetPlan(SB, 3), SB_H, P, 3), { tone: "faint" }) +
    D(k.corners(SB, 1.6).map(([x, y]) => at([x, y, SB_H])), { size: 0.45 }) +
    windowOn("b", SB.y + SB.d, SB.x + 5, SB.x + SB.w - 5, 10, 24, 2.8) +
    L([[SB.x + 5, SB.x + 20], [SB.x + 24, SB.x + 39]].map(([x0, x1]) => frontRect(SB.y + SB.d, x0, x1, 28, 32)).join(""), { tone: "lo" }) +
    D([at([SB.x + 18, SB.y + SB.d, 30]), at([SB.x + 37, SB.y + SB.d, 30])], { size: 0.5, tone: "hi" }) +
    D([[SB.x + 2.4, 4], [SB.x + SB.w - 2.4, 4], [SB.x + 2.4, 33], [SB.x + SB.w - 2.4, 33]].map(([x, z]) => at([x, SB.y + SB.d, z])), { size: 0.45 }) +
    L([0, 1, 2, 3, 4].map((i) => sideRect(SB.x + SB.w, -24 + i * 6, -20 + i * 6, 8, 34)).join(""), { tone: "lo" }),
});
turned("srv.port", upFrame(PORT_B[0], PORT_B[1], SB_H), [[0, 8], [1.2, 8], [1.2, 6.6], [COLLAR_H, 6.6]], { tone: "mid" });
disc("srv.lamp.base", upFrame(LAMP_B[0], LAMP_B[1], SB_H), 0, 1.2, 3, { tone: "mid" });
disc("srv.lamp.lens", upFrame(LAMP_B[0], LAMP_B[1], SB_H + 1.2), 0, 2, 2.1, { tone: "hi" });

// ---------------------------------------------------------------- soplador y válvula desviadora
const GAUGE = [9, CAB.y + CAB.d, 40];
box("cab.body", CAB, 0, CAB_H, { tone: "mid" }, {
  inner: L(k.sideSeam(CAB, 50, P, 3), { tone: "faint" }),
  extra:
    L([0, 1, 2, 3, 4].map((i) => frontSlot(CAB.y + CAB.d, CAB.x + 6, CAB.x + CAB.w - 6, 8 + i * 4, 10 + i * 4)).join(""), { tone: "lo" }) +
    D([[CAB.x + 2.4, 4], [CAB.x + CAB.w - 2.4, 4], [CAB.x + 2.4, 46], [CAB.x + CAB.w - 2.4, 46]].map(([x, z]) => at([x, CAB.y + CAB.d, z])), { size: 0.45 }) +
    L(frontRect(CAB.y + CAB.d, CAB.x + 4, CAB.x + 16, 35, 45), { tone: "lo" }) +
    L([0, 1, 2].map((i) => k.pathOf([at([CAB.x + 6, CAB.y + CAB.d, 38 + i * 2.4]), at([CAB.x + 6 + [9, 6, 8][i], CAB.y + CAB.d, 38 + i * 2.4])])).join(""), { tone: "lo", free: true }),
});
// manómetro del soplador: sube cuando hay una cápsula en camino
{
  const F = G.frameAlong([GAUGE[0], GAUGE[1], GAUGE[2]], [0, 1, 0]);
  const ticks = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * 1.25 - (i / 8) * Math.PI * 1.5;
    const r0 = i % 4 === 0 ? 4.2 : 4.9;
    ticks.push(k.pathOf([at([GAUGE[0] + Math.cos(a) * r0, GAUGE[1] + 1.2, GAUGE[2] + Math.sin(a) * r0]), at([GAUGE[0] + Math.cos(a) * 5.6, GAUGE[1] + 1.2, GAUGE[2] + Math.sin(a) * 5.6])]));
  }
  disc("cab.gauge", F, 0, 1.2, 6.6, { tone: "hi" }, { extra: L(G.circleOf(F, 1.2, 5.6, P, 48), { tone: "lo" }) + L(ticks.join(""), { tone: "mid" }) });
}
// motor del soplador en el costado
{
  const F = G.frameAlong([CAB.x + CAB.w, -9, 30], [1, 0, 0]);
  turned("cab.motor", F, [[0, 11], [1.6, 11], [1.6, 9.4], [12, 9.4], [12, 8], [14, 8], [15.2, 6.4, 1], [16, 3]], { tone: "mid" }, {
    inner: L(G.arcOf(F, 4, 9.4, P) + G.arcOf(F, 8, 9.4, P), { tone: "faint" }),
    extra: D(G.dotsOf(F, 1.6, 10.2, 8, P, { fade: [0.04, 0.42] }).map((p) => p), { size: 0.42 }),
  });
}
box("valve.body", VALVE, VALVE_Z, VALVE_H, { tone: "mid" }, {
  inner: L(k.sideSeam(VALVE, VTOP - 5, P, 3), { tone: "faint" }),
  extra:
    L(k.planOutline(k.insetPlan(VALVE, 3), VTOP, P, 3), { tone: "faint" }) +
    D(k.corners(VALVE, 1.6).map(([x, y]) => at([x, y, VTOP])), { size: 0.45 }) +
    D([[VALVE.x + 2.4, VALVE_Z + 3], [VALVE.x + VALVE.w - 2.4, VALVE_Z + 3]].map(([x, z]) => at([x, VALVE.y + VALVE.d, z])), { size: 0.45 }),
});
const HUB = [0, LINE_Y, VTOP];
disc("valve.knob", upFrame(HUB[0], HUB[1], VTOP), 0, 1.6, 7, { tone: "mid" }, { extra: "" });
disc("valve.hub", upFrame(HUB[0], HUB[1], VTOP + 1.6), 0, 3, 3, { tone: "hi" });
const LEVER_Z = VTOP + 4.6;
// marcas de PASO (a lo largo de la línea) y DESVÍO (hacia el banco) en el plato de la válvula
{
  // empiezan bajo el cubo (que se pinta después) y terminan en el borde del plato
  const marks = [0, Math.PI / 2].map((a) => k.lineOnTop([HUB[0] + Math.cos(a) * 2.4, HUB[1] + Math.sin(a) * 2.4], [HUB[0] + Math.cos(a) * 7, HUB[1] + Math.sin(a) * 7], VTOP + 1.6, P));
  R.items.find((item) => item.name === "valve.knob").svg += L(marks.join(""), { tone: "hi" });
}

// ---------------------------------------------------------------- banco de lectura del atacante
box("bench.body", BENCH, 0, BENCH_H, { tone: "mid" }, {
  extra:
    windowOn("x", BENCH.y + BENCH.d, BENCH.x + 6, BENCH.x + BENCH.w - 6, 4, 16, 3) +
    D([[BENCH.x + 2.4, 3], [BENCH.x + BENCH.w - 2.4, 3], [BENCH.x + 2.4, 17], [BENCH.x + BENCH.w - 2.4, 17]].map(([x, z]) => at([x, BENCH.y + BENCH.d, z])), { size: 0.45 }) +
    L([0, 1, 2].map((i) => sideRect(BENCH.x + BENCH.w, 26 + i * 9, 32 + i * 9, 5, 15)).join(""), { tone: "lo" }) +
    D([0, 1, 2].map((i) => at([BENCH.x + BENCH.w, 29 + i * 9, 10])), { size: 0.55, tone: "hi" }),
});
box("bench.top", TOP, BENCH_H, 3, { tone: "mid" }, { bevel: 0.6 });
const TRAY = { x: -16, y: 38, w: 32, d: 14, r: 1.5 };
box("bench.tray", TRAY, TOP_Z, 0.6, { tone: "lo", crease: "none" }, { bevel: 0 });
for (const y of [TRAY_Y - 4.6, TRAY_Y + 3.4]) box("bench.rail", { x: TRAY.x + 1, y, w: TRAY.w - 2, d: 1.2, r: 0.3 }, TOP_Z + 0.6, RAIL_Z - TOP_Z - 0.6, { tone: "hi", crease: "lo" }, { steps: 2, bevel: 0.2, extra: "" });
BLOCKS.forEach((plan, i) => {
  const fy = plan.y + plan.d;
  const cx = plan.x + plan.w / 2;
  box(i ? "bench.sender" : "bench.receiver", plan, TOP_Z, BLOCK_H, { tone: "mid" }, {
    inner: L(k.sideSeam(plan, TOP_Z + BLOCK_H - 3, P, 3), { tone: "faint" }),
    extra:
      `<path class="mitm-slot" d="${frontSlot(fy, cx - CAPS_R - 0.8, cx + CAPS_R + 0.8, CAPS_Z - CAPS_R - 0.8, CAPS_Z + CAPS_R + 0.8)}"/>` +
      L(frontSlot(fy, cx - CAPS_R - 0.8, cx + CAPS_R + 0.8, CAPS_Z - CAPS_R - 0.8, CAPS_Z + CAPS_R + 0.8), { tone: "hi" }) +
      D([at([plan.x + 1.6, fy, TOP_Z + BLOCK_H - 1.4]), at([plan.x + plan.w - 1.6, fy, TOP_Z + BLOCK_H - 1.4])], { size: 0.45 }),
  });
});
// lupa del atacante: un brazo con lente sobre la bandeja
{
  const base = [-29, 47];
  disc("bench.lamp.foot", upFrame(base[0], base[1], TOP_Z), 0, 1.4, 4.4, { tone: "lo" });
  turned("bench.lamp.post", upFrame(base[0], base[1], TOP_Z + 1.4), [[0, 1], [16, 1]], { tone: "mid" });
  turned("bench.lamp.joint", upFrame(base[0], base[1], TOP_Z + 17.4), [[0, 2], [2.2, 2]], { tone: "hi" });
  const LENS_X = base[0] + 15;
  const armF = G.frameAlong([base[0] + 2, base[1], TOP_Z + 18.5], [1, 0, 0]);
  turned("bench.lamp.arm", armF, [[0, 1], [LENS_X - 4.4 - base[0] - 2, 1]], { tone: "mid" });
  const lensF = upFrame(LENS_X, base[1], TOP_Z + 17.2);
  turned("bench.lamp.lens", lensF, [[0, 4.4], [2.4, 4.4]], { tone: "hi" }, { extra: L(G.circleOf(lensF, 2.4, 3.4, P, 40), { tone: "lo" }) });
}

// ---------------------------------------------------------------- postes y tubos
for (const x of POSTS) {
  const top = LINE_Z - MAIN_R * 1.18;
  disc("post.foot", upFrame(x, LINE_Y, 0), 0, 1.2, 4, { tone: "lo" });
  box("post", { x: x - 1.2, y: LINE_Y - 1.6, w: 2.4, d: 3.2, r: 0.4 }, 1.2, top - 1.2, { tone: "mid" }, { steps: 2, bevel: 0.2 });
}
const pLeft = [[PORT_A[0], LINE_Y, SA_H + COLLAR_H], [PORT_A[0], LINE_Y, LINE_Z], [VALVE.x, LINE_Y, LINE_Z]];
const pRight = [[VALVE.x + VALVE.w, LINE_Y, LINE_Z], [PORT_B[0], LINE_Y, LINE_Z], [PORT_B[0], LINE_Y, SB_H + COLLAR_H]];
{
  const probe = G.fillet(pLeft, MAIN_R * 2.6, 14, { P, tube: MAIN_R });
  pipe("line.left", pLeft, MAIN_R, { bands: [arcAtX(probe, POSTS[0])] });
  const probe2 = G.fillet(pRight, MAIN_R * 2.6, 14, { P, tube: MAIN_R });
  pipe("line.right", pRight, MAIN_R, { bands: [arcAtX(probe2, POSTS[1])] });
}
const fy = VALVE.y + VALVE.d;
pipe("branch.out", [[-9, fy, BR_Z], [-9, LANE_Y, BR_Z], [-9, LANE_Y, BLOCK_TOP]], BR_R);
pipe("branch.back", [[9, fy, BR_Z], [9, LANE_Y, BR_Z], [9, LANE_Y, BLOCK_TOP]], BR_R);

// ---------------------------------------------------------------- orden y figura
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const items = R.items.map((item) => `<g data-name="${item.name}">${item.svg}</g>`).join("");

// palanca de la válvula, pilotos y aguja (se mueven en vivo)
const lever = (angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return k.lineOnTop([HUB[0] + c * 3, HUB[1] + s * 3], [HUB[0] + c * 13, HUB[1] + s * 13], LEVER_Z, P);
};
const leverTip = (angle) => at([HUB[0] + Math.cos(angle) * 13, HUB[1] + Math.sin(angle) * 13, LEVER_Z]);
const needle = (share) => {
  const a = Math.PI * 1.25 - share * Math.PI * 1.5;
  return k.pathOf([at([GAUGE[0], GAUGE[1] + 1.2, GAUGE[2]]), at([GAUGE[0] + Math.cos(a) * 4.6, GAUGE[1] + 1.2, GAUGE[2] + Math.sin(a) * 4.6])]);
};
const lampSvg = (x, y, z, cls) => `<g class="${cls}">${S(k.cylinder(x, y, 2.1, z, 2, P, 24), { tone: "hi", lit: true })}${D([at([x, y, z + 2])], { size: 0.9, tone: "hi" })}</g>`;
const live = [
  `<path data-part="lever" class="iso-line mitm-lever" data-tone="hi" d="${lever(0)}"/>`,
  `<circle data-part="grip" class="mitm-grip" cx="${f2(leverTip(0)[0])}" cy="${f2(leverTip(0)[1])}" r="${f2(1.5 * KS)}"/>`,
  `<path data-part="needle" class="iso-line" data-tone="lit" data-free="end" d="${needle(0)}" style="stroke-width:.9"/>`,
  D([at([GAUGE[0], GAUGE[1] + 1.2, GAUGE[2]])], { size: 0.8, tone: "hi" }),
  `<g data-part="lampOk" opacity="0">${lampSvg(LAMP_A[0][0], LAMP_A[0][1], SA_H + 1.2, "mitm-lamp")}</g>`,
  `<g data-part="lampAlarm" opacity="0">${lampSvg(LAMP_A[1][0], LAMP_A[1][1], SA_H + 1.2, "mitm-lamp mitm-alarm")}</g>`,
  `<g data-part="lampSeal" opacity="0">${lampSvg(LAMP_B[0], LAMP_B[1], SB_H + 1.2, "mitm-lamp")}</g>`,
].join("");

// máscaras: la cápsula solo se ve donde el tubo de vidrio se ve, o sobre el banco fuera de los bloques
const valveFill = k.slabOf(VALVE, VALVE_Z, VALVE_H, P, 3).fill;
const blockFills = BLOCKS.map((plan) => k.slabOf(plan, TOP_Z, BLOCK_H, P, 3).fill).join("");
const BIG = `M-50 -50H${WIDTH + 50}V${HEIGHT + 50}H-50Z`;
const masks = `<defs>
<mask id="mitm-in-tube" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"><path fill="#fff" d="${BODY.join("")}"/><path fill="#000" d="${valveFill}"/></mask>
<mask id="mitm-on-bench" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"><path fill="#fff" d="${BIG}"/><path fill="#000" d="${blockFills}"/></mask>
</defs>`;
const capsules = `<g data-part="capsule" style="display:none"><g data-mask></g></g><g mask="url(#mitm-in-tube)"><path class="mitm-shine" d="${SHINE.join("")}"/></g>`;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Una línea de tubo neumático sobre una placa, que representa una red local. A la izquierda, la estación emisora de la víctima con un teclado, una ventana y dos pilotos. A la derecha, la estación receptora del servidor. En el centro, sobre el armario del soplador, una válvula desviadora con una palanca: en posición de paso las cápsulas van directas; girada, las manda por dos ramales al banco de lectura del atacante, donde se abren, se leen y se pueden cambiar antes de reenviarlas.",
  body: [masks, ...back, items, live, capsules],
});

// ---------------------------------------------------------------- datos para la parte viva
const route2d = (name, spacing = 0.5) => {
  const { line, total } = TUBES[name];
  const pts = G.resample(line, spacing);
  return { total: f2(total), step: f2(total / (pts.length - 1)), pts: pts.map((p) => at(p).map(f2)) };
};
const DATA = {
  P,
  KS: f2(KS),
  CAPS: { r: CAPS_R, l: CAPS_L, z: CAPS_Z, trayY: TRAY_Y, laneY: LANE_Y, lanes: [-9, 9], blockTop: BLOCK_TOP },
  routes: Object.fromEntries(["line.left", "line.right", "branch.out", "branch.back"].map((name) => [name, route2d(name)])),
  HUB,
  LEVER_Z,
  GAUGE,
  windows: WINDOWS,
};

// ---------------------------------------------------------------- panel de controles y lecturas
const TOGGLES = [
  { id: "attacker", n: 1, label: "Atacante en medio", off: "Inactivo", on: "Activo", value: true },
  { id: "https", n: 2, label: "Protocolo", off: "HTTP", on: "HTTPS", value: false },
  { id: "modify", n: 3, label: "Modificar el mensaje", off: "No", on: "Sí", value: false },
];
const panel = `
<div class="mitm-panel">
  <div class="mitm-controls">${TOGGLES.map((t) => `
    <div class="mitm-control" role="group" aria-labelledby="mitm-${t.id}-label">
      <span class="mitm-control-head" id="mitm-${t.id}-label"><span class="mitm-no">${t.n}</span>${t.label}</span>
      <span class="mitm-seg"><button type="button" data-toggle="${t.id}" data-value="false" aria-pressed="${!t.value}">${t.off}</button><button type="button" data-toggle="${t.id}" data-value="true" aria-pressed="${t.value}">${t.on}</button></span>
    </div>`).join("")}
  </div>
  <div class="mitm-reads" aria-live="polite">
    <div class="mitm-read"><span class="mitm-what">La víctima envió</span><span class="mitm-val" data-read="sent">…</span></div>
    <div class="mitm-read"><span class="mitm-what">El atacante vio</span><span class="mitm-val" data-read="seen">…</span></div>
    <div class="mitm-read"><span class="mitm-what">El servidor recibió</span><span class="mitm-val" data-read="got">…</span></div>
  </div>
  <p class="mitm-step" data-read="step">Preparando…</p>
  <div class="mitm-actions"><button type="button" data-act="pause">Pausa</button><button type="button" data-act="again">Repetir envío</button></div>
</div>`;

const CSS = `
.mitm-glass{fill:var(--anatomy-shade-0)}
body[data-theme="dark"] .mitm-glass{fill:#070707}
.mitm-text{letter-spacing:.04em}
.mitm-slot{fill:var(--anatomy-shade-0)}
body[data-theme="dark"] .mitm-slot{fill:#070707}
.mitm-lever{stroke-width:2.2}
.mitm-grip{fill:var(--anatomy-hi);stroke:var(--anatomy-card);stroke-width:.4}
.mitm-alarm .iso-top,.mitm-alarm .iso-shade{fill:var(--anatomy-red)!important;stroke:var(--anatomy-red)!important}
.mitm-alarm .iso-dot{fill:var(--anatomy-red)}
.mitm-shine{fill:var(--anatomy-top);opacity:.4;pointer-events:none}
.mitm-cap-edge{fill:none;stroke-linecap:round;stroke-linejoin:round}
.mitm-cap-edge[data-kind="data"]{stroke:var(--anatomy-lit)}
.mitm-cap-edge[data-kind="cert"]{stroke:var(--anatomy-hi)}
.mitm-cap-fill{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke:var(--anatomy-lit-top)}
.mitm-cap-fill[data-kind="cert"]{stroke:var(--anatomy-face)}
.mitm-cap-line{fill:none;stroke:var(--anatomy-mid);stroke-width:.6;stroke-linecap:round}
.mitm-paper{fill:none;stroke:var(--anatomy-hi);stroke-width:4;stroke-linecap:butt}
.mitm-cap-shape{fill:var(--anatomy-lit-top);stroke:var(--anatomy-lit);stroke-width:.6;stroke-linejoin:round}
.mitm-seal{fill:var(--anatomy-lit);stroke:var(--anatomy-card);stroke-width:.4}
.mitm-stamp{fill:var(--anatomy-hi)}
.mitm-stamp[data-fake]{fill:var(--anatomy-card);stroke:var(--anatomy-red);stroke-width:.7}
.mitm-panel{margin-top:22px;display:grid;gap:16px;font-size:13px;color:var(--anatomy-text)}
.mitm-controls{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.mitm-control{display:grid;gap:7px}
.mitm-control-head{display:flex;align-items:baseline;gap:6px;color:var(--anatomy-strong)}
.mitm-no{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;box-shadow:0 0 0 1px var(--anatomy-mid);font:10px/1 var(--anatomy-mono);color:var(--anatomy-text)}
.mitm-seg{display:grid;grid-template-columns:1fr 1fr;box-shadow:0 0 0 1px var(--anatomy-mid)}
.mitm-seg button,.mitm-actions button{font:12px/1 var(--anatomy-mono);padding:8px 10px;border:0;border-radius:0;background:var(--anatomy-card);color:var(--anatomy-text);cursor:pointer}
.mitm-seg button[aria-pressed="true"]{background:var(--anatomy-strong);color:var(--anatomy-card)}
.mitm-reads{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--anatomy-faint);box-shadow:0 0 0 1px var(--anatomy-faint)}
.mitm-read{display:grid;align-content:start;gap:4px;padding:10px 12px;background:var(--anatomy-card);min-height:86px}
.mitm-what{font-size:11.5px;color:var(--anatomy-muted)}
.mitm-val{font:12.5px/1.45 var(--anatomy-mono);color:var(--anatomy-strong);overflow-wrap:anywhere}
.mitm-val[data-tone="alert"]{color:var(--anatomy-red)}
.mitm-step{margin:0;font-size:12.5px;color:var(--anatomy-text);min-height:2.9em}
.mitm-actions{display:flex;gap:8px}
.mitm-actions button{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-mid)}
.mitm-actions button:hover,.mitm-seg button:hover{box-shadow:0 0 0 1px var(--anatomy-hi)}
.mitm-seg button:focus-visible,.mitm-actions button:focus-visible,.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:4px}
@media (max-width:560px){.iso-stage{overflow:hidden}.iso-stage svg{width:104%;margin:-3% 0 -3% -2%}.mitm-controls,.mitm-reads{grid-template-columns:1fr}.mitm-read{min-height:0}}
`;

const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("const DATA = __DATA__;", "const DATA = " + JSON.stringify(DATA) + ";");

const body = k.plateHtml({
  fig: "Fig 2",
  title: "Man-in-the-middle",
  hint: "Teclas 1 · 2 · 3 o los botones",
  readout: "…",
  keys: [
    { mark: "lit", label: "La cápsula: el mensaje de la víctima" },
    { mark: "raised", label: "Válvula desviadora: el atacante se pone en medio (ARP spoofing)" },
    { mark: "edge", label: "Lacre y sello: TLS cifra y el certificado prueba quién es el servidor" },
  ],
  caption:
    "Un ataque man-in-the-middle hecho máquina. La placa es la red local; el tubo, el camino de los paquetes entre la víctima (izquierda) y el servidor (derecha). Con ARP spoofing el atacante convence a los dos de que él es el camino: es la válvula girada, que manda cada cápsula a su banco y luego la reenvía. Con HTTP la cápsula va abierta: el banco lee el texto y puede cambiarlo, y el servidor no tiene forma de notarlo. Con HTTPS, antes de enviar nada el servidor manda su certificado y la víctima lo comprueba; después el mensaje viaja cifrado y sellado: el banco solo ve bytes sin sentido (y a qué servidor van). Si el atacante pone su propio certificado para poder abrirlo, la comprobación falla, salta el aviso y la víctima no envía nada; y si cambiara bytes cifrados, el sello roto haría que el servidor los descartara.",
  body: `<div class="iso-stage" tabindex="0" role="group" aria-label="Ataque man-in-the-middle. Tecla 1: atacante. Tecla 2: HTTP o HTTPS. Tecla 3: modificar el mensaje. Espacio: pausa.">${svg}</div>${panel}`,
});

const html = k
  .pageHtml({ title: "Man-in-the-middle", theme, body, script: kitScript() + LIVE })
  .replace('<html lang="en">', '<html lang="es">')
  .replace("</style>", CSS + "</style>");
const name = theme === "light" ? "mitm-light.html" : "mitm.html";
writeFileSync(join(HERE, name), html);
console.log("wrote", name, `${(html.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `scale ${KS.toFixed(3)}`);

A.auditOrExit(R, P, {});
