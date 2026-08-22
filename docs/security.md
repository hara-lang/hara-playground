# Security model

Hara Play treats imported source code as untrusted.

## Existing controls

- Hara evaluation runs in a Web Worker, not the Play document.
- Preview output runs in an iframe with an empty `sandbox` attribute.
- Preview documents include a restrictive Content Security Policy.
- HTA attributes beginning with `on` are discarded.
- Unknown HTA tags are rendered as `div`.
- `srcdoc` attributes are discarded.
- GitHub import accepts a bounded set of text extensions and limits file count
  and file size.
- The embedded runtime has no direct DOM, cookie, storage or network globals.
- Canonical project capabilities are parsed from `project.edn` and intersected
  with the capabilities implemented by the current host.
- Worker host services enforce capability grants before invoking a provider.
- Page-side Supersonic handlers independently require `audio/playback`.
- Web Audio remains silent until the user presses Play in the page.

## Trust boundaries

```text
GitHub source → workspace → Hara worker → validated effect → preview iframe
                                      ↘ capability-gated plain host call
                                         → page-owned browser provider
```

The preview must never receive GitHub tokens. The runtime must never receive
Play-origin cookies, unrestricted OPFS handles, `AudioContext` objects,
`AudioNode` objects, DOM nodes, or output-device handles.

## Audio authority

Audio has two separate gates:

1. the project requests `:audio/playback`; and
2. the user performs a page gesture by pressing Play.

Loading a project and evaluating `(sonic/start graph)` only prepare a graph and
publish its snapshot. They do not authorize sound.

Each kernel boot is treated as a new audio authority boundary. The page stops
scheduled voices, closes the previous `AudioContext`, revokes authorization,
clears graph generations, and selects a control-overlay scope derived from the
active browser workspace. A second audio project therefore cannot inherit the
first project's Play gesture or locally persisted controls, even when both use
the same `graph/id`.

The browser provider accepts only the registered Supersonic operations:

```text
gw.audio.supersonic/start
gw.audio.supersonic/update
gw.audio.supersonic/status
gw.audio.supersonic/stop
```

Unknown operations are rejected by the page bridge. Provider results and errors
are correlated to their host-call identifiers before returning to the worker.

## Before multi-user deployment

- Move authenticated GitHub operations to a server-side GitHub App.
- Add hard execution limits and worker termination.
- Add host-call timeouts and cancellation for abandoned kernel requests.
- Validate every host provider payload against a versioned schema.
- Add URL allowlists or user confirmation for network effects.
- Serve immutable runtime assets with integrity metadata.
- Add dependency package signature and provenance checks.
- Prevent imported HTML effects from navigating or opening popups.
- Add an explicit permission surface when projects request new capabilities.
- Add browser-level tests for autoplay denial, device loss, suspended contexts,
  and project transitions while a host call is in flight.
