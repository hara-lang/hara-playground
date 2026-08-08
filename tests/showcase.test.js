import assert from "node:assert/strict";
import test from "node:test";
import {
  SHOWCASE_ERROR,
  SHOWCASE_PRESENTATION,
  SHOWCASE_PROTOCOL_VERSION,
  SHOWCASE_READY,
  SHOWCASE_SELECT_SURFACE,
  normalizeShowcaseSelector,
  showcaseErrorMessage,
  showcaseLocationFor,
  showcasePresentationFromLocation,
  showcaseReadyMessage,
  showcaseSurfaceSelectionFromMessage,
  trustedShowcaseParentOrigin,
} from "../src/studio/showcase.js";

test("ordinary Playground locations retain Studio presentation", () => {
  assert.deepEqual(showcasePresentationFromLocation({
    search: "?repo=hara-lang/hara-playground",
  }), {
    mode: "studio",
    surfaceId: null,
    theme: null,
    error: "",
  });
});

test("Showcase locations project bounded surface and theme selectors", () => {
  assert.deepEqual(showcasePresentationFromLocation({
    search: "?presentation=showcase&surface=card/default&theme=light",
  }), {
    mode: SHOWCASE_PRESENTATION,
    surfaceId: "card/default",
    theme: "light",
    error: "",
  });
  assert.match(
    showcasePresentationFromLocation({
      search: "?presentation=showcase&surface=../../source",
    }).error,
    /bounded package selector/,
  );
  assert.match(
    showcasePresentationFromLocation({
      search: "?presentation=showcase&theme=sepia",
    }).error,
    /light or dark/,
  );
});

test("Showcase selectors reject traversal and unbounded payloads", () => {
  assert.equal(normalizeShowcaseSelector(":preview"), "preview");
  assert.equal(normalizeShowcaseSelector("card/default"), "card/default");
  for (const value of ["../source", "card//default", "card default", "a".repeat(129)]) {
    assert.throws(() => normalizeShowcaseSelector(value), /bounded package selector/);
  }
});

test("surface messages admit selectors only and fail closed", () => {
  assert.deepEqual(showcaseSurfaceSelectionFromMessage({
    type: SHOWCASE_SELECT_SURFACE,
    version: SHOWCASE_PROTOCOL_VERSION,
    surfaceId: "document",
  }), { surfaceId: "document" });
  assert.equal(showcaseSurfaceSelectionFromMessage({
    type: "unrelated/message",
    version: SHOWCASE_PROTOCOL_VERSION,
  }), null);
  assert.throws(() => showcaseSurfaceSelectionFromMessage({
    type: SHOWCASE_SELECT_SURFACE,
    version: SHOWCASE_PROTOCOL_VERSION,
    surfaceId: "preview",
    source: "(delete-everything)",
  }), /selectors only/);
  assert.throws(() => showcaseSurfaceSelectionFromMessage({
    type: SHOWCASE_SELECT_SURFACE,
    version: 2,
    surfaceId: "preview",
  }), /Unsupported Showcase protocol version/);
});

test("Showcase origins are limited to Packages, same-origin and local development", () => {
  const production = {
    href: "https://playground.hara-lang.org/",
    origin: "https://playground.hara-lang.org",
  };
  assert.equal(trustedShowcaseParentOrigin("https://packages.hara-lang.org", production), true);
  assert.equal(trustedShowcaseParentOrigin("https://packages.testing.hara-lang.org", production), true);
  assert.equal(trustedShowcaseParentOrigin("https://playground.hara-lang.org", production), true);
  assert.equal(trustedShowcaseParentOrigin("https://malicious.example", production), false);
  assert.equal(trustedShowcaseParentOrigin("http://localhost:8888", {
    href: "http://localhost:4173/",
    origin: "http://localhost:4173",
  }), true);
});

test("Showcase deep links preserve immutable project and presentation identity", () => {
  const commit = "d".repeat(40);
  const location = showcaseLocationFor({
    owner: "hara-lang",
    repository: "hara-playground",
    branch: "main",
    commit,
    path: "samples/hodos-document",
  }, {
    mode: SHOWCASE_PRESENTATION,
    surfaceId: "document",
    theme: "dark",
  }, "/");
  const url = new URL(location, "https://playground.hara-lang.org");
  assert.equal(url.searchParams.get("repo"), "hara-lang/hara-playground");
  assert.equal(url.searchParams.get("branch"), "main");
  assert.equal(url.searchParams.get("commit"), commit);
  assert.equal(url.searchParams.get("path"), "samples/hodos-document");
  assert.equal(url.searchParams.get("presentation"), "showcase");
  assert.equal(url.searchParams.get("surface"), "document");
  assert.equal(url.searchParams.get("theme"), "dark");
});

test("Showcase status messages expose public selectors rather than runtime state", () => {
  const commit = "e".repeat(40);
  const ready = showcaseReadyMessage({
    workspaceId: "package/example",
    commit,
    surfaceId: "preview",
    surfaces: ["preview", "document", "preview"],
  });
  assert.deepEqual(ready, {
    type: SHOWCASE_READY,
    version: SHOWCASE_PROTOCOL_VERSION,
    workspaceId: "package/example",
    commit,
    surfaceId: "preview",
    surfaces: ["preview", "document"],
  });
  assert.deepEqual(showcaseErrorMessage("Unable to open demo"), {
    type: SHOWCASE_ERROR,
    version: SHOWCASE_PROTOCOL_VERSION,
    message: "Unable to open demo",
  });
  assert.equal(Object.hasOwn(ready, "state"), false);
  assert.equal(Object.hasOwn(ready, "source"), false);
});
