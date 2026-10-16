#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

export function hexToBytes(hex, label) {
  if (typeof hex !== "string" || hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Invalid hex string for ${label}`);
  }
  const out = [];
  for (let i = 0; i < hex.length; i += 2) {
    out.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

export function parseBytes(src, name) {
  const match = src.match(new RegExp(`pub const ${name}: \\[u8; \\d+\\] = \\[([^\\]]*)\\]`));
  if (!match) {
    throw new Error(`fixtures.rs is missing ${name}`);
  }
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseInt(s, 16));
}

export function parseArrayOfArrays(src, name) {
  const match = src.match(new RegExp(`pub const ${name}: \\[\\[u8; \\d+\\]; \\d+\\] = \\[([\\s\\S]*?)\\]\\s*;`));
  if (!match) {
    throw new Error(`fixtures.rs is missing ${name}`);
  }
  const rows = match[1].match(/\[[^\]]*\]/g) ?? [];
  return rows.map((row) =>
    row
      .replace(/[[\]]/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => parseInt(s, 16)),
  );
}

function formatByte(b) {
  return `0x${b.toString(16).padStart(2, "0")}`;
}

export function compareByteArrays(elementName, vkBytes, fixtureBytes) {
  if (vkBytes.length !== fixtureBytes.length) {
    throw new Error(
      `Mismatch in ${elementName}: length differs (vk.json=${vkBytes.length} bytes, fixtures.rs=${fixtureBytes.length} bytes)`,
    );
  }
  for (let offset = 0; offset < vkBytes.length; offset++) {
    if (vkBytes[offset] !== fixtureBytes[offset]) {
      throw new Error(
        `Mismatch in ${elementName} at byte offset ${offset}: vk.json=${formatByte(vkBytes[offset])} != fixtures.rs=${formatByte(fixtureBytes[offset])}`,
      );
    }
  }
}

export function verifyVkMatchesFixtures(vk, fixturesSrc) {
  const scalarPairs = [
    ["alpha", "ALPHA"],
    ["beta", "BETA"],
    ["gamma", "GAMMA"],
    ["delta", "DELTA"],
  ];

  for (const [jsonKey, rustConst] of scalarPairs) {
    const vkBytes = hexToBytes(vk[jsonKey], jsonKey);
    const fixtureBytes = parseBytes(fixturesSrc, rustConst);
    compareByteArrays(`${jsonKey} (${rustConst})`, vkBytes, fixtureBytes);
  }

  const fixtureIc = parseArrayOfArrays(fixturesSrc, "IC");
  if (!Array.isArray(vk.ic) || vk.ic.length !== fixtureIc.length) {
    throw new Error(
      `Mismatch in ic (IC) entry count: vk.json=${Array.isArray(vk.ic) ? vk.ic.length : "non-array"} != fixtures.rs=${fixtureIc.length}`,
    );
  }

  for (let i = 0; i < vk.ic.length; i++) {
    const vkBytes = hexToBytes(vk.ic[i], `ic[${i}]`);
    compareByteArrays(`ic[${i}] (IC[${i}])`, vkBytes, fixtureIc[i]);
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const vkPath = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(repoRoot, "apps/web/lib/vk.json");
  const fixturesPath = process.argv[3]
    ? resolve(process.argv[3])
    : resolve(repoRoot, "packages/contracts/contracts/attestar/src/fixtures.rs");

  try {
    const vk = JSON.parse(readFileSync(vkPath, "utf8"));
    const fixturesSrc = readFileSync(fixturesPath, "utf8");
    verifyVkMatchesFixtures(vk, fixturesSrc);
    console.log("OK: apps/web/lib/vk.json matches packages/contracts/contracts/attestar/src/fixtures.rs (alpha, beta, gamma, delta, and 5 IC entries).");
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
