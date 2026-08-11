import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Studio uses compact editor chrome", async () => {
  const main = await read("../src/main.js");
  const chrome = await read("../src/app/studio-chrome.js");
  const styles = await read("../src/styles/simplified-studio.css");

  assert.match(main, /applyStudioChrome\(\)/);
  assert.doesNotMatch(main, /mountHodosCatalog\(state\)/);
  assert.match(chrome, /editor-options-menu/);
  assert.match(chrome, /toolset-strip/);
  assert.match(chrome, /catalog-activity-slot/);
  assert.match(styles, /\.instarepl-rail/);
  assert.match(styles, /display:\s*none !important/);
});

test("output surfaces follow project presentation", async () => {
  const main = await read("../src/main.js");
  const presentation = await read("../src/app/project-presentation.js");
  const preview = await read("../src/hodos/preview.js");

  assert.match(main, /syncProjectPresentation\(\{ state, store \}\)/);
  assert.doesNotMatch(main, /mountHodosPreview\(/);
  assert.match(presentation, /dataset\.projectPreview/);
  assert.match(presentation, /dataset\.projectAudio/);
  assert.match(preview, /previewEnabled\(\)/);
});

test("provider documents bypass repository-card interception", async () => {
  const page = await read("../index.html");
  const navigation = await read("../src/studio/provider-navigation.js");
  const mainEntry = page.indexOf('src="./src/main.js"');
  const providerEntry = page.indexOf('src="./src/studio/provider-navigation.js"');

  assert.ok(mainEntry >= 0 && providerEntry > mainEntry);
  assert.match(navigation, /addEventListener\("click", onClick, true\)/);
  assert.match(navigation, /stopImmediatePropagation\(\)/);
  assert.match(navigation, /target\.pathname === providerDocument\.pathname/);
  assert.match(navigation, /searchParams\.has\("provider"\)/);
  assert.match(navigation, /location\.assign/);
});

test("the project lobby uses visual-language tokens", async () => {
  const styles = await read("../src/styles/public-shell.css");
  assert.match(styles, /var\(--hara-bg\)/);
  assert.match(styles, /var\(--hara-signal\)/);
  assert.match(styles, /transform:\s*none/);
});
