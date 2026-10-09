#!/usr/bin/env bash
# Compile a circuit and run the Groth16 trusted setup.
# Usage: bash scripts/build.sh <circuit_name>   (default: psolvency_demo)
# Env: PTAU (path to a phase-1 ptau). Defaults to build/ptau/pot<POWER>.ptau.
set -euo pipefail

NAME="${1:-psolvency_demo}"
SRC="circuits/${NAME}.circom"
OUT="build/${NAME}"
SNARKJS="${SNARKJS:-npx snarkjs}"

[ -f "${SRC}" ] || { echo "circuit not found: ${SRC}"; exit 1; }
mkdir -p "${OUT}"

echo "==> compiling ${SRC}"
circom "${SRC}" --r1cs --wasm --sym -l node_modules -o "${OUT}"

echo "==> circuit info"
${SNARKJS} r1cs info "${OUT}/${NAME}.r1cs"

# Resolve a ptau file.
if [ -z "${PTAU:-}" ]; then
  PTAU="$(find build/ptau -maxdepth 1 -name 'pot*.ptau' 2>/dev/null | sort | tail -1 || true)"
fi
[ -n "${PTAU:-}" ] && [ -f "${PTAU}" ] || {
  echo "no ptau found. run: bash scripts/ptau.sh <POWER>  (and/or set PTAU=...)"; exit 1;
}
echo "==> using ptau ${PTAU}"

echo "==> groth16 setup"
${SNARKJS} groth16 setup "${OUT}/${NAME}.r1cs" "${PTAU}" "${OUT}/${NAME}_0.zkey"

echo "==> contributing to phase 2 (hackathon-grade, single contribution)"
${SNARKJS} zkey contribute "${OUT}/${NAME}_0.zkey" "${OUT}/${NAME}.zkey" \
  --name="attestar-dev" -e="$(head -c 64 /dev/urandom | base64)"

echo "==> exporting verification key"
${SNARKJS} zkey export verificationkey "${OUT}/${NAME}.zkey" "${OUT}/${NAME}.vkey.json"

echo "==> done. artifacts in ${OUT}/"
echo "    ${NAME}.zkey            (prover key)"
echo "    ${NAME}.vkey.json       (verifier key -> Soroban contract)"
echo "    ${NAME}_js/${NAME}.wasm (witness generator)"
