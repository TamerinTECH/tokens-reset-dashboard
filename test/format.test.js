import assert from "node:assert/strict";
import test from "node:test";
import { formatAmount, formatRemain, nextReset } from "../public/format.js";

const hour = 60 * 60 * 1000;

test("remaining time stays readable", () => {
  assert.equal(formatRemain(0), "Reset");
  assert.equal(formatRemain(5 * 1000), "5s");
  assert.equal(formatRemain(90 * 1000), "1m 30s");
  assert.equal(formatRemain(2 * hour + 5 * 60 * 1000), "2h 05m");
  assert.equal(formatRemain(3 * 24 * hour + 4 * hour), "3d 4h");
});

test("the next reset is the soonest future window", () => {
  const now = Date.parse("2026-09-28T12:00:00.000Z");
  const tools = [
    {
      id: "codex",
      name: "Codex",
      windows: [{ id: "weekly", label: "Weekly", resetsAt: "2026-10-02T12:00:00.000Z" }],
    },
    {
      id: "claude-code",
      name: "Claude Code",
      windows: [
        { id: "old", label: "5-hour", resetsAt: "2026-09-28T08:00:00.000Z" },
        { id: "five-hour", label: "5-hour", resetsAt: "2026-09-28T15:00:00.000Z" },
      ],
    },
  ];
  const next = nextReset(tools, now);
  assert.equal(next.tool.id, "claude-code");
  assert.equal(next.window.id, "five-hour");
});

test("when every window is past, the most recent one is shown", () => {
  const now = Date.parse("2026-09-28T12:00:00.000Z");
  const tools = [
    {
      name: "Codex",
      windows: [{ id: "weekly", resetsAt: "2026-09-20T00:00:00.000Z" }],
    },
    {
      name: "Grok",
      windows: [{ id: "week", resetsAt: "2026-09-27T00:00:00.000Z" }],
    },
  ];
  const next = nextReset(tools, now);
  assert.equal(next.tool.name, "Grok");
});

test("percent amounts keep a single decimal only when needed", () => {
  assert.equal(formatAmount(48, 100, "percent"), "48%");
  assert.equal(formatAmount(23.5, 100, "percent"), "23.5%");
  assert.equal(formatAmount(12500, 100000, "tokens"), "12.5k / 100k");
});
