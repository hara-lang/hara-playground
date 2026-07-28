# Hara Workspace Interface Specification

**Status:** draft · **Version:** 0.1

## Purpose

The Hara workspace combines VS Code's durable navigation, Blender's resizable
areas, and Max/MSP's live patch/data-flow surfaces. It must work in the website
studio, Chrome panel, VS Code, and future native hosts with the same roles,
commands, and component contracts.

## Workspace regions

| Region | Responsibility |
| --- | --- |
| Menu bar | Workspace commands: File, Edit, View, Run, Visual, Help |
| Activity rail | Switches Explorer, Search, Visuals, Run, and Extensions |
| Primary sidebar | Files, symbols, visual graph, or search results |
| Area group | Resizable code, visual, patch, inspector, REPL, output, or timeline areas |
| Secondary sidebar | Selected source form, visual object, link, and runtime value properties |
| Bottom panel | REPL, Problems, Output, and Timeline |
| Status bar | Runtime, link freshness, cursor, layout, and encoding state |

Desktop keeps the menu and status bars present. Sidebars and the bottom panel
can be hidden, but preserve width and selected view. Narrow layouts turn
sidebars into overlay drawers and the bottom panel into a sheet.

## Areas and layout

An area has an `id`, `kind`, title, toolbar, content, and local selection.
Kinds are `code`, `visual`, `patch`, `inspector`, `repl`, `output`, and
`timeline`. Areas form a recursive split tree:

```edn
{:layout/type :split :axis :horizontal :ratio 0.58
 :first {:layout/type :area :area/id "code/main" :area/kind :code}
 :second {:layout/type :area :area/id "visual/main" :area/kind :visual}}
```

- Dividers are pointer/keyboard resizable and clamped to `0.18..0.82`.
- Required commands: split right, split below, move area, close area, maximize
  area, and restore layout.
- Closing removes only a view—not source, a scene, a patch, or runtime state.
- Presets (`code`, `visual`, `patch`, `performance`) persist per workspace.

## Shared desktop components

Use the UI kit's `.hara-window`, `.hara-window-bar`, `.hara-menu-bar`,
`.hara-toolbar`, `.hara-icon-button`, and `.hara-status-bar` primitives.

- Window bars identify their area/document; they are not a global application
  title bar.
- Toolbars contain frequent local actions. Menus expose every command by text.
- Icon-only controls require `aria-label` and a tooltip.
- An open menu stays open while its own items are hovered; hovering another
  top-level menu switches it. Outside click and `Escape` close it.

## Core commands

| Command | Default shortcut |
| --- | --- |
| Command palette | `Cmd/Ctrl+Shift+P` |
| Toggle sidebar | `Cmd/Ctrl+B` |
| Toggle bottom panel | `Cmd/Ctrl+J` |
| Split area | `Cmd/Ctrl+\\` |
| Maximize area | `Cmd/Ctrl+Shift+Enter` |
| Run form | `Ctrl+E` |
| Run file/scene | `Ctrl+Ctrl+E` |
| Link code and visual selection | `Cmd/Ctrl+L` |
| Reveal linked peer | `Cmd/Ctrl+Shift+L` |

## Accessibility

All regions have landmarks and visible keyboard focus. Dividers expose their
orientation and value. Colour never solely conveys runtime/link state; labels
and icons accompany cyan/current, amber/stale, magenta/error, and violet/trace
states.

See [code–visual links](code-visual-links.md) for the source/visual binding.
