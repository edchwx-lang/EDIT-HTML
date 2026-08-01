import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { applyDraftPatch, redoDraft, undoDraft } from "./drafts.js";
import { finalizeVariant } from "./finalize.js";
import { updateVariantTheme } from "./variants.js";

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
        const variant = JSON.parse(
          await readFile(
            path.join(projectDir, "variants", variantId, "variant.json"),
            "utf8"
          )
        );
        sendHtml(response, editorShell(variant));
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
      if (request.method === "GET" && url.pathname === "/api/publish") {
        const versionId = url.searchParams.get("version");
        const project = JSON.parse(
          await readFile(path.join(projectDir, "project.json"), "utf8")
        );
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
          "content-disposition":
            'attachment; filename="report-' + versionId + '.html"',
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
      if (request.method === "GET" && url.pathname === "/api/versions") {
        const project = JSON.parse(
          await readFile(path.join(projectDir, "project.json"), "utf8")
        );
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
          await updateVariantTheme(projectDir, variantId, body.theme)
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

function editorShell(variant) {
  return [
    "<!doctype html>",
    '<html lang="en"><meta charset="utf-8">',
    '<link rel="icon" href="data:,">',
    "<title>Edit HTML Report</title>",
    "<style>",
    "*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:#172033;font:14px system-ui,sans-serif}",
    ".toolbar{height:52px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#fff;border-bottom:1px solid #d8dee8}",
    ".toolbar button{border:1px solid #c7cfdb;background:#fff;border-radius:7px;padding:7px 10px;cursor:pointer}",
    ".toolbar button:disabled{cursor:not-allowed;opacity:.42}",
    ".toolbar .push{margin-left:auto}",
    ".status{color:#526078;font-size:12px}",
    "main{height:calc(100vh - 52px);padding:16px}",
    "iframe{width:100%;height:100%;border:0;background:#fff;box-shadow:0 8px 28px #22324a1f}",
    "</style>",
    '<body><header class="toolbar">',
    '<button data-action="edit">Edit</button>',
    '<button data-action="undo">Undo</button>',
    '<button data-action="redo">Redo</button>',
    '<button data-action="save">Save version</button>',
    '<button data-action="versions">Versions</button>',
    '<button data-action="image">Replace image</button>',
    '<button data-action="chart">Edit chart data</button>',
    '<button data-action="block-up">Move up</button>',
    '<button data-action="block-down">Move down</button>',
    '<button data-action="block-copy">Duplicate</button>',
    '<button data-action="block-delete">Delete</button>',
    '<input data-image-input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden>',
    '<span class="status" data-status>Ready</span>',
    '<button data-action="theme" class="push">Theme</button>',
    '<button data-action="publish">Publish</button>',
    "</header>",
    '<main><iframe title="Report canvas"></iframe></main>',
    "<script>",
    "const token=new URLSearchParams(location.search).get('token');",
    "const frame=document.querySelector('iframe');",
    "const statusNode=document.querySelector('[data-status]');",
    "const mode=" + JSON.stringify(variant.mode) + ";",
    "let currentTheme=" + JSON.stringify(variant.theme) + ";",
    "let lastVersionId=null;",
    "let editing=false;",
    "let selectedImageId=null;",
    "let selectedChartId=null;",
    "let selectedBlockId=null;",
    "function status(value){statusNode.textContent=value;}",
    "async function api(path,options={}){",
    " const headers={authorization:'Bearer '+token,...(options.headers||{})};",
    " if(options.body)headers['content-type']='application/json';",
    " const response=await fetch(path,{...options,headers});",
    " if(!response.ok)throw new Error((await response.json()).error||'Request failed');",
    " return response;",
    "}",
    "async function loadArtifact(){",
    " status('Loading');",
    " frame.srcdoc=await (await api('/api/artifact')).text();",
    " await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));",
    " if(editing)activateEditableNodes();",
    " status(editing?'Editing':'Ready');",
    "}",
    "function activateEditableNodes(){",
    " const doc=frame.contentDocument;",
    " for(const node of frame.contentDocument.querySelectorAll('[data-edit-id]')){",
    "  node.contentEditable='true';",
    "  node.style.outline='1px dashed #4f6bed';",
    "  node.addEventListener('blur',async()=>{",
    "   status('Saving draft');",
    "   await api('/api/draft',{method:'PATCH',body:JSON.stringify({type:'replaceText',editId:node.dataset.editId,value:node.textContent})});",
    "   status('Draft saved');",
    "  });",
    " }",
    " for(const node of doc.querySelectorAll('[data-image-id]'))node.addEventListener('click',event=>{event.preventDefault();selectTarget('image',node.dataset.imageId,node);});",
    " for(const node of doc.querySelectorAll('[data-chart-id]'))node.addEventListener('click',event=>{event.preventDefault();selectTarget('chart',node.dataset.chartId,node);});",
    " for(const node of doc.querySelectorAll('[data-block-id]'))node.addEventListener('click',event=>{if(event.target.closest('[data-image-id],[data-chart-id],[data-edit-id]'))return;selectTarget('block',node.dataset.blockId,node);});",
    "}",
    "function selectTarget(type,id,node){",
    " for(const item of frame.contentDocument.querySelectorAll('[data-edit-selected]')){item.removeAttribute('data-edit-selected');item.style.boxShadow='';}",
    " node.dataset.editSelected='true';node.style.boxShadow='0 0 0 3px #4f6bed';",
    " if(type==='image')selectedImageId=id;if(type==='chart')selectedChartId=id;if(type==='block')selectedBlockId=id;",
    " status('Selected '+type+' '+id);",
    "}",
    "function findByData(attribute,value){return [...frame.contentDocument.querySelectorAll('['+attribute+']')].find(node=>node.getAttribute(attribute)===value);}",
    "async function patchDraft(patch){await api('/api/draft',{method:'PATCH',body:JSON.stringify(patch)});await loadArtifact();status('Draft saved');}",
    "document.querySelector('[data-action=edit]').addEventListener('click',()=>{editing=!editing;if(editing)activateEditableNodes();else loadArtifact();status(editing?'Editing':'Ready');});",
    "document.querySelector('[data-action=undo]').addEventListener('click',async()=>{await api('/api/undo',{method:'POST'});await loadArtifact();});",
    "document.querySelector('[data-action=redo]').addEventListener('click',async()=>{await api('/api/redo',{method:'POST'});await loadArtifact();});",
    "document.querySelector('[data-action=save]').addEventListener('click',async()=>{const response=await api('/api/versions',{method:'POST',body:JSON.stringify({message:'Editor save'})});const version=await response.json();lastVersionId=version.versionId;status('Saved '+version.versionId.slice(0,8));});",
    "document.querySelector('[data-action=versions]').addEventListener('click',async()=>{const versions=await (await api('/api/versions')).json();if(versions.length)lastVersionId=versions.at(-1).versionId;status(versions.length+' saved version'+(versions.length===1?'':'s'));});",
    "document.querySelector('[data-action=image]').addEventListener('click',()=>{if(!selectedImageId){status('Select an image first');return;}document.querySelector('[data-image-input]').click();});",
    "document.querySelector('[data-image-input]').addEventListener('change',event=>{const file=event.target.files[0];if(!file)return;const reader=new FileReader();reader.addEventListener('load',()=>patchDraft({type:'replaceImage',imageId:selectedImageId,value:reader.result}).catch(error=>status(error.message)),{once:true});reader.readAsDataURL(file);event.target.value='';});",
    "document.querySelector('[data-action=chart]').addEventListener('click',async()=>{if(!selectedChartId){status('Select a chart first');return;}const script=findByData('data-chart-data-for',selectedChartId);const value=prompt('Edit chart JSON',script?script.textContent.trim():'{}');if(value===null)return;try{await patchDraft({type:'replaceChartData',chartId:selectedChartId,value:JSON.parse(value)});}catch(error){status(error.message);}});",
    "for(const [action,direction] of [['block-up','up'],['block-down','down']])document.querySelector('[data-action='+action+']').addEventListener('click',()=>{if(!selectedBlockId){status('Select a block first');return;}patchDraft({type:'moveBlock',blockId:selectedBlockId,direction}).catch(error=>status(error.message));});",
    "document.querySelector('[data-action=block-copy]').addEventListener('click',()=>{if(!selectedBlockId){status('Select a block first');return;}const suffix='-copy-'+Date.now().toString(36);patchDraft({type:'duplicateBlock',blockId:selectedBlockId,newBlockId:selectedBlockId+suffix,idSuffix:suffix}).catch(error=>status(error.message));});",
    "document.querySelector('[data-action=block-delete]').addEventListener('click',()=>{if(!selectedBlockId){status('Select a block first');return;}if(!confirm('Delete selected block?'))return;patchDraft({type:'deleteBlock',blockId:selectedBlockId}).catch(error=>status(error.message));});",
    "document.querySelector('[data-action=theme]').addEventListener('click',async()=>{const choices=mode==='evidence-first'?['editorial-light','editorial-dark']:['tech-dark','consulting-light'];currentTheme=choices[(choices.indexOf(currentTheme)+1)%choices.length];await api('/api/theme',{method:'POST',body:JSON.stringify({theme:currentTheme})});await loadArtifact();status('Theme '+currentTheme);});",
    "document.querySelector('[data-action=publish]').addEventListener('click',async()=>{if(!lastVersionId){status('Save or select a version first');return;}const response=await api('/api/publish?version='+encodeURIComponent(lastVersionId));const blob=await response.blob();const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='report-'+lastVersionId+'.html';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),0);status('Downloaded saved version');});",
    "loadArtifact().catch(error=>status(error.message));",
    "</script>",
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
