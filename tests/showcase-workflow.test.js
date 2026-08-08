import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Showcase browser CI is read-only and exercises the embedded immutable host", async () => {
  const workflow = await readFile(".github/workflows/showcase-browser.yml", "utf8");
  const runner = await readFile("scripts/verify-showcase-project-open.mjs", "utf8");
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /playwright@1\.53\.2/);
  assert.match(workflow, /npm run runtime:download/);
  assert.match(workflow, /verify-showcase-project-open\.mjs/);
  assert.match(runner, /presentation", "showcase"/);
  assert.match(runner, /commit", commit/);
  assert.match(runner, /hara\.showcase\/select-surface/);
  assert.match(runner, /surfaceId: "not-declared"/);
  assert.doesNotMatch(runner, /\.test\.(?:js|mjs)/);
});
