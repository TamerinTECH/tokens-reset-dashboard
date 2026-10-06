# Claude Code

Read [AGENTS.md](AGENTS.md) first. It covers the rules for this repo: local files only, no database, no auth files, no new dependencies without a reason, no personal readings in the working tree.

This file is the Claude-specific part.

## Status line

Claude Code pipes a JSON document to the status-line command. For claude.ai Pro and Max, after the first response, that document can include:

```json
{
  "rate_limits": {
    "five_hour": { "used_percentage": 23.5, "resets_at": 1738425600 },
    "seven_day": { "used_percentage": 41.2, "resets_at": 1738857600 }
  }
}
```

`resets_at` is unix seconds. A window may be missing, and Claude drops a window once its reset has passed. `lib/claude.js` maps the windows that are present. `adapters/claude-statusline.mjs` stores them. If `rate_limits` is absent it leaves the stored reading alone.

The adapter has two modes:

- Alone, it prints one status-line row.
- With `--tee`, it prints the JSON it was given and nothing else, so the person's own status line can follow after a pipe. `node bin/cli.js setup` writes that form when a status line already exists.

`--id claude-code-work` stores under a second row, for a second Claude profile (`CLAUDE_CONFIG_DIR`). Two profiles can be two accounts.

Every open session runs the status line, and each one only knows the limits as of its own last response. An idle session repeats old numbers, sometimes after a busier session reported newer ones. The adapter therefore dates a reading by the modified time of `transcript_path`, which is when that session last did something, and the store keeps the newest. It reads the file's date only, never its content. Do not go back to stamping readings with the current time.

Claude Code runs the status line many times a minute and cancels a run that is still going when the next one starts. The adapter therefore writes at most once a minute for unchanged numbers, and it must never fail or print an error: a status line that exits non-zero shows nothing.

Do not scrape `~/.claude/.credentials.json` to call a usage API. The status-line payload is the supported source.

## MCP

The MCP server is optional and off by default (`setup --mcp`). A registered tool is sent to the model in every session, so it has one read-only tool, `list_resets`, a short description, no `instructions`, and an answer of one line per CLI. Do not add tools or grow the text without a strong reason.

`bin/mcp.js` speaks stdio MCP: one JSON message per line, which is what Claude Code, Codex, and Grok Build send. It also answers a client that uses `Content-Length` framing. Stdout is protocol only. Logs go to stderr.

After changing it, check with a real client, against a throwaway config folder:

```bash
CODEX_HOME=/tmp/codex-test GROK_HOME=/tmp/grok-test node bin/cli.js setup --mcp --claude-dir /tmp/claude-test
CLAUDE_CONFIG_DIR=/tmp/claude-test claude mcp list
```

When you change the tool's description, keep the instruction that the model must not estimate a missing number.

## Changing the page

`public/styles.css` and `public/app.js` are the page. `node bin/cli.js open` inlines them, with the fonts and the current readings, into `~/.tokens-reset/dashboard.html` and opens it. Check a wide window and a narrow one, including the empty state and a state with windows. The tab title is the next reset. The clock ticks every second from the times baked into the file. There is no server and no poll.

The typefaces are local files in `public/fonts/`. Do not switch the page to a font CDN.
