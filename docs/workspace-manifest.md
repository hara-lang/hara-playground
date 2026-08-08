# Workspace manifests

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


## Manifest-native Hodos components

A Workspace area may carry a complete serializable `:area/component`
descriptor. Playground preserves unknown component areas instead of
flattening them into the fixed Project, Editor or Output roles. Registered
Hodos component packages then mount those areas directly.

```clojure
{:area/id "area/document"
 :area/type "hodos.2d/document"
 :area/presentation
 {:presentation/surface :document
  :presentation/mode :document
  :presentation/compact true}
 :area/component
 {:component/id "hodos.2d/document"
  :component/contract "workspace.component/1"
  :component/model {...}
  :component/events ["document/select" "document/edit-text"]}}
```

The manifest owns serializable component state only. Playground applies
semantic events to its application state and supplies a new canonical model
to Hodos. Runtime evaluation, persistence, collaboration, signatures and
privileged capabilities are not embedded in `workspace.edn`.
