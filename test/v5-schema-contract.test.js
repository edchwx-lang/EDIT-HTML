import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("V5 publishes source, interview, executable site, and content-binding schemas", async () => {
  const names = ["v5-source-pack", "v5-interview", "v5-site-manifest", "v5-content-bindings", "v5-design-process", "v5-selection-receipt"];
  for (const name of names) {
    const schema = JSON.parse(await readFile(path.join(root, "schemas", name + ".schema.json"), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  }
  const combined = await Promise.all(names.map((name) => readFile(path.join(root, "schemas", name + ".schema.json"), "utf8"))).then((items) => items.join("\n"));
  for (const removed of ["displayIntent", "presentation-plan", "componentId", "layoutId", "safePrimitive"]) {
    assert.doesNotMatch(combined, new RegExp(removed, "i"));
  }
  const interview = JSON.parse(await readFile(path.join(root, "schemas", "v5-interview.schema.json"), "utf8"));
  assert.equal(interview.properties.schemaVersion.const, 3);
  assert.deepEqual(interview.properties.answers.required, ["purpose", "contentWeight"]);
  assert.equal(interview.properties.answers.maxProperties, 3);
  assert.equal(interview.properties.answers.properties.structurePreference, undefined);
  assert.ok(interview.required.includes("decisionEvidence"));
  const sourcePack = JSON.parse(await readFile(path.join(root, "schemas", "v5-source-pack.schema.json"), "utf8"));
  assert.deepEqual(sourcePack.properties.packageVersion.enum, ["5.3.0", "5.3.1", "5.3.2", "5.4.0"]);
  const siteManifest = JSON.parse(await readFile(path.join(root, "schemas", "v5-site-manifest.schema.json"), "utf8"));
  assert.deepEqual(siteManifest.properties.packageVersion.enum, ["5.3.0", "5.3.1", "5.3.2", "5.4.0"]);
  assert.ok(siteManifest.required.includes("designProcessSha256"));
  const designProcess = JSON.parse(await readFile(path.join(root, "schemas", "v5-design-process.schema.json"), "utf8"));
  assert.ok(designProcess.properties.sourceAssetDecisions);
  const bindings = JSON.parse(await readFile(path.join(root, "schemas", "v5-content-bindings.schema.json"), "utf8"));
  assert.ok(bindings.required.includes("coverage"));
  assert.ok(bindings.properties.coverage.properties.focusEntities);
  assert.ok(bindings.properties.rawAppendixAuthorization);
});
