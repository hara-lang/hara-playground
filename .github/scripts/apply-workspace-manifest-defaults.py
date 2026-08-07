from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


SIMPLE_WORKSPACE = '''{:hara/type :workspace
 :hara/version "1.0.0"
 :workspace/id :__WORKSPACE_ID__
 :workspace/layout
 {:layout/type :split
  :layout/id "layout/root"
  :layout/direction :horizontal
  :layout/ratio 0.22
  :layout/first
  {:layout/type :area
   :layout/area "area/project"}
  :layout/second
  {:layout/type :split
   :layout/id "layout/work"
   :layout/direction :horizontal
   :layout/ratio 0.64
   :layout/first
   {:layout/type :area
    :layout/area "area/editor"}
   :layout/second
   {:layout/type :area
    :layout/area "area/preview"}}}
 :workspace/documents
 [{:document/id "document/main"
   :document/path "src/main.hal"
   :document/title "main.hal"
   :document/language :hal
   :document/dirty? false}]
 :workspace/areas
 [{:area/id "area/project"
   :area/type :project
   :area/title "Project"
   :area/presentation
   {:presentation/role :project
    :presentation/label "Files"}}
  {:area/id "area/editor"
   :area/type :code-editor
   :area/title "main.hal"
   :area/presentation
   {:presentation/role :editor
    :presentation/label "Code"}}
  {:area/id "area/preview"
   :area/type :output
   :area/title "Preview"
   :area/presentation
   {:presentation/role :output
    :presentation/label "Canvas"}}]
 :workspace/nodes []
 :workspace/connections []
 :workspace/links []
 :workspace/selection
 {:area/id "area/editor"
  :document/id "document/main"}
 :workspace/customizations
 {:responsive/breakpoint 1000}
 :workspace/extensions []
 :workspace/pending []
 :workspace/audit []}
'''

SUPERSONIC_WORKSPACE = '''{:hara/type :workspace
 :hara/version "1.0.0"
 :workspace/id :playground-supersonic-live
 :workspace/layout
 {:layout/type :split
  :layout/id "layout/root"
  :layout/direction :horizontal
  :layout/ratio 0.22
  :layout/first
  {:layout/type :area
   :layout/area "area/project"}
  :layout/second
  {:layout/type :split
   :layout/id "layout/work"
   :layout/direction :horizontal
   :layout/ratio 0.64
   :layout/first
   {:layout/type :area
    :layout/area "area/editor"}
   :layout/second
   {:layout/type :area
    :layout/area "area/audio"}}}
 :workspace/documents
 [{:document/id "document/main"
   :document/path "src/main.hal"
   :document/title "main.hal"
   :document/language :hal
   :document/dirty? false}]
 :workspace/areas
 [{:area/id "area/project"
   :area/type :project
   :area/title "Project"
   :area/presentation
   {:presentation/role :project
    :presentation/label "Files"}}
  {:area/id "area/editor"
   :area/type :code-editor
   :area/title "main.hal"
   :area/presentation
   {:presentation/role :editor
    :presentation/label "Code"}}
  {:area/id "area/audio"
   :area/type :output
   :area/title "Audio"
   :area/presentation
   {:presentation/role :output
    :presentation/label "Audio"}}
  {:area/id "area/repl"
   :area/type :repl
   :area/title "REPL"
   :area/presentation
   {:presentation/role :output
    :presentation/label "REPL"}}]
 :workspace/nodes []
 :workspace/connections []
 :workspace/links []
 :workspace/selection
 {:area/id "area/editor"
  :document/id "document/main"}
 :workspace/customizations
 {:responsive/breakpoint 1000}
 :workspace/extensions []
 :workspace/pending []
 :workspace/audit []}
'''

WORKSPACE_DOC = '''# Workspace manifests

Every complete Playground project carries two declarative roots:

```text
project.edn    language paths, main namespace and requested capabilities
workspace.edn  visible Workspace areas, layout, selection and extensions
```

`workspace.edn` is ordinary Hara data. The browser does not maintain a second
JavaScript EDN parser for it.

## Runtime and projection flow

```text
workspace.edn source in OPFS or an imported GitHub project
    → Hara runtime eval
    → retained Workspace value
    → runtime.inspect(value-id)
    → bounded plain serializable Workspace view
    → Playground product-role projection
    → Hodos recursive responsive shell
```

Hara owns descriptor evaluation and `workspace.*` state semantics. Playground
owns browser storage, project policy, mapping into its installed project/editor/
output hosts, nested output tabs, Audio, focus and local presentation
preferences. Hodos owns visible recursive geometry, splitter interaction,
compact surface presentation and deterministic host lifecycle.

A missing manifest uses the standard Playground shell. An invalid manifest is
reported as a structured Workspace problem and also falls back to that shell;
it does not prevent the Hara kernel from opening the project.

Saving `workspace.edn` in a ready canonical runtime immediately reevaluates and
remounts the projected shell.

## Canonical example

```clojure
{:hara/type :workspace
 :hara/version "1.0.0"
 :workspace/id :example-app
 :workspace/layout
 {:layout/type :split
  :layout/id "layout/root"
  :layout/direction :horizontal
  :layout/ratio 0.22
  :layout/first
  {:layout/type :area
   :layout/area "area/project"}
  :layout/second
  {:layout/type :split
   :layout/id "layout/work"
   :layout/direction :horizontal
   :layout/ratio 0.64
   :layout/first
   {:layout/type :area
    :layout/area "area/editor"}
   :layout/second
   {:layout/type :area
    :layout/area "area/output"}}}
 :workspace/areas
 [{:area/id "area/project"
   :area/type :project
   :area/title "Project"
   :area/presentation {:presentation/role :project}}
  {:area/id "area/editor"
   :area/type :code-editor
   :area/title "Code"
   :area/presentation {:presentation/role :editor}}
  {:area/id "area/output"
   :area/type :output
   :area/title "Output"
   :area/presentation {:presentation/role :output}}]
 :workspace/documents
 [{:document/id "document/main"
   :document/path "src/app/core.hal"
   :document/title "core.hal"
   :document/language :hal
   :document/dirty? false}]
 :workspace/nodes []
 :workspace/connections []
 :workspace/links []
 :workspace/selection
 {:area/id "area/editor"
  :document/id "document/main"}
 :workspace/customizations
 {:responsive/breakpoint 1000}
 :workspace/extensions []
 :workspace/pending []
 :workspace/audit []}
```

## Layout vocabulary

Hodos currently renders the Hara layout vocabulary:

```text
:empty
:area   with :layout/area
:split  with :layout/direction, :layout/ratio, :layout/first, :layout/second
```

Directions are `:horizontal` and `:vertical`; ratios are strictly between zero
and one. Area IDs must be unique, every layout reference must resolve, and a
layout must not mount the same area twice.

The Playground recognizes these product roles:

```text
:project  project/explorer host
:editor   structural source editor host
:output   Preview, Audio, REPL, Problems and retained-value host
```

They may be declared through `:area/presentation {:presentation/role ...}` or
inferred from standard area types. Unsupported types remain visible as inert,
descriptive placeholders rather than executing manifest-provided UI code.

## Responsive presentation

The generic Hodos shell supports descriptive responsive surfaces through
`:workspace/customizations`:

```clojure
{:responsive/breakpoint 1000
 :responsive/default-surface "code"
 :responsive/surfaces
 [{:surface/id "files"
   :surface/area "area/project"
   :surface/label "Files"
   :surface/icon :folder}
  {:surface/id "code"
   :surface/area "area/editor"
   :surface/label "Code"}
  {:surface/id "preview"
   :surface/area "area/output"
   :surface/label "Canvas"
   :surface/mode :preview}]}
```

The Playground provides its installed compact product surfaces—Files, Code,
Canvas, Audio, REPL and Learn—while respecting the manifest breakpoint. A
compact selection emits `workspace/area-select`; Playground then applies its
existing output-tab or focus policy.

Splitter ratios and the last compact surface are local UI preferences. They are
not written back into portable Hara Workspace state.

## Trust boundary

A manifest may select IDs already installed by the host, but it cannot install
packages, supply executable component factories, receive browser credentials or
move raw runtime/Audio/storage authority into Hodos. The Playground strips
manifest component descriptors from its product projection and mounts only its
trusted packaged adapters.
'''

ARCHITECTURE_DOC = '''# Architecture

## Runtime and Workspace topology

```text
Browser page
├── WorkspaceStore (OPFS, localStorage or memory)
├── GitHub importer pinned to a resolved commit
├── Playground application policy
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
8. Project manifest roles into installed Playground hosts and mount them through
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

Playground
  browser storage and GitHub import
  product role mapping and installed adapters
  output tabs, Audio, focus and local presentation preferences

Hodos
  visible recursive layout and splitter mechanics
  compact surface presentation
  trusted component lifecycle and semantic-event boundaries
```

Manifest component descriptors are not executed by the Playground projection.
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
'''

ROADMAP_DOC = '''# Roadmap

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
'''

DEFAULT_MANIFEST_TEST = '''import assert from "node:assert/strict";
import test from "node:test";
import { defaultProject } from "../src/workspace/default-project.js";

const manifest = defaultProject["workspace.edn"];

test("the local scratch project is a complete workspace.edn-first project", () => {
  assert.equal(typeof manifest, "string");
  for (const marker of [
    ":hara/type :workspace",
    ":workspace/id :playground-default",
    ":workspace/layout",
    ":layout/type :split",
    ":workspace/areas",
    ":area/id :area/project",
    ":area/id :area/editor",
    ":area/id :area/output",
    ":workspace/selection",
    ":document/path \"src/app/core.hal\"",
  ]) {
    assert.ok(manifest.includes(marker), `default workspace.edn is missing ${marker}`);
  }
});
'''

AUTHORITY_TEST = '''import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const actions = fs.readFileSync(new URL("../src/app/actions.js", import.meta.url), "utf8");
const events = fs.readFileSync(new URL("../src/app/events.js", import.meta.url), "utf8");
const shell = fs.readFileSync(new URL("../src/hodos/workspace-shell.js", import.meta.url), "utf8");
const manifest = fs.readFileSync(new URL("../src/workspace/manifest.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("the active Playground shell mounts through Hodos without a competing controller", () => {
  assert.match(main, /mountHodosWorkspaceShell/);
  assert.match(main, /disposeHodosWorkspaceShell/);
  assert.doesNotMatch(main, /installWorkspaceLayout/);
  assert.match(shell, /createWorkspaceShellHost/);
  assert.match(shell, /resolveAreaRoot/);
  assert.match(shell, /workspaceShell:/);
  assert.match(styles, /vendor\/hodos\/packages\/workspace-ui\/src\/shell\.css/);
  assert.equal(fs.existsSync(new URL("../src/app/workspace-layout.js", import.meta.url)), false);
  assert.equal(fs.existsSync(new URL("../src/app/layout-model.js", import.meta.url)), false);
});

test("workspace.edn is evaluated through the Hara runtime and remains application policy", () => {
  assert.match(manifest, /runtime\.eval/);
  assert.match(manifest, /runtime\.inspect/);
  assert.match(manifest, /WORKSPACE_MANIFEST_PATH = "workspace\.edn"/);
  assert.match(actions, /loadWorkspaceManifest/);
  assert.match(actions, /reloadWorkspaceManifest/);
  assert.match(events, /workspaceShellPatch/);
  assert.doesNotMatch(shell, /parseEdn|readString|eval\(/i);
});

test("the Hodos shell receives presentation projection rather than executable components", () => {
  const stateSource = fs.readFileSync(new URL("../src/hodos/workspace-shell-state.js", import.meta.url), "utf8");
  assert.match(stateSource, /delete next\["area\/component"\]/);
  assert.match(stateSource, /responsive\/surfaces/);
  assert.doesNotMatch(shell, /innerHTML/);
  assert.doesNotMatch(shell, /new Function|eval\(/);
});
'''

SAMPLE_PROJECTS_TEST = '''import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FEATURED_PROJECTS } from "../src/studio/projects.js";
import { scanHara } from "../src/editor/lisp.js";

const root = new URL("..", import.meta.url).pathname;

test("every featured GitHub sample is a complete workspace.edn-first Hara project", async () => {
  for (const project of FEATURED_PROJECTS) {
    const relative = project.repository.path;
    const directory = join(root, relative);
    const [descriptor, workspace, source] = await Promise.all([
      readFile(join(directory, "project.edn"), "utf8"),
      readFile(join(directory, "workspace.edn"), "utf8"),
      readFile(join(directory, project.entry), "utf8")
    ]);
    assert.match(descriptor, /:hara\/type\s+:project/);
    assert.match(descriptor, /:studio\/eval/);
    assert.match(workspace, /:hara\/type\s+:workspace/);
    assert.match(workspace, /:workspace\/layout/);
    assert.match(workspace, /:layout\/type\s+:split/);
    assert.match(workspace, /:workspace\/areas/);
    assert.match(workspace, /:area\/id\s+"area\/project"/);
    assert.match(workspace, /:area\/id\s+"area\/editor"/);
    assert.match(workspace, /:workspace\/selection/);
    assert.match(workspace, /:responsive\/breakpoint/);
    assert.match(workspace, new RegExp(project.entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(source, /\(ns\s+[A-Za-z]/);
    assert.match(source, /\(view\)\s*$/);
    assert.equal(scanHara(source).unmatched.size, 0, `${project.id} contains unbalanced syntax`);
  }
});
'''


def update_manifests() -> None:
    identities = {
        "samples/live-values/workspace.edn": "playground-live-values",
        "samples/interface-composition/workspace.edn": "playground-interface-composition",
        "samples/decision-model/workspace.edn": "playground-decision-model",
    }
    for path, identity in identities.items():
        write(path, SIMPLE_WORKSPACE.replace("__WORKSPACE_ID__", identity))
    write("samples/supersonic-live/workspace.edn", SUPERSONIC_WORKSPACE)


def update_readme() -> None:
    source = read("README.md")
    source = replace_once(
        source,
        '''After a project opens, the workbench presents a project tree, structural Hara
editor, kernel status, toolsets and activities, Preview, REPL, and a
capability-gated Audio output. The interface uses the Hara precision-material
visual language: quiet neutral surfaces, one kernel-depth field, and cyan → blue
→ violet reserved for state, focus, and structural depth.
''',
        '''After a project opens, Hara evaluates its `workspace.edn`, Playground maps the
manifest into its installed project/editor/output authorities, and Hodos renders
the recursive responsive shell. The workbench presents a project tree,
structural Hara editor, kernel status, toolsets and activities, Preview, REPL,
and a capability-gated Audio output. The interface uses the Hara
precision-material visual language: quiet neutral surfaces, one kernel-depth
field, and cyan → blue → violet reserved for state, focus, and structural depth.
''',
        "README interface manifest flow",
    )
    source = replace_once(
        source,
        '''- Sandboxed HTA preview with restrictive Content Security Policy.
- Responsive desktop/mobile layouts and one-press light/dark switching.
- Unit tests, syntax checks, CI, and GitHub Pages deployment.
''',
        '''- Sandboxed HTA preview with restrictive Content Security Policy.
- Hara-evaluated `workspace.edn` projected through the recursive Hodos shell.
- Accessible desktop splitters, compact product surfaces, and one-press
  light/dark switching.
- Unit tests, syntax checks, CI, and GitHub Pages deployment.
''',
        "README implemented shell",
    )
    marker = '''The workbench ignores capabilities it does not recognize, and the worker grants
only capabilities supported by the current host.
'''
    source = replace_once(
        source,
        marker,
        marker + '''
`workspace.edn` is evaluated as Hara data rather than parsed by a second browser
implementation. It declares visible areas, recursive split geometry, documents,
selection and descriptive customizations. See
[Workspace manifests](docs/workspace-manifest.md) for the canonical shape and
the Hara/Playground/Hodos authority boundary.
''',
        "README Workspace manifest guide",
    )
    source = replace_once(
        source,
        '''- [Architecture](docs/architecture.md)
- [Runtime adapter](docs/runtime-adapter.md)
''',
        '''- [Architecture](docs/architecture.md)
- [Workspace manifests](docs/workspace-manifest.md)
- [Runtime adapter](docs/runtime-adapter.md)
''',
        "README design document link",
    )
    write("README.md", source)


def update_migration_doc() -> None:
    source = read("docs/migration.md")
    source += '''

## Workspace shell migration

The fixed three-panel layout controller and its parallel geometry model were
removed after the Hodos recursive shell passed the complete Chromium/Supersonic
workflow. `workspace.edn` is now the normal local and sample-project entrypoint:
Hara evaluates it, Playground applies product policy, and Hodos owns visible
layout mechanics. Historical fixed-layout code remains available through Git
rather than as an inactive competing implementation on `main`.
'''
    write("docs/migration.md", source)


def remove_legacy_layout() -> None:
    for relative in (
        "src/app/layout-model.js",
        "src/app/workspace-layout.js",
        "tests/layout-model.test.js",
    ):
        path = ROOT / relative
        if not path.exists():
            raise SystemExit(f"Legacy layout path is already missing: {relative}")
        path.unlink()


def clean_staging_files() -> None:
    for relative in (
        ".github/scripts/apply-workspace-manifest-defaults.py",
        ".github/workflows/apply-workspace-manifest-defaults.yml",
    ):
        path = ROOT / relative
        if path.exists():
            path.unlink()


def main() -> None:
    update_manifests()
    update_readme()
    write("docs/workspace-manifest.md", WORKSPACE_DOC)
    write("docs/architecture.md", ARCHITECTURE_DOC)
    write("docs/roadmap.md", ROADMAP_DOC)
    update_migration_doc()
    write("tests/default-workspace-manifest.test.js", DEFAULT_MANIFEST_TEST)
    write("tests/hodos-workspace-shell-authority.test.js", AUTHORITY_TEST)
    write("tests/sample-projects.test.js", SAMPLE_PROJECTS_TEST)
    remove_legacy_layout()
    clean_staging_files()


if __name__ == "__main__":
    main()
