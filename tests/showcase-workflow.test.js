import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Showcase browser CI is read-only and exercises the embedded immutable host", async () => {
  const workflow = await readFile(".github/workflows/showcase-browser.yml", "utf8");
  const runner = await readFile("scripts/verify-showcase-project-open.mjs", "utf8");
  const host = await readFile("src/studio/showcase-host.js", "utf8");
  const worker = await readFile("src/runtime/worker.js", "utf8");

  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /HARA_RUNTIME_SOURCE_REF:\s*c3c345f0e0d18d499c39d82b8f4bcb98e4ebb4f6/);
  assert.match(workflow, /HARA_UI_SOURCE_REF:\s*145a9acc728f71f9aa215868a22774ea07d466d4/);
  assert.match(workflow, /repository:\s*hara-lang\/hara/);
  assert.match(workflow, /repository:\s*hara-lang\/hara-ui/);
  assert.match(workflow, /targets:\s*wasm32-unknown-unknown/);
  assert.match(workflow, /scripts\/build-studio-runtime ci/);
  assert.match(workflow, /sha256sum -c/);
  assert.doesNotMatch(workflow, /npm run runtime:download/);
  assert.match(workflow, /playwright@1\.53\.2/);
  assert.match(workflow, /verify-showcase-project-open\.mjs/);
  assert.match(workflow, /scripts\/showcase-fixture\.html/);
  assert.match(workflow, /src\/runtime\/worker\.js/);
  assert.match(workflow, /src\/studio\/provider-navigation\.js/);
  assert.match(runner, /presentation", "showcase"/);
  assert.match(runner, /commit", commit/);
  assert.match(runner, /hara\.showcase\/select-surface/);
  assert.match(runner, /surfaceId: "not-declared"/);
  assert.match(runner, /HARA_SHOWCASE_READY_TIMEOUT \|\| 45_000/);
  assert.match(runner, /SHOWCASE_BROWSER_STATE/);
  assert.match(runner, /consoleErrors/);
  assert.match(runner, /failedRequests/);
  assert.match(runner, /htmlDataset/);
  assert.doesNotMatch(runner, /\.test\.(?:js|mjs)/);
  assert.match(host, /syncShowcaseLocation\(state\.metadata, state\.presentation\)/);
  assert.match(host, /showcaseRuntimeStatus/);
  assert.match(host, /showcaseWorkspaceStatus/);

  const listener = worker.indexOf('self.addEventListener("message"');
  const canonicalHost = worker.indexOf("await createRuntimeHost");
  const ready = worker.indexOf("workerReady = true");
  const flush = worker.indexOf("pendingWorkerMessages.splice(0)");
  assert.ok(listener >= 0 && listener < canonicalHost, "the worker listener must exist before canonical host initialization");
  assert.ok(canonicalHost < ready && ready < flush, "queued requests must flush only after the runtime is fully initialized");
  assert.match(worker, /pendingWorkerMessages\.push\(event\.data\)/);
  assert.match(worker, /void dispatchWorkerMessage\(message\)/);
});
