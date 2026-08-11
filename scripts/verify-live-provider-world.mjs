#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.HARA_PLAYGROUND_URL || "https://playground.hara-lang.org/";
const target = new URL("provider.html", baseUrl);
target.searchParams.set("provider", "alumbra/world");
target.searchParams.set("world", "https://github.com/greenways-ai/alumbra");
target.searchParams.set("state", "ballroom/day");
target.searchParams.set("smoke", String(Date.now()));

let browser = null;
let page = null;
let crashed = false;
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];

try {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--use-angle=swiftshader",
    ],
  });
  const context = await browser.newContext({
    viewport: {width: 1440, height: 960},
    reducedMotion: "reduce",
  });
  page = await context.newPage();

  page.on("crash", () => { crashed = true; });
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} · ${request.failure()?.errorText || "failed"}`,
    );
  });

  const response = await page.goto(target.href, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  assert.ok(response, "the deployed provider application returned no navigation response");
  assert.ok(response.ok(), `the deployed provider application returned HTTP ${response.status()}`);

  await page.locator('html[data-playground-provider-ready="true"]').waitFor({
    state: "attached",
    timeout: 90_000,
  });

  const outer = await page.evaluate(() => {
    const iframe = document.querySelector(".playground-provider-frame");
    const evidence = window.__HARA_PLAYGROUND_PROVIDER_WORLD__;
    return {
      title: document.title,
      ready: document.documentElement.dataset.playgroundProviderReady || "",
      providerId: document.documentElement.dataset.playgroundProviderId || "",
      activityId: document.documentElement.dataset.playgroundProviderActivity || "",
      state: document.documentElement.dataset.playgroundProviderState || "",
      allocations: document.documentElement.dataset.playgroundProviderAllocations || "",
      status: document.querySelector("[data-provider-world-status]")?.textContent?.trim() || "",
      iframeSrc: iframe?.src || "",
      graph: evidence?.graph || null,
      launch: evidence?.launch || null,
    };
  });

  assert.equal(outer.ready, "true");
  assert.equal(outer.providerId, "alumbra/world");
  assert.equal(outer.activityId, "alumbra-hara/peacock-ballroom");
  assert.equal(outer.state, "ballroom/day");
  assert.equal(outer.allocations, "1");
  assert.equal(outer.graph?.repository, "https://github.com/greenways-ai/alumbra");
  assert.equal(outer.graph?.projectId, "alumbra-hara/peacock-ballroom");
  assert.equal(outer.launch?.package, "hara:greenways/alumbra-peacock-ballroom@0.1.0");

  const providerUrl = new URL(outer.iframeSrc);
  assert.equal(providerUrl.protocol, "https:");
  assert.equal(providerUrl.origin, "https://oss.greenways.ai");
  assert.equal(providerUrl.pathname, "/hodos/alumbra/apps/lab/peacock-ballroom.html");
  assert.equal(providerUrl.searchParams.get("state"), "ballroom/day");
  assert.equal(providerUrl.searchParams.get("embed"), "playground");

  const providerFrame = page.frameLocator(".playground-provider-frame");
  await providerFrame.locator('body[data-peacock-ballroom-ready="true"]').waitFor({
    state: "attached",
    timeout: 120_000,
  });

  const inner = await providerFrame.locator("body").evaluate((body) => {
    const preview = window.__PEACOCK_BALLROOM_PREVIEW__;
    return {
      title: document.title,
      ready: body.dataset.peacockBallroomReady || "",
      error: body.dataset.peacockBallroomError || "",
      pageError: document.documentElement.dataset.peacockBallroomPageError || "false",
      state: body.dataset.peacockBallroomState || "",
      chunks: body.dataset.peacockBallroomChunks || "",
      lighting: body.dataset.peacockBallroomLighting || "",
      landmarks: body.dataset.peacockBallroomLandmarks || "",
      disposal: body.dataset.peacockBallroomDisposal || "",
      canvas: Boolean(document.querySelector("#peacock-ballroom-canvas")),
      status: document.querySelector("[data-ballroom-status]")?.textContent?.trim() || "",
      snapshotStatus: preview?.status || "",
      snapshotState: preview?.activeState || "",
      snapshotChunks: preview?.scenario?.world?.chunkCount ?? null,
    };
  });

  assert.equal(inner.title, "Peacock Ballroom · Alumbra");
  assert.equal(inner.ready, "true");
  assert.equal(inner.error, "false");
  assert.equal(inner.pageError, "false");
  assert.equal(inner.state, "ballroom/day");
  assert.equal(inner.chunks, "48");
  assert.equal(inner.lighting, "passed");
  assert.equal(inner.landmarks, "passed");
  assert.equal(inner.disposal, "passed");
  assert.equal(inner.canvas, true);
  assert.equal(inner.snapshotStatus, "ready");
  assert.equal(inner.snapshotState, "ballroom/day");
  assert.equal(inner.snapshotChunks, 48);

  assert.equal(crashed, false, "Chromium reported that the deployed provider world crashed");
  assert.deepEqual(pageErrors, [], `deployed provider page errors:\n${pageErrors.join("\n")}`);
  assert.deepEqual(consoleErrors, [], `deployed provider console errors:\n${consoleErrors.join("\n")}`);

  console.log(JSON.stringify({
    url: target.href,
    outer,
    providerUrl: providerUrl.href,
    inner,
    failedRequests,
  }, null, 2));
  console.log(
    "Verified the public Peacock Ballroom provider: repository resolution, installed Hodos host, 48-chunk Alumbra world, lighting and landmark evidence.",
  );
} catch (error) {
  let outerState = null;
  let innerState = null;
  if (page && !page.isClosed()) {
    outerState = await page.evaluate(() => ({
      title: document.title,
      dataset: {...document.documentElement.dataset},
      status: document.querySelector("[data-provider-world-status]")?.textContent?.trim() || "",
      error: document.querySelector(".playground-provider-error")?.textContent?.trim() || "",
      iframeSrc: document.querySelector(".playground-provider-frame")?.src || "",
      bodyTail: (document.body?.innerText || "").slice(-1_500),
    })).catch((stateError) => ({captureError: stateError?.message || String(stateError)}));

    const providerFrame = page.frames().find((frame) =>
      frame.url().includes("/hodos/alumbra/apps/lab/peacock-ballroom.html"));
    if (providerFrame) {
      innerState = await providerFrame.evaluate(() => ({
        title: document.title,
        htmlDataset: {...document.documentElement.dataset},
        bodyDataset: {...(document.body?.dataset || {})},
        status: document.querySelector("[data-ballroom-status]")?.textContent?.trim() || "",
        bodyTail: (document.body?.innerText || "").slice(-1_500),
      })).catch((stateError) => ({captureError: stateError?.message || String(stateError)}));
    }
  }

  const failure = {
    original: (error?.stack || error?.message || String(error)).slice(0, 1_500),
    outerState,
    innerState,
    pageErrors: pageErrors.slice(-6).map((entry) => entry.slice(0, 500)),
    consoleErrors: consoleErrors.slice(-6).map((entry) => entry.slice(0, 500)),
    failedRequests: failedRequests.slice(-8).map((entry) => entry.slice(0, 500)),
    crashed,
  };
  const marker = `PEACOCK_PROVIDER_STATE ${JSON.stringify(failure)}`;
  const annotation = marker
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  console.error(`::error title=Public Peacock Ballroom provider::${annotation}`);
  console.error(marker);
  throw new Error("Public Peacock Ballroom provider smoke failed; see the check annotation.");
} finally {
  await browser?.close().catch(() => {});
}
