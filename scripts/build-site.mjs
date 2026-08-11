#!/usr/bin/env node
import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, process.env.OUT_DIR || "dist");

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function copyIfPresent(source, destination) {
  const from = resolve(root, source);
  if (!await exists(from)) return false;
  await cp(from, resolve(output, destination), { recursive: true, force: true });
  return true;
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, "index.html"), resolve(output, "index.html"));
await cp(resolve(root, "provider.html"), resolve(output, "provider.html"));
await cp(resolve(root, "src"), resolve(output, "src"), { recursive: true });
await copyIfPresent("public/og-hara-playground.jpg", "og-hara-playground.jpg");

// Keep the proven editor/Showcase Hodos pin separate from the newer provider
// runtime. Advancing the whole editor stack would couple provider delivery to
// unrelated Hodos package evolution.
await copyIfPresent("vendor/hara-ui/packages", "vendor/hara-ui/packages");
const hodosPackagesCopied = await copyIfPresent("vendor/hodos/packages", "vendor/hodos/packages");
if (!hodosPackagesCopied) {
  throw new Error("The pinned Hodos editor package tree is required for the static Playground build");
}
const providerPackagesCopied = await copyIfPresent(
  "vendor/hodos-provider/packages",
  "vendor/hodos-provider/packages",
);
if (!providerPackagesCopied) {
  throw new Error("The pinned Hodos provider package tree is required for the static Playground build");
}
const executionStyles = resolve(output, "vendor/hodos/packages/dev-ui/src/execution.css");
if (!await exists(executionStyles)) {
  throw new Error("The pinned Hodos editor build is missing packages/dev-ui/src/execution.css");
}
const providerHost = resolve(output, "vendor/hodos-provider/packages/viewer/src/world-provider-host.js");
if (!await exists(providerHost)) {
  throw new Error("The pinned Hodos provider build is missing the world-provider host");
}

// Source examples make local builds useful. A downloaded canonical runtime may
// then overlay this directory with the richer Starter/Game/Music catalog.
await copyIfPresent("examples", "examples");
await copyIfPresent("runtime/rust", "runtime/rust");
await copyIfPresent("runtime/examples", "examples");
await copyIfPresent("runtime/assets", "assets");
await copyIfPresent("runtime.lock.json", "runtime.lock.json");

if (process.env.HARA_PLAYGROUND_DOMAIN !== "") {
  await writeFile(resolve(output, "CNAME"), `${process.env.HARA_PLAYGROUND_DOMAIN || "playground.hara-lang.org"}\n`);
}

console.log(`Built static Hara Playground site at ${output}`);
