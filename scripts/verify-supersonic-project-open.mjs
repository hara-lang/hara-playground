#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sampleRoot = "samples/supersonic-live";
const samplePaths = [
  `${sampleRoot}/README.md`,
  `${sampleRoot}/project.edn`,
  `${sampleRoot}/workspace.edn`,
  `${sampleRoot}/src/main.hal`
];
const commit = "a".repeat(40);
const sampleFiles = new Map(await Promise.all(samplePaths.map(async (path) => [
  path,
  await readFile(resolve(root, path), "utf8")
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
        "x-content-type-options": "nosniff"
      });
      response.end(await readFile(target));
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 400, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
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
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  let crashed = false;
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  page.on("crash", () => { crashed = true; });

  await page.addInitScript(() => {
    const queue = globalThis.queueMicrotask.bind(globalThis);
    globalThis.__haraQueuedMicrotasks = 0;
    globalThis.queueMicrotask = (callback) => {
      globalThis.__haraQueuedMicrotasks += 1;
      queue(callback);
    };
  });

  await installGitHubFixtureRoutes(page);

  const url = new URL(`http://127.0.0.1:${address.port}/`);
  url.searchParams.set("repo", "hara-lang/hara-playground");
  url.searchParams.set("branch", "main");
  url.searchParams.set("path", sampleRoot);
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 15_000 });

  await page.waitForSelector("#editor", { state: "visible", timeout: 15_000 });
  await page.waitForFunction(() =>
    document.querySelector("#editor")?.value.includes("playground/supersonic-live"),
  null,
  { timeout: 15_000 });

  const mounted = await page.evaluate(() => ({
    editorLength: document.querySelector("#editor")?.value.length || 0,
    hasAudioTab: Boolean(document.querySelector('[data-output-tab="audio"]')),
    queuedMicrotasks: globalThis.__haraQueuedMicrotasks,
    runtimeStatus: document.querySelector(".kernel-state")?.textContent || ""
  }));
  assert.ok(mounted.editorLength > 2_000, "the complete Supersonic source did not open");
  assert.equal(mounted.hasAudioTab, true, "the Audio output was not mounted");

  // The previous implementation continually observed its own preview-mode
  // textContent replacement. A timer or animation frame could never run once
  // the workbench mounted, eventually exhausting the tab. Require several
  // frames and a timer turn before continuing.
  const heartbeat = await page.evaluate(() => new Promise((resolveHeartbeat) => {
    const before = globalThis.__haraQueuedMicrotasks;
    let frames = 0;
    const tick = () => {
      frames += 1;
      if (frames < 3) {
        requestAnimationFrame(tick);
        return;
      }
      setTimeout(() => resolveHeartbeat({
        frames,
        before,
        after: globalThis.__haraQueuedMicrotasks
      }), 60);
    };
    requestAnimationFrame(tick);
  }));
  assert.ok(heartbeat.frames >= 3, "the Playground event loop stopped producing frames");
  assert.ok(
    heartbeat.after - heartbeat.before < 10,
    `Audio reconciliation kept queuing microtasks (${heartbeat.before} → ${heartbeat.after})`
  );

  await page.click('[data-output-tab="audio"]');
  await page.waitForFunction(() =>
    document.querySelector(".audio-view")?.classList.contains("active"),
  null,
  { timeout: 5_000 });
  const audioSurface = await page.evaluate(() => ({
    active: document.querySelector(".audio-view")?.classList.contains("active") || false,
    mode: document.querySelector(".preview-mode")?.textContent || "",
    queuedMicrotasks: globalThis.__haraQueuedMicrotasks
  }));
  assert.equal(audioSurface.active, true);
  assert.equal(audioSurface.mode, "audio/playback");

  await page.waitForTimeout(100);
  const finalMicrotasks = await page.evaluate(() => globalThis.__haraQueuedMicrotasks);
  assert.ok(
    finalMicrotasks - audioSurface.queuedMicrotasks < 10,
    "opening Audio restarted a self-observing microtask loop"
  );
  assert.equal(crashed, false, "Chromium reported that the Playground page crashed");
  assert.deepEqual(pageErrors, [], `Playground page errors:\n${pageErrors.join("\n")}`);

  console.log(
    "Verified that the complete Supersonic deep link imports, mounts Audio, and remains responsive in Chromium."
  );
} finally {
  await browser?.close().catch(() => {});
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

async function installGitHubFixtureRoutes(page) {
  const cors = {
    "access-control-allow-origin": "*",
    "cache-control": "no-store"
  };

  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    let body = null;
    if (url.pathname === "/repos/hara-lang/hara-playground") {
      body = {
        default_branch: "main",
        html_url: "https://github.com/hara-lang/hara-playground"
      };
    } else if (url.pathname === "/repos/hara-lang/hara-playground/branches/main") {
      body = { commit: { sha: commit } };
    } else if (url.pathname === `/repos/hara-lang/hara-playground/git/trees/${commit}`) {
      body = {
        truncated: false,
        tree: [...sampleFiles].map(([path, content]) => ({
          path,
          type: "blob",
          size: Buffer.byteLength(content)
        }))
      };
    }

    if (!body) {
      await route.fulfill({ status: 404, headers: cors, body: "not found" });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  });

  await page.route("https://raw.githubusercontent.com/**", async (route) => {
    const url = new URL(route.request().url());
    const prefix = `/hara-lang/hara-playground/${commit}/`;
    if (!url.pathname.startsWith(prefix)) {
      await route.fulfill({ status: 404, headers: cors, body: "not found" });
      return;
    }
    const path = url.pathname.slice(prefix.length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    const content = sampleFiles.get(path);
    if (content == null) {
      await route.fulfill({ status: 404, headers: cors, body: "not found" });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": "text/plain; charset=utf-8" },
      body: content
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
    ".wasm": "application/wasm"
  })[extname(path)] || "application/octet-stream";
}
