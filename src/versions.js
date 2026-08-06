import { access, copyFile, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { finalizeVariant } from "./finalize.js";
import { writeJsonAtomic, writeTextAtomic } from "./io.js";
import { renderVariant } from "./renderer.js";
import { normalizeVariantRecord, updateVariantTheme } from "./variants.js";

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
  const currentVariant = normalizeVariantRecord(
    project.variants.find(
      (variant) => variant.variantId === sourceVersion.variantId
    )
  );
  await updateVariantTheme(
    projectDir,
    sourceVersion.variantId,
    sourceVersion.themeId ?? currentVariant.themeId
  );
  const modelSnapshot = path.join(projectDir, "versions", versionId, "report-model.json");
  const presentationSnapshot = path.join(projectDir, "versions", versionId, "presentation-plan.json");
  const coverageSnapshot = path.join(projectDir, "versions", versionId, "coverage-map.json");
  if (sourceVersion.modelBacked && await exists(modelSnapshot)) {
    await copyFile(modelSnapshot, path.join(variantDir, "report-model.json"));
    if (await exists(presentationSnapshot)) {
      await copyFile(presentationSnapshot, path.join(variantDir, "presentation-plan.json"));
    }
    if (await exists(coverageSnapshot)) {
      await copyFile(coverageSnapshot, path.join(projectDir, "coverage-map.json"));
    }
    await renderVariant(projectDir, sourceVersion.variantId);
  } else {
    await writeTextAtomic(path.join(variantDir, "artifact.html"), sourceArtifact);
  }
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

export async function deleteVersion(projectDir, versionId) {
  const projectPath = path.join(projectDir, "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  const index = project.versions.findIndex((version) => version.versionId === versionId);
  if (index === -1) throw new Error('unknown version "' + versionId + '"');
  const [deleted] = project.versions.splice(index, 1);
  for (const version of project.versions) {
    if (version.parentVersionId === versionId) version.parentVersionId = deleted.parentVersionId ?? null;
  }
  await rm(path.join(projectDir, "versions", versionId), { recursive: true, force: true });
  await writeJsonAtomic(projectPath, project);
  return { versionId, deleted: true };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
