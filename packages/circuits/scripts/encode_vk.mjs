import fs from "node:fs";
import { encodeVerifyingKey, toHex } from "../../sdk/dist/index.js";

const circuit = process.argv[2] || "psolvency_demo";
const dir = `build/${circuit}`;
const vkey = JSON.parse(fs.readFileSync(`${dir}/${circuit}.vkey.json`, "utf8"));

const enc = encodeVerifyingKey(vkey);
const out = {
  alpha: toHex(enc.alpha),
  beta: toHex(enc.beta),
  gamma: toHex(enc.gamma),
  delta: toHex(enc.delta),
  ic: enc.ic.map(toHex),
};

fs.writeFileSync(`${dir}/arg_vk.json`, JSON.stringify(out));
console.log("wrote", `${dir}/arg_vk.json`);
