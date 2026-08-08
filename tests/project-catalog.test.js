import test from "node:test";
import assert from "node:assert/strict";
import { FEATURED_PROJECTS, PLAYGROUND_NICETIES, projectDeepLink, repositoryLabel } from "../src/studio/projects.js";

test("featured projects point at complete GitHub subprojects", () => {
  assert.equal(FEATURED_PROJECTS.length, 6);
  assert.ok(FEATURED_PROJECTS.every((project) => project.repository.owner === "hara-lang"));
  assert.ok(FEATURED_PROJECTS.every((project) => project.repository.repo === "hara-playground"));
  assert.ok(FEATURED_PROJECTS.every((project) => project.repository.path.startsWith("samples/")));
  const liveValues = FEATURED_PROJECTS.find((project) => project.id === "live-values");
  assert.equal(repositoryLabel(liveValues.repository), "hara-lang/hara-playground/samples/live-values");
});

test("Supersonic is a featured audio project", () => {
  const project = FEATURED_PROJECTS.find((candidate) => candidate.id === "supersonic");
  assert.ok(project);
  assert.equal(project.repository.path, "samples/supersonic-live");
  assert.ok(project.capabilities.includes("Supersonic"));
  assert.equal(project.primary, true);
});

test("Hodos Graph is a featured manifest-native project", () => {
  const project = FEATURED_PROJECTS.find((candidate) => candidate.id === "hodos-graph");
  assert.ok(project);
  assert.equal(project.repository.path, "samples/hodos-graph");
  assert.ok(project.capabilities.includes("Typed ports"));
});

test("project links carry branch and project path", () => {
  const link = projectDeepLink(FEATURED_PROJECTS[2], "/");
  assert.match(link, /^\/\?/);
  assert.match(link, /repo=hara-lang%2Fhara-playground/);
  assert.match(link, /branch=main/);
  assert.match(link, /path=samples%2Finterface-composition/);
});

test("the editor nicety catalog covers structural editing and kernel feedback", () => {
  const ids = new Set(PLAYGROUND_NICETIES.map((feature) => feature.id));
  assert.deepEqual([...ids].sort(), ["completion", "instarepl", "paredit", "rainbow"]);
});
