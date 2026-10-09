#!/usr/bin/env bash
# Full Attestar demo on Stellar testnet, driven by the committed `psolvency_demo`
# fixtures:
#   deploy mock token + attestar, mint reserves, publish a solvent attestation,
#   drain reserves, publish again -> insolvent. Prints contract ids and results.
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"

# Derive the repository root from this script's own location so the demo runs from
# any checkout path instead of a hardcoded absolute path.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CIRC="$ROOT/packages/circuits"
CON="$ROOT/packages/contracts"
ARGS="$CIRC/build/psolvency_demo"
NET="--network testnet"
SRC="--source deployer"

# Regenerate the encoded verifying key and the two real proof argument files for
# the depth-4 / depth-3 psolvency_demo circuit.
cd "$CIRC" && node scripts/encode_vk.mjs psolvency_demo >/dev/null
node scripts/encode_p.mjs >/dev/null

S_PROOF="$ARGS/arg_s_proof.json"
S_PUB="$ARGS/arg_s_pub.json"
I_PROOF="$ARGS/arg_i_proof.json"
I_PUB="$ARGS/arg_i_pub.json"

DEPLOYER=$(stellar keys address deployer)
ZERO32=$(printf '00%.0s' $(seq 1 32))
ZERO64=$(printf '00%.0s' $(seq 1 64))

cd "$CON"
echo "==> deploying mock token and attestar"
TOKEN=$(stellar contract deploy --wasm target/wasm32v1-none/release/mock_token.wasm $SRC $NET 2>/dev/null | grep -oE 'C[A-Z0-9]{55}' | tail -1)
ATT=$(stellar contract deploy --wasm target/wasm32v1-none/release/attestar.wasm $SRC $NET 2>/dev/null | grep -oE 'C[A-Z0-9]{55}' | tail -1)
echo "    token:    $TOKEN"
echo "    attestar: $ATT"

echo "==> minting 5000 reserves to issuer"
stellar contract invoke --id "$TOKEN" $SRC $NET --send=yes -- mint --to "$DEPLOYER" --amount 5000 >/dev/null

echo "==> initialize + set_verifier"
stellar contract invoke --id "$ATT" $SRC $NET --send=yes -- \
  initialize --admin "$DEPLOYER" --reserve_token "$TOKEN" --reserve_holder "$DEPLOYER" --attestor "$ZERO32" >/dev/null
stellar contract invoke --id "$ATT" $SRC $NET --send=yes -- \
  set_verifier --vk "$(cat "$ARGS/arg_vk.json")" >/dev/null

echo "==> epoch 1: publish attestation (on-chain 5000 + off-chain 7000 >= liabilities 9500)"
stellar contract invoke --id "$ATT" $SRC $NET --send=yes -- \
  submit_attestation --epoch 1 --proof "$(cat "$S_PROOF")" \
  --liab_root "$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S_PUB'))[0])")" \
  --res_root "$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S_PUB'))[1])")" \
  --solvent true --res_sig "$ZERO64" >/dev/null
echo -n "    is_solvent(1) = "
stellar contract invoke --id "$ATT" $SRC $NET -- is_solvent --epoch 1

echo "==> draining 3000 reserves (issuer secretly withdraws)"
stellar contract invoke --id "$TOKEN" $SRC $NET --send=yes -- burn --from "$DEPLOYER" --amount 3000 >/dev/null

echo "==> epoch 2: publish attestation (on-chain 2000 + off-chain 1000 < liabilities 9500)"
stellar contract invoke --id "$ATT" $SRC $NET --send=yes -- \
  submit_attestation --epoch 2 --proof "$(cat "$I_PROOF")" \
  --liab_root "$(node -e "console.log(JSON.parse(require('fs').readFileSync('$I_PUB'))[0])")" \
  --res_root "$(node -e "console.log(JSON.parse(require('fs').readFileSync('$I_PUB'))[1])")" \
  --solvent false --res_sig "$ZERO64" >/dev/null
echo -n "    is_solvent(2) = "
stellar contract invoke --id "$ATT" $SRC $NET -- is_solvent --epoch 2

echo "==> done. contracts: token=$TOKEN attestar=$ATT"
