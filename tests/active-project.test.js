import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { detectActiveLoopConfiguration } from "../src/runtime/active-project.js";

const tankDescriptor = `
{:hara/type :project
 :project/main samples.active-loop-tank
 :playground/active-loop
 {:active/id "tank/controller"
  :active/kind :tank
  :active/path "src/main.hal"
  :active/entry controller
  :active/rate-hz 12
  :active/initial-level 75
  :active/target 64
  :active/leak-rate 1.25
  :active/fill-rate 9.5
  :active/auto-start false}}
`;

const conveyorDescriptor = `
{:hara/type :project
 :project/main samples.active-conveyor-twin
 :playground/active-loop
 {:active/id "conveyor/cell-a"
  :active/kind :conveyor
  :active/path "src/main.hal"
  :active/entry route-package
  :active/rate-hz 6
  :active/initial-packages 4
  :active/spawn-every-ticks 8
  :active/belt-speed 4.5
  :active/sensor-position 44
  :active/route-position 72
  :active/max-packages 16
  :active/auto-start true}}
`;

test("active project extension is absent from ordinary projects", () => {
  assert.equal(detectActiveLoopConfiguration([{ path: "project.edn", content: "{:hara/type :project}" }]), null);
});

test("tank activity retains its bounded descriptor", () => {
  assert.deepEqual(detectActiveLoopConfiguration([{ path: "project.edn", content: tankDescriptor }]), {
    id: "tank/controller",
    kind: "tank",
    path: "src/main.hal",
    entry: "controller",
    rateHz: 12,
    autoStart: false,
    initialLevel: 75,
    target: 64,
    leakRate: 1.25,
    fillRate: 9.5,
  });
});

test("conveyor activity exposes only bounded runtime settings", () => {
  assert.deepEqual(detectActiveLoopConfiguration([{ path: "project.edn", content: conveyorDescriptor }]), {
    id: "conveyor/cell-a",
    kind: "conveyor",
    path: "src/main.hal",
    entry: "route-package",
    rateHz: 6,
    autoStart: true,
    initialPackages: 4,
    spawnEveryTicks: 8,
    beltSpeed: 4.5,
    sensorPosition: 44,
    routePosition: 72,
    maxPackages: 16,
  });
});

test("unsupported and unsafe conveyor settings are rejected", () => {
  assert.throws(() => detectActiveLoopConfiguration([{ path: "project.edn", content: conveyorDescriptor.replace(":active/kind :conveyor", ":active/kind :camera") }]), /active\/project-kind-unsupported:camera/);
  assert.throws(() => detectActiveLoopConfiguration([{ path: "project.edn", content: conveyorDescriptor.replace(":active/sensor-position 44", ":active/sensor-position 95") }]), /active\/project-sensor-position-invalid/);
});

test("conveyor routing defaults remain downstream of a moved sensor", () => {
  const content = conveyorDescriptor
    .replace(":active/sensor-position 44", ":active/sensor-position 68")
    .replace("  :active/route-position 72\n", "");
  const config = detectActiveLoopConfiguration([{ path: "project.edn", content }]);
  assert.equal(config.sensorPosition, 68);
  assert.equal(config.routePosition, 76);
});

test("the committed Living Tank descriptor still selects its Hara controller", async () => {
  const content = await readFile(new URL("../samples/active-loop-tank/project.edn", import.meta.url), "utf8");
  const config = detectActiveLoopConfiguration([{ path: "project.edn", content }]);
  assert.equal(config.id, "tank/controller");
  assert.equal(config.entry, "controller");
  assert.equal(config.autoStart, true);
});

test("the committed conveyor descriptor selects its Hara policy", async () => {
  const content = await readFile(new URL("../samples/active-conveyor-twin/project.edn", import.meta.url), "utf8");
  const config = detectActiveLoopConfiguration([{ path: "project.edn", content }]);
  assert.equal(config.id, "conveyor/cell-a");
  assert.equal(config.entry, "route-package");
  assert.equal(config.autoStart, true);
});
