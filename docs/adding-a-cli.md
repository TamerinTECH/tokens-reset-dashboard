# Add a CLI

A CLI shows up on the board when something writes a report for it. The report is one JSON object. The `report` command and the built-in readers produce the same shape.

In a clone, read `tokens-reset` below as `node bin/cli.js`.

## The report

```json
{
  "id": "cursor",
  "name": "Cursor",
  "vendor": "Anysphere",
  "plan": "Pro",
  "source": "cli",
  "observedAt": "2026-09-28T18:00:00.000Z",
  "windows": [
    {
      "id": "monthly",
      "label": "Monthly",
      "used": 20,
      "limit": 100,
      "unit": "percent",
      "resetsAt": "2026-10-01T00:00:00.000Z"
    }
  ]
}
```

Rules enforced by `lib/store.js`:

- `id` and each window `id` are slugs: lowercase letters, digits, hyphens, starting with a letter or digit, at most 64 characters.
- `unit` is `percent`, `tokens`, or `credits`. Percent windows default `limit` to 100.
- A window needs `used` or `resetsAt` or both. Do not send a guessed number.
- At most 12 windows.
- Field names that look like secrets (`token`, `apiKey`, `authorization`, `password`, `secret`, and a few siblings) are rejected.
- Strings are length-capped. `resetsAt` must fall within 400 days of now. Unix seconds and unix milliseconds are accepted and stored as ISO UTC.
- Each call replaces that CLI's entire window list. A window you stop sending disappears, which is what you want when a vendor drops an expired window.
- If `plan`, `note`, or `credits` is omitted, the previous value stays. Send `null` to clear it.
- A reading whose `observedAt` is older than the one on file is ignored, so a late update cannot roll the board backwards. Numbers marked `source: "example"` lose to any real reading.

Write it with either of these:

```bash
tokens-reset report --id cursor --name Cursor --plan Pro \
  --window id=monthly,label=Monthly,used=20,limit=100,unit=percent,resetsAt=2026-10-01T00:00:00Z

tokens-reset report --json reading.json
```

An unknown id is stored at once and is on the board the next time it is printed. You do not have to edit the catalog for that.

An id that starts with a built-in id and a hyphen, such as `claude-code-work`, is treated as a second profile of that CLI. It is listed right after it and painted the same color.

## Show it before the first reading

The three built-in rows are listed in `lib/catalog.js` even when they have no windows, so the board can explain how to fill them. Add an entry to show the same empty state for another CLI:

```js
{
  id: "cursor",
  name: "Cursor",
  vendor: "Anysphere",
  color: "#5c6e80",
  hint: "No reading yet. One sentence on how this CLI gets a reading.",
}
```

`color` is only the left bar and the usage fill on the page. Pick a dark color that stays readable as a thin bar on `#e6edf3`.

`hint` is shown only while `windows` is empty. Order in the catalog is order on the board. Anything not in the catalog is listed after the built-ins, by name.

## Write a reader

A reader turns something the CLI already wrote on disk into a report. It returns the object above, or `null` when there is nothing to read. It does not write the file itself. Add it to the list in `lib/collect.js`, and it runs every time the board is printed, built, or asked for over MCP.

Copy the shape of the existing ones:

- `lib/codex.js` reads the tail of the newest session logs under `~/.codex/sessions/YYYY/MM/DD/*.jsonl`. Codex stores `payload.rate_limits` on `token_count` events: `primary` and `secondary` each have `used_percent`, `window_minutes`, and `resets_at`, plus `plan_type`. The label comes from the length (`300` is 5-hour, `10080` is weekly), not from which slot it arrived in. A slot that is `null` is skipped, and so is an event for another limit id that carries no windows.
- `lib/grok.js` reads the tail of `~/.grok/logs/unified.jsonl` for the newest `billing: fetched credits config` line. Its `ctx.config` has `creditUsagePercent` and `currentPeriod` (`type`, `start`, `end`), and `ctx.subscriptionTier` is the plan.
- `lib/claude.js` maps a payload the CLI handed us on stdin, because Claude Code writes its limits nowhere on disk. The status line includes `rate_limits.five_hour` and `rate_limits.seven_day`, each with `used_percentage` and `resets_at` (unix seconds). The adapter is `adapters/claude-statusline.mjs`. It never clears a good reading just because one update lacked the fields.

Rules for a reader:

- Read the tail of a log with `readTail` from `lib/tail.js`. Do not load a whole session history.
- Take the timestamp from the log line as `observedAt`, not the time you read it.
- Honor the CLI's own home variable, as `CODEX_HOME` and `GROK_HOME` are.
- Keep the plan, the usage number, and the reset time. Do not keep prompts or anything else from the log.
- Give it a fixture under `test/` made of the fields you parse. Do not point a test at your real home directory.

### Leave login tokens alone

Do not read `~/.codex/auth.json`, `~/.claude/.credentials.json`, or `~/.grok/auth.json` to call a usage API.

Those files are login sessions. A reader that sends them to a vendor is a different product: it needs an explicit opt-in, it must not print the token, and it must not write the token into `usage.json`.

If a CLI shows its limits only on a screen, the `report` command is the integration. That is a finished one, not a placeholder.

## Document it

Add a row to the table under "Where the numbers come from" in `README.md`: where the numbers come from, how fresh they are, and whether it needs setup.
