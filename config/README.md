# Wiring by hand

`node bin/cli.js setup` connects the status line for you, `setup --mcp` also registers the MCP server, and `setup --undo` takes both out. These files are for when you would rather edit the settings yourself. Replace `D:/path/to/tokens-reset-dashboard` with the absolute path of your clone, written with forward slashes.

| File | Goes into | What it does |
| --- | --- | --- |
| `claude.settings.json` | `~/.claude/settings.json` | Points Claude Code's status line at the adapter, which stores the limits. |
| `mcp.claude.json` | `~/.claude.json`, or `.mcp.json` in a project | Optional. Registers the MCP server in Claude Code. |
| `mcp.codex.toml` | `~/.codex/config.toml` | Optional. Registers the MCP server in Codex. |
| `mcp.grok.toml` | `~/.grok/config.toml` | Optional. Registers the MCP server in Grok Build. |

If you already have a status line, keep it by putting the adapter in front of it with `--tee`:

```json
"command": "node \"D:/path/to/tokens-reset-dashboard/adapters/claude-statusline.mjs\" --tee | bash ~/.claude/statusline.sh"
```

Codex and Grok Build need no wiring for their usage. It is read from their logs.
