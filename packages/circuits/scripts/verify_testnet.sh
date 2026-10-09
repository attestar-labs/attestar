#!/usr/bin/env bash
# Verify a real Groth16 proof on Stellar testnet via the deployed Attestar contract.
# Usage: bash scripts/verify_testnet.sh [CONTRACT_ID]
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"

cd "$(dirname "$0")/.."
CID="${1:-CD36EVFKGZH23JLRQMJZPG7XKPNO6ZVK67GHN2RQJG5VM6CVYTE2GRDH}"
D=build/solvency_test

node scripts/mkargs.mjs

echo "=== verify_proof with the REAL proof, submitted on-chain (expect true) ==="
stellar contract invoke --id "$CID" --source deployer --network testnet --send=yes -- \
  verify_proof \
  --vk "$(cat "$D/arg_vk.json")" \
  --proof "$(cat "$D/arg_proof.json")" \
  --public_inputs "$(cat "$D/arg_pub.json")"

echo "=== verify_proof with a TAMPERED public input (expect false) ==="
stellar contract invoke --id "$CID" --source deployer --network testnet -- \
  verify_proof \
  --vk "$(cat "$D/arg_vk.json")" \
  --proof "$(cat "$D/arg_proof.json")" \
  --public_inputs "$(cat "$D/arg_pub_bad.json")"
