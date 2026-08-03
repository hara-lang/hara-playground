# Roadmap

## Completed foundation

- Browser workbench shell and responsive layout.
- OPFS/localStorage workspace persistence.
- Canonical `project.edn`, `workspace.edn`, and `.hal` support.
- Public GitHub project import.
- Persistent REPL worker protocol and enclosing-form evaluation.
- Dependency-free InstaREPL form selection, debounced evaluation and aligned
  result/diagnostic rail.
- Data-driven Core, Data, HTA Interface and Inspect toolsets.
- Guided activities with dedicated workspace files and executable checks.
- Embedded evaluator for standalone development.
- Adapter and installer for the official Hara Studio runtime archive.
- Sandboxed HTA preview.
- CI, Pages workflow, tests, and documentation.

## Next — canonical Studio host integration

- Mount the browser workspace into the official kernel filesystem service.
- Route canonical stdout, traces, and structured values into the workbench.
- Use kernel sessions for project, scratch, tests, activities and disposable
  previews.
- Replace the fallback-only `hta/render` demo with canonical program/document
  host rendering.
- Enrich the current result rail with trace identity, expandable values and
  canonical diagnostics.

## Next — editor intelligence

- CodeMirror or Monaco desktop editor with a mobile-safe alternative.
- HAL tokenisation, balanced-form navigation, and structural selection.
- Evaluate selection, enclosing form, top-level form, namespace, and project.
- Completion, hover, definitions, references, diagnostics, and formatting from a
  Hara language-service worker.
- Macroexpansion and emitted representation views.
- Load project- and registry-provided toolsets and activities through a
  declarative capability model.

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
- Debugger, profiler, test runner, bytecode/HIR views, and CI integration.
