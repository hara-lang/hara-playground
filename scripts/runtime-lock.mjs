#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_RUNTIME_REQUIRED = Object.freeze([
  "rust/hara.wasm",
  "rust/hta.js",
  "rust/hta-worker.js",
  "rust/hta-shared-worker.js",
  "rust/host/broker.js",
  "rust/host/services.js"
]);

export const SUPERSONIC_RUNTIME_REQUIRED = Object.freeze([
  "rust/studio/supersonic.js",
  "rust/studio/hal/supersonic.hal"
]);

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/i;

export function normalizeRuntimeLock(value, { defaultRequired = DEFAULT_RUNTIME_REQUIRED } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("runtime lock must be an object");
  }

  const version = String(value.version ?? "").trim();
  if (!VERSION_PATTERN.test(version)) throw new Error(`runtime lock version is invalid: ${version || "missing"}`);

  const url = String(value.url ?? "").trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`runtime lock URL is invalid: ${url || "missing"}`);
  }
  if (parsedUrl.protocol !== "https:") throw new Error("runtime lock URL must use https");

  const sha256 = String(value.sha256 ?? "").trim().toLowerCase();
  if (!CHECKSUM_PATTERN.test(sha256)) throw new Error("runtime lock sha256 must contain 64 hexadecimal characters");

  const sourceRequired = value.required == null ? defaultRequired : value.required;
  if (!Array.isArray(sourceRequired) || sourceRequired.length === 0) {
    throw new Error("runtime lock required paths must be a non-empty array");
  }
  const required = [];
  const seen = new Set();
  for (const candidate of sourceRequired) {
    const path = normalizeArchivePath(candidate);
    if (seen.has(path)) throw new Error(`runtime lock required path is duplicated: ${path}`);
    seen.add(path);
    required.push(path);
  }

  return Object.freeze({
    version,
    url: parsedUrl.href,
    sha256,
    required: Object.freeze(required)
  });
}

export async function readRuntimeLock(path) {
  let value;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`unable to read runtime lock ${path}: ${error.message}`, { cause: error });
  }
  return normalizeRuntimeLock(value);
}

export function parseChecksum(text) {
  const line = String(text ?? "")
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find(Boolean);
  const checksum = line?.split(/\s+/)[0]?.replace(/^\\/, "").toLowerCase() || "";
  if (!CHECKSUM_PATTERN.test(checksum)) throw new Error("runtime checksum file does not begin with a SHA-256 digest");
  return checksum;
}

export function formatRuntimeLock(value) {
  const lock = normalizeRuntimeLock(value);
  return `${JSON.stringify(lock, null, 2)}\n`;
}

function normalizeArchivePath(value) {
  if (typeof value !== "string") throw new Error("runtime lock required paths must be strings");
  const path = value.trim().replace(/^\.\//, "");
  if (!path || path.includes("\0") || path.includes("\\") || path.startsWith("/")) {
    throw new Error(`runtime lock required path is invalid: ${value}`);
  }
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`runtime lock required path is unsafe: ${value}`);
  }
  return parts.join("/");
}

async function main(argv) {
  const [command, ...args] = argv;
  if (command === "validate") {
    const lock = await readRuntimeLock(resolveRequired(args[0], "lock path"));
    process.stdout.write(formatRuntimeLock(lock));
    return;
  }
  if (command === "paths") {
    const lock = await readRuntimeLock(resolveRequired(args[0], "lock path"));
    process.stdout.write(`${lock.required.join("\n")}\n`);
    return;
  }
  if (command === "checksum") {
    process.stdout.write(`${parseChecksum(await readFile(resolveRequired(args[0], "checksum path"), "utf8"))}\n`);
    return;
  }
  if (command === "create") {
    const [version, url, checksumPath, outputPath, ...flags] = args;
    if (!version || !url || !checksumPath || !outputPath) usage();
    const required = flags.includes("--supersonic")
      ? [...DEFAULT_RUNTIME_REQUIRED, ...SUPERSONIC_RUNTIME_REQUIRED]
      : [...DEFAULT_RUNTIME_REQUIRED];
    const lock = normalizeRuntimeLock({
      version,
      url,
      sha256: parseChecksum(await readFile(resolve(checksumPath), "utf8")),
      required
    });
    await writeFile(resolve(outputPath), formatRuntimeLock(lock));
    process.stdout.write(`Wrote runtime lock ${resolve(outputPath)} for ${lock.version}\n`);
    return;
  }
  usage();
}

function resolveRequired(value, label) {
  if (!value) throw new Error(`missing ${label}`);
  return resolve(value);
}

function usage() {
  throw new Error(
    "usage: runtime-lock.mjs validate LOCK | paths LOCK | checksum FILE | " +
    "create VERSION URL CHECKSUM_FILE OUTPUT [--supersonic]"
  );
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
