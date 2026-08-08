# Hodos document

A complete Hara Playground project whose `workspace.edn` declares a
`hodos.2d/document` area directly.

The document uses stable block and text identities, an editable prose node
and a committed Hara artefact snapshot. Selection and text edits travel
through `document/*` semantic events and are applied by Playground policy.

This first consumer does not persist document edits, evaluate artefacts or
submit collaboration batches. Those remain later application-service slices.
