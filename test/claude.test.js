import assert from "node:assert/strict";
import test from "node:test";
import { reportFromClaudeStatusline } from "../lib/claude.js";

test("maps the status-line rate_limits object", () => {
  const report = reportFromClaudeStatusline(
    {
      rate_limits: {
        five_hour: { used_percentage: 23.5, resets_at: Math.floor(Date.now() / 1000) + 3600 },
        seven_day: { used_percentage: 41, resets_at: Math.floor(Date.now() / 1000) + 86_400 },
      },
    },
    new Date("2026-09-28T12:00:00.000Z"),
  );
  assert.equal(report.id, "claude-code");
  assert.equal(report.source, "claude-statusline");
  assert.equal(report.windows[0].label, "5-hour");
  assert.equal(report.windows[0].used, 23.5);
  assert.equal(report.windows[1].id, "seven-day");
});

test("a second profile reports under its own id and name", () => {
  const payload = { rate_limits: { five_hour: { used_percentage: 5, resets_at: Math.floor(Date.now() / 1000) + 60 } } };
  const report = reportFromClaudeStatusline(payload, new Date(), "claude-code-work");
  assert.equal(report.id, "claude-code-work");
  assert.equal(report.name, "Claude Code (work)");
});

test("returns null when the payload has no windows", () => {
  assert.equal(reportFromClaudeStatusline({ model: { display_name: "Opus" } }), null);
  assert.equal(reportFromClaudeStatusline({ rate_limits: {} }), null);
});
