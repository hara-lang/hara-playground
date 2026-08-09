#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { installAnonymousIdentityFixture } from "./browser-fixture-routes.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sampleRoot = "samples/hodos-document";
const samplePaths = [
  `${sampleRoot}/README.md`,
  `${sampleRoot}/project.edn`,
  `${sampleRoot}/workspace.edn`,
  `${sampleRoot}/src/main.hal`,
];
const commit = "d".repeat(40);
const sampleFiles = new Map(await Promise.all(samplePaths.map(async (path) => [
  path,
  await readFile(resolve(root, path), "utf8"),
])));

let browser = null;
let server = null;

try {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const target = safeTarget(url.pathname === "/" ? "/index.html" : url.pathname);
      const metadata = await stat(target);
      if (!metadata.isFile()) throw Object.assign(new Error("not a file"), { code: "ENOENT" });
      response.writeHead(200, {
        "content-type": contentType(target),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(await readFile(target));
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 400, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(error?.message || String(error));
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object", "test server did not expose an address");

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 820, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  const pageConsole = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  page.on("console", (message) => pageConsole.push(`${message.type()}: ${message.text()}`));

  await installAnonymousIdentityFixture(page);
  await installGitHubFixtureRoutes(page);
  const url = new URL(`http://127.0.0.1:${address.port}/`);
  url.searchParams.set("repo", "hara-lang/hara-playground");
  url.searchParams.set("branch", "main");
  url.searchParams.set("path", sampleRoot);
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 15_000 });

  await page.waitForSelector('.hodos-2d-document-host[data-hodos-component="hodos.2d/document"]', {
    state: "visible",
    timeout: 15_000,
  });
  await page.waitForFunction(() => {
    const shell = document.querySelector(".workbench-grid");
    const host = document.querySelector('.hodos-2d-document-host[data-hodos-component="hodos.2d/document"]');
    return shell?.dataset.workspaceId === "playground-hodos-document"
      && shell?.dataset.workspaceManifestStatus === "ready"
      && host?.textContent.includes("Inspectable documents")
      && host?.textContent.includes("42");
  }, null, { timeout: 15_000 });

  const initial = await page.evaluate(() => ({
    workspaceId: document.querySelector(".workbench-grid")?.dataset.workspaceId || "",
    mode: document.querySelector(".workbench-grid")?.dataset.workspaceMode || "",
    status: document.querySelector(".workbench-grid")?.dataset.workspaceManifestStatus || "",
    source: document.querySelector(".workbench-grid")?.dataset.workspaceManifestSource || "",
    hasDocumentDock: Boolean(document.querySelector('[data-workspace-surface-id="document"]')),
    snapshot: document.querySelector('[data-artefact-output="artefact/answer"]')?.textContent || "",
  }));
  assert.equal(initial.workspaceId, "playground-hodos-document");
  assert.equal(initial.mode, "compact");
  assert.equal(initial.status, "ready");
  assert.equal(initial.source, "workspace.edn");
  assert.equal(initial.hasDocumentDock, true);
  assert.match(initial.snapshot, /42/);

  await page.click('[data-node-id="block/title"]');
  await page.waitForFunction(() =>
    document.querySelector('[data-node-id="block/title"]')?.classList.contains("selected"),
  null,
  { timeout: 5_000 });

  await page.click('[data-node-id="block/intro"]', { position: { x: 6, y: 6 } });
  await page.waitForFunction(() =>
    document.querySelector('[data-node-id="block/intro"]')?.classList.contains("selected"),
  null,
  { timeout: 5_000 });

  const replacement = "Edited through the authoritative Hodos document event stream.";
  await page.evaluate((text) => {
    const node = document.querySelector('[data-text-id="text/intro"]');
    if (!node) throw new Error("Hodos document intro text is missing after selection");
    node.focus();
    node.textContent = text;
    node.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
    }));
  }, replacement);

  await page.waitForTimeout(250);
  const postEdit = await page.evaluate(() => ({
    current: document.querySelector('[data-text-id="text/intro"]')?.textContent || "",
    revision: document.querySelector(".hodos-2d-document-toolbar span")?.textContent || "",
    selectedIntro: document.querySelector('[data-node-id="block/intro"]')?.classList.contains("selected") || false,
    activeTextId: document.activeElement?.dataset?.textId || null,
    repl: document.querySelector("#repl-output")?.textContent || "",
  }));
  console.log("Hodos Document post-edit diagnostic", JSON.stringify(postEdit));
  assert.equal(postEdit.current, replacement, `Hodos Document canonical text did not update: ${JSON.stringify(postEdit)}`);
  assert.match(postEdit.revision, /revision 1/, `Hodos Document revision did not advance: ${JSON.stringify(postEdit)}`);

  assert.deepEqual(pageErrors, [], `Hodos Document page errors:\n${pageErrors.join("\n")}`);
  const errorConsole = pageConsole.filter((entry) => entry.startsWith("error:"));
  assert.deepEqual(errorConsole, [], `Hodos Document console errors:\n${errorConsole.join("\n")}`);
  console.log("Verified manifest-native Hodos 2D document mounting, selection and text editing in Chromium.");
} finally {
  await browser?.close().catch(() => {});
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

async function installGitHubFixtureRoutes(page) {
  const cors = {
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  };
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    let body = null;
    if (url.pathname === "/repos/hara-lang/hara-playground") {
      body = { default_branch: "main", html_url: "https://github.com/hara-lang/hara-playground" };
    } else if (url.pathname === "/repos/hara-lang/hara-playground/branches/main") {
      body = { commit: { sha: commit } };
    } else if (url.pathname === `/repos/hara-lang/hara-playground/git/trees/${commit}`) {
      body = {
        truncated: false,
        tree: [...sampleFiles].map(([path, content]) => ({
          path,
          type: "blob",
          size: Buffer.byteLength(content),
        })),
      };
    }
    if (!body) {
      await route.fulfill({ status: 404, headers: cors, body: "not found" });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  await page.route("https://raw.githubusercontent.com/**", async (route) => {
    const url = new URL(route.request().url());
    const prefix = `/hara-lang/hara-playground/${commit}/`;
    if (!url.pathname.startsWith(prefix)) {
      await route.fulfill({ status: 404, headers: cors, body: "not found" });
      return;
    }
    const path = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
    const content = sampleFiles.get(path);
    if (content == null) {
      await route.fulfill({ status: 404, headers: cors, body: "not found" });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": "text/plain; charset=utf-8" },
      body: content,
    });
  });
}

function safeTarget(pathname) {
  const decoded = decodeURIComponent(pathname);
  const parts = decoded.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === ".." || part.includes("\\") || part.includes("\0"))) {
    throw new Error("unsafe request path");
  }
  const target = resolve(root, ...parts);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("request escaped repository root");
  return target;
}

function contentType(path) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".hal": "text/plain; charset=utf-8",
    ".edn": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".wasm": "application/wasm",
  })[extname(path)] || "application/octet-stream";
}
