#!/usr/bin/env bash
# Print the line number(s) of exact text in a file at the PR's head, for inline review comments.
# Usage: line-of.sh <pr-number> <path> "<exact text>"
set -euo pipefail

N="${1:?pr number}"
FILE="${2:?path}"
TEXT="${3:?text}"

SHA="$(gh pr view "$N" --json headRefOid -q .headRefOid)"
git fetch -q origin "pull/${N}/head" 2>/dev/null || true
git show "${SHA}:${FILE}" | grep -nF -- "$TEXT" | cut -d: -f1
