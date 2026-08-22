#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { validateSampleCatalog } from "./sample-validation/catalog.mjs";
import {
  assertRuntimeExpectation,
  buildRuntimeReport,
} from "./sample-validation/runtime.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = outputPath(process.argv.slice(2));
const catalog = JSON.parse(await readFile(resolve(root, "samples/catalog.json"), "utf8"));
const catalogReport = await validateSampleCatalog(root);
assert.equal(catalogReport.samples.length, catalog.samples.length);

let browser = null;
let server = null;
try {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/__sample-runtime.html") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        response.end(harnessDocument());
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

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${address.port}/__sample-runtime.html`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  try {
    await page.waitForFunction(
      () => globalThis.__haraSampleRuntimeReady === true
        || typeof globalThis.__haraSampleRuntimeError === "string",
      null,
      { timeout: 60_000 },
    );
  } catch (error) {
    const bootError = await page.evaluate(() => globalThis.__haraSampleRuntimeError ?? null);
    throw new Error([
      `Canonical runtime harness did not boot: ${error.message}`,
      bootError ? `boot error: ${bootError}` : null,
      ...pageErrors.map((value) => `page error: ${value}`),
      ...consoleErrors.map((value) => `console error: ${value}`),
    ].filter(Boolean).join("\n"));
  }

  const bootError = await page.evaluate(() => globalThis.__haraSampleRuntimeError ?? null);
  if (bootError) {
    throw new Error([
      `Canonical runtime harness failed to boot: ${bootError}`,
      ...pageErrors.map((value) => `page error: ${value}`),
      ...consoleErrors.map((value) => `console error: ${value}`),
    ].join("\n"));
  }

  const results = [];
  for (const sample of catalog.samples) {
    const source = await readFile(resolve(root, sample.path, sample.source), "utf8");
    const execution = await page.evaluate(
      async (request) => globalThis.__haraSampleRuntime.run(request),
      {
        id: sample.id,
        source,
        namespace: sample.mainNamespace,
        smokeForm: sample.runtimeValidation.smokeForm,
      },
    );
    assert.equal(execution.namespace, sample.mainNamespace, `${sample.id}: namespace`);
    assertRuntimeExpectation(
      sample.runtimeValidation.expected,
      execution.actual,
      `${sample.id}: deterministic runtime smoke`,
    );
    results.push({ id: sample.id, actual: execution.actual });
  }

  assert.deepEqual(pageErrors, [], `browser runtime errors:\n${pageErrors.join("\n")}`);
  assert.deepEqual(consoleErrors, [], `browser console errors:\n${consoleErrors.join("\n")}`);
  const report = buildRuntimeReport(catalog, results);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Validated ${results.length} sample projects against Hara runtime ${catalog.runtime.version}.`);
  console.log(`Wrote ${output}`);
} finally {
  await browser?.close().catch(() => {});
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

function outputPath(args) {
  const index = args.indexOf("--output");
  if (index === -1 || !args[index + 1]) {
    return resolve(root, "generated/sample-runtime-report.json");
  }
  return resolve(root, args[index + 1]);
}

function harnessDocument() {
  return `<!doctype html>
<meta charset="utf-8">
<title>Hara sample runtime validation</title>
<script type="module">
  try {
    const [canonicalModule, supersonicModule] = await Promise.all([
      import("/src/runtime/canonical.js"),
      import("/src/audio/supersonic-provider.js"),
    ]);
    const diagnostics = [];
    const supersonic = new supersonicModule.SupersonicProvider();
    const runtime = await canonicalModule.createCanonicalRuntime({
      runtimeRoot: new URL("/runtime/", location.href),
      capabilities: ["studio/eval", "audio/playback", "model/generate"],
      grantedCapabilities: ["studio/eval", "audio/playback", "model/generate"],
      supersonic,
      ai: {
        status: async () => ({ available: false, reason: "validation-provider-deferred" }),
        generate: async () => { throw new Error("model/generate is deferred during sample validation"); },
      },
      onDiagnostic: (message) => diagnostics.push(String(message)),
    });

    function normalize(value) {
      if (value instanceof Map) {
        return Object.fromEntries([...value].map(([key, item]) => [
          String(key?.name ?? key).replace(/^:/, ""),
          normalize(item),
        ]));
      }
      if (Array.isArray(value)) return value.map(normalize);
      if (value && typeof value === "object") {
        if (typeof value.name === "string" && Object.keys(value).length <= 2) {
          return value.name;
        }
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
      }
      return value;
    }

    globalThis.__haraSampleRuntime = {
      async run({ source, namespace, smokeForm }) {
        await runtime.reset();
        await runtime.evaluateSource(source, "user");
        const actual = normalize(await runtime.evaluateSource(smokeForm, namespace));
        return {
          namespace: runtime.currentNamespace,
          actual,
          diagnostics: [...diagnostics],
        };
      },
    };
    globalThis.__haraSampleRuntimeReady = true;
  } catch (error) {
    globalThis.__haraSampleRuntimeError = error?.stack || error?.message || String(error);
  }
</script>`;
}

function safeTarget(pathname) {
  const decoded = decodeURIComponent(pathname);
  const parts = decoded.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === ".." || part.includes("\\") || part.includes("\0"))) {
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
    ".css": "text/css; charset=utf-8",
    ".edn": "text/plain; charset=utf-8",
    ".hal": "text/plain; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
  })[extname(path)] || "application/octet-stream";
}
