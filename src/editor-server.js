import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { applyDraftPatch, redoDraft, undoDraft } from "./drafts.js";
import { renderEditorShell } from "./editor-shell.js";
import { finalizeVariant } from "./finalize.js";
import {
  listPublications,
  publishLocal,
  publishProvider,
  readPublicationArtifact,
  republishPublication,
  revealPublication
} from "./publish.js";
import { compileThemeIntoArtifact } from "./theme-artifact.js";
import { listThemes } from "./themes.js";
import { normalizeVariantRecord, updateVariantTheme } from "./variants.js";
import { restoreVersion } from "./versions.js";

export async function startEditorServer({
  projectDir,
  variantId,
  token: requestedToken,
  port = 0,
  sessionId = randomUUID(),
  onShutdown = null,
  onReveal = null,
  onActiveVersion = null
}) {
  const host = "127.0.0.1";
  const token = requestedToken ?? randomBytes(32).toString("base64url");
  const artifactPath = path.join(projectDir, "variants", variantId, "artifact.html");
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, schemaVersion: 4, sessionId, variantId });
        return;
      }
      if (request.method === "GET" && url.pathname === "/") {
        if (url.searchParams.get("token") !== token) return sendJson(response, 401, { error: "unauthorized" });
        const variant = await readVariant(projectDir, variantId);
        sendHtml(response, renderEditorShell({ variant, themes: listThemes({ locale: "zh-CN" }) }));
        return;
      }
      if (url.pathname.startsWith("/api/") && !isAuthorized(request, url, token)) return sendJson(response, 401, { error: "unauthorized" });

      if (request.method === "POST" && url.pathname === "/api/shutdown") {
        sendJson(response, 200, { stopping: true, sessionId });
        if (onShutdown) setTimeout(onShutdown, 0);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/project") {
        sendJson(response, 200, await projectState(projectDir, variantId));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/artifact") {
        const [artifact, variant] = await Promise.all([readFile(artifactPath, "utf8"), readVariant(projectDir, variantId)]);
        return sendHtml(response, compileThemeIntoArtifact(artifact, variant.themeId));
      }
      if (request.method === "GET" && url.pathname === "/api/draft") {
        sendJson(response, 200, JSON.parse(await readFile(path.join(projectDir, "variants", variantId, "report-model.json"), "utf8")));
        return;
      }
      if (request.method === "PATCH" && url.pathname === "/api/draft") {
        sendJson(response, 200, await applyDraftPatch(projectDir, variantId, await readJsonBody(request)));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/themes") {
        sendJson(response, 200, listThemes({ locale: "zh-CN" }));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/undo") {
        sendJson(response, 200, { changed: await undoDraft(projectDir, variantId) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/redo") {
        sendJson(response, 200, { changed: await redoDraft(projectDir, variantId) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/versions") {
        const body = await readJsonBody(request);
        const version = await finalizeVariant(projectDir, variantId, { message: body.message ?? "" });
        if (onActiveVersion) await onActiveVersion(version.versionId);
        sendJson(response, 201, version);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/versions") {
        const project = await readProject(projectDir);
        sendJson(response, 200, project.versions.filter((version) => version.variantId === variantId));
        return;
      }
      const versionRoute = url.pathname.match(/^\/api\/versions\/([^/]+)\/(preview|restore)$/);
      if (versionRoute && request.method === "GET" && versionRoute[2] === "preview") {
        return sendHtml(response, await readVersionArtifact(projectDir, versionRoute[1]));
      }
      if (versionRoute && request.method === "POST" && versionRoute[2] === "restore") {
        const version = await restoreVersion(projectDir, versionRoute[1]);
        if (onActiveVersion) await onActiveVersion(version.versionId);
        sendJson(response, 201, version);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/publications") {
        sendJson(response, 200, await listPublications(projectDir));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/publish") {
        const body = await readJsonBody(request);
        const publication = body.target === "public"
          ? await publishProvider(projectDir, body.versionId, body.provider)
          : await publishLocal(projectDir, body.versionId, body.outputPath ?? null);
        sendJson(response, 201, publication);
        return;
      }
      const publicationRoute = url.pathname.match(/^\/api\/publications\/([^/]+)\/(artifact|reveal|republish)$/);
      if (request.method === "GET" && publicationRoute?.[2] === "artifact") {
        return sendHtml(response, await readPublicationArtifact(projectDir, publicationRoute[1]));
      }
      if (request.method === "POST" && publicationRoute?.[2] === "reveal") {
        const result = await revealPublication(projectDir, publicationRoute[1], onReveal ? { runner: onReveal } : undefined);
        sendJson(response, 200, result);
        return;
      }
      if (request.method === "POST" && publicationRoute?.[2] === "republish") {
        sendJson(response, 201, await republishPublication(projectDir, publicationRoute[1]));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/publish") {
        await sendSavedVersion(projectDir, url.searchParams.get("version"), response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/theme") {
        const body = await readJsonBody(request);
        sendJson(response, 200, await updateVariantTheme(projectDir, variantId, body.themeId ?? body.theme));
        return;
      }
      sendJson(response, 404, { error: "not found" });
    } catch (error) {
      sendJson(response, error.code === "REVISION_CONFLICT" ? 409 : 400, {
        error: error.message,
        ...(error.currentRevision === undefined ? {} : { currentRevision: error.currentRevision })
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  return {
    host,
    port: address.port,
    token,
    sessionId,
    url: "http://" + host + ":" + address.port,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function projectState(projectDir, variantId) {
  const [project, variant, artifact, report] = await Promise.all([
    readProject(projectDir),
    readVariant(projectDir, variantId),
    readFile(path.join(projectDir, "variants", variantId, "artifact.html"), "utf8"),
    readFile(path.join(projectDir, "variants", variantId, "report-model.json"), "utf8").then(JSON.parse)
  ]);
  const versions = project.versions.filter((item) => item.variantId === variantId);
  const latest = versions.at(-1) ?? null;
  const compiled = compileThemeIntoArtifact(artifact, variant.themeId);
  const artifactSha256 = createHash("sha256").update(compiled, "utf8").digest("hex");
  return {
    schemaVersion: 4,
    projectId: project.projectId,
    variant,
    revision: report.revision,
    overrideCount: report.overrides?.length ?? 0,
    latestVersionId: latest?.versionId ?? null,
    dirty: !latest || latest.artifactSha256 !== artifactSha256
  };
}

async function readVariant(projectDir, variantId) {
  return normalizeVariantRecord(JSON.parse(await readFile(path.join(projectDir, "variants", variantId, "variant.json"), "utf8")));
}

async function readProject(projectDir) {
  return JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
}

async function readVersionArtifact(projectDir, versionId) {
  const project = await readProject(projectDir);
  if (!project.versions.some((version) => version.versionId === versionId)) throw new Error('unknown saved version "' + versionId + '"');
  return readFile(path.join(projectDir, "versions", versionId, "artifact.html"), "utf8");
}

async function sendSavedVersion(projectDir, versionId, response) {
  try {
    const artifact = await readVersionArtifact(projectDir, versionId);
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": 'attachment; filename="report-' + versionId + '.html"',
      "cache-control": "no-store"
    });
    response.end(artifact);
  } catch {
    sendJson(response, 404, { error: "unknown saved version" });
  }
}

function isAuthorized(request, url, token) {
  if (request.headers.authorization === "Bearer " + token) return true;
  const immutablePreview = request.method === "GET" && (
    /^\/api\/versions\/[^/]+\/preview$/.test(url.pathname) ||
    /^\/api\/publications\/[^/]+\/artifact$/.test(url.pathname)
  );
  return immutablePreview && url.searchParams.get("token") === token;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function sendHtml(response, value) {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(value);
}
