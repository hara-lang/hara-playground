#!/usr/bin/env node
import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const marker = resolve(root, "vendor/hara-ui/packages/web-runtime/src/client.js");

try {
  await access(marker);
  process.exit(0);
} catch {
  // Materialise the commit-pinned package source below.
}

const update = spawnSync(
  "git",
  ["submodule", "update", "--init", "--recursive", "vendor/hara-ui"],
  { cwd: root, stdio: "inherit" }
);
if (update.status !== 0) {
  throw new Error("Unable to initialise the pinned hara-lang/hara-ui packages");
}

try {
  await access(marker);
} catch {
  throw new Error("Pinned Hara UI checkout does not contain @hara-lang/web-runtime");
}
