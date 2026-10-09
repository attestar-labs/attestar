"use client";

import { Buffer } from "buffer";

export const DEFAULT_VIEW_KEY = "regulator-view-key-2026";
export const DISCLOSURE_KEY = "attestar:disclosure";

export interface DisclosurePayload {
  salt: string;
  iv: string;
  ct: string;
  epoch: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const ub64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 100_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptDisclosure(
  data: unknown,
  passphrase: string,
  epoch: string,
): Promise<DisclosurePayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      encoder.encode(JSON.stringify(data)) as BufferSource,
    ),
  );
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct), epoch };
}

export async function decryptDisclosure(
  payload: DisclosurePayload,
  passphrase: string,
): Promise<unknown> {
  const key = await deriveKey(passphrase, ub64(payload.salt));
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ub64(payload.iv) as BufferSource },
    key,
    ub64(payload.ct) as BufferSource,
  );
  return JSON.parse(decoder.decode(pt));
}

export function saveDisclosure(payload: DisclosurePayload) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISCLOSURE_KEY, JSON.stringify(payload));
}

function isDisclosurePayload(value: unknown): value is DisclosurePayload {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.salt === "string" &&
    p.salt.length > 0 &&
    typeof p.iv === "string" &&
    p.iv.length > 0 &&
    typeof p.ct === "string" &&
    p.ct.length > 0 &&
    typeof p.epoch === "string"
  );
}

export function loadDisclosure(): DisclosurePayload | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(DISCLOSURE_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isDisclosurePayload(parsed) ? parsed : null;
}
