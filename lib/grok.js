import os from "node:os";
import path from "node:path";
import { readTail } from "./tail.js";

// Grok Build logs the account's credit period each time it fetches it: one
// "billing: fetched credits config" line in logs/unified.jsonl. This reads the
// newest of those lines. It does not open auth.json and it does not call xAI.

const MESSAGE = "billing: fetched credits config";

const PERIODS = {
  USAGE_PERIOD_TYPE_DAILY: ["daily", "Daily"],
  USAGE_PERIOD_TYPE_WEEKLY: ["weekly", "Weekly"],
  USAGE_PERIOD_TYPE_MONTHLY: ["monthly", "Monthly"],
};

export function grokHome() {
  return process.env.GROK_HOME || path.join(os.homedir(), ".grok");
}

export function readLatestGrokReport(home = grokHome()) {
  const text = readTail(path.join(home, "logs", "unified.jsonl"), 16 * 1024 * 1024);
  if (!text) return null;

  // Lines are in time order, so walk back from the end.
  let end = text.length;
  for (;;) {
    const at = text.lastIndexOf(`"${MESSAGE}"`, end);
    if (at < 0) return null;
    const start = text.lastIndexOf("\n", at) + 1;
    let stop = text.indexOf("\n", at);
    if (stop < 0) stop = text.length;
    const report = reportFromLine(text.slice(start, stop));
    if (report) return report;
    end = start - 1;
    if (end < 0) return null;
  }
}

function reportFromLine(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  if (event?.msg !== MESSAGE || !event.ts) return null;
  return reportFromGrokBilling(event.ctx, event.ts);
}

export function reportFromGrokBilling(ctx, observedAt) {
  const config = ctx?.config;
  if (!config || typeof config !== "object") return null;
  const period = config.currentPeriod && typeof config.currentPeriod === "object" ? config.currentPeriod : {};
  const [id, label] = PERIODS[period.type] || ["period", "Usage period"];

  const window = { id, label, unit: "percent", limit: 100 };
  const used = Number(config.creditUsagePercent);
  if (config.creditUsagePercent != null && Number.isFinite(used) && used >= 0) window.used = used;
  const end = period.end || config.billingPeriodEnd;
  if (typeof end === "string" && end) window.resetsAt = end;
  if (window.used == null && window.resetsAt == null) return null;

  const report = {
    id: "grok",
    name: "Grok Build",
    vendor: "xAI",
    source: "grok-log",
    observedAt,
    windows: [window],
  };
  if (typeof ctx.subscriptionTier === "string" && ctx.subscriptionTier.trim()) {
    report.plan = ctx.subscriptionTier.trim();
  }
  return report;
}
