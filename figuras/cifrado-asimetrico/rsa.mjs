// RSA de juguete: números pequeños, cuentas de verdad (con BigInt).
// El RSA real usa un módulo n de 2048 bits o más; aquí n tiene 12 bits para
// que se pueda seguir a mano. Este módulo no depende de nada: lo usa build.mjs
// para comprobar los números y se copia tal cual dentro de la página.

export function modPow(base, exp, mod) {
  let b = BigInt(base) % BigInt(mod);
  let e = BigInt(exp);
  const m = BigInt(mod);
  let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return Number(r);
}

export function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

// inverso modular por el algoritmo de Euclides extendido: d · e ≡ 1 (mod phi)
export function modInverse(e, phi) {
  let [r0, r1] = [phi, e];
  let [t0, t1] = [0, 1];
  while (r1) {
    const q = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - q * r1];
    [t0, t1] = [t1, t0 - q * t1];
  }
  if (r0 !== 1) throw new Error("e no tiene inverso módulo phi");
  return ((t0 % phi) + phi) % phi;
}

export function keyPair(p, q, e) {
  const n = p * q;
  const phi = (p - 1) * (q - 1);
  if (gcd(e, phi) !== 1) throw new Error("e debe ser coprimo con phi");
  const d = modInverse(e, phi);
  return { p, q, n, phi, e, d };
}

// La llave pública es (n, e); la privada es (n, d).
export const KEYS = keyPair(61, 53, 17);

// Mensaje: un número 0..n-1, o una letra (su código Unicode, "A" = 65).
export function messageOf(text, n = KEYS.n) {
  const raw = String(text ?? "").trim();
  if (/^\d+$/.test(raw)) {
    const value = Number(raw);
    return value < n ? { m: value, label: String(value), ok: true } : { m: value % n, label: String(value), ok: false };
  }
  const ch = [...raw][0] ?? "A";
  const code = ch.codePointAt(0);
  return code < n ? { m: code, label: `«${ch}»`, ok: true } : { m: code % n, label: `«${ch}»`, ok: false };
}

// Un recorrido completo de la máquina.
//   modo "cifrar": c = m^e mod n  (llave pública), luego  m' = c^k mod n
//   modo "firmar": s = m^k mod n  (llave privada), luego  v = s^e mod n
// k es d (llave privada) o, si se prueba la llave equivocada, e (una copia de la pública).
export function run(m, mode, wrong, keys = KEYS) {
  const { n, e, d } = keys;
  const k = wrong ? e : d;
  if (mode === "cifrar") {
    const c = modPow(m, e, n);
    const back = modPow(c, k, n);
    return { mode, m, k, steps: [{ key: "pública", exp: e, from: m, to: c }, { key: wrong ? "pública (equivocada)" : "privada", exp: k, from: c, to: back }], ok: back === m };
  }
  const s = modPow(m, k, n);
  const v = modPow(s, e, n);
  return { mode, m, k, steps: [{ key: wrong ? "pública (equivocada)" : "privada", exp: k, from: m, to: s }, { key: "pública", exp: e, from: s, to: v }], ok: v === m };
}
