import test from "node:test";
import assert from "node:assert/strict";
import { FEATURED_PROJECTS, PLAYGROUND_NICETIES, projectDeepLink, repositoryLabel } from "../src/studio/projects.js";

test("featured projects point at complete GitHub subprojects", () => {
  assert.equal(FEATURED_PROJECTS.length, 3);
  assert.ok(FEATURED_PROJECTS.every((project) => project.repository.owner === "hara-lang"));
  assert.ok(FEATURED_PROJECTS.every((project) => project.repository.repo === "hara-playground"));
  assert.ok(FEATURED_PROJECTS.every((project) => project.repository.path.startsWith("samples/")));
  assert.equal(repositoryLabel(FEATURED_PROJECTS[0].repository), "hara-lang/hara-playground/samples/live-values");
});

test("project links carry branch and project path", () => {
  const link = projectDeepLink(FEATURED_PROJECTS[1], "/");
  assert.match(link, /^\/\?/);
  assert.match(link, /repo=hara-lang%2Fhara-playground/);
  assert.match(link, /branch=main/);
  assert.match(link, /path=samples%2Finterface-composition/);
});

test("the editor nicety catalog covers structural editing and kernel feedback", () => {
  const ids = new Set(PLAYGROUND_NICETIES.map((feature) => feature.id));
  assert.deepEqual([...ids].sort(), ["completion", "instarepl", "paredit", "rainbow"]);
});
