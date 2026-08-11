import assert from "node:assert/strict";
import test from "node:test";
import {
  ALUMBRA_PAGES_HOST,
  ALUMBRA_PROVIDER_ID,
  PEACOCK_BALLROOM_ACTIVITY_ID,
  PEACOCK_BALLROOM_PACKAGE,
  PEACOCK_BALLROOM_STATES,
  createAlumbraWorldProviderRegistration,
  peacockBallroomProviderUrl,
} from "../src/provider/alumbra.js";
import {peacockBallroomPlaygroundUrl} from "../src/provider/card.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.className = "";
    this.src = "";
    this.title = "";
    this.allow = "";
  }
  append(...children) { this.children.push(...children); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  dispatch(type) { this.listeners.get(type)?.(); }
  remove() { this.removed = true; }
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(tagName); }
}

class FakeRoot {
  constructor() { this.children = []; }
  replaceChildren(...children) { this.children = children; }
}

test("builds the semantic Playground route and installed provider URL", () => {
  const route = new URL(peacockBallroomPlaygroundUrl({href: "https://playground.hara-lang.org/?repo=old#fragment"}));
  assert.equal(route.origin, "https://playground.hara-lang.org");
  assert.equal(route.pathname, "/provider.html");
  assert.equal(route.searchParams.get("provider"), ALUMBRA_PROVIDER_ID);
  assert.equal(route.searchParams.get("world"), "https://github.com/greenways-ai/alumbra");
  assert.equal(route.searchParams.get("state"), "ballroom/day");
  assert.equal(route.hash, "");

  const provider = new URL(peacockBallroomProviderUrl("ballroom/gallery-overlook"));
  assert.equal(provider.href.startsWith(ALUMBRA_PAGES_HOST), true);
  assert.equal(provider.searchParams.get("state"), "ballroom/gallery-overlook");
  assert.equal(provider.searchParams.get("embed"), "playground");
  assert.throws(
    () => peacockBallroomProviderUrl("ballroom/day", "https://example.test/world"),
    /installed Greenways Pages origin/,
  );
});

test("registers exactly one installed Peacock Ballroom activity", () => {
  const registration = createAlumbraWorldProviderRegistration({document: new FakeDocument()});
  assert.equal(registration.providerId, ALUMBRA_PROVIDER_ID);
  assert.deepEqual(registration.activities[PEACOCK_BALLROOM_ACTIVITY_ID], {
    package: PEACOCK_BALLROOM_PACKAGE,
    defaultState: "ballroom/day",
    states: PEACOCK_BALLROOM_STATES,
  });
  assert.doesNotMatch(JSON.stringify({
    providerId: registration.providerId,
    activities: registration.activities,
    metadata: registration.metadata,
  }), /mesh|shader|chunk|callback|PlayCanvas/);
});

test("allocates one provider iframe and releases it deterministically", () => {
  const document = new FakeDocument();
  const root = new FakeRoot();
  const registration = createAlumbraWorldProviderRegistration({document});
  const controller = registration.factory({
    root,
    launch: {
      providerId: ALUMBRA_PROVIDER_ID,
      activityId: PEACOCK_BALLROOM_ACTIVITY_ID,
      package: PEACOCK_BALLROOM_PACKAGE,
      state: "ballroom/mosaic-floor",
    },
  });
  assert.equal(root.children.length, 1);
  const frame = root.children[0].children[0];
  assert.equal(frame.tagName, "IFRAME");
  assert.equal(new URL(frame.src).searchParams.get("state"), "ballroom/mosaic-floor");
  assert.equal(controller.snapshot().status, "loading");
  frame.dispatch("load");
  assert.equal(controller.snapshot().status, "ready");
  assert.equal(controller.snapshot().loads, 1);
  controller.destroy();
  assert.equal(controller.snapshot().status, "disposed");
  assert.equal(frame.src, "about:blank");
});
