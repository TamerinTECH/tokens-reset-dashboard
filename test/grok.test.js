import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readLatestGrokReport, reportFromGrokBilling } from "../lib/grok.js";
import { normalizeReport } from "../lib/store.js";
import { grokLine } from "./fixtures.js";

function homeWith(lines) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "grok-home-"));
  fs.mkdirSync(path.join(home, "logs"), { recursive: true });
  fs.writeFileSync(path.join(home, "logs", "unified.jsonl"), `${lines.join("\n")}\n`);
  return home;
}

test("maps the billing line Grok writes into its log", () => {
  const report = reportFromGrokBilling(
    {
      config: {
        creditUsagePercent: 42.0,
        currentPeriod: {
          type: "USAGE_PERIOD_TYPE_WEEKLY",
          start: "2026-03-02T09:30:00.123456+00:00",
          end: "2026-03-09T09:30:00.123456+00:00",
        },
        onDemandCap: { val: 0 },
        prepaidBalance: { val: 0 },
        billingPeriodEnd: "2026-03-09T09:30:00.123456+00:00",
      },
      subscriptionTier: "SuperGrok",
    },
    "2026-03-08T10:00:00.000Z",
  );
  assert.equal(report.id, "grok");
  assert.equal(report.source, "grok-log");
  assert.equal(report.plan, "SuperGrok");
  assert.deepEqual(report.windows, [
    { id: "weekly", label: "Weekly", unit: "percent", limit: 100, used: 42, resetsAt: "2026-03-09T09:30:00.123456+00:00" },
  ]);

  // The store accepts Grok's microsecond timestamps.
  const stored = normalizeReport(report, new Date("2026-03-08T11:00:00.000Z"));
  assert.equal(stored.windows[0].resetsAt, "2026-03-09T09:30:00.123Z");
});

test("reads the newest billing line and ignores everything else in the log", () => {
  const home = homeWith([
    grokLine({ ts: "2026-10-05T10:00:00.000Z", used: 40, end: "2026-10-06T20:00:00+00:00" }),
    JSON.stringify({ ts: "2026-10-05T11:00:00.000Z", msg: "prompt received", ctx: { text: '"billing: fetched credits config"' } }),
    grokLine({ ts: "2026-10-05T12:00:00.000Z", used: 55, end: "2026-10-06T20:00:00+00:00" }),
    JSON.stringify({ ts: "2026-10-05T13:00:00.000Z", msg: "turn.complete" }),
    '{"ts":"2026-10-05T14:00:00.000Z","msg":"billing: fetched credits config","ctx":{"config":',
  ]);
  const report = readLatestGrokReport(home);
  assert.equal(report.windows[0].used, 55);
  assert.equal(report.observedAt, "2026-10-05T12:00:00.000Z");
});

test("no log, or a log without a billing line, is no reading", () => {
  assert.equal(readLatestGrokReport(fs.mkdtempSync(path.join(os.tmpdir(), "grok-empty-"))), null);
  assert.equal(readLatestGrokReport(homeWith([JSON.stringify({ ts: "2026-10-05T13:00:00.000Z", msg: "turn.complete" })])), null);
  assert.equal(reportFromGrokBilling({ config: {} }, "2026-10-05T13:00:00.000Z"), null);
});
