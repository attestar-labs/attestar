import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultJson = fileURLToPath(new URL("../../apps/web/lib/vk.json", import.meta.url));
const defaultRust = fileURLToPath(
  new URL("../../packages/contracts/contracts/attestar/src/fixtures.rs", import.meta.url),
);

function decodeHex(value, name, size) {
  if (typeof value !== "string" || !/^(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new Error(`${name}: JSON value must contain complete hexadecimal bytes`);
  }
  const bytes = Buffer.from(value, "hex");
  if (bytes.length !== size) {
    throw new Error(`${name}: JSON has ${bytes.length} bytes; expected ${size}`);
  }
  return bytes;
}

// Decode the array literals emitted by encode_p.mjs, without executing Rust or JS.
// Fail closed if the generated format changes to an expression we do not support.
function decodeRust(source, name, size, nested = false) {
  const declarations = [...source.matchAll(
    new RegExp(`\\bpub\\s+const\\s+${name}\\s*:\\s*(\\[[^=]+\\])\\s*=\\s*([\\s\\S]*?);`, "g"),
  )];
  if (declarations.length !== 1) {
    throw new Error(`${name}: expected exactly one Rust constant`);
  }
  const [, type, literal] = declarations[0];
  const shape = type.match(nested
    ? /^\[\s*\[\s*u8\s*;\s*(\d+)\s*\]\s*;\s*(\d+)\s*\]$/
    : /^\[\s*u8\s*;\s*(\d+)\s*\]$/);
  if (!shape || Number(shape[1]) !== size) {
    throw new Error(`${name}: unsupported Rust array type ${type.trim()}`);
  }
  let values;
  try {
    values = JSON.parse(literal
      .replace(/\b0x[0-9a-f]+\b/gi, (hex) => String(Number(hex)))
      .replace(/,\s*\]/g, "]"));
  } catch {
    throw new Error(`${name}: invalid Rust byte array literal`);
  }
  if (!Array.isArray(values)) throw new Error(`${name}: expected a Rust array`);
  if (nested && values.length !== Number(shape[2])) {
    throw new Error(`${name}: Rust declares ${shape[2]} entries but contains ${values.length}`);
  }
  const rows = nested ? values : [values];
  return rows.map((row, index) => {
    const label = nested ? `${name}[${index}]` : name;
    if (!Array.isArray(row) || row.length !== size ||
        row.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
      throw new Error(`${label}: expected ${size} Rust bytes in the range 0..255`);
    }
    return Buffer.from(row);
  });
}

function compare(name, jsonBytes, rustBytes) {
  const offset = jsonBytes.findIndex((byte, index) => byte !== rustBytes[index]);
  if (offset !== -1) {
    const hex = (byte) => `0x${byte.toString(16).padStart(2, "0")}`;
    throw new Error(
      `${name}: mismatch at byte ${offset} (JSON ${hex(jsonBytes[offset])}, Rust ${hex(rustBytes[offset])})`,
    );
  }
}

export function checkVerifyingKey(jsonText, rustText) {
  const key = JSON.parse(jsonText);
  if (!key || typeof key !== "object" || Array.isArray(key)) {
    throw new Error("verifying key: expected a JSON object");
  }
  const source = rustText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "");
  for (const [name, size] of [["alpha", 64], ["beta", 128], ["gamma", 128], ["delta", 128]]) {
    const [rustBytes] = decodeRust(source, name.toUpperCase(), size);
    compare(name, decodeHex(key[name], name, size), rustBytes);
  }
  if (!Array.isArray(key.ic) || key.ic.length === 0) {
    throw new Error("ic: expected a nonempty JSON array");
  }
  const rustIc = decodeRust(source, "IC", 64, true);
  if (key.ic.length !== rustIc.length) {
    throw new Error(`ic: entry count mismatch (JSON ${key.ic.length}, Rust ${rustIc.length})`);
  }
  key.ic.forEach((value, index) => {
    const name = `ic[${index}]`;
    compare(name, decodeHex(value, name, 64), rustIc[index]);
  });
  return key.ic.length;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 0 && args.length !== 2) {
      throw new Error("Usage: node check-verifying-key.mjs [vk.json fixtures.rs]");
    }
    const [jsonPath = defaultJson, rustPath = defaultRust] = args;
    const count = checkVerifyingKey(readFileSync(jsonPath, "utf8"), readFileSync(rustPath, "utf8"));
    console.log(`Verifying key matches: alpha, beta, gamma, delta and ${count} IC entries`);
  } catch (error) {
    console.error(`Verifying key check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
