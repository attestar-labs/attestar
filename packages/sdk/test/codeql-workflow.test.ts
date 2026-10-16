import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

describe("CodeQL code-scanning workflow (#46)", () => {
  const codeqlYaml = readFileSync(resolve(repoRoot, ".github/workflows/codeql.yml"), "utf8");

  it("triggers on push, pull_request, and weekly schedule", () => {
    expect(codeqlYaml).toContain("push:");
    expect(codeqlYaml).toContain("pull_request:");
    expect(codeqlYaml).toContain("schedule:");
    expect(codeqlYaml).toContain("cron:");
  });

  it("analyzes javascript-typescript and rust with security-extended queries", () => {
    expect(codeqlYaml).toContain("language: javascript-typescript");
    expect(codeqlYaml).toContain("language: rust");
    expect(codeqlYaml).toContain("queries: security-extended");
    expect(codeqlYaml).toContain("github/codeql-action/init@v3");
    expect(codeqlYaml).toContain("github/codeql-action/analyze@v3");
  });

  it("scopes security-events: write to the analyze job only while keeping workflow permissions read-only", () => {
    const topLevelPermissions = codeqlYaml.split("jobs:")[0];
    expect(topLevelPermissions).toContain("contents: read");
    expect(topLevelPermissions).not.toContain("security-events: write");

    const jobsSection = codeqlYaml.split("jobs:")[1];
    expect(jobsSection).toContain("security-events: write");
  });
});
