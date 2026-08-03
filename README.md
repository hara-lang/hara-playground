# Hara Playground

The browser-native Hara development environment published at
`playground.hara-lang.org`.

Hara Playground opens a local project, a canonical bundled example, or a public
GitHub repository; persists it in the browser; boots a long-lived Hara kernel in
a Web Worker; exposes a live REPL and InstaREPL result rail; and renders HTA
output in a sandboxed preview.

![Status: prototype](https://img.shields.io/badge/status-working%20prototype-21c78e)
![License: EPL 2.0](https://img.shields.io/badge/license-EPL--2.0-8b93ff)

## What was merged

This repository previously contained the original standalone Playground shell.
That exact version is preserved on the branch
`archive/standalone-playground-2026-07` at commit
`7ef62c7801c52349f11f0b7d5f63efc0f3738131`.

The current implementation uses the modular Hara Studio workbench while keeping
the strongest parts of the original repository:

- checksum-pinned installation of the official Hara Studio runtime release;
- the canonical runtime example catalog, including Starter, Browser Game and Music;
- the existing `playground.hara-lang.org` GitHub Pages deployment;
- canonical `project.edn`, `workspace.edn`, and `.hal` conventions.

The old canvas, WebGL, audio, publishing and structural-editor experiments are
still available on the archive branch and can be ported as focused capability
modules instead of retaining a second monolithic application host. See
[the migration note](docs/migration.md).

## Implemented

- Persistent OPFS workspaces with a localStorage fallback.
- Local project, bundled example, and public GitHub repository loading.
- Commit-pinned raw GitHub downloads with file count and size limits.
- File explorer with create, edit, autosave, explicit save, and delete.
- Active workspace restoration across browser reloads.
- Persistent worker-backed REPL with namespace state and command history.
- Dependency-free InstaREPL evaluation of the selection, current complete form,
  or atom line after a short idle delay.
- An aligned live result and diagnostic rail that does not flood the ordinary
  REPL transcript.
- `Alt+Enter` enclosing-form evaluation, `Ctrl/Cmd+Enter` file loading, and
  `Ctrl/Cmd+Shift+Enter` InstaREPL toggling.
- Selectable Core HAL, Data, HTA Interface, and Inspect & Debug toolsets with
  insertable source templates.
- Guided activities stored as dedicated workspace files, with non-destructive
  open/reset behaviour and executable runtime checks.
- Official Hara WASM kernel adapter with an embedded development fallback.
- Sandboxed HTA preview with restrictive Content Security Policy.
- Runtime-packaged Starter, Browser Game and Music examples in production.
- Responsive desktop/mobile layouts and dark/light themes.
- Unit tests, syntax checks, CI, and GitHub Pages deployment.
- Zero runtime npm dependencies.

## Run locally

```bash
npm run dev
```

Open `http://localhost:4173`.

```bash
npm run check
npm test
npm run build
```

The embedded evaluator is used when the official runtime is absent. The built-in
activity starters and documented solutions are tested against that evaluator.

## Install the pinned official runtime

```bash
npm run runtime:download
npm run dev
```

The download is declared in `runtime.lock.json` and verified with SHA-256 before
being extracted. The deployment workflow performs this step automatically.

A locally built runtime archive can also be installed:

```bash
# In hara-lang/hara
make studio-build

# Extract the generated archive, then in this repository:
npm run runtime:install -- /path/to/hara-studio-runtime-VERSION
```

The adapter expects:

```text
runtime/rust/hara.wasm
runtime/rust/hta-worker.js
runtime/rust/hta-shared-worker.js
runtime/rust/host/broker.js
runtime/rust/host/services.js
```

## Canonical project shape

```text
my-project/
├── project.edn
├── workspace.edn
└── src/
    └── app/
        └── core.hal
```

```clojure
{:hara/type :project
 :hara/version "1.0.0"
 :project/id example.app
 :project/version "0.1.0"
 :project/source-paths ["src"]
 :project/test-paths ["test"]
 :project/extension-paths ["extensions"]
 :project/main app.core
 :project/capabilities
 #{:studio/eval}}
```

## Open a GitHub project

Paste any of these into the toolbar:

```text
hara-lang/hara
https://github.com/owner/repository
https://github.com/owner/repository/tree/branch-name
```

Deep links are also supported:

```text
https://playground.hara-lang.org/?repo=owner/repository
https://playground.hara-lang.org/?repo=owner/repository&branch=feature/name
https://playground.hara-lang.org/#github/owner/repository
```

## Toolsets and activities

The Playground toolbar selects a toolset and filters the available guided
activities. Tool buttons insert small HAL templates at the current selection.
Opening an activity creates `src/activities/<activity>.hal` only when absent;
resetting is the explicit destructive action. Activity checks execute inside the
same worker runtime as the editor and REPL.

The initial catalog lives in `src/studio/catalog.js`. See
[InstaREPL, toolsets and activities](docs/instarepl-activities.md) for the
selection rules, catalog schema, check execution model and extension direction.

## Repository layout

```text
hara-playground/
├── index.html
├── runtime.lock.json
├── runtime/                  # installed official runtime artifacts
├── src/
│   ├── app/
│   ├── editor/
│   ├── examples/
│   ├── github/
│   ├── runtime/
│   ├── studio/               # toolset and activity catalog
│   ├── ui/
│   ├── workspace/
│   ├── main.js
│   └── styles.css
├── examples/hello/
├── tests/
├── docs/
└── scripts/
```

## Design documents

- [Architecture](docs/architecture.md)
- [Runtime adapter](docs/runtime-adapter.md)
- [Worker protocol](docs/worker-protocol.md)
- [Security model](docs/security.md)
- [InstaREPL, toolsets and activities](docs/instarepl-activities.md)
- [Migration from the original Playground](docs/migration.md)
- [Roadmap](docs/roadmap.md)

## License

Eclipse Public License 2.0.
