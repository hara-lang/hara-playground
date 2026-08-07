#!/usr/bin/env python3
from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(dedent(content).lstrip("\n"), encoding="utf-8")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


def replace_region(source: str, start: str, end: str, replacement: str, label: str) -> str:
    start_index = source.find(start)
    if start_index < 0:
        raise SystemExit(f"{label}: start anchor not found")
    end_index = source.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"{label}: end anchor not found")
    return source[:start_index] + dedent(replacement).lstrip("\n") + source[end_index:]


def update_context() -> None:
    path = "src/app/context.js"
    source = read(path)
    source = replace_once(
        source,
        'const initialTheme = readSetting(STUDIO_SETTING_KEYS.theme, readSetting("hara-studio-theme", "dark"));',
        'const initialTheme = readSetting(STUDIO_SETTING_KEYS.theme, readSetting("hara-studio-theme", "dark"));\nconst initialOutput = readSetting(STUDIO_SETTING_KEYS.output, "preview");',
        "initial output setting",
    )
    source = replace_once(
        source,
        '  outputTab: readSetting(STUDIO_SETTING_KEYS.output, "preview") === "repl" ? "repl" : "preview",',
        '  outputTab: ["preview", "repl", "value"].includes(initialOutput) ? initialOutput : "preview",',
        "output tab state",
    )
    preview_line = "  preview: previewDocument({ type: \"html\", html: '<main class=\"preview-shell\"><article class=\"card\"><span class=\"eyebrow\">HARA KERNEL</span><h1>Open a project</h1><p>The preview is produced by values and effects from the browser kernel.</p></article></main>' }),\n"
    inspector = dedent('''
      valueInspector: {
        request: 0,
        valueId: null,
        requestId: null,
        status: "idle",
        display: "",
        value: null,
        valueType: null,
        namespace: null,
        source: null,
        path: [],
        expanded: [[]],
        metadata: {},
        error: ""
      },
    ''')
    source = replace_once(source, preview_line, preview_line + inspector, "value inspector state")
    write(path, source)


def update_actions() -> None:
    path = "src/app/actions.js"
    source = read(path)
    reset = dedent('''
    export function resetValueInspector() {
      const request = Number(state.valueInspector?.request || 0) + 1;
      state.valueInspector = {
        request,
        valueId: null,
        requestId: null,
        status: "idle",
        display: "",
        value: null,
        valueType: null,
        namespace: null,
        source: null,
        path: [],
        expanded: [[]],
        metadata: {},
        error: ""
      };
      if (state.outputTab === "value") {
        state.outputTab = "repl";
        writeSetting(STUDIO_SETTING_KEYS.output, "repl");
      }
    }

    ''')
    anchor = "export async function prepareProjectHome() {"
    index = source.find(anchor)
    if index < 0:
        raise SystemExit("reset value inspector: anchor not found")
    source = source[:index] + reset + source[index:]
    source = replace_once(
        source,
        'export async function bootRuntime() {\n  state.runtimeStatus = "booting";\n  resetInstantEvaluation();\n  render();',
        'export async function bootRuntime() {\n  state.runtimeStatus = "booting";\n  resetInstantEvaluation();\n  resetValueInspector();\n  render();',
        "runtime inspector reset",
    )
    source = replace_region(
        source,
        "export function appendRepl(",
        "export async function evaluate(",
        '''
        export function appendRepl(kind, text, namespace = state.namespace, metadata = {}) {
          const entry = { kind, text: String(text).replace(/\\n$/, ""), namespace };
          for (const key of ["valueId", "requestId", "source"]) {
            if (typeof metadata?.[key] === "string" && metadata[key]) entry[key] = metadata[key];
          }
          state.repl.push(entry);
          if (state.repl.length > 300) state.repl.splice(0, state.repl.length - 300);
        }

        ''',
        "REPL metadata",
    )
    source = replace_once(
        source,
        '      appendRepl("result", result.display);',
        '''      appendRepl("result", result.display, result.namespace || state.namespace, {
        valueId: result.valueId,
        requestId: result.requestId,
        source
      });''',
        "evaluated retained value",
    )
    source = replace_region(
        source,
        "export function selectOutputTab(",
        "export async function openActivity(",
        '''
        export function selectOutputTab(tab) {
          if (!["preview", "repl", "value"].includes(tab)) return false;
          state.outputTab = tab;
          writeSetting(STUDIO_SETTING_KEYS.output, tab);
          render();
          return true;
        }

        ''',
        "value output tab",
    )
    source = replace_once(
        source,
        '    appendRepl("result", `${result.display} · loaded ${state.selectedPath}`);',
        '''    appendRepl("result", `${result.display} · loaded ${state.selectedPath}`, result.namespace || state.namespace, {
      valueId: result.valueId,
      requestId: result.requestId,
      source: state.content
    });''',
        "loaded retained value",
    )
    write(path, source)


def write_repl() -> None:
    write("src/hodos/repl.js", r'''
    import { createHodosComponentRegistry } from "@greenways/hodos-web";
    import { createWorkspaceAreaHost } from "@greenways/hodos-workspace-ui";
    import { createReplArea } from "@greenways/hodos-dev";
    import { registerHodosReplUi } from "@greenways/hodos-dev-ui";

    const registry = createHodosComponentRegistry();
    registerHodosReplUi(registry, { createReplHost: createPlaygroundReplHost });

    let areaHost = null;

    const MARKERS = Object.freeze({
      input: null,
      result: "→",
      stdout: "│",
      error: "!",
      diagnostic: "·",
    });

    function statusValue(value) {
      if (value === "ready") return "ready";
      if (value === "booting" || value === "evaluating") return "busy";
      if (value === "error") return "error";
      if (value === "closed") return "closed";
      return "idle";
    }

    function send(dispatch, event) {
      void Promise.resolve(dispatch(event)).catch((error) => {
        console.error("[hara playground hodos repl]", error);
      });
    }

    function entryNode(entry, namespace, dispatch, signal) {
      const line = document.createElement("div");
      line.className = `repl-line ${entry.kind}`;
      if (entry.kind === "input") {
        const prompt = document.createElement("span");
        prompt.className = "prompt";
        prompt.textContent = `${entry.namespace || namespace}=>`;
        const text = document.createElement("span");
        text.textContent = entry.text;
        line.append(prompt, text);
        return line;
      }

      const marker = document.createElement("span");
      marker.className = "output-marker";
      marker.textContent = MARKERS[entry.kind] ?? "→";
      const text = document.createElement("span");
      text.textContent = entry.text;
      line.append(marker, text);

      if (entry.kind === "result" && entry.valueId) {
        line.classList.add("has-value");
        line.dataset.valueId = entry.valueId;
        const inspect = document.createElement("button");
        inspect.type = "button";
        inspect.className = "value-inspect-button";
        inspect.textContent = "Inspect";
        inspect.title = "Inspect retained kernel value";
        inspect.addEventListener("click", () => send(dispatch, {
          "event/type": "repl/inspect",
          valueId: entry.valueId,
        }), { signal });
        line.append(inspect);
      }
      return line;
    }

    export function createPlaygroundReplHost({ container, dispatch }) {
      const output = container?.querySelector?.("#repl-output");
      const form = container?.querySelector?.("#repl-form");
      const input = container?.querySelector?.("#repl-input");
      const clear = container?.querySelector?.("#clear-repl-button");
      const toolbarNamespace = container?.querySelector?.(".repl-toolbar span");
      const prompt = container?.querySelector?.(".repl-form > span");
      if (!output || !form || !input || !clear) {
        throw new Error("Hodos REPL requires the Playground REPL controls");
      }

      const abort = new AbortController();
      const signal = abort.signal;

      input.addEventListener("input", () => send(dispatch, {
        "event/type": "repl/input",
        source: input.value,
      }), { signal });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        send(dispatch, {
          "event/type": "repl/submit",
          source: input.value,
        });
      }, { signal });
      clear.addEventListener("click", () => send(dispatch, {
        "event/type": "repl/clear",
      }), { signal });
      input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          send(dispatch, {
            "event/type": "repl/history",
            direction: event.key === "ArrowUp" ? -1 : 1,
          });
          return;
        }
        if (event.key === "Escape") send(dispatch, { "event/type": "repl/cancel" });
      }, { signal });

      return {
        update(model) {
          output.replaceChildren(...model.entries.map((entry) =>
            entryNode(entry, model.namespace, dispatch, signal)));
          output.scrollTop = output.scrollHeight;
          if (toolbarNamespace) toolbarNamespace.textContent = `${model.namespace} namespace`;
          if (prompt) prompt.textContent = `${model.namespace}=>`;
          if (input.value !== model.input) input.value = model.input;
          input.disabled = !model.canSubmit;
          container.dataset.replSession = model.session.id || "";
          container.dataset.replStatus = model.session.status;
        },
        dispose() {
          abort.abort();
          delete container.dataset.replSession;
          delete container.dataset.replStatus;
        },
      };
    }

    export function replAreaFromPlayground(state) {
      return createReplArea({
        id: "repl/main",
        sessionId: state.workspace ? `workspace:${state.workspace}` : null,
        namespace: state.namespace,
        status: statusValue(state.runtimeStatus),
        entries: state.repl.map((entry) => ({
          kind: entry.kind === "diagnostic" ? "diagnostic" : entry.kind,
          text: String(entry.text ?? ""),
          namespace: entry.namespace || null,
          requestId: entry.requestId || null,
          valueId: entry.valueId || null,
        })),
        input: state.replInput || "",
        history: state.history,
        historyIndex: state.historyIndex,
        canSubmit: state.runtimeStatus === "ready",
      });
    }

    export function disposeHodosRepl() {
      areaHost?.destroy();
      areaHost = null;
    }

    export function mountHodosRepl(state) {
      disposeHodosRepl();
      const root = globalThis.document?.querySelector(".repl-view");
      if (!root) return false;
      areaHost = createWorkspaceAreaHost({
        root,
        registry,
        dispatch(event) {
          globalThis.document?.dispatchEvent(new CustomEvent("hodos:workspace-event", {
            detail: event,
          }));
        },
      });
      areaHost.open(replAreaFromPlayground(state));
      return true;
    }

    export function updateHodosRepl(state) {
      if (!areaHost) return false;
      areaHost.update(replAreaFromPlayground(state));
      return true;
    }
    ''')


def write_repl_events() -> None:
    write("src/hodos/repl-events.js", r'''
    export const HODOS_REPL_COMPONENT_ID = "hodos.dev/repl";
    export const HODOS_REPL_AREA_ID = "repl/main";

    function eventType(value) {
      return value?.["event/type"] ?? value?.type ?? null;
    }

    function sourceValue(value, label) {
      if (typeof value !== "string") throw new TypeError(`${label} requires string source`);
      return value;
    }

    function identifierValue(value, label) {
      if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(`${label} requires a non-empty string`);
      }
      return value.trim();
    }

    export function replWorkspacePatch(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      if (value["component/id"] !== HODOS_REPL_COMPONENT_ID) return null;
      if (value["area/id"] !== HODOS_REPL_AREA_ID) return null;

      const type = eventType(value);
      if (type === "repl/input") {
        return Object.freeze({ kind: "input", source: sourceValue(value.source, "Hodos REPL input") });
      }
      if (type === "repl/submit") {
        return Object.freeze({ kind: "submit", source: sourceValue(value.source, "Hodos REPL submit") });
      }
      if (type === "repl/inspect") {
        return Object.freeze({
          kind: "inspect",
          valueId: identifierValue(value.valueId, "Hodos REPL inspect"),
        });
      }
      if (type === "repl/clear") return Object.freeze({ kind: "clear" });
      if (type === "repl/cancel") return Object.freeze({ kind: "cancel" });
      if (type === "repl/history") {
        const direction = Number(value.direction);
        if (direction !== -1 && direction !== 1) {
          throw new TypeError("Hodos REPL history direction must be -1 or 1");
        }
        return Object.freeze({ kind: "history", direction });
      }
      return null;
    }
    ''')


def update_view() -> None:
    path = "src/app/view.js"
    source = read(path)
    source = replace_region(
        source,
        "function renderOutputPanel() {",
        "function renderWorkbench() {",
        r'''
        function renderOutputPanel() {
          const valueAvailable = Boolean(state.valueInspector?.valueId);
          const mode = state.outputTab === "value" ? "retained kernel value" : "kernel effects";
          return `<aside class="output-panel hara-surface">
            <header class="output-tabs">
              <button class="output-tab ${state.outputTab === "preview" ? "active" : ""}" data-output-tab="preview">${icon("eye")} Preview</button>
              <button class="output-tab ${state.outputTab === "repl" ? "active" : ""}" data-output-tab="repl">${icon("terminal")} REPL</button>
              <button class="output-tab ${state.outputTab === "value" ? "active" : ""}" data-output-tab="value" ${valueAvailable ? "" : "disabled"}>${icon("list")} Value</button>
              <span class="preview-mode">${mode}</span>
            </header>
            <section class="preview-view ${state.outputTab === "preview" ? "active" : ""}"><iframe id="preview" title="Hara preview" sandbox="" referrerpolicy="no-referrer"></iframe></section>
            <section class="repl-view ${state.outputTab === "repl" ? "active" : ""}">
              <div class="repl-toolbar"><span>${escapeHtml(state.namespace)} namespace</span><button id="clear-repl-button" class="text-button">Clear</button></div>
              <div id="repl-output" class="repl-output">${renderRepl()}</div>
              <form id="repl-form" class="repl-form"><span>${escapeHtml(state.namespace)}=&gt;</span><input id="repl-input" aria-label="REPL input" autocomplete="off" spellcheck="false" placeholder="(+ 1 2)" ${state.runtimeStatus !== "ready" ? "disabled" : ""}></form>
            </section>
            <section class="value-view ${state.outputTab === "value" ? "active" : ""}" aria-label="Retained value inspector">
              <div class="value-inspector-placeholder">Select <strong>Inspect</strong> beside a retained REPL result.</div>
            </section>
          </aside>`;
        }

        ''',
        "value output panel",
    )
    write(path, source)


def update_main() -> None:
    path = "src/main.js"
    source = read(path)
    source = replace_once(
        source,
        'import { disposeHodosRepl, mountHodosRepl } from "./hodos/repl.js";',
        'import { disposeHodosRepl, mountHodosRepl } from "./hodos/repl.js";\nimport { disposeHodosValueInspector, mountHodosValueInspector } from "./hodos/value-inspector.js";',
        "value inspector import",
    )
    source = replace_once(
        source,
        "  disposeHodosRepl();\n  render(bindEvents);",
        "  disposeHodosRepl();\n  disposeHodosValueInspector();\n  render(bindEvents);",
        "value inspector disposal",
    )
    source = replace_once(
        source,
        "  mountHodosRepl(state);",
        "  mountHodosRepl(state);\n  mountHodosValueInspector(state);",
        "value inspector mount",
    )
    write(path, source)


def update_events() -> None:
    path = "src/app/events.js"
    source = read(path)
    source = replace_once(
        source,
        'import { replWorkspacePatch } from "../hodos/repl-events.js";',
        dedent('''
        import { replWorkspacePatch } from "../hodos/repl-events.js";
        import { valueInspectorWorkspacePatch } from "../hodos/value-inspector-events.js";
        import {
          formatInspectableValue,
          inspectableType,
          projectInspectableValue,
          valueAtPath,
        } from "../hodos/value-projector.js";
        import { updateHodosValueInspector } from "../hodos/value-inspector.js";
        ''').strip(),
        "value inspector event imports",
    )
    source = replace_once(
        source,
        "  resetInstantEvaluation,\n  resumeWorkspace,",
        "  resetInstantEvaluation,\n  resetValueInspector,\n  resumeWorkspace,",
        "value inspector reset import",
    )
    source = replace_region(
        source,
        "async function applyReplWorkspacePatch(patch) {",
        "function bindProjectLobbyEvents() {",
        r'''
        function inspectorEntry(valueId) {
          return [...state.repl].reverse().find((entry) => entry.valueId === valueId) || null;
        }

        async function inspectRetainedValue(valueId) {
          const entry = inspectorEntry(valueId);
          const request = Number(state.valueInspector?.request || 0) + 1;
          const sameValue = state.valueInspector?.valueId === valueId;
          state.valueInspector = {
            request,
            valueId,
            requestId: entry?.requestId || null,
            status: "loading",
            display: entry?.text || "",
            value: sameValue ? state.valueInspector.value : null,
            valueType: sameValue ? state.valueInspector.valueType : null,
            namespace: entry?.namespace || state.namespace,
            source: entry?.source || null,
            path: sameValue ? state.valueInspector.path : [],
            expanded: sameValue ? state.valueInspector.expanded : [[]],
            metadata: { origin: "repl", retained: true },
            error: ""
          };
          state.outputTab = "value";
          writeSetting(STUDIO_SETTING_KEYS.output, "value");
          render();

          try {
            const inspected = await runtime.inspect(valueId);
            if (request !== state.valueInspector.request) return;
            state.valueInspector = {
              ...state.valueInspector,
              valueId: inspected.valueId || valueId,
              status: "ready",
              display: String(inspected.display ?? entry?.text ?? ""),
              value: projectInspectableValue(inspected.value),
              valueType: inspectableType(inspected.value),
              error: ""
            };
          } catch (error) {
            if (request !== state.valueInspector.request) return;
            state.valueInspector = {
              ...state.valueInspector,
              status: "error",
              error: error.message,
            };
          }
          updateHodosValueInspector(state);
        }

        async function applyReplWorkspacePatch(patch) {
          if (patch.kind === "input") {
            state.replInput = patch.source;
            return;
          }
          if (patch.kind === "clear") {
            state.repl = [];
            updateReplOnly();
            return;
          }
          if (patch.kind === "history") {
            state.historyIndex = Math.max(0, Math.min(
              state.history.length,
              state.historyIndex + patch.direction,
            ));
            state.replInput = state.history[state.historyIndex] || "";
            updateReplOnly();
            queueMicrotask(() => document.querySelector("#repl-input")?.focus());
            return;
          }
          if (patch.kind === "cancel") {
            runtime.cancel?.();
            return;
          }
          if (patch.kind === "inspect") {
            await inspectRetainedValue(patch.valueId);
            return;
          }
          if (patch.kind !== "submit" || !patch.source.trim()) return;

          state.replInput = "";
          state.history.push(patch.source);
          state.historyIndex = state.history.length;
          updateReplOnly();
          await evaluate(patch.source);
        }

        async function applyValueInspectorWorkspacePatch(patch) {
          if (patch.kind === "close") {
            resetValueInspector();
            render();
            return;
          }
          if (patch.kind === "refresh") {
            if (state.valueInspector.valueId) await inspectRetainedValue(state.valueInspector.valueId);
            return;
          }
          if (patch.kind === "select") {
            state.valueInspector.path = patch.path;
            updateHodosValueInspector(state);
            return;
          }
          if (patch.kind === "toggle") {
            const key = JSON.stringify(patch.path);
            const expanded = state.valueInspector.expanded || [];
            state.valueInspector.expanded = expanded.some((path) => JSON.stringify(path) === key)
              ? expanded.filter((path) => JSON.stringify(path) !== key)
              : [...expanded, patch.path];
            updateHodosValueInspector(state);
            return;
          }
          if (patch.kind === "copy") {
            const selected = valueAtPath(state.valueInspector.value, patch.path);
            const text = formatInspectableValue(selected);
            if (!globalThis.navigator?.clipboard?.writeText) {
              throw new Error("Clipboard access is unavailable in this browser context");
            }
            await globalThis.navigator.clipboard.writeText(text);
            state.valueInspector.metadata = {
              ...state.valueInspector.metadata,
              copied: true,
            };
            updateHodosValueInspector(state);
          }
        }

        function reportWorkspaceEventError(error) {
          appendRepl("error", `Workspace event rejected: ${error.message}`);
          updateReplOnly();
        }

        function handleHodosWorkspaceEvent(event) {
          try {
            const editorPatch = editorWorkspacePatch(event.detail, state.content);
            if (editorPatch) {
              applyEditorWorkspacePatch(editorPatch);
              return;
            }
            const replPatch = replWorkspacePatch(event.detail);
            if (replPatch) {
              void applyReplWorkspacePatch(replPatch).catch(reportWorkspaceEventError);
              return;
            }
            const valuePatch = valueInspectorWorkspacePatch(event.detail);
            if (valuePatch) {
              void applyValueInspectorWorkspacePatch(valuePatch).catch(reportWorkspaceEventError);
            }
          } catch (error) {
            reportWorkspaceEventError(error);
          }
        }

        ''',
        "authoritative value event routing",
    )
    write(path, source)


def write_projector() -> None:
    write("src/hodos/value-projector.js", r'''
    const DEFAULT_MAX_DEPTH = 8;
    const DEFAULT_MAX_ENTRIES = 200;

    export function inspectableType(value) {
      if (value === null) return "null";
      if (Array.isArray(value)) return "array";
      if (value instanceof Date) return "date";
      if (value instanceof Map) return "map";
      if (value instanceof Set) return "set";
      return typeof value;
    }

    export function projectInspectableValue(
      value,
      { maxDepth = DEFAULT_MAX_DEPTH, maxEntries = DEFAULT_MAX_ENTRIES } = {},
      depth = 0,
      ancestors = new WeakSet(),
    ) {
      if (value === null || typeof value === "string" || typeof value === "boolean") return value;
      if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
      if (typeof value === "bigint") return `${value}n`;
      if (typeof value === "undefined") return "<undefined>";
      if (typeof value === "symbol" || typeof value === "function") return String(value);
      if (depth >= maxDepth) return "[Maximum inspection depth]";
      if (ancestors.has(value)) return "[Circular]";

      ancestors.add(value);
      try {
        if (value instanceof Date) return value.toISOString();
        if (value instanceof Map) {
          return projectInspectableValue(
            Object.fromEntries([...value.entries()].map(([key, entry]) => [String(key), entry])),
            { maxDepth, maxEntries },
            depth + 1,
            ancestors,
          );
        }
        if (value instanceof Set) {
          return projectInspectableValue(
            [...value.values()],
            { maxDepth, maxEntries },
            depth + 1,
            ancestors,
          );
        }
        if (Array.isArray(value)) {
          const selected = value.slice(0, maxEntries).map((entry) =>
            projectInspectableValue(entry, { maxDepth, maxEntries }, depth + 1, ancestors));
          if (value.length > maxEntries) selected.push(`[${value.length - maxEntries} more values]`);
          return selected;
        }

        const output = {};
        const entries = Object.entries(value).slice(0, maxEntries);
        for (const [key, entry] of entries) {
          output[key] = projectInspectableValue(
            entry,
            { maxDepth, maxEntries },
            depth + 1,
            ancestors,
          );
        }
        const total = Object.keys(value).length;
        if (total > maxEntries) output["…"] = `[${total - maxEntries} more entries]`;
        return output;
      } finally {
        ancestors.delete(value);
      }
    }

    export function valueAtPath(value, path = []) {
      let current = value;
      for (const segment of path) {
        if (current == null || typeof current !== "object") return undefined;
        current = current[segment];
      }
      return current;
    }

    export function formatInspectableValue(value) {
      if (typeof value === "string") return value;
      if (value === undefined) return "<undefined>";
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    ''')


def write_value_events() -> None:
    write("src/hodos/value-inspector-events.js", r'''
    export const HODOS_VALUE_INSPECTOR_COMPONENT_ID = "hodos.dev/value-inspector";
    export const HODOS_VALUE_INSPECTOR_AREA_ID = "value/main";

    function eventType(value) {
      return value?.["event/type"] ?? value?.type ?? null;
    }

    function pathValue(value = []) {
      if (!Array.isArray(value)) throw new TypeError("Hodos Value Inspector path must be an array");
      return Object.freeze(value.map((segment, index) => {
        if (typeof segment === "string") return segment;
        if (Number.isSafeInteger(segment) && segment >= 0) return segment;
        throw new TypeError(`Hodos Value Inspector path segment ${index} is invalid`);
      }));
    }

    export function valueInspectorWorkspacePatch(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      if (value["component/id"] !== HODOS_VALUE_INSPECTOR_COMPONENT_ID) return null;
      if (value["area/id"] !== HODOS_VALUE_INSPECTOR_AREA_ID) return null;

      const type = eventType(value);
      if (type === "value/select") return Object.freeze({ kind: "select", path: pathValue(value.path) });
      if (type === "value/toggle") return Object.freeze({ kind: "toggle", path: pathValue(value.path) });
      if (type === "value/copy") return Object.freeze({ kind: "copy", path: pathValue(value.path) });
      if (type === "value/refresh") return Object.freeze({ kind: "refresh" });
      if (type === "value/close") return Object.freeze({ kind: "close" });
      return null;
    }
    ''')


def write_value_inspector() -> None:
    write("src/hodos/value-inspector.js", r'''
    import { createHodosComponentRegistry } from "@greenways/hodos-web";
    import { createWorkspaceAreaHost } from "@greenways/hodos-workspace-ui";
    import { createValueInspectorArea } from "@greenways/hodos-dev";
    import { registerHodosValueInspectorUi } from "@greenways/hodos-dev-ui";
    import { formatInspectableValue } from "./value-projector.js";

    const registry = createHodosComponentRegistry();
    registerHodosValueInspectorUi(registry, {
      createValueInspectorHost: createPlaygroundValueInspectorHost,
    });

    let areaHost = null;

    function send(dispatch, event) {
      void Promise.resolve(dispatch(event)).catch((error) => {
        console.error("[hara playground hodos value inspector]", error);
      });
    }

    function expandable(value) {
      return value != null && typeof value === "object" && Object.keys(value).length > 0;
    }

    function summary(value) {
      if (Array.isArray(value)) return `Array(${value.length})`;
      if (value != null && typeof value === "object") return `{${Object.keys(value).length}}`;
      return formatInspectableValue(value);
    }

    function treeNode(document, value, label, path, expanded, dispatch, signal) {
      const node = document.createElement("div");
      node.className = "value-tree-node";
      const row = document.createElement("div");
      row.className = "value-tree-row";

      const canExpand = expandable(value);
      const key = JSON.stringify(path);
      const isExpanded = expanded.has(key);
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "value-tree-toggle";
      toggle.textContent = canExpand ? (isExpanded ? "▾" : "▸") : "·";
      toggle.disabled = !canExpand;
      toggle.setAttribute("aria-expanded", String(canExpand && isExpanded));
      if (canExpand) {
        toggle.addEventListener("click", () => send(dispatch, {
          "event/type": "value/toggle",
          path,
        }), { signal });
      }

      const select = document.createElement("button");
      select.type = "button";
      select.className = "value-tree-select";
      const name = document.createElement("span");
      name.className = "value-tree-key";
      name.textContent = label;
      const preview = document.createElement("code");
      preview.className = "value-tree-preview";
      preview.textContent = summary(value);
      select.append(name, preview);
      select.addEventListener("click", () => send(dispatch, {
        "event/type": "value/select",
        path,
      }), { signal });
      row.append(toggle, select);
      node.append(row);

      if (canExpand && isExpanded) {
        const children = document.createElement("div");
        children.className = "value-tree-children";
        const entries = Array.isArray(value)
          ? value.map((entry, index) => [index, entry])
          : Object.entries(value);
        for (const [childLabel, child] of entries) {
          children.append(treeNode(
            document,
            child,
            String(childLabel),
            [...path, childLabel],
            expanded,
            dispatch,
            signal,
          ));
        }
        node.append(children);
      }
      return node;
    }

    export function createPlaygroundValueInspectorHost({ container, dispatch }) {
      if (!container) throw new Error("Hodos Value Inspector requires a container");
      const document = container.ownerDocument || globalThis.document;
      const abort = new AbortController();
      const signal = abort.signal;
      let model = null;

      const shell = document.createElement("div");
      shell.className = "value-inspector-shell";
      const toolbar = document.createElement("header");
      toolbar.className = "value-inspector-toolbar";
      const identity = document.createElement("div");
      identity.className = "value-inspector-identity";
      const type = document.createElement("strong");
      const id = document.createElement("code");
      identity.append(type, id);
      const actions = document.createElement("div");
      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "text-button";
      refresh.textContent = "Refresh";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "text-button";
      copy.textContent = "Copy";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "text-button";
      close.textContent = "Close";
      actions.append(refresh, copy, close);
      toolbar.append(identity, actions);

      const display = document.createElement("pre");
      display.className = "value-inspector-display";
      const body = document.createElement("div");
      body.className = "value-inspector-body";
      shell.append(toolbar, display, body);
      container.replaceChildren(shell);

      refresh.addEventListener("click", () => send(dispatch, {
        "event/type": "value/refresh",
      }), { signal });
      close.addEventListener("click", () => send(dispatch, {
        "event/type": "value/close",
      }), { signal });
      copy.addEventListener("click", () => send(dispatch, {
        "event/type": "value/copy",
        path: model?.path || [],
      }), { signal });

      return {
        update(nextModel) {
          model = nextModel && typeof nextModel === "object" ? nextModel : {};
          const value = model.value || {};
          type.textContent = value.type || "value";
          id.textContent = value.id || "no retained value";
          display.textContent = value.display || "";
          container.dataset.valueStatus = model.status || "idle";
          container.dataset.valueId = value.id || "";
          body.replaceChildren();

          if (model.status === "loading") {
            const loading = document.createElement("div");
            loading.className = "value-inspector-state";
            loading.textContent = "Inspecting retained kernel value…";
            body.append(loading);
            return;
          }
          if (model.status === "error") {
            const error = document.createElement("div");
            error.className = "value-inspector-state error";
            error.textContent = model.error || "Unable to inspect the retained value";
            body.append(error);
            return;
          }
          if (model.status !== "ready") {
            const idle = document.createElement("div");
            idle.className = "value-inspector-state";
            idle.textContent = "Choose Inspect beside a retained REPL result.";
            body.append(idle);
            return;
          }

          const expanded = new Set((model.expanded || []).map((path) => JSON.stringify(path)));
          body.append(treeNode(
            document,
            value.data,
            "value",
            [],
            expanded,
            dispatch,
            signal,
          ));
        },
        dispose() {
          abort.abort();
          delete container.dataset.valueStatus;
          delete container.dataset.valueId;
        },
      };
    }

    export function valueInspectorAreaFromPlayground(state) {
      const inspector = state.valueInspector || {};
      return createValueInspectorArea({
        id: "value/main",
        valueId: inspector.valueId || null,
        requestId: inspector.requestId || null,
        status: inspector.status || "idle",
        display: inspector.display || "",
        value: inspector.value ?? null,
        valueType: inspector.valueType || null,
        namespace: inspector.namespace || null,
        source: inspector.source || null,
        path: inspector.path || [],
        expanded: inspector.expanded || [[]],
        metadata: inspector.metadata || {},
        error: inspector.error || null,
      });
    }

    export function disposeHodosValueInspector() {
      areaHost?.destroy();
      areaHost = null;
    }

    export function mountHodosValueInspector(state) {
      disposeHodosValueInspector();
      const root = globalThis.document?.querySelector(".value-view");
      if (!root) return false;
      areaHost = createWorkspaceAreaHost({
        root,
        registry,
        dispatch(event) {
          globalThis.document?.dispatchEvent(new CustomEvent("hodos:workspace-event", {
            detail: event,
          }));
        },
      });
      areaHost.open(valueInspectorAreaFromPlayground(state));
      return true;
    }

    export function updateHodosValueInspector(state) {
      if (!areaHost) return false;
      areaHost.update(valueInspectorAreaFromPlayground(state));
      return true;
    }
    ''')


def update_styles() -> None:
    path = "src/styles.css"
    source = read(path)
    source = replace_once(
        source,
        '@import url("./styles/hodos-preview.css");\n',
        '@import url("./styles/hodos-preview.css");\n@import url("./styles/hodos-value-inspector.css");\n',
        "value inspector styles",
    )
    write(path, source)
    write("src/styles/hodos-value-inspector.css", r'''
    .value-view {
      min-height: 0;
      display: none;
    }
    .value-view.active { display: grid; }
    .value-inspector-placeholder,
    .value-inspector-state {
      min-height: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      color: var(--hara-faint);
      font-family: var(--hara-font-mono);
      font-size: .62rem;
      text-align: center;
    }
    .value-inspector-shell {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: 42px auto minmax(0, 1fr);
      background: var(--hara-repl-ground);
    }
    .value-inspector-toolbar {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 0 10px 0 12px;
      border-bottom: 1px solid var(--hara-line);
      background: var(--hara-surface-solid);
    }
    .value-inspector-toolbar > div:last-child { display: flex; gap: 5px; }
    .value-inspector-identity {
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .value-inspector-identity strong {
      color: var(--hara-text);
      font-size: .66rem;
      text-transform: capitalize;
    }
    .value-inspector-identity code {
      overflow: hidden;
      color: var(--hara-faint);
      font-size: .52rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .value-inspector-display {
      max-height: 118px;
      margin: 0;
      padding: 10px 12px;
      overflow: auto;
      border-bottom: 1px solid var(--hara-line);
      color: var(--hara-spectrum-cyan);
      font-family: var(--hara-font-mono);
      font-size: .62rem;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .value-inspector-body {
      min-height: 0;
      padding: 10px 8px 20px;
      overflow: auto;
      font-family: var(--hara-font-mono);
    }
    .value-inspector-state.error { color: var(--hara-danger); }
    .value-tree-node { min-width: 0; }
    .value-tree-row {
      min-width: 0;
      min-height: 27px;
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr);
      align-items: center;
    }
    .value-tree-toggle,
    .value-tree-select {
      border: 0;
      background: transparent;
      color: var(--hara-muted);
    }
    .value-tree-toggle {
      width: 22px;
      height: 24px;
      padding: 0;
      font-size: .66rem;
    }
    .value-tree-toggle:disabled { opacity: .35; }
    .value-tree-select {
      min-width: 0;
      min-height: 25px;
      display: grid;
      grid-template-columns: minmax(70px, .42fr) minmax(0, 1fr);
      align-items: center;
      gap: 9px;
      padding: 2px 7px;
      border-radius: 6px;
      text-align: left;
    }
    .value-tree-select:hover { background: var(--hara-surface-raised); color: var(--hara-text); }
    .value-tree-key {
      overflow: hidden;
      color: var(--hara-spectrum-violet);
      font-size: .59rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .value-tree-preview {
      overflow: hidden;
      color: var(--hara-text);
      font-size: .59rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .value-tree-children {
      margin-left: 10px;
      padding-left: 8px;
      border-left: 1px solid var(--hara-line);
    }
    .repl-line.has-value { grid-template-columns: max-content minmax(0, 1fr) auto; }
    .value-inspect-button {
      align-self: start;
      margin-top: 1px;
      padding: 2px 6px;
      border: 1px solid color-mix(in srgb, var(--hara-spectrum-cyan) 24%, var(--hara-line));
      border-radius: 6px;
      background: transparent;
      color: var(--hara-spectrum-cyan);
      font-family: var(--hara-font-mono);
      font-size: .5rem;
    }
    .value-inspect-button:hover {
      background: color-mix(in srgb, var(--hara-spectrum-cyan) 9%, transparent);
    }
    .output-tab:disabled { opacity: .42; cursor: default; }
    ''')


def write_tests() -> None:
    write("tests/hodos-value-inspector-events.test.js", r'''
    import assert from "node:assert/strict";
    import test from "node:test";
    import {
      HODOS_VALUE_INSPECTOR_AREA_ID,
      HODOS_VALUE_INSPECTOR_COMPONENT_ID,
      valueInspectorWorkspacePatch,
    } from "../src/hodos/value-inspector-events.js";

    const base = {
      "component/id": HODOS_VALUE_INSPECTOR_COMPONENT_ID,
      "area/id": HODOS_VALUE_INSPECTOR_AREA_ID,
    };

    test("Value Inspector projects select, toggle and copy paths", () => {
      assert.deepEqual(valueInspectorWorkspacePatch({
        ...base,
        "event/type": "value/select",
        path: ["answer", 0],
      }), { kind: "select", path: ["answer", 0] });
      assert.deepEqual(valueInspectorWorkspacePatch({
        ...base,
        "event/type": "value/toggle",
        path: ["nested"],
      }), { kind: "toggle", path: ["nested"] });
      assert.deepEqual(valueInspectorWorkspacePatch({
        ...base,
        "event/type": "value/copy",
        path: [],
      }), { kind: "copy", path: [] });
    });

    test("Value Inspector projects refresh and close commands", () => {
      assert.deepEqual(valueInspectorWorkspacePatch({ ...base, "event/type": "value/refresh" }), { kind: "refresh" });
      assert.deepEqual(valueInspectorWorkspacePatch({ ...base, "event/type": "value/close" }), { kind: "close" });
    });

    test("Value Inspector ignores unrelated events and rejects malformed paths", () => {
      assert.equal(valueInspectorWorkspacePatch({ ...base, "component/id": "hodos.dev/repl", "event/type": "value/close" }), null);
      assert.equal(valueInspectorWorkspacePatch({ ...base, "area/id": "value/other", "event/type": "value/close" }), null);
      assert.equal(valueInspectorWorkspacePatch({ ...base, "event/type": "value/unknown" }), null);
      assert.throws(() => valueInspectorWorkspacePatch({
        ...base,
        "event/type": "value/select",
        path: [1.5],
      }), /segment 0 is invalid/);
    });
    ''')

    write("tests/hodos-value-projector.test.js", r'''
    import assert from "node:assert/strict";
    import test from "node:test";
    import {
      formatInspectableValue,
      inspectableType,
      projectInspectableValue,
      valueAtPath,
    } from "../src/hodos/value-projector.js";

    test("runtime values project to bounded serializable data", () => {
      const value = { answer: 42, nested: [true, null], large: 4n };
      assert.deepEqual(projectInspectableValue(value), {
        answer: 42,
        nested: [true, null],
        large: "4n",
      });
      assert.equal(inspectableType(value), "object");
      assert.equal(inspectableType([1, 2]), "array");
    });

    test("projection handles cycles, depth and path lookup", () => {
      const value = { nested: { answer: 42 } };
      value.self = value;
      const projected = projectInspectableValue(value, { maxDepth: 3 });
      assert.equal(projected.self, "[Circular]");
      assert.equal(valueAtPath(projected, ["nested", "answer"]), 42);
      assert.equal(formatInspectableValue(projected.nested), '{\n  "answer": 42\n}');
    });
    ''')

    write("tests/hodos-value-inspector-authority.test.js", r'''
    import assert from "node:assert/strict";
    import { readFile } from "node:fs/promises";
    import test from "node:test";

    const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

    test("Playground mounts the merged Hodos Value Inspector component", async () => {
      const [integration, main, view] = await Promise.all([
        text("src/hodos/value-inspector.js"),
        text("src/main.js"),
        text("src/app/view.js"),
      ]);
      assert.match(integration, /createValueInspectorArea/);
      assert.match(integration, /registerHodosValueInspectorUi/);
      assert.match(integration, /createWorkspaceAreaHost/);
      assert.match(main, /mountHodosValueInspector\(state\)/);
      assert.match(main, /disposeHodosValueInspector\(\)/);
      assert.match(view, /data-output-tab="value"/);
      assert.match(view, /class="value-view/);
    });

    test("retained REPL values enter the inspector through semantic events", async () => {
      const [repl, replEvents, events, actions] = await Promise.all([
        text("src/hodos/repl.js"),
        text("src/hodos/repl-events.js"),
        text("src/app/events.js"),
        text("src/app/actions.js"),
      ]);
      assert.match(repl, /"event\/type": "repl\/inspect"/);
      assert.match(repl, /valueId: entry\.valueId/);
      assert.match(replEvents, /kind: "inspect"/);
      assert.match(events, /runtime\.inspect\(valueId\)/);
      assert.match(events, /projectInspectableValue\(inspected\.value\)/);
      assert.match(actions, /valueId: result\.valueId/);
    });

    test("Value Inspector interactions remain application policy", async () => {
      const [events, integration] = await Promise.all([
        text("src/app/events.js"),
        text("src/hodos/value-inspector.js"),
      ]);
      assert.match(events, /valueInspectorWorkspacePatch\(event\.detail\)/);
      assert.match(events, /navigator\?\.clipboard\?\.writeText/);
      assert.match(integration, /"event\/type": "value\/toggle"/);
      assert.match(integration, /"event\/type": "value\/copy"/);
      assert.match(integration, /abort\.abort\(\)/);
    });
    ''')

    path = "tests/hodos-repl-events.test.js"
    source = read(path)
    anchor = 'test("unrelated REPL components, areas and events are ignored", () => {'
    addition = dedent('''
    test("Hodos REPL projects retained-value inspection", () => {
      assert.deepEqual(replWorkspacePatch({
        ...base,
        "event/type": "repl/inspect",
        valueId: "value-1",
      }), {
        kind: "inspect",
        valueId: "value-1",
      });
      assert.throws(() => replWorkspacePatch({
        ...base,
        "event/type": "repl/inspect",
        valueId: "",
      }), /non-empty string/);
    });

    ''')
    source = replace_once(source, anchor, addition + anchor, "REPL inspect test")
    write(path, source)


def clean_staging_files() -> None:
    for relative in (
        ".github/scripts/apply-hodos-value-inspector.py",
        ".github/workflows/apply-hodos-value-inspector-v2.yml",
    ):
        target = ROOT / relative
        if target.exists():
            target.unlink()


def main() -> None:
    update_context()
    update_actions()
    write_repl()
    write_repl_events()
    update_view()
    update_main()
    update_events()
    write_projector()
    write_value_events()
    write_value_inspector()
    update_styles()
    write_tests()
    clean_staging_files()


if __name__ == "__main__":
    main()
