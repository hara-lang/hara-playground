import assert from "node:assert/strict";
import test from "node:test";
import {
  HODOS_REPL_AREA_ID,
  HODOS_REPL_COMPONENT_ID,
  replWorkspacePatch,
} from "../src/hodos/repl-events.js";

const base = {
  "component/id": HODOS_REPL_COMPONENT_ID,
  "area/id": HODOS_REPL_AREA_ID,
};

test("Hodos REPL input and submit events project source", () => {
  assert.deepEqual(replWorkspacePatch({ ...base, "event/type": "repl/input", source: "(+ 1" }), {
    kind: "input",
    source: "(+ 1",
  });
  assert.deepEqual(replWorkspacePatch({ ...base, "event/type": "repl/submit", source: "(+ 1 2)" }), {
    kind: "submit",
    source: "(+ 1 2)",
  });
});

test("Hodos REPL projects clear, history and cancel commands", () => {
  assert.deepEqual(replWorkspacePatch({ ...base, "event/type": "repl/clear" }), { kind: "clear" });
  assert.deepEqual(replWorkspacePatch({ ...base, "event/type": "repl/history", direction: -1 }), {
    kind: "history",
    direction: -1,
  });
  assert.deepEqual(replWorkspacePatch({ ...base, "event/type": "repl/cancel" }), { kind: "cancel" });
});

test("unrelated REPL components, areas and events are ignored", () => {
  assert.equal(replWorkspacePatch({ ...base, "component/id": "hodos.dev/editor", "event/type": "repl/clear" }), null);
  assert.equal(replWorkspacePatch({ ...base, "area/id": "repl/other", "event/type": "repl/clear" }), null);
  assert.equal(replWorkspacePatch({ ...base, "event/type": "repl/unknown" }), null);
  assert.equal(replWorkspacePatch(null), null);
});

test("malformed authoritative REPL events fail closed", () => {
  assert.throws(() => replWorkspacePatch({ ...base, "event/type": "repl/submit", source: null }), /requires string source/);
  assert.throws(() => replWorkspacePatch({ ...base, "event/type": "repl/history", direction: 0 }), /must be -1 or 1/);
});
