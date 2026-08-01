# Architecture

## Runtime topology

```text
Browser page
├── workbench UI
├── OPFS workspace
├── GitHub importer
├── sandboxed preview iframe
└── Studio runtime worker
    ├── official adapter
    │   └── Hara browser broker
    │       └── HTA worker + hara.wasm kernel
    └── embedded evaluator fallback
```

The workbench never evaluates HAL directly on the page thread. The runtime
worker owns language state and returns display values, diagnostics, output, and
host effects.

## Project loading

1. Load file paths and contents from OPFS.
2. Prefer canonical `project.edn`; accept the earlier `hara.project.edn` shape
   for migration.
3. Read `:project/main` as the initial namespace.
4. Filter `.hal` files through `:project/source-paths` so tests, examples, and vendored packages are not executed during boot.
5. Evaluate the selected sources in deterministic path order.
6. Restore the configured main namespace for the live REPL.

`workspace.edn` is already seeded in canonical form. The current UI uses its own
fixed workbench layout; a later milestone will instantiate areas, documents,
nodes, connections, and links directly from the descriptor.

## Workspace storage

`WorkspaceStore` presents a small asynchronous file API. It selects:

1. Origin Private File System when supported;
2. localStorage as a compatibility fallback;
3. an in-memory backend for tests and non-browser environments.

GitHub imports use workspace IDs of the form:

```text
github.com/OWNER/REPOSITORY/BRANCH
```

The active workspace and its metadata are recorded separately in localStorage so a reload returns to the same OPFS tree. Local edits never mutate GitHub automatically.

## Runtime choices

### Canonical

The official archive is installed under `runtime/`. `CanonicalHaraRuntime`
creates a dedicated broker kernel named `STUDIO`, evaluates source through it,
and recreates it on reset.

### Embedded

The fallback evaluator keeps the application runnable without generated binary
artifacts. It is a development convenience, not a second Hara implementation to
maintain indefinitely.

## Preview boundary

Preview output is rendered into an iframe using `srcdoc` and `sandbox=""`.
Generated documents include a restrictive Content Security Policy. HTA tags and
attributes pass through an allow-list; event attributes and `srcdoc` are removed.
The preview receives neither workspace handles nor GitHub credentials.

## GitHub import

The importer uses GitHub REST metadata, branch, recursive tree, and content
endpoints. It applies:

- a text-extension allow-list, including `.hal`;
- a maximum file size;
- a maximum file count;
- bounded download concurrency;
- progress events.

A GitHub App backend is required for private repositories, higher reliable rate
limits, archive streaming, Git object operations, and pull requests.

## Stable seams

The most important contracts are:

- `WorkspaceStore` file operations;
- canonical Hara project descriptors;
- page-to-runtime worker messages;
- runtime adapter methods;
- capability-checked host effects;
- HTA preview rendering.
