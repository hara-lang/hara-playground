import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { STUDIO_SECTIONS } from "../src/app/studio-chrome.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("studio exposes the navigable content series", () => {
  assert.deepEqual(STUDIO_SECTIONS.map(({ id }) => id), [
    "nav", "frontmatter", "graphics", "code"
  ]);
});

test("studio chrome builds accessible section tabs and a frontmatter view", async () => {
  const source = await read("../src/app/studio-chrome.js");
  assert.match(source, /role", "tablist"/);
  assert.match(source, /aria-controls/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /studio-frontmatter-panel/);
  assert.match(source, /hara:studio-section-change/);
  assert.match(source, /sessionStorage/);
  assert.match(source, /data-output-tab=\\"preview\\"/);
});

test("calm studio stylesheet is loaded last and preserves reduced motion", async () => {
  const [entry, styles] = await Promise.all([
    read("../src/styles.css"),
    read("../src/styles/calm-studio.css")
  ]);
  assert.match(entry.trimEnd(), /calm-studio\.css"\);$/);
  assert.match(styles, /--studio-calm-motion:\s*185ms/);
  assert.match(styles, /\.studio-section-nav/);
  assert.match(styles, /\.studio-frontmatter-grid/);
  assert.match(styles, /border-radius:\s*var\(--studio-calm-radius\)/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(styles, /text-transform:\s*uppercase/);
});
