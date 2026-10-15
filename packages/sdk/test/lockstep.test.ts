import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { MerkleSumTree } from "../src/index.ts";
import {
  verifyVkMatchesFixtures,
} from "../../../.github/scripts/check-vk-fixtures.mjs";

// The same verifying key lives in apps/web/lib/vk.json (submitted by the issuer
// console) and in packages/contracts/.../fixtures.rs (the contract's test
// fixtures). Only packages/circuits/scripts/encode_p.mjs keeps them in sync, and
// nothing fails if they drift. This spec pins them together, plus the SDK tree
// that the circuit's public roots were generated from.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const vkPath = resolve(repoRoot, "apps/web/lib/vk.json");
const fixturesPath = resolve(
  repoRoot,
  "packages/contracts/contracts/attestar/src/fixtures.rs",
);
const checkScriptPath = resolve(repoRoot, ".github/scripts/check-vk-fixtures.mjs");
const vkRaw = readFileSync(vkPath, "utf8");
const vk = JSON.parse(vkRaw);
const fixtures = readFileSync(fixturesPath, "utf8");

function hexToBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

/** Parse `pub const NAME: [u8; N] = [0x.., ..];`. */
function parseBytes(src: string, name: string): number[] {
  const match = src.match(new RegExp(`pub const ${name}: \\[u8; \\d+\\] = \\[([^\\]]*)\\]`));
  if (!match) throw new Error(`fixtures.rs is missing ${name}`);
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseInt(s, 16));
}

/** Parse `pub const NAME: [[u8; N]; M] = [ [..], .. ];`. */
function parseArrayOfArrays(src: string, name: string): number[][] {
  const match = src.match(new RegExp(`pub const ${name}: \\[\\[u8; \\d+\\]; \\d+\\] = \\[([\\s\\S]*?)\\]\\s*;`));
  if (!match) throw new Error(`fixtures.rs is missing ${name}`);
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

function be32Hex(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function flipHexByteAt(hex: string, byteOffset: number): string {
  const pos = byteOffset * 2;
  const orig = parseInt(hex.slice(pos, pos + 2), 16);
  const flipped = (orig ^ 0xff).toString(16).padStart(2, "0");
  return hex.slice(0, pos) + flipped + hex.slice(pos + 2);
}

describe("vk.json ↔ fixtures.rs lockstep", () => {
  it("matches every group element byte-for-byte", () => {
    expect(hexToBytes(vk.alpha)).toEqual(parseBytes(fixtures, "ALPHA"));
    expect(hexToBytes(vk.beta)).toEqual(parseBytes(fixtures, "BETA"));
    expect(hexToBytes(vk.gamma)).toEqual(parseBytes(fixtures, "GAMMA"));
    expect(hexToBytes(vk.delta)).toEqual(parseBytes(fixtures, "DELTA"));
  });

  it("matches every IC point", () => {
    const ic = parseArrayOfArrays(fixtures, "IC");
    expect(vk.ic).toHaveLength(ic.length);
    vk.ic.forEach((hex: string, i: number) => {
      expect(hexToBytes(hex)).toEqual(ic[i]);
    });
  });

  it("has exactly five IC points (four public signals plus one)", () => {
    expect(parseArrayOfArrays(fixtures, "IC")).toHaveLength(5);
    expect(vk.ic).toHaveLength(5);
  });

  it("passes check-vk-fixtures verification on the current repository tree", () => {
    expect(verifyVkMatchesFixtures(vkRaw, fixtures)).toEqual({
      alphaBytes: 64,
      betaBytes: 128,
      gammaBytes: 128,
      deltaBytes: 128,
      icCount: 5,
    });
  });

  it("fails and names the mismatching element and first differing byte offset when one byte of vk.json is edited", () => {
    for (const [field, offset] of [
      ["alpha", 7],
      ["beta", 42],
      ["gamma", 99],
      ["delta", 127],
    ] as const) {
      const mutated = {
        ...vk,
        [field]: flipHexByteAt(vk[field], offset),
      };
      expect(() => verifyVkMatchesFixtures(mutated, fixtures)).toThrow(
        new RegExp(`mismatch in ${field} \\(${field.toUpperCase()}\\) at byte offset ${offset}\\b`),
      );
    }

    for (let idx = 0; idx < vk.ic.length; idx++) {
      const offset = idx * 11 + 3;
      const mutatedIc = [...vk.ic];
      mutatedIc[idx] = flipHexByteAt(vk.ic[idx], offset);
      const mutated = { ...vk, ic: mutatedIc };
      expect(() => verifyVkMatchesFixtures(mutated, fixtures)).toThrow(
        new RegExp(`mismatch in ic\\[${idx}\\] \\(IC\\[${idx}\\]\\) at byte offset ${offset}\\b`),
      );
    }
  });

  it("exits non-zero from the CLI script and names the mismatching element when a byte of vk.json is edited", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "attestar-vk-check-"));
    try {
      const badVkPath = join(tmpDir, "vk.json");
      const mutated = {
        ...vk,
        gamma: flipHexByteAt(vk.gamma, 19),
      };
      writeFileSync(badVkPath, JSON.stringify(mutated), "utf8");

      const res = spawnSync(process.execPath, [checkScriptPath, badVkPath, fixturesPath], {
        encoding: "utf8",
      });
      expect(res.status).not.toBe(0);
      expect(res.stderr).toMatch(/mismatch in gamma \(GAMMA\) at byte offset 19/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("reproduces S_LIAB_ROOT from the HOLDERS fixture in encode_p.mjs", async () => {
    // Mirrors the HOLDERS array in packages/circuits/scripts/encode_p.mjs.
    const holders = [
      { userId: 111n, balance: 5000n },
      { userId: 222n, balance: 3000n },
      { userId: 333n, balance: 1500n },
    ];
    const tree = await MerkleSumTree.build(holders, 4);
    expect(hexToBytes(be32Hex(tree.root))).toEqual(parseBytes(fixtures, "S_LIAB_ROOT"));
  });
});
