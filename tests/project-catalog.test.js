import test from "node:test";
import assert from "node:assert/strict";
import { FEATURED_PROJECTS, PLAYGROUND_NICETIES, projectDeepLink, repositoryLabel } from "../src/studio/projects.js";

test("featured projects declare one explicit launch boundary", () => {
  const ids = new Set(FEATURED_PROJECTS.map((project) => project.id));
  assert.equal(ids.size, FEATURED_PROJECTS.length);
  assert.ok(FEATURED_PROJECTS.every((project) => Boolean(project.repository) !== Boolean(project.href)));
});

test("repository-backed projects point at complete GitHub subprojects", () => {
  const projects = FEATURED_PROJECTS.filter((project) => project.repository);
  assert.ok(projects.length > 0);
  assert.ok(projects.every((project) => project.repository.owner === "hara-lang"));
  assert.ok(projects.every((project) => project.repository.repo === "hara-playground"));
  assert.ok(projects.every((project) => project.repository.path.startsWith("samples/")));
  const liveValues = projects.find((project) => project.id === "live-values");
  assert.equal(repositoryLabel(liveValues.repository), "hara-lang/hara-playground/samples/live-values");
});

test("Conveyor Twin is the primary applied active-runtime project", () => {
  const project = FEATURED_PROJECTS.find((candidate) => candidate.id === "active-conveyor-twin");
  assert.ok(project);
  assert.equal(project.repository.path, "samples/active-conveyor-twin");
  assert.ok(project.capabilities.includes("Observation continuity"));
  assert.equal(project.field, "simulation");
  assert.deepEqual(
    FEATURED_PROJECTS.filter((candidate) => candidate.primary).map((candidate) => candidate.id),
    ["active-conveyor-twin"],
  );
});

test("Living Tank remains the compact control-loop proof", () => {
  const project = FEATURED_PROJECTS.find((candidate) => candidate.id === "active-loop-tank");
  assert.ok(project);
  assert.equal(project.repository.path, "samples/active-loop-tank");
  assert.ok(project.capabilities.includes("Resident compiler"));
  assert.equal(project.primary, undefined);
});

test("Peacock Ballroom is a provider-backed world project", () => {
  const project = FEATURED_PROJECTS.find((candidate) => candidate.id === "peacock-ballroom");
  assert.ok(project);
  assert.equal(project.repository, undefined);
  assert.equal(project.entry, undefined);
  assert.equal(project.field, "worlds");
  const link = new URL(projectDeepLink(project, "/"), "https://playground.hara-lang.org/");
  assert.equal(link.pathname, "/provider.html");
  assert.equal(link.searchParams.get("provider"), "alumbra/world");
});

test("Supersonic is a featured audio project", () => {
  const project = FEATURED_PROJECTS.find((candidate) => candidate.id === "supersonic");
  assert.ok(project);
  assert.equal(project.repository.path, "samples/supersonic-live");
  assert.ok(project.capabilities.includes("Supersonic"));
});

test("Greenways AI is a featured capability-declared project", () => {
  const project = FEATURED_PROJECTS.find((candidate) => candidate.id === "greenways-ai");
  assert.ok(project);
  assert.equal(project.repository.path, "samples/greenways-ai");
  assert.ok(project.capabilities.includes("model/generate"));
});

test("Hodos Graph is a featured manifest-native project", () => {
  const project = FEATURED_PROJECTS.find((candidate) => candidate.id === "hodos-graph");
  assert.ok(project);
  assert.equal(project.repository.path, "samples/hodos-graph");
  assert.ok(project.capabilities.includes("Typed ports"));
});

test("project links carry branch and project path", () => {
  const project = FEATURED_PROJECTS.find((candidate) => candidate.id === "interface");
  const link = projectDeepLink(project, "/");
  assert.match(link, /^\/\?/);
  assert.match(link, /repo=hara-lang%2Fhara-playground/);
  assert.match(link, /branch=main/);
  assert.match(link, /path=samples%2Finterface-composition/);
});

test("the editor nicety catalog covers structural editing and kernel feedback", () => {
  const ids = new Set(PLAYGROUND_NICETIES.map((feature) => feature.id));
  assert.deepEqual([...ids].sort(), ["completion", "instarepl", "paredit", "rainbow"]);
});
