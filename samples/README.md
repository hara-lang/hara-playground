# Playground sample corpus

`samples/catalog.json` is the machine-readable inventory for every project under
`samples/`. It does not replace `project.edn`: each sample's `project.edn` remains
the sole contributor-authored package/project manifest. The catalog records how
the Playground validates and presents those projects against an exact draft
specification revision and pinned browser runtime.

The catalog gate checks:

- one catalog entry for every sample directory, with no orphan directories;
- exact Git blobs for `project.edn`, the declared entry source, optional
  `workspace.edn`, and `runtime.lock.json`;
- required Package-contract fields, safe project paths, semantic versions,
  project identity, main namespace, and declared capabilities;
- rejection of retired top-level `:jvm/*` and `:rust/*` runtime keys;
- an exact source namespace match for `:project/main`;
- bounded source shape for static views, active policies, browser capabilities,
  and host capabilities;
- one full-source runtime load and deterministic scalar smoke form per sample;
  and
- explicit issue-linked declarations for product metadata that is not part of
  the Package contract.

`workspace.edn` is optional host/editor metadata. A sample may declare it in the
catalog so its blob and source reference are checked, but package identity never
depends on it.

## Validation modes

- `static-view` — load the complete main namespace, then evaluate a deterministic
  pure projection from its data or `(view)`.
- `active-policy` — load the complete policy namespace, then invoke the declared
  replaceable function with fixed observations and memory.
- `host-capability` — load the complete namespace and exercise its pure surface;
  the external host effect is recorded as deferred with a capability and reason.
- `browser-capability` — load through the bounded browser provider contract, but
  leave user-activation-owned effects such as `AudioContext` playback deferred.

A capability-deferred result is not a skipped load. The complete source and its
safe deterministic smoke still pass against the exact runtime. Only the
effectful operation named by the catalog remains unexecuted.

## Runtime validation

Install the immutable runtime archive from `runtime.lock.json`, install the
Playwright Chromium dependency, and run:

```text
npm run runtime:download
npm run samples:runtime -- --output generated/sample-runtime-report.json
```

The browser harness imports the canonical WASM adapter, resets one persistent
kernel between projects, evaluates every declared main source, and verifies the
catalogued scalar result. Its report contains no timestamps and is run twice in
CI; byte-identical reports are required.

The Supersonic sample uses a provider with no audio engine. This proves the HAL
namespace, graph normalization, host-call transport, and returned graph state
without creating an `AudioContext`. Actual playback remains covered by the
separate user-gesture browser-audio lane. The Greenways AI sample does not
contact an external model provider.

## Adding or changing a sample

1. Keep package, build, extension, dependency, capability, and runtime-profile
   intent in `project.edn`.
2. Keep Playground-only presentation or host metadata outside the package
   manifest. A temporary exception must be listed under `manifestExtensions`
   with a reason and an open issue.
3. Add or update `runtimeValidation` with one safe full-source load, deterministic
   scalar smoke, and an exact effect disposition.
4. Update the catalog entry and its exact Git blob SHAs.
5. Run `npm run samples:validate`, `npm test`, `npm run check`, and
   `npm run build`; run the browser runtime lane when runtime inputs or sample
   execution contracts change.

The current authority and runtime pins are recorded in the catalog rather than
duplicated in this page.
