#!/usr/bin/env bash
set -euo pipefail

python3 - "$@" << 'PYTHON'
import json
import sys
import re

vk_json_path = 'apps/web/lib/vk.json'
vk_rs_path = 'packages/contracts/contracts/attestar/src/fixtures.rs'

with open(vk_json_path) as f:
    vk_json = json.load(f)

with open(vk_rs_path) as f:
    vk_rs = f.read()

def parse_array(s):
    s_clean = re.sub(r'//.*', '', s)
    hex_vals = re.findall(r'0x([0-9a-fA-F]{2})', s_clean)
    return bytes([int(h, 16) for h in hex_vals])

def hex_to_bytes(hex_str):
    return bytes.fromhex(hex_str)

alpha_match = re.search(r'pub const ALPHA: \[u8; 64\] = \[(.*?)\];', vk_rs, re.DOTALL)
beta_match = re.search(r'pub const BETA: \[u8; 128\] = \[(.*?)\];', vk_rs, re.DOTALL)
gamma_match = re.search(r'pub const GAMMA: \[u8; 128\] = \[(.*?)\];', vk_rs, re.DOTALL)
delta_match = re.search(r'pub const DELTA: \[u8; 128\] = \[(.*?)\];', vk_rs, re.DOTALL)
ic_match = re.search(r'pub const IC: \[\[u8; 64\]; \d+\] = \[(.*?)\];', vk_rs, re.DOTALL)

alpha_rs = parse_array(alpha_match.group(1))
beta_rs = parse_array(beta_match.group(1))
gamma_rs = parse_array(gamma_match.group(1))
delta_rs = parse_array(delta_match.group(1))

ic_content = ic_match.group(1)
ic_rs = []
for m in re.findall(r'\[(.*?)\]', ic_content, re.DOTALL):
    ic_rs.append(parse_array(m))

alpha_json = hex_to_bytes(vk_json['alpha'])
beta_json = hex_to_bytes(vk_json['beta'])
gamma_json = hex_to_bytes(vk_json['gamma'])
delta_json = hex_to_bytes(vk_json['delta'])
ic_json = [hex_to_bytes(x) for x in vk_json['ic']]

if alpha_json != alpha_rs:
    print("MISMATCH: alpha", file=sys.stderr)
    sys.exit(1)
if beta_json != beta_rs:
    print("MISMATCH: beta", file=sys.stderr)
    sys.exit(1)
if gamma_json != gamma_rs:
    print("MISMATCH: gamma", file=sys.stderr)
    sys.exit(1)
if delta_json != delta_rs:
    print("MISMATCH: delta", file=sys.stderr)
    sys.exit(1)
if len(ic_json) != len(ic_rs):
    print(f"MISMATCH: ic count {len(ic_json)} vs {len(ic_rs)}", file=sys.stderr)
    sys.exit(1)
for i, (ij, ir) in enumerate(zip(ic_json, ic_rs)):
    if ij != ir:
        print(f"MISMATCH: ic[{i}]", file=sys.stderr)
        sys.exit(1)

print("OK")
PYTHON
