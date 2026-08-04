import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes a dedicated maximum-resolution Playground social card", async () => {
  const source = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(source, /og-hara-playground\.jpg/);
  assert.match(source, /og:image:width" content="3840"/);
  assert.match(source, /og:image:height" content="2016"/);
  assert.match(source, /Code, see, change, repeat/);
});
