# Hara Code–Visual Link Specification

**Status:** draft · **Version:** 0.1

## Link contract

Code, patch, and visual objects are connected by durable link records. Links
use stable source/form and visual identities, never screen coordinates.

```edn
{:link/id "link/greeting-card"
 :link/kind :structural
 :source {:file "src/main.hal" :range {:start [12 1] :end [18 3]}}
 :visual {:visual/id "scene/greeting-card" :anchor "root"}
 :direction :bidirectional
 :status :current}
```

Kinds: `:selection` (temporary), `:structural` (persistent identity),
`:evaluation` (a run result), `:dataflow` (signal/event flow), and `:trace`
(runtime provenance). Status: `:current`, `:stale`, `:pending`, `:broken`, or
`:error`.

## Required code ↔ visual controls

| Control | Icon | Command | Result |
| --- | --- | --- | --- |
| Link selection | `⛓` | `link.create` | Create a structural source/visual link |
| Reveal visual | `◉` | `link.revealVisual` | Frame and select the visual peer |
| Reveal code | `</>` | `link.revealSource` | Open/select the source form |
| Pin link | `⌖` | `link.pin` | Keep peer highlighting visible locally |
| Evaluate link | `▶` | `link.evaluate` | Run source/patch and update output state |
| Inspect link | `ⓘ` | `link.inspect` | Open combined source/visual inspector |
| Trace flow | `⌁` | `link.trace` | Show data-flow/timeline provenance |
| Remove link | `⌫` | `link.remove` | Confirm, then remove persistent relation |

The compact icon control always has an accessible name and menu equivalent.
`Remove link` is separated from `Evaluate link` in a toolbar.

## Interaction rules

1. Selecting linked source highlights its visual peer but does not move the
   camera. Selecting a visual peer highlights source without opening the editor.
2. **Reveal** moves focus to and frames the peer; repeat returns focus to the
   origin area.
3. Editing linked source marks the output **STALE**. Evaluation marks it
   **PENDING**, then **CURRENT** or **ERROR**.
4. Deleting/renaming an endpoint marks the relation **BROKEN** and offers
   relink or remove actions in Problems and Inspector.
5. Pinning is local session state; structural links persist with workspace/scene.

## Visual language and repair

- Cyan: selected/current peer.
- Amber dotted line + `STALE`: output is older than source.
- Magenta + diagnostic: broken/error link.
- Violet path: dataflow/trace.

Source uses a gutter marker and range underline; visual uses an outline and
anchor label; patches use directional wires. On load, unresolved links appear
under **Problems → Broken links** with **Find replacement**, **Rebind**, and
**Remove** actions.
