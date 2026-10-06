#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { collectAll } from "../lib/collect.js";
import { writeDashboard } from "../lib/page.js";
import { dataFile, packageRoot, selfCommand } from "../lib/paths.js";
import { runReport } from "../lib/report.js";
import { runSetup } from "../lib/setup.js";
import { load, present } from "../lib/store.js";
import { renderStatus, wantsColor } from "../lib/terminal.js";

const COMMANDS = new Set(["status", "open", "setup", "report", "mcp", "help"]);

function help() {
  const cmd = selfCommand();
  console.log(`Usage and reset times of your coding CLIs: Claude Code, Codex, Grok Build.

  ${cmd}                 print every plan window: how full it is and when it resets
  ${cmd} --json          the same as JSON
  ${cmd} open            build the page and open it in the browser
  ${cmd} setup           one time: connect Claude Code's status line
  ${cmd} setup --undo    take that wiring out again
  ${cmd} report ...      record a reading by hand, for a CLI that has no log to read

Options
  --no-collect           status, open: use the stored readings, do not re-read the logs
  --no-open              open: write the page without opening it
  --dry-run              setup: say what would change and change nothing
  --claude-dir <dir>     setup: a Claude config folder to wire. Repeatable.
  --mcp                  setup: also register the MCP server in Claude Code, Codex, Grok Build

Codex and Grok Build are read from their own logs on this computer. Claude Code
reports through its status line, which setup connects. None of this uses tokens,
and nothing is sent anywhere. Readings are kept in ${dataFile()}

The MCP server is optional. It lets a CLI ask for these numbers in a session
(one tool, list_resets). ${cmd} mcp runs it.`);
}

async function collect(args) {
  if (args.includes("--no-collect")) return;
  for (const result of await collectAll()) {
    if (result.status === "error") console.error(`${result.name}: ${result.message}`);
  }
}

async function status(args) {
  await collect(args);
  const data = present(load());
  if (args.includes("--json")) console.log(JSON.stringify(data, null, 2));
  else process.stdout.write(renderStatus(data, { color: wantsColor() }));
}

async function open(args) {
  await collect(args);
  const file = writeDashboard(present(load()));
  console.log(file);
  if (args.includes("--no-open")) return;
  const [command, commandArgs] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", file]]
      : [process.platform === "darwin" ? "open" : "xdg-open", [file]];
  const child = spawn(command, commandArgs, { detached: true, stdio: "ignore" });
  child.on("error", () => console.error("Could not open a browser. Open the file above yourself."));
  child.unref();
}

function setup(args) {
  const claudeDirs = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== "--claude-dir") continue;
    if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("--claude-dir needs a folder");
    claudeDirs.push(args[i + 1]);
  }
  const undo = args.includes("--undo");
  // Undo also removes the MCP entry, whether or not it was ever added.
  console.log(runSetup({ undo, dryRun: args.includes("--dry-run"), mcp: undo || args.includes("--mcp"), claudeDirs }));
}

async function main() {
  const argv = process.argv.slice(2);
  // A bare flag such as --json belongs to status.
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "status";
  const args = command === argv[0] ? argv.slice(1) : argv;

  if (args.includes("--version") || args.includes("-v")) {
    console.log(JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version);
    return;
  }
  if (command === "help" || (command !== "report" && (args.includes("--help") || args.includes("-h")))) return help();
  if (!COMMANDS.has(command)) throw new Error(`Unknown command "${command}". Run: ${selfCommand()} help`);

  if (command === "status") return status(args);
  if (command === "open") return open(args);
  if (command === "setup") return setup(args);
  if (command === "report") return runReport(args);
  if (command === "mcp") return import("./mcp.js");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
