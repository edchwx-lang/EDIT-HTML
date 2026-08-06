import { chmod, copyFile, cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const runtimeFiles = [
  "artifact-contract.js", "chart-data.js", "design-package.js", "drafts.js", "editor-server.js", "editor-session.js",
  "editor-review.js", "editor-session-worker.js", "editor-shell.js", "editorial-model.js", "finalize.js", "io.js",
  "publish.js", "renderer.js", "report-model.js", "theme-artifact.js",
  "themes.js", "variants.js", "versions.js", "modes/data-first.js",
  "modes/evidence-first.js", "modes/index.js"
];

export async function installProjectEditorRuntime(projectDir) {
  const runtimeRoot = path.join(projectDir, ".editor-runtime");
  await mkdir(path.join(runtimeRoot, "src", "modes"), { recursive: true });
  for (const relativePath of runtimeFiles) {
    const destination = path.join(runtimeRoot, "src", relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(sourceRoot, relativePath), destination);
  }
  for (const dependency of ["parse5", "entities"]) {
    await cp(
      path.join(path.dirname(sourceRoot), "node_modules", dependency),
      path.join(runtimeRoot, "node_modules", dependency),
      { recursive: true, force: true }
    );
  }
  await writeFile(path.join(runtimeRoot, "package.json"), '{"type":"module"}\n', "utf8");
  await writeFile(path.join(runtimeRoot, "open-editor.mjs"), embeddedLauncher(), "utf8");
  await writeFile(
    path.join(projectDir, "打开编辑器.cmd"),
    '@echo off\r\nnode "%~dp0.editor-runtime\\open-editor.mjs"\r\nif errorlevel 1 pause\r\n',
    "utf8"
  );
  const shellPath = path.join(projectDir, "open-editor.sh");
  await writeFile(shellPath, '#!/usr/bin/env sh\nPROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nnode "$PROJECT_DIR/.editor-runtime/open-editor.mjs"\n', "utf8");
  await chmod(shellPath, 0o755).catch(() => {});
}

function embeddedLauncher() {
  return `import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureEditorSession, launchBrowser } from "./src/editor-session.js";
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  const session = await ensureEditorSession(projectDir);
  const url = session.url + "/?token=" + encodeURIComponent(session.token);
  launchBrowser(url);
  process.stdout.write("编辑器已打开：" + url + "\\n");
} catch (error) {
  process.stderr.write("无法打开编辑器：" + error.message + "\\n");
  process.exitCode = 1;
}
`;
}
