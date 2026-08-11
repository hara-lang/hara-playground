import assert from "node:assert/strict";
import test from "node:test";
import {
  installProviderProjectNavigation,
  isProviderProjectLink,
} from "../src/studio/provider-navigation.js";

class FakeDocument {
  constructor() {
    this.listeners = new Map();
  }
  addEventListener(type, listener, capture) {
    this.listeners.set(`${type}:${capture}`, listener);
  }
  removeEventListener(type, listener, capture) {
    const key = `${type}:${capture}`;
    if (this.listeners.get(key) === listener) this.listeners.delete(key);
  }
  dispatch(event) {
    this.listeners.get("click:true")?.(event);
  }
}

function fakeLink(href) {
  return {
    href,
    getAttribute(name) { return name === "href" ? href : null; },
    closest(selector) { return selector === "a[data-project-id][href]" ? this : null; },
  };
}

function fakeClick(link) {
  return {
    target: link,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.propagationStopped = true; },
  };
}

test("recognises only a complete same-origin provider document launch", () => {
  const location = {href: "https://playground.hara-lang.org/"};
  assert.equal(isProviderProjectLink(fakeLink(
    "./provider.html?provider=alumbra%2Fworld&world=https%3A%2F%2Fgithub.com%2Fgreenways-ai%2Falumbra&state=ballroom%2Fday",
  ), location), true);
  assert.equal(isProviderProjectLink(fakeLink("./?repo=hara-lang%2Fhara-playground"), location), false);
  assert.equal(isProviderProjectLink(fakeLink("https://example.test/provider.html?provider=x&world=y&state=z"), location), false);
  assert.equal(isProviderProjectLink(fakeLink("./provider.html?provider=x&world=y"), location), false);
});

test("provider cards bypass repository import and navigate to the dedicated document", () => {
  const document = new FakeDocument();
  const assigned = [];
  const location = {
    href: "https://playground.hara-lang.org/",
    assign(value) { assigned.push(value); },
  };
  const controller = installProviderProjectNavigation({document, location, window: null});
  const link = fakeLink(
    "./provider.html?provider=alumbra%2Fworld&world=https%3A%2F%2Fgithub.com%2Fgreenways-ai%2Falumbra&state=ballroom%2Fday",
  );
  const event = fakeClick(link);
  document.dispatch(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
  assert.deepEqual(assigned, [
    "https://playground.hara-lang.org/provider.html?provider=alumbra%2Fworld&world=https%3A%2F%2Fgithub.com%2Fgreenways-ai%2Falumbra&state=ballroom%2Fday",
  ]);

  controller.dispose();
  controller.dispose();
  assert.equal(document.listeners.size, 0);
});

test("ordinary repository project cards retain the existing SPA handler", () => {
  const document = new FakeDocument();
  const assigned = [];
  const location = {
    href: "https://playground.hara-lang.org/",
    assign(value) { assigned.push(value); },
  };
  installProviderProjectNavigation({document, location, window: null});
  const event = fakeClick(fakeLink("./?repo=hara-lang%2Fhara-playground&branch=main&path=samples%2Flive-values"));
  document.dispatch(event);

  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
  assert.deepEqual(assigned, []);
});
