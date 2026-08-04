# Roadmap

## Completed foundation

- Hara visual-language project browser and material kernel workbench.
- Featured GitHub sample projects and arbitrary public repository opening.
- Commit-pinned monorepo subproject imports with root-prefix stripping.
- OPFS/localStorage workspace persistence and active-project resume.
- Canonical `project.edn`, `workspace.edn`, and `.hal` support.
- Persistent REPL worker protocol and enclosing-form evaluation.
- InstaREPL form selection, debounced evaluation and aligned result rail.
- Rainbow delimiters, pair matching and malformed-form signals.
- Paredit-style balanced insertion/deletion, smart indentation, structural
  selection, wrapping, forward slurp and forward barf.
- Kernel-worker completion for core forms, built-ins, namespace values and
  project symbols.
- Data-driven Core, Data, HTA Interface and Inspect toolsets.
- Guided activities with dedicated workspace files and executable checks.
- Embedded evaluator plus adapter/installer for the official Hara WASM kernel.
- Sandboxed HTA preview, CI, Pages deployment, tests and documentation.

## Next — canonical Studio host integration

- Mount the browser workspace into the official kernel filesystem service.
- Route canonical stdout, traces, diagnostics and structured values into the
  workbench.
- Use distinct kernel sessions for project, scratch, tests, activities and
  disposable previews.
- Materialise the capability providers required by canvas, input and audio
  projects while keeping browser projection explicit.
- Enrich the result rail with trace identity and expandable retained values.

## Next — language intelligence

- Canonical language-service reflection for completion, hover, definitions,
  references and diagnostics.
- Namespace/project evaluation commands and a test runner.
- Macroexpansion, HIR, emitted representation and bytecode views.
- Project-aware formatting and multi-cursor structural transformations.
- Load project- and registry-provided toolsets and activities through a
  declarative capability model.
- Evaluate CodeMirror or Monaco as a richer rendering surface while retaining
  the current editor/kernel protocol and mobile-safe fallback.

## Next — GitHub App

- Authentication without exposing long-lived tokens to the browser runtime.
- Private repositories.
- Branch selection and refresh/rebase workflow.
- Diff, stage, commit, push, and pull-request creation.
- Server-side archive import for large repositories.

## Next — Hara visual programming

- Materialise canonical workspace areas and links from `workspace.edn`.
- Graph, canvas, document, program, and node host capabilities.
- Atom/watch dataflow visualisers and controllers.
- Interactive HTA events routed back to explicit kernel sessions.
- Shareable project/session links.

## Later

- Package registry and immutable dependency cache.
- Collaborative editing and shared REPL sessions.
- Optional remote JVM/native runners for non-browser capabilities.
- Debugger, profiler, CI integration and signed project receipts.
