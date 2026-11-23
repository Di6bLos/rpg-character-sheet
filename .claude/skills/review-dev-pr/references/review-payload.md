# Review payload

What `scripts/post-review.sh` sends to `POST /repos/{owner}/{repo}/pulls/{N}/reviews`.

```json
{
  "commit_id": "<headRefOid>",
  "event": "COMMENT",
  "body": "Verdict line naming the blocking findings. Checks run.\n\n**#1 (should fix, not on a changed line): …** findings that can't be inline\n\n**What's good:** …",
  "comments": [
    {
      "path": "components/sheet/NimbleSheet.vue",
      "line": 82,
      "side": "RIGHT",
      "body": "**#3 (minor): short title.** What goes wrong, why, and the fix."
    }
  ]
}
```

- `line` is the line number in the head version of the file (`scripts/line-of.sh`). For a range, add `start_line` (and `start_side: "RIGHT"`).
- A line outside the diff's hunks makes the whole request fail with 422 ("Line could not be resolved"). Move that finding into `body`.
- `event`: `COMMENT` by default; `REQUEST_CHANGES` or `APPROVE` only when the user asks.
- Write it with a quoted heredoc (`<<'EOF'`) so backticks and `$` stay literal. Escape `"` inside JSON strings and use `\n` for newlines.
