#!/usr/bin/env bash
# Fail when a `process.env.X` read in the workspace has no entry in
# apps/web/.env.example. Adding a new NEXT_PUBLIC_* flag without documenting it
# therefore fails CI.
set -euo pipefail

EXAMPLE="apps/web/.env.example"

if [ ! -f "${EXAMPLE}" ]; then
  echo "::error::${EXAMPLE} is missing - every environment variable must be documented"
  exit 1
fi

read_env_names() {
  grep -rhoE 'process\.env\.[A-Za-z_][A-Za-z0-9_]*' \
    --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.js' --include='*.cjs' \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
    apps/web packages \
    | sed 's/^process\.env\.//' | sort -u
}

example_names() {
  grep -oE '^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=' "${EXAMPLE}" \
    | sed -E 's/^[[:space:]]*(export[[:space:]]+)?//; s/=$//' | sort -u
}

missing="$(comm -23 <(read_env_names) <(example_names))"

if [ -n "${missing}" ]; then
  echo "::error::${EXAMPLE} is missing entries for:"
  echo "${missing}"
  exit 1
fi

count=$(read_env_names | wc -l | tr -d '[:space:]')
echo "${EXAMPLE} documents all ${count} process.env name(s) read in the workspace"
