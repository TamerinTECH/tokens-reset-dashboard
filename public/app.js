import { formatAge, formatAmount, formatRemain, formatReset, nextReset, sourceLine, usedRatio } from "./format.js";

const app = document.querySelector("#app");
let snapshot = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function render(data) {
  app.replaceChildren();
  app.append(el("p", "site", "Reset times"));

  const tools = data?.tools || [];
  const next = nextReset(tools);
  const hero = el("section", "hero");

  if (!next) {
    hero.append(el("h1", null, "Nothing reported yet"));
    hero.append(
      el(
        "p",
        "lede",
        "Claude Code, Codex, and Grok Build stay on this board. A row fills in once that CLI has a reading.",
      ),
    );
  } else {
    const past = next.t <= Date.now();
    hero.dataset.resets = next.window.resetsAt;
    hero.append(el("h1", null, next.tool.name));
    hero.append(el("p", "window-name", next.window.label));
    const remain = el("p", "remain");
    remain.append(el("span", "remain-text", formatRemain(next.t - Date.now())));
    hero.append(remain);
    const when = el("p", "when");
    when.append(el("span", "when-text", past ? `reset ${formatReset(next.window.resetsAt)}` : formatReset(next.window.resetsAt)));
    hero.append(when);
    const age = sourceLine(next.tool);
    if (age) hero.append(el("p", "age", age));
    const pastNote = el("p", "age", "This window's reset time has passed. A newer reading replaces it.");
    pastNote.dataset.pastNote = "1";
    pastNote.hidden = !past;
    hero.append(pastNote);
  }
  app.append(hero);

  if (tools.some((tool) => tool.source === "example")) {
    app.append(el("p", "note", "A row marked as an example is not your account."));
  }

  const list = el("div", "tools");
  for (const tool of tools) {
    const block = el("section", "tool");
    block.style.setProperty("--tool", tool.color || "#5c6e80");
    block.append(el("h2", null, tool.name));
    if (tool.plan) block.append(el("p", "plan", `${tool.plan} plan`));
    if (tool.note) block.append(el("p", "note", tool.note));
    if (tool.credits > 0) {
      const n = tool.credits;
      block.append(el("p", "credits", n === 1 ? "1 reset credit" : `${n} reset credits`));
    }
    if (!tool.windows || tool.windows.length === 0) {
      block.append(el("p", "hint", tool.hint || "No reading yet."));
    } else {
      for (const window of tool.windows) block.append(windowRow(window, tool.color));
      const line = sourceLine(tool);
      if (line) block.append(el("p", "age", line));
    }
    list.append(block);
  }
  app.append(list);
  if (data?.builtAt) {
    app.append(
      el(
        "p",
        "foot",
        `Built ${formatAge(data.builtAt)}. Run ${data.command || "tokens-reset"} open for a newer reading. The clock above keeps counting.`,
      ),
    );
  }
  app.append(
    el(
      "p",
      "foot",
      `Kept in ${data.dataFile || "a local file"} on this computer. This page does not send it anywhere.`,
    ),
  );
  updateClocks();
}

function windowRow(window, color) {
  const ratio = usedRatio(window.used, window.limit, window.unit);
  const amount = formatAmount(window.used, window.limit, window.unit);
  const past = window.resetsAt && Date.parse(window.resetsAt) <= Date.now();
  const when = window.resetsAt ? (past ? `reset ${formatReset(window.resetsAt)}` : formatReset(window.resetsAt)) : "Reset time not reported";
  const row = el("div", "window");
  const label = amount ? `${window.label}, ${amount}, ${when}` : `${window.label}, ${when}`;
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", label);
  if (window.resetsAt) row.dataset.resets = window.resetsAt;

  row.append(el("div", "window-label", window.label));

  if (ratio == null) {
    row.append(el("div"));
  } else {
    const track = el("div", "track");
    const fill = el("div", "fill");
    fill.style.width = `${ratio * 100}%`;
    if (ratio >= 1) fill.style.background = "var(--full)";
    else if (color) fill.style.background = color;
    track.append(fill);
    row.append(track);
  }

  const amountEl = el("div", ratio != null && ratio >= 1 ? "amount is-full" : "amount", amount);
  row.append(amountEl);
  const reset = el("div", past ? "reset is-past" : "reset");
  reset.append(el("span", "when-text", when));
  row.append(reset);
  return row;
}

function updateClocks() {
  const now = Date.now();
  const tools = snapshot?.tools || [];
  for (const node of app.querySelectorAll("[data-resets]")) {
    const t = Date.parse(node.dataset.resets);
    if (Number.isNaN(t)) continue;
    const remain = node.querySelector(".remain-text");
    if (remain) remain.textContent = formatRemain(t - now);
    const when = node.querySelector(".when-text");
    if (when) {
      when.textContent = t <= now ? `reset ${formatReset(node.dataset.resets)}` : formatReset(node.dataset.resets);
    }
    const pastNote = node.querySelector("[data-past-note]");
    if (pastNote) pastNote.hidden = t > now;
    const reset = node.querySelector(".reset");
    if (reset) reset.classList.toggle("is-past", t <= now);
  }
  const next = nextReset(tools, now);
  document.title = next ? `${formatRemain(next.t - now)} · ${next.tool.name}` : "Reset times";
}

const embedded = document.getElementById("usage-data");
if (embedded && embedded.textContent.trim()) {
  snapshot = JSON.parse(embedded.textContent);
  render(snapshot);
}
setInterval(updateClocks, 1000);
