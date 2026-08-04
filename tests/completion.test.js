import test from "node:test";
import assert from "node:assert/strict";
import { completionItems } from "../src/language/completion.js";

test("kernel completion merges core, namespace and project symbols", () => {
  const items = completionItems({
    prefix: "sq",
    namespaceSymbols: ["square"],
    source: "(def square-all square)"
  });
  assert.deepEqual(items.map((item) => item.label), ["square", "square-all"]);
  assert.equal(items[0].kind, "var");
});

test("special forms and builtins carry useful completion kinds", () => {
  const special = completionItems({ prefix: "le" })[0];
  const builtin = completionItems({ prefix: "pri", builtins: ["println"] })[0];
  assert.deepEqual([special.label, special.kind], ["let", "special"]);
  assert.deepEqual([builtin.label, builtin.kind], ["println", "function"]);
});
