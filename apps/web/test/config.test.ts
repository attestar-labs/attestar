import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const DEFAULTS: Record<string, string> = {
  ATTESTAR_ID: "CD36EVFKGZH23JLRQMJZPG7XKPNO6ZVK67GHN2RQJG5VM6CVYTE2GRDH",
  TOKEN_ID: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  RESERVE_HOLDER: "GDFKPIKJIY4JCYNMQ6IGX674O4HLPIPWD42LWHJSLOHAKR33IZ2VQTID",
  SINK_ADDRESS: "GD2ASCDOYWLJKUWN5KZW6WV5SARW3HKXPKBFX6Y3THDFFM4HXQXY7KKA",
  RPC_URL: "https://soroban-testnet.stellar.org",
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
};

const NAMES = Object.keys(DEFAULTS);
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  saved.clear();
  for (const name of NAMES) {
    const envName = `NEXT_PUBLIC_${name}`;
    saved.set(envName, process.env[envName]);
    delete process.env[envName];
  }
  vi.resetModules();
});

afterEach(() => {
  for (const [envName, value] of saved) {
    if (value === undefined) delete process.env[envName];
    else process.env[envName] = value;
  }
  vi.resetModules();
});

async function loadConfig() {
  return import("../lib/config");
}

describe("config env fallbacks", () => {
  it("uses the documented default for every export under a bare environment", async () => {
    const config = await loadConfig();
    for (const name of NAMES) {
      expect(config[name as keyof typeof config]).toBe(DEFAULTS[name]);
      expect(typeof config[name as keyof typeof config]).toBe("string");
      expect((config[name as keyof typeof config] as string).length).toBeGreaterThan(0);
    }
  });

  it("prefers NEXT_PUBLIC_ATTESTAR_ID when it is set", async () => {
    process.env.NEXT_PUBLIC_ATTESTAR_ID = "SENTINEL_ATTESTAR";
    const config = await loadConfig();
    expect(config.ATTESTAR_ID).toBe("SENTINEL_ATTESTAR");
    expect(config.TOKEN_ID).toBe(DEFAULTS.TOKEN_ID);
  });

  it("prefers every NEXT_PUBLIC_* override over its default", async () => {
    for (const name of NAMES) process.env[`NEXT_PUBLIC_${name}`] = `SENTINEL_${name}`;
    const config = await loadConfig();
    for (const name of NAMES) {
      expect(config[name as keyof typeof config]).toBe(`SENTINEL_${name}`);
    }
  });

  it("does not read non NEXT_PUBLIC_* variables", async () => {
    process.env.ATTESTAR_ID = "PRIVATE_ATTESTAR";
    process.env.RPC_URL = "http://private";
    process.env.NETWORK_PASSPHRASE = "private";
    const config = await loadConfig();
    expect(config.ATTESTAR_ID).toBe(DEFAULTS.ATTESTAR_ID);
    expect(config.RPC_URL).toBe(DEFAULTS.RPC_URL);
    expect(config.NETWORK_PASSPHRASE).toBe(DEFAULTS.NETWORK_PASSPHRASE);
    delete process.env.ATTESTAR_ID;
    delete process.env.RPC_URL;
    delete process.env.NETWORK_PASSPHRASE;
  });
});
