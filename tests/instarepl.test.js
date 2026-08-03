import test from "node:test";
import assert from "node:assert/strict";
import { instantCandidateChanged, instantFormAtCursor, lineNumberAt } from "../src/editor/instarepl.js";

test("selects the complete top-level form and records its line range", () => {
  const source = `(ns app.core)\n\n(defn square [x]\n  (* x x))\n\n(square 9)`;
  const candidate = instantFormAtCursor(source, { cursor: source.indexOf("* x") });
  assert.equal(candidate.source, `(defn square [x]\n  (* x x))`);
  assert.equal(candidate.kind, "form");
  assert.equal(candidate.startLine, 3);
  assert.equal(candidate.endLine, 4);
});

test("a non-empty selection takes priority and is trimmed", () => {
  const source = `  (+ 1 2)  \n(+ 3 4)`;
  const candidate = instantFormAtCursor(source, { selectionStart: 0, selectionEnd: 11, cursor: 5 });
  assert.equal(candidate.source, `(+ 1 2)`);
  assert.equal(candidate.kind, "selection");
  assert.equal(candidate.start, 2);
  assert.equal(candidate.end, 9);
});

test("does not evaluate an incomplete collection while it is being typed", () => {
  const source = `(defn greet [name]\n  (str "Hello " name)`;
  assert.equal(instantFormAtCursor(source, { cursor: source.length }), null);
});

test("falls back to a complete atom line", () => {
  const source = `(def answer 42)\n\nanswer\n`;
  const candidate = instantFormAtCursor(source, { cursor: source.indexOf("answer", 16) + 2 });
  assert.equal(candidate.source, "answer");
  assert.equal(candidate.kind, "line");
  assert.equal(candidate.startLine, 3);
});

test("candidate identity changes with source or range", () => {
  const first = instantFormAtCursor("(+ 1 2)", { cursor: 3 });
  const same = instantFormAtCursor("(+ 1 2)", { cursor: 5 });
  const changed = instantFormAtCursor("(+ 1 3)", { cursor: 3 });
  assert.equal(instantCandidateChanged(first, same), false);
  assert.equal(instantCandidateChanged(first, changed), true);
  assert.equal(lineNumberAt("a\nb\nc", 4), 3);
});


test("keeps semicolons inside strings and includes a quote prefix", () => {
  const line = '"a;b" ; trailing comment';
  assert.equal(instantFormAtCursor(line, { cursor: 2 }).source, '"a;b"');

  const quoted = "'[1 2 3]";
  assert.equal(instantFormAtCursor(quoted, { cursor: 4 }).source, quoted);
});
