import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readTail } from "./tail.js";
import { planName, windowLabel } from "./time.js";

// Codex writes a rate_limits object into each session log on token_count
// events. This reads that snapshot. It does not open auth.json.

export function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

export function readLatestCodexReport(home = codexHome()) {
  const sessions = path.join(home, "sessions");
  if (!fs.existsSync(sessions)) return null;

  const files = newestSessionFiles(sessions, 12);
  let best = null;
  for (const file of files) {
    const found = lastReport(file);
    if (!found) continue;
    if (!best || Date.parse(found.observedAt) > Date.parse(best.observedAt)) best = found;
  }
  return best;
}

export function reportFromCodexRateLimits(rateLimits, observedAt) {
  if (!rateLimits || typeof rateLimits !== "object") return null;
  const windows = [];
  pushWindow(windows, windowFromCodex("primary", rateLimits.primary));
  pushWindow(windows, windowFromCodex("secondary", rateLimits.secondary));
  pushWindow(windows, windowFromCodex("model", rateLimits.individual_limit, rateLimits.limit_name));
  if (!windows.length) return null;

  const report = {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    source: "codex-session",
    observedAt,
    note: rateLimits.spend_control_reached === true ? "Spend control reached" : null,
    windows,
  };
  const plan = planName(rateLimits.plan_type);
  if (plan) report.plan = plan;
  const balance = creditBalance(rateLimits.credits);
  if (balance != null) report.credits = balance;
  return report;
}

function pushWindow(windows, window) {
  if (!window) return;
  if (windows.some((item) => item.id === window.id)) window.id = `${window.id}-b`;
  windows.push(window);
}

function creditBalance(credits) {
  if (!credits || typeof credits !== "object") return null;
  if (credits.has_credits === false) return 0;
  const n = Number(credits.balance);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function windowFromCodex(slot, value, name) {
  if (!value || typeof value !== "object") return null;
  const minutes = Number(value.window_minutes);
  const id = Number.isFinite(minutes) && minutes > 0 ? `m${minutes}` : slot;
  const label = clipLabel(name) || windowLabel(minutes);
  const window = {
    id,
    label,
    unit: "percent",
    limit: 100,
  };
  if (value.used_percent != null && value.used_percent !== "") {
    window.used = Number(value.used_percent);
  }
  if (value.resets_at != null && value.resets_at !== "") window.resetsAt = value.resets_at;
  if (window.used == null && window.resetsAt == null) return null;
  return window;
}

function clipLabel(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 80) return null;
  return text;
}

function newestSessionFiles(sessionsRoot, limit) {
  const days = [];
  let years = [];
  try {
    years = fs.readdirSync(sessionsRoot);
  } catch {
    return [];
  }
  for (const year of years) {
    if (!/^\d{4}$/.test(year)) continue;
    const yearPath = path.join(sessionsRoot, year);
    let months = [];
    try {
      months = fs.readdirSync(yearPath);
    } catch {
      continue;
    }
    for (const month of months) {
      if (!/^\d{2}$/.test(month)) continue;
      const monthPath = path.join(yearPath, month);
      let dayNames = [];
      try {
        dayNames = fs.readdirSync(monthPath);
      } catch {
        continue;
      }
      for (const day of dayNames) {
        if (!/^\d{2}$/.test(day)) continue;
        days.push({ key: `${year}${month}${day}`, dir: path.join(monthPath, day) });
      }
    }
  }
  days.sort((a, b) => (a.key < b.key ? 1 : -1));

  const files = [];
  for (const day of days.slice(0, 2)) {
    let names = [];
    try {
      names = fs.readdirSync(day.dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const file = path.join(day.dir, name);
      try {
        const stat = fs.statSync(file);
        if (stat.isFile()) files.push({ file, mtime: stat.mtimeMs });
      } catch {
        // file disappeared
      }
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files.slice(0, limit).map((entry) => entry.file);
}

// The newest event in one log that carries a window. Codex also logs events
// for other limit ids (such as "premium") with no windows in them. Those are skipped.
function lastReport(file) {
  const text = readTail(file, 4 * 1024 * 1024);
  if (!text) return null;

  let found = null;
  for (const line of text.split("\n")) {
    if (!line.includes("rate_limits")) continue;
    const start = line.indexOf("{");
    if (start < 0) continue;
    let event;
    try {
      event = JSON.parse(line.slice(start));
    } catch {
      continue;
    }
    const payload = event?.payload;
    const rateLimits = payload?.rate_limits || payload?.info?.rate_limits;
    const timestamp = event?.timestamp;
    if (!rateLimits || !timestamp) continue;
    const report = reportFromCodexRateLimits(rateLimits, timestamp);
    if (report) found = report;
  }
  return found;
}
