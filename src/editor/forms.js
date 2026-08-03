const OPEN_TO_CLOSE = new Map([["(", ")"], ["[", "]"], ["{", "}"]]);
const CLOSE_TO_OPEN = new Map([...OPEN_TO_CLOSE].map(([open, close]) => [close, open]));

/**
 * Returns the complete top-level collection containing the cursor. HAL forms
 * are scanned structurally while strings, escapes, and line comments are
 * ignored. For atoms and strings, the current non-empty line is returned.
 */
export function formAtCursor(source, cursor) {
  const text = String(source);
  const position = Math.max(0, Math.min(Number(cursor) || 0, text.length));
  const forms = topLevelCollections(text);
  const containing = forms
    .filter((form) => form.start <= position && position <= form.end)
    .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0];
  if (containing) return text.slice(containing.start, containing.end).trim();

  const lineStart = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const nextBreak = text.indexOf("\n", position);
  const lineEnd = nextBreak < 0 ? text.length : nextBreak;
  const line = text.slice(lineStart, lineEnd).replace(/;.*$/, "").trim();
  return line || null;
}

export function topLevelCollections(source) {
  const text = String(source);
  const forms = [];
  const stack = [];
  let topStart = null;
  let inString = false;
  let escaped = false;
  let inComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inComment) {
      if (character === "\n") inComment = false;
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === ";") {
      inComment = true;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (OPEN_TO_CLOSE.has(character)) {
      if (stack.length === 0) topStart = index;
      stack.push(character);
      continue;
    }
    if (CLOSE_TO_OPEN.has(character)) {
      const expected = CLOSE_TO_OPEN.get(character);
      if (stack.at(-1) !== expected) continue;
      stack.pop();
      if (stack.length === 0 && topStart != null) {
        forms.push({ start: topStart, end: index + 1 });
        topStart = null;
      }
    }
  }
  return forms;
}
