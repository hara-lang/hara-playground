const TEXT_EXTENSIONS = new Set([
  "", "hal", "hara", "clj", "cljs", "cljc", "edn", "md", "txt", "json", "js", "mjs", "cjs", "ts", "tsx", "jsx",
  "css", "scss", "html", "svg", "xml", "yml", "yaml", "toml", "properties", "sh", "bash", "rs", "java"
]);

function normalizeSubpath(path) {
  const normalized = String(path || "").replace(/^\/+|\/+$/g, "").replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (normalized.split("/").some((part) => part === "..")) throw new Error("GitHub project paths cannot contain '..'");
  return normalized;
}

export function parseGitHubRepository(input) {
  if (input && typeof input === "object") {
    const owner = String(input.owner || "").trim();
    const repo = String(input.repo || input.repository || "").trim().replace(/\.git$/, "");
    if (!owner || !repo) throw new Error("A GitHub owner and repository are required");
    const result = { owner, repo, branch: input.branch || input.ref || null };
    const path = normalizeSubpath(input.path);
    if (path) result.path = path;
    return result;
  }

  const value = String(input).trim();
  const shorthand = value.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (shorthand) return { owner: shorthand[1], repo: shorthand[2], branch: null };

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a GitHub URL or owner/repository name");
  }
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    throw new Error("Only github.com repositories are supported in this importer");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("The GitHub URL must include an owner and repository");
  const result = { owner: parts[0], repo: parts[1].replace(/\.git$/, ""), branch: null };
  if (parts[2] === "tree" && parts[3]) result.branch = decodeURIComponent(parts.slice(3).join("/"));
  const explicitBranch = url.searchParams.get("branch") || url.searchParams.get("ref");
  if (explicitBranch) result.branch = explicitBranch;
  const path = normalizeSubpath(url.searchParams.get("path"));
  if (path) result.path = path;
  return result;
}

export function repositoryFromStudioLocation(location) {
  if (!location) return null;
  const search = new URLSearchParams(location.search || "");
  const queryRepository = search.get("repo");
  if (queryRepository) {
    const branch = search.get("branch");
    const path = normalizeSubpath(search.get("path"));
    if (path) {
      const [owner, repo] = queryRepository.replace(/^\/+|\/+$/g, "").split("/");
      return { owner, repo, branch: branch || null, path };
    }
    return branch
      ? `https://github.com/${queryRepository.replace(/^\/+|\/+$/g, "")}/tree/${branch}`
      : queryRepository;
  }

  const hash = String(location.hash || "").replace(/^#\/?/, "");
  const hashMatch = hash.match(/^github\/([^/]+)\/([^/]+)(?:\/tree\/(.+))?$/);
  if (hashMatch) {
    return hashMatch[3]
      ? `https://github.com/${hashMatch[1]}/${hashMatch[2]}/tree/${hashMatch[3]}`
      : `${hashMatch[1]}/${hashMatch[2]}`;
  }

  const parts = String(location.pathname || "").split("/").filter(Boolean);
  const github = parts.lastIndexOf("github");
  if (github >= 0 && parts[github + 1] && parts[github + 2]) {
    const owner = parts[github + 1];
    const repository = parts[github + 2];
    const tree = parts[github + 3] === "tree" ? parts.slice(github + 4).join("/") : null;
    return tree ? `https://github.com/${owner}/${repository}/tree/${tree}` : `${owner}/${repository}`;
  }
  return null;
}

function extension(path) {
  const filename = path.split("/").pop() || "";
  const index = filename.lastIndexOf(".");
  return index < 0 ? "" : filename.slice(index + 1).toLowerCase();
}

function shouldImport(entry, maxFileSize) {
  return entry.type === "blob" && entry.size <= maxFileSize && TEXT_EXTENSIONS.has(extension(entry.path));
}

function headers(raw = false) {
  return {
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

export function rawContentUrl(owner, repository, commit, path) {
  const encodedPath = String(path).split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${encodeURIComponent(commit)}/${encodedPath}`;
}

async function requestText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GitHub file request failed (${response.status})`);
  return response.text();
}

async function request(url, raw = false) {
  const response = await fetch(url, { headers: headers(raw) });
  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const detail = response.status === 403 && remaining === "0" ? " GitHub's anonymous API rate limit has been reached." : "";
    throw new Error(`GitHub request failed (${response.status}).${detail}`);
  }
  return raw ? response.text() : response.json();
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return output;
}

export async function importGitHubRepository(input, {
  maxFiles = 250,
  maxFileSize = 512_000,
  concurrency = 6,
  onProgress = () => {}
} = {}) {
  const parsed = parseGitHubRepository(input);
  const api = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  onProgress({ phase: "metadata", completed: 0, total: 1 });
  const repository = await request(api);
  const branch = parsed.branch || repository.default_branch;
  const branchData = await request(`${api}/branches/${encodeURIComponent(branch)}`);
  const commit = branchData.commit.sha;
  const tree = await request(`${api}/git/trees/${encodeURIComponent(commit)}?recursive=1`);
  if (tree.truncated) throw new Error("This repository is too large for the browser importer. A server-side archive importer is required.");

  const prefix = parsed.path ? `${parsed.path}/` : "";
  const scoped = tree.tree.filter((entry) => shouldImport(entry, maxFileSize) && (!prefix || entry.path.startsWith(prefix)));
  const entries = scoped.slice(0, maxFiles);
  if (!entries.length) {
    throw new Error(parsed.path
      ? `No supported project files were found under ${parsed.path}`
      : "No supported project files were found in this repository");
  }
  onProgress({ phase: "files", completed: 0, total: entries.length });
  let completed = 0;
  const files = await mapLimit(entries, concurrency, async (entry) => {
    const projectPath = prefix ? entry.path.slice(prefix.length) : entry.path;
    const contentUrl = rawContentUrl(parsed.owner, parsed.repo, commit, entry.path);
    const content = await requestText(contentUrl);
    completed += 1;
    onProgress({ phase: "files", completed, total: entries.length, path: projectPath });
    return { path: projectPath, content };
  });

  const workspaceSuffix = parsed.path ? `/${parsed.path}` : "";
  return {
    workspace: `github.com/${parsed.owner}/${parsed.repo}/${branch}${workspaceSuffix}`,
    files,
    metadata: {
      source: "github",
      owner: parsed.owner,
      repository: parsed.repo,
      branch,
      path: parsed.path || null,
      commit,
      url: parsed.path ? `${repository.html_url}/tree/${encodeURIComponent(branch)}/${parsed.path}` : repository.html_url,
      importedAt: new Date().toISOString(),
      skipped: Math.max(0, scoped.length - entries.length)
    }
  };
}
