#!/usr/bin/env node
import { chromium } from "playwright";

const baseUrl = process.env.HARA_PLAYGROUND_URL || "https://playground.hara-lang.org/";
const target = new URL(baseUrl);
target.searchParams.set("repo", "hara-lang/hara-playground");
target.searchParams.set("branch", "main");
target.searchParams.set("path", "samples/supersonic-live");
target.searchParams.set("diagnostic", String(Date.now()));

const consoleMessages = [];
const pageErrors = [];
const failedRequests = [];
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on("console", (message) => consoleMessages.push({ type: message.type(), text: message.text() }));
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  page.on("requestfailed", (request) => failedRequests.push({
    url: request.url(),
    method: request.method(),
    resourceType: request.resourceType(),
    error: request.failure()?.errorText || "failed"
  }));

  const response = await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForSelector("#editor", { state: "visible", timeout: 45_000 });
  await page.waitForTimeout(12_000);
  await page.click('[data-output-tab="audio"]').catch(() => {});
  await page.waitForTimeout(2_000);

  const state = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    editorPath: document.querySelector(".editor-meta span")?.textContent?.trim() || "",
    editorHasSample: document.querySelector("#editor")?.value.includes("playground/supersonic-live") || false,
    kernel: document.querySelector(".kernel-state")?.textContent?.trim() || "",
    statusbar: document.querySelector(".statusbar")?.innerText?.trim() || "",
    audioText: document.querySelector(".audio-view")?.innerText?.trim() || "",
    audioHtml: document.querySelector(".audio-view")?.innerHTML || "",
    hasPlay: Boolean(document.querySelector("#audio-play-button")),
    repl: [...document.querySelectorAll(".repl-line")].map((node) => ({
      className: node.className,
      text: node.textContent?.trim() || ""
    })),
    alerts: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent?.trim() || ""),
    selectedOutputTabs: [...document.querySelectorAll(".output-tab.active")].map((node) => node.textContent?.trim() || "")
  }));

  console.log(JSON.stringify({
    navigationStatus: response?.status() || null,
    state,
    consoleMessages,
    pageErrors,
    failedRequests
  }, null, 2));

  if (state.hasPlay) process.exitCode = 0;
  else process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
