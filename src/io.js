import { randomUUID } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeJsonAtomic(filePath, value) {
  await writeTextAtomic(filePath, JSON.stringify(value, null, 2) + "\n");
}

export async function writeTextAtomic(filePath, value) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    "." + path.basename(filePath) + "." + randomUUID() + ".tmp"
  );
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, filePath);
}
