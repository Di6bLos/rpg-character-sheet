#!/usr/bin/env bash
# Post a PR review from a JSON payload (see references/review-payload.md).
# Refuses when the payload's commit_id is no longer the PR's head.
# Usage: post-review.sh <pr-number> <payload.json>
set -euo pipefail

N="${1:?pr number}"
PAYLOAD="${2:?payload json}"

HEAD="$(gh pr view "$N" --json headRefOid -q .headRefOid)"
WANT="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).commit_id)' "$PAYLOAD")"
if [ "$HEAD" != "$WANT" ]; then
    echo "PR head moved: payload has $WANT, PR is at $HEAD. Re-check line numbers." >&2
    exit 1
fi

gh api "repos/{owner}/{repo}/pulls/${N}/reviews" --method POST --input "$PAYLOAD" \
    --jq '{id, state, html_url}'
