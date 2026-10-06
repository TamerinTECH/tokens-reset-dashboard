#!/usr/bin/env node
// Claude Code runs this and pipes the status-line JSON to stdin. When that JSON
// includes rate_limits, this stores them and prints one status-line row.
// It does not read credentials.
//
//   --id claude-code-work   store under another row, for a second Claude profile
//   --tee                   print the JSON back out instead of a row, so the
//                           status line you already had can follow after a pipe

import fs from "node:fs";
import { reportFromClaudeStatusline } from "../lib/claude.js";
import { applyReport, load, normalizeReport } from "../lib/store.js";
import { toIso } from "../lib/time.js";
import { formatAmount, formatReset } from "../public/format.js";

const args = process.argv.slice(2);
const tee = args.includes("--tee");
const idAt = args.indexOf("--id");
const id = idAt >= 0 && args[idAt + 1] ? args[idAt + 1] : "claude-code";

// The command after the pipe may exit without reading.
process.stdout.on("error", () => {});

let raw = "";
try {
  raw = fs.readFileSync(0, "utf8");
} catch {
  // no stdin
}

// Pass the payload on before touching the disk, so the status line behind the
// pipe is never slower because of us. Non-ASCII is written as \u escapes,
// which is the same JSON, because Windows PowerShell re-encodes text between programs.
if (tee) {
  process.stdout.write(raw.replace(/[^\x00-\x7f]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`));
}

let report = null;
try {
  const payload = JSON.parse(raw);
  report = reportFromClaudeStatusline(payload, lastHeardFrom(payload), id);
} catch {
  // not JSON, or an id the store rejects
}

if (report) {
  try {
    if (!nothingNew(report)) await applyReport(report);
  } catch {
    // A busy file must not break the status line. The next update writes it.
  }
  if (!tee) {
    const parts = report.windows.map((window) => {
      const amount = formatAmount(window.used, window.limit, window.unit);
      const when = window.resetsAt ? `resets ${formatReset(toIso(window.resetsAt))}` : "";
      return [window.label, amount, when].filter(Boolean).join(" ");
    });
    process.stdout.write(`${parts.join("   ")}\n`);
  }
}

// Every open session runs this, and each one only knows the limits as of its
// own last response. An idle session repeats old numbers, sometimes long
// after a busier one reported newer ones. So a reading is dated by when its
// session last did something, which is the transcript's modified time, and
// the store keeps the newest. Only the file's date is read, never its content.
function lastHeardFrom(payload) {
  const now = new Date();
  try {
    const touched = fs.statSync(payload.transcript_path).mtime;
    return touched < now ? touched : now;
  } catch {
    return now;
  }
}

// Claude Code runs the status line many times a minute. Older numbers than
// the ones on file, or the same numbers within a minute, are not worth a write.
function nothingNew(next) {
  const current = load().tools.find((tool) => tool.id === next.id);
  if (!current?.observedAt || current.source !== next.source) return false;
  const newer = Date.parse(next.observedAt) - Date.parse(current.observedAt);
  if (newer < 0) return true;
  return newer < 60_000 && JSON.stringify(current.windows) === JSON.stringify(normalizeReport(next).windows);
}
