import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { finalizeVariant } from "./finalize.js";
import { writeTextAtomic } from "./project.js";

export async function restoreVersion(projectDir, versionId) {
  const project = JSON.parse(
    await readFile(path.join(projectDir, "project.json"), "utf8")
  );
  const sourceVersion = project.versions.find(
    (version) => version.versionId === versionId
  );
  if (!sourceVersion) throw new Error('unknown version "' + versionId + '"');

  const sourceArtifact = await readFile(
    path.join(projectDir, "versions", versionId, "artifact.html"),
    "utf8"
  );
  const variantDir = path.join(
    projectDir,
    "variants",
    sourceVersion.variantId
  );
  await writeTextAtomic(path.join(variantDir, "artifact.html"), sourceArtifact);
  await Promise.all(
    ["draft-patches.jsonl", "draft-cursor.json"].map((name) =>
      rm(path.join(variantDir, name), { force: true })
    )
  );
  return finalizeVariant(projectDir, sourceVersion.variantId, {
    message: "Restore " + versionId,
    restoredFromVersionId: versionId
  });
}
