import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkVerifyingKey } from "./check-verifying-key.mjs";

const json = readFileSync(new URL("../../apps/web/lib/vk.json", import.meta.url), "utf8");
const rust = readFileSync(
  new URL("../../packages/contracts/contracts/attestar/src/fixtures.rs", import.meta.url), "utf8",
);
const check = (key, source = rust) => checkVerifyingKey(JSON.stringify(key), source);

test("committed key matches all contract entries", () => {
  assert.equal(checkVerifyingKey(json, rust), JSON.parse(json).ic.length);
});

test("CLI works outside the repository without a circuit build", () => {
  const script = fileURLToPath(new URL("./check-verifying-key.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script], { cwd: tmpdir(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Verifying key matches/);
});

test("CLI exits nonzero for a one-byte mismatch", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "attestar-vk-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const key = JSON.parse(json);
  const bytes = Buffer.from(key.beta, "hex");
  bytes[7] ^= 1;
  key.beta = bytes.toString("hex");
  const jsonPath = join(directory, "vk.json");
  const rustPath = join(directory, "fixtures.rs");
  writeFileSync(jsonPath, JSON.stringify(key));
  writeFileSync(rustPath, rust);
  const script = fileURLToPath(new URL("./check-verifying-key.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, jsonPath, rustPath], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /beta: mismatch at byte 7 /);
});

for (const name of ["alpha", "beta", "gamma", "delta", ...JSON.parse(json).ic.map((_, i) => `ic[${i}]`)]) {
  test(`one-byte mutation names ${name} and its first differing offset`, () => {
    const key = JSON.parse(json);
    const icIndex = name.startsWith("ic[") ? Number(name.slice(3, -1)) : null;
    const original = icIndex === null ? key[name] : key.ic[icIndex];
    const bytes = Buffer.from(original, "hex");
    bytes[bytes.length - 1] ^= 1;
    if (icIndex === null) key[name] = bytes.toString("hex");
    else key.ic[icIndex] = bytes.toString("hex");
    assert.throws(() => check(key), (error) => {
      assert.ok(error.message.startsWith(`${name}: mismatch at byte ${bytes.length - 1} `));
      return true;
    });
  });
}

test("Rust-side mutation is detected", () => {
  assert.throws(() => checkVerifyingKey(json, rust.replace("0x2d,", "0x2c,")), /alpha: mismatch at byte 0/);
});

test("hex case, Rust whitespace, comments and trailing commas do not change bytes", () => {
  const key = JSON.parse(json);
  key.alpha = key.alpha.toUpperCase();
  assert.equal(check(key, rust.replace("0x2d,", "0x2D, /* 0xff is only a comment */")), key.ic.length);
});

test("missing or extra IC entries cannot silently pass", () => {
  for (const change of [key => key.ic.pop(), key => key.ic.push(key.ic[0])]) {
    const key = JSON.parse(json);
    change(key);
    assert.throws(() => check(key), /ic: entry count mismatch/);
  }
});

test("malformed hex and truncated elements fail rather than Buffer silently truncating", () => {
  for (const value of ["zz", "a", JSON.parse(json).alpha.slice(2), null]) {
    const key = JSON.parse(json);
    key.alpha = value;
    assert.throws(() => check(key), /alpha: JSON/);
  }
});

test("missing and duplicate Rust constants fail closed", () => {
  assert.throws(() => checkVerifyingKey(json, rust.replace("const BETA:", "const OTHER:")), /BETA: expected exactly one/);
  assert.throws(() => checkVerifyingKey(json, rust + "\npub const ALPHA: [u8; 64] = [];"), /ALPHA: expected exactly one/);
});

test("Rust widths, declared IC count and byte values are validated", () => {
  for (const [source, message] of [
    [rust.replace("ALPHA: [u8; 64]", "ALPHA: [u8; 63]"), /ALPHA: unsupported Rust array type/],
    [rust.replace("IC: [[u8; 64]; 5]", "IC: [[u8; 64]; 6]"), /IC: Rust declares 6 entries but contains 5/],
    [rust.replace("0x2d,", "0x12d,"), /ALPHA: expected 64 Rust bytes/],
    [rust.replace("0x2d,", "unexpected(),"), /ALPHA: invalid Rust byte array literal/],
  ]) assert.throws(() => checkVerifyingKey(json, source), message);
});
