import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DESKTOP_LAYOUT,
  MOBILE_SURFACES,
  normaliseDesktopLayout,
  normaliseMobileSurface,
  resizeDesktopLayout
} from "../src/app/layout-model.js";

test("mobile workspace surfaces are explicit and default to code", () => {
  assert.deepEqual(MOBILE_SURFACES, ["files", "code", "preview", "repl", "learn"]);
  assert.equal(normaliseMobileSurface("preview"), "preview");
  assert.equal(normaliseMobileSurface("missing"), "code");
});

test("desktop panel widths preserve a usable editor", () => {
  const layout = normaliseDesktopLayout({ projectWidth: 900, outputWidth: 900 }, 1280);
  assert.ok(layout.projectWidth <= 420);
  assert.ok(layout.outputWidth <= 620);
  assert.ok(1280 - layout.projectWidth - layout.outputWidth - 16 >= 420);
});

test("desktop splitters resize the project and output panels in opposite directions", () => {
  const start = { ...DEFAULT_DESKTOP_LAYOUT };
  const widerProject = resizeDesktopLayout(start, "project", 40, 1440);
  const narrowerOutput = resizeDesktopLayout(start, "output", 40, 1440);
  assert.equal(widerProject.projectWidth, start.projectWidth + 40);
  assert.equal(narrowerOutput.outputWidth, start.outputWidth - 40);
});

test("desktop layout falls back when stored preferences are invalid", () => {
  const layout = normaliseDesktopLayout({ projectWidth: "bad", outputWidth: null }, 1440);
  assert.equal(layout.projectWidth, DEFAULT_DESKTOP_LAYOUT.projectWidth);
  assert.equal(layout.outputWidth, DEFAULT_DESKTOP_LAYOUT.outputWidth);
});
