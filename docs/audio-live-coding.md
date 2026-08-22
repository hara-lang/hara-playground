# Supersonic audio live coding

Hara Play treats audio as an optional browser host capability. A HAL
project describes a Supersonic graph, the canonical Hara kernel calls the
Supersonic host namespace, and the page renders the graph with Web Audio after
an explicit user gesture.

The complete example is in [`samples/supersonic-live`](../samples/supersonic-live/README.md).
Open it directly in the Play:

```text
https://play.hara-lang.org/?repo=hara-lang/hara-play&branch=main&path=samples/supersonic-live
```

## Execution boundary

```text
project.edn
  └─ requests :audio/playback

HAL source
  └─ gw.audio.supersonic/start · update · status · stop
       ↓
canonical Hara worker
       ↓ request-correlated plain messages
page-side SupersonicProvider
       ↓
SupersonicWebAudioEngine
       ↓ explicit Play gesture
AudioContext → speakers
```

The worker never receives an `AudioContext`, `AudioNode`, output device, DOM
node, storage handle, or other browser resource. It receives and returns only
plain graph and snapshot values.

## 1. Declare the capability

Audio is denied unless the project descriptor requests it:

```clojure
{:hara/type :project
 :hara/version "1.0.0"
 :project/id example.supersonic
 :project/version "0.1.0"
 :project/source-paths ["src"]
 :project/main example.supersonic
 :project/capabilities
 #{:studio/eval
   :audio/playback}}
```

The descriptor is a request, not an authority. The worker intersects requested
capabilities with those made available by the embedding host. The page-side
provider repeats the `audio/playback` check before accepting an operation.

## 2. Require the HAL namespace

```clojure
(ns example.supersonic
  (:require [gw.audio.supersonic :as sonic]))
```

The namespace exposes four operations:

```clojure
(sonic/start graph)
(sonic/update graph-id node-id parameter value)
(sonic/status graph-id)
(sonic/stop graph-id)
```

Each operation dereferences the canonical asynchronous host call and returns a
plain Supersonic snapshot.

## 3. Define a graph

The current browser renderer recognizes a compact sequencer graph with
transport, sequence, oscillator, mixer, and output roles:

```clojure
(def live-graph
  {"graph/id" "example/live"
   "title" "Live signal"
   "nodes"
   [{"id" "transport"
     "type" "control/transport"
     "params" {"playing" false
               "tempo" 112
               "steps-per-beat" 2}
     "controls"
     [{"parameter" "playing"
       "type" "boolean"
       "label" "Playing"}
      {"parameter" "tempo"
       "type" "number"
       "label" "Tempo"
       "min" 40
       "max" 240
       "step" 1
       "integer" true}
      {"parameter" "steps-per-beat"
       "type" "number"
       "label" "Steps / beat"
       "min" 1
       "max" 8
       "step" 1
       "integer" true}]}

    {"id" "sequence"
     "type" "data/sequence"
     "params" {"steps" [0 7 12 7
                        3 10 15 nil]}
     "controls"
     [{"parameter" "steps"
       "type" "steps"
       "label" "Note offsets"}]}

    {"id" "source"
     "type" "audio/oscillator"
     "params" {"waveform" "sine"
               "root" 48
               "gate" 0.72}
     "controls"
     [{"parameter" "waveform"
       "type" "choice"
       "label" "Waveform"
       "choices" ["sine" "square" "saw" "triangle"]}
      {"parameter" "root"
       "type" "number"
       "label" "MIDI root"
       "min" 24
       "max" 84
       "step" 1
       "integer" true}
      {"parameter" "gate"
       "type" "number"
       "label" "Gate"
       "min" 0.05
       "max" 1
       "step" 0.01}]}

    {"id" "mixer"
     "type" "audio/mixer"
     "params" {"volume" 0.68}
     "controls"
     [{"parameter" "volume"
       "type" "number"
       "label" "Volume"
       "min" 0
       "max" 1
       "step" 0.01}]}

    {"id" "output"
     "type" "audio/output"}]

   "connections"
   [{"from" ["transport" "tick"]
     "to" ["sequence" "tick"]
     "kind" "control"}
    {"from" ["sequence" "note"]
     "to" ["source" "note"]
     "kind" "control"}
    {"from" ["source" "audio"]
     "to" ["mixer" "audio"]
     "kind" "audio"}
    {"from" ["mixer" "audio"]
     "to" ["output" "audio"]
     "kind" "audio"}]})
```

Graph and node identifiers are strings. Node identifiers must be unique, and
every connection endpoint must refer to a declared node.

## 4. Start silently

```clojure
(def audio-state
  (sonic/start live-graph))
```

Starting a graph validates and prepares it, publishes a snapshot to the Audio
output, and does **not** authorize audible playback. This allows project loading,
file evaluation, and InstaREPL evaluation to remain silent.

Open **Audio** and press **Play** once. That page gesture creates or resumes the
`AudioContext`. A HAL form cannot silently bypass that boundary.

## 5. Reshape the running graph

Evaluate update forms from the editor or REPL:

```clojure
(sonic/update "example/live" "transport" "tempo" 138)

(sonic/update "example/live" "source" "waveform" "saw")

(sonic/update "example/live" "source" "root" 55)

(sonic/update "example/live"
              "sequence"
              "steps"
              [0 3 7 10 12 10 7 3])
```

Live parameter changes keep the active musical clock and step index. Notes
already inside the short scheduling window finish naturally; later notes use the
new graph state. Replacing the complete graph also preserves phase while the
engine is playing.

If a background tab throttles JavaScript timers, the engine skips stale beats
when it resumes rather than scheduling a burst of missed notes.

## Control metadata

The Audio panel is derived from each node's `controls` vector. The supported
control types are:

| Type | Browser control | Value rules |
| --- | --- | --- |
| `number` | range input | finite, optional min/max, optional integer |
| `boolean` | checkbox | truth value |
| `choice` | select | one declared choice |
| `steps` | note-offset input | 1–64 integers or rests |

A step is a semitone offset from `source.root`. Use `nil` in HAL or `_`/`rest`
in the Audio panel for a rest. Offsets are bounded to `-48` through `48`.

The graph remains authoritative. The panel does not maintain a second control
schema or invent controls that are absent from the graph.

## Snapshots

`start`, `update`, `status`, and `stop` return a snapshot containing:

```clojure
{"graph/id" "example/live"
 "generation" 1
 "active/revision" 4
 "status" "running"
 "pending" []
 "title" "Live signal"
 "nodes" [...]
 "connections" [...]}
```

A generation changes when a graph is replaced. A revision changes when an
accepted parameter update becomes effective. The current browser sequencer
applies supported updates immediately, so its pending vector normally remains
empty.

## Workspace sovereignty

Every kernel boot is a new audio authority boundary:

1. scheduled voices are stopped;
2. the previous `AudioContext` is closed;
3. playback authorization is revoked;
4. graph and generation state are cleared;
5. persisted control overlays are scoped to the active browser workspace; and
6. the new project receives audio only when it declares `:audio/playback`.

Two projects may therefore use the same `graph/id` without inheriting each
other's controls or prior Play gesture.

## Current browser renderer

The Play's dependency-free engine currently interprets these roles:

- `control/transport`: `playing`, `tempo`, and `steps-per-beat`;
- `data/sequence`: note-offset `steps`;
- an oscillator node: `root`, `gate`, and `waveform`;
- a mixer node: final `volume`; and
- an output node as the graph's declared destination.

The provider validates the complete graph and connection references, but the
browser engine is intentionally a focused sequencer rather than a general DSP
graph compiler. Sample playback, arbitrary effects, multiple independent
oscillators, external MIDI, microphone input, and device selection are not yet
implemented by this Play renderer.

Those features can extend the page-side engine without changing the HAL host
namespace or moving browser resources into the worker.

## Runtime requirements

Supersonic host calls require the canonical Hara WASM runtime. The embedded
fallback evaluator can edit and display the project but deliberately does not
pretend to implement canonical host capabilities.

A complete Studio runtime archive includes:

```text
rust/studio/supersonic.js
rust/studio/hal/supersonic.hal
```

The Hara archive workflow builds the release-shaped runtime, verifies its
SHA-256 file, and asserts that the general and self-contained music runtimes
both contain those files.
