#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { collectAll } from "../lib/collect.js";
import { packageRoot } from "../lib/paths.js";
import { load, present } from "../lib/store.js";
import { renderCompact } from "../lib/terminal.js";

// Stdio MCP server with one read-only tool. Logs go to stderr. Stdout is
// reserved for protocol messages.
//
// Everything here is sent to a model, in every session of every CLI that has
// this server registered. Keep the description and the answer short.
//
// MCP's stdio transport is one JSON message per line. That is what Claude Code,
// Codex, and Grok Build send. A client that sends Content-Length headers
// instead is answered the same way.

const SERVER = {
  name: "tokens-reset",
  version: JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version,
};
const PROTOCOL = "2024-11-05";

const TOOLS = [
  {
    name: "list_resets",
    description:
      "Plan usage and reset times of the coding CLIs on this computer (Claude Code, Codex, Grok Build): percent used per window and when it resets. Give the numbers as returned. Do not estimate a missing one.",
    inputSchema: { type: "object", properties: {} },
  },
];

let headerFraming = false;

function send(message) {
  const json = JSON.stringify(message);
  process.stdout.write(headerFraming ? `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}` : `${json}\n`);
}

function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function toolText(text, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

async function callTool(name) {
  if (name !== "list_resets") throw new Error(`Unknown tool ${name}`);
  await collectAll();
  return toolText(renderCompact(present(load())));
}

async function handle(message) {
  if (!message || message.jsonrpc !== "2.0") return;
  const { id, method, params } = message;
  if (id == null) return;

  if (method === "initialize") {
    const clientVersion = params?.protocolVersion;
    ok(id, {
      protocolVersion: typeof clientVersion === "string" ? clientVersion : PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER,
    });
    return;
  }
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: TOOLS });
  if (method === "tools/call") {
    try {
      ok(id, await callTool(params?.name));
    } catch (error) {
      ok(id, toolText(error.message || "Could not run that tool", true));
    }
    return;
  }
  fail(id, -32601, `Method not found: ${method}`);
}

let buffer = Buffer.alloc(0);

function parse(text) {
  try {
    return [].concat(JSON.parse(text));
  } catch (error) {
    console.error(`Ignored an unreadable MCP message: ${error.message}`);
    return [];
  }
}

function takeMessages() {
  const messages = [];
  while (buffer.length) {
    const first = buffer.subarray(0, 32).toString("utf8").trimStart();
    if (!first) {
      buffer = Buffer.alloc(0);
      break;
    }
    if (first.startsWith("{") || first.startsWith("[")) {
      const newline = buffer.indexOf(0x0a);
      if (newline < 0) break;
      const line = buffer.subarray(0, newline).toString("utf8").trim();
      buffer = buffer.subarray(newline + 1);
      headerFraming = false;
      if (line) messages.push(...parse(line));
      continue;
    }
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) break;
    const match = /content-length:\s*(\d+)/i.exec(buffer.subarray(0, headerEnd).toString("utf8"));
    if (!match) {
      buffer = buffer.subarray(headerEnd + 4);
      continue;
    }
    const start = headerEnd + 4;
    const length = Number(match[1]);
    if (buffer.length < start + length) break;
    const body = buffer.subarray(start, start + length).toString("utf8");
    buffer = buffer.subarray(start + length);
    headerFraming = true;
    messages.push(...parse(body));
  }
  return messages;
}

// One message at a time, in the order they arrived.
let queue = Promise.resolve();

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (const message of takeMessages()) {
    queue = queue
      .then(() => handle(message))
      .catch((error) => {
        console.error(error);
        if (message?.id != null) fail(message.id, -32603, error.message || "Internal error");
      });
  }
});
