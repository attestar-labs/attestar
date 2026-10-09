function toBytes32BE(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function fieldToBytes(value: bigint | string): Uint8Array {
  return toBytes32BE(BigInt(value));
}

// Encodes a whole list of field elements to their concatenated 32-byte
// big-endian form. This is the single home for field-element-to-bytes: the
// circuit build scripts import it rather than re-implementing the conversion.
// An empty input yields an empty byte array.
export function encodeFieldElements(values: readonly (bigint | string)[]): Uint8Array {
  return concat(values.map(fieldToBytes));
}

// G1 affine -> be(X) || be(Y), 64 bytes.
export function encodeG1(point: string[]): Uint8Array {
  return concat([toBytes32BE(BigInt(point[0])), toBytes32BE(BigInt(point[1]))]);
}

// G2 affine -> be(X.c1) || be(X.c0) || be(Y.c1) || be(Y.c0), 128 bytes.
// snarkjs gives each coordinate as [c0, c1], so the imaginary part comes first.
export function encodeG2(point: string[][]): Uint8Array {
  return concat([
    toBytes32BE(BigInt(point[0][1])),
    toBytes32BE(BigInt(point[0][0])),
    toBytes32BE(BigInt(point[1][1])),
    toBytes32BE(BigInt(point[1][0])),
  ]);
}

export interface EncodedProof {
  a: Uint8Array;
  b: Uint8Array;
  c: Uint8Array;
}

export interface EncodedVerifyingKey {
  alpha: Uint8Array;
  beta: Uint8Array;
  gamma: Uint8Array;
  delta: Uint8Array;
  ic: Uint8Array[];
}

export function encodeProof(proof: {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}): EncodedProof {
  return {
    a: encodeG1(proof.pi_a),
    b: encodeG2(proof.pi_b),
    c: encodeG1(proof.pi_c),
  };
}

export function encodeVerifyingKey(vkey: {
  vk_alpha_1: string[];
  vk_beta_2: string[][];
  vk_gamma_2: string[][];
  vk_delta_2: string[][];
  IC: string[][];
}): EncodedVerifyingKey {
  return {
    alpha: encodeG1(vkey.vk_alpha_1),
    beta: encodeG2(vkey.vk_beta_2),
    gamma: encodeG2(vkey.vk_gamma_2),
    delta: encodeG2(vkey.vk_delta_2),
    ic: vkey.IC.map(encodeG1),
  };
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
