import test from "node:test";
import assert from "node:assert/strict";
import { formAtCursor, topLevelCollections } from "../src/editor/forms.js";

test("finds the enclosing top-level HAL form", () => {
  const source = `(ns app.core)\n\n(defn greet [name]\n  (str "Hello " name))\n\n(greet "Hara")`;
  const cursor = source.indexOf("Hello");
  assert.equal(formAtCursor(source, cursor), `(defn greet [name]\n  (str "Hello " name))`);
});

test("scanner ignores delimiters in strings and comments", () => {
  const source = `(def text "not ) closed")\n; (ignored)\n(+ 1 2)`;
  assert.deepEqual(topLevelCollections(source), [
    { start: 0, end: 25 },
    { start: 38, end: 45 }
  ]);
});

test("falls back to the current atom line", () => {
  assert.equal(formAtCursor("answer\n", 2), "answer");
  assert.equal(formAtCursor("\n   \n", 2), null);
});
