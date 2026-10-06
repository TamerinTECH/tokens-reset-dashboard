import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Throwaway home folders for tests, so nothing reads the real ~/.codex,
// ~/.grok, or ~/.tokens-reset.

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function codexLine(rateLimits, timestamp) {
  return JSON.stringify({ timestamp, type: "event_msg", payload: { type: "token_count", rate_limits: rateLimits } });
}

export function grokLine({ ts, used = 62, tier = "SuperGrok", end }) {
  return JSON.stringify({
    ts,
    src: "shell",
    lvl: "info",
    msg: "billing: fetched credits config",
    ctx: {
      config: {
        creditUsagePercent: used,
        currentPeriod: { type: "USAGE_PERIOD_TYPE_WEEKLY", start: "2026-01-01T00:00:00+00:00", end },
        billingPeriodEnd: end,
      },
      subscriptionTier: tier,
    },
  });
}

// A home for each CLI with one reading in it, and the env that points there.
export function fixtureHomes({ codex = true, grok = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokens-reset-"));
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();

  if (codex) {
    const day = path.join(dir, "codex", "sessions", "2026", "09", "28");
    fs.mkdirSync(day, { recursive: true });
    const limits = {
      limit_id: "codex",
      plan_type: "plus",
      primary: { used_percent: 33, window_minutes: 300, resets_at: Math.floor(now / 1000) + 3600 },
      secondary: { used_percent: 12, window_minutes: 10080, resets_at: Math.floor(now / 1000) + 86_400 },
    };
    fs.writeFileSync(path.join(day, "rollout.jsonl"), `${codexLine(limits, iso(now - 60_000))}\n`);
  }
  if (grok) {
    const logs = path.join(dir, "grok", "logs");
    fs.mkdirSync(logs, { recursive: true });
    const line = grokLine({ ts: iso(now - 120_000), end: iso(now + 2 * 86_400_000).replace("Z", "+00:00") });
    fs.writeFileSync(path.join(logs, "unified.jsonl"), `${line}\n`);
  }

  return {
    dir,
    env: {
      ...process.env,
      TOKEN_RESET_HOME: path.join(dir, "store"),
      TOKEN_RESET_DATA: "",
      CODEX_HOME: path.join(dir, "codex"),
      GROK_HOME: path.join(dir, "grok"),
      NO_COLOR: "1",
    },
  };
}

export function runNode(args, { env, input } = {}) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, input, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
