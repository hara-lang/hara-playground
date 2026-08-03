const DEFAULT_CATALOG_URL = new URL("../../examples/index.json", import.meta.url);

async function requestJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Example catalog request failed (${response.status})`);
  return response.json();
}

async function requestText(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Example file request failed (${response.status})`);
  return response.text();
}

export async function loadExampleCatalog(url = DEFAULT_CATALOG_URL) {
  const catalogUrl = new URL(url, import.meta.url);
  const catalog = await requestJson(catalogUrl);
  if (!Array.isArray(catalog.projects)) throw new Error("Example catalog does not contain a projects array");
  return catalog.projects.map((project) => ({ ...project, catalogUrl: catalogUrl.href }));
}

function projectRoot(project) {
  const descriptor = String(project.project || "");
  return descriptor.slice(0, descriptor.lastIndexOf("/"));
}

function workspacePath(project, path) {
  const root = projectRoot(project);
  if (root && path.startsWith(`${root}/`)) return path.slice(root.length + 1);
  return path.split("/").pop();
}

export async function loadExampleProject(project, { onProgress = () => {} } = {}) {
  if (!project || !Array.isArray(project.files)) throw new Error("Invalid example project descriptor");
  const catalogUrl = new URL(project.catalogUrl || DEFAULT_CATALOG_URL, import.meta.url);
  const siteRoot = new URL("../", catalogUrl);
  let completed = 0;
  const files = [];
  for (const path of project.files) {
    const content = await requestText(new URL(path, siteRoot));
    completed += 1;
    onProgress({ completed, total: project.files.length, path });
    files.push({ path: workspacePath(project, path), content });
  }
  return {
    workspace: `examples/${project.id}`,
    files,
    metadata: {
      source: "example",
      example: project.id,
      title: project.title,
      category: project.category,
      capabilities: project.capabilities || [],
      branch: null,
      commit: null
    }
  };
}
