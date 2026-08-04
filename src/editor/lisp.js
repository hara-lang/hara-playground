const OPEN_TO_CLOSE = Object.freeze({ "(": ")", "[": "]", "{": "}" });
const CLOSE_TO_OPEN = Object.freeze(Object.fromEntries(Object.entries(OPEN_TO_CLOSE).map(([open, close]) => [close, open])));

import { HARA_SPECIAL_FORMS, collectSourceSymbols } from "../language/completion.js";

export { HARA_CORE_COMPLETIONS, HARA_SPECIAL_FORMS, collectSourceSymbols } from "../language/completion.js";

const SPECIAL = new Set(HARA_SPECIAL_FORMS);
const LITERALS = new Set(["nil", "true", "false"]);
const WORD_CHARACTER = /[A-Za-z0-9_?!*+\-./:<>=]/;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function atomType(value) {
  if (value.startsWith(":")) return "keyword";
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return "number";
  if (SPECIAL.has(value)) return "special";
  if (LITERALS.has(value)) return "literal";
  return "symbol";
}

export function scanHara(source) {
  const text = String(source);
  const tokens = [];
  const stack = [];
  const pairs = new Map();
  const unmatched = new Set();
  let index = 0;

  while (index < text.length) {
    const character = text[index];
    if (/\s|,/.test(character)) {
      index += 1;
      continue;
    }

    if (character === ";") {
      const start = index;
      while (index < text.length && text[index] !== "\n") index += 1;
      tokens.push({ type: "comment", value: text.slice(start, index), start, end: index });
      continue;
    }

    if (character === '"') {
      const start = index;
      index += 1;
      let escaped = false;
      let closed = false;
      while (index < text.length) {
        const next = text[index];
        index += 1;
        if (escaped) escaped = false;
        else if (next === "\\") escaped = true;
        else if (next === '"') {
          closed = true;
          break;
        }
      }
      const token = { type: "string", value: text.slice(start, index), start, end: index, closed };
      tokens.push(token);
      if (!closed) unmatched.add(start);
      continue;
    }

    if (OPEN_TO_CLOSE[character]) {
      const token = {
        type: "delimiter",
        role: "open",
        value: character,
        start: index,
        end: index + 1,
        depth: stack.length
      };
      tokens.push(token);
      stack.push(token);
      index += 1;
      continue;
    }

    if (CLOSE_TO_OPEN[character]) {
      const opening = stack.at(-1);
      const matched = opening?.value === CLOSE_TO_OPEN[character];
      if (matched) stack.pop();
      const token = {
        type: "delimiter",
        role: "close",
        value: character,
        start: index,
        end: index + 1,
        depth: matched ? opening.depth : Math.max(0, stack.length - 1)
      };
      tokens.push(token);
      if (matched) {
        pairs.set(opening.start, token.start);
        pairs.set(token.start, opening.start);
      } else {
        unmatched.add(token.start);
      }
      index += 1;
      continue;
    }

    const start = index;
    while (
      index < text.length &&
      !/\s|,/.test(text[index]) &&
      !OPEN_TO_CLOSE[text[index]] &&
      !CLOSE_TO_OPEN[text[index]] &&
      text[index] !== ";" &&
      text[index] !== '"'
    ) index += 1;
    const value = text.slice(start, index);
    tokens.push({ type: atomType(value), value, start, end: index });
  }

  for (const opening of stack) unmatched.add(opening.start);
  return { tokens, pairs, unmatched };
}

export function contextAt(source, cursor) {
  const position = Math.max(0, Math.min(Number(cursor) || 0, String(source).length));
  const { tokens } = scanHara(source);
  return tokens.find((token) => token.start < position && position <= token.end)
    || tokens.find((token) => token.start === position)
    || null;
}

export function matchingDelimiterIndices(source, cursor) {
  const text = String(source);
  const position = Math.max(0, Math.min(Number(cursor) || 0, text.length));
  const scan = scanHara(text);
  const delimiter = scan.tokens.find((token) => token.type === "delimiter" && (token.start === position || token.start === position - 1));
  if (!delimiter || !scan.pairs.has(delimiter.start)) return new Set();
  return new Set([delimiter.start, scan.pairs.get(delimiter.start)]);
}

export function highlightHara(source, cursor = 0) {
  const text = String(source);
  const scan = scanHara(text);
  const matches = matchingDelimiterIndices(text, cursor);
  let output = "";
  let index = 0;

  for (const token of scan.tokens) {
    if (token.start > index) output += escapeHtml(text.slice(index, token.start));
    const raw = escapeHtml(text.slice(token.start, token.end));
    const classes = [`syntax-${token.type}`];
    if (token.type === "delimiter") {
      classes.push("syntax-paren", `paren-depth-${token.depth % 6}`);
      if (matches.has(token.start)) classes.push("paren-match");
      if (scan.unmatched.has(token.start)) classes.push("paren-error");
    } else if (scan.unmatched.has(token.start)) {
      classes.push("syntax-error");
    }
    output += `<span class="${classes.join(" ")}">${raw}</span>`;
    index = token.end;
  }
  if (index < text.length) output += escapeHtml(text.slice(index));
  if (text.endsWith("\n")) output += " ";
  return output;
}

export function completionPrefixAt(source, cursor) {
  const text = String(source);
  const end = Math.max(0, Math.min(Number(cursor) || 0, text.length));
  const context = contextAt(text, end);
  if (context?.type === "comment" || context?.type === "string") return null;
  let start = end;
  while (start > 0 && WORD_CHARACTER.test(text[start - 1])) start -= 1;
  const prefix = text.slice(start, end);
  return prefix ? { prefix, start, end } : null;
}

export function insertBalanced(source, selectionStart, selectionEnd, open) {
  const text = String(source);
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const close = open === '"' ? '"' : OPEN_TO_CLOSE[open];
  if (!close) return null;
  const selected = text.slice(start, end);
  return {
    source: `${text.slice(0, start)}${open}${selected}${close}${text.slice(end)}`,
    selectionStart: start + 1,
    selectionEnd: selected ? end + 1 : start + 1
  };
}

export function skipClosing(source, selectionStart, selectionEnd, close) {
  const text = String(source);
  if (selectionStart !== selectionEnd || text[selectionEnd] !== close) return null;
  return { source: text, selectionStart: selectionEnd + 1, selectionEnd: selectionEnd + 1 };
}

export function backspaceBalanced(source, selectionStart, selectionEnd) {
  const text = String(source);
  if (selectionStart !== selectionEnd || selectionStart <= 0 || selectionStart >= text.length) return null;
  const open = text[selectionStart - 1];
  const close = text[selectionStart];
  if ((open === '"' && close === '"') || OPEN_TO_CLOSE[open] === close) {
    return {
      source: `${text.slice(0, selectionStart - 1)}${text.slice(selectionStart + 1)}`,
      selectionStart: selectionStart - 1,
      selectionEnd: selectionStart - 1
    };
  }
  return null;
}

function delimiterDepthAt(source, offset) {
  const text = String(source).slice(0, offset);
  const { tokens } = scanHara(text);
  let depth = 0;
  for (const token of tokens) {
    if (token.type !== "delimiter") continue;
    if (token.role === "open") depth += 1;
    else depth = Math.max(0, depth - 1);
  }
  return depth;
}

export function smartNewline(source, selectionStart, selectionEnd, indentWidth = 2) {
  const text = String(source);
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const depth = delimiterDepthAt(`${text.slice(0, start)}${text.slice(end)}`, start);
  const before = text[start - 1];
  const after = text[end];
  const parentDepth = OPEN_TO_CLOSE[before] === after ? Math.max(0, depth - 1) : depth;
  const indent = " ".repeat(depth * indentWidth);
  const parentIndent = " ".repeat(parentDepth * indentWidth);

  if (OPEN_TO_CLOSE[before] === after) {
    const insertion = `\n${indent}\n${parentIndent}`;
    return {
      source: `${text.slice(0, start)}${insertion}${text.slice(end)}`,
      selectionStart: start + 1 + indent.length,
      selectionEnd: start + 1 + indent.length
    };
  }
  const insertion = `\n${indent}`;
  return {
    source: `${text.slice(0, start)}${insertion}${text.slice(end)}`,
    selectionStart: start + insertion.length,
    selectionEnd: start + insertion.length
  };
}

export function collectionRanges(source) {
  const text = String(source);
  const scan = scanHara(text);
  const byStart = new Map(scan.tokens.filter((token) => token.type === "delimiter" && token.role === "open").map((token) => [token.start, token]));
  const ranges = [];
  for (const [start, endStart] of scan.pairs.entries()) {
    if (start > endStart || !byStart.has(start)) continue;
    const opening = byStart.get(start);
    ranges.push({ start, end: endStart + 1, open: opening.value, close: OPEN_TO_CLOSE[opening.value], depth: opening.depth });
  }
  return ranges.sort((left, right) => left.start - right.start || right.end - left.end);
}

function innermostCollection(source, start, end = start) {
  return collectionRanges(source)
    .filter((range) => range.start < start && end < range.end)
    .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0] || null;
}

function skipTrivia(text, index, limit = text.length) {
  let cursor = index;
  while (cursor < limit) {
    if (/\s|,/.test(text[cursor])) {
      cursor += 1;
      continue;
    }
    if (text[cursor] === ";") {
      while (cursor < limit && text[cursor] !== "\n") cursor += 1;
      continue;
    }
    break;
  }
  return cursor;
}

function formRangeAt(source, start, limit = String(source).length) {
  const text = String(source);
  let cursor = skipTrivia(text, start, limit);
  if (cursor >= limit) return null;
  const quoted = text[cursor] === "'";
  const formStart = cursor;
  if (quoted) cursor = skipTrivia(text, cursor + 1, limit);

  if (OPEN_TO_CLOSE[text[cursor]]) {
    const range = collectionRanges(text).find((candidate) => candidate.start === cursor);
    return range ? { start: formStart, end: range.end } : null;
  }

  if (text[cursor] === '"') {
    const token = scanHara(text).tokens.find((candidate) => candidate.type === "string" && candidate.start === cursor);
    return token ? { start: formStart, end: token.end } : null;
  }

  let end = cursor;
  while (end < limit && !/\s|,/.test(text[end]) && !OPEN_TO_CLOSE[text[end]] && !CLOSE_TO_OPEN[text[end]] && text[end] !== ";") end += 1;
  return end > cursor ? { start: formStart, end } : null;
}

function childForms(source, range) {
  const forms = [];
  let cursor = range.start + 1;
  const limit = range.end - 1;
  while (cursor < limit) {
    const form = formRangeAt(source, cursor, limit);
    if (!form) break;
    forms.push(form);
    cursor = form.end;
  }
  return forms;
}

export function expandStructuralSelection(source, selectionStart, selectionEnd) {
  const text = String(source);
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const candidates = collectionRanges(text)
    .filter((range) => range.start <= start && end <= range.end && (range.start < start || end < range.end))
    .sort((left, right) => (left.end - left.start) - (right.end - right.start));
  const range = candidates[0];
  if (range) return { source: text, selectionStart: range.start, selectionEnd: range.end };
  const form = formRangeAt(text, start);
  return form ? { source: text, selectionStart: form.start, selectionEnd: form.end } : null;
}

export function wrapStructural(source, selectionStart, selectionEnd, open = "(") {
  let start = selectionStart;
  let end = selectionEnd;
  if (start === end) {
    const expanded = expandStructuralSelection(source, start, end);
    if (expanded) {
      start = expanded.selectionStart;
      end = expanded.selectionEnd;
    }
  }
  return insertBalanced(source, start, end, open);
}

export function forwardSlurp(source, cursor) {
  const text = String(source);
  const range = innermostCollection(text, cursor);
  if (!range) return null;
  const next = formRangeAt(text, range.end);
  if (!next) return null;
  const withoutClose = `${text.slice(0, range.end - 1)}${text.slice(range.end)}`;
  const insertion = next.end - 1;
  return {
    source: `${withoutClose.slice(0, insertion)}${range.close}${withoutClose.slice(insertion)}`,
    selectionStart: cursor,
    selectionEnd: cursor
  };
}

export function forwardBarf(source, cursor) {
  const text = String(source);
  const range = innermostCollection(text, cursor);
  if (!range) return null;
  const forms = childForms(text, range);
  const last = forms.at(-1);
  if (!last) return null;
  let insertion = last.start;
  while (insertion > range.start + 1 && /\s|,/.test(text[insertion - 1])) insertion -= 1;
  const withoutClose = `${text.slice(0, range.end - 1)}${text.slice(range.end)}`;
  return {
    source: `${withoutClose.slice(0, insertion)}${range.close}${withoutClose.slice(insertion)}`,
    selectionStart: Math.min(cursor, insertion),
    selectionEnd: Math.min(cursor, insertion)
  };
}

function balanceLine(line, state) {
  let delta = 0;
  let leadingClosers = 0;
  let seenContent = false;
  let inString = state.inString;
  let escaped = state.escaped;
  let inComment = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (inComment) break;
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
    if (/\s|,/.test(character)) continue;
    if (!seenContent && CLOSE_TO_OPEN[character]) leadingClosers += 1;
    seenContent = true;
    if (OPEN_TO_CLOSE[character]) delta += 1;
    else if (CLOSE_TO_OPEN[character]) delta -= 1;
  }
  return { delta, leadingClosers, inString, escaped };
}

export function formatHara(source, indentWidth = 2) {
  const lines = String(source).split("\n");
  let depth = 0;
  let state = { inString: false, escaped: false };
  return lines.map((line) => {
    if (!line.trim()) return "";
    const content = line.trimStart();
    const balance = balanceLine(content, state);
    const indentDepth = Math.max(0, depth - balance.leadingClosers);
    depth = Math.max(0, depth + balance.delta);
    state = { inString: balance.inString, escaped: balance.escaped };
    return `${" ".repeat(indentDepth * indentWidth)}${content.trimEnd()}`;
  }).join("\n");
}
