import test from "node:test";
import assert from "node:assert/strict";
import { isHtaTree, toPlainHta } from "../src/runtime/hta-value.js";

class HtaKeyword {
  constructor(name) { this.name = name; }
}

class HtaSymbol {
  constructor(name) { this.name = name; }
}

test("normalises official HTA values for the sandbox renderer", () => {
  const value = [
    new HtaKeyword("main"),
    new Map([[new HtaKeyword("class"), "preview-shell"]]),
    [new HtaKeyword("h1"), new HtaSymbol("hello")]
  ];
  assert.equal(isHtaTree(value), true);
  assert.deepEqual(toPlainHta(value), [":main", { class: "preview-shell" }, [":h1", "hello"]]);
});

test("does not classify ordinary vectors as HTA trees", () => {
  assert.equal(isHtaTree([1, 2, 3]), false);
});
