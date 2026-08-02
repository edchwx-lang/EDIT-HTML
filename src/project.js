import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { analyzeTextDocument, recommendMode } from "./analysis.js";
import { extractDocument } from "./extract.js";
import { writeJsonAtomic, writeTextAtomic } from "./io.js";
import { installProjectEditorRuntime } from "./project-runtime.js";
import {
  buildSourceModel,
  createInitialCoverageMap,
  PROJECT_SCHEMA_VERSION
} from "./report-model.js";

export async function createProject(sourcePath, projectDir) {
  const contents = await readFile(sourcePath);
  const sourceName = path.basename(sourcePath);
  const sourceDir = path.join(projectDir, "source");
  await mkdir(sourceDir, { recursive: true });
  await mkdir(path.join(projectDir, "variants"), { recursive: true });
  await mkdir(path.join(projectDir, "versions"), { recursive: true });
  await mkdir(path.join(projectDir, "publications"), { recursive: true });
  await mkdir(path.join(projectDir, "source-assets"), { recursive: true });
  await mkdir(path.join(projectDir, ".runtime"), { recursive: true });
  await copyFile(sourcePath, path.join(sourceDir, sourceName));

  const sourceSha256 = createHash("sha256").update(contents).digest("hex");

  const project = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: randomUUID(),
    createdAt: new Date().toISOString(),
    activeVariantId: null,
    variants: [],
    versions: [],
    publications: [],
    sourceFiles: [
      {
        name: sourceName,
        sha256: sourceSha256
      }
    ]
  };

  await writeJsonAtomic(path.join(projectDir, "project.json"), project);
  const extracted = await extractDocument(sourceName, contents);
  for (const asset of extracted.assets ?? []) {
    const assetPath = path.join(projectDir, ...asset.path.split("/"));
    await mkdir(path.dirname(assetPath), { recursive: true });
    await writeFile(assetPath, asset.bytes);
  }
  const sourceModel = buildSourceModel(sourceName, extracted, sourceSha256);
  await writeJsonAtomic(path.join(projectDir, "source-model.json"), sourceModel);
  await writeJsonAtomic(
    path.join(projectDir, "coverage-map.json"),
    createInitialCoverageMap(sourceModel)
  );
  const documents = [
    {
      ...analyzeTextDocument(sourceName, extracted.text),
      ...extracted,
      name: sourceName
    }
  ];
  await writeJsonAtomic(path.join(projectDir, "analysis.json"), {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    documents,
    recommendation: recommendMode(documents)
  });
  await writeJsonAtomic(path.join(projectDir, "deployments.json"), {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    records: [],
    providers: {}
  });
  await installProjectEditorRuntime(projectDir);
  return project;
}

export { writeJsonAtomic, writeTextAtomic } from "./io.js";
