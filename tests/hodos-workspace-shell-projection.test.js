import assert from "node:assert/strict";
import test from "node:test";
import {
  playgroundAreaIds,
  projectPlayWorkspace,
} from "../src/hodos/workspace-shell-state.js";

const supersonic = {
  "workspace/id": "playground-supersonic-live",
  "workspace/revision": 0,
  "workspace/layout": { "layout/type": "empty" },
  "workspace/areas": [
    { "area/id": "area/editor", "area/type": "code-editor", "area/title": "main.hal" },
    { "area/id": "area/audio", "area/type": "output", "area/title": "Audio" },
    { "area/id": "area/repl", "area/type": "repl", "area/title": "REPL" },
  ],
  "workspace/selection": { "area/id": "area/editor" },
  "workspace/customizations": {},
};

function state(view = supersonic, surfaceId = null, presentation = null) {
  return {
    workspace: "github/hara-lang/hara-play/samples/supersonic-live",
    presentation,
    workspaceShell: {
      workspaceId: "github/hara-lang/hara-play/samples/supersonic-live",
      view,
      surfaceId,
    },
  };
}

function layoutAreaIds(layout, output = []) {
  if (layout["layout/type"] === "area") output.push(layout["layout/area"]);
  if (layout["layout/type"] === "split") {
    layoutAreaIds(layout["layout/first"], output);
    layoutAreaIds(layout["layout/second"], output);
  }
  return output;
}

test("Play projection synthesizes project, editor and output shell geometry", () => {
  const descriptor = projectPlayWorkspace(state());
  const ids = [...playgroundAreaIds(descriptor)];
  assert.equal(descriptor["workspace/id"], "playground-supersonic-live");
  assert.deepEqual(ids, ["area/playground-project", "area/editor", "area/audio"]);
  assert.deepEqual(layoutAreaIds(descriptor["workspace/layout"]), [
    "area/playground-project",
    "area/editor",
    "area/audio",
  ]);
  assert.equal(descriptor["workspace/selection"]["surface/id"], "code");
  assert.equal(descriptor["workspace/selection"]["area/id"], "area/editor");
  assert.equal(descriptor["workspace/customizations"]["presentation/mode"], "studio");
});

test("Play projection collapses output aliases while preserving surface identity", () => {
  const descriptor = projectPlayWorkspace(state(supersonic, "repl"));
  const areas = descriptor["workspace/areas"];
  assert.equal(areas.some((area) => area["area/id"] === "area/repl"), false);
  assert.equal(descriptor["workspace/selection"]["surface/id"], "repl");
  assert.equal(descriptor["workspace/selection"]["area/id"], "area/audio");

  const surfaces = descriptor["workspace/customizations"]["responsive/surfaces"];
  for (const id of ["preview", "audio", "repl"]) {
    assert.equal(surfaces.find((surface) => surface["surface/id"] === id)["surface/area"], "area/audio");
  }
});

test("Play projection removes component descriptors and preserves unsupported areas", () => {
  const view = {
    ...supersonic,
    "workspace/layout": {
      "layout/type": "split",
      "layout/direction": "horizontal",
      "layout/ratio": 0.5,
      "layout/first": { "layout/type": "area", "layout/area": "area/editor" },
      "layout/second": { "layout/type": "area", "layout/area": "area/custom" },
    },
    "workspace/areas": [
      { ...supersonic["workspace/areas"][0], "area/component": { "component/id": "hodos.dev/editor" } },
      supersonic["workspace/areas"][1],
      supersonic["workspace/areas"][2],
      { "area/id": "area/custom", "area/type": "custom/timeline", "area/title": "Timeline" },
    ],
  };
  const descriptor = projectPlayWorkspace(state(view));
  assert.equal(descriptor["workspace/areas"].some((area) => area["area/component"]), false);
  const custom = descriptor["workspace/areas"].find((area) => area["area/id"] === "area/custom");
  assert.equal(custom["area/presentation"]["presentation/role"], "unsupported");
  assert.equal(layoutAreaIds(descriptor["workspace/layout"]).includes("area/custom"), true);
});

test("Showcase projection uses one declared surface and overrides carried selection", () => {
  const descriptor = projectPlayWorkspace(state(
    supersonic,
    "code",
    { mode: "showcase", surfaceId: "repl" },
  ));
  assert.equal(descriptor["workspace/selection"]["surface/id"], "repl");
  assert.equal(descriptor["workspace/selection"]["area/id"], "area/audio");
  assert.deepEqual(descriptor["workspace/layout"], {
    "layout/type": "area",
    "layout/area": "area/audio",
  });
  assert.equal(descriptor["workspace/customizations"]["presentation/mode"], "showcase");
});
