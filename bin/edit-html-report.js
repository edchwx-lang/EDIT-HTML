#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { finalizeVariant } from "../src/finalize.js";
import {
  confirmHuashuDesignCandidate,
  confirmHuashuDesign,
  getHuashuDesignCandidateStatus,
  getHuashuDesignStatus,
  hashDesignPackagePayload,
  importHuashuDesignCandidate,
  importHuashuDesignPackage,
  listHuashuDesignCandidates,
  prepareHuashuInput
} from "../src/design-package.js";
import { ensureEditorSession, getEditorSessionStatus, launchBrowser, stopEditorSession } from "../src/editor-session.js";
import { diagnoseInstallation, resolveCommandSource } from "../src/doctor.js";
import { migrateProject } from "../src/migrate.js";
import { migrateV5Project } from "../src/v5-migration.js";
import { packProject } from "../src/packaging.js";
import { createProject } from "../src/project.js";
import { publishLocal, publishProvider } from "../src/publish.js";
import { renderVariant } from "../src/renderer.js";
import { validateVariant } from "../src/validate.js";
import { createVariant, listVariants } from "../src/variants.js";
import { importEditorialModel } from "../src/editorial-model.js";
import { createV5Project, createV5Variant } from "../src/v5-project.js";
import { getV5InterviewStatus, importV5Interview, prepareV5HuashuInput } from "../src/v5-interview.js";
import {
  confirmV5DesignCandidate,
  getV5FinalStatus,
  hashV5SitePayload,
  importV5DesignCandidate,
  importV5FinalSite,
  listV5DesignCandidates,
  prepareV5CandidateReviewSet
} from "../src/v5-design.js";
import { instrumentV5Variant } from "../src/v5-instrumenter.js";
import { validateV5Variant } from "../src/v5-validate.js";
import { ensureProjectEditorRuntime, refreshProjectEditorRuntime } from "../src/project-runtime.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

async function main(argv) {
  const [command, ...args] = argv;
  if (command === "create") {
    const source = requirePositional(args, 0, "source");
    const projectDir = requireOption(args, "--out");
    printJson(await createV5Project(source, projectDir));
    return;
  }
  if (command === "inspect") {
    const projectDir = requirePositional(args, 0, "project");
    printJson(
      JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"))
    );
    return;
  }
  if (command === "mode" && args[0] === "list") {
    throw new Error("mode selection was removed in V5; Huashu determines content priority through the interview");
  }
  if (command === "variant" && args[0] === "create") {
    const projectDir = requirePositional(args, 1, "project");
    if (optionalOption(args, "--mode") !== null) {
      throw new Error("--mode is legacy read-only in V4.3; choose a complete design strategy instead");
    }
    printJson((await isV5Project(projectDir))
      ? await createV5Variant(projectDir, { themeId: optionalOption(args, "--theme") ?? undefined })
      : await createVariant(projectDir, { themeId: optionalOption(args, "--theme") ?? undefined }));
    return;
  }
  if (command === "interview" && args[0] === "import") {
    const projectDir = requirePositional(args, 1, "project");
    printJson(await importV5Interview(projectDir, requireOption(args, "--variant"), requireOption(args, "--from")));
    return;
  }
  if (command === "interview" && args[0] === "status") {
    const projectDir = requirePositional(args, 1, "project");
    printJson(await getV5InterviewStatus(projectDir, requireOption(args, "--variant")));
    return;
  }
  if (command === "content" && args[0] === "import") {
    const projectDir = requirePositional(args, 1, "project");
    if (await isV5Project(projectDir)) throw new Error("content import was removed in V5; Huashu owns content strategy after the interview");
    printJson(await importEditorialModel(projectDir, requireOption(args, "--variant"), {
      reportPath: requireOption(args, "--report"),
      coveragePath: requireOption(args, "--coverage")
    }));
    return;
  }
  if (command === "variant" && args[0] === "list") {
    const projectDir = requirePositional(args, 1, "project");
    printJson(await listVariants(projectDir));
    return;
  }
  if (command === "finalize") {
    const projectDir = requirePositional(args, 0, "project");
    printJson(
      await finalizeVariant(projectDir, requireOption(args, "--variant"), {
        message: optionalOption(args, "--message") ?? ""
      })
    );
    return;
  }
  if (command === "design" && args[0] === "prepare") {
    const projectDir = requirePositional(args, 1, "project");
    printJson((await isV5Project(projectDir))
      ? await prepareV5HuashuInput(projectDir, requireOption(args, "--variant"))
      : await prepareHuashuInput(projectDir, requireOption(args, "--variant")));
    return;
  }
  if (command === "design" && args[0] === "hash") {
    const packageDir = requirePositional(args, 1, "design-package");
    const manifest = JSON.parse(await readFile(path.join(packageDir, "manifest.json"), "utf8"));
    printJson({ packageDir, outputSha256: manifest.packageVersion === "5.0.0" ? await hashV5SitePayload(packageDir) : await hashDesignPackagePayload(packageDir) });
    return;
  }
  if (command === "design" && args[0] === "candidate" && args[1] === "import") {
    const projectDir = requirePositional(args, 2, "project");
    printJson((await isV5Project(projectDir))
      ? await importV5DesignCandidate(projectDir, requireOption(args, "--variant"), requireOption(args, "--from"))
      : await importHuashuDesignCandidate(projectDir, requireOption(args, "--variant"), requireOption(args, "--from")));
    return;
  }
  if (command === "design" && args[0] === "candidate" && args[1] === "list") {
    const projectDir = requirePositional(args, 2, "project");
    printJson((await isV5Project(projectDir))
      ? await listV5DesignCandidates(projectDir, requireOption(args, "--variant"))
      : await listHuashuDesignCandidates(projectDir, requireOption(args, "--variant")));
    return;
  }
  if (command === "design" && args[0] === "candidate" && args[1] === "review" && args[2] === "prepare") {
    const projectDir = requirePositional(args, 3, "project");
    if (!(await isV5Project(projectDir))) throw new Error("candidate review prepare is available only for V5 projects");
    printJson(await prepareV5CandidateReviewSet(projectDir, requireOption(args, "--variant")));
    return;
  }
  if (command === "design" && args[0] === "candidate" && args[1] === "confirm") {
    const projectDir = requirePositional(args, 2, "project");
    printJson((await isV5Project(projectDir))
      ? await confirmV5DesignCandidate(projectDir, requireOption(args, "--variant"), requireOption(args, "--candidate"), { receiptPath: optionalOption(args, "--receipt") ?? undefined })
      : await confirmHuashuDesignCandidate(projectDir, requireOption(args, "--variant"), requireOption(args, "--candidate"), { confirmedBy: optionalOption(args, "--by") ?? "user" }));
    return;
  }
  if (command === "design" && args[0] === "candidate" && args[1] === "status") {
    const projectDir = requirePositional(args, 2, "project");
    printJson((await isV5Project(projectDir))
      ? { candidates: await listV5DesignCandidates(projectDir, requireOption(args, "--variant")) }
      : await getHuashuDesignCandidateStatus(projectDir, requireOption(args, "--variant")));
    return;
  }
  if (command === "design" && args[0] === "final" && args[1] === "import") {
    const projectDir = requirePositional(args, 2, "project");
    if (!(await isV5Project(projectDir))) throw new Error("design final import is available only for V5 projects");
    printJson(await importV5FinalSite(projectDir, requireOption(args, "--variant"), requireOption(args, "--from")));
    return;
  }
  if (command === "design" && args[0] === "final" && args[1] === "status") {
    const projectDir = requirePositional(args, 2, "project");
    printJson(await getV5FinalStatus(projectDir, requireOption(args, "--variant")));
    return;
  }
  if (command === "design" && args[0] === "import") {
    const projectDir = requirePositional(args, 1, "project");
    if (await isV5Project(projectDir)) throw new Error("legacy design command is unavailable for V5 projects; use design candidate import and design final import");
    printJson(await importHuashuDesignPackage(
      projectDir,
      requireOption(args, "--variant"),
      requireOption(args, "--from")
    ));
    return;
  }
  if (command === "design" && args[0] === "confirm") {
    const projectDir = requirePositional(args, 1, "project");
    if (await isV5Project(projectDir)) throw new Error("legacy design command is unavailable for V5 projects; use design candidate confirm");
    printJson(await confirmHuashuDesign(projectDir, requireOption(args, "--variant"), {
      confirmedBy: optionalOption(args, "--by") ?? "user"
    }));
    return;
  }
  if (command === "design" && args[0] === "status") {
    const projectDir = requirePositional(args, 1, "project");
    if (await isV5Project(projectDir)) throw new Error("legacy design command is unavailable for V5 projects; use design candidate status or design final status");
    printJson(await getHuashuDesignStatus(projectDir, requireOption(args, "--variant")));
    return;
  }
  if (command === "migrate") {
    const projectDir = requirePositional(args, 0, "project");
    printJson((await isV5Project(projectDir))
      ? await migrateV5Project(projectDir, { dryRun: args.includes("--dry-run") })
      : await migrateProject(projectDir, { dryRun: args.includes("--dry-run") }));
    return;
  }
  if (command === "render") {
    const projectDir = requirePositional(args, 0, "project");
    const variantId = requireOption(args, "--variant");
    if (await isV5Project(projectDir)) {
      printJson({ variantId, artifactPath: await instrumentV5Variant(projectDir, variantId) });
    } else {
      throw new Error("V4.x regeneration is disabled in V5; create a V5 project from the original source. Existing artifacts remain editable and publishable.");
    }
    return;
  }
  if (command === "validate") {
    const projectDir = requirePositional(args, 0, "project");
    printJson((await isV5Project(projectDir))
      ? await validateV5Variant(projectDir, requireOption(args, "--variant"))
      : await validateVariant(projectDir, requireOption(args, "--variant")));
    return;
  }
  if (command === "install") {
    throw new Error("CLI installation was removed; run npm run install:local from the intended V5.3 source checkout");
  }
  if (command === "doctor") {
    const doctor = await diagnoseInstallation({
      packageRoot,
      executablePath: fileURLToPath(import.meta.url),
      commandSourcePath: await resolveCommandSource("edit-html-report"),
      projectDir: optionalOption(args, "--project") ?? undefined
    });
    printJson(doctor);
    if (!doctor.checks.node20 || !doctor.checks.bundledSkill) process.exitCode = 1;
    return;
  }
  if (command === "runtime" && args[0] === "refresh") {
    printJson(await refreshProjectEditorRuntime(requirePositional(args, 1, "project")));
    return;
  }
  if (command === "pack") {
    const projectDir = requirePositional(args, 0, "project");
    const archivePath = requireOption(args, "--out");
    await packProject(projectDir, archivePath);
    printJson({ archivePath });
    return;
  }
  if (command === "publish" && args[0] === "local") {
    const projectDir = requirePositional(args, 1, "project");
    printJson(
      await publishLocal(
        projectDir,
        requireOption(args, "--version"),
        optionalOption(args, "--out")
      )
    );
    return;
  }
  if (
    command === "publish" &&
    (args[0] === "netlify" || args[0] === "vercel")
  ) {
    const projectDir = requirePositional(args, 1, "project");
    printJson(
      await publishProvider(
        projectDir,
        requireOption(args, "--version"),
        args[0]
      )
    );
    return;
  }
  if (command === "open" || (command === "editor" && args[0] === "open")) {
    const offset = command === "open" ? 0 : 1;
    const projectDir = requirePositional(args, offset, "project");
    await migrateIfNeeded(projectDir);
    await ensureProjectEditorRuntime(projectDir);
    const session = await ensureEditorSession(projectDir, {
      variantId: optionalOption(args, "--variant") ?? undefined
    });
    const editorUrl = session.url + "/?token=" + encodeURIComponent(session.token);
    const launcherPath = path.resolve(projectDir, "open-editor.sh");
    printJson({
      ...session,
      url: editorUrl,
      handoff: {
        kind: "visible-editor",
        editorUrl,
        launcherPath,
        projectDir: path.resolve(projectDir),
        variantId: session.variantId,
        nextUserAction: "Open the visible editor, inspect and edit the website, then save a version when ready."
      }
    });
    if (!args.includes("--no-browser")) launchBrowser(editorUrl);
    return;
  }
  if (command === "editor" && args[0] === "status") {
    printJson(await getEditorSessionStatus(requirePositional(args, 1, "project")));
    return;
  }
  if (command === "editor" && args[0] === "stop") {
    printJson(await stopEditorSession(requirePositional(args, 1, "project")));
    return;
  }
  throw new Error(
    "usage: edit-html-report <doctor|runtime|create|inspect|interview|variant|design|finalize|migrate|render|validate|editor|open|pack|publish> [arguments]"
  );
}

async function migrateIfNeeded(projectDir) {
  const project = JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
  if (project.schemaVersion === 5) {
    if ((project.migratedFrom?.packageVersion ?? project.packageVersion) === "5.2.1") {
      await migrateV5Project(projectDir);
    }
    return;
  }
  if (
    (project.schemaVersion ?? 1) < 4 ||
    project.packageVersion !== "4.3.0" ||
    project.pipelineVersion !== "4.3.0"
  ) {
    await migrateProject(projectDir);
  }
}

async function isV5Project(projectDir) {
  const project = JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
  return project.schemaVersion === 5;
}

function requirePositional(args, index, name) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error("missing " + name);
  }
  return value;
}

function requireOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error("missing option " + name);
  }
  return args[index + 1];
}

function optionalOption(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
}

function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write("edit-html-report: " + error.message + "\n");
  process.exitCode = 1;
});
