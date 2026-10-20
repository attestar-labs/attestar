#!/usr/bin/env python3
"""Negative mutation and parsing tests for the CI verifying-key guard."""

import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_vk_fixtures import (FixtureMismatch, compare_keys, parse_json_key,
                               parse_rust_key)

ROOT = Path(__file__).resolve().parents[2]
VK = (ROOT / "apps/web/lib/vk.json").read_text(encoding="utf-8")
RS = (ROOT / "packages/contracts/contracts/attestar/src/fixtures.rs").read_text(encoding="utf-8")


class VerifyingKeyFixtureTests(unittest.TestCase):
    def test_current_tree_matches_without_building_circuit(self):
        compare_keys(parse_json_key(VK), parse_rust_key(RS))

    def test_every_element_first_byte_flip_names_element_and_exact_offset(self):
        for name in ("alpha", "beta", "gamma", "delta", "ic[0]", "ic[4]"):
            with self.subTest(name=name):
                changed = json.loads(VK)
                field = name[:2] == "ic"
                value = changed["ic"][int(name[3:-1])] if field else changed[name]
                flipped = (int(value[:2], 16) ^ 0xff).to_bytes(1, "big").hex() + value[2:]
                if field:
                    changed["ic"][int(name[3:-1])] = flipped
                else:
                    changed[name] = flipped
                with self.assertRaisesRegex(FixtureMismatch, re.escape(name) + r" byte offset 0"):
                    compare_keys(parse_json_key(json.dumps(changed)), parse_rust_key(RS))

    def test_noninitial_flip_reports_byte_offset(self):
        changed = json.loads(VK)
        pos = 22
        field = changed["beta"]
        changed["beta"] = field[:pos*2] + (int(field[pos*2:pos*2+2],16)^1).to_bytes(1,'big').hex() + field[pos*2+2:]
        with self.assertRaisesRegex(FixtureMismatch, "beta byte offset 22"):
            compare_keys(parse_json_key(json.dumps(changed)), parse_rust_key(RS))

    def test_wrong_ic_count(self):
        changed = json.loads(VK)
        changed["ic"].pop()
        with self.assertRaisesRegex(FixtureMismatch, "ic count mismatch"):
            compare_keys(parse_json_key(json.dumps(changed)), parse_rust_key(RS))

    def test_invalid_hex_and_missing_fields(self):
        changed = json.loads(VK)
        changed["alpha"] = "nothex"
        with self.assertRaisesRegex(FixtureMismatch, "alpha: invalid hex"):
            parse_json_key(json.dumps(changed))
        changed = json.loads(VK)
        del changed["gamma"]
        with self.assertRaisesRegex(FixtureMismatch, "missing or unexpected"):
            parse_json_key(json.dumps(changed))

    def test_corrupted_rust_declaration(self):
        changed = RS.replace("pub const ALPHA: [u8; 64]", "pub const ALPHA: [u8; 63]", 1)
        with self.assertRaisesRegex(FixtureMismatch, "alpha: wrong declared"):
            parse_rust_key(changed)

    def test_reject_nonbyte_rust_tokens(self):
        changed = RS.replace("= [0x2d, 0x4d", "= [0x2d, 0xZZ", 1)
        with self.assertRaisesRegex(FixtureMismatch, "alpha: invalid byte"):
            parse_rust_key(changed)


if __name__ == "__main__":
    unittest.main()
