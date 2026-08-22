# The Living Tank

This project proves a small inversion-of-control idea: the Play worker owns a continuing tank simulation, while this project supplies replaceable Hara controller code.

1. The worker creates and starts `tank/controller` before installing the controller.
2. `src/main.hal` is staged in a versioned namespace and validated by the resident Hara runtime.
3. **Activate** swaps the accepted controller at a tick boundary without resetting the tank, tick, loop identity or controller memory.
4. **Disturb tank** changes the world state so the active controller has something visible to correct.
5. A broken replacement is rejected transactionally and the previous controller continues.

There is no separate compile command, page reload or application restart in this flow. Compilation or evaluation is an internal part of activation inside the running worker.
