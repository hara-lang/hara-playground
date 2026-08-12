import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const providerPage = readFileSync(new URL("../provider.html", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/provider/entry.js", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../src/provider/alumbra.js", import.meta.url), "utf8");
const projects = readFileSync(new URL("../src/studio/projects.js", import.meta.url), "utf8");
const build = readFileSync(new URL("../scripts/build-site.mjs", import.meta.url), "utf8");
const prepare = readFileSync(new URL("../scripts/prepare-web-packages.mjs", import.meta.url), "utf8");
const liveSmoke = readFileSync(new URL("../scripts/verify-live-provider-world.mjs", import.meta.url), "utf8");
const submodules = readFileSync(new URL("../.gitmodules", import.meta.url), "utf8");

test("preserves the exact ordinary editor and embedded Showcase document", () => {
  assert.match(page, /src="\.\/src\/main\.js"/);
  assert.doesNotMatch(page, /src\/provider/);
  assert.doesNotMatch(page, /provider\.css/);
  assert.doesNotMatch(page, /src="\.\/src\/bootstrap\.js"/);
  assert.match(projects, /id: "peacock-ballroom"/);
  assert.match(projects, /href: "\.\/provider\.html\?provider=alumbra%2Fworld/);
  assert.match(projects, /Open Peacock Ballroom/);
});

test("loads provider worlds from a dedicated application document and Hodos pin", () => {
  assert.match(providerPage, /src="\.\/src\/provider\/entry\.js"/);
  assert.doesNotMatch(providerPage, /src="\.\/src\/main\.js"/);
  assert.match(providerPage, /"@greenways\/hodos-core": "\.\/vendor\/hodos-provider\/packages\/core\/src\/index\.js"/);
  assert.match(providerPage, /"@greenways\/hodos-source-github": "\.\/vendor\/hodos-provider\/packages\/source-github\/src\/index\.js"/);
  assert.match(providerPage, /"@greenways\/hodos-viewer\/providers": "\.\/vendor\/hodos-provider\/packages\/viewer\/src\/world-provider-host\.js"/);
  assert.match(providerPage, /href="\.\/src\/provider\/provider\.css"/);
  assert.match(build, /vendor\/hodos-provider\/packages/);
  assert.match(prepare, /path: "vendor\/hodos-provider"/);
  assert.match(submodules, /\[submodule "vendor\/hodos-provider"\]/);
});

test("resolves the repository manifest before allocating the installed provider", () => {
  const resolution = entry.indexOf("await resolveWorldGraph");
  const launch = entry.indexOf("const launch = createWorldProviderLaunchIntent");
  const allocation = entry.indexOf("activeHost = createWorldProviderHost");
  assert.ok(resolution >= 0 && launch > resolution && allocation > launch);
  assert.match(entry, /graph\.project\.provider/);
  assert.match(entry, /graph\.project\.provider\.id !== requestedProvider/);
  assert.match(entry, /projectId: graph\.project\.id/);
  assert.match(entry, /playgroundProviderActivity = launch\.activityId/);
  assert.match(entry, /consumer: "hara-playground"/);
});

test("adds one provider-backed world project without importing Alumbra code", () => {
  assert.match(projects, /field: "worlds"/);
  assert.match(projects, /world=https%3A%2F%2Fgithub\.com%2Fgreenways-ai%2Falumbra/);
  assert.match(projects, /sourceUrl: "https:\/\/github\.com\/greenways-ai\/alumbra"/);
  assert.match(adapter, /https:\/\/oss\.greenways\.ai/);
  assert.match(adapter, /\/hodos\/alumbra\/apps\/lab\/peacock-ballroom\.html/);
  assert.doesNotMatch(entry, /@greenways\/alumbra/);
  assert.doesNotMatch(adapter, /@greenways\/alumbra/);
  assert.doesNotMatch(adapter, /mesh|shader|canonicalChunk|PlayCanvas/);
});

test("the public smoke proves repository, launch, host and renderer readiness together", () => {
  assert.match(liveSmoke, /provider", "alumbra\/world"/);
  assert.match(liveSmoke, /world", "https:\/\/github\.com\/greenways-ai\/alumbra"/);
  assert.match(liveSmoke, /data-playground-provider-ready="true"/);
  assert.match(liveSmoke, /outer\.allocations, "1"/);
  assert.match(liveSmoke, /outer\.graph\?\.projectId, "greenways\/alumbra"/);
  assert.match(liveSmoke, /outer\.launch\?\.format, "hodos\.world-provider-launch\/1"/);
  assert.match(liveSmoke, /outer\.launch\?\.providerId, "alumbra\/world"/);
  assert.match(liveSmoke, /outer\.launch\?\.activityId, "alumbra-hara\/peacock-ballroom"/);
  assert.match(liveSmoke, /outer\.launch\?\.state, "ballroom\/day"/);
  assert.match(liveSmoke, /providerUrl\.origin, "https:\/\/oss\.greenways\.ai"/);
  assert.match(liveSmoke, /\/hodos\/alumbra\/apps\/lab\/peacock-ballroom\.html/);
  assert.match(liveSmoke, /data-peacock-ballroom-ready="true"/);
  assert.match(liveSmoke, /inner\.chunks, "48"/);
  assert.match(liveSmoke, /inner\.lighting, "passed"/);
  assert.match(liveSmoke, /inner\.landmarks, "passed"/);
  assert.match(liveSmoke, /inner\.disposal, "passed"/);
});
