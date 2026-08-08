import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  playgroundAreaIds,
  projectPlaygroundWorkspace,
} from "../src/hodos/workspace-shell-state.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const documentArea = {
  "area/id": "area/document",
  "area/type": "hodos.2d/document",
  "area/title": "Document",
  "area/presentation": {
    "presentation/label": "Document",
    "presentation/surface": "document",
    "presentation/mode": "document",
    "presentation/compact": true,
  },
  "area/component": {
    "component/id": "hodos.2d/document",
    "component/contract": "workspace.component/1",
    "component/model": {
      document: {
        profile: "hodos.rich-text/2",
        id: "document/review",
        revision: 0,
        children: [],
      },
      selection: { nodeId: null, anchor: null, focus: null },
      status: "ready",
      readOnly: true,
      capabilities: {},
      error: null,
    },
    "component/events": ["document/select"],
  },
};

test("Playground preserves manifest components and exposes responsive document surfaces", () => {
  const descriptor = projectPlaygroundWorkspace({
    workspace: "workspace/test",
    workspaceShell: {
      workspaceId: "workspace/test",
      surfaceId: "document",
      view: {
        "workspace/id": "workspace/test",
        "workspace/revision": 0,
        "workspace/layout": {
          "layout/type": "area",
          "layout/area": "area/document",
        },
        "workspace/areas": [documentArea],
        "workspace/selection": {
          "area/id": "area/document",
          "surface/id": "document",
        },
        "workspace/customizations": {},
      },
    },
  });
  const projected = descriptor["workspace/areas"].find((area) => area["area/id"] === "area/document");
  const surface = descriptor["workspace/customizations"]["responsive/surfaces"].find((entry) => entry["surface/id"] === "document");
  assert.equal(projected["area/component"]["component/id"], "hodos.2d/document");
  assert.equal(surface["surface/area"], "area/document");
  assert.equal(descriptor["workspace/selection"]["area/id"], "area/document");
  assert.equal(playgroundAreaIds(descriptor).has("area/document"), true);
});


test("manifest-selected extension surfaces override carried fallback selections", () => {
  const descriptor = projectPlaygroundWorkspace({
    workspace: "workspace/document",
    workspaceShell: {
      workspaceId: "workspace/document",
      status: "ready",
      source: "workspace.edn",
      surfaceId: "code",
      view: {
        "workspace/id": "workspace/document",
        "workspace/revision": 0,
        "workspace/layout": {
"layout/type": "area",
"layout/area": "area/document",
        },
        "workspace/areas": [documentArea],
        "workspace/selection": {
"area/id": "area/document",
"surface/id": "document",
        },
        "workspace/customizations": {},
      },
    },
  });
  assert.equal(descriptor["workspace/selection"]["surface/id"], "document");
  assert.equal(descriptor["workspace/selection"]["area/id"], "area/document");
});
test("Playground pins and registers the Hodos 2D document packages", async () => {
  const [html, shell, styles, manifest] = await Promise.all([
    read("../index.html"),
    read("../src/hodos/workspace-shell.js"),
    read("../src/styles.css"),
    read("../samples/hodos-document/workspace.edn"),
  ]);
  assert.match(html, /@greenways\/hodos-2d/);
  assert.match(html, /@greenways\/hodos-2d-ui/);
  assert.match(shell, /registerHodosDocumentDomUi/);
  assert.match(styles, /2d-ui\/src\/document\.css/);
  assert.match(manifest, /hodos\.2d\/document/);
  assert.match(manifest, /hodos\.rich-text\/2/);
  assert.equal(manifest.includes("javascript"), false);
  assert.equal(manifest.includes("callback"), false);
});
