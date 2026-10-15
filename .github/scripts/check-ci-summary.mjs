#!/usr/bin/env node
// Verify that all required upstream CI jobs in .github/workflows/ci.yml
// completed with result === "success". Fails non-zero and names every
// skipped, cancelled, failed, or missing dependency.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_CI_JOBS = [
  "lint",
  "scripts",
  "sdk",
  "web",
  "contracts",
  "security",
  "tests",
  "circuits",
];

export function evaluateCiSummary(needsInput, requiredJobs = REQUIRED_CI_JOBS) {
  const needs =
    typeof needsInput === "string" ? JSON.parse(needsInput) : needsInput;
  if (!needs || typeof needs !== "object" || Array.isArray(needs)) {
    throw new Error("NEEDS_JSON must be a JSON object mapping job IDs to results");
  }

  const failures = [];
  for (const jobId of requiredJobs) {
    const entry = needs[jobId];
    const result = entry && typeof entry === "object" ? entry.result : undefined;
    if (result !== "success") {
      failures.push({ job: jobId, result: result ?? "missing" });
    }
  }

  for (const [jobId, entry] of Object.entries(needs)) {
    if (requiredJobs.includes(jobId)) continue;
    const result = entry && typeof entry === "object" ? entry.result : undefined;
    if (result !== "success") {
      failures.push({ job: jobId, result: result ?? "unknown" });
    }
  }

  if (failures.length > 0) {
    const details = failures.map((f) => `${f.job} (${f.result})`).join(", ");
    const err = new Error(
      `CI summary check failed — non-successful dependency job(s): ${details}`,
    );
    err.failures = failures;
    throw err;
  }

  return {
    passed: true,
    checkedJobs: requiredJobs.length,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const rawNeeds = process.env.NEEDS_JSON ?? process.argv[2] ?? "{}";
  try {
    const res = evaluateCiSummary(rawNeeds);
    console.log(`CI summary passed: all ${res.checkedJobs} required jobs succeeded.`);
  } catch (err) {
    const failures = err.failures ?? [];
    for (const f of failures) {
      console.error(`::error title=CI dependency not successful::Job "${f.job}" finished with result "${f.result}"`);
    }
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
