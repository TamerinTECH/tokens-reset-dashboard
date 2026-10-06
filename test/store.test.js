import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyReport, clearAll, forgetTool, load, present } from "../lib/store.js";

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reset-"));
  return path.join(dir, "usage.json");
}

function report(over = {}) {
  return {
    id: "grok",
    name: "Grok",
    plan: "SuperGrok",
    source: "cli",
    observedAt: "2026-09-28T12:00:00.000Z",
    windows: [
      {
        id: "week",
        label: "Weekly",
        used: 40,
        limit: 100,
        unit: "percent",
        resetsAt: "2026-10-05T00:00:00.000Z",
      },
    ],
    ...over,
  };
}

test("a missing file still presents the three CLIs", () => {
  const data = present(load(tempFile()));
  assert.deepEqual(
    data.tools.map((tool) => tool.id),
    ["claude-code", "codex", "grok"],
  );
  assert.equal(data.tools[0].windows.length, 0);
  assert.match(data.tools[0].hint, /status line/);
});

test("a damaged file starts empty instead of stopping every command", async () => {
  const file = tempFile();
  fs.writeFileSync(file, "{ half a file");
  assert.equal(load(file).tools.length, 3);
  fs.writeFileSync(file, JSON.stringify({ tools: "nope" }));
  assert.equal(load(file).tools.length, 3);
  assert.equal((await applyReport(report(), file)).changed, true);
  assert.equal(load(file).tools.find((tool) => tool.id === "grok").windows.length, 1);
});

test("a report is stored and a newer one replaces it", async () => {
  const file = tempFile();
  await applyReport(report(), file);
  const saved = await applyReport(
    report({ observedAt: "2026-09-28T13:00:00.000Z", windows: [{ id: "week", label: "Weekly", used: 55, unit: "percent", resetsAt: "2026-10-05T00:00:00.000Z" }] }),
    file,
  );
  assert.equal(saved.changed, true);
  assert.equal(saved.tool.windows[0].used, 55);
  assert.equal(saved.tool.plan, "SuperGrok");
});

test("the same reading again is not written twice", async () => {
  const file = tempFile();
  const now = new Date("2026-09-28T12:05:00.000Z");
  assert.equal((await applyReport(report(), file, now)).changed, true);
  const again = await applyReport(report(), file, new Date("2026-09-28T12:06:00.000Z"));
  assert.equal(again.changed, false);
  assert.equal(load(file).tools.find((tool) => tool.id === "grok").updatedAt, now.toISOString());
});

test("a second profile of a CLI is listed right after it", async () => {
  const file = tempFile();
  await applyReport(report({ id: "zed", name: "Zed" }), file);
  await applyReport(report({ id: "claude-code-work", name: "Claude Code (work)" }), file);
  const data = present(load(file));
  assert.deepEqual(
    data.tools.map((tool) => tool.id),
    ["claude-code", "claude-code-work", "codex", "grok", "zed"],
  );
  assert.equal(data.tools[1].color, data.tools[0].color);
});

test("an older reading does not overwrite a newer one", async () => {
  const file = tempFile();
  await applyReport(report({ observedAt: "2026-09-28T15:00:00.000Z" }), file);
  const kept = await applyReport(report({ observedAt: "2026-09-28T10:00:00.000Z", plan: "Other" }), file);
  assert.equal(kept.changed, false);
  assert.equal(load(file).tools.find((tool) => tool.id === "grok").plan, "SuperGrok");
});

test("a real reading replaces example numbers even if the example is newer", async () => {
  const file = tempFile();
  await applyReport(report({ source: "example", observedAt: "2026-09-28T18:00:00.000Z" }), file);
  const saved = await applyReport(report({ source: "mcp", observedAt: "2026-09-28T12:00:00.000Z", plan: "Max" }), file);
  assert.equal(saved.changed, true);
  assert.equal(saved.tool.source, "mcp");
});

test("omitting the plan keeps the plan already on file", async () => {
  const file = tempFile();
  await applyReport(report(), file);
  const next = report({ observedAt: "2026-09-28T13:00:00.000Z" });
  delete next.plan;
  await applyReport(next, file);
  assert.equal(load(file).tools.find((tool) => tool.id === "grok").plan, "SuperGrok");
});

test("rejects a bad id and a secret field", async () => {
  const file = tempFile();
  await assert.rejects(() => applyReport(report({ id: "Grok CLI" }), file), /slug/);
  await assert.rejects(() => applyReport(report({ apiKey: "nope" }), file), /secrets/);
});

test("forget puts a built-in CLI back to waiting and drops an extra one", async () => {
  const file = tempFile();
  await applyReport(report(), file);
  await applyReport(report({ id: "amp", name: "Amp" }), file);
  await forgetTool("grok", file);
  await forgetTool("amp", file);
  const data = load(file);
  assert.equal(data.tools.find((tool) => tool.id === "grok").windows.length, 0);
  assert.equal(data.tools.some((tool) => tool.id === "amp"), false);
});

test("clear removes readings", async () => {
  const file = tempFile();
  await applyReport(report(), file);
  await clearAll(file);
  assert.equal(load(file).tools.every((tool) => tool.windows.length === 0), true);
});
