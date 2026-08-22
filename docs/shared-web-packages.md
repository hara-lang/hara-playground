# Shared Hara web packages

Play is a consumer of the browser platform packages maintained in
`hara-lang/hara-ui`:

```text
@hara-lang/web-runtime
@hara-lang/web-editor
@hara-lang/web-workspace
@hara-lang/web-preview
@hara-lang/web-capabilities
```

Until those packages are published, this repository records an immutable
`vendor/hara-ui` gitlink. `npm run web:prepare` materialises that exact commit.
The static build copies `vendor/hara-ui/packages` unchanged so browser module
URLs keep the same relative shape in source and in `dist`.

The files under `src/runtime/client.js`, `src/editor/`, `src/language/`,
`src/workspace/`, and `src/ui/hta.js` are compatibility adapters. Existing
Play imports stay stable while the implementation is owned by the shared
packages.

The following remain Play-specific in this slice:

- the canonical runtime worker and adapter;
- the embedded development evaluator;
- GitHub project import;
- Supersonic browser host integration;
- Studio activities and the current fixed workbench shell.

Moving those application policies is deliberately separate from extracting the
portable package contracts.
