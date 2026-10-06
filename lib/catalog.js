import { selfCommand } from "./paths.js";

// Default rows. A report for any other id still appears on the board.
// Hints are shown only while that row has no windows. Colors are paint, not data.

const command = selfCommand();

export const CATALOG = [
  {
    id: "claude-code",
    name: "Claude Code",
    vendor: "Anthropic",
    color: "#0f6e6b",
    hint: `No reading yet. Run ${command} setup once to connect the status line, then send one message in Claude Code.`,
  },
  {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    color: "#b4532a",
    hint: "No reading yet. Send one message in Codex. It writes its limits into the session log, and this tool reads them from there.",
  },
  {
    id: "grok",
    name: "Grok Build",
    vendor: "xAI",
    color: "#2a4d86",
    hint: "No reading yet. Open Grok Build once. It logs the credit period when a session starts, and this tool reads it from there.",
  },
];

export function catalogEntry(id) {
  return CATALOG.find((tool) => tool.id === id) || null;
}

// A second Claude Code profile (claude-code-work) is painted like the first.
export function colorFor(id) {
  const entry = catalogEntry(id) || CATALOG.find((tool) => String(id).startsWith(`${tool.id}-`));
  return entry?.color || "#5c6e80";
}
