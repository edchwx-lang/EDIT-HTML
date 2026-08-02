import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { startEditorServer } from "./editor-server.js";
import { recordEditorSession } from "./editor-session.js";

const [projectArgument, ...args] = process.argv.slice(2);
if (!projectArgument) throw new Error("missing project directory");
const projectDir = path.resolve(projectArgument);
const variantId = option(args, "--variant");
const token = option(args, "--token");
const sessionId = option(args, "--session-id");
let requestShutdown;
let sessionMetadata = null;
const shutdownRequested = new Promise((resolve) => { requestShutdown = resolve; });

const editor = await startEditorServer({
  projectDir,
  variantId,
  token,
  sessionId,
  onShutdown: requestShutdown,
  onActiveVersion: async (activeVersionId) => {
    if (!sessionMetadata) return;
    sessionMetadata = { ...sessionMetadata, activeVersionId };
    await recordEditorSession(projectDir, sessionMetadata);
  }
});
const project = JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
const activeVersionId = project.versions.filter((item) => item.variantId === variantId).at(-1)?.versionId ?? null;
sessionMetadata = {
  schemaVersion: 4,
  pid: process.pid,
  port: editor.port,
  token,
  sessionId,
  projectDir,
  variantId,
  activeVersionId,
  startedAt: new Date().toISOString(),
  url: editor.url
};
await recordEditorSession(projectDir, sessionMetadata);

process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);
await shutdownRequested;
await editor.close();
await rm(path.join(projectDir, ".runtime", "editor-session.json"), { force: true });

function option(values, name) {
  const index = values.indexOf(name);
  const value = index === -1 ? null : values[index + 1];
  if (!value) throw new Error("missing option " + name);
  return value;
}
