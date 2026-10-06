// Claude Code pipes this shape to a status-line command. See
// https://code.claude.com/docs/en/statusline. rate_limits is present for
// claude.ai Pro and Max after the first response, and a window disappears
// once its resets_at has passed.

const WINDOWS = [
  ["five_hour", "five-hour", "5-hour"],
  ["seven_day", "seven-day", "Weekly"],
  ["spend_limit", "spend", "Spend"],
];

const DEFAULT_ID = "claude-code";

// A second Claude profile reports under its own id, such as claude-code-work,
// and is shown as "Claude Code (work)".
export function profileName(id) {
  const rest = id.startsWith(`${DEFAULT_ID}-`) ? id.slice(DEFAULT_ID.length + 1) : "";
  return rest ? `Claude Code (${rest})` : "Claude Code";
}

export function reportFromClaudeStatusline(payload, now = new Date(), id = DEFAULT_ID) {
  const limits = payload?.rate_limits;
  if (!limits || typeof limits !== "object") return null;

  const windows = [];
  for (const [key, windowId, label] of WINDOWS) {
    const window = limits[key];
    if (!window || typeof window !== "object") continue;
    const hasUsed = window.used_percentage != null && window.used_percentage !== "";
    const hasReset = window.resets_at != null && window.resets_at !== "";
    if (!hasUsed && !hasReset) continue;
    const next = { id: windowId, label, unit: "percent", limit: 100 };
    if (hasUsed) next.used = Number(window.used_percentage);
    if (hasReset) next.resetsAt = window.resets_at;
    windows.push(next);
  }
  if (!windows.length) return null;

  return {
    id,
    name: profileName(id),
    vendor: "Anthropic",
    source: "claude-statusline",
    observedAt: now.toISOString(),
    windows,
  };
}
