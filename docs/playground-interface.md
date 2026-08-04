# Visual Playground and structural Hara editor

Hara Playground has two deliberate surfaces:

1. a project browser for opening a public GitHub repository, a featured sample,
   or a browser-owned local project; and
2. a kernel workbench containing the project tree, structural editor, preview,
   REPL, toolsets, and guided activities.

The project browser follows the same product pattern as Hodos: lead with a small
collection of complete repository experiences, keep arbitrary GitHub input
available, and only construct the heavier workbench after a project is chosen.
The visual hierarchy follows `hara-lang/visual-language`: neutral material
surfaces, one quiet kernel field, and cyan → blue → violet reserved for live
state, focus, evaluation, and delimiter depth.

## GitHub projects and project paths

A Playground URL may point at a complete repository:

```text
?repo=owner/repository&branch=main
```

It may also scope the import to a project directory inside a monorepo:

```text
?repo=hara-lang/hara-playground&branch=main&path=samples/live-values
```

The importer resolves the branch to a commit, reads the immutable recursive
Git tree, selects supported text files below `path`, and strips that prefix
before writing the browser workspace. A subproject therefore sees
`project.edn`, `workspace.edn`, and `src/main.hal` at its own root instead of
seeing the surrounding monorepo.

Featured projects are ordinary GitHub project directories under `samples/`:

- `samples/live-values`
- `samples/interface-composition`
- `samples/decision-model`

They use only `:studio/eval`, so both the canonical WASM kernel and the embedded
development kernel can load them. The cards retain normal source links and
normal deep links; JavaScript enhances the latter into an in-place project open.

## Kernel boundary

Project source is evaluated through the persistent runtime Web Worker. The same
worker request protocol handles:

- project boot and file loading;
- explicit REPL and form evaluation;
- InstaREPL evaluation;
- activity checks;
- completion requests; and
- retained value inspection.

The browser owns storage, editor interaction, and output projection. Hara owns
the namespace and evaluated program state. HTA values and effects cross the
worker boundary and are rendered by the existing sandboxed preview. Completion
is requested through the kernel worker: the embedded kernel reflects its live
namespaces and built-ins, while the canonical adapter combines symbols observed
in evaluated source until canonical language-service reflection is available.

## Rainbow parens and syntax layer

The editor keeps the dependency-free text buffer but adds a separate syntax
projection layer. The scanner understands comments, strings, atoms, collection
delimiters, matching pairs, malformed closers, and unclosed collections.
Parentheses, brackets, and braces cycle through the Hara cyan → blue → violet
spectrum by structural depth. The pair adjacent to the caret receives a focused
signal and malformed delimiters receive an error treatment.

The syntax projection and textarea use identical font metrics, padding, line
height, tab width, and scroll offsets. The textarea remains the real accessible
input; the projection is visual and has no pointer events.

## Paredit behaviour

When Paredit is enabled:

- `(`, `[`, `{`, and `"` insert balanced pairs and wrap a selection;
- typing a closing delimiter directly before the matching delimiter moves over
  it instead of duplicating it;
- Backspace between an empty pair removes both delimiters;
- Enter inserts indentation derived from the current collection depth; and
- the structural command row provides selection expansion, wrapping, forward
  slurp, forward barf, and buffer formatting.

The structural transformations are pure functions in `src/editor/lisp.js`.
They return a new source string and selection, making them independently
unit-testable and reusable by a future CodeMirror, Monaco, or visual document
surface.

## Completion

Completion opens automatically after two symbol characters and explicitly with
`Ctrl/Cmd + Space`. The request contains the current prefix, namespace, and
source buffer. Suggestions include special forms, built-ins, project symbols,
current namespace vars, qualified vars, and namespaces where the active kernel
can expose them.

Use Arrow Up/Down to choose a result, Enter or Tab to insert it, and Escape to
close the menu. Completion is suppressed inside strings and comments.

## Keyboard reference

| Command | Shortcut |
| --- | --- |
| Kernel completion | `Ctrl/Cmd + Space` |
| Evaluate selection or enclosing form | `Alt + Enter` |
| Load current file | `Ctrl/Cmd + Enter` |
| Toggle InstaREPL | `Ctrl/Cmd + Shift + Enter` |
| Save file | `Ctrl/Cmd + S` |
| Expand structural selection | `Alt + Arrow Up` |
| Wrap form | `Ctrl/Cmd + Shift + 9` |
| Forward slurp | `Ctrl/Cmd + Alt + Arrow Right` |
| Forward barf | `Ctrl/Cmd + Alt + Arrow Left` |
| Format buffer | `Ctrl/Cmd + Shift + F` |

## Follow-on work

The current structural layer intentionally avoids coupling to a specific editor
framework. Follow-on layers can add canonical language-service diagnostics,
hover, definition/reference navigation, macroexpansion, project-aware
formatting, multi-cursor structural editing, and workspace-declared toolsets
without replacing the kernel or storage protocols.
