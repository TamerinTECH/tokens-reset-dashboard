import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fixtureHomes, runNode } from "./fixtures.js";

function claudePayload(extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    session_id: "t",
    cwd: "D:/tëst",
    rate_limits: {
      five_hour: { used_percentage: 23.5, resets_at: now + 3600 },
      seven_day: { used_percentage: 41.2, resets_at: now + 4 * 86_400 },
    },
    ...extra,
  });
}

test("the bare command prints all three CLIs from what is on this computer", () => {
  const { env } = fixtureHomes();
  runNode(["adapters/claude-statusline.mjs"], { env, input: claudePayload() });

  const { status, stdout } = runNode(["bin/cli.js"], { env });
  assert.equal(status, 0);
  assert.match(stdout, /^Next reset: /);
  assert.match(stdout, /Claude Code\n {2}5-hour .* 23\.5% {2}resets in \d+m/);
  assert.match(stdout, /Codex {2}Plus\n {2}5-hour .* 33% {2}resets in/);
  assert.match(stdout, /Grok Build {2}SuperGrok\n {2}Weekly .* 62% {2}resets in 1d 23h/);
  assert.match(stdout, /From Grok's own log, 2 min ago/);
  assert.equal(stdout.includes("\x1b["), false);
});

test("--json gives the same board as data, and a missing CLI is an empty row", () => {
  const { env } = fixtureHomes({ grok: false });
  const { status, stdout } = runNode(["bin/cli.js", "--json"], { env });
  assert.equal(status, 0);
  const data = JSON.parse(stdout);
  assert.deepEqual(
    data.tools.map((tool) => [tool.id, tool.windows.length]),
    [
      ["claude-code", 0],
      ["codex", 2],
      ["grok", 0],
    ],
  );
  assert.equal(data.tools[1].windows[0].label, "5-hour");
});

test("open --no-open writes one self-contained page", () => {
  const { env, dir } = fixtureHomes();
  const { status, stdout } = runNode(["bin/cli.js", "open", "--no-open"], { env });
  assert.equal(status, 0);
  const file = path.join(dir, "store", "dashboard.html");
  assert.equal(stdout.trim(), file);
  const html = fs.readFileSync(file, "utf8");
  assert.match(html, /"name":"Grok Build"/);
  assert.equal(/url\("(?!data:)/.test(html), false, "no file the page would have to fetch");
});

test("the status-line adapter prints a row, stores it, and stays quiet without limits", () => {
  const { env } = fixtureHomes({ codex: false, grok: false });
  const row = runNode(["adapters/claude-statusline.mjs"], { env, input: claudePayload() });
  assert.match(row.stdout, /^5-hour 23\.5% resets .* {3}Weekly 41\.2% resets /);

  const quiet = runNode(["adapters/claude-statusline.mjs"], { env, input: JSON.stringify({ session_id: "t" }) });
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stdout, "");
  assert.equal(runNode(["adapters/claude-statusline.mjs"], { env, input: "" }).status, 0);

  const data = JSON.parse(runNode(["bin/cli.js", "--json", "--no-collect"], { env }).stdout);
  assert.equal(data.tools[0].windows[0].used, 23.5);
  assert.equal(data.tools[0].source, "claude-statusline");
});

test("--tee hands the same JSON to the next command and stores under the profile's row", () => {
  const { env } = fixtureHomes({ codex: false, grok: false });
  const payload = claudePayload();
  const { stdout } = runNode(["adapters/claude-statusline.mjs", "--tee", "--id", "claude-code-work"], { env, input: payload });
  assert.deepEqual(JSON.parse(stdout), JSON.parse(payload));
  assert.match(stdout, /^[\x00-\x7f]*$/, "plain ASCII survives any shell's pipe");

  // Without limits there is nothing to store, and the JSON still passes through.
  const bare = JSON.stringify({ session_id: "t" });
  assert.equal(runNode(["adapters/claude-statusline.mjs", "--tee"], { env, input: bare }).stdout, bare);

  const data = JSON.parse(runNode(["bin/cli.js", "--json", "--no-collect"], { env }).stdout);
  assert.deepEqual(
    data.tools.map((tool) => tool.id),
    ["claude-code", "claude-code-work", "codex", "grok"],
  );
  assert.equal(data.tools[1].name, "Claude Code (work)");
  assert.equal(data.tools[1].color, data.tools[0].color);
});

test("an idle Claude session repeating old numbers does not overwrite a busier one", () => {
  const { env, dir } = fixtureHomes({ codex: false, grok: false });
  const now = Math.floor(Date.now() / 1000);
  const session = (name, idleMinutes, used) => {
    const transcript = path.join(dir, `${name}.jsonl`);
    fs.writeFileSync(transcript, "");
    const touched = new Date(Date.now() - idleMinutes * 60_000);
    fs.utimesSync(transcript, touched, touched);
    return JSON.stringify({
      transcript_path: transcript,
      rate_limits: { five_hour: { used_percentage: used, resets_at: now + 3600 } },
    });
  };
  const used = () => JSON.parse(runNode(["bin/cli.js", "--json", "--no-collect"], { env }).stdout).tools[0];

  runNode(["adapters/claude-statusline.mjs"], { env, input: session("busy", 2, 50) });
  assert.equal(used().windows[0].used, 50);
  assert.match(runNode(["bin/cli.js", "--no-collect"], { env }).stdout, /From Claude Code's status line, 2 min ago/);

  // Arrives later, but its session last heard from Claude 40 minutes ago.
  const stale = runNode(["adapters/claude-statusline.mjs"], { env, input: session("idle", 40, 30) });
  assert.match(stale.stdout, /^5-hour 30%/, "its own status line still shows what it knows");
  assert.equal(used().windows[0].used, 50);

  runNode(["adapters/claude-statusline.mjs"], { env, input: session("busy", 0, 55) });
  assert.equal(used().windows[0].used, 55);
});

test("report records a CLI by hand and forgets it again", () => {
  const { env } = fixtureHomes({ codex: false, grok: false });
  const resetsAt = new Date(Date.now() + 86_400_000).toISOString();
  const saved = runNode(
    ["bin/cli.js", "report", "--id", "cursor", "--name", "Cursor", "--plan", "pro", "--window", `id=monthly,label=Monthly,used=20,resetsAt=${resetsAt}`],
    { env },
  );
  assert.match(saved.stdout, /Saved Cursor \(cursor\), 1 window/);
  assert.match(runNode(["bin/cli.js", "--no-collect"], { env }).stdout, /Cursor {2}Pro\n {2}Monthly .* 20%/);

  runNode(["bin/cli.js", "report", "--forget", "cursor"], { env });
  assert.equal(runNode(["bin/cli.js", "--no-collect"], { env }).stdout.includes("Cursor"), false);

  const bad = runNode(["bin/cli.js", "report", "--id", "Bad Id", "--window", "id=x,label=X,used=1"], { env });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /slug/);
});
