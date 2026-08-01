import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { applyDraftPatch, redoDraft, undoDraft } from "./drafts.js";
import { renderEditorShell } from "./editor-shell.js";
import { finalizeVariant } from "./finalize.js";
import { compileThemeIntoArtifact } from "./theme-artifact.js";
import { listThemes } from "./themes.js";
import { normalizeVariantRecord, updateVariantTheme } from "./variants.js";

export async function startEditorServer({ projectDir, variantId }) {
  const host = "127.0.0.1";
  const token = randomBytes(32).toString("base64url");
  const artifactPath = path.join(
    projectDir,
    "variants",
    variantId,
    "artifact.html"
  );
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/") {
        if (url.searchParams.get("token") !== token) {
          sendJson(response, 401, { error: "unauthorized" });
          return;
        }
        const variant = await readVariant(projectDir, variantId);
        sendHtml(
          response,
          renderEditorShell({ variant, themes: listThemes({ locale: "zh-CN" }) })
        );
        return;
      }
      if (url.pathname.startsWith("/api/") && !isAuthorized(request, token)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/artifact") {
        const [artifact, variant] = await Promise.all([
          readFile(artifactPath, "utf8"),
          readVariant(projectDir, variantId)
        ]);
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        });
        response.end(compileThemeIntoArtifact(artifact, variant.themeId));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/themes") {
        sendJson(response, 200, listThemes({ locale: "zh-CN" }));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/publish") {
        await sendSavedVersion(projectDir, url.searchParams.get("version"), response);
        return;
      }
      if (request.method === "PATCH" && url.pathname === "/api/draft") {
        await applyDraftPatch(projectDir, variantId, await readJsonBody(request));
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/undo") {
        sendJson(response, 200, {
          changed: await undoDraft(projectDir, variantId)
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/redo") {
        sendJson(response, 200, {
          changed: await redoDraft(projectDir, variantId)
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/versions") {
        const body = await readJsonBody(request);
        const version = await finalizeVariant(projectDir, variantId, {
          message: body.message ?? ""
        });
        sendJson(response, 201, version);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/versions") {
        const project = await readProject(projectDir);
        sendJson(
          response,
          200,
          project.versions.filter((version) => version.variantId === variantId)
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/theme") {
        const body = await readJsonBody(request);
        sendJson(
          response,
          200,
          await updateVariantTheme(
            projectDir,
            variantId,
            body.themeId ?? body.theme
          )
        );
        return;
      }
      sendJson(response, 404, { error: "not found" });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  const address = server.address();
  return {
    host,
    token,
    url: "http://" + host + ":" + address.port,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
  };
}

async function readVariant(projectDir, variantId) {
  return normalizeVariantRecord(
    JSON.parse(
      await readFile(
        path.join(projectDir, "variants", variantId, "variant.json"),
        "utf8"
      )
    )
  );
}

async function readProject(projectDir) {
  return JSON.parse(
    await readFile(path.join(projectDir, "project.json"), "utf8")
  );
}

async function sendSavedVersion(projectDir, versionId, response) {
  const project = await readProject(projectDir);
  if (!project.versions.some((version) => version.versionId === versionId)) {
    sendJson(response, 404, { error: "unknown saved version" });
    return;
  }
  const artifact = await readFile(
    path.join(projectDir, "versions", versionId, "artifact.html"),
    "utf8"
  );
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-disposition": 'attachment; filename="report-' + versionId + '.html"',
    "cache-control": "no-store"
  });
  response.end(artifact);
}

function isAuthorized(request, token) {
  return request.headers.authorization === "Bearer " + token;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(value));
}

function sendHtml(response, value) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(value);
}
