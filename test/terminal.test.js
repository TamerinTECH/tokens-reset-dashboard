import assert from "node:assert/strict";
import test from "node:test";
import { renderStatus } from "../lib/terminal.js";

const now = Date.parse("2026-10-06T12:00:00.000Z");
const hour = 60 * 60 * 1000;
const at = (ms) => new Date(now + ms).toISOString();

function board() {
  return {
    tools: [
      { id: "claude-code", name: "Claude Code", windows: [], hint: "No reading yet. Run setup." },
      {
        id: "codex",
        name: "Codex",
        plan: "Pro",
        source: "codex-session",
        observedAt: at(-5 * 60 * 1000),
        windows: [
          { id: "m300", label: "5-hour", used: 100, limit: 100, unit: "percent", resetsAt: at(2 * hour + 5 * 60 * 1000) },
          { id: "m10080", label: "Weekly", used: 98, limit: 100, unit: "percent", resetsAt: at(-hour) },
        ],
      },
      {
        id: "cursor",
        name: "Cursor",
        source: "cli",
        observedAt: at(-3 * hour),
        windows: [{ id: "monthly", label: "Monthly", used: 12_500, limit: 100_000, unit: "tokens", resetsAt: null }],
      },
    ],
  };
}

test("the board reads top to bottom: next reset, then a block per CLI", () => {
  const lines = renderStatus(board(), { now }).split("\n");
  assert.match(lines[0], /^Next reset: Codex, 5-hour, in 2h 05m \(.+\)$/);
  assert.equal(lines[2], "Claude Code");
  assert.equal(lines[3], "  No reading yet. Run setup.");
  assert.equal(lines[5], "Codex  Pro");
  assert.match(lines[6], /^ {2}5-hour {3}█{20} {2}100% {2}resets in 2h 05m \(.+\)$/);
  assert.equal(lines[8], "  From the last Codex session, 5 min ago");
  assert.match(lines[11], /^ {2}Monthly {2}█{3}░{17} 12\.5k \/ 100k {2}reset time not reported$/);
});

test("a full bar is kept for a reached limit, and a passed reset is not shown as zero", () => {
  const weekly = renderStatus(board(), { now }).split("\n")[7];
  assert.match(weekly, /█{19}░ {3}98% {2}reset .+, waiting for a newer reading$/);
});

test("color is off unless asked for", () => {
  assert.equal(renderStatus(board(), { now }).includes("\x1b["), false);
  assert.equal(renderStatus(board(), { now, color: true }).includes("\x1b[31m"), true);
});

test("an empty board still names every CLI", () => {
  const text = renderStatus({ tools: [{ id: "grok", name: "Grok Build", windows: [] }] }, { now });
  assert.equal(text, "Grok Build\n  No reading yet.\n");
});
