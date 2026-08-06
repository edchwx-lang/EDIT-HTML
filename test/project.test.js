import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { strToU8, zipSync } from "fflate";

import { createProject } from "../src/project.js";

test("createProject copies and hashes a source file into a new workspace", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Revenue reached 42 million.", "utf8");

  const project = await createProject(source, projectDir);

  assert.equal(project.schemaVersion, 4);
  assert.equal(project.packageVersion, "4.3.0");
  assert.equal(project.pipelineVersion, "4.3.0");
  assert.equal(project.sourceFiles.length, 1);
  assert.equal(
    project.sourceFiles[0].sha256,
    "adf0572d77a78dd48cb8c3c59c00399d93bff1bba38e23a5908bb9edf2e1320a"
  );
  assert.equal(
    await readFile(path.join(projectDir, "source", "brief.txt"), "utf8"),
    "Revenue reached 42 million."
  );
  assert.deepEqual(
    JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8")),
    project
  );
  const sourceModel = JSON.parse(
    await readFile(path.join(projectDir, "source-model.json"), "utf8")
  );
  assert.equal(sourceModel.schemaVersion, 4);
  assert.equal(sourceModel.documents[0].units[0].text, "Revenue reached 42 million.");
  assert.match(sourceModel.documents[0].units[0].sourceId, /^src-/);
  assert.equal(sourceModel.documents[0].units[0].order, 0);
  await access(path.join(projectDir, "打开编辑器.cmd"));
  await access(path.join(projectDir, "open-editor.sh"));
  await access(path.join(projectDir, ".editor-runtime", "src", "chart-data.js"));
  await access(path.join(projectDir, ".editor-runtime", "src", "design-package.js"));
  await access(path.join(projectDir, ".editor-runtime", "src", "editor-review.js"));
  await access(path.join(projectDir, ".editor-runtime", "src", "editorial-model.js"));
  await access(path.join(projectDir, ".editor-runtime", "node_modules", "parse5", "dist", "index.js"));
  await access(path.join(projectDir, ".editor-runtime", "node_modules", "entities", "lib", "esm", "index.js"));
  assert.match(await readFile(path.join(projectDir, "打开编辑器.cmd"), "utf8"), /%~dp0/);
  assert.match(await readFile(path.join(projectDir, "open-editor.sh"), "utf8"), /dirname/);
});

test("createProject writes deterministic plain-text analysis for Agent handoff", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Market evidence\nRevenue reached 42 million.", "utf8");

  await createProject(source, projectDir);
  const analysis = JSON.parse(
    await readFile(path.join(projectDir, "analysis.json"), "utf8")
  );

  assert.equal(analysis.schemaVersion, 4);
  assert.equal(analysis.documents[0].text, "Market evidence\nRevenue reached 42 million.");
  assert.equal(analysis.documents[0].numericTokenCount, 1);
  assert.equal(analysis.recommendation.mode, "evidence-first");
  const coverage = JSON.parse(
    await readFile(path.join(projectDir, "coverage-map.json"), "utf8")
  );
  assert.equal(coverage.schemaVersion, 4);
  assert.equal(coverage.entries[0].status, "pending");
});

test("createProject analyzes DOCX through the format extractor", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.docx");
  const projectDir = path.join(sandbox, "report");
  await writeFile(
    source,
    zipSync({
      "word/document.xml": strToU8(
        '<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>DOCX evidence 42</w:t></w:r></w:p></w:body></w:document>'
      )
    })
  );

  await createProject(source, projectDir);
  const analysis = JSON.parse(
    await readFile(path.join(projectDir, "analysis.json"), "utf8")
  );

  assert.equal(
    analysis.documents[0].mediaType,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  assert.equal(analysis.documents[0].text, "DOCX evidence 42");
});
