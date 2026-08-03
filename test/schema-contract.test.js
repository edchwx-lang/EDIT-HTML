import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("V4 publishes machine-readable schemas for every canonical project model", async () => {
  const expected = {
    "project.schema.json": 4,
    "source-model.schema.json": 4,
    "coverage-map.schema.json": 4,
    "report-model.schema.json": 4,
    "presentation-plan.schema.json": 4,
    "huashu-input.schema.json": 1,
    "design-package.schema.json": 1,
    "theme.schema.json": 2,
    "publication.schema.json": 4
  };
  for (const [name, version] of Object.entries(expected)) {
    const schema = JSON.parse(await readFile(path.join(root, "schemas", name), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.properties.schemaVersion.const, version);
    assert.ok(schema.required.includes("schemaVersion"));
  }
});
