// Encode a circuit's Groth16 verifying key into the Soroban `arg_vk.json`
// argument file the contract's `set_verifier` and apps/web/lib/vk.json consume.
//
// Usage: node scripts/encode_vk.mjs [circuit]
//
// The app, the contract and the browser verifying key all use the two-tree
// `psolvency_demo` circuit, so that is the default. Any other name must have a
// matching `build/<circuit>/<circuit>.vkey.json` produced by
// `bash scripts/build.sh <circuit>`, otherwise the script exits non-zero and
// lists the build directories it can see.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeVerifyingKey, toHex } from "../../sdk/dist/index.js";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, "..");
const buildDir = path.join(root, "build");

function buildDirectories() {
  if (!fs.existsSync(buildDir)) return [];
  return fs
    .readdirSync(buildDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

const circuit = process.argv[2] || "psolvency_demo";
const dir = path.join(buildDir, circuit);
const vkeyPath = path.join(dir, `${circuit}.vkey.json`);

if (!fs.existsSync(vkeyPath)) {
  const available = buildDirectories();
  console.error(`unknown circuit "${circuit}": ${path.relative(root, vkeyPath)} does not exist`);
  console.error(
    available.length > 0
      ? `available build directories: ${available.join(", ")}`
      : "no build directories found; run `bash scripts/build.sh <circuit>` first",
  );
  process.exit(1);
}

const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));

const enc = encodeVerifyingKey(vkey);
const out = {
  alpha: toHex(enc.alpha),
  beta: toHex(enc.beta),
  gamma: toHex(enc.gamma),
  delta: toHex(enc.delta),
  ic: enc.ic.map(toHex),
};

const outPath = path.join(dir, "arg_vk.json");
fs.writeFileSync(outPath, JSON.stringify(out));
console.log("wrote", path.relative(root, outPath));
