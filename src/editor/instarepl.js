import { topLevelCollections } from "./forms.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(Number(value) || 0, maximum));
}

function trimRange(text, start, end) {
  let left = clamp(start, 0, text.length);
  let right = clamp(end, left, text.length);
  while (left < right && /\s/.test(text[left])) left += 1;
  while (right > left && /\s/.test(text[right - 1])) right -= 1;
  return { start: left, end: right };
}

export function lineNumberAt(source, offset) {
  const text = String(source);
  const limit = clamp(offset, 0, text.length);
  let line = 1;
  for (let index = 0; index < limit; index += 1) {
    if (text[index] === "\n") line += 1;
  }
  return line;
}

export function hashInstantSource(source) {
  const text = String(source);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function candidateFromRange(text, range, kind) {
  if (range.end <= range.start) return null;
  const source = text.slice(range.start, range.end);
  if (!source.trim()) return null;
  const startLine = lineNumberAt(text, range.start);
  const endLine = lineNumberAt(text, Math.max(range.start, range.end - 1));
  return {
    kind,
    source,
    start: range.start,
    end: range.end,
    startLine,
    endLine,
    key: `${range.start}:${range.end}:${hashInstantSource(source)}`
  };
}

function lineCommentStart(text, lineStart, lineEnd) {
  let inString = false;
  let escaped = false;
  for (let index = lineStart; index < lineEnd; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === ";") return index;
  }
  return lineEnd;
}

function lineCandidate(text, position) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const nextBreak = text.indexOf("\n", position);
  const lineEnd = nextBreak < 0 ? text.length : nextBreak;
  const contentEnd = lineCommentStart(text, lineStart, lineEnd);
  const range = trimRange(text, lineStart, contentEnd);
  const source = text.slice(range.start, range.end);

  if (!source || /^[([{]/.test(source)) return null;
  return candidateFromRange(text, range, "line");
}

/**
 * Selects the expression that should be evaluated by InstaREPL. A non-empty
 * selection wins, followed by the smallest complete top-level collection that
 * contains the cursor, followed by a single atom/string line. Incomplete
 * collection lines are deliberately ignored so ordinary typing does not create
 * a stream of avoidable reader errors.
 */
export function instantFormAtCursor(source, options = {}) {
  const text = String(source);
  const cursor = clamp(options.cursor ?? options.selectionEnd ?? 0, 0, text.length);
  const selectionStart = clamp(options.selectionStart ?? cursor, 0, text.length);
  const selectionEnd = clamp(options.selectionEnd ?? cursor, selectionStart, text.length);

  if (selectionEnd > selectionStart) {
    return candidateFromRange(text, trimRange(text, selectionStart, selectionEnd), "selection");
  }

  const containing = topLevelCollections(text)
    .filter((form) => form.start <= cursor && cursor <= form.end)
    .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0];
  if (containing) {
    const start = containing.start > 0 && text[containing.start - 1] === "'"
      ? containing.start - 1
      : containing.start;
    return candidateFromRange(text, trimRange(text, start, containing.end), "form");
  }

  return lineCandidate(text, cursor);
}

export function instantCandidateChanged(left, right) {
  return (left?.key || null) !== (right?.key || null);
}
