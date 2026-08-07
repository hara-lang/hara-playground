import assert from "node:assert/strict";
import test from "node:test";
import {
  HODOS_CATALOG_ACTIVITY_AREA_ID,
  HODOS_CATALOG_COMPONENT_ID,
  HODOS_CATALOG_TOOLS_AREA_ID,
  catalogWorkspacePatch,
} from "../src/hodos/catalog-events.js";

function event(areaId, type, payload = {}) {
  return {
    "component/id": HODOS_CATALOG_COMPONENT_ID,
    "area/id": areaId,
    "event/type": type,
    ...payload,
  };
}

test("Catalog semantic events project bounded application patches", () => {
  assert.deepEqual(
    catalogWorkspacePatch(event(
      HODOS_CATALOG_TOOLS_AREA_ID,
      "catalog/select-toolset",
      { toolsetId: "core" },
    )),
    { kind: "select-toolset", toolsetId: "core" },
  );
  assert.deepEqual(
    catalogWorkspacePatch(event(
      HODOS_CATALOG_TOOLS_AREA_ID,
      "catalog/insert-tool",
      { toolsetId: "core", toolId: "function" },
    )),
    { kind: "insert-tool", toolsetId: "core", toolId: "function" },
  );
  assert.deepEqual(
    catalogWorkspacePatch(event(
      HODOS_CATALOG_ACTIVITY_AREA_ID,
      "catalog/check-activity",
      { activityId: "live-value" },
    )),
    { kind: "check-activity", activityId: "live-value" },
  );
});

test("Catalog rejects cross-surface, unknown and executable event payloads", () => {
  assert.equal(catalogWorkspacePatch({
    "component/id": "other/catalog",
    "area/id": HODOS_CATALOG_TOOLS_AREA_ID,
    "event/type": "catalog/select-toolset",
    toolsetId: "core",
  }), null);
  assert.equal(catalogWorkspacePatch(event(
    HODOS_CATALOG_ACTIVITY_AREA_ID,
    "catalog/insert-tool",
    { toolsetId: "core", toolId: "function" },
  )), null);
  assert.throws(() => catalogWorkspacePatch(event(
    HODOS_CATALOG_TOOLS_AREA_ID,
    "catalog/insert-tool",
    { toolsetId: "core", toolId: "missing", snippet: "(delete-everything)" },
  )), /Unknown Hodos Catalog tool/);
  assert.throws(() => catalogWorkspacePatch(event(
    HODOS_CATALOG_ACTIVITY_AREA_ID,
    "catalog/open-activity",
    { activityId: "missing", source: "(malicious)" },
  )), /Unknown Hodos Catalog activity/);
});
