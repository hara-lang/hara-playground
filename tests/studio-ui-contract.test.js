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

test("normal Studio output follows project presentation without constraining Showcase", async () => {
  const main = await read("../src/main.js");
  const presentation = await read("../src/app/project-presentation.js");
  const preview = await read("../src/hodos/preview.js");

  assert.match(main, /syncProjectPresentation\(\{ state, store \}\)/);
  assert.match(main, /if \(showcase\) \{[\s\S]*mountHodosPreview\(\{ document: state\.preview, theme: state\.theme \}\)/);
  assert.match(presentation, /const showcase = state\.presentation\?\.mode === "showcase"/);
  assert.match(presentation, /if \(showcase\) \{[\s\S]*return presentation/);
  assert.match(presentation, /dataset\.projectPreview/);
  assert.match(presentation, /dataset\.projectAudio/);
  assert.match(preview, /previewEnabled\(\)/);
});

test("the project lobby uses visual-language tokens", async () => {
  const styles = await read("../src/styles/public-shell.css");
  assert.match(styles, /var\(--hara-bg\)/);
  assert.match(styles, /var\(--hara-signal\)/);
  assert.match(styles, /transform:\s*none/);
});
