# Supersonic live coding

This project demonstrates browser audio as a declared Hara capability. Loading
`src/main.hal` starts a Supersonic graph but does not create audible output.
Open the **Audio** output tab and press **Play** once to authorize Web Audio.

Evaluate individual forms while the sequence runs:

```clojure
(sonic/update "playground/supersonic-live" "transport" "tempo" 138)
(sonic/update "playground/supersonic-live" "source" "waveform" "saw")
(sonic/update "playground/supersonic-live" "source" "root" 55)
(sonic/update "playground/supersonic-live"
              "sequence"
              "steps"
              [0 3 7 10 12 10 7 3])
```

The HAL graph remains authoritative. The page-side provider renders its control
metadata and owns the `AudioContext`; the kernel exchanges only plain graph,
update, status and stop messages.
