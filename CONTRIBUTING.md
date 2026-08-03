# Contributing

## Local checks

```bash
npm test
npm run check
npm run dev
```

The application intentionally has no third-party runtime dependencies. Keep
protocol and storage code independent of the editor rendering layer so the
surface can later move to CodeMirror or Monaco without replacing the kernel.

To test against the full runtime:

```bash
npm run runtime:install -- /path/to/extracted-hara-studio-runtime
npm run dev
```

Generated runtime artifacts under `runtime/rust`, `runtime/examples`, and
`runtime/assets` are ignored and should not be mixed into ordinary UI commits.

## Change expectations

- Use canonical `.hal`, `project.edn`, and `workspace.edn` conventions in new examples.
- Add tests for project loading, runtime adapters, importers, and workspace behaviour.
- Keep preview output sandboxed.
- Do not expose GitHub credentials to a runtime worker or preview frame.
- Preserve the embedded fallback for development and CI without a Rust build.
- Prefer adapting official Hara broker/session concepts over inventing parallel APIs.
