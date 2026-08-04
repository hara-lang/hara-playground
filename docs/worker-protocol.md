# Runtime worker protocol

The application page talks to one module worker. When the official runtime is
installed, that worker hosts the adapter which in turn uses Hara's official
kernel broker and HTA worker.

Every request has a unique `id`; every terminal response echoes it. Browser host
calls use a separate identifier space and travel in the reverse direction.

## Boot

```json
{
  "type": "boot",
  "id": "request-1",
  "namespace": "app.core",
  "capabilities": ["studio/eval", "audio/playback"],
  "files": [
    { "path": "src/app/core.hal", "content": "(ns app.core)" }
  ]
}
```

The page derives `capabilities` from `project.edn` immediately before boot. The
worker normalizes the values, always includes `studio/eval`, and intersects the
request with its available capability set.

Only `.hal` and legacy `.hara` source files are evaluated. `project.edn` is read
by the workbench to select `:project/main`, source paths, and capabilities; it is
not evaluated as source.

Response:

```json
{
  "type": "ready",
  "id": "request-1",
  "namespace": "app.core",
  "runtimeKind": "canonical-wasm",
  "capabilities": ["studio/eval", "audio/playback"]
}
```

`runtimeKind` is either `canonical-wasm` or `embedded`. The embedded evaluator
can report a requested grant but does not implement canonical host namespaces.
Project code that calls a canonical host service therefore still fails rather
than receiving a simulated browser capability.

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

## Completion

```json
{
  "type": "complete",
  "id": "request-4",
  "namespace": "app.core",
  "prefix": "ans",
  "source": "(def answer 42)"
}
```

The result contains normalized completion items produced by the current runtime
adapter.

## Inspect

The worker retains the most recent 200 values. The UI can request one by its
opaque identifier:

```json
{ "type": "inspect", "id": "request-5", "valueId": "value-1" }
```

A future inspector should return a paged structural representation rather than
structured-cloning arbitrarily large values.

## Reset

```json
{ "type": "reset", "id": "request-6" }
```

The canonical adapter closes and recreates its `STUDIO` kernel. The fallback
clears its namespace registry. Reset retains the current worker grant set; a
full project boot installs the next project's grants.

## Reverse host calls

Canonical HAL may call a browser service that cannot live inside the worker.
The worker sends a page request with its own host identifier:

```json
{
  "type": "host-call",
  "id": "host-1",
  "requestId": "request-7",
  "operation": "gw.audio.supersonic/start",
  "args": [{ "graph/id": "example/live", "nodes": [], "connections": [] }]
}
```

`requestId` identifies the evaluation that caused the host call. `id` identifies
the individual host operation and is the only key used to settle it.

The page looks up an explicitly registered handler. An unknown operation returns:

```json
{
  "type": "host-exception",
  "id": "host-1",
  "error": {
    "name": "Error",
    "message": "host/operation-unavailable:gw.audio.unknown/run"
  }
}
```

A successful operation returns:

```json
{
  "type": "host-result",
  "id": "host-1",
  "value": {
    "graph/id": "example/live",
    "generation": 1,
    "active/revision": 1,
    "status": "running"
  }
}
```

The worker keeps a map of pending host calls and resumes the canonical host
service only when the matching `host-result` or `host-exception` arrives.

Current registered page operations are:

```text
gw.audio.supersonic/start
gw.audio.supersonic/update
gw.audio.supersonic/status
gw.audio.supersonic/stop
```

The page checks `audio/playback` before invoking the provider. The official Hara
host-service layer also checks the session grant, so a project must pass both
boundaries.

Browser objects are never valid host-call arguments or results. The protocol is
limited to structured-cloneable plain values.

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

Host exceptions remain associated with the individual `host-*` identifier until
the canonical evaluation turns them into its terminal `request-*` exception.
