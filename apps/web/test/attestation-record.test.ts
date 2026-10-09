import { describe, expect, it } from "vitest";
import {
  CURRENT_ATTESTATION_VERSION,
  LEGACY_ATTESTATION_VERSION,
  UnsupportedSchemaVersionError,
  decodeAttestation,
} from "@/lib/attestation-record";

const root = (fill: number) => new Uint8Array(32).fill(fill);

const current = {
  version: CURRENT_ATTESTATION_VERSION,
  epoch: 7n,
  liab_root: root(1),
  res_root: root(2),
  onchain_reserves: 5000n,
  solvent: true,
  timestamp: 1_700_000_000n,
};

describe("decodeAttestation", () => {
  it("decodes a current (version 2) record and keeps the version", () => {
    const record = decodeAttestation(current);
    expect(record.version).toBe(CURRENT_ATTESTATION_VERSION);
    expect(record.epoch).toBe(7n);
    expect(record.solvent).toBe(true);
    expect(record.onchainBase).toBe(5000n);
    expect(record.timestamp).toBe(1_700_000_000n);
    expect(Array.from(record.liabRoot)).toEqual(Array.from(root(1)));
    expect(Array.from(record.resRoot)).toEqual(Array.from(root(2)));
  });

  it("treats a record with no version tag as the previous (version 1) layout", () => {
    const legacy = {
      epoch: current.epoch,
      liab_root: current.liab_root,
      res_root: current.res_root,
      onchain_reserves: current.onchain_reserves,
      solvent: current.solvent,
      timestamp: current.timestamp,
    };
    const record = decodeAttestation(legacy);
    expect(record.version).toBe(LEGACY_ATTESTATION_VERSION);
    expect(record.epoch).toBe(7n);
    expect(record.solvent).toBe(true);
  });

  it("accepts an explicitly tagged version 1 record", () => {
    const record = decodeAttestation({ ...current, version: LEGACY_ATTESTATION_VERSION });
    expect(record.version).toBe(LEGACY_ATTESTATION_VERSION);
  });

  it("rejects a version it does not understand with a clear message", () => {
    expect(() => decodeAttestation({ ...current, version: 3 })).toThrow(
      UnsupportedSchemaVersionError,
    );
    expect(() => decodeAttestation({ ...current, version: 3 })).toThrow(/version 3/);
  });

  it("normalises numeric fields supplied as numbers or strings", () => {
    const record = decodeAttestation({ ...current, epoch: "9", onchain_reserves: 12, timestamp: 34 });
    expect(record.epoch).toBe(9n);
    expect(record.onchainBase).toBe(12n);
    expect(record.timestamp).toBe(34n);
  });

  it("copies the roots instead of aliasing the input buffers", () => {
    const source = root(3);
    const record = decodeAttestation({ ...current, liab_root: source });
    source.fill(9);
    expect(record.liabRoot[0]).toBe(3);
  });
});
