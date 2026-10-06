import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fixtureHomes, root } from "./fixtures.js";

// Talks to the server the way a client does. `headers` switches from one JSON
// message per line to Content-Length framing.
function startServer(env, { headers = false } = {}) {
  const child = spawn(process.execPath, ["bin/mcp.js"], { cwd: root, env, stdio: ["pipe", "pipe", "pipe"] });
  let buf = Buffer.alloc(0);
  let stderr = "";
  const waiters = [];
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdout.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    pump();
  });

  function take() {
    if (!headers) {
      const newline = buf.indexOf(0x0a);
      if (newline < 0) return null;
      const line = buf.subarray(0, newline).toString("utf8");
      buf = buf.subarray(newline + 1);
      return line;
    }
    const end = buf.indexOf("\r\n\r\n");
    if (end < 0) return null;
    const match = /content-length:\s*(\d+)/i.exec(buf.subarray(0, end).toString("utf8"));
    const start = end + 4;
    const length = Number(match[1]);
    if (buf.length < start + length) return null;
    const body = buf.subarray(start, start + length).toString("utf8");
    buf = buf.subarray(start + length);
    return body;
  }

  function pump() {
    while (waiters.length) {
      const text = take();
      if (text == null) return;
      const waiter = waiters.shift();
      clearTimeout(waiter.timer);
      waiter.resolve({ raw: text, message: JSON.parse(text) });
    }
  }

  function send(message) {
    const json = JSON.stringify(message);
    child.stdin.write(headers ? `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}` : `${json}\n`);
  }

  function call(message) {
    send(message);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out\n${stderr}`)), 5000);
      waiters.push({ resolve, timer });
      pump();
    });
  }

  return { child, send, call };
}

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
};
const listResets = { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_resets", arguments: {} } };

test("speaks one JSON message per line, as MCP clients do", async () => {
  const { env } = fixtureHomes();
  const { child, send, call } = startServer(env);
  try {
    const init = await call(initialize);
    assert.equal(init.raw.includes("Content-Length"), false);
    assert.equal(init.message.result.serverInfo.name, "tokens-reset");
    assert.equal(init.message.result.protocolVersion, "2025-06-18");

    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    const listed = await call({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.deepEqual(
      listed.message.result.tools.map((tool) => tool.name),
      ["list_resets"],
    );
  } finally {
    child.kill();
  }
});

test("what a session pays for this server stays small", async () => {
  const { env } = fixtureHomes();
  const { child, call } = startServer(env);
  try {
    const init = await call(initialize);
    const listed = await call({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    // Sent to the model in every session that has the server registered.
    assert.equal(init.message.result.instructions, undefined);
    assert.ok(JSON.stringify(listed.message.result.tools).length < 400);

    // Sent to the model on a call: a line per CLI, no bars, no JSON dump.
    const text = (await call({ ...listResets, id: 3 })).message.result.content[0].text;
    assert.equal(text.split("\n").length, 3);
    assert.equal(/[█░{]/.test(text), false);
    assert.ok(text.length < 400);
  } finally {
    child.kill();
  }
});

test("list_resets reads Codex and Grok from their logs before answering", async () => {
  const { env } = fixtureHomes();
  const { child, call } = startServer(env);
  try {
    await call(initialize);
    const result = await call(listResets);
    assert.equal(result.message.result.isError, false);
    const [claude, codex, grok] = result.message.result.content[0].text.split("\n");
    assert.equal(claude, "Claude Code: no reading yet");
    assert.match(codex, /^Codex \(Plus\): 5-hour 33% used, resets in \d+m \d+s \(.+\); Weekly 12% used, resets in 23h \d+m \(.+\)\. Read 1 min ago\.$/);
    assert.match(grok, /^Grok Build \(SuperGrok\): Weekly 62% used, resets in 1d 23h \(.+\)\. Read 2 min ago\.$/);
  } finally {
    child.kill();
  }
});

test("a client that frames with Content-Length is answered in kind", async () => {
  const { env } = fixtureHomes({ codex: false, grok: false });
  const { child, call } = startServer(env, { headers: true });
  try {
    const init = await call(initialize);
    assert.equal(init.message.result.serverInfo.name, "tokens-reset");
    const result = await call(listResets);
    assert.match(result.message.result.content[0].text, /^Claude Code: no reading yet\nCodex: no reading yet\nGrok Build: no reading yet$/);

    const unknown = await call({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "nope", arguments: {} } });
    assert.equal(unknown.message.result.isError, true);
  } finally {
    child.kill();
  }
});
