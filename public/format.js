export function nextReset(tools, now = Date.now()) {
  let future = null;
  let past = null;
  for (const tool of tools || []) {
    for (const window of tool.windows || []) {
      if (!window.resetsAt) continue;
      const t = new Date(window.resetsAt).getTime();
      if (Number.isNaN(t)) continue;
      const hit = { t, tool, window };
      if (t >= now - 1000) {
        if (!future || t < future.t) future = hit;
      } else if (!past || t > past.t) {
        past = hit;
      }
    }
  }
  return future || past;
}

export function formatRemain(ms) {
  if (ms <= 0) return "Reset";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function formatReset(iso, now = new Date()) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(when);
  const dayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const day = Math.round((dayStart(when) - dayStart(now)) / 86400000);
  if (day === 0) return `today ${time}`;
  if (day === 1) return `tomorrow ${time}`;
  if (day === -1) return `yesterday ${time}`;
  // The words around it are English, so the day and month are too. The clock above follows the system.
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(when);
  return `${date}, ${time}`;
}

export function formatAge(iso, now = Date.now()) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

// Where a reading came from and how old it is.
export function sourceLine(tool, now = Date.now()) {
  const age = formatAge(tool.observedAt, now);
  const tail = age ? `, ${age}` : "";
  if (tool.source === "example") return "Example numbers, not your account.";
  if (tool.source === "codex-session") return `From the last Codex session${tail}`;
  if (tool.source === "grok-log") return `From Grok's own log${tail}`;
  if (tool.source === "claude-statusline") return `From Claude Code's status line${tail}`;
  if (tool.source === "mcp") return `Reported by an agent${tail}`;
  if (tool.source === "cli") return `Reported from the command line${tail}`;
  if (age) return `Updated ${age}`;
  return "";
}

export function formatAmount(used, limit, unit) {
  if (used == null || Number.isNaN(Number(used))) return "";
  if (unit === "percent") {
    const n = Number(used);
    const rounded = Math.round(n * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
    return `${text}%`;
  }
  if (limit) return `${compact(used)} / ${compact(limit)}`;
  return compact(used);
}

export function usedRatio(used, limit, unit) {
  if (used == null || Number.isNaN(Number(used))) return null;
  const cap = unit === "percent" ? Number(limit) || 100 : Number(limit);
  if (!cap) return null;
  return Math.max(0, Math.min(1, Number(used) / cap));
}

function compact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}m`;
  if (n >= 10_000) return `${trim(n / 1000)}k`;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function trim(n) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
