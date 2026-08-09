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

## Current limits

The first integration is non-streaming and displays the response for review and copying. Applying generated patches, model discovery, durable cost budgets, signed AI receipts, and the Hara-level `gw.ai` namespace are follow-on work.
