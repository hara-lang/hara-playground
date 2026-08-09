import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Execution composes the pinned Hodos host instead of defining a Playground renderer", async () => {
  const [integration, styles, main] = await Promise.all([
    read("src/hodos/execution.js"),
    read("src/styles.css"),
    read("src/main.js"),
  ]);
  assert.match(integration, /registerHodosExecutionDomUi\(registry\)/);
  assert.match(integration, /createWorkspaceAreaHost/);
  assert.match(integration, /executionAreaFromPlayground/);
  assert.match(integration, /editorSelectionEventFromExecution/);
  assert.doesNotMatch(integration, /WebAssembly\.instantiate|new\s+Machine|session\.handle/);
  assert.match(styles, /vendor\/hodos\/packages\/dev-ui\/src\/execution\.css/);
  assert.match(main, /mountHodosExecution\(state\)/);
});

test("the observation host is lazy and absent from serializable application state", async () => {
  const [controller, context] = await Promise.all([
    read("src/runtime/bytecode-observation-controller.js"),
    read("src/app/context.js"),
  ]);
  assert.match(controller, /await import\(DEFAULT_HOST_URL\.href\)/);
  assert.match(controller, /function defaultLoadRuntime/);
  assert.doesNotMatch(context, /bytecode-observation\.js|BytecodeObservationRuntime|BytecodeObservationSession/);
  assert.match(context, /execution: createPlaygroundExecutionState\(\)/);
});

test("the runtime lock can add observation files only as one atomic pair", async () => {
  const lock = JSON.parse(await read("runtime.lock.json"));
  const wasm = lock.required.includes("rust/bytecode-observation.wasm");
  const host = lock.required.includes("rust/host/bytecode-observation.js");
  assert.equal(wasm, host, "the Wasm and host files must be required together");
});
