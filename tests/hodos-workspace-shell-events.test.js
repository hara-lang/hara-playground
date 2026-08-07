import assert from "node:assert/strict";
import test from "node:test";
import { workspaceShellPatch } from "../src/hodos/workspace-shell-events.js";
import { projectPlaygroundWorkspace } from "../src/hodos/workspace-shell-state.js";

const descriptor = projectPlaygroundWorkspace({
  workspace: "workspace/test",
  workspaceShell: {
    workspaceId: "workspace/test",
    view: {
      "workspace/id": "workspace/test",
      "workspace/layout": { "layout/type": "empty" },
      "workspace/areas": [
        { "area/id": "area/editor", "area/type": "code-editor" },
        { "area/id": "area/output", "area/type": "output" },
      ],
    },
  },
});

test("Workspace shell events project validated selection patches", () => {
  assert.deepEqual(workspaceShellPatch({
    "event/type": "workspace/area-select",
    "workspace/id": "workspace/test",
    "area/id": "area/output",
    "surface/id": "repl",
  }, descriptor), {
    kind: "select-area",
    workspaceId: "workspace/test",
    areaId: "area/output",
    surfaceId: "repl",
  });
  assert.equal(workspaceShellPatch({ "event/type": "editor/change" }, descriptor), null);
});

test("Workspace shell events reject stale identities and cross-area surfaces", () => {
  assert.throws(() => workspaceShellPatch({
    "event/type": "workspace/area-select",
    "workspace/id": "workspace/stale",
    "area/id": "area/output",
    "surface/id": "repl",
  }, descriptor), /different Workspace/);
  assert.throws(() => workspaceShellPatch({
    "event/type": "workspace/area-select",
    "workspace/id": "workspace/test",
    "area/id": "area/editor",
    "surface/id": "repl",
  }, descriptor), /does not belong/);
  assert.throws(() => workspaceShellPatch({
    "event/type": "workspace/area-select",
    "workspace/id": "workspace/test",
    "area/id": "area/missing",
    "surface/id": "code",
  }, descriptor), /missing area/);
});
