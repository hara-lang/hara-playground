# Playground Showcase Host v1

The Showcase Host is the narrow, cross-origin presentation contract used by
`packages.hara-lang.org`. It reuses the normal Playground project importer,
Hara runtime, evaluated `workspace.edn`, Hodos component registry and browser
capability boundary. It does not create a second renderer.

## Immutable URL

A Showcase link must identify an exact Git commit:

```text
https://playground.hara-lang.org/
  ?repo=owner/repository
  &branch=main
  &commit=<40-character-lowercase-sha>
  &path=examples/package-showcase
  &presentation=showcase
  &surface=preview
```

`branch` is descriptive. `commit` is authoritative for tree and file reads.
The Showcase host rejects branch-only presentation links.

The query carries selectors only. It never accepts source text, executable
component descriptors, capability grants or state payloads.

## Presentation

Showcase presentation removes the project header, status bars, responsive dock
and output tabs. Hodos receives a one-area Workspace layout for the selected
surface. The selected surface must be present in the projected Workspace
descriptor.

Normal Playground links and the project browser are unchanged.

## Parent protocol

Protocol version 1 admits one command:

```js
iframe.contentWindow.postMessage({
  type: "hara.showcase/select-surface",
  version: 1,
  surfaceId: "preview"
}, "https://playground.hara-lang.org");
```

Only the parent frame may send commands. Production accepts the Packages
production and testing origins; same-origin and local development origins are
also accepted. Unknown message types are ignored. Extra fields, malformed
selectors, unsupported protocol versions and undeclared surfaces fail closed.

The host publishes public status messages:

```js
{
  type: "hara.showcase/ready",
  version: 1,
  workspaceId: "package/example",
  commit: "...",
  surfaceId: "preview",
  surfaces: ["files", "code", "preview", "repl"]
}
```

Selection replies use `hara.showcase/selection`; startup failures use
`hara.showcase/error`. These messages contain no runtime values or private
workspace content.

## Next contract layer

Package demos, named states and named views are not encoded into query strings
or messages. They will be declared in a reviewed package `showcase.edn`.
`packages.hara-lang.org` will select a declared demo identifier, and Playground
will resolve that identifier inside the immutable imported project.
