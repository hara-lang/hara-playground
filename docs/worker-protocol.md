# Runtime worker protocol

The application page talks to one module worker. When the official runtime is
installed, that worker hosts the adapter which in turn uses Hara's official
kernel broker and HTA worker.

Every request has a unique `id`; every terminal response echoes it.

## Boot

```json
{
  "type": "boot",
  "id": "request-1",
  "namespace": "app.core",
  "files": [
    { "path": "project.edn", "content": "{:hara/type :project ...}" },
    { "path": "src/app/core.hal", "content": "(ns app.core)" }
  ]
}
```

Only `.hal` and legacy `.hara` source files are evaluated. `project.edn` is read
by the workbench to select `:project/main`; it is not evaluated as source.

Response:

```json
{
  "type": "ready",
  "id": "request-1",
  "namespace": "app.core",
  "runtimeKind": "canonical-wasm"
}
```

`runtimeKind` is either `canonical-wasm` or `embedded`.

## Evaluate

```json
{
  "type": "eval",
  "id": "request-2",
  "namespace": "app.core",
  "source": "(+ 40 2)"
}
```

```json
{
  "type": "result",
  "id": "request-2",
  "valueId": "value-1",
  "display": "42",
  "namespace": "app.core"
}
```

## Load a file

```json
{
  "type": "load-file",
  "id": "request-3",
  "path": "src/app/core.hal",
  "source": "(ns app.core)\n(def answer 42)"
}
```

## Inspect

The worker retains the most recent 200 values. The UI can request one by its
opaque identifier:

```json
{ "type": "inspect", "id": "request-4", "valueId": "value-1" }
```

A future inspector should return a paged structural representation rather than
structured-cloning arbitrarily large values.

## Reset

```json
{ "type": "reset", "id": "request-5" }
```

The canonical adapter closes and recreates its `STUDIO` kernel. The fallback
clears its namespace registry.

## Streaming messages

These can arrive before the terminal response:

```json
{ "type": "stdout", "id": "request-2", "text": "hello\n" }
{ "type": "effect", "id": "request-2", "effect": { "type": "render", "tree": [] } }
{ "type": "diagnostic", "id": null, "text": "Connected to the canonical Hara WASM kernel" }
```

## Exceptions

```json
{
  "type": "exception",
  "id": "request-2",
  "error": {
    "name": "Error",
    "message": "Unable to resolve symbol",
    "data": null,
    "stack": "..."
  }
}
```
