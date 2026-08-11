import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const providerPage = readFileSync(new URL("../provider.html", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/provider/entry.js", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../src/provider/alumbra.js", import.meta.url), "utf8");
const card = readFileSync(new URL("../src/provider/card.js", import.meta.url), "utf8");
const build = readFileSync(new URL("../scripts/build-site.mjs", import.meta.url), "utf8");

test("preserves the ordinary editor and completely isolates embedded Showcase startup", () => {
  assert.match(page, /src="\.\/src\/main\.js"/);
  assert.match(page, /query\.get\("presentation"\) !== "showcase"/);
  assert.match(page, /import\("\.\/src\/provider\/card\.js"\)/);
  assert.doesNotMatch(page, /src="\.\/src\/provider\/card\.js"/);
  assert.doesNotMatch(page, /href="\.\/src\/provider\/provider\.css"/);
  assert.doesNotMatch(page, /src="\.\/src\/bootstrap\.js"/);
  assert.match(card, /data-playground-provider-styles/);
  assert.match(card, /PROVIDER_STYLESHEET = "\.\/src\/provider\/provider\.css"/);
});

test("loads provider worlds from a dedicated application document", () => {
  assert.match(providerPage, /src="\.\/src\/provider\/entry\.js"/);
  assert.doesNotMatch(providerPage, /src="\.\/src\/main\.js"/);
  assert.match(providerPage, /"@greenways\/hodos-core": "\.\/vendor\/hodos\/packages\/core\/src\/index\.js"/);
  assert.match(providerPage, /"@greenways\/hodos-source-github": "\.\/vendor\/hodos\/packages\/source-github\/src\/index\.js"/);
  assert.match(providerPage, /"@greenways\/hodos-viewer\/providers": "\.\/vendor\/hodos\/packages\/viewer\/src\/world-provider-host\.js"/);
  assert.match(providerPage, /href="\.\/src\/provider\/provider\.css"/);
  assert.match(build, /provider\.html/);
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
  assert.match(card, /new URL\("\.\/provider\.html", location\.href\)/);
  assert.match(card, /world", "https:\/\/github\.com\/greenways-ai\/alumbra"/);
  assert.match(card, /Open world/);
  assert.match(adapter, /https:\/\/oss\.greenways\.ai/);
  assert.match(adapter, /\/hodos\/alumbra\/apps\/lab\/peacock-ballroom\.html/);
  assert.doesNotMatch(entry, /@greenways\/alumbra/);
  assert.doesNotMatch(adapter, /@greenways\/alumbra/);
  assert.doesNotMatch(adapter, /mesh|shader|canonicalChunk|PlayCanvas/);
});
