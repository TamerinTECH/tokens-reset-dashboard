import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { profileName } from "./claude.js";
import { packageRoot, selfCommand } from "./paths.js";

// One-time wiring. Claude Code is the only CLI that has to push its readings,
// so its status line is pointed at the adapter. With --mcp the MCP server is
// also registered, through each CLI's own `mcp add` command, so this never
// edits their config files by hand.

const ADAPTER = "claude-statusline.mjs";
const TEE = " --tee | ";
const SERVER = "tokens-reset";

const slashes = (file) => file.split(path.sep).join("/");

export function adapterCommand(adapterPath, id = "claude-code") {
  const base = `node "${slashes(adapterPath)}"`;
  return id === "claude-code" ? base : `${base} --id ${id}`;
}

// A status-line command is either the person's own, ours alone, or ours piped
// into theirs. `rest` is the part that is theirs.
function splitCommand(command) {
  if (!command.includes(ADAPTER)) return { ours: false, rest: command.trim() || null };
  const at = command.indexOf(TEE);
  return { ours: true, rest: at >= 0 ? command.slice(at + TEE.length).trim() || null : null };
}

// Returns the settings with the adapter in the status line. A status line that
// was already there keeps running: the adapter passes the same JSON on to it.
export function connectStatusLine(settings, adapterPath, id = "claude-code") {
  const current = settings.statusLine;
  const base = adapterCommand(adapterPath, id);
  let kept = null;
  if (current && typeof current.command === "string") kept = splitCommand(current.command).rest;
  const command = kept ? `${base}${TEE}${kept}` : base;
  const statusLine = { ...(current && typeof current === "object" ? current : {}), type: "command", command };
  const changed = JSON.stringify(current) !== JSON.stringify(statusLine);
  return { settings: { ...settings, statusLine }, changed, kept };
}

// Takes the adapter out again and leaves the person's own status line as it was.
export function disconnectStatusLine(settings) {
  const current = settings.statusLine;
  if (!current || typeof current.command !== "string") return { settings, changed: false, kept: null };
  const { ours, rest } = splitCommand(current.command);
  if (!ours) return { settings, changed: false, kept: rest };
  const next = { ...settings };
  if (rest) next.statusLine = { ...current, command: rest };
  else delete next.statusLine;
  return { settings: next, changed: true, kept: rest };
}

function defaultClaudeDir() {
  return path.join(os.homedir(), ".claude");
}

const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// Every Claude profile on this machine that we know of: ~/.claude when it
// exists, and CLAUDE_CONFIG_DIR when it points somewhere else. Each profile
// can be a different account, so each one gets its own row.
export function claudeProfiles(explicit = [], env = process.env) {
  const dirs = [];
  const add = (dir) => {
    if (dir && !dirs.some((known) => samePath(known, dir))) dirs.push(path.resolve(dir));
  };
  if (explicit.length) explicit.forEach(add);
  else {
    if (fs.existsSync(defaultClaudeDir())) add(defaultClaudeDir());
    add(env.CLAUDE_CONFIG_DIR);
    if (!dirs.length) add(defaultClaudeDir());
  }

  const hasDefault = dirs.some((dir) => samePath(dir, defaultClaudeDir()));
  return dirs.map((dir, index) => {
    const isMain = hasDefault ? samePath(dir, defaultClaudeDir()) : index === 0;
    const slug = path
      .basename(dir)
      .toLowerCase()
      .replace(/^\.?claude-?/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const id = isMain ? "claude-code" : `claude-code-${slug || index + 1}`.slice(0, 64);
    return { dir, id, name: profileName(id), settingsFile: path.join(dir, "settings.json") };
  });
}

function readSettings(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  const settings = JSON.parse(text.replace(/^﻿/, ""));
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("not a JSON object");
  return settings;
}

function writeSettings(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.before-tokens-reset`);
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
}

function statusLineStep(profile, { undo, dryRun }) {
  let settings;
  try {
    settings = readSettings(profile.settingsFile);
  } catch (error) {
    return `${profile.settingsFile}: left alone, it is not valid JSON (${error.message}).`;
  }
  const adapter = path.join(packageRoot, "adapters", ADAPTER);
  const result = undo ? disconnectStatusLine(settings) : connectStatusLine(settings, adapter, profile.id);
  if (!result.changed) {
    return `${profile.settingsFile}: ${undo ? "the status line is not ours, nothing to remove" : "already connected"}.`;
  }
  if (!dryRun) writeSettings(profile.settingsFile, result.settings);
  const verb = dryRun ? "would be " : "";
  if (undo) {
    return `${profile.settingsFile}: status line ${verb}${result.kept ? "put back to your own command" : "removed"}.`;
  }
  const row = profile.id === "claude-code" ? "" : ` as "${profile.name}"`;
  const tail = result.kept ? " Your own status line still runs after it." : "";
  return `${profile.settingsFile}: status line ${verb}connected${row}.${tail}`;
}

// Runs a CLI's own command. Windows needs a shell for the .cmd shims npm installs.
function run(command, args, env) {
  const options = { encoding: "utf8", env, timeout: 60_000, windowsHide: true };
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args.map((arg) => (/[\s&()^]/.test(arg) ? `"${arg}"` : arg))].join(" "), { ...options, shell: true })
      : spawnSync(command, args, options);
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return { ok: result.status === 0, output: output.split(/\r?\n/).pop() || "" };
}

function mcpTargets(profiles) {
  const server = slashes(path.join(packageRoot, "bin", "mcp.js"));
  const targets = profiles.map((profile) => {
    // ~/.claude is selected by the absence of CLAUDE_CONFIG_DIR.
    const env = { ...process.env };
    if (samePath(profile.dir, defaultClaudeDir())) delete env.CLAUDE_CONFIG_DIR;
    else env.CLAUDE_CONFIG_DIR = profile.dir;
    return {
      name: profile.name,
      bin: "claude",
      env,
      add: ["mcp", "add", "--scope", "user", SERVER, "--", "node", server],
      remove: ["mcp", "remove", "--scope", "user", SERVER],
    };
  });
  targets.push({
    name: "Codex",
    bin: "codex",
    env: process.env,
    add: ["mcp", "add", SERVER, "--", "node", server],
    remove: ["mcp", "remove", SERVER],
  });
  targets.push({
    name: "Grok Build",
    bin: "grok",
    env: process.env,
    add: ["mcp", "add", SERVER, "node", "--", server],
    remove: ["mcp", "remove", SERVER],
  });
  return targets;
}

function mcpStep(target, { undo, dryRun }) {
  if (!run(target.bin, ["--version"], target.env).ok) return `${target.name}: not installed, skipped.`;
  if (dryRun) return `${target.name}: would run ${target.bin} ${(undo ? target.remove : target.add).join(" ")}`;
  // Remove first so a second setup, or a moved clone, replaces the old entry.
  run(target.bin, target.remove, target.env);
  // Some CLIs report success for an entry that was never there, so do not claim a removal.
  if (undo) return `${target.name}: not registered.`;
  const added = run(target.bin, target.add, target.env);
  return added.ok ? `${target.name}: registered.` : `${target.name}: could not register (${added.output}).`;
}

// The status line is the whole connection, and it costs no tokens: Claude Code
// runs it locally and its output never reaches the model. The MCP server is
// extra and opt-in, because a registered tool is sent to the model in every session.
//
// `mcp` is off for setup unless asked for. It is on for undo, so that undo
// removes an entry an earlier `setup --mcp` left behind.
export function runSetup({ undo = false, dryRun = false, mcp = undo, claudeDirs = [] } = {}) {
  const lines = [];
  if (!undo && /[\\/]_npx[\\/]/.test(packageRoot)) {
    throw new Error(
      "setup writes this folder's path into your CLI settings, and npx runs from a cache that npm clears.\n" +
        "Install it for good first: npm install -g github:TamerinTECH/tokens-reset-dashboard, or clone the repo.",
    );
  }

  const profiles = claudeProfiles(claudeDirs);
  lines.push("Claude Code status line");
  for (const profile of profiles) lines.push(`  ${statusLineStep(profile, { undo, dryRun })}`);

  if (mcp) {
    lines.push("", `MCP server "${SERVER}"`);
    for (const target of mcpTargets(profiles)) lines.push(`  ${mcpStep(target, { undo, dryRun })}`);
  }

  lines.push("");
  if (undo) lines.push("Readings already stored are kept. Delete ~/.tokens-reset to remove them too.");
  else {
    lines.push("Codex and Grok Build need nothing: their limits are read from their own logs.");
    lines.push(`Send one message in Claude Code, then run: ${selfCommand()}`);
    if (!mcp) {
      lines.push("", `Optional: ${selfCommand()} setup --mcp also lets the CLIs ask for these numbers in a session.`);
    }
  }
  return lines.join("\n");
}
