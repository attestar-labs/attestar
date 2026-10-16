import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { MerkleSumTree, fieldToBytes } from "../src/index.ts";

// The same verifying key lives in apps/web/lib/vk.json (submitted by the issuer
// console) and in packages/contracts/.../fixtures.rs (the contract's test
// fixtures). Only packages/circuits/scripts/encode_p.mjs keeps them in sync, and
// nothing fails if they drift. This spec pins them together, plus the SDK tree
// that the circuit's public roots were generated from.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const vk = JSON.parse(readFileSync(resolve(repoRoot, "apps/web/lib/vk.json"), "utf8"));
const fixtures = readFileSync(
  resolve(repoRoot, "packages/contracts/contracts/attestar/src/fixtures.rs"),
  "utf8",
);

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

  it("check-vk-fixtures.mjs passes on the current tree and names the mismatching element and byte offset when 1 byte is edited", async () => {
    // @ts-expect-error -- .mjs helper invoked by CI
    const { verifyVkMatchesFixtures } = await import("../../../.github/scripts/check-vk-fixtures.mjs");
    expect(() => verifyVkMatchesFixtures(vk, fixtures)).not.toThrow();

    const mutatedGamma = {
      ...vk,
      gamma: "ff" + vk.gamma.slice(2),
    };
    expect(() => verifyVkMatchesFixtures(mutatedGamma, fixtures)).toThrow(
      /Mismatch in gamma \(GAMMA\) at byte offset 0/,
    );

    const mutatedIc = {
      ...vk,
      ic: vk.ic.map((entry: string, idx: number) =>
        idx === 2 ? entry.slice(0, 10) + (entry.slice(10, 12) === "00" ? "01" : "00") + entry.slice(12) : entry,
      ),
    };
    expect(() => verifyVkMatchesFixtures(mutatedIc, fixtures)).toThrow(
      /Mismatch in ic\[2\] \(IC\[2\]\) at byte offset 5/,
    );
  });
});
