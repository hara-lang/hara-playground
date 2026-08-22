# Architecture

## Runtime and Workspace topology

```text
Browser page
├── WorkspaceStore (OPFS, localStorage or memory)
├── GitHub importer pinned to a resolved commit
├── Play application policy
│   ├── project/editor/output host mapping
│   ├── nested output tabs and focus
│   └── capability and Audio policy
├── Hodos recursive responsive Workspace shell
│   ├── area/split/empty geometry
│   ├── desktop splitters
│   └── compact Files/Code/Canvas/Audio/REPL/Learn surfaces
└── Studio runtime worker
    ├── official adapter
    │   └── Hara browser broker
    │       └── HTA worker + hara.wasm kernel
    └── embedded evaluator fallback
```

The page thread never evaluates HAL or `workspace.edn` itself. The runtime
worker owns language state and returns display values, diagnostics, retained
values and host effects.

## Project loading

1. Load file paths and contents from the current browser Workspace.
2. Prefer canonical `project.edn`; accept the earlier `hara.project.edn` shape
   only for migration.
3. Read `:project/main` as the initial namespace.
4. Filter `.hal` files through `:project/source-paths`.
5. Evaluate selected sources in deterministic path order.
6. Restore the configured main namespace for the live REPL.
7. Evaluate `workspace.edn` through Hara, retain the value and inspect it into a
   bounded serializable Workspace view.
8. Project manifest roles into installed Play hosts and mount them through
   the Hodos Workspace shell.

A missing or invalid Workspace manifest selects the standard fallback shell.
Invalid manifests also enter structured Problems state without taking down the
kernel. See [Workspace manifests](workspace-manifest.md).

## Authority split

```text
Hara
  project and Workspace descriptor evaluation
  language/runtime state
  workspace.* semantic state and events

Play
  browser storage and GitHub import
  product role mapping and installed adapters
  output tabs, Audio, focus and local presentation preferences

Hodos
  visible recursive layout and splitter mechanics
  compact surface presentation
  trusted component lifecycle and semantic-event boundaries
```

Manifest component descriptors are not executed by the Play projection.
Unknown area types remain inert placeholders.

## Workspace storage

`WorkspaceStore` presents a small asynchronous file API. It selects:

1. Origin Private File System when supported;
2. localStorage as a compatibility fallback;
3. an in-memory backend for tests and non-browser environments.

GitHub imports use commit-pinned Workspace identities. The active Workspace and
its metadata are recorded separately so a reload returns to the same OPFS tree.
Local edits never mutate GitHub automatically.

## Runtime choices

### Canonical

The checksum-verified official archive is installed under `runtime/`.
`CanonicalHaraRuntime` creates a dedicated broker kernel named `STUDIO`,
evaluates source and manifests through it, and recreates it on reset.

### Embedded

The fallback evaluator keeps ordinary projects runnable without generated
binary artifacts. It is a development convenience, not a second Hara runtime.
Canonical host calls and manifest value inspection that require the official
runtime remain explicitly unavailable.

## Preview boundary

Preview output is rendered into an iframe using `srcdoc` and `sandbox=""`.
Generated documents include a restrictive Content Security Policy. HTA tags and
attributes pass through an allow-list; event attributes and `srcdoc` are removed.
The preview receives neither Workspace handles nor GitHub credentials.

## GitHub import

The importer uses GitHub REST metadata, branch, recursive tree and content
endpoints. It applies a text-extension allow-list, file-size and count limits,
bounded concurrency and progress events. A GitHub App backend remains the seam
for private repositories, higher reliable rate limits and write workflows.

## Stable seams

- `WorkspaceStore` file operations;
- canonical `project.edn` and `workspace.edn` descriptors;
- page-to-runtime worker messages and retained-value inspection;
- Hodos Workspace shell and trusted component registries;
- capability-checked host effects;
- sandboxed HTA preview rendering.
