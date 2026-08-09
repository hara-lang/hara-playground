import assert from "node:assert/strict";
import test from "node:test";
import {
  outputSurfaceAvailable,
  projectPresentation,
} from "../src/workspace/presentation.js";

const project = (capabilities, source = "(ns sample.core)\n(+ 1 2)\n") => [
  {
    path: "project.edn",
    content: `{:hara/type :project\n :project/main sample.core\n :project/capabilities #{${capabilities.map((entry) => `:${entry}`).join(" ")}}}`,
  },
  { path: "src/core.hal", content: source },
];

test("ordinary data projects expose the REPL without a visual panel", () => {
  const presentation = projectPresentation(project(["studio/eval"]));
  assert.equal(presentation.preview, false);
  assert.equal(presentation.audio, false);
  assert.equal(presentation.defaultOutput, "repl");
  assert.equal(outputSurfaceAvailable(presentation, "preview"), false);
  assert.equal(outputSurfaceAvailable(presentation, "repl"), true);
});

test("HTA projects can declare a preview surface", () => {
  const presentation = projectPresentation(project(["studio/eval", "preview/hta"]));
  assert.equal(presentation.preview, true);
  assert.equal(presentation.defaultOutput, "preview");
});

test("existing HTA examples retain preview compatibility from their source shape", () => {
  const source = `(ns sample.core)\n(defn view [] [:main [:h1 "Live"]])\n(view)\n`;
  const presentation = projectPresentation(project(["studio/eval"], source));
  assert.equal(presentation.preview, true);
});

test("canvas programs expose visual output without also declaring HTA", () => {
  const source = `(ns sample.canvas)\n(draw/render "canvas/background" {:type :canvas-2d})\n`;
  const presentation = projectPresentation(project(["studio/eval"], source));
  assert.equal(presentation.preview, true);
});

test("music projects expose Audio and do not manufacture a generic preview", () => {
  const presentation = projectPresentation(project(["studio/eval", "audio/playback"]));
  assert.equal(presentation.audio, true);
  assert.equal(presentation.preview, false);
  assert.equal(presentation.defaultOutput, "audio");
  assert.equal(outputSurfaceAvailable(presentation, "audio"), true);
});

test("the removed guided-activity surface is never advertised", () => {
  const presentation = projectPresentation(project(["studio/eval"]));
  assert.equal(presentation.learn, false);
  assert.equal(outputSurfaceAvailable(presentation, "learn"), false);
});
