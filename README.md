# Hara Playground

The browser-native Hara project browser and live kernel editor published at
`playground.hara-lang.org`.

Hara Playground opens a local project, a featured sample project, or a public
GitHub repository; persists it in the browser; boots a long-lived Hara kernel in
a Web Worker; exposes REPL and InstaREPL workflows; renders HTA output in a
sandboxed preview; and routes declared Supersonic graphs to browser-owned audio
output.

![Status: prototype](https://img.shields.io/badge/status-working%20prototype-21c78e)
![License: EPL 2.0](https://img.shields.io/badge/license-EPL--2.0-8b93ff)

## Interface

The Playground starts with a Hodos-style project browser rather than dropping a
new user into an empty IDE. It provides:

- an arbitrary public GitHub project field;
- resume for the active browser-persisted workspace;
- complete GitHub sample projects for live values, HTA composition, a decision
  model, and Supersonic audio live coding; and
- a local scratch project using the same project and kernel model.

After a project opens, the workbench presents a project tree, structural Hara
editor, kernel status, toolsets and activities, Preview, REPL, and a
capability-gated Audio output. The interface uses the Hara precision-material
visual language: quiet neutral surfaces, one kernel-depth field, and cyan → blue
→ violet reserved for state, focus, and structural depth.

## Lisp editor

The dependency-free editor now includes:

- rainbow parentheses, brackets, and braces with matching-pair and malformed
  delimiter signals;
- Paredit-style balanced insertion, paired deletion, structural indentation,
  selection expansion, wrap, forward slurp, and forward barf;
- project-aware symbol completion requested through the kernel worker;
- buffer formatting;
- an aligned InstaREPL result rail; and
- explicit form, file, and REPL evaluation.

Keyboard highlights:

```text
Ctrl/Cmd + Space              kernel completion
Alt + Enter                   evaluate selection/enclosing form
Ctrl/Cmd + Enter              load current file
Ctrl/Cmd + Shift + Enter      toggle InstaREPL
Alt + Arrow Up                expand structural selection
Ctrl/Cmd + Shift + 9          wrap form
Ctrl/Cmd + Alt + Arrow Right  forward slurp
Ctrl/Cmd + Alt + Arrow Left   forward barf
Ctrl/Cmd + Shift + F          format buffer
```

See [Visual Playground and structural Hara editor](docs/playground-interface.md)
for the interaction model and kernel boundary.

## Supersonic live coding

Open the complete featured project:

```text
https://playground.hara-lang.org/?repo=hara-lang/hara-playground&branch=main&path=samples/supersonic-live
```

The project declares `:audio/playback`, starts a silent graph, and exposes its
control metadata in the Audio output. Press **Play** once to authorize Web Audio,
then evaluate forms without restarting the kernel:

```clojure
(sonic/update "playground/supersonic-live" "transport" "tempo" 138)
(sonic/update "playground/supersonic-live" "source" "waveform" "saw")
(sonic/update "playground/supersonic-live" "source" "root" 55)
(sonic/update "playground/supersonic-live"
              "sequence"
              "steps"
              [0 3 7 10 12 10 7 3])
```

The `AudioContext` and audio nodes stay on the page; the kernel exchanges only
plain graph, control, status, and stop messages. See
[Supersonic audio live coding](docs/audio-live-coding.md) for the graph contract,
supported browser renderer, capability boundary, and authoring workflow.

## Implemented foundation

- Persistent OPFS workspaces with a localStorage fallback.
- Active-workspace restoration across browser reloads.
- Public GitHub repository import pinned to a resolved commit.
- Monorepo subproject imports using a scoped `path` with prefix stripping.
- File explorer with create, edit, autosave, explicit save, and delete.
- Persistent worker-backed REPL with namespace state and command history.
- InstaREPL evaluation of the selection, complete form, or atom line.
- Core HAL, Data, HTA Interface, and Inspect & Debug toolsets.
- Guided activities with dedicated files and executable kernel checks.
- Official Hara WASM kernel adapter with an embedded development fallback.
- Request-correlated worker-to-page host calls for browser-only capabilities.
- Project-declared capability grants parsed from canonical `project.edn` files.
- Supersonic Audio output with graph-derived controls and explicit user-gesture
  authorization.
- Per-workspace audio state, graph overlay isolation, and authorization
  revocation on kernel boot.
- Sandboxed HTA preview with restrictive Content Security Policy.
- Responsive desktop/mobile layouts and one-press light/dark switching.
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

The embedded evaluator is used when the official runtime is absent. It does not
implement canonical host calls, so Supersonic projects require the installed
WASM runtime.

## Install the pinned official runtime

```bash
npm run runtime:download
npm run dev
```

The download is declared in `runtime.lock.json` and verified with SHA-256 before
being extracted. A locally built runtime archive can also be installed:

```bash
# In hara-lang/hara
make studio-build

# In this repository
npm run runtime:install -- /path/to/hara-studio-runtime-VERSION
```

The minimum canonical adapter contract is:

```text
runtime/rust/hara.wasm
runtime/rust/hta-worker.js
runtime/rust/hta-shared-worker.js
runtime/rust/host/broker.js
runtime/rust/host/services.js
```

The Playground carries a local HAL compatibility resource for the currently
pinned archive. A newly built, Supersonic-complete Studio archive additionally
provides the canonical reusable provider and namespace:

```text
runtime/rust/studio/supersonic.js
runtime/rust/studio/hal/supersonic.hal
```

The browser-owned renderer remains in `src/audio`; packaging the canonical
provider lets other Studio hosts consume the same Supersonic contract.

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

An audio project opts in explicitly:

```clojure
:project/capabilities
#{:studio/eval
  :audio/playback}
```

The workbench ignores capabilities it does not recognize, and the worker grants
only capabilities supported by the current host.

## Open a GitHub project

Paste any of these into the project browser:

```text
hara-lang/hara
https://github.com/owner/repository
https://github.com/owner/repository/tree/branch-name
```

Deep links support repositories and monorepo project directories:

```text
https://playground.hara-lang.org/?repo=owner/repository
https://playground.hara-lang.org/?repo=owner/repository&branch=feature/name
https://playground.hara-lang.org/?repo=owner/repository&branch=main&path=examples/project
https://playground.hara-lang.org/#github/owner/repository
```

## Repository layout

```text
hara-playground/
├── index.html
├── runtime.lock.json
├── runtime/                  # installed official runtime artifacts
├── samples/                  # complete GitHub-openable Hara projects
├── src/
│   ├── app/
│   ├── assets/
│   ├── audio/                # Supersonic provider, UI bridge, Web Audio engine
│   ├── editor/
│   ├── examples/
│   ├── github/
│   ├── language/
│   ├── runtime/
│   ├── studio/
│   ├── styles/
│   ├── ui/
│   ├── workspace/
│   ├── main.js
│   └── styles.css
├── tests/
├── docs/
└── scripts/
```

## Design documents

- [Architecture](docs/architecture.md)
- [Runtime adapter](docs/runtime-adapter.md)
- [Worker protocol](docs/worker-protocol.md)
- [Security model](docs/security.md)
- [Supersonic audio live coding](docs/audio-live-coding.md)
- [Visual Playground and structural editor](docs/playground-interface.md)
- [InstaREPL, toolsets and activities](docs/instarepl-activities.md)
- [Migration from the original Playground](docs/migration.md)
- [Roadmap](docs/roadmap.md)

## License

Eclipse Public License 2.0.
