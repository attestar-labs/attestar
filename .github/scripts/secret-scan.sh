#!/usr/bin/env bash
# Scan the whole git history (and the working tree) for committed secrets.
#
# Fails on a Stellar secret seed ("S" plus 55 base32 characters) or a PEM
# private-key block. Paths listed in .github/secret-scan-allowlist.txt are
# skipped; that file mirrors the secret exclusions in .gitignore.
set -euo pipefail

ALLOWLIST=".github/secret-scan-allowlist.txt"
SEED_RE='(^|[^A-Z2-7])S[A-Z2-7]{55}($|[^A-Z2-7])'
PEM_RE='-----BEGIN [A-Z ]*PRIVATE KEY-----'
PATTERN="(${SEED_RE})|(${PEM_RE})"

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

hits=0

scan() {
  local line path
  while IFS= read -r line; do
    [ -z "${line}" ] && continue
    # git grep -n output is <rev>:<path>:<line>:<content> (no <rev> for the tree).
    if [[ "${line}" =~ ^[0-9a-f]{40}: ]]; then
      path="${line#*:}"
      path="${path%%:*}"
    else
      path="${line%%:*}"
    fi
    if is_allowed "${path}"; then
      continue
    fi
    echo "::error::possible secret in ${line}"
    hits=$((hits + 1))
  done < <(git grep -n -I -E -e "${PATTERN}" "$@" -- . 2>/dev/null || true)
}

# Every commit in the repository's history.
while IFS= read -r rev; do
  scan "${rev}"
done < <(git rev-list --all)

# The working tree as well, so a file staged but not yet committed is caught.
scan

if [ "${hits}" -gt 0 ]; then
  echo "::error::found ${hits} potential secret(s); purge them from the tree and history"
  exit 1
fi

echo "secret scan clean"
