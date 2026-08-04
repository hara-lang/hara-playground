export const FEATURED_PROJECTS = Object.freeze([
  Object.freeze({
    id: "live-values",
    title: "Live values",
    eyebrow: "STARTER · LEARN",
    description: "Definitions, functions and immediate form-by-form evaluation in a small, complete Hara project.",
    repository: Object.freeze({
      owner: "hara-lang",
      repo: "hara-playground",
      branch: "main",
      path: "samples/live-values"
    }),
    sourceUrl: "https://github.com/hara-lang/hara-playground/tree/main/samples/live-values",
    entry: "src/main.hal",
    capabilities: Object.freeze(["InstaREPL", "Kernel values", "HTA preview"]),
    action: "Open Live values",
    primary: true,
    field: "evaluation"
  }),
  Object.freeze({
    id: "interface",
    title: "Interface composition",
    eyebrow: "HTA · COMPONENTS",
    description: "Build a small metric surface from ordinary Hara functions and send the resulting HTA value to the preview.",
    repository: Object.freeze({
      owner: "hara-lang",
      repo: "hara-playground",
      branch: "main",
      path: "samples/interface-composition"
    }),
    sourceUrl: "https://github.com/hara-lang/hara-playground/tree/main/samples/interface-composition",
    entry: "src/main.hal",
    capabilities: Object.freeze(["Components", "HTA values", "Live preview"]),
    action: "Open Interface",
    field: "flow"
  }),
  Object.freeze({
    id: "decision",
    title: "Decision model",
    eyebrow: "DATA · INSPECTION",
    description: "Trace a small scoring model, edit its signals, and inspect the derived decision through the persistent kernel.",
    repository: Object.freeze({
      owner: "hara-lang",
      repo: "hara-playground",
      branch: "main",
      path: "samples/decision-model"
    }),
    sourceUrl: "https://github.com/hara-lang/hara-playground/tree/main/samples/decision-model",
    entry: "src/main.hal",
    capabilities: Object.freeze(["Immutable data", "Branch tracing", "Kernel checks"]),
    action: "Open Decision model",
    field: "syntax"
  })
]);

export const PLAYGROUND_NICETIES = Object.freeze([
  Object.freeze({ id: "rainbow", title: "Rainbow parens", description: "Depth-coloured delimiters with live matching and malformed-form signals." }),
  Object.freeze({ id: "paredit", title: "Paredit", description: "Balanced insertion, paired deletion, structural selection, wrapping, slurp and barf." }),
  Object.freeze({ id: "completion", title: "Kernel completion", description: "Symbols, vars and built-ins are requested through the persistent runtime worker." }),
  Object.freeze({ id: "instarepl", title: "InstaREPL", description: "The current selection or enclosing form evaluates after a short pause." })
]);

export function featuredProject(id) {
  return FEATURED_PROJECTS.find((project) => project.id === id) || null;
}

export function repositoryLabel(repository) {
  if (!repository) return "";
  const root = `${repository.owner}/${repository.repo}`;
  return repository.path ? `${root}/${repository.path}` : root;
}

export function projectDeepLink(project, pathname = "./") {
  if (!project?.repository) return pathname;
  const query = new URLSearchParams({
    repo: `${project.repository.owner}/${project.repository.repo}`,
    branch: project.repository.branch || "main"
  });
  if (project.repository.path) query.set("path", project.repository.path);
  return `${pathname}?${query}`;
}
