import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the Audio panel offers an explicit browser-workspace capability action", async () => {
  const integration = await read("src/audio/integration.js");
  assert.match(integration, /audio-enable-capability-button/);
  assert.match(integration, /Enable in \$\{escapeHtml\(browserCopy\)\}/);
  assert.match(integration, /edits only the persisted browser workspace/i);
  assert.match(integration, /Sound still requires a separate Play gesture/);
});

test("capability enablement saves work, edits project.edn and reboots authority", async () => {
  const integration = await read("src/audio/integration.js");
  assert.match(integration, /if \(state\.dirty\) await saveCurrentFile\(false\)/);
  assert.match(integration, /detectProjectConfiguration\(files\)/);
  assert.match(integration, /addProjectCapability\(source\)/);
  assert.match(integration, /await store\.write\(project\.projectPath, edit\.source\)/);
  assert.match(integration, /await bootRuntime\(\)/);
  assert.match(integration, /state\.runtimeStatus !== "ready"/);
});

test("the action never authorizes Web Audio itself", async () => {
  const integration = await read("src/audio/integration.js");
  const start = integration.indexOf("async function enableAudioCapability");
  const end = integration.indexOf("async function handleClick", start);
  const action = integration.slice(start, end);
  assert.ok(action.length > 0);
  assert.doesNotMatch(action, /engine\.authorize|audio\.play\(|AudioContext/);
  assert.match(action, /Play remains user-authorized/);
});

test("capability action styles remain usable on narrow screens", async () => {
  const styles = await read("src/audio/audio.css");
  assert.match(styles, /\.audio-capability-action/);
  assert.match(styles, /\.audio-capability-message--error/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.audio-capability-action \{ grid-template-columns: 1fr/);
});
