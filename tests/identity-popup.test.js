import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const loader = await readFile(new URL("../src/identity-loader.js", import.meta.url), "utf8");
const view = await readFile(new URL("../src/app/view.js", import.meta.url), "utf8");
const build = await readFile(new URL("../scripts/build-site.mjs", import.meta.url), "utf8");

test("opts Playground into the shared popup Identity client", () => {
  assert.match(index, /<meta name="hara-identity-mode" content="popup" \/>/);
  assert.match(index, /src="\.\/src\/identity-loader\.js"/);
  assert.match(loader, /https:\/\/id\.hara-lang\.org/);
  assert.match(loader, /https:\/\/id\.testing\.hara-lang\.org/);
  assert.match(loader, /\/v1\/identity-client\.js/);
  assert.match(loader, /data-hara-identity/);
  assert.doesNotMatch(loader, /client_secret|access_token|HARA_GITHUB_OAUTH_CLIENT_SECRET/);
});

test("remounts the account control in both dynamic Playground headers", () => {
  assert.match(view, /class="lobby-nav"/);
  assert.match(view, /class="workbench-actions"/);
  assert.match(loader, /\.lobby-nav/);
  assert.match(loader, /\.workbench-actions/);
  assert.match(loader, /MutationObserver/);
  assert.match(loader, /observer\.observe\(app, \{ childList: true \}\)/);
  assert.match(loader, /HaraIdentity\?\.refresh/);
});

test("publishes the loader because the build copies the complete source tree", () => {
  assert.match(build, /cp\(resolve\(root, "src"\), resolve\(output, "src"\)/);
});
