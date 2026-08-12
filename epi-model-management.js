// DPM — Gestão complementar de modelos de EPI
// Extra exclusivo do SuperAdmin. Não altera o core de entrega.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ref = () => doc(getFirestore(getApp()), "appdata", "dpm_epi_data_v1");
const state = { data:null, observer:null, opening:false };
const num = v => { const n=Number(String(v ?? "").replace(",",".")); return Number.isFinite(n)?n:0; };
const norm = v => String(v ?? "").trim().toUpperCase();
const esc = v => String(v ?? "").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const money = v => new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"}).format(num(v));

async function load(){
  const snap=await getDoc(ref());
  if(!snap.exists()) throw new Error("Não foi encontrado o registo principal de EPI.");
  state.data=snap.data();
  state.data.epiModels ||= {};
  state.data.modelStock ||= {};
  const matriz=Array.isArray(state.data.matriz)?state.data.matriz:[];
  matriz.forEach(x=>{ if(!Array.isArray(state.data.epiModels[x.nome])) state.data.epiModels[x.nome]=[]; });
  return state.data;
}
async function save(){ if(state.data) await setDoc(ref(),{epiModels:state.data.epiModels,modelStock:state.data.modelStock},{merge:true}); }
const epis=()=>Array.isArray(state.data?.matriz)?state.data.matriz:[];
const models=name=>Array.isArray(state.data?.epiModels?.[name])?state.data.epiModels[name]:[];
function isSuperAdmin(){ return !!document.querySelector('.bottom-nav [data-page="budget"]'); }
function warehouseFromWorkerPage(){ const text=document.querySelector('.detail-header .meta')?.textContent||""; const p=text.split("·").map(x=>x.trim()).filter(Boolean); return p.at(-1)||""; }
function modelStock(wh,epi,model){ return state.data?.modelStock?.[wh]?.[epi]?.[model]||{loose:0,sizes:{}}; }
function modelTotal(wh,epi,model){ const s=modelStock(wh,epi,model); return num(s.loose)+Object.values(s.sizes||{}).reduce((a,b)=>a+num(b),0); }
function modelPrice(epi,model){ const m=models(epi).find(x=>norm(x.nome)===norm(model)); return num(m?.preco??epis().find(x=>x.nome===epi)?.preco); }
function modelOptions(wh,epi){ const list=models(epi).filter(x=>x.ativo!==false); return list.length?`<option value="">Selecionar modelo</option>${list.map(m=>`<option value="${esc(m.nome)}">${esc(m.nome)}${modelTotal(wh,epi,m.nome)?` · ${modelTotal(wh,epi,m.nome)} em stock`:""}</option>`).join("")}`:'<option value="">Sem modelo configurado</option>'; }
function modelSizeOptions(wh,epi,model){ const m=models(epi).find(x=>norm(x.nome)===norm(model)); const s=modelStock(wh,epi,model); const sizes=[...new Set([...(m?.tamanhos||[]).map(norm),...Object.keys(s.sizes||{}).map(norm)])].sort((a,b)=>a.localeCompare(b,"pt-PT",{numeric:true})); return `<option value="">Sem tamanho</option>${sizes.map(x=>`<option value="${esc(x)}">${esc(x)}${s.sizes?.[x]!==undefined?` (${num(s.sizes[x])})`:""}</option>`).join("")}`; }

function modalEl(){ return document.getElementById("dpm-model-manager-modal"); }
function closeManager(){ modalEl()?.remove(); }
function renderManager(){
  closeManager();
  const overlay=document.createElement("div"); overlay.id="dpm-model-manager-modal"; overlay.className="modal-overlay"; overlay.style.zIndex="9999";
  const groups=epis().map(epi=>{ const list=models(epi.nome); return `<section class="section" style="margin-bottom:12px;padding:14px"><div class="section-head"><h3>${esc(epi.nome)}</h3><span class="meta">${list.length} modelo(s)</span></div>${list.map((m,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line)"><div><strong>${esc(m.nome)}</strong><div class="meta">${money(m.preco)}${m.tamanhos?.length?` · ${esc(m.tamanhos.join(", "))}`:""}</div></div><button type="button" class="danger-btn" data-mm-delete="1" data-epi="${esc(epi.nome)}" data-index="${i}">Apagar</button></div>`).join("")||`<div class="meta">Ainda não existem modelos.</div>`}</section>`;}).join("");
  overlay.innerHTML=`<div class="modal" role="dialog" aria-modal="true" style="max-width:760px;max-height:90vh;overflow:auto"><div class="modal-head"><h2>Modelos de EPI</h2><button type="button" class="icon-btn" data-mm-close>×</button></div><p class="meta" style="margin-bottom:14px">Cada modelo é usado na entrega para registar o consumo e o custo correto.</p>${groups||'<div class="empty">Não existem EPI no catálogo.</div>'}<section class="section" style="padding:14px;margin-top:14px"><div class="section-head"><h3>Novo modelo</h3></div><div class="field-row"><select class="select" id="mm-epi"><option value="">Escolher EPI</option>${epis().map(x=>`<option value="${esc(x.nome)}">${esc(x.nome)}</option>`).join("")}</select></div><div class="field-row two"><input class="input" id="mm-name" placeholder="Modelo"><input class="input" id="mm-price" type="number" min="0" step="0.01" placeholder="Preço unitário (€)"></div><div class="field-row"><input class="input" id="mm-sizes" placeholder="Tamanhos/variantes: 40, 41, 42, 43"></div><div style="display:flex;justify-content:flex-end"><button type="button" class="primary-btn" id="mm-create">+ Criar modelo</button></div></section></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-mm-close]').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeManager();});
  overlay.addEventListener('click',e=>{if(e.target===overlay){e.preventDefault();e.stopPropagation();closeManager();}});
  overlay.querySelector('#mm-create').addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();await createModel();});
  overlay.querySelectorAll('[data-mm-delete]').forEach(btn=>btn.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();await deleteModel(btn);}));
}
async function openManager(){ if(state.opening||!isSuperAdmin()) return; state.opening=true; try{await load(); renderManager();}catch(err){console.error(err);alert(`Não foi possível abrir Modelos EPI.\n\n${err.message||err}`);}finally{state.opening=false;} }
async function createModel(){
  const epi=document.getElementById('mm-epi')?.value||""; const name=document.getElementById('mm-name')?.value.trim()||""; const price=num(document.getElementById('mm-price')?.value); const sizes=(document.getElementById('mm-sizes')?.value||"").split(',').map(norm).filter(Boolean);
  if(!epi){alert('Escolhe primeiro o EPI.');return;} if(!name){alert('Indica o nome do modelo.');return;}
  try{await load(); state.data.epiModels[epi] ||= []; if(state.data.epiModels[epi].some(x=>norm(x.nome)===norm(name))){alert('Esse modelo já existe para este EPI.');return;} state.data.epiModels[epi].push({id:`MODEL-${Date.now()}`,nome:name,preco:price,tamanhos:sizes,ativo:true}); await save(); await load(); renderManager();}catch(err){console.error(err);alert(`Não foi possível guardar o modelo.\n\n${err.message||err}`);}
}
async function deleteModel(btn){ const epi=btn.dataset.epi; const index=Number(btn.dataset.index); try{await load(); const list=models(epi); if(!list[index])return; if(!confirm(`Apagar o modelo "${list[index].nome}"? O histórico de entregas não será apagado.`))return; list.splice(index,1); state.data.epiModels[epi]=list; await save(); await load(); renderManager();}catch(err){console.error(err);alert(`Não foi possível apagar o modelo.\n\n${err.message||err}`);} }

function injectButton(){
  if(!isSuperAdmin()) return;
  const heads=[...document.querySelectorAll('.section-head')];
  const head=heads.find(x=>x.querySelector('h2')?.textContent?.trim().startsWith('Inventário'));
  if(!head||head.querySelector('[data-model-manager]')) return;
  const b=document.createElement('button'); b.type='button'; b.className='ghost-btn'; b.dataset.modelManager='1'; b.textContent='⚙ Modelos EPI'; head.appendChild(b);
  b.addEventListener('click',e=>{ e.preventDefault(); e.stopImmediatePropagation(); openManager(); },true);
}
function enhanceDelivery(){
  const form=document.querySelector('form[data-form="delivery"]'); if(!form||form.dataset.modelEnhanced==='1')return; form.dataset.modelEnhanced='1';
  const decorate=item=>{ if(item.dataset.modelDone==='1')return; const epi=item.querySelector('[name="epi"]'), size=item.querySelector('[name="tamanho"]'); if(!epi||!size)return; item.dataset.modelDone='1'; const row=size.closest('.field-row'); if(!row)return; const wrap=document.createElement('div'); wrap.className='field-row'; wrap.innerHTML=`<label style="display:grid;gap:6px"><span class="meta">Modelo (quando aplicável)</span><select class="select" name="modelo">${modelOptions(warehouseFromWorkerPage(),epi.value)}</select></label>`; row.parentElement?.insertBefore(wrap,row); const model=wrap.querySelector('[name="modelo"]'); const refresh=()=>{size.innerHTML=model.value?modelSizeOptions(warehouseFromWorkerPage(),epi.value,model.value):'<option value="">Escolher modelo primeiro</option>';}; model?.addEventListener('change',refresh); refresh(); epi.addEventListener('change',()=>{model.innerHTML=modelOptions(warehouseFromWorkerPage(),epi.value);refresh();}); };
  form.querySelectorAll('.delivery-item').forEach(decorate); const target=form.querySelector('#delivery-items')||form; new MutationObserver(()=>form.querySelectorAll('.delivery-item').forEach(decorate)).observe(target,{childList:true,subtree:true});
}
function start(){ state.observer=new MutationObserver(()=>{if(!modalEl()){injectButton();enhanceDelivery();}}); state.observer.observe(document.body,{childList:true,subtree:true}); injectButton(); enhanceDelivery(); }
start();