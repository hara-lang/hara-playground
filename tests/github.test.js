import test from "node:test";
import assert from "node:assert/strict";
import { parseGitHubRepository, rawContentUrl, repositoryFromStudioLocation } from "../src/github/importer.js";

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

test("rejects non-GitHub hosts", () => {
  assert.throws(() => parseGitHubRepository("https://example.com/a/b"), /Only github.com/);
});


test("reads repository deep links from query, hash and clean routes", () => {
  assert.equal(repositoryFromStudioLocation({ search: "?repo=hara-lang/hara&branch=main", hash: "", pathname: "/" }),
    "https://github.com/hara-lang/hara/tree/main");
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
