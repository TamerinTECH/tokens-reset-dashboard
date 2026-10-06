import fs from "node:fs";
import path from "node:path";
import { dashboardFile, dataFile, packageRoot, selfCommand } from "./paths.js";

const pub = path.join(packageRoot, "public");

// One file people can open from disk. Browsers block module scripts on file://,
// so the page is CSS, fonts, data, and a classic script inlined together.
export function buildDashboard(usage, builtAt = new Date()) {
  const css = fs
    .readFileSync(path.join(pub, "styles.css"), "utf8")
    .replace(/url\("fonts\/([^"]+)"\)/g, (_, name) => {
      const font = fs.readFileSync(path.join(pub, "fonts", name)).toString("base64");
      return `url("data:font/woff2;base64,${font}")`;
    });
  const format = fs.readFileSync(path.join(pub, "format.js"), "utf8").replace(/^export /gm, "");
  const app = fs.readFileSync(path.join(pub, "app.js"), "utf8").replace(/^import .*\r?\n/, "");
  const favicon = fs.readFileSync(path.join(pub, "favicon.svg"), "utf8").replace(/\s+/g, " ").trim();
  const payload = { ...usage, builtAt: builtAt.toISOString(), command: selfCommand(), dataFile: dataFile() };
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Reset times</title>
    <link rel="icon" href="data:image/svg+xml,${encodeURIComponent(favicon)}" type="image/svg+xml" />
    <style>
${css}
    </style>
  </head>
  <body>
    <main id="app">
      <p class="site">Reset times</p>
      <p class="lede">This page needs JavaScript. The readings are already in the file.</p>
    </main>
    <script id="usage-data" type="application/json">${json}</script>
    <script>
${format}
${app}
    </script>
  </body>
</html>
`;
}

export function writeDashboard(usage, builtAt = new Date(), file = dashboardFile()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buildDashboard(usage, builtAt));
  return file;
}
