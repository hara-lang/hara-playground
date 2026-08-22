const COMPONENT_ID = "hodos.2d/document";
// Play admits only the first authoritative selection/text slice here;
// broader document commands remain application-service policy until separately proven.
const MAX_TEXT_LENGTH = 1_000_000;

const nonEmptyString = (value, label) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
};

const identity = (event) => {
  const componentId = nonEmptyString(event["component/id"], "Hodos Document component id");
  if (componentId !== COMPONENT_ID) {
    throw new Error(`Unexpected Hodos Document component: ${componentId}`);
  }
  return {
    areaId: nonEmptyString(event["area/id"], "Hodos Document area id"),
    documentId: nonEmptyString(event.documentId, "Hodos Document document id"),
  };
};

export function documentWorkspacePatch(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const type = typeof event["event/type"] === "string" ? event["event/type"] : "";
  if (!type.startsWith("document/")) return null;
  const base = identity(event);

  if (type === "document/select") {
    return Object.freeze({
      kind: "select",
      ...base,
      nodeId: nonEmptyString(event.nodeId, "Hodos Document selected node id"),
    });
  }

  if (type === "document/edit-text") {
    if (typeof event.previous !== "string" || typeof event.text !== "string") {
      throw new TypeError("Hodos Document text edits require previous and text strings");
    }
    if (event.text.length > MAX_TEXT_LENGTH) {
      throw new RangeError("Hodos Document text exceeds the application limit");
    }
    return Object.freeze({
      kind: "edit-text",
      ...base,
      blockId: nonEmptyString(event.blockId, "Hodos Document block id"),
      textId: nonEmptyString(event.textId, "Hodos Document text id"),
      previous: event.previous,
      text: event.text,
    });
  }

  throw new Error(`Unsupported Hodos Document event: ${type}`);
}
