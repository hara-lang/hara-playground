import test from "node:test";
import assert from "node:assert/strict";
import { readAll, tokenize } from "../src/runtime/reader.js";

test("tokenizer skips comments and reads escaped strings", () => {
  const tokens = tokenize('(println "hello\\nworld") ; comment\n42');
  assert.equal(tokens.filter((token) => token.type === "string")[0].value, "hello\nworld");
  assert.equal(tokens.at(-1).value, "42");
});

test("reader parses lists, vectors, maps and quote", () => {
  const forms = readAll("'(a [1 :two] {:ok true})");
  assert.equal(forms.length, 1);
  assert.equal(forms[0].type, "list");
  assert.equal(forms[0].items[0].name, "quote");
  assert.equal(forms[0].items[1].items[2].type, "map");
});

test("reader reports unbalanced collections", () => {
  assert.throws(() => readAll("(+ 1 2"), /Expected '\)'/);
});
