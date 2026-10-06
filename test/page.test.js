import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboard } from "../lib/page.js";

test("the page is one file and a script tag in the data cannot break out", () => {
  const html = buildDashboard(
    {
      version: 1,
      tools: [
        {
          id: "grok",
          name: "Grok",
          windows: [],
          hint: "</script><script>alert(1)</script>",
        },
      ],
    },
    new Date("2026-09-29T08:00:00.000Z"),
  );

  assert.match(html, /Grok/);
  assert.match(html, /2026-09-29T08:00:00.000Z/);
  assert.equal(html.includes("</script><script>alert"), false);
  assert.match(html, /\\u003c\/script/);
  assert.equal(html.includes("export function"), false);
  assert.match(html, /function formatRemain/);
  assert.match(html, /url\("data:font\/woff2;base64,/);
  assert.equal(html.includes('url("fonts/'), false);
});
