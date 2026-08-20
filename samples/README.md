# Playground sample corpus

`samples/catalog.json` is the machine-readable inventory for every project under
`samples/`. It does not replace `project.edn`: each sample's `project.edn` remains
the sole contributor-authored package/project manifest. The catalog records how
the Playground validates and presents those projects against an exact draft
specification revision and pinned browser runtime.

The first validation slice checks:

- one catalog entry for every sample directory, with no orphan directories;
- exact Git blobs for `project.edn`, the declared entry source, optional
  `workspace.edn`, and `runtime.lock.json`;
- required Package-contract fields, safe project paths, semantic versions,
  project identity, main namespace, and declared capabilities;
- rejection of retired top-level `:jvm/*` and `:rust/*` runtime keys;
- an exact source namespace match for `:project/main`;
- bounded source shape for static views, active policies, browser capabilities,
  and host capabilities; and
- explicit issue-linked declarations for product metadata that is not part of
  the Package contract.

`workspace.edn` is optional host/editor metadata. A sample may declare it in the
catalog so its blob and source reference are checked, but package identity never
depends on it.

## Validation modes

- `static-view` — a source namespace whose bounded smoke surface evaluates
  `(view)`.
- `active-policy` — a replaceable named function installed into an already-owned
  worker activity.
- `host-capability` — source that loads without credentials but needs an explicit
  host capability for its effectful entry.
- `browser-capability` — source whose effectful entry needs browser activation or
  another browser-owned capability.

These modes are static gates in this slice. Compile/load and deterministic
runtime smoke execution against `runtime.lock.json` remain the next part of
issue #79.

## Adding or changing a sample

1. Keep package, build, extension, dependency, capability, and runtime-profile
   intent in `project.edn`.
2. Keep Playground-only presentation or host metadata outside the package
   manifest. A temporary exception must be listed under `manifestExtensions`
   with a reason and an open issue.
3. Update the catalog entry and its exact Git blob SHAs.
4. Run `npm run samples:validate`, followed by `npm test`, `npm run check`, and
   `npm run build`.

The current authority pin is recorded in the catalog rather than duplicated in
this page.
