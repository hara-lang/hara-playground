import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const view = fs.readFileSync(new URL("../src/app/view.js", import.meta.url), "utf8");
const events = fs.readFileSync(new URL("../src/app/events.js", import.meta.url), "utf8");
const host = fs.readFileSync(new URL("../src/hodos/catalog.js", import.meta.url), "utf8");

test("Catalog visible mechanics route through Hodos areas", () => {
  assert.match(view, /data-hodos-catalog-tools/);
  assert.match(view, /data-hodos-catalog-activity/);
  assert.doesNotMatch(view, /function renderToolsetOptions/);
  assert.doesNotMatch(view, /function renderActivityPanel/);
  assert.doesNotMatch(events, /querySelector\("#toolset-select"\)/);
  assert.doesNotMatch(events, /querySelector\("#activity-select"\)/);
  assert.doesNotMatch(events, /querySelectorAll\("\.tool-chip"\)/);
  assert.match(events, /catalogWorkspacePatch/);
});

test("Catalog host renders safe descriptive projections only", () => {
  assert.match(host, /createCatalogArea/);
  assert.match(host, /registerHodosCatalogUi/);
  assert.match(host, /textContent/);
  assert.match(host, /replaceChildren/);
  assert.doesNotMatch(host, /innerHTML/);
  assert.doesNotMatch(host, /\.snippet/);
  assert.doesNotMatch(host, /activity\.source/);
  assert.doesNotMatch(host, /check\.expression/);
});
