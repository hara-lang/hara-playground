import test from "node:test";
import assert from "node:assert/strict";
import {
  backspaceBalanced,
  collectSourceSymbols,
  completionPrefixAt,
  expandStructuralSelection,
  formatHara,
  forwardBarf,
  forwardSlurp,
  highlightHara,
  insertBalanced,
  matchingDelimiterIndices,
  smartNewline,
  wrapStructural
} from "../src/editor/lisp.js";

test("renders spectrum parens and marks the matching pair", () => {
  const source = "(let [x {:value 42}] x)";
  const html = highlightHara(source, 1);
  assert.match(html, /paren-depth-0/);
  assert.match(html, /paren-depth-1/);
  assert.equal(matchingDelimiterIndices(source, 1).size, 2);
  assert.match(html, /paren-match/);
});

test("completions ignore strings and collect project definitions", () => {
  assert.deepEqual(completionPrefixAt("(pri", 4), { prefix: "pri", start: 1, end: 4 });
  assert.equal(completionPrefixAt('(str "pri', 9), null);
  assert.deepEqual(collectSourceSymbols("(ns demo.core)\n(def answer 42)\n(defn square [x] x)"), ["answer", "demo.core", "square"]);
});

test("paredit inserts and removes balanced delimiters", () => {
  const inserted = insertBalanced("abc", 0, 3, "(");
  assert.equal(inserted.source, "(abc)");
  assert.deepEqual([inserted.selectionStart, inserted.selectionEnd], [1, 4]);
  const removed = backspaceBalanced("()", 1, 1);
  assert.equal(removed.source, "");
  assert.equal(removed.selectionStart, 0);
});

test("smart newline opens an indented empty form", () => {
  const edit = smartNewline("()", 1, 1);
  assert.equal(edit.source, "(\n  \n)");
  assert.equal(edit.selectionStart, 4);
});

test("structural selection, wrapping, slurp and barf preserve balanced source", () => {
  const source = "(foo a) b";
  const expanded = expandStructuralSelection(source, 3, 3);
  assert.deepEqual([expanded.selectionStart, expanded.selectionEnd], [0, 7]);
  assert.equal(wrapStructural("foo", 0, 3, "[").source, "[foo]");
  assert.equal(forwardSlurp(source, 4).source, "(foo a b)");
  assert.equal(forwardBarf("(foo a b)", 4).source, "(foo a) b");
});

test("formatter applies structural indentation without rewriting forms", () => {
  assert.equal(
    formatHara("(defn square [x]\n(* x x))\n\n(let [a 1]\n(+ a 2))"),
    "(defn square [x]\n  (* x x))\n\n(let [a 1]\n  (+ a 2))"
  );
});
