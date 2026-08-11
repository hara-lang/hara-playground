#!/usr/bin/env node
import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const checkouts = [
  {
    path: "vendor/hara-ui",
    markers: ["vendor/hara-ui/packages/web-runtime/src/client.js"],
    label: "pinned hara-lang/hara-ui packages",
  },
  {
    path: "vendor/hodos",
    markers: [
      "vendor/hodos/packages/dev/src/index.js",
      "vendor/hodos/packages/dev-ui/src/index.js",
      "vendor/hodos/packages/dev-ui/src/execution.css",
      "vendor/hodos/packages/source-github/src/world-provider.js",
      "vendor/hodos/packages/viewer/src/world-provider-host.js",
    ],
    label: "pinned greenways-ai/hodos Workspace, Execution and world-provider packages",
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

async function missingMarkers(checkout) {
  const missing = [];
  for (const marker of checkout.markers) {
    if (!await present(marker)) missing.push(marker);
  }
  return missing;
}

const missing = [];
for (const checkout of checkouts) {
  if ((await missingMarkers(checkout)).length) missing.push(checkout);
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
  const absent = await missingMarkers(checkout);
  if (absent.length) {
    throw new Error(`${checkout.label} is missing required package files: ${absent.join(", ")}`);
  }
}
