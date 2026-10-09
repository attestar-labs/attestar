#!/usr/bin/env python3
"""Fail only when cargo-audit reports a high or critical severity advisory.

Reads the JSON emitted by `cargo audit --json` and prints every advisory it
contains. Lower severities (and advisories with no recorded severity) are
reported but do not fail the build, matching the audit job's contract.
"""
import json
import sys

FAIL_SEVERITIES = {"high", "critical"}


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: cargo-audit-gate.py <cargo-audit.json>", file=sys.stderr)
        return 2

    try:
        with open(sys.argv[1], "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception as exc:  # noqa: BLE001
        print("::error::could not read cargo-audit JSON output: %s" % exc)
        return 1

    vulns = (data.get("vulnerabilities") or {}).get("list") or []
    if not vulns:
        print("cargo audit: no vulnerabilities reported")
        return 0

    failing = []
    for entry in vulns:
        advisory = entry.get("advisory") or {}
        severity = (advisory.get("severity") or "unknown").lower()
        ident = advisory.get("id") or "?"
        package = advisory.get("package") or entry.get("package") or "?"
        title = advisory.get("title") or ""
        print("%-22s %-10s %s - %s" % (ident, severity, package, title))
        if severity in FAIL_SEVERITIES:
            failing.append(ident)

    if failing:
        print("::error::%d high/critical advisory(ies): %s" % (len(failing), ", ".join(failing)))
        return 1

    print("cargo audit: %d advisory(ies), none high/critical" % len(vulns))
    return 0


if __name__ == "__main__":
    sys.exit(main())
