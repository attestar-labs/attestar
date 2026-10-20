import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const codeqlWorkflowPath = resolve(repoRoot, ".github/workflows/codeql.yml");
const ciWorkflowPath = resolve(repoRoot, ".github/workflows/ci.yml");

export function detectDynamicCodeExecutionInSource(source: string, fileLabel: string): string[] {
  const findings: string[] = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const stripped = line.replace(/\/\/.*$/, "");
    if (/\beval\s*\(/.test(stripped) || /\bnew\s+Function\s*\(/.test(stripped)) {
      findings.push(`${fileLabel}:${idx + 1}: dynamic code execution detected`);
    }
  });
  return findings;
}

describe("CodeQL code-scanning workflow (#46)", () => {
  it("runs the security-extended query suite on push, pull_request, and weekly schedule", () => {
    const workflow = readFileSync(codeqlWorkflowPath, "utf8");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("queries: security-extended");
    expect(workflow).toContain("language: javascript-typescript");
    expect(workflow).toContain("language: rust");
  });

  it("scopes security-events: write strictly to the analyze job without conflicting with ci.yml", () => {
    const codeqlYaml = readFileSync(codeqlWorkflowPath, "utf8");
    const ciYaml = readFileSync(ciWorkflowPath, "utf8");

    // Top-level permissions on both workflows are contents: read
    expect(codeqlYaml).toMatch(/^permissions:\s*\n\s*contents:\s*read/m);
    expect(ciYaml).toMatch(/^permissions:\s*\n\s*contents:\s*read/m);

    // analyze job has security-events: write scoped to that job only
    const analyzeSection = codeqlYaml.split("jobs:")[1] ?? "";
    expect(analyzeSection).toContain("security-events: write");
    expect(ciYaml).toMatch(/\n  security:\s*\n/);
  });

  it("flags a deliberately introduced eval in apps/web/lib while verifying production files are clean", () => {
    const webLibDir = resolve(repoRoot, "apps/web/lib");
    const entries = existsSync(webLibDir)
      ? readdirSync(webLibDir).filter((f) => /\.(ts|tsx|js|mjs)$/.test(f))
      : [];

    for (const file of entries) {
      const relPath = `apps/web/lib/${file}`;
      const src = readFileSync(join(webLibDir, file), "utf8");
      expect(detectDynamicCodeExecutionInSource(src, relPath)).toEqual([]);
    }

    const baseSource =
      entries.length > 0
        ? readFileSync(join(webLibDir, entries[0]), "utf8")
        : "export const ok = true;";
    const poisoned =
      baseSource +
      "\nexport function unsafeProbe(input: string) { return eval(input); }\n";
    const findings = detectDynamicCodeExecutionInSource(
      poisoned,
      "apps/web/lib/disclosure.ts",
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]).toContain("apps/web/lib/disclosure.ts");
  });
});
