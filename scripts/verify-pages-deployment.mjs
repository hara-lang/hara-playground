#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const EXACT_DEPLOYMENT_PATHS = Object.freeze([
  "index.html",
  "runtime.lock.json",
  "src/main.js",
  "src/app/workspace-layout.js",
  "src/audio/gw.audio.supersonic.hal",
  "src/audio/host.js",
  "src/audio/integration.js",
  "src/audio/supersonic-provider.js",
  "src/audio/web-audio-engine.js",
  "src/studio/projects.js",
  "src/styles/mobile-audio.css"
]);

export const DEPLOYMENT_PROBES = Object.freeze([
  Object.freeze({
    path: "runtime/rust/hara.wasm",
    validate(bytes) {
      if (bytes.length < 10_000) return `WASM payload is unexpectedly small: ${bytes.length} bytes`;
      if (bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
        return "runtime/rust/hara.wasm does not begin with the WebAssembly magic header";
      }
      return null;
    }
  }),
  Object.freeze({
    path: "runtime/rust/host/services.js",
    validate(bytes) {
      const source = new TextDecoder().decode(bytes);
      return source.includes('"gw.audio.supersonic/start"')
        ? null
        : "runtime host services do not expose gw.audio.supersonic/start";
    }
  })
]);

export async function verifyPagesDeployment({
  baseUrl,
  commit = "unknown",
  repositoryRoot = root,
  exactPaths = EXACT_DEPLOYMENT_PATHS,
  probes = DEPLOYMENT_PROBES,
  fetchImpl = globalThis.fetch,
  attempts = 36,
  delayMs = 5_000,
  sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
  requestTimeoutMs = 15_000,
  onAttempt = null
} = {}) {
  if (!baseUrl) throw new Error("HARA_PLAYGROUND_URL or a base URL argument is required");
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error("attempts must be a positive integer");

  const base = normalizeBaseUrl(baseUrl);
  const expected = new Map();
  for (const path of exactPaths) {
    expected.set(path, new Uint8Array(await readFile(resolve(repositoryRoot, path))));
  }

  let lastFailures = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastFailures = await inspectDeployment({
      base,
      commit,
      expected,
      probes,
      fetchImpl,
      requestTimeoutMs
    });
    onAttempt?.({ attempt, attempts, failures: [...lastFailures] });
    if (lastFailures.length === 0) {
      return {
        baseUrl: base.href,
        commit,
        attempts: attempt,
        exactAssets: expected.size,
        probes: probes.length
      };
    }
    if (attempt < attempts) await sleep(delayMs);
  }

  throw new Error([
    `Pages deployment at ${base.href} did not converge to ${commit} after ${attempts} attempts:`,
    ...lastFailures.map((failure) => `- ${failure}`)
  ].join("\n"));
}

export async function inspectDeployment({
  base,
  commit,
  expected,
  probes,
  fetchImpl,
  requestTimeoutMs
}) {
  const failures = [];

  for (const [path, expectedBytes] of expected) {
    try {
      const bytes = await fetchAsset({ base, path, commit, fetchImpl, requestTimeoutMs });
      const expectedDigest = sha256(expectedBytes);
      const actualDigest = sha256(bytes);
      if (actualDigest !== expectedDigest) {
        failures.push(`${path} digest ${actualDigest} does not match repository ${expectedDigest}`);
      }
    } catch (error) {
      failures.push(`${path}: ${error.message || error}`);
    }
  }

  for (const probe of probes) {
    try {
      const bytes = await fetchAsset({
        base,
        path: probe.path,
        commit,
        fetchImpl,
        requestTimeoutMs
      });
      const error = probe.validate(bytes);
      if (error) failures.push(`${probe.path}: ${error}`);
    } catch (error) {
      failures.push(`${probe.path}: ${error.message || error}`);
    }
  }

  return failures;
}

async function fetchAsset({ base, path, commit, fetchImpl, requestTimeoutMs }) {
  const url = new URL(path, base);
  url.searchParams.set("hara-deployment", commit);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache"
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`request timed out after ${requestTimeoutMs} ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value));
  if (url.protocol !== "https:") throw new Error("Pages deployment URL must use https");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.search = "";
  url.hash = "";
  return url;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const baseUrl = process.env.HARA_PLAYGROUND_URL || process.argv[2];
  const commit = process.env.HARA_PLAYGROUND_COMMIT || process.env.GITHUB_SHA || "manual";
  const report = await verifyPagesDeployment({
    baseUrl,
    commit,
    onAttempt({ attempt, attempts, failures }) {
      if (failures.length === 0) {
        console.log(`Pages deployment matched on attempt ${attempt}/${attempts}`);
      } else {
        console.log(`Pages deployment attempt ${attempt}/${attempts} has ${failures.length} mismatch(es)`);
        for (const failure of failures) console.log(`  ${failure}`);
      }
    }
  });
  console.log(
    `Verified ${report.exactAssets} exact assets and ${report.probes} runtime probes at ${report.baseUrl}`
  );
}

const invoked = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
