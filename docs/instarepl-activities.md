# InstaREPL, toolsets and activities

Hara Play includes a dependency-free live editing layer on top of the
persistent worker runtime. It is intentionally implemented independently of the
`textarea` renderer so the same behaviour can later be attached to CodeMirror,
Monaco, a structural editor, or a visual document surface.

## InstaREPL behaviour

InstaREPL is enabled by default for `.hal` and legacy `.hara` source files. After
the editor is idle for 420 ms, the Play chooses one evaluation target:

1. the current non-empty selection;
2. the smallest complete top-level collection containing the cursor; or
3. the current atom or string line.

Incomplete collection lines are ignored while they are being typed. This keeps
normal parenthesis entry from producing avoidable reader errors. The selected
form is evaluated in the current persistent namespace, without adding input and
result lines to the ordinary REPL transcript. Its value or diagnostic is shown
in a result rail aligned with the final line of the form.

Every candidate has a source-and-range identity. New edits invalidate older
requests so a late response cannot replace the current annotation. Runtime side
effects remain real: stdout is added to the REPL output and HTA/HTML effects
refresh the sandboxed preview.

InstaREPL can be toggled from the toolbar or with
`Ctrl/Cmd + Shift + Enter`. Manual evaluation remains available:

- `Alt + Enter` evaluates the selection or enclosing form and records it in the
  REPL transcript.
- `Ctrl/Cmd + Enter` loads the current file into the runtime.

## Toolset catalog

`src/studio/catalog.js` is the built-in registry for editor toolsets. A toolset
contains an identifier, display metadata and small source templates:

```js
{
  id: "core",
  title: "Core HAL",
  description: "Values, functions, bindings and control flow.",
  tools: [
    {
      id: "function",
      label: "Function",
      description: "Define a reusable function.",
      snippet: "(defn square [x]\n  (* x x))"
    }
  ]
}
```

The first built-in catalog provides four focused sets:

- **Core HAL** — values, functions, local bindings and conditions.
- **Data** — vectors, maps, lookup and immutable updates.
- **HTA Interface** — elements, components, views and preview effects.
- **Inspect & Debug** — stdout, type inspection and executable checks.

Selecting a tool inserts its source at the current editor selection. Toolsets
are presentation and authoring aids; they do not silently grant runtime
capabilities.

## Guided activities

Activities use the same catalog and are associated with one toolset. Each
activity declares a dedicated workspace path, starter source, instructions and
runtime checks:

```js
{
  id: "square-function",
  toolsetId: "core",
  path: "src/activities/square-function.hal",
  source: "...",
  checks: [
    {
      id: "square-9",
      label: "square 9 is 81",
      expression: "(= (square 9) 81)",
      expected: "true"
    }
  ]
}
```

Opening an activity creates its file only when it does not already exist, so
returning to an exercise preserves the learner's work. **Reset** explicitly
restores the starter source. **Check** loads the activity file into the same
worker session and evaluates each check expression in sequence. The activity
panel shows individual outcomes and a summary, while the REPL receives one
completion message.

The initial activities cover a live value, a function, immutable profile data,
an HTA status card and an observable conditional branch. All starter programs
and documented solutions are exercised against the embedded evaluator in the
test suite.

## Extension direction

The catalog is local and static in this first version, but its schema is meant to
become a loading boundary. A later implementation can merge toolsets and
activities from:

- `workspace.edn` learning configuration;
- project packages and immutable registry artifacts;
- a Hara specification or course repository; and
- capability-aware canonical kernel sessions.

External catalogs should remain declarative. Source execution and checks must
continue through the existing worker protocol rather than allowing arbitrary
JavaScript callbacks in activity definitions.
