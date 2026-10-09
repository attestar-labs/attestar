#!/usr/bin/env bash
# Fail when a large circuit artifact is committed. Only the two proving assets
# the web app loads at runtime may be tracked; every other *.zkey / *.wasm /
# packages/circuits/build/** file must be regenerated (or fetched) instead.
set -euo pipefail

ALLOWLIST=".github/artifact-allowlist.txt"

is_allowed() {
  local path="$1"
  [ -f "${ALLOWLIST}" ] || return 1
  local pattern
  while IFS= read -r pattern; do
    [ -z "${pattern}" ] && continue
    case "${pattern}" in \#*) continue ;; esac
    # shellcheck disable=SC2254 # allow glob matching from the allowlist file
    case "${path}" in ${pattern}) return 0 ;; esac
  done < "${ALLOWLIST}"
  return 1
}

violations=0
found=0

while IFS= read -r path; do
  [ -z "${path}" ] && continue
  case "${path}" in
    *.zkey | *.wasm | packages/circuits/build/*) ;;
    *) continue ;;
  esac
  found=$((found + 1))
  if is_allowed "${path}"; then
    echo "allowed artifact: ${path}"
  else
    echo "::error::tracked circuit artifact outside the allowlist: ${path}"
    violations=$((violations + 1))
  fi
done < <(git ls-files)

echo "checked ${found} tracked circuit artifact(s)"

if [ "${violations}" -gt 0 ]; then
  echo "::error::${violations} tracked circuit artifact(s) must be removed or explicitly allowlisted"
  exit 1
fi
