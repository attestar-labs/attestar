#!/usr/bin/env bash
# Fail when the built Soroban contract grows past the committed wasm budget.
#
# packages/contracts/wasm-size-budget.json records the baseline size measured
# from the last approved build plus the allowed growth margin. The percentage is
# deliberately small so a careless refactor (or an oversized unused constant)
# trips the gate before it reaches the network upload limit.
set -euo pipefail

WASM_DIR="packages/contracts/target/wasm32v1-none/release"
ATTESTAR_WASM="${WASM_DIR}/attestar.wasm"
MOCK_WASM="${WASM_DIR}/mock_token.wasm"
BUDGET_FILE="packages/contracts/wasm-size-budget.json"

for artifact in "${ATTESTAR_WASM}" "${MOCK_WASM}"; do
  if [ ! -f "${artifact}" ]; then
    echo "::error::expected build artifact missing: ${artifact}"
    exit 1
  fi
done

read_number() {
  # Read an integer field from the budget JSON without depending on jq or node.
  grep -oE "\"${1}\"[[:space:]]*:[[:space:]]*[0-9]+" "${BUDGET_FILE}" | grep -oE '[0-9]+$'
}

baseline_bytes="$(read_number baseline_bytes)"
max_growth_percent="$(read_number max_growth_percent)"

if [ -z "${baseline_bytes}" ] || [ -z "${max_growth_percent}" ]; then
  echo "::error::${BUDGET_FILE} must define integer baseline_bytes and max_growth_percent"
  exit 1
fi

limit_bytes=$(( baseline_bytes * (100 + max_growth_percent) / 100 ))
attestar_bytes=$(wc -c < "${ATTESTAR_WASM}" | tr -d '[:space:]')
mock_bytes=$(wc -c < "${MOCK_WASM}" | tr -d '[:space:]')

{
  echo "### Soroban wasm size"
  echo ""
  echo "| artifact | bytes |"
  echo "| --- | --- |"
  echo "| attestar.wasm | ${attestar_bytes} |"
  echo "| mock_token.wasm | ${mock_bytes} |"
  echo ""
  echo "attestar.wasm budget: ${limit_bytes} bytes (baseline ${baseline_bytes}, +${max_growth_percent}% margin)."
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

echo "attestar.wasm  = ${attestar_bytes} bytes (baseline ${baseline_bytes}, limit ${limit_bytes})"
echo "mock_token.wasm = ${mock_bytes} bytes"

if [ "${attestar_bytes}" -gt "${limit_bytes}" ]; then
  echo "::error::attestar.wasm is ${attestar_bytes} bytes, over the ${limit_bytes}-byte budget"
  exit 1
fi

echo "attestar.wasm within budget"
