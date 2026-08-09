#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.HARA_PLAYGROUND_URL || "https://playground.hara-lang.org/";
const target = new URL(baseUrl);
target.searchParams.set("repo", "greenways-ai/hodos");
target.searchParams.set("presentation", "showcase");
target.searchParams.set("branch", "main");
target.searchParams.set("commit", "bc03cd3f1d566c94f961c47cce9cd4850a39be29");
target.searchParams.set("path", "packages/2d/showcase/document");
target.searchParams.set("surface", "document");
target.searchParams.set("theme", "light");
target.searchParams.set("smoke", String(Date.now()));

// Keep this exact value paired with the immutable Hodos commit above. The
// smoke test verifies the published commit-pinned document before editing it.
const originalText = "Edit this sentence. Stable text identity survives each canonical update.";
const suffix = "XYZ";
let browser = null;
let page = null;
const pageErrors = [];
const failedRequests = [];

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1000, height: 800 },
    reducedMotion: "reduce",
  });
  page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()} · ${request.failure()?.errorText || "failed"}`);
  });

  const response = await page.goto(target.href, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  assert.ok(response, "the deployed Document Showcase returned no navigation response");
  assert.ok(response.ok(), `the deployed Document Showcase returned HTTP ${response.status()}`);

  await page.locator('html[data-presentation="showcase"][data-showcase-status="ready"]')
    .waitFor({ state: "attached", timeout: 45_000 });
  await page.locator('.hodos-2d-document-host[data-hodos-component="hodos.2d/document"]')
    .waitFor({ state: "visible", timeout: 30_000 });

  const text = page.locator('[data-text-id="text/intro"]');
  await text.waitFor({ state: "visible", timeout: 15_000 });
  assert.equal((await text.textContent())?.trim(), originalText);

  await text.evaluate((element) => {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });

  await page.keyboard.type(suffix, { delay: 35 });
  await page.waitForFunction(
    ({ expected }) => document.querySelector('[data-text-id="text/intro"]')?.textContent === expected,
    { expected: `${originalText}${suffix}` },
    { timeout: 10_000 },
  );

  const result = await text.evaluate((element) => ({
    text: element.textContent,
    active: document.activeElement === element,
    revision: document.querySelector(".hodos-2d-document-toolbar")?.textContent || "",
  }));
  assert.equal(result.text, `${originalText}${suffix}`);
  assert.equal(result.active, true, "the deployed Workspace lost the active Document text node");
  assert.match(result.revision, /revision 3/);
  assert.deepEqual(pageErrors, [], `deployed Document page errors:\n${pageErrors.join("\n")}`);

  console.log(JSON.stringify({
    url: target.href,
    text: result.text,
    active: result.active,
    revision: result.revision.trim(),
    failedRequests,
  }, null, 2));
  console.log("Verified three-character editing in the public commit-pinned Hodos Document Showcase.");
} catch (error) {
  const state = page && !page.isClosed()
    ? await page.evaluate(() => ({
        title: document.title,
        showcaseStatus: document.documentElement.dataset.showcaseStatus || "",
        bodyTail: (document.body?.innerText || "").slice(-1_500),
        activeTextId: document.activeElement?.dataset?.textId || "",
      })).catch((captureError) => ({ captureError: captureError?.message || String(captureError) }))
    : null;
  const failure = {
    original: (error?.stack || error?.message || String(error)).slice(0, 1_500),
    state,
    pageErrors: pageErrors.slice(-6),
    failedRequests: failedRequests.slice(-6),
  };
  const marker = `HODOS_DOCUMENT_SHOWCASE_STATE ${JSON.stringify(failure)}`;
  const annotation = marker
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  console.error(`::error title=Hodos Document Showcase::${annotation}`);
  console.error(marker);
  throw new Error("Public Hodos Document Showcase editing failed; see the check annotation.");
} finally {
  await browser?.close().catch(() => {});
}
