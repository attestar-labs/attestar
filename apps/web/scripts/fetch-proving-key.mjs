#!/usr/bin/env node
// Fetch the Groth16 proving key for the production circuit.
//
// `apps/web/public/circuit/psolvency_demo.zkey` is ~13 MB, so it is intentionally NOT committed
// (git history keeps every blob forever). Only the small witness generator
// (`psolvency_demo.wasm`, ~2.5 MB) and `apps/web/lib/vk.json` live in-tree. This script is
// idempotent: it does nothing when the key is already present and matches the checksum, which is
// what makes a CI cache restore cheap. See README.md, "Proving artifacts".
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { get } from "node:https";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEST = join(HERE, "..", "public", "circuit", "psolvency_demo.zkey");

const URL_ =
  process.env.PSOLVENCY_ZKEY_URL ??
  "https://github.com/attestar-labs/attestar/releases/download/circuit-v1/psolvency_demo.zkey";
const EXPECTED =
  process.env.PSOLVENCY_ZKEY_SHA256 ??
  "1af0d283910393063c2173e5849a2f2c26f7cc6408a450c2bf4a7734205aee5d";

async function sha256(file) {
  const buf = await readFile(file);
  return createHash("sha256").update(buf).digest("hex");
}

function downloadOnce(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    get(url, (res) => {
      const { statusCode = 0, headers } = res;
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        res.resume();
        file.close(() =>
          rm(dest, { force: true }).then(() => downloadOnce(headers.location, dest)).then(resolve, reject),
        );
        return;
      }
      if (statusCode !== 200) {
        res.resume();
        file.close(() =>
          rm(dest, { force: true }).then(
            () => reject(new Error(`GET ${url} -> ${statusCode}`)),
            reject,
          ),
        );
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      file.close(() => rm(dest, { force: true }).then(() => reject(err), reject));
    });
  });
}

async function main() {
  try {
    await stat(DEST);
    const present = await sha256(DEST);
    if (present === EXPECTED) {
      console.log(`proving key present and verified: ${DEST}`);
      return;
    }
    console.log(`proving key checksum mismatch (${present}); refetching`);
  } catch {
    // not present yet
  }

  await mkdir(dirname(DEST), { recursive: true });
  const tmp = `${DEST}.download`;
  console.log(`fetching proving key from ${URL_}`);
  await downloadOnce(URL_, tmp);
  const got = await sha256(tmp);
  if (got !== EXPECTED) {
    await rm(tmp, { force: true });
    throw new Error(`checksum mismatch: expected ${EXPECTED}, got ${got}`);
  }
  await rename(tmp, DEST);
  console.log(`verified ${DEST}`);
}

main().catch((err) => {
  console.error(`fetch-proving-key failed: ${err.message}`);
  console.error(
    "Set PSOLVENCY_ZKEY_URL (and PSOLVENCY_ZKEY_SHA256) to a mirror of the release asset, then retry.",
  );
  process.exit(1);
});
