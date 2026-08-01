export function renderEditorShell({ variant, themes }) {
  const themeGroups = [
    ["light", "浅色配色"],
    ["dark", "深色配色"]
  ]
    .map(
      ([appearance, label]) =>
        `<section class="theme-group"><strong>${label}</strong><div>` +
        themes
          .filter((theme) => theme.appearance === appearance)
          .map(
            (theme) =>
              `<button type="button" data-theme-id="${theme.themeId}" title="${theme.label}">` +
              `<i style="--swatch:${theme.tokens.accent};--canvas:${theme.tokens.canvas}"></i>` +
              `${theme.label}</button>`
          )
          .join("") +
        "</div></section>"
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><link rel="icon" href="data:,">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>编辑 HTML 报告</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:#172033;font:14px system-ui,sans-serif}
.toolbar{min-height:54px;display:flex;align-items:center;gap:7px;padding:8px 14px;background:#fff;border-bottom:1px solid #d8dee8;flex-wrap:wrap}
.toolbar button,.theme-panel button{border:1px solid #c7cfdb;background:#fff;border-radius:7px;padding:7px 10px;cursor:pointer}
.toolbar button:disabled{cursor:not-allowed;opacity:.42}.toolbar .push{margin-left:auto}.status{color:#526078;font-size:12px}
.theme-picker{position:relative}.theme-picker summary{list-style:none;border:1px solid #c7cfdb;background:#fff;border-radius:7px;padding:7px 10px;cursor:pointer}
.theme-picker summary::-webkit-details-marker{display:none}.theme-panel{position:absolute;right:0;top:40px;z-index:5;width:370px;padding:12px;background:#fff;border:1px solid #d8dee8;border-radius:10px;box-shadow:0 12px 36px #22324a33}
.theme-group+ .theme-group{margin-top:12px}.theme-group strong{display:block;margin-bottom:6px;color:#526078;font-size:12px}.theme-group div{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.theme-panel button{display:flex;align-items:center;gap:6px;padding:7px;font-size:12px;text-align:left}.theme-panel button[aria-pressed="true"]{border-color:#315efb;box-shadow:0 0 0 2px #315efb22}
.theme-panel i{width:18px;height:18px;flex:none;border-radius:50%;background:linear-gradient(135deg,var(--canvas) 50%,var(--swatch) 50%);border:1px solid #0002}
main{height:calc(100vh - 54px);padding:16px}iframe{width:100%;height:100%;border:0;background:#fff;box-shadow:0 8px 28px #22324a1f}
</style></head><body><header class="toolbar">
<button data-action="edit">编辑</button><button data-action="undo">撤销</button><button data-action="redo">重做</button>
<button data-action="save">保存版本</button><button data-action="versions">历史版本</button>
<button data-action="image">替换图片</button><button data-action="chart">编辑图表数据</button>
<button data-action="block-up">上移</button><button data-action="block-down">下移</button>
<button data-action="block-copy">复制</button><button data-action="block-delete">删除</button>
<input data-image-input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden>
<span class="status" data-status>准备就绪</span>
<details class="theme-picker push"><summary>配色</summary><div class="theme-panel">${themeGroups}</div></details>
<button data-action="publish" disabled>发布</button></header>
<main><iframe title="报告画布"></iframe></main>
<script>
const token=new URLSearchParams(location.search).get('token');
const frame=document.querySelector('iframe');const statusNode=document.querySelector('[data-status]');
const publishButton=document.querySelector('[data-action=publish]');
let currentTheme=${JSON.stringify(variant.themeId)};let lastVersionId=null;let editing=false;
let selectedImageId=null;let selectedChartId=null;let selectedBlockId=null;
function status(value){statusNode.textContent=value;}
function setPublishVersion(versionId){lastVersionId=versionId;publishButton.disabled=!versionId;}
function markUnsaved(){setPublishVersion(null);}
function markCurrentTheme(){for(const button of document.querySelectorAll('[data-theme-id]'))button.setAttribute('aria-pressed',String(button.dataset.themeId===currentTheme));}
async function api(path,options={}){const headers={authorization:'Bearer '+token,...(options.headers||{})};if(options.body)headers['content-type']='application/json';const response=await fetch(path,{...options,headers});if(!response.ok)throw new Error((await response.json()).error||'请求失败');return response;}
async function loadArtifact(){status('正在载入');frame.srcdoc=await(await api('/api/artifact')).text();await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));if(editing)activateEditableNodes();status(editing?'编辑中':'准备就绪');}
async function loadVersions(){const versions=await(await api('/api/versions')).json();setPublishVersion(versions.length?versions.at(-1).versionId:null);return versions;}
function activateEditableNodes(){const doc=frame.contentDocument;for(const node of doc.querySelectorAll('[data-edit-id]')){node.contentEditable='true';node.style.outline='1px dashed #4f6bed';node.addEventListener('blur',async()=>{status('正在保存草稿');await api('/api/draft',{method:'PATCH',body:JSON.stringify({type:'replaceText',editId:node.dataset.editId,value:node.textContent})});markUnsaved();status('草稿已保存');});}for(const node of doc.querySelectorAll('[data-image-id]'))node.addEventListener('click',event=>{event.preventDefault();selectTarget('image',node.dataset.imageId,node);});for(const node of doc.querySelectorAll('[data-chart-id]'))node.addEventListener('click',event=>{event.preventDefault();selectTarget('chart',node.dataset.chartId,node);});for(const node of doc.querySelectorAll('[data-block-id]'))node.addEventListener('click',event=>{if(event.target.closest('[data-image-id],[data-chart-id],[data-edit-id]'))return;selectTarget('block',node.dataset.blockId,node);});}
function selectTarget(type,id,node){for(const item of frame.contentDocument.querySelectorAll('[data-edit-selected]')){item.removeAttribute('data-edit-selected');item.style.boxShadow='';}node.dataset.editSelected='true';node.style.boxShadow='0 0 0 3px #4f6bed';if(type==='image')selectedImageId=id;if(type==='chart')selectedChartId=id;if(type==='block')selectedBlockId=id;status('已选择 '+id);}
function findByData(attribute,value){return [...frame.contentDocument.querySelectorAll('['+attribute+']')].find(node=>node.getAttribute(attribute)===value);}
async function patchDraft(patch){await api('/api/draft',{method:'PATCH',body:JSON.stringify(patch)});markUnsaved();await loadArtifact();status('草稿已保存');}
document.querySelector('[data-action=edit]').addEventListener('click',()=>{editing=!editing;if(editing)activateEditableNodes();else loadArtifact();status(editing?'编辑中':'准备就绪');});
document.querySelector('[data-action=undo]').addEventListener('click',async()=>{await api('/api/undo',{method:'POST'});markUnsaved();await loadArtifact();});
document.querySelector('[data-action=redo]').addEventListener('click',async()=>{await api('/api/redo',{method:'POST'});markUnsaved();await loadArtifact();});
document.querySelector('[data-action=save]').addEventListener('click',async()=>{const response=await api('/api/versions',{method:'POST',body:JSON.stringify({message:'编辑器保存'})});const version=await response.json();setPublishVersion(version.versionId);status('已保存 '+version.versionId.slice(0,8));});
document.querySelector('[data-action=versions]').addEventListener('click',async()=>{const versions=await loadVersions();status('共 '+versions.length+' 个已保存版本');});
document.querySelector('[data-action=image]').addEventListener('click',()=>{if(!selectedImageId){status('请先选择图片');return;}document.querySelector('[data-image-input]').click();});
document.querySelector('[data-image-input]').addEventListener('change',event=>{const file=event.target.files[0];if(!file)return;const reader=new FileReader();reader.addEventListener('load',()=>patchDraft({type:'replaceImage',imageId:selectedImageId,value:reader.result}).catch(error=>status(error.message)),{once:true});reader.readAsDataURL(file);event.target.value='';});
document.querySelector('[data-action=chart]').addEventListener('click',async()=>{if(!selectedChartId){status('请先选择图表');return;}const script=findByData('data-chart-data-for',selectedChartId);const value=prompt('编辑图表 JSON',script?script.textContent.trim():'{}');if(value===null)return;try{await patchDraft({type:'replaceChartData',chartId:selectedChartId,value:JSON.parse(value)});}catch(error){status(error.message);}});
for(const [action,direction] of [['block-up','up'],['block-down','down']])document.querySelector('[data-action='+action+']').addEventListener('click',()=>{if(!selectedBlockId){status('请先选择区块');return;}patchDraft({type:'moveBlock',blockId:selectedBlockId,direction}).catch(error=>status(error.message));});
document.querySelector('[data-action=block-copy]').addEventListener('click',()=>{if(!selectedBlockId){status('请先选择区块');return;}const suffix='-copy-'+Date.now().toString(36);patchDraft({type:'duplicateBlock',blockId:selectedBlockId,newBlockId:selectedBlockId+suffix,idSuffix:suffix}).catch(error=>status(error.message));});
document.querySelector('[data-action=block-delete]').addEventListener('click',()=>{if(!selectedBlockId){status('请先选择区块');return;}if(!confirm('删除所选区块？'))return;patchDraft({type:'deleteBlock',blockId:selectedBlockId}).catch(error=>status(error.message));});
for(const button of document.querySelectorAll('[data-theme-id]'))button.addEventListener('click',async()=>{currentTheme=button.dataset.themeId;await api('/api/theme',{method:'POST',body:JSON.stringify({themeId:currentTheme})});markCurrentTheme();markUnsaved();await loadArtifact();status('配色：'+button.textContent.trim());});
publishButton.addEventListener('click',async()=>{if(!lastVersionId)return;const response=await api('/api/publish?version='+encodeURIComponent(lastVersionId));const blob=await response.blob();const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='report-'+lastVersionId+'.html';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),0);status('已下载保存版本');});
markCurrentTheme();Promise.all([loadArtifact(),loadVersions()]).catch(error=>status(error.message));
</script></body></html>`;
}
