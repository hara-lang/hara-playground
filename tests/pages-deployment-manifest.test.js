import assert from "node:assert/strict";
import test from "node:test";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXACT_DEPLOYMENT_PATHS } from "../scripts/verify-pages-deployment.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

test("every exact Pages deployment asset exists in the prepared repository", async () => {
  assert.ok(
    EXACT_DEPLOYMENT_PATHS.includes("vendor/hodos/packages/workspace-ui/src/focus.js"),
    "the deployment smoke must verify the Hodos Workspace focus repair",
  );
  assert.ok(
    !EXACT_DEPLOYMENT_PATHS.includes("src/app/workspace-layout.js"),
    "removed pre-Hodos Workspace modules must not remain in the deployment manifest",
  );

  const missing = [];
  for (const path of EXACT_DEPLOYMENT_PATHS) {
    try {
      await access(resolve(root, path));
    } catch {
      missing.push(path);
    }
  }
  assert.deepEqual(missing, []);
});
