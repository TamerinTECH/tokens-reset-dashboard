import { readLatestCodexReport } from "./codex.js";
import { readLatestGrokReport } from "./grok.js";
import { applyReport } from "./store.js";

// The CLIs that leave their limits on disk. Claude Code is not here: it has no
// file to read, so its status line pushes readings in (adapters/claude-statusline.mjs).
const COLLECTORS = [
  { id: "codex", name: "Codex", read: readLatestCodexReport },
  { id: "grok", name: "Grok Build", read: readLatestGrokReport },
];

// Read each log and store what it says. One CLI failing does not stop the others.
export async function collectAll(file) {
  const results = [];
  for (const collector of COLLECTORS) {
    const result = { id: collector.id, name: collector.name };
    try {
      const report = collector.read();
      if (!report) {
        result.status = "none";
      } else {
        const applied = file ? await applyReport(report, file) : await applyReport(report);
        result.status = applied.changed ? "saved" : "kept";
      }
    } catch (error) {
      result.status = "error";
      result.message = error.message || String(error);
    }
    results.push(result);
  }
  return results;
}
