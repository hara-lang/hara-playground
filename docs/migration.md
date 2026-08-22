# Play migration

The original standalone Play is preserved in Git on the branch
`archive/standalone-playground-2026-07` at commit
`7ef62c7801c52349f11f0b7d5f63efc0f3738131`.

The current application replaces its monolithic `app.js`/`app.css` shell with
the modular Hara Studio workbench. The following parts of the original project
remain part of the product rather than being discarded:

- the pinned, checksum-verified Hara Studio runtime release;
- the canonical runtime example catalog (Starter, Browser Game and Music);
- the `play.hara-lang.org` Pages deployment;
- the project/workspace descriptor conventions used by those examples.

Experimental canvas, WebGL, audio, publishing and structural-editing code from
the old shell remains available on the archive branch. It should be ported into
capability-focused modules instead of copied into the new application bundle as
a second competing runtime host.


## Workspace shell migration

The fixed three-panel layout controller and its parallel geometry model were
removed after the Hodos recursive shell passed the complete Chromium/Supersonic
workflow. `workspace.edn` is now the normal local and sample-project entrypoint:
Hara evaluates it, Play applies product policy, and Hodos owns visible
layout mechanics. Historical fixed-layout code remains available through Git
rather than as an inactive competing implementation on `main`.
