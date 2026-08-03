import test from "node:test";
import assert from "node:assert/strict";
import { previewDocument, renderHtaNode } from "../src/ui/hta.js";

test("renders HTA vectors to safe HTML", () => {
  const html = renderHtaNode([":main", { class: "shell", onclick: "bad()" }, [":h1", "Hello <Hara>"]]);
  assert.equal(html, '<main class="shell"><h1>Hello &lt;Hara&gt;</h1></main>');
});

test("preview document includes a restrictive CSP", () => {
  const html = previewDocument({ type: "render", tree: [":p", "Hi"] });
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /<p>Hi<\/p>/);
});
