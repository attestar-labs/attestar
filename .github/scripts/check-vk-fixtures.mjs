#!/usr/bin/env node
// Verify that apps/web/lib/vk.json and packages/contracts/contracts/attestar/src/fixtures.rs
// encode the exact same Groth16 verifying key (alpha, beta, gamma, delta, and every IC entry).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_SIZES = {
  alpha: 64,
  beta: 128,
  gamma: 128,
  delta: 128,
  ic: 64,
};

export function decodeHexBytes(hex, label, expectedLength) {
  if (typeof hex !== "string") {
    throw new Error(`vk.json ${label}: expected hex string, got ${typeof hex}`);
  }
  const normalized = hex.trim().replace(/^0x/i, "");
  if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error(`vk.json ${label}: invalid hex encoding`);
  }
  const bytes = [];
  for (let i = 0; i < normalized.length; i += 2) {
    bytes.push(parseInt(normalized.slice(i, i + 2), 16));
  }
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new Error(
      `vk.json ${label}: length mismatch at offset ${Math.min(bytes.length, expectedLength)} (expected ${expectedLength} bytes, got ${bytes.length})`,
    );
  }
  return bytes;
}

export function decodeVkJson(rawJson) {
  const parsed = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("vk.json must contain a JSON object");
  }
  if (!Array.isArray(parsed.ic)) {
    throw new Error("vk.json ic: expected an array of hex strings");
  }
  return {
    alpha: decodeHexBytes(parsed.alpha, "alpha", EXPECTED_SIZES.alpha),
    beta: decodeHexBytes(parsed.beta, "beta", EXPECTED_SIZES.beta),
    gamma: decodeHexBytes(parsed.gamma, "gamma", EXPECTED_SIZES.gamma),
    delta: decodeHexBytes(parsed.delta, "delta", EXPECTED_SIZES.delta),
    ic: parsed.ic.map((entry, idx) =>
      decodeHexBytes(entry, `ic[${idx}]`, EXPECTED_SIZES.ic),
    ),
  };
}

function parseRustByteList(listSrc, label, expectedLength) {
  const tokens = listSrc
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const bytes = tokens.map((tok, idx) => {
    if (!/^(0x[0-9a-fA-F]+|\d+)$/.test(tok)) {
      throw new Error(`fixtures.rs ${label}: invalid byte literal "${tok}" at offset ${idx}`);
    }
    const val = tok.startsWith("0x") || tok.startsWith("0X") ? parseInt(tok, 16) : parseInt(tok, 10);
    if (!Number.isInteger(val) || val < 0 || val > 255) {
      throw new Error(`fixtures.rs ${label}: byte out of range at offset ${idx}`);
    }
    return val;
  });
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new Error(
      `fixtures.rs ${label}: length mismatch at offset ${Math.min(bytes.length, expectedLength)} (expected ${expectedLength} bytes, got ${bytes.length})`,
    );
  }
  return bytes;
}

function parseConstBytes(src, constName, expectedLength) {
  const re = new RegExp(`pub\\s+const\\s+${constName}\\s*:\\s*\\[u8;\\s*(\\d+)\\]\\s*=\\s*\\[([^\\]]*)\\]\\s*;`);
  const match = src.match(re);
  if (!match) {
    throw new Error(`fixtures.rs is missing constant ${constName}`);
  }
  return parseRustByteList(match[2], constName, expectedLength);
}

function parseConstArrayOfArrays(src, constName, expectedInnerLength) {
  const re = new RegExp(
    `pub\\s+const\\s+${constName}\\s*:\\s*\\[\\[u8;\\s*(\\d+)\\];\\s*(\\d+)\\]\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;`,
  );
  const match = src.match(re);
  if (!match) {
    throw new Error(`fixtures.rs is missing constant ${constName}`);
  }
  const declaredCount = parseInt(match[2], 10);
  const rows = match[3].match(/\[[^\]]*\]/g) ?? [];
  if (rows.length !== declaredCount) {
    throw new Error(
      `fixtures.rs ${constName}: declared ${declaredCount} entries, found ${rows.length}`,
    );
  }
  return rows.map((row, idx) =>
    parseRustByteList(row.slice(1, -1), `${constName}[${idx}]`, expectedInnerLength),
  );
}

export function decodeFixturesRs(fixturesSrc) {
  return {
    alpha: parseConstBytes(fixturesSrc, "ALPHA", EXPECTED_SIZES.alpha),
    beta: parseConstBytes(fixturesSrc, "BETA", EXPECTED_SIZES.beta),
    gamma: parseConstBytes(fixturesSrc, "GAMMA", EXPECTED_SIZES.gamma),
    delta: parseConstBytes(fixturesSrc, "DELTA", EXPECTED_SIZES.delta),
    ic: parseConstArrayOfArrays(fixturesSrc, "IC", EXPECTED_SIZES.ic),
  };
}

function formatByte(b) {
  return "0x" + b.toString(16).padStart(2, "0");
}

function assertBytesEqual(vkBytes, fixtureBytes, vkName, fixtureName) {
  const minLen = Math.min(vkBytes.length, fixtureBytes.length);
  for (let offset = 0; offset < minLen; offset++) {
    if (vkBytes[offset] !== fixtureBytes[offset]) {
      throw new Error(
        `Verifying key mismatch in ${vkName} (${fixtureName}) at byte offset ${offset}: vk.json has ${formatByte(vkBytes[offset])}, fixtures.rs has ${formatByte(fixtureBytes[offset])}`,
      );
    }
  }
  if (vkBytes.length !== fixtureBytes.length) {
    throw new Error(
      `Verifying key length mismatch in ${vkName} (${fixtureName}) at byte offset ${minLen}: vk.json has ${vkBytes.length} bytes, fixtures.rs has ${fixtureBytes.length} bytes`,
    );
  }
}

export function verifyVkMatchesFixtures(vkRaw, fixturesRaw) {
  const vk = decodeVkJson(vkRaw);
  const fixtures = decodeFixturesRs(fixturesRaw);

  assertBytesEqual(vk.alpha, fixtures.alpha, "alpha", "ALPHA");
  assertBytesEqual(vk.beta, fixtures.beta, "beta", "BETA");
  assertBytesEqual(vk.gamma, fixtures.gamma, "gamma", "GAMMA");
  assertBytesEqual(vk.delta, fixtures.delta, "delta", "DELTA");

  if (vk.ic.length !== fixtures.ic.length) {
    throw new Error(
      `Verifying key mismatch in ic (IC) count at index ${Math.min(vk.ic.length, fixtures.ic.length)}: vk.json has ${vk.ic.length} entries, fixtures.rs has ${fixtures.ic.length} entries`,
    );
  }

  for (let i = 0; i < vk.ic.length; i++) {
    assertBytesEqual(vk.ic[i], fixtures.ic[i], `ic[${i}]`, `IC[${i}]`);
  }

  return {
    alphaBytes: vk.alpha.length,
    betaBytes: vk.beta.length,
    gammaBytes: vk.gamma.length,
    deltaBytes: vk.delta.length,
    icCount: vk.ic.length,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "../..");
  const vkPath = path.resolve(repoRoot, process.argv[2] ?? "apps/web/lib/vk.json");
  const fixturesPath = path.resolve(
    repoRoot,
    process.argv[3] ?? "packages/contracts/contracts/attestar/src/fixtures.rs",
  );

  try {
    const vkRaw = fs.readFileSync(vkPath, "utf8");
    const fixturesRaw = fs.readFileSync(fixturesPath, "utf8");
    const summary = verifyVkMatchesFixtures(vkRaw, fixturesRaw);
    console.log(
      `vk.json matches fixtures.rs (alpha=${summary.alphaBytes}B, beta=${summary.betaBytes}B, gamma=${summary.gammaBytes}B, delta=${summary.deltaBytes}B, IC=${summary.icCount}x64B)`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`::error::${msg}`);
    process.exit(1);
  }
}
