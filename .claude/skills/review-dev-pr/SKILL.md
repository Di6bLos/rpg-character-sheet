---
name: review-dev-pr
description: Review another developer's GitHub pull request in this repo, post the findings as a GitHub review with inline comments, and notify the PR author with an @mention. Use for "review PR 52", "review Evan's PR and post comments", "post the review and notify the dev". Not for reviewing your own uncommitted changes (use code-review) or replying to comments on your own PR (pr-human-review / pr-bot-review).
---

# Review a developer's PR

Three phases, each ending with a check-in unless the user already asked for the later phases ("review PR 52, post it and notify the dev" covers all three):

1. **Review**: read, verify, report in the terminal.
2. **Post**: one GitHub review with inline comments.
3. **Notify**: one PR comment that @mentions the author.

Posting and notifying are visible to others: don't do them until the user asks, in this request or a later one.

## 1. Review

**Metadata and diff**

```bash
gh pr view <N> --json title,body,author,baseRefName,headRefName,headRefOid,additions,deletions,mergeable,mergeStateStatus,statusCheckRollup,files,commits
gh pr diff <N> > <scratchpad>/pr<N>.diff   # then Read it in chunks; skip the CLAUDE.md hunk unless it matters
```

Read the PR body: it states what the change does, what it leaves out and how it was tested. Check those claims against the code.

**Verify, don't guess.** Look at the code each finding depends on, using `git show pr<N>:<path>` after `git fetch -q origin pull/<N>/head:pr<N>`. Examples: whether some state is ever reset, whether a parallel code path got the same change, what the rules data text actually says. Go through `references/checklist.md`; it lists the problems this repo's PRs tend to have.

**Run the checks** on a temporary worktree, so the user's checkout stays as it is:

```bash
.claude/skills/review-dev-pr/scripts/pr-check.sh <N> <scratchpad>
```

It runs the full Vitest suite and oxlint on the changed files, then removes the worktree. Report the real output. If something fails, say whether the PR or the temporary setup caused it.

**Report in the terminal**, in this order:

- A verdict: ready, ready with follow-ups, or needs fixes, naming the finding numbers that must be fixed.
- What you verified: checks, mergeability, tests, lint. Also say what you didn't run (type-check, browser smoke test).
- **Should fix**: numbered. Each one says what goes wrong for a player or GM, where (`file:line`), and a concrete fix.
- **Minor**: numbered and continuing the same numbering, so posted comments can refer to "#5".
- **Good**: two to four specific things, not general praise.
- A closing line offering to post it.

## 2. Post

Make one review, as an inline comment per finding where possible:

1. Get the line numbers in the PR's **head** file:
   `scripts/line-of.sh <N> <path> "<exact text>"`. Comments use the new file's line number, `side: RIGHT`.
2. GitHub only accepts inline comments on lines inside the diff's hunks. A finding about an unchanged line or file goes in the review body, with its `file:line` and number.
3. Write the payload as JSON in the scratchpad (format in `references/review-payload.md`) and post it:
   `scripts/post-review.sh <N> <payload.json>`. It checks that `commit_id` is still the PR's head before posting.

Rules:

- Use `"event": "COMMENT"` unless the user asks for `REQUEST_CHANGES` or `APPROVE`. The body says which findings block merging.
- Each comment starts with its number and how serious it is: `**#2 (should fix): …**` or `**#5 (minor): …**`. It stands on its own: what happens, why, and a fix.
- Put a bare `@name` in a comment only when the user wants that person notified. Write code like `@types/x` in backticks.
- Don't post your own review twice. If one is already there, ask whether to add to it.

## 3. Notify

Post one short PR comment that mentions the author's login (`.author.login` from step 1) and links the review:

```bash
gh pr comment <N> --body "@<author> review is up: <review html_url>

<one or two lines: what must change before merge, or that it's ready>"
```

Mention only the author, unless the user names other people.

## Afterwards

Clean up: remove the worktree, delete the `pr<N>` branch, and make sure the user's checkout is still on its branch. Then give the user the review link, the comment link, and a line saying which findings went into the review body instead of inline comments, and why.
