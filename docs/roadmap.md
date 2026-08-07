# Roadmap

## Completed foundation

- Hara visual-language project browser and material kernel workbench.
- Featured GitHub sample projects and arbitrary public repository opening.
- Commit-pinned monorepo subproject imports with root-prefix stripping.
- OPFS/localStorage Workspace persistence and active-project resume.
- Canonical `project.edn`, Hara-evaluated `workspace.edn`, and `.hal` support.
- Recursive Hodos `area`, `split` and `empty` Workspace shell projection.
- Accessible desktop splitters and compact Files, Code, Canvas, Audio, REPL and
  Learn surfaces.
- Persistent REPL, Problems and retained-value inspection through Hodos Dev
  components.
- Hodos Explorer, Catalog, Preview and Editor component boundaries.
- InstaREPL form selection, debounced evaluation and structural result views.
- Rainbow delimiters, Paredit transforms, formatting and kernel completion.
- Guided activities with private executable checks projected through descriptive
  Catalog models.
- Checksum-verified official Hara WASM runtime plus an embedded ordinary-project
  fallback.
- Sandboxed HTA preview, Supersonic Audio, CI, Pages, browser gates, tests and
  documentation.

## Next — canonical Workspace capabilities

- Mount browser Workspace files into the official kernel filesystem service.
- Use distinct kernel sessions for project, scratch, tests, activities and
  disposable previews.
- Project canonical stdout, traces, diagnostics and retained values without
  application-specific normalization layers.
- Add graph, canvas, document, program and node hosts selected by trusted
  installed component IDs.
- Route `workspace/extension-event` through declared extension schemas and
  consented browser capabilities.
- Define manifest migration/version rules and signed descriptor receipts.

## Next — language intelligence

- Canonical reflection for completion, hover, definitions, references and
  diagnostics.
- Namespace/project evaluation commands and a test runner.
- Macroexpansion, HIR, emitted representation and bytecode views.
- Project-aware formatting and multi-cursor structural transformations.
- Evaluate CodeMirror or Monaco as a richer rendering surface while retaining
  the current editor/kernel protocol and mobile-safe fallback.

## Next — GitHub App

- Authentication without exposing long-lived tokens to the browser runtime.
- Private repositories and branch selection.
- Refresh/rebase, diff, stage, commit, push and pull-request creation.
- Server-side archive import for large repositories.

## Next — Hara visual programming

- Materialize Workspace nodes, connections and links through replaceable Hodos
  canvas/rendering packages.
- Atom/watch dataflow visualizers and controllers.
- Interactive HTA events routed to explicit kernel sessions.
- Shareable project/session links.

## Later

- Package registry and immutable dependency cache.
- Collaborative editing and shared REPL sessions.
- Optional remote JVM/native runners for non-browser capabilities.
- Debugger, profiler, CI integration and signed project receipts.
