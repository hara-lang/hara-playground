import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const actions = fs.readFileSync(new URL("../src/app/actions.js", import.meta.url), "utf8");
const events = fs.readFileSync(new URL("../src/app/events.js", import.meta.url), "utf8");
const shell = fs.readFileSync(new URL("../src/hodos/workspace-shell.js", import.meta.url), "utf8");
const manifest = fs.readFileSync(new URL("../src/workspace/manifest.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("the active Play shell mounts through Hodos without a competing controller", () => {
  assert.match(main, /mountHodosWorkspaceShell/);
  assert.match(main, /disposeHodosWorkspaceShell/);
  assert.doesNotMatch(main, /installWorkspaceLayout/);
  assert.match(shell, /createWorkspaceShellHost/);
  assert.match(shell, /resolveAreaRoot/);
  assert.match(shell, /workspaceShell:/);
  assert.match(styles, /vendor\/hodos\/packages\/workspace-ui\/src\/shell\.css/);
  assert.equal(fs.existsSync(new URL("../src/app/workspace-layout.js", import.meta.url)), false);
  assert.equal(fs.existsSync(new URL("../src/app/layout-model.js", import.meta.url)), false);
});

test("workspace.edn is evaluated through the Hara runtime and remains application policy", () => {
  assert.match(manifest, /runtime\.eval/);
  assert.match(manifest, /runtime\.inspect/);
  assert.match(manifest, /WORKSPACE_MANIFEST_PATH = "workspace\.edn"/);
  assert.match(actions, /loadWorkspaceManifest/);
  assert.match(actions, /reloadWorkspaceManifest/);
  assert.match(events, /workspaceShellPatch/);
  assert.doesNotMatch(shell, /parseEdn|readString|eval\(/i);
});

test("the Hodos shell receives presentation projection rather than executable components", () => {
  const stateSource = fs.readFileSync(new URL("../src/hodos/workspace-shell-state.js", import.meta.url), "utf8");
  assert.match(stateSource, /delete next\["area\/component"\]/);
  assert.match(stateSource, /responsive\/surfaces/);
  assert.doesNotMatch(shell, /innerHTML/);
  assert.doesNotMatch(shell, /new Function|eval\(/);
});
