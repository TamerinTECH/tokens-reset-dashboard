import fs from "node:fs";
import { selfCommand } from "./paths.js";
import { applyReport, clearAll, forgetTool, present } from "./store.js";

// `report`: write or clear a reading by hand. This is how a CLI that leaves
// nothing on disk gets onto the board.

function parseWindow(spec) {
  const window = {};
  for (const part of spec.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) throw new Error(`A window is key=value pairs separated by commas. Got: ${spec}`);
    window[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  if (window.used != null && window.used !== "") window.used = Number(window.used);
  if (window.limit != null && window.limit !== "") window.limit = Number(window.limit);
  return window;
}

function help() {
  const cmd = `${selfCommand()} report`;
  console.log(`Record a plan window by hand.

  ${cmd} --id cursor --name Cursor --plan Pro \\
    --window id=monthly,label=Monthly,used=20,limit=100,unit=percent,resetsAt=2026-11-01T00:00:00Z

  ${cmd} --json reading.json
  ${cmd} --example
  ${cmd} --forget cursor
  ${cmd} --clear

--window can be repeated. used and limit are numbers. unit is percent, tokens, or credits.
resetsAt is an ISO time or unix seconds. Omit a number you do not have.
Do not invent usage.`);
}

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function writeExample() {
  const example = (id, plan, windows) => ({ id, plan, source: "example", windows });
  const reports = [
    example("claude-code", "Max", [
      { id: "five-hour", label: "5-hour", used: 37, limit: 100, unit: "percent", resetsAt: hoursFromNow(2.2) },
      { id: "seven-day", label: "Weekly", used: 22, limit: 100, unit: "percent", resetsAt: hoursFromNow(24 * 4) },
    ]),
    example("codex", "Pro", [
      { id: "m300", label: "5-hour", used: 64, limit: 100, unit: "percent", resetsAt: hoursFromNow(0.8) },
      { id: "m10080", label: "Weekly", used: 15, limit: 100, unit: "percent", resetsAt: hoursFromNow(24 * 3) },
    ]),
    example("grok", "SuperGrok", [
      { id: "weekly", label: "Weekly", used: 41, limit: 100, unit: "percent", resetsAt: hoursFromNow(24 * 5) },
    ]),
  ];
  for (const report of reports) await applyReport(report);
}

export async function runReport(args) {
  const has = (flag) => args.includes(flag);
  const values = (flag) => {
    const found = [];
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] !== flag) continue;
      const next = args[i + 1];
      if (next == null || next.startsWith("--")) throw new Error(`${flag} needs a value`);
      found.push(next);
    }
    return found;
  };
  const value = (flag) => values(flag)[0];

  if (args.length === 0 || has("--help") || has("-h")) return help();
  if (has("--clear")) {
    await clearAll();
    console.log("Cleared every reading.");
    return;
  }
  if (has("--forget")) {
    const id = value("--forget");
    await forgetTool(id);
    console.log(`Forgot ${id}.`);
    return;
  }
  if (has("--example")) {
    await writeExample();
    console.log("Wrote example numbers. They are marked as examples and are not your account.");
    console.log(`Any real reading replaces them. Remove them with: ${selfCommand()} report --clear`);
    return;
  }

  let reports;
  if (has("--json")) {
    const file = value("--json");
    const parsed = JSON.parse(fs.readFileSync(file === "-" ? 0 : file, "utf8"));
    reports = Array.isArray(parsed) ? parsed : [parsed];
  } else {
    const id = value("--id");
    if (!id) throw new Error("--id is required, for example --id cursor");
    const report = { id, source: "cli", windows: values("--window").map(parseWindow) };
    for (const flag of ["name", "vendor", "plan", "note"]) {
      if (has(`--${flag}`)) report[flag] = value(`--${flag}`);
    }
    reports = [report];
  }

  for (const report of reports) {
    const { changed, tool } = await applyReport(report);
    const count = `${tool.windows.length} window${tool.windows.length === 1 ? "" : "s"}`;
    console.log(`${changed ? "Saved" : "Kept the newer reading for"} ${tool.name} (${tool.id}), ${count}`);
  }
  if (has("--print")) console.log(JSON.stringify(present(), null, 2));
}
