import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { analyzeTextDocument, recommendMode } from "./analysis.js";

async function writeJsonAtomic(filePath, value) {
  await writeTextAtomic(filePath, JSON.stringify(value, null, 2) + "\n");
}

async function writeTextAtomic(filePath, value) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    "." + path.basename(filePath) + "." + randomUUID() + ".tmp"
  );
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, filePath);
}

export async function createProject(sourcePath, projectDir) {
  const contents = await readFile(sourcePath);
  const sourceName = path.basename(sourcePath);
  const sourceDir = path.join(projectDir, "source");
  await mkdir(sourceDir, { recursive: true });
  await mkdir(path.join(projectDir, "variants"), { recursive: true });
  await mkdir(path.join(projectDir, "versions"), { recursive: true });
  await copyFile(sourcePath, path.join(sourceDir, sourceName));

  const project = {
    schemaVersion: 1,
    projectId: randomUUID(),
    createdAt: new Date().toISOString(),
    activeVariantId: null,
    variants: [],
    versions: [],
    sourceFiles: [
      {
        name: sourceName,
        sha256: createHash("sha256").update(contents).digest("hex")
      }
    ]
  };

  await writeJsonAtomic(path.join(projectDir, "project.json"), project);
  const documents = [analyzeTextDocument(sourceName, contents.toString("utf8"))];
  await writeJsonAtomic(path.join(projectDir, "analysis.json"), {
    schemaVersion: 1,
    documents,
    recommendation: recommendMode(documents)
  });
  await writeJsonAtomic(path.join(projectDir, "deployments.json"), {
    schemaVersion: 1,
    providers: {}
  });
  return project;
}

export { writeJsonAtomic, writeTextAtomic };
