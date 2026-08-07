import {
  playgroundAreaIds,
  playgroundSurfaceById,
  workspaceTokenName,
} from "./workspace-shell-state.js";

const eventType = (value) => value?.["event/type"] ?? value?.type ?? null;

export function workspaceShellPatch(value, descriptor) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (eventType(value) !== "workspace/area-select") return null;
  if (!descriptor || typeof descriptor !== "object") {
    throw new TypeError("Workspace shell event validation requires the current descriptor");
  }

  const workspaceId = workspaceTokenName(value["workspace/id"] ?? value.workspaceId);
  const expectedWorkspaceId = workspaceTokenName(descriptor["workspace/id"]);
  if (!workspaceId || workspaceId !== expectedWorkspaceId) {
    throw new Error(`Workspace shell event targeted a different Workspace: ${workspaceId || "<missing>"}`);
  }

  const areaId = workspaceTokenName(value["area/id"] ?? value.areaId);
  if (!playgroundAreaIds(descriptor).has(areaId)) {
    throw new Error(`Workspace shell event references missing area: ${areaId || "<missing>"}`);
  }

  const surfaceId = workspaceTokenName(value["surface/id"] ?? value.surfaceId);
  const surface = playgroundSurfaceById(descriptor, surfaceId);
  if (!surface) throw new Error(`Workspace shell event references missing surface: ${surfaceId || "<missing>"}`);
  const surfaceAreaId = workspaceTokenName(surface["surface/area"] ?? surface.areaId);
  if (surfaceAreaId !== areaId) {
    throw new Error(`Workspace shell surface ${surfaceId} does not belong to area ${areaId}`);
  }

  return Object.freeze({
    kind: "select-area",
    workspaceId,
    areaId,
    surfaceId,
  });
}
