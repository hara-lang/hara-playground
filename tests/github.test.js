import test from "node:test";
import assert from "node:assert/strict";
import { importGitHubRepository, parseGitHubRepository, rawContentUrl, repositoryFromStudioLocation } from "../src/github/importer.js";

function mockResponse(body, { status = 200, json = true } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => json ? JSON.stringify(body) : String(body)
  };
}

test("parses repository shorthand", () => {
  assert.deepEqual(parseGitHubRepository("hara-lang/hara"), { owner: "hara-lang", repo: "hara", branch: null });
});

test("parses GitHub URLs and branch paths", () => {
  assert.deepEqual(parseGitHubRepository("https://github.com/hara-lang/hara/tree/feature/studio"), {
    owner: "hara-lang",
    repo: "hara",
    branch: "feature/studio"
  });
});

test("accepts a repository object with a project subpath", () => {
  assert.deepEqual(parseGitHubRepository({ owner: "hara-lang", repo: "hara", branch: "main", path: "/website/examples/starter/" }), {
    owner: "hara-lang",
    repo: "hara",
    branch: "main",
    path: "website/examples/starter"
  });
});

test("accepts and validates an immutable commit", () => {
  const commit = "a".repeat(40);
  assert.deepEqual(parseGitHubRepository({
    owner: "hara-lang",
    repo: "hara",
    branch: "main",
    commit,
    path: "examples/card",
  }), {
    owner: "hara-lang",
    repo: "hara",
    branch: "main",
    commit,
    path: "examples/card",
  });
  assert.throws(
    () => parseGitHubRepository({ owner: "hara-lang", repo: "hara", commit: "abc123" }),
    /40-character lowercase hexadecimal SHA/,
  );
  assert.throws(
    () => parseGitHubRepository({ owner: "hara-lang", repo: "hara", commit: "A".repeat(40) }),
    /40-character lowercase hexadecimal SHA/,
  );
});

test("rejects non-GitHub hosts and parent traversal", () => {
  assert.throws(() => parseGitHubRepository("https://example.com/a/b"), /Only github.com/);
  assert.throws(() => parseGitHubRepository({ owner: "a", repo: "b", path: "../secret" }), /cannot contain/);
});

test("reads repository deep links from query, hash and clean routes", () => {
  assert.equal(repositoryFromStudioLocation({ search: "?repo=hara-lang/hara&branch=main", hash: "", pathname: "/" }),
    "https://github.com/hara-lang/hara/tree/main");
  assert.deepEqual(repositoryFromStudioLocation({ search: "?repo=hara-lang/hara-playground&branch=main&path=samples/live-values", hash: "", pathname: "/" }), {
    owner: "hara-lang",
    repo: "hara-playground",
    branch: "main",
    path: "samples/live-values"
  });
  const commit = "b".repeat(40);
  assert.deepEqual(repositoryFromStudioLocation({
    search: `?repo=hara-lang/hara-playground&branch=main&commit=${commit}&path=samples/live-values`,
    hash: "",
    pathname: "/",
  }), {
    owner: "hara-lang",
    repo: "hara-playground",
    branch: "main",
    commit,
    path: "samples/live-values",
  });
  assert.equal(repositoryFromStudioLocation({ search: "", hash: "#github/hara-lang/hara", pathname: "/" }),
    "hara-lang/hara");
  assert.equal(repositoryFromStudioLocation({ search: "", hash: "", pathname: "/studio/github/hara-lang/hara/tree/feature/browser" }),
    "https://github.com/hara-lang/hara/tree/feature/browser");
});

test("builds immutable raw content URLs without consuming API requests", () => {
  assert.equal(
    rawContentUrl("hara-lang", "demo", "abc123", "src/app core/main.hal"),
    "https://raw.githubusercontent.com/hara-lang/demo/abc123/src/app%20core/main.hal"
  );
});

test("imports only a selected GitHub project directory and strips its prefix", async () => {
  const originalFetch = globalThis.fetch;
  const api = "https://api.github.com/repos/hara-lang/hara-playground";
  const project = "samples/live-values";
  const files = new Map([
    [`https://raw.githubusercontent.com/hara-lang/hara-playground/abc123/${project}/project.edn`, "{:hara/type :project}"],
    [`https://raw.githubusercontent.com/hara-lang/hara-playground/abc123/${project}/src/main.hal`, "(ns samples.live-values)\n42"]
  ]);
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value === api) return mockResponse({ default_branch: "main", html_url: "https://github.com/hara-lang/hara-playground" });
    if (value === `${api}/branches/main`) return mockResponse({ commit: { sha: "abc123" } });
    if (value === `${api}/git/trees/abc123?recursive=1`) return mockResponse({
      truncated: false,
      tree: [
        { type: "blob", path: `${project}/project.edn`, size: 80 },
        { type: "blob", path: `${project}/src/main.hal`, size: 50 },
        { type: "blob", path: "src/unrelated.hal", size: 20 }
      ]
    });
    if (files.has(value)) return mockResponse(files.get(value), { json: false });
    return mockResponse({}, { status: 404 });
  };

  try {
    const imported = await importGitHubRepository({ owner: "hara-lang", repo: "hara-playground", branch: "main", path: project });
    assert.deepEqual(imported.files, [
      { path: "project.edn", content: "{:hara/type :project}" },
      { path: "src/main.hal", content: "(ns samples.live-values)\n42" }
    ]);
    assert.equal(imported.metadata.path, project);
    assert.equal(imported.workspace, `github.com/hara-lang/hara-playground/main/${project}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("commit-pinned imports skip branch resolution and isolate the Workspace", async () => {
  const originalFetch = globalThis.fetch;
  const api = "https://api.github.com/repos/hara-lang/hara-playground";
  const commit = "c".repeat(40);
  const project = "samples/hodos-document";
  let branchRequests = 0;

  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value === api) {
      return mockResponse({
        default_branch: "main",
        html_url: "https://github.com/hara-lang/hara-playground",
      });
    }
    if (value.includes("/branches/")) {
      branchRequests += 1;
      return mockResponse({}, { status: 500 });
    }
    if (value === `${api}/git/trees/${commit}?recursive=1`) {
      return mockResponse({
        truncated: false,
        tree: [{ type: "blob", path: `${project}/src/main.hal`, size: 42 }],
      });
    }
    if (value === `https://raw.githubusercontent.com/hara-lang/hara-playground/${commit}/${project}/src/main.hal`) {
      return mockResponse("(ns showcase.main)\n42", { json: false });
    }
    return mockResponse({}, { status: 404 });
  };

  try {
    const imported = await importGitHubRepository({
      owner: "hara-lang",
      repo: "hara-playground",
      branch: "main",
      commit,
      path: project,
    });
    assert.equal(branchRequests, 0);
    assert.equal(imported.metadata.commit, commit);
    assert.equal(imported.metadata.branch, "main");
    assert.equal(imported.workspace, `github.com/hara-lang/hara-playground/${commit}/${project}`);
    assert.equal(imported.metadata.url, `https://github.com/hara-lang/hara-playground/tree/${commit}/${project}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
