import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { strToU8, zipSync } from "fflate";

import { createProject } from "../src/project.js";
import { createVariant } from "../src/variants.js";
import { validateCoverage } from "../src/report-model.js";

test("DOCX source model preserves heading, paragraph, table, image, and order", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-v4-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.docx");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, zipSync({
    "word/document.xml": strToU8(
      '<?xml version="1.0"?><w:document xmlns:w="urn:w" xmlns:r="urn:r" xmlns:a="urn:a" xmlns:wp="urn:wp">' +
      '<w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>材料章节</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>市场规模 42 亿元</w:t></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>地区</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>规模</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '<w:p><w:r><w:drawing><wp:docPr id="1" name="Picture 1" descr="材料结构图"/><a:blip r:embed="rId5"/></w:drawing></w:r></w:p>' +
      '</w:body></w:document>'
    ),
    "word/_rels/document.xml.rels": strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId5" Target="media/image1.png" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/></Relationships>'
    ),
    "word/media/image1.png": strToU8("png")
  }));

  await createProject(source, projectDir);
  const model = JSON.parse(await readFile(path.join(projectDir, "source-model.json"), "utf8"));
  const units = model.documents[0].units;
  assert.deepEqual(units.map((unit) => unit.type), ["heading", "paragraph", "table", "image"]);
  assert.equal(units[0].level, 1);
  assert.deepEqual(units[2].rows, [["地区", "规模"]]);
  assert.equal(units[3].alt, "材料结构图");
  assert.equal(units[3].assetPath, "source-assets/image1.png");
  assert.deepEqual(units.map((unit) => unit.order), [0, 1, 2, 3]);
});

test("creating a variant scaffolds canonical report and presentation models with complete coverage", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-v4-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 市场\n规模为 42 亿元。\n\n# 技术\n关键约束。", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "data-first" });
  const variantDir = path.join(projectDir, "variants", variant.variantId);
  const report = JSON.parse(await readFile(path.join(variantDir, "report-model.json"), "utf8"));
  const presentation = JSON.parse(await readFile(path.join(variantDir, "presentation-plan.json"), "utf8"));
  const coverage = JSON.parse(await readFile(path.join(projectDir, "coverage-map.json"), "utf8"));

  assert.equal(report.schemaVersion, 4);
  assert.equal(report.mode, "data-first");
  assert.deepEqual(report.nodes.filter((node) => node.type === "section").map((node) => node.title), ["市场", "技术"]);
  assert.equal(presentation.schemaVersion, 4);
  assert.equal(presentation.bindings.every((binding) => !Object.hasOwn(binding, "text")), true);
  assert.equal(presentation.mode, "data-first");
  assert.doesNotThrow(() => validateCoverage(coverage, report));
  assert.equal(coverage.entries.every((entry) => entry.status === "preserved"), true);
});

test("coverage validation rejects an unmapped substantive source unit", () => {
  assert.throws(
    () => validateCoverage(
      { schemaVersion: 4, entries: [{ sourceId: "src-a", status: "pending", substantive: true }] },
      { schemaVersion: 4, nodes: [] }
    ),
    /unmapped substantive source unit "src-a"/
  );
});
