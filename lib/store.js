import fs from "node:fs";
import path from "node:path";
import { CATALOG, catalogEntry, colorFor } from "./catalog.js";
import { dataFile } from "./paths.js";
import { planName, toIso } from "./time.js";

export const defaultDataPath = dataFile();

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UNITS = new Set(["percent", "tokens", "credits"]);

export function emptyFile() {
  return {
    version: 1,
    tools: CATALOG.map(shell),
  };
}

function shell(entry) {
  return {
    id: entry.id,
    name: entry.name,
    vendor: entry.vendor,
    plan: null,
    source: null,
    note: null,
    credits: null,
    observedAt: null,
    updatedAt: null,
    windows: [],
  };
}

export function load(file = defaultDataPath) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) {
      throw new Error(`Could not read ${file}: ${error.message}`);
    }
  }
  // The file is a cache of readings the CLIs can give again. A missing or
  // damaged one starts empty instead of stopping every command.
  if (!data || !Array.isArray(data.tools)) return emptyFile();
  const tools = data.tools.filter((tool) => tool && typeof tool.id === "string");
  for (const entry of CATALOG) {
    if (!tools.some((tool) => tool.id === entry.id)) tools.push(shell(entry));
  }
  return { version: 1, tools: orderTools(tools) };
}

export function present(data = load()) {
  return {
    version: 1,
    tools: orderTools(data.tools).map((tool) => {
      const entry = catalogEntry(tool.id);
      const windows = sortWindows(tool.windows || []);
      const waiting = windows.length === 0;
      return {
        ...tool,
        windows,
        color: colorFor(tool.id),
        hint: waiting ? entry?.hint || "No reading yet." : null,
      };
    }),
  };
}

function sortWindows(windows) {
  return [...windows].sort((a, b) => {
    const ta = a.resetsAt ? Date.parse(a.resetsAt) : Number.POSITIVE_INFINITY;
    const tb = b.resetsAt ? Date.parse(b.resetsAt) : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return String(a.label || "").localeCompare(String(b.label || ""));
  });
}

// Catalog order first. A second profile (claude-code-work) sits right after its CLI.
function rank(id) {
  const exact = CATALOG.findIndex((tool) => tool.id === id);
  if (exact >= 0) return exact;
  const family = CATALOG.findIndex((tool) => String(id).startsWith(`${tool.id}-`));
  return family >= 0 ? family + 0.5 : 1000;
}

function orderTools(tools) {
  return [...tools].sort((a, b) => {
    const ra = rank(a.id);
    const rb = rank(b.id);
    if (ra !== rb) return ra - rb;
    return String(a.name || a.id).localeCompare(String(b.name || b.id));
  });
}

function clip(value, max, label) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) throw new Error(`${label} is longer than ${max} characters`);
  return text;
}

function numberOrNull(value, label, { allowZero = true } = {}) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e15) {
    throw new Error(`${label} must be a number from 0 up`);
  }
  if (!allowZero && n === 0) throw new Error(`${label} must be greater than 0`);
  return n;
}

export function normalizeReport(input, now = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("A report is one object");
  }
  const forbidden = ["token", "accessToken", "refreshToken", "apiKey", "authorization", "password", "secret"];
  for (const key of forbidden) {
    if (key in input) throw new Error("Reports cannot carry secrets");
  }

  const id = clip(input.id, 64, "id");
  if (!id || !ID_RE.test(id)) {
    throw new Error("id must be a short slug such as claude-code, codex, or grok");
  }

  const entry = catalogEntry(id);
  const name = clip(input.name, 80, "name") || entry?.name || id;
  const vendor = clip(input.vendor, 80, "vendor") || entry?.vendor || null;
  const hasPlan = Object.prototype.hasOwnProperty.call(input, "plan");
  const plan = hasPlan ? planName(input.plan) : undefined;
  const hasNote = Object.prototype.hasOwnProperty.call(input, "note");
  const note = hasNote ? clip(input.note, 240, "note") : undefined;
  const hasCredits = Object.prototype.hasOwnProperty.call(input, "credits");
  const credits = hasCredits ? numberOrNull(input.credits, "credits") : undefined;
  const source = clip(input.source, 40, "source");
  const observedAt = input.observedAt ? toIso(input.observedAt, now.getTime()) : now.toISOString();

  if (!Array.isArray(input.windows)) throw new Error("windows must be a list");
  if (input.windows.length > 12) throw new Error("A CLI can report at most 12 windows");

  const windows = input.windows.map((window, index) => normalizeWindow(window, index, now));
  const seen = new Set();
  for (const window of windows) {
    if (seen.has(window.id)) throw new Error(`Duplicate window id ${window.id}`);
    seen.add(window.id);
  }

  return { id, name, vendor, plan, note, credits, source, observedAt, windows };
}

function normalizeWindow(window, index, now) {
  if (!window || typeof window !== "object") {
    throw new Error(`Window ${index + 1} is not an object`);
  }
  const id = clip(window.id, 64, "window id");
  if (!id || !ID_RE.test(id)) throw new Error(`Window ${index + 1} needs a slug id`);
  const label = clip(window.label, 80, "window label");
  if (!label) throw new Error(`Window ${id} needs a label`);

  let unit = clip(window.unit, 16, "unit") || "percent";
  if (!UNITS.has(unit)) throw new Error(`Window ${id} unit must be percent, tokens, or credits`);

  const used = numberOrNull(window.used, `${id} used`);
  let limit = numberOrNull(window.limit, `${id} limit`, { allowZero: false });
  if (unit === "percent" && limit == null) limit = 100;
  if (used == null && (window.resetsAt == null || window.resetsAt === "")) {
    throw new Error(`Window ${id} needs a usage number or a reset time`);
  }

  return {
    id,
    label,
    used,
    limit,
    unit,
    resetsAt: window.resetsAt == null || window.resetsAt === "" ? null : toIso(window.resetsAt, now.getTime()),
  };
}

// The same reading again, such as a log that has not moved since the last run.
function sameReading(existing, report) {
  return (
    existing.observedAt === report.observedAt &&
    existing.source === report.source &&
    existing.name === report.name &&
    (report.plan === undefined || report.plan === existing.plan) &&
    (report.note === undefined || report.note === existing.note) &&
    (report.credits === undefined || report.credits === existing.credits) &&
    JSON.stringify(existing.windows) === JSON.stringify(report.windows)
  );
}

function shouldReplace(existing, report) {
  if (!existing) return true;
  if (existing.source === "example" && report.source !== "example") return true;
  if (!existing.observedAt || !report.observedAt) return true;
  return Date.parse(report.observedAt) >= Date.parse(existing.observedAt);
}

export async function applyReport(reportInput, file = defaultDataPath, now = new Date()) {
  const report = normalizeReport(reportInput, now);
  return withLock(file, () => {
    const data = load(file);
    const index = data.tools.findIndex((tool) => tool.id === report.id);
    const existing = index >= 0 ? data.tools[index] : null;
    if (existing && (!shouldReplace(existing, report) || sameReading(existing, report))) {
      return { changed: false, tool: existing };
    }

    const next = {
      id: report.id,
      name: report.name,
      vendor: report.vendor ?? existing?.vendor ?? null,
      plan: report.plan === undefined ? existing?.plan ?? null : report.plan,
      source: report.source || existing?.source || "cli",
      note: report.note === undefined ? existing?.note ?? null : report.note,
      credits: report.credits === undefined ? existing?.credits ?? null : report.credits,
      observedAt: report.observedAt,
      updatedAt: now.toISOString(),
      windows: report.windows,
    };
    if (index >= 0) data.tools[index] = next;
    else data.tools.push(next);
    data.tools = orderTools(data.tools);
    save(file, data);
    return { changed: true, tool: next };
  });
}

export async function forgetTool(id, file = defaultDataPath) {
  if (!ID_RE.test(id)) throw new Error("id must be a slug");
  return withLock(file, () => {
    const data = load(file);
    const entry = catalogEntry(id);
    if (entry) {
      const index = data.tools.findIndex((tool) => tool.id === id);
      const blank = shell(entry);
      if (index >= 0) data.tools[index] = blank;
      else data.tools.push(blank);
    } else {
      data.tools = data.tools.filter((tool) => tool.id !== id);
    }
    data.tools = orderTools(data.tools);
    save(file, data);
    return present(data);
  });
}

export async function clearAll(file = defaultDataPath) {
  return withLock(file, () => {
    const data = emptyFile();
    save(file, data);
    return data;
  });
}

export function save(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = `${JSON.stringify({ version: 1, tools: orderTools(data.tools) }, null, 2)}\n`;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body);
  try {
    fs.renameSync(tmp, file);
  } catch (error) {
    if (error.code !== "EEXIST" && error.code !== "EPERM") throw error;
    fs.rmSync(file, { force: true });
    fs.renameSync(tmp, file);
  }
}

async function withLock(file, fn) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  const started = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(lock, "wx");
      fs.closeSync(fd);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const age = Date.now() - fs.statSync(lock).mtimeMs;
        if (age > 2000) fs.unlinkSync(lock);
      } catch {
        // another writer removed it
      }
      if (Date.now() - started > 5000) throw new Error("Could not lock the usage file");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await fn();
  } finally {
    try {
      fs.unlinkSync(lock);
    } catch {
      // already gone
    }
  }
}
