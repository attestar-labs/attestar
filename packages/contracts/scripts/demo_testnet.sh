#!/usr/bin/env bash
# Full Attestar demo on Stellar testnet:
#   deploy token + attestar, mint reserves, publish a solvent attestation,
#   drain reserves, publish again -> insolvent. Prints contract ids and results.
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"

ABS=/mnt/d/Programming/hacks/attestar
CIRC=$ABS/packages/circuits
CON=$ABS/packages/contracts
ARGS=$CIRC/build/solvency_test
NET="--network testnet"
SRC="--source deployer"

cd "$CIRC" && node scripts/mkargs.mjs >/dev/null
DEPLOYER=$(stellar keys address deployer)
ROOT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ARGS/arg_pub.json'))[0])")
ZERO32=$(printf '00%.0s' $(seq 1 32))
ZERO64=$(printf '00%.0s' $(seq 1 64))

cd "$CON"
echo "==> deploying mock token and attestar"
TOKEN=$(stellar contract deploy --wasm target/wasm32v1-none/release/mock_token.wasm "$SRC" "$NET" 2>/dev/null | grep -oE 'C[A-Z0-9]{55}' | tail -1)
ATT=$(stellar contract deploy --wasm target/wasm32v1-none/release/attestar.wasm "$SRC" "$NET" 2>/dev/null | grep -oE 'C[A-Z0-9]{55}' | tail -1)
echo "    token:    $TOKEN"
echo "    attestar: $ATT"

echo "==> minting 12000 reserves to issuer"
stellar contract invoke --id "$TOKEN" "$SRC" "$NET" --send=yes -- mint --to "$DEPLOYER" --amount 12000 >/dev/null

echo "==> initialize + set_verifier"
stellar contract invoke --id "$ATT" "$SRC" "$NET" --send=yes -- \
  initialize --admin "$DEPLOYER" --reserve_token "$TOKEN" --reserve_holder "$DEPLOYER" --attestor "$ZERO32" >/dev/null
stellar contract invoke --id "$ATT" "$SRC" "$NET" --send=yes -- \
  set_verifier --vk "$(cat "$ARGS/arg_vk.json")" >/dev/null

echo "==> epoch 1: publish attestation (reserves 12000 >= liabilities 9500)"
stellar contract invoke --id "$ATT" "$SRC" "$NET" --send=yes -- \
  submit_attestation --epoch 1 --proof "$(cat "$ARGS/arg_proof.json")" \
  --root "$ROOT" --total_liabilities 9500 --fiat_reserves 0 --fiat_sig "$ZERO64" >/dev/null
echo -n "    is_solvent(1) = "
stellar contract invoke --id "$ATT" "$SRC" "$NET" -- is_solvent --epoch 1

echo "==> draining 6000 reserves (issuer secretly withdraws)"
stellar contract invoke --id "$TOKEN" "$SRC" "$NET" --send=yes -- burn --from "$DEPLOYER" --amount 6000 >/dev/null

echo "==> epoch 2: publish attestation (reserves now 6000 < liabilities 9500)"
stellar contract invoke --id "$ATT" "$SRC" "$NET" --send=yes -- \
  submit_attestation --epoch 2 --proof "$(cat "$ARGS/arg_proof.json")" \
  --root "$ROOT" --total_liabilities 9500 --fiat_reserves 0 --fiat_sig "$ZERO64" >/dev/null
echo -n "    is_solvent(2) = "
stellar contract invoke --id "$ATT" "$SRC" "$NET" -- is_solvent --epoch 2

echo "==> done. contracts: token=$TOKEN attestar=$ATT"
