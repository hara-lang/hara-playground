import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const loader = await readFile(new URL("../src/identity-loader.js", import.meta.url), "utf8");
const view = await readFile(new URL("../src/app/view.js", import.meta.url), "utf8");
const build = await readFile(new URL("../scripts/build-site.mjs", import.meta.url), "utf8");

function runLoader({ hostname, configuredOrigin } = {}) {
  const appended = [];
  const observed = [];
  const app = {};
  const document = {
    head: { append: (node) => appended.push(node) },
    querySelector(selector) {
      if (selector === "#app") return app;
      if (selector === 'meta[name="hara-identity-origin"]') {
        return configuredOrigin === undefined
          ? null
          : { getAttribute: () => configuredOrigin };
      }
      return null;
    },
    createElement() {
      return {
        dataset: {},
        addEventListener() {},
      };
    },
  };
  class MutationObserver {
    observe(target, options) {
      observed.push({ target, options });
    }
  }

  vm.runInNewContext(loader, {
    document,
    location: { hostname },
    MutationObserver,
    globalThis: {},
  });
  return { appended, observed };
}

test("opts Playground into the shared popup Identity client", () => {
  assert.match(index, /<meta name="hara-identity-mode" content="popup" \/>/);
  assert.match(index, /src="\.\/src\/identity-loader\.js"/);
  assert.match(loader, /https:\/\/id\.hara-lang\.org/);
  assert.match(loader, /https:\/\/id\.testing\.hara-lang\.org/);
  assert.match(loader, /\/v1\/identity-client\.js/);
  assert.match(loader, /data-hara-identity/);
  assert.doesNotMatch(loader, /client_secret|access_token|HARA_GITHUB_OAUTH_CLIENT_SECRET/);
});

test("remounts the account control in both dynamic Playground headers without touching the audio microtask queue", () => {
  assert.match(view, /class="lobby-nav"/);
  assert.match(view, /class="workbench-actions"/);
  assert.match(loader, /\.lobby-nav/);
  assert.match(loader, /\.workbench-actions/);
  assert.match(loader, /new MutationObserver\(mountIdentity\)/);
  assert.match(loader, /observer\.observe\(app, \{ childList: true \}\)/);
  assert.match(loader, /HaraIdentity\?\.refresh/);
  assert.doesNotMatch(loader, /queueMicrotask/);
});

test("publishes the loader because the build copies the complete source tree", () => {
  assert.match(build, /cp\(resolve\(root, "src"\), resolve\(output, "src"\)/);
});

test("selects remote Identity only for canonical Hara hosts", () => {
  const production = runLoader({ hostname: "playground.hara-lang.org" });
  assert.equal(production.appended[0].src, "https://id.hara-lang.org/v1/identity-client.js");
  assert.equal(production.observed.length, 1);

  const testing = runLoader({ hostname: "preview.testing.hara-lang.org" });
  assert.equal(testing.appended[0].src, "https://id.testing.hara-lang.org/v1/identity-client.js");
  assert.equal(testing.observed.length, 1);
});

test("does not contact remote Identity from loopback or unknown hosts", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]", "playground.example.test"]) {
    const result = runLoader({ hostname });
    assert.deepEqual(result.appended, []);
    assert.deepEqual(result.observed, []);
  }
});

test("allows an explicit trusted Identity origin for local integration tests", () => {
  const enabled = runLoader({
    hostname: "127.0.0.1",
    configuredOrigin: "https://id.testing.hara-lang.org",
  });
  assert.equal(enabled.appended[0].src, "https://id.testing.hara-lang.org/v1/identity-client.js");

  const rejected = runLoader({
    hostname: "playground.hara-lang.org",
    configuredOrigin: "https://identity.example.test",
  });
  assert.deepEqual(rejected.appended, []);
  assert.deepEqual(rejected.observed, []);
});
