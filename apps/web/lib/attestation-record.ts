/**
 * Version-aware decoding of on-chain attestation records.
 *
 * `submit_attestation` stamps every record it writes with a schema `version`
 * (`CURRENT_ATTESTATION_VERSION`). Records written before the tag existed are
 * the version 1 layout. Keeping both layouts explicit here — instead of reading
 * fields positionally — means a future schema change cannot be silently
 * mis-parsed by the UI: an unknown version is rejected with a clear message.
 */

export const CURRENT_ATTESTATION_VERSION = 2;
export const LEGACY_ATTESTATION_VERSION = 1;

const SUPPORTED_VERSIONS: readonly number[] = [
  LEGACY_ATTESTATION_VERSION,
  CURRENT_ATTESTATION_VERSION,
];

/** The subset of the contract record this client reads. */
export interface OnChainAttestation {
  /** Absent on records written before the schema was versioned. */
  version?: number;
  epoch: bigint | number | string;
  liab_root: Uint8Array;
  res_root: Uint8Array;
  onchain_reserves: bigint | number | string;
  solvent: boolean;
  timestamp: bigint | number | string;
}

/** A decoded record with its schema version preserved. */
export interface AttestationRecord {
  version: number;
  epoch: bigint;
  solvent: boolean;
  liabRoot: Uint8Array;
  resRoot: Uint8Array;
  onchainBase: bigint;
  timestamp: bigint;
}

export class UnsupportedSchemaVersionError extends Error {
  constructor(readonly version: number) {
    super(
      `Unsupported attestation schema version ${version}: this client understands version ` +
        `${LEGACY_ATTESTATION_VERSION} (records written before the version tag) and version ` +
        `${CURRENT_ATTESTATION_VERSION}. Upgrade the client before reading this record.`,
    );
    this.name = "UnsupportedSchemaVersionError";
  }
}

export function isSupportedSchemaVersion(version: number): boolean {
  return SUPPORTED_VERSIONS.includes(version);
}

function toBigInt(value: bigint | number | string): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

export function decodeAttestation(raw: OnChainAttestation): AttestationRecord {
  // A record with no `version` tag predates versioning and is the version 1
  // layout; anything else declares its own layout explicitly.
  const version = raw.version ?? LEGACY_ATTESTATION_VERSION;
  if (!isSupportedSchemaVersion(version)) {
    throw new UnsupportedSchemaVersionError(version);
  }

  return {
    version,
    epoch: toBigInt(raw.epoch),
    solvent: raw.solvent,
    liabRoot: new Uint8Array(raw.liab_root),
    resRoot: new Uint8Array(raw.res_root),
    onchainBase: toBigInt(raw.onchain_reserves),
    timestamp: toBigInt(raw.timestamp),
  };
}
