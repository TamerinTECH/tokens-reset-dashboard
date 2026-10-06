import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readLatestCodexReport, reportFromCodexRateLimits } from "../lib/codex.js";

test("maps primary and secondary windows by length, not by slot", () => {
  const resetsAt = Math.floor(Date.now() / 1000) + 3600;
  const report = reportFromCodexRateLimits(
    {
      plan_type: "prolite",
      primary: { used_percent: 48, window_minutes: 10080, resets_at: resetsAt },
      secondary: { used_percent: 12, window_minutes: 300, resets_at: resetsAt + 60 },
      credits: { has_credits: true, balance: "2" },
      spend_control_reached: false,
    },
    "2026-03-08T10:00:00.000Z",
  );
  assert.equal(report.plan, "Pro Lite");
  assert.equal(report.credits, 2);
  assert.equal(report.note, null);
  assert.deepEqual(
    report.windows.map((window) => [window.id, window.label, window.used]),
    [
      ["m10080", "Weekly", 48],
      ["m300", "5-hour", 12],
    ],
  );
});

test("reads the newest rate_limits event across recent session files", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-home-"));
  const day = path.join(home, "sessions", "2026", "09", "28");
  fs.mkdirSync(day, { recursive: true });
  const resetsAt = Math.floor(Date.now() / 1000) + 86_400;
  const line = (used, timestamp) =>
    JSON.stringify({
      timestamp,
      type: "event_msg",
      payload: {
        type: "token_count",
        rate_limits: {
          plan_type: "plus",
          primary: { used_percent: used, window_minutes: 300, resets_at: resetsAt },
          secondary: null,
        },
      },
    });
  fs.writeFileSync(path.join(day, "older.jsonl"), `${line(10, "2026-09-28T10:00:00.000Z")}\n`);
  fs.writeFileSync(
    path.join(day, "newer.jsonl"),
    `${"x".repeat(50)}\n${line(20, "2026-09-28T11:00:00.000Z")}\n${line(33, "2026-09-28T12:00:00.000Z")}\n`,
  );
  // Codex also logs other limit ids with no windows in them. Those must not hide the real one.
  const premium = JSON.stringify({
    timestamp: "2026-09-28T12:30:00.000Z",
    type: "event_msg",
    payload: { type: "token_count", rate_limits: { limit_id: "premium", plan_type: "plus", primary: null, secondary: null } },
  });
  fs.appendFileSync(path.join(day, "newer.jsonl"), `${premium}\n`);

  const report = readLatestCodexReport(home);
  assert.equal(report.plan, "Plus");
  assert.equal(report.windows[0].used, 33);
  assert.equal(report.observedAt, "2026-09-28T12:00:00.000Z");
});
