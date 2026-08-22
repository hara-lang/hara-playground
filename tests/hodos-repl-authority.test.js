import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Play mounts the merged Hodos REPL component", async () => {
  const [integration, main] = await Promise.all([
    text("src/hodos/repl.js"),
    text("src/main.js"),
  ]);
  assert.match(integration, /createReplArea/);
  assert.match(integration, /registerHodosReplUi/);
  assert.match(integration, /createWorkspaceAreaHost/);
  assert.match(main, /mountHodosRepl\(state\)/);
  assert.match(main, /disposeHodosRepl\(\)/);
});

test("REPL interactions are semantic Hodos Workspace events", async () => {
  const integration = await text("src/hodos/repl.js");
  for (const type of ["repl/input", "repl/submit", "repl/clear", "repl/history", "repl/cancel"]) {
    assert.match(integration, new RegExp(`event/type\\\": \\\"${type.replace("/", "\\/")}`));
  }
  assert.match(integration, /new CustomEvent\("hodos:workspace-event"/);
  assert.match(integration, /output\.replaceChildren/);
  assert.match(integration, /abort\.abort\(\)/);
});

test("application state no longer binds direct REPL submit, clear or history handlers", async () => {
  const events = await text("src/app/events.js");
  assert.match(events, /replWorkspacePatch\(event\.detail\)/);
  assert.doesNotMatch(events, /replForm\?\.addEventListener\("submit"/);
  assert.doesNotMatch(events, /replInput\?\.addEventListener\("keydown"/);
  assert.doesNotMatch(events, /querySelector\("#clear-repl-button"\)\?\.addEventListener/);
});
