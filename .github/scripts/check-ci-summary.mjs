#!/usr/bin/env node
import { resolve } from "node:path";
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

export function evaluateSummaryNeeds(needsContextJson, requiredJobs = REQUIRED_CI_JOBS) {
  let needsObj;
  try {
    needsObj = typeof needsContextJson === "string" ? JSON.parse(needsContextJson) : needsContextJson;
  } catch (err) {
    throw new Error(`Invalid NEEDS_CONTEXT JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!needsObj || typeof needsObj !== "object") {
    throw new Error("NEEDS_CONTEXT must be a non-null JSON object");
  }

  const failures = [];
  for (const jobName of requiredJobs) {
    const entry = needsObj[jobName];
    const result = entry && typeof entry === "object" ? entry.result : undefined;
    if (result !== "success") {
      failures.push(`${jobName} (${result ?? "missing"})`);
    }
  }

  for (const [jobName, entry] of Object.entries(needsObj)) {
    if (requiredJobs.includes(jobName)) continue;
    const result = entry && typeof entry === "object" ? entry.result : undefined;
    if (result !== "success") {
      failures.push(`${jobName} (${result ?? "missing"})`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `CI summary check failed because the following required job(s) did not succeed: ${failures.join(", ")}`,
    );
  }

  return requiredJobs.map((jobName) => `${jobName}: success`);
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const raw = process.env.NEEDS_CONTEXT ?? process.argv[2] ?? "{}";
    const lines = evaluateSummaryNeeds(raw);
    console.log(`All ${lines.length} required CI jobs succeeded (${lines.join(", ")}).`);
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
