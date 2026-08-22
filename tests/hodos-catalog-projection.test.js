import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const host = fs.readFileSync(new URL("../src/hodos/catalog.js", import.meta.url), "utf8");

function section(start, end) {
  const from = host.indexOf(start);
  const to = host.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing ${start}`);
  assert.notEqual(to, -1, `missing ${end}`);
  return host.slice(from, to);
}

test("Catalog projects descriptive tool and activity records without executable fields", () => {
  const toolProjection = section("const projectedToolsets", "const projectedActivities");
  const activityProjection = section("const projectedActivities", "let toolsAreaHost");
  const runProjection = section("function catalogRunFromPlay", "export function catalogAreaFromPlay");

  assert.match(toolProjection, /id: tool\.id/);
  assert.match(toolProjection, /description: tool\.description/);
  assert.doesNotMatch(toolProjection, /\bsnippet\s*:/);

  assert.match(activityProjection, /instructions:/);
  assert.match(activityProjection, /checkCount:/);
  assert.doesNotMatch(activityProjection, /\bsource\s*:/);
  assert.doesNotMatch(activityProjection, /\bchecks\s*:/);

  assert.match(runProjection, /status: check\.passed/);
  assert.doesNotMatch(runProjection, /\bexpression\s*:/);
  assert.doesNotMatch(runProjection, /\bexpr\s*:/);
});
