#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
const port = Number(process.env.HARA_SHOWCASE_PORT || 4178);
if (!Number.isFinite(readyTimeout) || readyTimeout < 5_000 || readyTimeout > 120_000) {
  throw new Error("HARA_SHOWCASE_READY_TIMEOUT must be between 5000 and 120000 milliseconds");
}
if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
  throw new Error("HARA_SHOWCASE_PORT must be an integer between 1024 and 65535");
}
const origin = `http://127.0.0.1:${port}`;
const sampleFiles = new Map(await Promise.all(
  samplePaths.map(async (path) => [path, await readFile(resolve(root, path), "utf8")]),
));

let browser = null;
let server = null;
let page = null;
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];

try {
  server = spawn(process.execPath, ["scripts/dev-server.mjs"], {
    cwd: root,
    env: {...process.env, PORT: String(port)},
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(server, origin);

  browser = await chromium.launch({headless: true});
  const context = await browser.newContext({viewport: {width: 1000, height: 800}});
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

  const parent = new URL(`${origin}/scripts/showcase-fixture.html`);
  parent.searchParams.set("source", showcase.href);
  const response = await page.goto(parent.href, {
    waitUntil: "domcontentloaded",
    timeout: readyTimeout,
  });
  assert.ok(response?.ok(), `Showcase fixture returned HTTP ${response?.status() ?? "unknown"}`);
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);

  const frame = page.frameLocator("#showcase");
  await frame.locator('html[data-presentation="showcase"][data-showcase-status="ready"]')
    .waitFor({state: "attached", timeout: readyTimeout});
  await frame.locator('.hodos-2d-document-host[data-hodos-component="hodos.2d/document"]')
    .waitFor({state: "visible", timeout: readyTimeout});

  await page.waitForFunction(() =>
    window.showcaseMessages.some((message) =>
      message?.type === "hara.showcase/ready"
      && message?.commit === "c".repeat(40)
      && message?.surfaceId === "document"), null, {timeout: readyTimeout});

  const initial = await frame.locator("html").evaluate((html) => ({
    url: location.href,
    presentation: html.dataset.presentation,
    status: html.dataset.showcaseStatus,
    runtimeStatus: html.dataset.showcaseRuntimeStatus,
    workspaceStatus: html.dataset.showcaseWorkspaceStatus,
    crossOriginIsolated,
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
  assert.equal(initial.runtimeStatus, "ready");
  assert.equal(initial.workspaceStatus, "ready");
  assert.equal(initial.crossOriginIsolated, true);
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
    .waitFor({state: "visible", timeout: 10_000});

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
  await frame.locator(".editor-panel").waitFor({state: "visible", timeout: 10_000});

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
  assert.deepEqual(consoleErrors, [], `Showcase console errors:\n${consoleErrors.join("\n")}`);
  assert.deepEqual(failedRequests, [], `Showcase failed requests:\n${failedRequests.join("\n")}`);
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
      crossOriginIsolated,
      messages: window.showcaseMessages || [],
      bodyTail: (document.body?.innerText || "").slice(-1_500),
    })).catch((stateError) => ({captureError: stateError?.message || String(stateError)}));

    const child = page.frames().find((current) => current !== page.mainFrame());
    if (child) {
      childState = await child.evaluate(() => ({
        url: location.href,
        title: document.title,
        crossOriginIsolated,
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
  if (server && server.exitCode == null) {
    server.kill("SIGTERM");
    await new Promise((resolveExit) => {
      const timeout = setTimeout(resolveExit, 2_000);
      server.once("exit", () => {
        clearTimeout(timeout);
        resolveExit();
      });
    });
  }
}

async function waitForServer(child, url) {
  let output = "";
  child.stdout?.on("data", (chunk) => { output += chunk; });
  child.stderr?.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode != null) throw new Error(`Playground server exited early:\n${output}`);
    try {
      const response = await fetch(url, {cache: "no-store"});
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Playground server did not become ready:\n${output}`);
}

async function installGitHubFixtureRoutes(page) {
  const headers = {
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    "cross-origin-resource-policy": "cross-origin",
  };
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
    if (!body) return route.fulfill({status: 404, headers, body: "not found"});
    await route.fulfill({
      status: 200,
      headers: {...headers, "content-type": "application/json"},
      body: JSON.stringify(body),
    });
  });
  await page.route("https://raw.githubusercontent.com/**", async (route) => {
    const url = new URL(route.request().url());
    const prefix = `/hara-lang/hara-playground/${commit}/`;
    if (!url.pathname.startsWith(prefix)) {
      return route.fulfill({status: 404, headers, body: "not found"});
    }
    const path = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
    const content = sampleFiles.get(path);
    if (content == null) return route.fulfill({status: 404, headers, body: "not found"});
    await route.fulfill({
      status: 200,
      headers: {...headers, "content-type": "text/plain; charset=utf-8"},
      body: content,
    });
  });
}
