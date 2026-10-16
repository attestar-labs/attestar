import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

describe("CI required summary job (#45)", () => {
  it("defines summary job with if: always() and needs on all CI jobs", () => {
    const ciYaml = readFileSync(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(ciYaml).toContain("summary:");
    expect(ciYaml).toContain("if: ${{ always() }}");
    for (const job of ["lint", "scripts", "sdk", "web", "contracts", "security", "tests", "circuits"]) {
      expect(ciYaml).toContain(`- ${job}`);
    }
  });

  it("passes only when every required job has result === 'success' and names skipped/cancelled/failed jobs", async () => {
    // @ts-expect-error -- .mjs helper invoked by CI
    const { evaluateSummaryNeeds, REQUIRED_CI_JOBS } = await import(
      "../../../.github/scripts/check-ci-summary.mjs"
    );

    const allGreen = Object.fromEntries(REQUIRED_CI_JOBS.map((j: string) => [j, { result: "success" }]));
    expect(() => evaluateSummaryNeeds(allGreen)).not.toThrow();

    const skippedContracts = {
      ...allGreen,
      contracts: { result: "skipped" },
    };
    expect(() => evaluateSummaryNeeds(skippedContracts)).toThrow(/contracts \(skipped\)/);

    const cancelledWeb = {
      ...allGreen,
      web: { result: "cancelled" },
    };
    expect(() => evaluateSummaryNeeds(cancelledWeb)).toThrow(/web \(cancelled\)/);

    const failedTests = {
      ...allGreen,
      tests: { result: "failure" },
    };
    expect(() => evaluateSummaryNeeds(failedTests)).toThrow(/tests \(failure\)/);
  });
});
