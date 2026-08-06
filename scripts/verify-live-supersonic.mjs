#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.HARA_PLAYGROUND_URL || "https://playground.hara-lang.org/";
const target = new URL(baseUrl);
target.searchParams.set("repo", "hara-lang/hara-playground");
target.searchParams.set("branch", "main");
target.searchParams.set("path", "samples/supersonic-live");
target.searchParams.set("smoke", String(Date.now()));

let browser = null;
let page = null;
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
let crashed = false;

try {
  browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=user-gesture-required"]
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    reducedMotion: "reduce"
  });
  page = await context.newPage();

  page.on("crash", () => { crashed = true; });
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()} · ${request.failure()?.errorText || "failed"}`);
  });

  const response = await page.goto(target.href, {
    waitUntil: "domcontentloaded",
    timeout: 45_000
  });
  assert.ok(response, "the deployed Playground returned no navigation response");
  assert.ok(response.ok(), `the deployed Playground returned HTTP ${response.status()}`);

  await page.waitForSelector("#editor", { state: "visible", timeout: 45_000 });
  await page.waitForFunction(() =>
    document.querySelector("#editor")?.value.includes("playground/supersonic-live"),
  null,
  { timeout: 45_000 });

  await page.waitForSelector('[data-output-tab="audio"]', {
    state: "visible",
    timeout: 15_000
  });
  await page.click('[data-output-tab="audio"]');
  await page.waitForFunction(() =>
    document.querySelector(".audio-view")?.classList.contains("active"),
  null,
  { timeout: 10_000 });

  // A real Play button means the canonical runtime loaded the HAL namespace,
  // evaluated the sample, crossed the worker/page host bridge, and published
  // a graph snapshot. A merely mounted Audio tab is not sufficient.
  await page.waitForSelector("#audio-play-button", {
    state: "visible",
    timeout: 30_000
  });
  const graphBefore = await page.evaluate(() => ({
    heading: document.querySelector(".audio-console h2")?.textContent?.trim() || "",
    status: document.querySelector(".audio-status")?.textContent?.trim() || "",
    revision: document.querySelector(".audio-console__header p")?.textContent?.trim() || "",
    error: document.querySelector(".audio-error")?.textContent?.trim() || "",
    runtime: document.querySelector(".kernel-state")?.textContent?.trim() || ""
  }));
  assert.equal(graphBefore.heading, "Glass Signal", "the deployed sample did not publish its graph");
  assert.equal(graphBefore.error, "", graphBefore.error || "the Audio surface reported an error");

  await page.click("#audio-play-button");
  await page.waitForFunction(() =>
    document.querySelector(".audio-status")?.textContent?.trim().toLowerCase() === "playing",
  null,
  { timeout: 15_000 });

  // Prove that the page remains schedulable while audio is running.
  const heartbeat = await page.evaluate(() => new Promise((resolveHeartbeat) => {
    let frames = 0;
    const tick = () => {
      frames += 1;
      if (frames < 4) requestAnimationFrame(tick);
      else setTimeout(() => resolveHeartbeat({ frames, finished: true }), 100);
    };
    requestAnimationFrame(tick);
  }));
  assert.deepEqual(heartbeat, { frames: 4, finished: true });

  const tempo = page.locator(
    'input[data-audio-node="transport"][data-audio-parameter="tempo"]'
  );
  await tempo.waitFor({ state: "visible", timeout: 10_000 });
  const revisionBefore = graphBefore.revision;
  await tempo.evaluate((element) => {
    element.value = "138";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction((previousRevision) => {
    const current = document.querySelector(".audio-console__header p")?.textContent?.trim() || "";
    return current && current !== previousRevision;
  }, revisionBefore, { timeout: 10_000 });
  assert.equal(await tempo.inputValue(), "138");
  assert.equal(
    (await page.locator(".audio-status").textContent())?.trim().toLowerCase(),
    "playing",
    "a live tempo edit stopped playback"
  );

  await page.click("#audio-stop-button");
  await page.waitForFunction(() =>
    document.querySelector(".audio-status")?.textContent?.trim().toLowerCase() === "stopped",
  null,
  { timeout: 10_000 });

  assert.equal(crashed, false, "Chromium reported that the deployed Playground crashed");
  assert.deepEqual(pageErrors, [], `deployed page errors:\n${pageErrors.join("\n")}`);
  assert.deepEqual(consoleErrors, [], `deployed console errors:\n${consoleErrors.join("\n")}`);

  console.log(JSON.stringify({
    url: target.href,
    graph: graphBefore.heading,
    initialStatus: graphBefore.status,
    runtime: graphBefore.runtime,
    tempo: await tempo.inputValue(),
    finalStatus: (await page.locator(".audio-status").textContent())?.trim(),
    failedRequests
  }, null, 2));
  console.log("Verified the public Supersonic project: import, graph start, Play, live tempo edit, and Stop.");
} catch (error) {
  let playgroundState = null;
  if (page && !page.isClosed()) {
    playgroundState = await page.evaluate(() => {
      const text = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
      const entries = [...document.querySelectorAll(
        ".repl-entry, .repl-row, .repl-line, .diagnostic, .console-entry"
      )]
        .map((element) => element.textContent?.trim() || "")
        .filter(Boolean)
        .slice(-8)
        .map((entry) => entry.slice(0, 500));
      const body = document.body?.innerText?.trim() || "";
      return {
        title: document.title,
        runtime: text(".kernel-state").slice(0, 500),
        statusbar: text(".statusbar").slice(0, 500),
        audio: text(".audio-view").slice(0, 1_000),
        replEntries: entries,
        bodyTail: body.slice(-1_500)
      };
    }).catch((stateError) => ({ captureError: stateError?.message || String(stateError) }));
  }

  const failure = {
    original: (error?.stack || error?.message || String(error)).slice(0, 1_500),
    state: playgroundState,
    pageErrors: pageErrors.slice(-6).map((entry) => entry.slice(0, 500)),
    consoleErrors: consoleErrors.slice(-6).map((entry) => entry.slice(0, 500)),
    failedRequests: failedRequests.slice(-6).map((entry) => entry.slice(0, 500)),
    crashed
  };
  const marker = `CANONICAL_BOOT_STATE ${JSON.stringify(failure)}`;
  console.error(marker);
  throw new Error(marker);
} finally {
  await browser?.close().catch(() => {});
}
