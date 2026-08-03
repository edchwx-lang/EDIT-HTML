#!/usr/bin/env node

import { access, cp, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
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
import { migrateProject } from "../src/migrate.js";
import { packProject } from "../src/packaging.js";
import { createProject } from "../src/project.js";
import { publishLocal, publishProvider } from "../src/publish.js";
import { renderVariant } from "../src/renderer.js";
import { validateVariant } from "../src/validate.js";
import { createVariant, listVariants } from "../src/variants.js";
import { importEditorialModel } from "../src/editorial-model.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

async function main(argv) {
  const [command, ...args] = argv;
  if (command === "create") {
    const source = requirePositional(args, 0, "source");
    const projectDir = requireOption(args, "--out");
    printJson(await createProject(source, projectDir));
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
    throw new Error("mode selection is legacy read-only in V4.3; choose a complete design strategy instead");
  }
  if (command === "variant" && args[0] === "create") {
    const projectDir = requirePositional(args, 1, "project");
    if (optionalOption(args, "--mode") !== null) {
      throw new Error("--mode is legacy read-only in V4.3; choose a complete design strategy instead");
    }
    printJson(
      await createVariant(projectDir, {
        themeId: optionalOption(args, "--theme") ?? undefined
      })
    );
    return;
  }
  if (command === "content" && args[0] === "import") {
    const projectDir = requirePositional(args, 1, "project");
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
    printJson(await prepareHuashuInput(projectDir, requireOption(args, "--variant")));
    return;
  }
  if (command === "design" && args[0] === "hash") {
    const packageDir = requirePositional(args, 1, "design-package");
    printJson({ packageDir, outputSha256: await hashDesignPackagePayload(packageDir) });
    return;
  }
  if (command === "design" && args[0] === "candidate" && args[1] === "import") {
    const projectDir = requirePositional(args, 2, "project");
    printJson(await importHuashuDesignCandidate(
      projectDir,
      requireOption(args, "--variant"),
      requireOption(args, "--from")
    ));
    return;
  }
  if (command === "design" && args[0] === "candidate" && args[1] === "list") {
    const projectDir = requirePositional(args, 2, "project");
    printJson(await listHuashuDesignCandidates(projectDir, requireOption(args, "--variant")));
    return;
  }
  if (command === "design" && args[0] === "candidate" && args[1] === "confirm") {
    const projectDir = requirePositional(args, 2, "project");
    printJson(await confirmHuashuDesignCandidate(
      projectDir,
      requireOption(args, "--variant"),
      requireOption(args, "--candidate"),
      { confirmedBy: optionalOption(args, "--by") ?? "user" }
    ));
    return;
  }
  if (command === "design" && args[0] === "candidate" && args[1] === "status") {
    const projectDir = requirePositional(args, 2, "project");
    printJson(await getHuashuDesignCandidateStatus(projectDir, requireOption(args, "--variant")));
    return;
  }
  if (command === "design" && args[0] === "import") {
    const projectDir = requirePositional(args, 1, "project");
    printJson(await importHuashuDesignPackage(
      projectDir,
      requireOption(args, "--variant"),
      requireOption(args, "--from")
    ));
    return;
  }
  if (command === "design" && args[0] === "confirm") {
    const projectDir = requirePositional(args, 1, "project");
    printJson(await confirmHuashuDesign(projectDir, requireOption(args, "--variant"), {
      confirmedBy: optionalOption(args, "--by") ?? "user"
    }));
    return;
  }
  if (command === "design" && args[0] === "status") {
    const projectDir = requirePositional(args, 1, "project");
    printJson(await getHuashuDesignStatus(projectDir, requireOption(args, "--variant")));
    return;
  }
  if (command === "migrate") {
    const projectDir = requirePositional(args, 0, "project");
    printJson(await migrateProject(projectDir, { dryRun: args.includes("--dry-run") }));
    return;
  }
  if (command === "render") {
    const projectDir = requirePositional(args, 0, "project");
    const variantId = requireOption(args, "--variant");
    printJson({ variantId, artifactPath: await renderVariant(projectDir, variantId) });
    return;
  }
  if (command === "validate") {
    const projectDir = requirePositional(args, 0, "project");
    printJson(await validateVariant(projectDir, requireOption(args, "--variant")));
    return;
  }
  if (command === "install") {
    const codexRoot =
      optionalOption(args, "--codex-dir") ??
      path.join(os.homedir(), ".codex", "skills");
    const claudeRoot =
      optionalOption(args, "--claude-dir") ??
      path.join(os.homedir(), ".claude", "skills");
    const source = path.join(packageRoot, "skills", "edit-html-report");
    const destinations = await Promise.all(
      [codexRoot, claudeRoot].map(async (root) => {
        await mkdir(root, { recursive: true });
        const destination = path.join(root, "edit-html-report");
        await cp(source, destination, { recursive: true, force: true });
        return destination;
      })
    );
    printJson({ installed: destinations });
    return;
  }
  if (command === "doctor") {
    const checks = {
      node20: Number.parseInt(process.versions.node.split(".")[0], 10) >= 20,
      bundledSkill: await exists(
        path.join(packageRoot, "skills", "edit-html-report", "SKILL.md")
      )
    };
    printJson({ ok: Object.values(checks).every(Boolean), checks });
    if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
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
    const session = await ensureEditorSession(projectDir, {
      variantId: optionalOption(args, "--variant") ?? undefined
    });
    const editorUrl = session.url + "/?token=" + encodeURIComponent(session.token);
    printJson({ ...session, url: editorUrl });
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
    "usage: edit-html-report <install|doctor|create|inspect|content|mode|variant|design|finalize|migrate|render|validate|editor|open|pack|publish> [arguments]"
  );
}

async function migrateIfNeeded(projectDir) {
  const project = JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
  if (
    (project.schemaVersion ?? 1) < 4 ||
    project.packageVersion !== "4.3.0" ||
    project.pipelineVersion !== "4.3.0"
  ) {
    await migrateProject(projectDir);
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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
