import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  REQUIRED_CI_JOBS,
  evaluateCiSummary,
} from "../../../.github/scripts/check-ci-summary.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const ciWorkflowPath = resolve(repoRoot, ".github/workflows/ci.yml");
const summaryScriptPath = resolve(repoRoot, ".github/scripts/check-ci-summary.mjs");

function buildAllSuccessNeeds() {
  return Object.fromEntries(
    REQUIRED_CI_JOBS.map((job) => [job, { result: "success", outputs: {} }]),
  );
}

describe("CI summary gate job (#45)", () => {
  it("defines a summary job in .github/workflows/ci.yml that depends on all other jobs and runs on always()", () => {
    const ciYaml = readFileSync(ciWorkflowPath, "utf8");
    expect(ciYaml).toMatch(/\n  summary:\s*\n/);
    expect(ciYaml).toContain("if: ${{ always() }}");

    for (const requiredJob of REQUIRED_CI_JOBS) {
      expect(ciYaml).toMatch(new RegExp(`needs:[\\s\\S]*\\b${requiredJob}\\b`));
    }
    // Explicitly verify web, contracts, and tests feed into summary
    expect(REQUIRED_CI_JOBS).toEqual(
      expect.arrayContaining(["web", "contracts", "tests"]),
    );
  });

  it("passes when every required job in needs has result === 'success'", () => {
    const res = evaluateCiSummary(buildAllSuccessNeeds());
    expect(res).toEqual({
      passed: true,
      checkedJobs: REQUIRED_CI_JOBS.length,
    });
  });

  it("fails and names any skipped, cancelled, or failed dependency", () => {
    for (const [jobName, badResult] of [
      ["web", "skipped"],
      ["contracts", "cancelled"],
      ["tests", "failure"],
      ["circuits", "skipped"],
    ] as const) {
      const needs = buildAllSuccessNeeds();
      needs[jobName] = { result: badResult, outputs: {} };
      expect(() => evaluateCiSummary(needs)).toThrow(
        new RegExp(`${jobName} \\(${badResult}\\)`),
      );
    }
  });

  it("exits non-zero from the CLI script and names a skipped dependency", () => {
    const needs = buildAllSuccessNeeds();
    needs.contracts = { result: "skipped", outputs: {} };
    const proc = spawnSync(process.execPath, [summaryScriptPath], {
      env: { ...process.env, NEEDS_JSON: JSON.stringify(needs) },
      encoding: "utf8",
    });
    expect(proc.status).not.toBe(0);
    expect(proc.stderr).toContain('Job "contracts" finished with result "skipped"');
  });
});
