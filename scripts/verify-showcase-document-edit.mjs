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
const port = 4179;
const origin = `http://127.0.0.1:${port}`;
const originalText = "Edit this sentence. The stable text identity survives each Hodos update.";
const sampleFiles = new Map(await Promise.all(
  samplePaths.map(async (path) => [path, await readFile(resolve(root, path), "utf8")]),
));

let browser = null;
let server = null;

try {
  server = spawn(process.execPath, ["scripts/dev-server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(server, origin);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  await installGitHubFixtureRoutes(page);

  const showcase = new URL(`${origin}/`);
  showcase.searchParams.set("repo", "hara-lang/hara-playground");
  showcase.searchParams.set("branch", "main");
  showcase.searchParams.set("commit", commit);
  showcase.searchParams.set("path", sampleRoot);
  showcase.searchParams.set("presentation", "showcase");
  showcase.searchParams.set("surface", "document");

  await page.goto(showcase.href, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.locator('html[data-presentation="showcase"][data-showcase-status="ready"]')
    .waitFor({ state: "attached", timeout: 15_000 });
  await page.locator('.hodos-2d-document-host[data-hodos-component="hodos.2d/document"]')
    .waitFor({ state: "visible", timeout: 15_000 });

  const text = page.locator('[data-text-id="text/intro"]');
  await text.waitFor({ state: "visible", timeout: 5_000 });
  await text.evaluate((element) => {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });

  await page.keyboard.type("XYZ", { delay: 35 });
  await page.waitForFunction(
    ({ expected }) => document.querySelector('[data-text-id="text/intro"]')?.textContent === expected,
    { expected: `${originalText}XYZ` },
    { timeout: 5_000 },
  );

  const result = await page.locator('[data-text-id="text/intro"]').evaluate((element) => ({
    text: element.textContent,
    active: document.activeElement === element,
    revision: document.querySelector(".hodos-2d-document-toolbar")?.textContent || "",
  }));
  assert.equal(result.text, `${originalText}XYZ`);
  assert.equal(result.active, true, "the canonical Workspace update must retain the active text node");
  assert.match(result.revision, /revision 3/);
  assert.deepEqual(pageErrors, [], `Showcase page errors:\n${pageErrors.join("\n")}`);
  console.log("Verified three-character Hodos Document editing with focus retained in Chromium.");
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
      const response = await fetch(url, { cache: "no-store" });
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
    if (!body) return route.fulfill({ status: 404, headers, body: "not found" });
    return route.fulfill({
      status: 200,
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  await page.route("https://raw.githubusercontent.com/**", async (route) => {
    const url = new URL(route.request().url());
    const prefix = `/hara-lang/hara-playground/${commit}/`;
    if (!url.pathname.startsWith(prefix)) {
      return route.fulfill({ status: 404, headers, body: "not found" });
    }
    const path = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
    const content = sampleFiles.get(path);
    if (content == null) return route.fulfill({ status: 404, headers, body: "not found" });
    return route.fulfill({
      status: 200,
      headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
      body: content,
    });
  });
}
