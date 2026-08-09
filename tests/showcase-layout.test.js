import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles/showcase.css", import.meta.url), "utf8");

test("Showcase output collapses the hidden tab row into one bounded content track", () => {
  assert.match(
    styles,
    /html\[data-presentation="showcase"\] \.output-panel\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    styles,
    /html\[data-presentation="showcase"\] \.preview-view\.active,[\s\S]*?\{[^}]*grid-row:\s*1/s,
  );
});

test("Showcase gives the nested Hodos preview frame a resolvable full height", () => {
  assert.match(
    styles,
    /html\[data-presentation="showcase"\] #preview\.hodos-preview-root > \.hara-web-preview\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0/s,
  );
  const sizing = styles.match(
    /html\[data-presentation="showcase"\] \.preview-view\.active,[\s\S]*?html\[data-presentation="showcase"\] #preview\s*\{([^}]*)\}/,
  );
  assert.ok(sizing, "missing Showcase preview sizing block");
  assert.match(sizing[1], /height:\s*100%/);
  assert.match(sizing[1], /min-height:\s*0/);
  assert.doesNotMatch(sizing[1], /min-height:\s*100%/);
});
