import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const imports = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const mobile = await readFile(new URL("../src/styles/mobile-scroll.css", import.meta.url), "utf8");

test("mobile scroll ownership is loaded after the simplified Studio layer", () => {
  assert.match(
    imports,
    /simplified-studio\.css"\);[\s\S]*mobile-scroll\.css"\);/,
  );
});

test("the public lobby keeps vertical document scrolling without horizontal drift", () => {
  assert.match(mobile, /\.project-lobby\s*\{[\s\S]*overflow-x:\s*clip/);
  assert.match(mobile, /\.project-lobby\s*\{[\s\S]*overflow-y:\s*visible/);
  assert.match(mobile, /\.lobby-hero__artifact[\s\S]*min-width:\s*0/);
});

test("mobile Studio is bounded to the dynamic viewport", () => {
  assert.match(
    mobile,
    /html\[data-screen="workspace"\][\s\S]*height:\s*100%[\s\S]*overflow:\s*hidden/,
  );
  assert.match(mobile, /height:\s*100svh;[\s\S]*height:\s*100dvh/);
  assert.match(mobile, /max-height:\s*100dvh/);
  assert.match(mobile, /\.editor-panel\s*\{[\s\S]*overflow:\s*hidden/);
});

test("only interactive Studio surfaces retain momentum scrolling", () => {
  assert.match(mobile, /#editor,[\s\S]*\.file-tree,[\s\S]*\.repl-output/);
  assert.match(mobile, /overscroll-behavior:\s*contain/);
  assert.match(mobile, /-webkit-overflow-scrolling:\s*touch/);
});
