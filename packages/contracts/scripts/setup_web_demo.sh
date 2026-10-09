#!/usr/bin/env bash
# Deploy and configure a stable Attestar demo deployment for the web app, using the
# depth-4 / depth-3 `psolvency_demo` circuit the app, the contract and the browser
# verifying key all use. Writes apps/web/.env.local with the contract ids and the
# issuer secret (testnet only).
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"

# Derive the repository root from this script's own location so the demo runs from
# any checkout path instead of a hardcoded absolute path.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CIRC="$ROOT/packages/circuits"
CON="$ROOT/packages/contracts"
NET="--network testnet"
SRC="--source deployer"
RPC="https://soroban-testnet.stellar.org"
PASS="Test SDF Network ; September 2015"
EXPLORER="https://stellar.expert/explorer/testnet"
USDC_DECIMALS="7"
# Target of the issuer console's "Drain USDC" transfer. Any valid Stellar account
# works; override with SINK_ADDRESS=... to send the drained USDC somewhere specific.
SINK="${SINK_ADDRESS:-GD2ASCDOYWLJKUWN5KZW6WV5SARW3HKXPKBFX6Y3THDFFM4HXQXY7KKA}"

cd "$CIRC" && node scripts/encode_vk.mjs psolvency_demo >/dev/null
DEPLOYER=$(stellar keys address deployer)
SECRET=$(stellar keys show deployer)
ZERO32=$(printf '00%.0s' $(seq 1 32))

cd "$CON"
echo "==> deploying contracts"
TOKEN=$(stellar contract deploy --wasm target/wasm32v1-none/release/mock_token.wasm $SRC $NET 2>/dev/null | grep -oE 'C[A-Z0-9]{55}' | tail -1)
ATT=$(stellar contract deploy --wasm target/wasm32v1-none/release/attestar.wasm $SRC $NET 2>/dev/null | grep -oE 'C[A-Z0-9]{55}' | tail -1)
echo "    token=$TOKEN attestar=$ATT"

echo "==> minting initial reserves (1,000,000)"
stellar contract invoke --id "$TOKEN" $SRC $NET --send=yes -- mint --to "$DEPLOYER" --amount 1000000 >/dev/null

echo "==> initialize + set_verifier (psolvency_demo vkey)"
stellar contract invoke --id "$ATT" $SRC $NET --send=yes -- \
  initialize --admin "$DEPLOYER" --reserve_token "$TOKEN" --reserve_holder "$DEPLOYER" --attestor "$ZERO32" >/dev/null
stellar contract invoke --id "$ATT" $SRC $NET --send=yes -- \
  set_verifier --vk "$(cat "$CIRC/build/psolvency_demo/arg_vk.json")" >/dev/null

# Write every NEXT_PUBLIC_* variable read by apps/web/lib/config.ts and
# apps/web/lib/format.ts, plus the server-side names the scripts read.
ENV_FILE="$ROOT/apps/web/.env.local"
cat > "$ENV_FILE" <<EOF
ATTESTAR_ID=$ATT
TOKEN_ID=$TOKEN
ISSUER_SECRET=$SECRET
ISSUER_ADDRESS=$DEPLOYER
RESERVE_HOLDER=$DEPLOYER
SINK_ADDRESS=$SINK
NEXT_PUBLIC_ATTESTAR_ID=$ATT
NEXT_PUBLIC_TOKEN_ID=$TOKEN
NEXT_PUBLIC_RESERVE_HOLDER=$DEPLOYER
NEXT_PUBLIC_SINK_ADDRESS=$SINK
NEXT_PUBLIC_RPC_URL=$RPC
NEXT_PUBLIC_NETWORK_PASSPHRASE=$PASS
NEXT_PUBLIC_EXPLORER=$EXPLORER
NEXT_PUBLIC_USDC_DECIMALS=$USDC_DECIMALS
EOF

echo "==> wrote $ENV_FILE"
echo "    attestar=$ATT"
echo "    token=$TOKEN"
