import { formatAge, formatAmount, formatRemain, formatReset, nextReset, sourceLine, usedRatio } from "../public/format.js";

// The board as plain text: full for a terminal, compact for the MCP tool.

const BAR = 20;
const CODES = { bold: 1, dim: 2, red: 31, green: 32, yellow: 33 };

function painter(color) {
  const paint = {};
  for (const [name, code] of Object.entries(CODES)) {
    paint[name] = (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
  }
  return paint;
}

export function wantsColor(stream = process.stdout) {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true;
  return Boolean(stream.isTTY);
}

export function renderStatus(data, { color = false, now = Date.now() } = {}) {
  const paint = painter(color);
  const tools = data?.tools || [];
  const lines = [];

  const next = nextReset(tools, now);
  if (next && next.t > now) {
    const when = formatReset(next.window.resetsAt, new Date(now));
    lines.push(`Next reset: ${next.tool.name}, ${next.window.label}, in ${formatRemain(next.t - now)} (${when})`, "");
  }

  const labels = tools.flatMap((tool) => (tool.windows || []).map((window) => String(window.label).length));
  const labelWidth = Math.min(14, Math.max(0, ...labels));

  for (const tool of tools) {
    lines.push(tool.plan ? `${paint.bold(tool.name)}  ${paint.dim(tool.plan)}` : paint.bold(tool.name));
    if (!tool.windows?.length) {
      lines.push(`  ${paint.dim(tool.hint || "No reading yet.")}`, "");
      continue;
    }
    for (const window of tool.windows) lines.push(`  ${windowLine(window, labelWidth, paint, now)}`);
    if (tool.note) lines.push(`  ${tool.note}`);
    const source = sourceLine(tool, now);
    if (source) lines.push(`  ${paint.dim(source)}`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

// One line per CLI and no bars. This is what the MCP tool returns: a model
// pays for every block character, and the percent already says it.
export function renderCompact(data, { now = Date.now() } = {}) {
  const lines = [];
  for (const tool of data?.tools || []) {
    const name = tool.plan ? `${tool.name} (${tool.plan})` : tool.name;
    if (!tool.windows?.length) {
      lines.push(`${name}: no reading yet`);
      continue;
    }
    const windows = tool.windows.map((window) => {
      const amount = formatAmount(window.used, window.limit, window.unit);
      const reset = window.resetsAt ? Date.parse(window.resetsAt) : null;
      if (reset == null) return `${window.label} ${amount} used`;
      const at = formatReset(window.resetsAt, new Date(now));
      if (reset <= now) return `${window.label} reset ${at}, no newer reading`;
      return `${window.label} ${amount ? `${amount} used, ` : ""}resets in ${formatRemain(reset - now)} (${at})`;
    });
    const age = formatAge(tool.observedAt, now);
    const read = tool.source === "example" ? "Example numbers, not this account" : age && `Read ${age}`;
    lines.push(`${name}: ${windows.join("; ")}${read ? `. ${read}.` : ""}`);
  }
  return lines.join("\n");
}

function windowLine(window, labelWidth, paint, now) {
  const reset = window.resetsAt ? Date.parse(window.resetsAt) : null;
  const past = reset != null && reset <= now;
  const ratio = usedRatio(window.used, window.limit, window.unit);
  const amount = formatAmount(window.used, window.limit, window.unit);

  let bar = " ".repeat(BAR);
  if (ratio != null) {
    // A full bar means the limit is reached, so 98% stops one cell short.
    const cells = Math.min(BAR - 1, Math.max(1, Math.round(ratio * BAR)));
    const filled = ratio >= 1 ? BAR : ratio > 0 ? cells : 0;
    const tone = past ? paint.dim : ratio >= 0.9 ? paint.red : ratio >= 0.7 ? paint.yellow : paint.green;
    bar = tone("█".repeat(filled)) + paint.dim("░".repeat(BAR - filled));
  }

  let when = "reset time not reported";
  if (reset != null) {
    const at = formatReset(window.resetsAt, new Date(now));
    // After the reset the stored number is the old window's. Say so instead of guessing a zero.
    when = past ? `reset ${at}, waiting for a newer reading` : `resets in ${formatRemain(reset - now)} (${at})`;
  }

  const label = String(window.label).padEnd(labelWidth);
  return `${label}  ${bar} ${(amount || "").padStart(5)}  ${past ? paint.dim(when) : when}`;
}
