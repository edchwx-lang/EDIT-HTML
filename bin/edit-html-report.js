#!/usr/bin/env node

import { access, cp, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { finalizeVariant } from "../src/finalize.js";
import { ensureEditorSession, getEditorSessionStatus, launchBrowser, stopEditorSession } from "../src/editor-session.js";
import { migrateProject } from "../src/migrate.js";
import { listModeProfiles } from "../src/modes/index.js";
import { packProject } from "../src/packaging.js";
import { createProject } from "../src/project.js";
import { publishLocal, publishProvider } from "../src/publish.js";
import { renderVariant } from "../src/renderer.js";
import { validateVariant } from "../src/validate.js";
import { createVariant, listVariants } from "../src/variants.js";

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
    printJson(
      listModeProfiles({ locale: optionalOption(args, "--locale") ?? "en" })
    );
    return;
  }
  if (command === "variant" && args[0] === "create") {
    const projectDir = requirePositional(args, 1, "project");
    printJson(
      await createVariant(projectDir, {
        mode: requireOption(args, "--mode"),
        themeId: optionalOption(args, "--theme") ?? undefined
      })
    );
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
    "usage: edit-html-report <install|doctor|create|inspect|mode|variant|finalize|migrate|render|validate|editor|open|pack|publish> [arguments]"
  );
}

async function migrateIfNeeded(projectDir) {
  const project = JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
  if ((project.schemaVersion ?? 1) < 4) await migrateProject(projectDir);
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
