#!/usr/bin/env node
import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const checkouts = [
  {
    path: "vendor/hara-ui",
    marker: "vendor/hara-ui/packages/web-runtime/src/client.js",
    label: "pinned hara-lang/hara-ui packages",
  },
  {
    path: "vendor/hodos",
    marker: "vendor/hodos/packages/dev-ui/src/index.js",
    label: "pinned greenways-ai/hodos Workspace packages",
  },
];

async function present(relative) {
  try {
    await access(resolve(root, relative));
    return true;
  } catch {
    return false;
  }
}

const missing = [];
for (const checkout of checkouts) {
  if (!await present(checkout.marker)) missing.push(checkout);
}

if (missing.length) {
  const update = spawnSync(
    "git",
    ["submodule", "update", "--init", "--recursive", ...missing.map(({ path }) => path)],
    { cwd: root, stdio: "inherit" },
  );
  if (update.status !== 0) {
    throw new Error(`Unable to initialise ${missing.map(({ label }) => label).join(" and ")}`);
  }
}

for (const checkout of checkouts) {
  if (!await present(checkout.marker)) {
    throw new Error(`${checkout.label} does not contain the required browser package source`);
  }
}
