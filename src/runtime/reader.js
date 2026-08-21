export class HaraReaderError extends Error {
  constructor(message, position) {
    super(`${message} at character ${position}`);
    this.name = "HaraReaderError";
    this.position = position;
  }
}

const delimiters = new Set(["(", ")", "[", "]", "{", "}"]);

export function tokenize(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (/\s|,/.test(char)) {
      index += 1;
      continue;
    }
    if (char === ";") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "#" && source[index + 1] === "{") {
      tokens.push({ type: "delimiter", value: "#{", position: index });
      index += 2;
      continue;
    }
    if (delimiters.has(char)) {
      tokens.push({ type: "delimiter", value: char, position: index });
      index += 1;
      continue;
    }
    if (char === "'") {
      tokens.push({ type: "quote", value: char, position: index });
      index += 1;
      continue;
    }
    if (char === '"') {
      const position = index;
      index += 1;
      let value = "";
      let closed = false;
      while (index < source.length) {
        const next = source[index];
        if (next === '"') {
          index += 1;
          closed = true;
          break;
        }
        if (next === "\\") {
          index += 1;
          if (index >= source.length) break;
          const escaped = source[index];
          const escapes = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" };
          value += escapes[escaped] ?? escaped;
          index += 1;
          continue;
        }
        value += next;
        index += 1;
      }
      if (!closed) throw new HaraReaderError("Unterminated string", position);
      tokens.push({ type: "string", value, position });
      continue;
    }

    const position = index;
    let value = "";
    while (
      index < source.length &&
      !/\s|,/.test(source[index]) &&
      !delimiters.has(source[index]) &&
      source[index] !== ";" &&
      source[index] !== "'"
    ) {
      value += source[index];
      index += 1;
    }
    if (!value) throw new HaraReaderError(`Unexpected character ${source[index]}`, index);
    tokens.push({ type: "atom", value, position });
  }
  return tokens;
}

export function symbol(name) {
  return { type: "symbol", name };
}

export function keyword(name) {
  return { type: "keyword", name: name.startsWith(":") ? name.slice(1) : name };
}

export function list(items) {
  return { type: "list", items };
}

export function vector(items) {
  return { type: "vector", items };
}

export function set(items) {
  return { type: "set", items };
}

export function map(entries) {
  return { type: "map", entries };
}

function parseAtom(token) {
  if (token.type === "string") return token.value;
  const value = token.value;
  if (value === "nil") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return Number(value);
  if (value.startsWith(":")) return keyword(value);
  return symbol(value);
}

export function readAll(source) {
  const tokens = tokenize(source);
  let cursor = 0;

  function readForm() {
    const token = tokens[cursor];
    if (!token) throw new HaraReaderError("Unexpected end of input", source.length);
    cursor += 1;

    if (token.type === "quote") return list([symbol("quote"), readForm()]);
    if (token.type !== "delimiter") return parseAtom(token);

    const pairs = { "(": ")", "[": "]", "{": "}", "#{": "}" };
    const close = pairs[token.value];
    if (!close) throw new HaraReaderError(`Unexpected '${token.value}'`, token.position);

    const values = [];
    while (cursor < tokens.length && tokens[cursor].value !== close) values.push(readForm());
    if (cursor >= tokens.length) throw new HaraReaderError(`Expected '${close}'`, token.position);
    cursor += 1;

    if (token.value === "(") return list(values);
    if (token.value === "[") return vector(values);
    if (token.value === "#{") return set(values);
    if (values.length % 2 !== 0) throw new HaraReaderError("Map literal requires an even number of forms", token.position);
    const entries = [];
    for (let index = 0; index < values.length; index += 2) entries.push([values[index], values[index + 1]]);
    return map(entries);
  }

  const forms = [];
  while (cursor < tokens.length) forms.push(readForm());
  return forms;
}
