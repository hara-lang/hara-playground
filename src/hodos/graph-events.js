const COMPONENT_ID = "hodos.2d/graph";
const MAX_SELECTION = 10_000;
const MAX_COORDINATE = 1_000_000;

const nonEmptyString = (value, label) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
};

const stringArray = (value, label) => {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  if (value.length > MAX_SELECTION) throw new RangeError(`${label} exceeds the application limit`);
  const output = value.map((entry, index) => nonEmptyString(entry, `${label} ${index}`));
  if (new Set(output).size !== output.length) throw new Error(`${label} must not contain duplicates`);
  return Object.freeze(output);
};

const coordinate = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > MAX_COORDINATE) {
    throw new TypeError(`${label} must be a finite bounded number`);
  }
  return number;
};

const identity = (event) => {
  const componentId = nonEmptyString(event["component/id"], "Hodos Graph component id");
  if (componentId !== COMPONENT_ID) throw new Error(`Unexpected Hodos Graph component: ${componentId}`);
  return {
    areaId: nonEmptyString(event["area/id"], "Hodos Graph area id"),
    graphId: nonEmptyString(event.graphId, "Hodos Graph graph id"),
  };
};

export function graphWorkspacePatch(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const type = typeof event["event/type"] === "string" ? event["event/type"] : "";
  if (!type.startsWith("graph/")) return null;
  const base = identity(event);

  if (type === "graph/select") {
    return Object.freeze({
      kind: "select",
      ...base,
      nodeIds: stringArray(event.nodeIds ?? [], "Hodos Graph selected node ids"),
      connectionIds: stringArray(event.connectionIds ?? [], "Hodos Graph selected connection ids"),
    });
  }

  if (type === "graph/move-node") {
    return Object.freeze({
      kind: "move-node",
      ...base,
      nodeId: nonEmptyString(event.nodeId, "Hodos Graph moved node id"),
      x: coordinate(event.x, "Hodos Graph node x"),
      y: coordinate(event.y, "Hodos Graph node y"),
    });
  }

  throw new Error(`Unsupported Hodos Graph event: ${type}`);
}
