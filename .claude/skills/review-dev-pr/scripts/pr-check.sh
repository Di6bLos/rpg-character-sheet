#!/usr/bin/env bash
# Run the test suite and oxlint for a PR on a throwaway worktree, then remove it.
# Usage: pr-check.sh <pr-number> <scratch-dir>
set -euo pipefail

N="${1:?pr number}"
SCRATCH="${2:?scratch dir}"
REPO="$(git rev-parse --show-toplevel)"
WT="$SCRATCH/pr${N}wt"
BR="pr${N}"

cd "$REPO"
git fetch -q origin "pull/${N}/head:${BR}" --force

cleanup() {
    cd "$REPO"
    git worktree remove --force "$WT" 2>/dev/null || true
    git branch -D -q "$BR" 2>/dev/null || true
}
trap cleanup EXIT

git worktree add -q "$WT" "$BR"
ln -s "$REPO/node_modules" "$WT/node_modules"
# Vitest reads tsconfig.json, which extends the generated .nuxt/tsconfig.json.
if [ -d "$REPO/.nuxt" ]; then cp -R "$REPO/.nuxt" "$WT/.nuxt"; fi

# shellcheck disable=SC1091
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null
nvm use -s 22.18.0 >/dev/null

cd "$WT"
echo "== vitest"
npx vitest run 2>&1 | grep -E "Test Files|Tests |FAIL|Error" || true

BASE="$(gh pr view "$N" --json baseRefName -q .baseRefName)"
git fetch -q origin "$BASE"
CHANGED=$(git diff --name-only --diff-filter=d "origin/${BASE}...HEAD" -- '*.ts' '*.vue' || true)
echo "== oxlint (changed files)"
if [ -n "$CHANGED" ]; then
    # shellcheck disable=SC2086
    npx oxlint $CHANGED 2>&1 | tail -3
else
    echo "no .ts/.vue changes"
fi
