import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("../src/bootstrap.js", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/provider/entry.js", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../src/provider/alumbra.js", import.meta.url), "utf8");
const card = readFileSync(new URL("../src/provider/card.js", import.meta.url), "utf8");

test("routes provider URLs before starting the ordinary Playground editor", () => {
  assert.match(page, /src="\.\/src\/bootstrap\.js"/);
  assert.doesNotMatch(page, /src="\.\/src\/main\.js"/);
  const providerCheck = bootstrap.indexOf('query.get("provider")');
  const providerImport = bootstrap.indexOf('import("./provider/entry.js")');
  const editorImport = bootstrap.indexOf('import("./main.js")');
  assert.ok(providerCheck >= 0 && providerImport > providerCheck && editorImport > providerImport);
});

test("pins the Hodos source and provider-host modules in the browser import map", () => {
  assert.match(page, /"@greenways\/hodos-core": "\.\/vendor\/hodos\/packages\/core\/src\/index\.js"/);
  assert.match(page, /"@greenways\/hodos-source-github": "\.\/vendor\/hodos\/packages\/source-github\/src\/index\.js"/);
  assert.match(page, /"@greenways\/hodos-viewer\/providers": "\.\/vendor\/hodos\/packages\/viewer\/src\/world-provider-host\.js"/);
  assert.match(page, /href="\.\/src\/provider\/provider\.css"/);
});

test("resolves the repository manifest before allocating the installed provider", () => {
  const resolution = entry.indexOf("await resolveWorldGraph");
  const launch = entry.indexOf("const launch = createWorldProviderLaunchIntent");
  const allocation = entry.indexOf("activeHost = createWorldProviderHost");
  assert.ok(resolution >= 0 && launch > resolution && allocation > launch);
  assert.match(entry, /graph\.project\.provider/);
  assert.match(entry, /graph\.project\.provider\.id !== requestedProvider/);
  assert.match(entry, /consumer: "hara-playground"/);
});

test("adds one provider-backed world card without importing Alumbra code", () => {
  assert.match(card, /dataset\.providerProject = "alumbra-hara\/peacock-ballroom"/);
  assert.match(card, /world", "https:\/\/github\.com\/greenways-ai\/alumbra"/);
  assert.match(card, /Open world/);
  assert.match(adapter, /https:\/\/greenways-ai\.github\.io/);
  assert.doesNotMatch(entry, /@greenways\/alumbra/);
  assert.doesNotMatch(adapter, /@greenways\/alumbra/);
  assert.doesNotMatch(adapter, /mesh|shader|canonicalChunk|PlayCanvas/);
});
