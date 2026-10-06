# Agents

This repo is `tokens-reset`: usage and reset times of coding CLIs, in the terminal and as a local page, with an optional MCP server. Read `README.md` for how a person uses it. This file is for an agent changing the code.

## What not to add

- No database, no hosted backend, no account system, and no server to leave running.
- No network calls. Everything is read from files the CLIs already wrote on this computer.
- No reading of `auth.json`, `.credentials.json`, or API keys. Codex is read from session logs. Grok Build is read from its own log. Claude Code is read from the status-line payload.
- No token cost. The default connection is the status line and the log readers, which the model never sees. The MCP server is opt-in (`setup --mcp`), and everything it sends to a model stays short: one tool, a two-sentence description, one line per CLI in the answer. `test/mcp.test.js` holds it to a size.
- No new runtime dependency unless a task is genuinely awkward without it. Node 20 and the standard library are the stack. `npm install -g github:...` has to work with nothing to download or build.
- No personal data in the repo. Readings live in `~/.tokens-reset/` (`lib/paths.js`). Do not write usage numbers or a built page into the working tree.
- No real data in fixtures, samples, or screenshots. When you need a log line or a reading for a test or the README, make the values up: round times, invented percents, a generic plan name. Do not paste a line from your own `~/.codex`, `~/.grok`, or `~/.claude`, and do not copy your own board into a sample. A real line carries your billing dates and your plan.

## How a reading moves

Something produces a report object. `lib/store.js` validates it and merges it into `~/.tokens-reset/usage.json`. `present()` adds catalog hints and colors, which are not stored. `lib/terminal.js` prints that, `lib/page.js` bakes it into `dashboard.html`, and `bin/mcp.js` returns it as a few plain lines (`renderCompact`).

A report replaces that CLI's whole window list. An older `observedAt` does not overwrite a newer one. The same reading again is not written twice. `source: "example"` loses to a real reading.

Report producers:

- `lib/codex.js` and `lib/grok.js`, run by `lib/collect.js` on every `status`, `open`, and `list_resets`
- `adapters/claude-statusline.mjs` via `lib/claude.js`, run by Claude Code
- `tokens-reset report` (`lib/report.js`)

## Layout

| Path | Role |
| --- | --- |
| `bin/cli.js` | The command. Dispatches `status`, `open`, `setup`, `report`, `mcp`. |
| `bin/mcp.js` | Optional stdio MCP server, one read-only tool. One JSON message per line. Stdout is protocol only. |
| `adapters/claude-statusline.mjs` | Claude Code status-line command. `--tee` passes the payload on to the person's own status line. |
| `lib/collect.js` | The list of readers that have a log to read. |
| `lib/catalog.js` | Default rows. Edit this to show a CLI before its first reading. |
| `lib/store.js` | Lock, validate, merge. |
| `lib/setup.js` | Edits Claude's `settings.json`. With `--mcp`, also calls each CLI's own `mcp add`. |
| `public/` | Page source. `lib/page.js` inlines it, fonts included, because a module script does not run from `file://`. |
| `schema/usage.schema.json` | On-disk shape. Update it when the stored fields change. |
| `docs/adding-a-cli.md` | How to add a CLI without breaking the rules above. |

`public/format.js` is imported by the page and by Node. Keep it free of browser-only APIs other than `Intl`, which Node has too.

## Checks

```bash
node --test
node bin/cli.js
node bin/cli.js open --no-open
```

Tests must not touch the real `~/.codex`, `~/.grok`, `~/.claude`, or `~/.tokens-reset`. `test/fixtures.js` builds throwaway homes and the env that points at them. Use it for anything that spawns the command.

`setup` changes other tools' settings. Test it against temp folders: `--claude-dir`, `CODEX_HOME`, and `GROK_HOME` all redirect it. In a unit test call `runSetup` with `mcp: false`, always, including for undo. With `mcp` on it runs the real `claude`, `codex`, and `grok` commands against whatever home the environment points at. `claude mcp list` and `grok mcp doctor` are real clients that confirm the MCP server still connects.

When you change the page, run `node bin/cli.js open` and look at it. Confirm the empty board and a board with windows, at a narrow width and a wide one. The countdown has to keep updating after the first paint.

## Adding a CLI

Follow `docs/adding-a-cli.md`. A new id reported through the `report` command is stored at once. A catalog entry is only for the empty-state sentence and the color.
