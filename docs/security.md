# Security model

Hara Studio treats imported source code as untrusted.

## Existing controls

- Hara evaluation runs in a Web Worker, not the Studio document.
- Preview output runs in an iframe with an empty `sandbox` attribute.
- Preview documents include a restrictive Content Security Policy.
- HTA attributes beginning with `on` are discarded.
- Unknown HTA tags are rendered as `div`.
- `srcdoc` attributes are discarded.
- GitHub import accepts a bounded set of text extensions and limits file count
  and file size.
- The embedded runtime has no direct DOM, cookie, storage or network globals.

## Trust boundaries

```text
GitHub source → workspace → Hara worker → validated effect → preview iframe
                                      ↘ Studio host capability router
```

The preview must never receive GitHub tokens. The runtime must never receive
Studio-origin cookies or unrestricted OPFS handles.

## Before multi-user deployment

- Move authenticated GitHub operations to a server-side GitHub App.
- Add explicit project permission declarations.
- Add hard execution limits and worker termination.
- Validate all host effect payloads against schemas.
- Add URL allowlists or user confirmation for network effects.
- Serve immutable runtime assets with integrity metadata.
- Add dependency package signature and provenance checks.
- Prevent imported HTML effects from navigating or opening popups.
