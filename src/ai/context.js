const MAX_PROMPT_CHARS = 12000;
const DEFAULT_MAX_CONTEXT_CHARS = 180000;

function requiredPrompt(value) {
  if (typeof value !== "string") throw new TypeError("AI prompt must be a string");
  const prompt = value.trim();
  if (!prompt) throw new Error("Write a request for the AI assistant");
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`AI prompt cannot exceed ${MAX_PROMPT_CHARS.toLocaleString()} characters`);
  }
  return prompt;
}

function boundedSource(value, maximum) {
  const source = typeof value === "string" ? value : "";
  if (source.length <= maximum) return { source, truncated: false };
  return {
    source: `${source.slice(0, maximum)}\n\n;; Greenways context truncated by Hara Play`,
    truncated: true,
  };
}

export function buildPlayMessages({
  prompt,
  selectedPath,
  content,
  namespace,
  includeBuffer = true,
  maxContextChars = DEFAULT_MAX_CONTEXT_CHARS,
} = {}) {
  const request = requiredPrompt(prompt);
  if (!Number.isSafeInteger(maxContextChars) || maxContextChars < 1024 || maxContextChars > DEFAULT_MAX_CONTEXT_CHARS) {
    throw new Error("AI context limit is invalid");
  }

  const system = [
    "You are assisting inside Hara Play.",
    "Hara is a Lisp: preserve balanced forms, namespaces, and project conventions.",
    "Explain decisions clearly. Do not claim to have applied changes unless the user explicitly asks for a replacement and you provide the replacement source.",
  ].join(" ");

  const sections = [`Request:\n${request}`];
  let truncated = false;
  if (includeBuffer && selectedPath) {
    const bounded = boundedSource(content, maxContextChars);
    truncated = bounded.truncated;
    sections.push([
      `Current file: ${selectedPath}`,
      `Namespace: ${namespace || "user"}`,
      "Current buffer:",
      "```hara",
      bounded.source,
      "```",
    ].join("\n"));
  }

  return Object.freeze({
    messages: Object.freeze([
      Object.freeze({ role: "system", content: system }),
      Object.freeze({ role: "user", content: sections.join("\n\n") }),
    ]),
    truncated,
  });
}
