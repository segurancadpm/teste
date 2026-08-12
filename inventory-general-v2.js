// DPM — Inventário Geral v2
// Fonte única para Armazém + Orçamento. Sem dependências dos módulos antigos.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DB_DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente", "Portes"];
let data = null;
let family = "EPI";
let open = false;

const db = () => getFirestore(getApp());
const ref = () => doc(db(), "appdata", DB_DOC);
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const num = v => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const money = v => new Intl.NumberFormat("pt-PT", {style:"currency", currency:"EUR"}).format(num(v));
const isSuper = () => !!document.querySelector('.bottom-nav [data-page="budget"]');

function ensureShape() {
  data.budget ||= {};
  data.budget.management ||= {};
  data.budget.management.planning ||= {};
  data.stocks ||= {};
  data.warehouses ||= ["DPM Norte", "DPM Sul", "DPM Algarve"];
  data.matriz ||= [];
  data.epiModels ||= {};
  data.budget.inventoryCatalog ||= { families:{} };
  data.budget.inventoryCatalog.families ||= {};
  FAMILIES.forEach(f => data.budget.inventoryCatalog.families[f] ||= []);
}
function items(f=family){ return data.budget.inventoryCatalog.families[f] || []; }
function active(f){ return items(f).filter(x => x.active !== false); }
function models(epi){ return Array.isArray(data.epiModels[epi]) ? data.epiModels[epi] : []; }

function catalogExisting(){
  ensureShape();
  const seen = new Set(FAMILIES.flatMap(f => items(f).map(x => `${f}|${norm(x.name)}`)));
  const add = (f, name, source) => {
    const clean = String(name ?? "").trim();
    const key = `${f}|${norm(clean)}`;
    if (!clean || seen.has(key)) return;
    items(f).push({ id:`INV-${Date.now()}-${Math.random().toString(16).slice(2)}`, name:clean, active:true, source });
    seen.add(key);
  };
  data.matriz.forEach(x => add("EPI", x?.nome, "core"));
  Object.values(data.stocks).forEach(s => Object.keys(s || {}).forEach(n => add("EPI", n, "stock")));
  const old = data.budget.familyCatalog || {};
  FAMILIES.forEach(f => (Array.isArray(old[f]) ? old[f] : []).forEach(x => add(f, x?.name, "legacy")));
  Object.entries(data.budget.management.planning || {}).forEach(([name, x]) => add(FAMILIES.includes(x?.family) ? x.family : "EPI", name, "planning"));
  (Array.isArray(data.budget.management.purchases) ? data.budget.management.purchases : []).forEach(p => add(FAMILIES.includes(p?.family) ? p.family : "EPI", p?.product, "purchase"));
  data.budget.inventoryCatalog.version = 5;
  data.budget.inventoryCatalog.initialized = true;
}
function syncBudget(){
  const p = data.budget.management.planning;
  const allowed = new Map();
  FAMILIES.forEach(f => active(f).forEach(x => allowed.set(norm(x.name), {name:x.name, family:f})));
  Object.keys(p).forEach(name => { if (!allowed.has(norm(name))) delete p[name]; });
  allowed.forEach(v => { p[v.name] ||= {unitPrice:0, authorizedQty:0, family:v.family}; p[v.name].family=v.family; });
}
async function save(){ syncBudget(); await setDoc(ref(), {budget:data.budget, matriz:data.matriz, stocks:data.stocks, epiModels:data.epiModels}, {merge:true}); }

function filterOperations(){
  const allowed = new Set(active("EPI").map(x => norm(x.name)));
  document.querySelectorAll('select[name="epi"]').forEach(s => [...s.options].forEach(o => { if (o.value) o.hidden = !allowed.has(norm(o.value)); }));
  if (document.querySelector('.screen-title h1')?.textContent?.trim() === "Armazém") {
    document.querySelectorAll('main table tbody tr').forEach(r => { const n=norm(r.querySelector('td:first-child')?.textContent); if(n) r.style.display=allowed.has(n)?"":"none"; });
  }
}

function render(){
  const root=document.getElementById("modal-root"); if(!root) return;
  const rows=items();
  root.innerHTML=`<div class="modal-overlay" data-ig-overlay><div class="modal" style="max-width:980px;max-height:92vh;overflow:auto"><div class="modal-head"><div><h2>Inventário Geral</h2><p class="meta">Uma única listagem para Armazém e Orçamento.</p></div><button type="button" class="icon-btn" data-ig-close>×</button></div><div class="family-tabs">${FAMILIES.map(f=>`<button type="button" class="ghost-btn ${family===f?'active':''}" data-family="${f}">${f}</button>`).join("")}</div><section style="margin-top:14px"><div class="section-head"><div><h3>${family}</h3><p class="meta">${active(family).length} ativos · ${rows.length} total</p></div></div><div class="table-wrap"><table class="budget-table"><thead><tr><th>Artigo</th><th>Estado</th><th>Preço</th><th>${family==='EPI'?'Modelos':'Gestão'}</th><th>Ação</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td><strong>${esc(x.name)}</strong><br><span class="meta">${esc(x.source||'inventário')}</span></td><td><span class="badge ${x.active===false?'danger':'ok'}">${x.active===false?'Inativo':'Ativo'}</span></td><td>${money(data.matriz.find(e=>norm(e.nome)===norm(x.name))?.preco || data.budget.management.planning?.[x.name]?.unitPrice || 0)}</td><td>${family==='EPI'?`<button type="button" class="ghost-btn" data-models="${i}">${models(x.name).filter(m=>m.ativo!==false).length} modelo(s)</button>`:'<span class="meta">Catálogo geral</span>'}</td><td><button type="button" class="danger-link" data-toggle="${i}">${x.active===false?'Ativar':'Desativar'}</button></td></tr>`).join("")||'<tr><td colspan="5">Sem artigos.</td></tr>'}</tbody></table></div></section><section style="margin-top:18px;border-top:1px solid var(--line);padding-top:18px"><h3>Adicionar ao inventário</h3><div class="field-row two"><input class="input" id="ig-name" placeholder="Nome do artigo"><input class="input" id="ig-price" type="number" min="0" step="0.01" placeholder="Preço de referência (€)"></div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button type="button" class="primary-btn" data-add>+ Adicionar</button></div></section></div></div>`;
  root.querySelector('[data-ig-close]').onclick=()=>{open=false;root.innerHTML=""};
  root.querySelector('[data-ig-overlay]').onclick=e=>{if(e.target===e.currentTarget){open=false;root.innerHTML=""}};
  root.querySelectorAll('[data-family]').forEach(b=>b.onclick=()=>{family=b.dataset.family;render();});
  root.querySelector('[data-add]').onclick=addItem;
  root.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>toggleItem(Number(b.dataset.toggle)));
  root.querySelectorAll('[data-models]').forEach(b=>b.onclick=()=>showModels(Number(b.dataset.models)));
}
async function addItem(){
  const root=document.getElementById("modal-root");
  const name=root?.querySelector('#ig-name')?.value.trim() || "";
  const price=num(root?.querySelector('#ig-price')?.value);
  if(!name) return alert("Indica o nome do artigo.");
  if(items().some(x=>norm(x.name)===norm(name))) return alert("Esse artigo já existe nesta família.");
  items().push({id:`INV-${Date.now()}`,name,active:true,source:"manual"});
  if(family === "EPI"){
    let epi=data.matriz.find(x=>norm(x.nome)===norm(name));
    if(!epi){ epi={nome:name,riscos:"",meses:12,preco:price}; data.matriz.push(epi); }
    else if(price) epi.preco=price;
    data.warehouses.forEach(w=>{data.stocks[w] ||= {}; data.stocks[w][name] ||= {loose:0,sizes:{}};});
  }
  try { await save(); render(); } catch(e) { alert(`Não foi possível adicionar o artigo.\n\n${e.message||e}`); }
}
async function toggleItem(i){ const x=items()[i]; if(!x)return; const old=x.active!==false; x.active=!old; try{await save();render();}catch(e){x.active=old;alert(`Não foi possível alterar o artigo.\n\n${e.message||e}`);} }
function showModels(i){
  const epi=items("EPI")[i]; if(!epi)return; const list=models(epi.name); const root=document.getElementById("modal-root");
  root.innerHTML=`<div class="modal-overlay"><div class="modal" style="max-width:760px"><div class="modal-head"><div><h2>Modelos — ${esc(epi.name)}</h2><p class="meta">Modelo fica registado na entrega e determina o custo/baixa.</p></div><button class="icon-btn" data-back>×</button></div><div class="table-wrap"><table class="budget-table"><thead><tr><th>Modelo</th><th>Preço</th><th>Tamanhos</th><th></th></tr></thead><tbody>${list.map((m,i)=>`<tr><td>${esc(m.nome)}</td><td>${money(m.preco)}</td><td>${esc((m.tamanhos||[]).join(", "))}</td><td><button class="danger-link" data-del="${i}">Apagar</button></td></tr>`).join("")||'<tr><td colspan="4">Ainda não existem modelos.</td></tr>'}</tbody></table></div><section style="margin-top:18px"><h3>Novo modelo</h3><div class="field-row two"><input class="input" id="m-name" placeholder="Modelo"><input class="input" id="m-price" type="number" min="0" step="0.01" placeholder="Preço (€)"></div><div class="field-row"><input class="input" id="m-sizes" placeholder="Tamanhos: 40, 41, 42"></div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="primary-btn" data-m-add>+ Adicionar modelo</button></div></section></div></div>`;
  root.querySelector('[data-back]').onclick=render;
  root.querySelector('[data-m-add]').onclick=async()=>{const name=root.querySelector('#m-name').value.trim(),price=num(root.querySelector('#m-price').value),sizes=root.querySelector('#m-sizes').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);if(!name)return alert("Indica o modelo.");data.epiModels[epi.name] ||= [];if(data.epiModels[epi.name].some(m=>norm(m.nome)===norm(name)))return alert("Esse modelo já existe.");data.epiModels[epi.name].push({id:`MODEL-${Date.now()}`,nome:name,preco:price,tamanhos:sizes,ativo:true});try{await save();showModels(i);}catch(e){alert(`Não foi possível guardar o modelo.\n\n${e.message||e}`);}};
  root.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{const i=Number(b.dataset.del);if(!confirm(`Apagar o modelo "${list[i]?.nome||""}"?`))return;const backup=[...list];list.splice(i,1);try{await save();showModels(i);}catch(e){data.epiModels[epi.name]=backup;alert(`Não foi possível apagar o modelo.\n\n${e.message||e}`);}});
}
async function openManager(){if(open)return;open=true;try{await load();render();}catch(e){open=false;alert(`Não foi possível abrir o Inventário Geral.\n\n${e.message||e}`);}}
function inject(){if(!isSuper())return;const page=document.querySelector('.screen-title h1')?.textContent?.trim();if(page!=="Armazém"&&page!=="Orçamento")return;if(document.querySelector('[data-open-inventario-geral]'))return;const target=document.querySelector('main .section-head')||document.querySelector('.screen-title');if(!target)return;const b=document.createElement('button');b.type='button';b.className='ghost-btn';b.dataset.openInventarioGeral='1';b.textContent='▦ Inventário Geral';b.onclick=e=>{e.preventDefault();e.stopPropagation();openManager();};target.prepend(b);}
function start(){new MutationObserver(()=>{filterOperations();inject();}).observe(document.body,{childList:true,subtree:true});setTimeout(async()=>{try{await load();await save();filterOperations();inject();}catch(e){console.warn('Inventário Geral',e);}},300);}
start();
