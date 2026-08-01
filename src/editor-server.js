import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { applyDraftPatch, redoDraft, undoDraft } from "./drafts.js";
import { finalizeVariant } from "./finalize.js";

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
        sendHtml(response, editorShell());
        return;
      }
      if (url.pathname.startsWith("/api/") && !isAuthorized(request, token)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/artifact") {
        const artifact = await readFile(artifactPath, "utf8");
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        });
        response.end(artifact);
        return;
      }
      if (request.method === "PATCH" && url.pathname === "/api/draft") {
        const patch = await readJsonBody(request);
        await applyDraftPatch(projectDir, variantId, patch);
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

function editorShell() {
  return [
    "<!doctype html>",
    '<html lang="en"><meta charset="utf-8">',
    "<title>Edit HTML Report</title>",
    "<style>",
    "*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:#172033;font:14px system-ui,sans-serif}",
    ".toolbar{height:52px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#fff;border-bottom:1px solid #d8dee8}",
    ".toolbar button{border:1px solid #c7cfdb;background:#fff;border-radius:7px;padding:7px 10px;cursor:pointer}",
    ".toolbar .push{margin-left:auto}",
    "main{height:calc(100vh - 52px);padding:16px}",
    "iframe{width:100%;height:100%;border:0;background:#fff;box-shadow:0 8px 28px #22324a1f}",
    "</style>",
    '<body><header class="toolbar">',
    '<button data-action="edit">Edit</button>',
    '<button data-action="undo">Undo</button>',
    '<button data-action="redo">Redo</button>',
    '<button data-action="save">Save version</button>',
    '<button data-action="versions">Versions</button>',
    '<button data-action="theme" class="push">Theme</button>',
    '<button data-action="publish">Publish</button>',
    "</header>",
    '<main><iframe title="Report canvas"></iframe></main>',
    "</body></html>"
  ].join("");
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
