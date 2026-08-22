import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Play mounts the merged Hodos Problems component", async () => {
  const [integration, main, view] = await Promise.all([
    text("src/hodos/problems.js"),
    text("src/main.js"),
    text("src/app/view.js"),
  ]);
  assert.match(integration, /createProblemsArea/);
  assert.match(integration, /registerHodosProblemsUi/);
  assert.match(integration, /createWorkspaceAreaHost/);
  assert.match(main, /mountHodosProblems\(state\)/);
  assert.match(main, /disposeHodosProblems\(\)/);
  assert.match(view, /data-output-tab="problems"/);
  assert.match(view, /class="problems-view/);
});

test("runtime diagnostics remain in the REPL and also enter Problems state", async () => {
  const events = await text("src/app/events.js");
  assert.match(events, /problemFromDiagnostic\(event\.detail/);
  assert.match(events, /recordRuntimeProblem\(problem\)/);
  assert.match(events, /appendRepl\("diagnostic", problem\.message/);
  assert.match(events, /runtime\.addEventListener\("stdout"/);
  assert.match(events, /problemFromError\(event\.detail/);
});

test("Problems source, clipboard, filter and clear behavior remains Play policy", async () => {
  const [events, integration, actions] = await Promise.all([
    text("src/app/events.js"),
    text("src/hodos/problems.js"),
    text("src/app/actions.js"),
  ]);
  assert.match(events, /problemsWorkspacePatch\(event\.detail\)/);
  assert.match(events, /selectFile\(problem\.path, false\)/);
  assert.match(events, /navigator\?\.clipboard\?\.writeText/);
  assert.match(events, /clearProblemsState\(state\.problems\)/);
  assert.match(integration, /"event\/type": "problems\/filter"/);
  assert.match(integration, /textContent = problem\.message/);
  assert.doesNotMatch(integration, /innerHTML/);
  assert.match(actions, /recordActionProblem\(error/);
  assert.match(actions, /phase: "load-file"/);
});
