import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { adapterCommand, claudeProfiles, connectStatusLine, disconnectStatusLine, runSetup } from "../lib/setup.js";

// Written with the platform's separator, as path.join would return it.
const adapter = ["D:", "tools", "tokens-reset", "adapters", "claude-statusline.mjs"].join(path.sep);
const ours = adapterCommand(adapter);

test("connects a profile that had no status line, and takes it out again", () => {
  const before = { model: "opus", theme: "dark" };
  const connected = connectStatusLine(before, adapter);
  assert.equal(connected.changed, true);
  assert.equal(connected.kept, null);
  assert.deepEqual(connected.settings.statusLine, { type: "command", command: ours });
  assert.equal(ours.includes("\\"), false, "forward slashes only, Git Bash eats backslashes");

  const undone = disconnectStatusLine(connected.settings);
  assert.deepEqual(undone.settings, before);
});

test("an existing status line keeps running behind a pipe, and undo restores it exactly", () => {
  const before = { statusLine: { type: "command", command: "bash ~/.claude/statusline.sh", padding: 1 }, theme: "dark" };
  const connected = connectStatusLine(before, adapter);
  assert.equal(connected.kept, "bash ~/.claude/statusline.sh");
  assert.equal(connected.settings.statusLine.command, `${ours} --tee | bash ~/.claude/statusline.sh`);
  assert.equal(connected.settings.statusLine.padding, 1);
  assert.deepEqual(Object.keys(connected.settings), ["statusLine", "theme"]);

  assert.deepEqual(disconnectStatusLine(connected.settings).settings, before);
});

test("running setup twice changes nothing, and a moved clone is repointed", () => {
  const once = connectStatusLine({ statusLine: { type: "command", command: "my-line" } }, adapter);
  const twice = connectStatusLine(once.settings, adapter);
  assert.equal(twice.changed, false);

  const moved = connectStatusLine(once.settings, ["E:", "elsewhere", "adapters", "claude-statusline.mjs"].join(path.sep));
  assert.equal(moved.changed, true);
  assert.match(moved.settings.statusLine.command, /^node "E:\/elsewhere\/adapters\/claude-statusline\.mjs" --tee \| my-line$/);
});

test("undo leaves a status line that is not ours alone", () => {
  const settings = { statusLine: { type: "command", command: "my-line" } };
  const result = disconnectStatusLine(settings);
  assert.equal(result.changed, false);
  assert.equal(result.settings, settings);
});

test("each Claude profile gets its own row", () => {
  const home = os.homedir();
  const main = path.join(home, ".claude");
  const profiles = claudeProfiles([main, path.join(home, ".claude-work"), path.join(home, "Other Profile")]);
  assert.deepEqual(
    profiles.map((profile) => [profile.id, profile.name]),
    [
      ["claude-code", "Claude Code"],
      ["claude-code-work", "Claude Code (work)"],
      ["claude-code-other-profile", "Claude Code (other-profile)"],
    ],
  );
  // A single profile in a custom folder is simply Claude Code.
  assert.equal(claudeProfiles([path.join(home, ".claude-work")])[0].id, "claude-code");
  assert.match(adapterCommand(adapter, "claude-code-work"), / --id claude-code-work$/);
});

test("setup edits settings.json in place, keeps a copy, and undo puts it back", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-dir-"));
  const file = path.join(dir, "settings.json");
  const original = `${JSON.stringify({ model: "opus", statusLine: { type: "command", command: "my-line" } }, null, 2)}\n`;
  fs.writeFileSync(file, original);

  assert.match(runSetup({ dryRun: true, mcp: false, claudeDirs: [dir] }), /would be connected/);
  assert.equal(fs.readFileSync(file, "utf8"), original);

  const output = runSetup({ mcp: false, claudeDirs: [dir] });
  assert.match(output, /status line connected\. Your own status line still runs after it\./);
  assert.match(JSON.parse(fs.readFileSync(file, "utf8")).statusLine.command, /claude-statusline\.mjs" --tee \| my-line$/);
  assert.equal(fs.readFileSync(`${file}.before-tokens-reset`, "utf8"), original);

  runSetup({ undo: true, mcp: false, claudeDirs: [dir] });
  assert.equal(fs.readFileSync(file, "utf8"), original);
});

test("a settings file that is not JSON is left alone", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-dir-"));
  const file = path.join(dir, "settings.json");
  fs.writeFileSync(file, "{ not json");
  assert.match(runSetup({ mcp: false, claudeDirs: [dir] }), /left alone/);
  assert.equal(fs.readFileSync(file, "utf8"), "{ not json");
});
