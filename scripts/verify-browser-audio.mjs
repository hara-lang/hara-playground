#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixturePath = "/tests/browser/supersonic-audio.html";
const pageErrors = [];
const consoleErrors = [];
let browser = null;
let server = null;

try {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const target = safeTarget(url.pathname);
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
        "content-type": "text/plain; charset=utf-8"
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

  browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=user-gesture-required"]
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const url = `http://127.0.0.1:${address.port}${fixturePath}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(globalThis.supersonicPrepared), null, { timeout: 10_000 });

  const prepared = await page.evaluate(() => globalThis.supersonicPrepared);
  assert.deepEqual(prepared, {
    graphId: "browser/audio-test",
    preparedSilently: true,
    status: "running"
  });

  await page.click("#authorize");
  await page.waitForFunction(() => Boolean(globalThis.supersonicResult), null, { timeout: 15_000 });
  const result = await page.evaluate(() => globalThis.supersonicResult);

  assert.equal(result.error, null, result.error || "browser audio fixture failed");
  assert.equal(result.preparedSilently, true, "graph preparation created audible resources before the click");
  assert.equal(result.contextRunning, true, "the user gesture did not start a real AudioContext");
  assert.equal(result.clockAdvanced, true, "the real browser sequencer clock did not advance");
  assert.equal(result.timerPreserved, true, "a live parameter update replaced the scheduler interval");
  assert.equal(result.phasePreserved, true, "a live tempo edit reset the sequencer phase");
  assert.equal(result.revisionAdvanced, true, "live edits did not advance the graph revision");
  assert.equal(result.paused, true, "transport pause did not stop scheduling");
  assert.equal(result.contextRevoked, true, "reset did not close and revoke the AudioContext");
  assert.equal(result.generation, 1);
  assert.deepEqual(pageErrors, [], `browser page errors:\n${pageErrors.join("\n")}`);
  assert.deepEqual(consoleErrors, [], `browser console errors:\n${consoleErrors.join("\n")}`);

  console.log("Verified silent preparation, user-gesture authorization, live timing continuity, pause, and AudioContext revocation in Chromium.");
} finally {
  await browser?.close().catch(() => {});
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
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
    ".wasm": "application/wasm"
  })[extname(path)] || "application/octet-stream";
}
