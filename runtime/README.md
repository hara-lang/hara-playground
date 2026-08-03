# Official Hara Studio runtime

This directory accepts the archive produced by the canonical Hara repository:

```bash
# In hara-lang/hara
make studio-build

# In this repository, after extracting the generated archive
npm run runtime:install -- /path/to/hara-studio-runtime-VERSION
```

The installer validates and copies the official artifact layout, including:

```text
runtime/
├── rust/
│   ├── hara.wasm
│   ├── hta-worker.js
│   ├── hta-shared-worker.js
│   ├── host/
│   └── studio/
├── examples/
└── assets/
```

At startup, `src/runtime/canonical.js` loads `rust/hara.wasm`, creates the
official browser broker, and runs Studio evaluations in a persistent `STUDIO`
kernel. When these files are absent, the application uses its embedded HAL
evaluator so UI development and public previews remain runnable.

Generated runtime files are intentionally excluded from this repository's git
history. A deployment pipeline can install them before publishing the static
site.
