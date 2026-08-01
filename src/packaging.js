import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";

export async function packProject(projectDir, archivePath) {
  const files = {};
  await collectFiles(projectDir, projectDir, files);
  await writeFile(archivePath, zipSync(files, { level: 6 }));
  return archivePath;
}

async function collectFiles(root, directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("symbolic links are not allowed in portable projects");
    }
    if (entry.isDirectory()) {
      await collectFiles(root, absolutePath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const relativePath = path.relative(root, absolutePath).replaceAll("\\", "/");
    files[relativePath] = await readFile(absolutePath);
  }
}
