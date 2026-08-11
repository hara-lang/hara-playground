#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sampleRoot = "samples/hodos-document";
const samplePaths = [
  `${sampleRoot}/README.md`,
  `${sampleRoot}/project.edn`,
  `${sampleRoot}/workspace.edn`,
  `${sampleRoot}/src/main.hal`,
];
const commit = "c".repeat(40);
const readyTimeout = Number(process.env.HARA_SHOWCASE_READY_TIMEOUT || 45_000);
if (!Number.isFinite(readyTimeout) || readyTimeout < 5_000 || readyTimeout > 120_000) {
  throw new Error("HARA_SHOWCASE_READY_TIMEOUT must be between 5000 and 120000 milliseconds");
}
const sampleFiles = new Map(await Promise.all(
  samplePaths.map(async (path) => [path, await readFile(resolve(root, path), "utf8")]),
));
let browser = null;
let server = null;
let page = null;
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];

const parentDocument = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Packages Showcase fixture</title></head>
<body>
  <iframe id="showcase" title="Hara package Showcase"></iframe>
  <script>
    window.showcaseMessages = [];
    const frame = document.querySelector("#showcase");
    const source = new URL(location.href).searchParams.get("source");
    frame.src = source;
    window.addEventListener("message", (event) => {
      if (event.source === frame.contentWindow) window.showcaseMessages.push(event.data);
    });
  </script>
</body>
</html>`;

try {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/showcase-fixture.html") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(parentDocument);
        return;
      }
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
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} · ${request.failure()?.errorText || "failed"}`,
    );
  });
  await installGitHubFixtureRoutes(page);

  const showcase = new URL(`${origin}/`);
  showcase.searchParams.set("repo", "hara-lang/hara-playground");
  showcase.searchParams.set("branch", "main");
  showcase.searchParams.set("commit", commit);
  showcase.searchParams.set("path", sampleRoot);
  showcase.searchParams.set("presentation", "showcase");
  showcase.searchParams.set("surface", "document");

  const parent = new URL(`${origin}/showcase-fixture.html`);
  parent.searchParams.set("source", showcase.href);
  await page.goto(parent.href, { waitUntil: "domcontentloaded", timeout: readyTimeout });

  const frame = page.frameLocator("#showcase");
  await frame.locator('html[data-presentation="showcase"][data-showcase-status="ready"]')
    .waitFor({ state: "attached", timeout: readyTimeout });
  await frame.locator('.hodos-2d-document-host[data-hodos-component="hodos.2d/document"]')
    .waitFor({ state: "visible", timeout: readyTimeout });

  await page.waitForFunction(() =>
    window.showcaseMessages.some((message) =>
      message?.type === "hara.showcase/ready"
      && message?.commit === "c".repeat(40)
      && message?.surfaceId === "document"), null, {timeout: readyTimeout});

  const initial = await frame.locator("html").evaluate((html) => ({
    url: location.href,
    presentation: html.dataset.presentation,
    status: html.dataset.showcaseStatus,
    header: getComputedStyle(document.querySelector(".workbench-header")).display,
    statusbar: getComputedStyle(document.querySelector(".statusbar")).display,
    layoutAreas: [...document.querySelectorAll(".hodos-workspace-area")].length,
    selectedSurface: document.querySelector(".workbench-grid")?.dataset.workspaceSurfaceId || "",
  }));
  const initialUrl = new URL(initial.url);
  assert.equal(initialUrl.searchParams.get("commit"), commit);
  assert.equal(initialUrl.searchParams.get("presentation"), "showcase");
  assert.equal(initialUrl.searchParams.get("surface"), "document");
  assert.equal(initial.presentation, "showcase");
  assert.equal(initial.status, "ready");
  assert.equal(initial.header, "none");
  assert.equal(initial.statusbar, "none");
  assert.equal(initial.layoutAreas, 1);
  assert.equal(initial.selectedSurface, "document");

  await page.locator("#showcase").evaluate((showcaseFrame) => {
    showcaseFrame.style.display = "block";
    showcaseFrame.style.width = "960px";
    showcaseFrame.style.height = "700px";
    showcaseFrame.style.border = "0";
  });

  await page.evaluate(() => {
    document.querySelector("#showcase").contentWindow.postMessage({
      type: "hara.showcase/select-surface",
      version: 1,
      surfaceId: "preview",
    }, location.origin);
  });
  await page.waitForFunction(() =>
    window.showcaseMessages.some((message) =>
      message?.type === "hara.showcase/selection"
      && message?.ok === true
      && message?.surfaceId === "preview"), null, {timeout: readyTimeout});
  await frame.locator("#preview.hodos-preview-root > .hara-web-preview")
    .waitFor({ state: "visible", timeout: 10_000 });

  const preview = await frame.locator("html").evaluate(() => {
    const output = document.querySelector(".output-panel");
    const view = document.querySelector(".preview-view.active");
    const root = document.querySelector("#preview.hodos-preview-root");
    const nestedFrame = root?.querySelector(":scope > .hara-web-preview");
    const height = (node) => node?.getBoundingClientRect().height ?? 0;
    return {
      tabs: getComputedStyle(document.querySelector(".output-tabs")).display,
      rows: getComputedStyle(output).gridTemplateRows,
      outputHeight: height(output),
      viewHeight: height(view),
      rootHeight: height(root),
      frameHeight: height(nestedFrame),
    };
  });
  assert.equal(preview.tabs, "none");
  assert.ok(preview.outputHeight > 500, `Showcase output collapsed to ${preview.outputHeight}px`);
  assert.ok(preview.viewHeight > 500, `Showcase preview view collapsed to ${preview.viewHeight}px`);
  assert.ok(preview.rootHeight > 500, `Hodos preview root collapsed to ${preview.rootHeight}px`);
  assert.ok(preview.frameHeight > 500, `Nested Hara preview iframe collapsed to ${preview.frameHeight}px`);
  assert.ok(
    Math.abs(preview.rootHeight - preview.frameHeight) < 1,
    `Nested preview did not fill its root: ${preview.frameHeight}px of ${preview.rootHeight}px`,
  );

  await page.evaluate(() => {
    document.querySelector("#showcase").contentWindow.postMessage({
      type: "hara.showcase/select-surface",
      version: 1,
      surfaceId: "code",
    }, location.origin);
  });
  await page.waitForFunction(() =>
    window.showcaseMessages.some((message) =>
      message?.type === "hara.showcase/selection"
      && message?.ok === true
      && message?.surfaceId === "code"), null, {timeout: readyTimeout});
  await frame.locator(".editor-panel").waitFor({ state: "visible", timeout: 10_000 });

  await page.evaluate(() => {
    document.querySelector("#showcase").contentWindow.postMessage({
      type: "hara.showcase/select-surface",
      version: 1,
      surfaceId: "not-declared",
    }, location.origin);
  });
  await page.waitForFunction(() =>
    window.showcaseMessages.some((message) =>
      message?.type === "hara.showcase/selection"
      && message?.ok === false
      && message?.surfaceId === "not-declared"), null, {timeout: readyTimeout});

  const finalSurface = await frame.locator(".workbench-grid")
    .getAttribute("data-workspace-surface-id");
  assert.equal(finalSurface, "code");
  assert.deepEqual(pageErrors, [], `Showcase page errors:\n${pageErrors.join("\n")}`);
  console.log("Verified immutable embedded Showcase mounting, full-height preview, and declared surface selection in Chromium.");
} catch (error) {
  let childState = null;
  let parentState = null;
  let frames = [];
  if (page && !page.isClosed()) {
    frames = page.frames().map((current) => current.url());
    parentState = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      messages: window.showcaseMessages || [],
      bodyTail: (document.body?.innerText || "").slice(-1_500),
    })).catch((stateError) => ({captureError: stateError?.message || String(stateError)}));

    const child = page.frames().find((current) => current !== page.mainFrame());
    if (child) {
      childState = await child.evaluate(() => ({
        url: location.href,
        title: document.title,
        htmlDataset: {...document.documentElement.dataset},
        bodyDataset: {...(document.body?.dataset || {})},
        homeError: document.querySelector(".home-error")?.textContent?.trim() || "",
        workspaceError: document.querySelector(".workspace-error")?.textContent?.trim() || "",
        runtimeStatus: document.querySelector("[data-runtime-status]")?.getAttribute("data-runtime-status") || "",
        selectedSurface: document.querySelector(".workbench-grid")?.dataset.workspaceSurfaceId || "",
        layoutAreas: document.querySelectorAll(".hodos-workspace-area").length,
        bodyTail: (document.body?.innerText || "").slice(-1_500),
      })).catch((stateError) => ({captureError: stateError?.message || String(stateError)}));
    }
  }

  const failure = {
    original: (error?.stack || error?.message || String(error)).slice(0, 2_000),
    readyTimeout,
    frames,
    parentState,
    childState,
    pageErrors: pageErrors.slice(-8).map((entry) => entry.slice(0, 700)),
    consoleErrors: consoleErrors.slice(-8).map((entry) => entry.slice(0, 700)),
    failedRequests: failedRequests.slice(-10).map((entry) => entry.slice(0, 700)),
  };
  const marker = `SHOWCASE_BROWSER_STATE ${JSON.stringify(failure)}`;
  const annotation = marker
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  console.error(`::error title=Embedded Showcase readiness::${annotation}`);
  console.error(marker);
  throw new Error("Embedded Showcase browser verification failed; see the check annotation.");
} finally {
  await browser?.close().catch(() => {});
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

async function installGitHubFixtureRoutes(page) {
  const cors = { "access-control-allow-origin": "*", "cache-control": "no-store" };
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    let body = null;
    if (url.pathname === "/repos/hara-lang/hara-playground") {
      body = {
        default_branch: "main",
        html_url: "https://github.com/hara-lang/hara-playground",
      };
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
    if (!body) return route.fulfill({ status: 404, headers: cors, body: "not found" });
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
      return route.fulfill({ status: 404, headers: cors, body: "not found" });
    }
    const path = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
    const content = sampleFiles.get(path);
    if (content == null) return route.fulfill({ status: 404, headers: cors, body: "not found" });
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
  if (parts.some((part) =>
    part === "."
    || part === ".."
    || part.includes("\\")
    || part.includes("\0"))) {
    throw new Error("unsafe request path");
  }
  const target = resolve(root, ...parts);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error("request escaped repository root");
  }
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
