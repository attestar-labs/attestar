#!/usr/bin/env python3
"""Fail CI when the browser verifying key diverges from contract test fixtures.

Only Python's standard library is required. The script reads the committed
artifacts; it never rebuilds the circuit or modifies either key.
"""

import argparse
import json
import re
import sys
from pathlib import Path

SIZES = {"alpha": 64, "beta": 128, "gamma": 128, "delta": 128}
POINT_BYTES = 64


class FixtureMismatch(ValueError):
    """Malformed artifact or first unequal verifying-key field."""


def parse_json_key(content):
    try:
        obj = json.loads(content)
    except json.JSONDecodeError as exc:
        raise FixtureMismatch(f"vk.json invalid JSON: {exc.msg}") from exc
    if not isinstance(obj, dict):
        raise FixtureMismatch("vk.json must contain an object")
    if set(obj) != set(SIZES) | {"ic"}:
        raise FixtureMismatch("vk.json has missing or unexpected key fields")
    points = {}
    for name, count in SIZES.items():
        points[name] = decode_hex(obj[name], name, count)
    if not isinstance(obj["ic"], list) or not obj["ic"]:
        raise FixtureMismatch("vk.json ic must be a nonempty list")
    points["ic"] = [decode_hex(value, f"ic[{i}]", POINT_BYTES)
                    for i, value in enumerate(obj["ic"])]
    return points


def decode_hex(value, name, count):
    if not isinstance(value, str) or not re.fullmatch(r"(?:[0-9a-fA-F]{2})+", value):
        raise FixtureMismatch(f"vk.json {name}: invalid hex encoding")
    data = bytes.fromhex(value)
    if len(data) != count:
        raise FixtureMismatch(f"vk.json {name}: expected {count} bytes, got {len(data)}")
    return data


def parse_rust_bytes(contents, name, count):
    # Ignore generated Rust comments, but never silently ignore unknown tokens.
    contents = re.sub(r"//[^\n]*", "", contents)
    tokens = [s.strip() for s in contents.split(",") if s.strip()]
    if len(tokens) != count:
        raise FixtureMismatch(f"fixtures.rs {name}: expected {count} bytes, got {len(tokens)}")
    parsed = bytearray()
    for i, token in enumerate(tokens):
        if not re.fullmatch(r"0x[0-9a-fA-F]{1,2}", token):
            raise FixtureMismatch(f"fixtures.rs {name}: invalid byte at offset {i}: {token[:30]}")
        parsed.append(int(token, 16))
    return bytes(parsed)


def parse_rust_key(content):
    points = {}
    for name, count in SIZES.items():
        match = re.search(
            rf"\bpub\s+const\s+{name.upper()}\s*:\s*\[u8\s*;\s*(\d+)\s*\]\s*=\s*\[([^\]]*)\]\s*;",
            content, re.S,
        )
        if not match:
            raise FixtureMismatch(f"fixtures.rs missing {name.upper()} constant")
        if int(match.group(1)) != count:
            raise FixtureMismatch(f"fixtures.rs {name}: wrong declared byte size")
        points[name] = parse_rust_bytes(match.group(2), name, count)

    match = re.search(
        r"\bpub\s+const\s+IC\s*:\s*\[\s*\[u8\s*;\s*(\d+)\s*\]\s*;\s*(\d+)\s*\]\s*=\s*\[([\s\S]*?)\]\s*;",
        content,
    )
    if not match:
        raise FixtureMismatch("fixtures.rs missing IC constant")
    if int(match.group(1)) != POINT_BYTES:
        raise FixtureMismatch("fixtures.rs IC: wrong declared point size")
    rows = re.findall(r"\[([^\[\]]*)\]", match.group(3))
    remainder = re.sub(r"\[[^\[\]]*\]", "", match.group(3))
    if re.sub(r"//[^\n]*", "", remainder).strip(" \t\r\n,"):
        raise FixtureMismatch("fixtures.rs IC: unexpected content between points")
    if len(rows) != int(match.group(2)):
        raise FixtureMismatch("fixtures.rs IC: declared point count differs from the rows")
    points["ic"] = [parse_rust_bytes(row, f"ic[{i}]", POINT_BYTES)
                    for i, row in enumerate(rows)]
    return points


def compare_keys(vk, fixture):
    for name in SIZES:
        compare_point(name, vk[name], fixture[name])
    if len(vk["ic"]) != len(fixture["ic"]):
        raise FixtureMismatch(
            f"ic count mismatch: vk.json={len(vk['ic'])}, fixtures.rs={len(fixture['ic'])}"
        )
    for i, (a, b) in enumerate(zip(vk["ic"], fixture["ic"])):
        compare_point(f"ic[{i}]", a, b)


def compare_point(name, a, b):
    for i, (left, right) in enumerate(zip(a, b)):
        if left != right:
            raise FixtureMismatch(
                f"{name} byte offset {i}: vk.json=0x{left:02x}, fixtures.rs=0x{right:02x}"
            )
    if len(a) != len(b):
        raise FixtureMismatch(f"{name} byte offset {min(len(a),len(b))}: length mismatch")


def main(argv=None):
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, default=root / "apps/web/lib/vk.json")
    parser.add_argument("--rust", type=Path, default=root / "packages/contracts/contracts/attestar/src/fixtures.rs")
    args = parser.parse_args(argv)
    try:
        compare_keys(parse_json_key(args.json.read_text(encoding="utf-8")),
                     parse_rust_key(args.rust.read_text(encoding="utf-8")))
    except (FixtureMismatch, OSError) as exc:
        print(f"::error::{exc}", file=sys.stderr)
        return 1
    print("Verified vk.json matches fixtures.rs: alpha, beta, gamma, delta and every IC point")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
