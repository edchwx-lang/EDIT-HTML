import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";

export async function publishLocal(projectDir, versionId, outputPath) {
  const project = JSON.parse(
    await readFile(path.join(projectDir, "project.json"), "utf8")
  );
  if (!project.versions.some((version) => version.versionId === versionId)) {
    throw new Error('unknown saved version "' + versionId + '"');
  }
  await copyFile(
    path.join(projectDir, "versions", versionId, "artifact.html"),
    outputPath
  );
  return { provider: "local", versionId, outputPath };
}
