# Conveyor Cell Digital Twin

The worker creates and advances Conveyor Cell A before it installs the Hara routing policy in `src/main.hal`.

Try the proof:

1. Let packages move through the sensor and note the activity ID, tick and sensor sequence.
2. Change the confidence threshold or weight rule and press **Activate policy**.
3. Confirm the same packages and counts continue under the new version.
4. Press **Inject anomaly** and watch the next package go to inspection.
5. Introduce an unresolved symbol and activate again. The candidate is rejected while the accepted policy continues.

The sample is deliberately simulated. It proves the lifecycle boundary needed before connecting a camera, PLC or real conveyor observation source.
