# Greenways OS AI in Hara Playground

Hara Playground can ask an AI provider through keys installed in Greenways OS. Playground never receives, stores, logs, or exports the provider credential.

## Connection flow

1. Load the Greenways OS extension build that includes the Playground bridge.
2. Open `https://playground.hara-lang.org`.
3. Select **AI** in the Playground editor or project lobby.
4. Select **Open Greenways OS**.
5. In the Greenways screen, approve the current Hara Playground manifest and its bounded `model/generate` capability.
6. Add an OpenRouter, OpenAI, or Anthropic provider profile. The credential is retained only for the browser session.
7. Return to Playground, refresh the connection, select the public provider profile, enter a provider model ID, and ask a question.

The current file can be included as bounded context. Playground truncates very large buffers before sending the typed request. The extension independently enforces the exact production origin, current app approval, active capability grant, provider profile, network permission, input size, output-token limit, and timeout.

## Website protocol

The page sends only these operations through `greenways-playground-ai/1`:

- `status`
- `open`
- `generate`
- `cancel`

The page cannot choose a provider endpoint, HTTP method, authorization header, or arbitrary payload. It receives public provider-profile metadata and normalized text results, never the provider key.

## Calling AI from Hara

Hara projects must explicitly declare the host authority in `project.edn`:

```clojure
:project/capabilities #{:studio/eval :model/generate}
```

The portable namespace provides status and non-streaming generation calls:

```clojure
(ns example.ai
  (:require [gw.ai :as ai]))

(ai/status)

(ai/generate
 {:profile-id "openai.primary.example"
  :model "gpt-5"
  :messages [{:role "user" :content "Explain this Hara form."}]
  :max-output-tokens 1024})
```

The project constructs every message explicitly. `gw.ai` never attaches the
current buffer, workspace, repository, or files. It accepts only a public
profile ID, model ID, typed messages, and generation limits; URLs, HTTP
methods, headers, credentials, and arbitrary provider bodies are rejected
locally.

To run the example:

1. Install or load Greenways OS with the Hara Playground bridge.
2. Load a provider credential into a session-only provider profile.
3. Open `https://playground.hara-lang.org`, then install and approve Hara Playground in Greenways OS.
4. Grant `model/generate` and approve the selected provider's exact network origin.
5. Open the **Greenways OS AI capability** sample, replace its public profile and model IDs, and evaluate `(ask)`.

Without Greenways OS, on a non-production origin, or without an active grant
or provider network permission, the call fails with a capability or bridge
unavailable error. It never reports that the Hara program is missing an API
key because the program does not own one. Projects that omit
`:model/generate` fail locally with
`capability/not-granted:model/generate` before a bridge request is sent.

## Current limits

The first integration is non-streaming. Applying generated patches, model discovery, durable cost budgets, and signed AI receipts are follow-on work.
