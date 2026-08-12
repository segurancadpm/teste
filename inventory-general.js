// DPM — Inventário Geral
// Uma única catalogação usada pelo Armazém e pelo Orçamento.
// O core de entrega permanece em app.js.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DOC="dpm_epi_data_v1";
const FAMILIES=["EPI","Equipamento","Ambiente","Portes"];
const state={data:null,open:false,family:"EPI",busy:false};
const ref=()=>doc(getFirestore(getApp()),"appdata",DOC);
const norm=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const num=v=>{const n=Number(String(v??"").replace(",","."));return Number.isFinite(n)?n:0;};
const money=v=>new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"}).format(num(v));

function isSuper(){return !!document.querySelector('.bottom-nav [data-page="budget"]');}
function catalog(){return state.data?.budget?.inventoryCatalog?.families||Object.fromEntries(FAMILIES.map(f=>[f,[]]));}
function items(f=state.family){return Array.isArray(catalog()[f])?catalog()[f]:[];}
function active(f){return items(f).filter(x=>x.active!==false);}
function activeNames(f){return new Set(active(f).map(x=>norm(x.name)));}

async function load(){
  const snap=await getDoc(ref());
  if(!snap.exists())throw new Error("Não foi encontrado o registo principal de dados.");
  state.data=snap.data();
  state.data.budget ||= {};
  state.data.budget.management ||= {};
  state.data.budget.management.planning ||= {};
  state.data.stocks ||= {};
  state.data.warehouses ||= ["DPM Norte","DPM Sul","DPM Algarve"];
  state.data.matriz ||= [];
  migrateExisting();
  await save();
}

function migrateExisting(){
  const b=state.data.budget;
  const old=b.familyCatalog&&typeof b.familyCatalog==="object"?b.familyCatalog:{};
  if(!b.inventoryCatalog||typeof b.inventoryCatalog!=="object")b.inventoryCatalog={families:{}};
  const c=b.inventoryCatalog.families||{};
  FAMILIES.forEach(f=>{if(!Array.isArray(c[f]))c[f]=[];});
  const seen=new Map();
  FAMILIES.forEach(f=>c[f].forEach(x=>{const k=norm(x?.name);if(k)seen.set(`${f}|${k}`,x);}));
  const add=(family,name,source)=>{const clean=String(name??"").trim(),k=norm(clean);if(!clean||!k||seen.has(`${family}|${k}`))return;const x={id:`INV-${Date.now()}-${Math.random().toString(16).slice(2,7)}`,name:clean,active:true,source};c[family].push(x);seen.set(`${family}|${k}`,x);};
  (Array.isArray(state.data.matriz)?state.data.matriz:[]).forEach(e=>add("EPI",e?.nome,"core"));
  Object.values(state.data.stocks||{}).forEach(stock=>Object.keys(stock||{}).forEach(name=>add("EPI",name,"stock")));
  FAMILIES.forEach(f=>(Array.isArray(old[f])?old[f]:[]).forEach(x=>add(f,x?.name,x?.source||"legacy")));
  const planning=state.data.budget.management.planning||{};
  Object.entries(planning).forEach(([name,x])=>add(FAMILIES.includes(x?.family)?x.family:"EPI",name,"planning"));
  (Array.isArray(state.data.budget.management.purchases)?state.data.budget.management.purchases:[]).forEach(p=>add(FAMILIES.includes(p?.family)?p.family:"EPI",p?.product,"purchase"));
  b.inventoryCatalog.families=c;
  b.inventoryCatalog.version=3;
  b.inventoryCatalog.initialized=true;
  b.inventoryCatalog.updatedAt=new Date().toISOString();
}

function syncBudget(){
  const p=state.data.budget.management.planning||{};
  const c=catalog();
  const activeMap=new Map();
  FAMILIES.forEach(f=>active(f).forEach(x=>activeMap.set(norm(x.name),{name:x.name,family:f})));
  Object.keys(p).forEach(name=>{if(!activeMap.has(norm(name)))delete p[name];});
  activeMap.forEach((v,k)=>{if(!p[v.name])p[v.name]={unitPrice:0,authorizedQty:0,family:v.family};else p[v.name].family=v.family;});
}

async function save(){syncBudget();await setDoc(ref(),{budget:state.data.budget},{merge:true});}

function stockAllowed(){return activeNames("EPI");}
function filterStock(){
  if(document.querySelector('.screen-title h1')?.textContent?.trim()!=="Armazém")return;
  const allowed=stockAllowed();
  document.querySelectorAll('main table tbody tr').forEach(row=>{const name=norm(row.querySelector('td:first-child')?.textContent);if(name)row.style.display=allowed.has(name)?"":"none";});
}
function filterHomeStock(){
  const allowed=stockAllowed();
  document.querySelectorAll('section.section').forEach(section=>{if(!section.querySelector('h2')?.textContent.includes('Matriz Consolidada de Stocks'))return;section.querySelectorAll('tbody tr').forEach(row=>{const name=norm(row.querySelector('td:first-child')?.textContent);if(name)row.style.display=allowed.has(name)?"":"none";});});
}
function filterBudget(){
  const allowed=new Set(FAMILIES.flatMap(f=>active(f).map(x=>norm(x.name))));
  document.querySelectorAll('.budget-table tbody tr').forEach(row=>{const name=norm(row.querySelector('td:first-child')?.textContent);const isPlan=!!row.querySelector('[data-plan-price],[data-plan-qty],.budget-status');if(isPlan&&name)row.style.display=allowed.has(name)?"":"none";});
}
function filterDelivery(){
  const allowed=stockAllowed();
  document.querySelectorAll('select[name="epi"]').forEach(sel=>{[...sel.options].forEach(o=>{if(o.value)o.hidden=!allowed.has(norm(o.value));});});
}

function modelCount(name){return Array.isArray(state.data?.epiModels?.[name])?state.data.epiModels[name].filter(x=>x?.ativo!==false).length:0;}
function modelBlock(item){if(state.family!=="EPI")return "—";return `${modelCount(item.name)} modelo(s)`;}

function render(){
  const root=document.getElementById("modal-root");if(!root)return;
  const rows=items();
  root.innerHTML=`<div class="modal-overlay" data-ig-overlay><div class="modal" role="dialog" aria-modal="true" style="max-width:920px;max-height:92vh;overflow:auto"><div class="modal-head"><div><h2>Inventário Geral</h2><p class="meta">Uma única listagem para Armazém e Orçamento.</p></div><button type="button" class="icon-btn" data-ig-close>×</button></div><div class="family-tabs">${FAMILIES.map(f=>`<button type="button" class="ghost-btn ${state.family===f?'active':''}" data-ig-family="${f}">${f}</button>`).join('')}</div><section style="margin-top:14px"><div class="section-head"><div><h3>${state.family}</h3><p class="meta">${active(state.family).length} ativos · ${rows.length} total</p></div><span class="badge blue">Fonte única</span></div><div class="table-wrap"><table class="budget-table"><thead><tr><th>Artigo</th><th>Estado</th><th>Preço ref.</th><th>${state.family==='EPI'?'Modelos':'Gestão'}</th><th></th></tr></thead><tbody>${rows.map((x,i)=>{const epi=state.data.matriz.find(e=>norm(e.nome)===norm(x.name));const price=epi?.preco??state.data.budget.management.planning?.[x.name]?.unitPrice??0;return `<tr><td><strong>${esc(x.name)}</strong><br><span class="meta">${esc(x.source||'inventário')}</span></td><td><span class="badge ${x.active===false?'danger':'ok'}">${x.active===false?'Inativo':'Ativo'}</span></td><td>${money(price)}</td><td>${state.family==='EPI'?`<span class="badge blue">${modelBlock(x)}</span>`:`<span class="meta">Catálogo geral</span>`}</td><td><button type="button" class="danger-link" data-ig-toggle="${i}">${x.active===false?'Ativar':'Desativar'}</button></td></tr>`;}).join('')||'<tr><td colspan="5">Sem artigos nesta família.</td></tr>'}</tbody></table></div></section><section style="margin-top:18px;border-top:1px solid var(--line);padding-top:18px"><div class="section-head"><div><h3>Adicionar ao inventário</h3><p class="meta">Ao adicionar um EPI, fica disponível no Armazém e no Orçamento.</p></div></div><div class="field-row two"><input class="input" id="ig-name" placeholder="Nome do artigo"><input class="input" id="ig-price" type="number" min="0" step="0.01" placeholder="Preço de referência (€)"></div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button type="button" class="primary-btn" data-ig-add>+ Adicionar</button></div></section><p class="meta" style="margin-top:12px">Desativar apenas retira o artigo das operações novas. O histórico mantém-se.</p></div></div>`;
  root.querySelector('[data-ig-close]')?.addEventListener('click',()=>root.innerHTML='');
  root.querySelector('[data-ig-overlay]')?.addEventListener('click',e=>{if(e.target===e.currentTarget)root.innerHTML='';});
  root.querySelectorAll('[data-ig-family]').forEach(b=>b.addEventListener('click',()=>{state.family=b.dataset.igFamily;render();}));
  root.querySelector('[data-ig-add]')?.addEventListener('click',addItem);
  root.querySelectorAll('[data-ig-toggle]').forEach(b=>b.addEventListener('click',()=>toggle(Number(b.dataset.igToggle))));
}

async function addItem(){
  const name=document.getElementById('ig-name')?.value.trim();const price=num(document.getElementById('ig-price')?.value);
  if(!name)return alert('Indica o nome do artigo.');
  if(items().some(x=>norm(x.name)===norm(name)))return alert('Esse artigo já existe nesta família.');
  const item={id:`INV-${Date.now()}`,name,active:true,source:'manual'};catalog()[state.family].push(item);
  if(state.family==='EPI'){
    let epi=state.data.matriz.find(x=>norm(x.nome)===norm(name));if(!epi){epi={nome:name,riscos:'',meses:12,preco:price};state.data.matriz.push(epi);}else if(price)epi.preco=price;
    state.data.warehouses.forEach(w=>{state.data.stocks[w] ||= {};if(typeof state.data.stocks[w][name]==='undefined')state.data.stocks[w][name]={loose:0,sizes:{}};});
  }
  await save();refresh();render();
}
async function toggle(i){const x=items()[i];if(!x)return;x.active=x.active===false;await save();refresh();render();}

function injectGeneralButton(){
  if(!isSuper())return;
  const title=document.querySelector('.screen-title h1')?.textContent?.trim();if(title!=="Armazém"&&title!=="Orçamento")return;
  if(document.querySelector('[data-open-inventario-geral]'))return;
  const target=document.querySelector('main .section-head')||document.querySelector('main .screen-title');if(!target)return;
  const b=document.createElement('button');b.type='button';b.className='ghost-btn';b.dataset.openInventarioGeral='1';b.textContent='▦ Inventário Geral';target.prepend(b);b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();open();},true);
}
function addWarehouseSummary(){
  if(!isSuper())return;if(document.querySelector('.screen-title h1')?.textContent?.trim()!=="Armazém")return;if(document.querySelector('[data-inventario-resumo]'))return;
  const main=document.querySelector('main'),section=document.createElement('section');section.className='section';section.dataset.inventarioResumo='1';
  section.innerHTML=`<div class="section-head"><div><h2>Inventário Geral</h2><p class="meta">Catálogo único · ${active('EPI').length} EPI · ${active('Equipamento').length} equipamentos</p></div><button type="button" class="ghost-btn" data-open-inventario-geral>Gerir inventário</button></div><div class="kpi-grid"><div class="kpi"><span>EPI catalogados</span><strong>${active('EPI').length}</strong></div><div class="kpi"><span>Equipamentos</span><strong>${active('Equipamento').length}</strong></div><div class="kpi"><span>Ambiente</span><strong>${active('Ambiente').length}</strong></div><div class="kpi"><span>Portes</span><strong>${active('Portes').length}</strong></div></div>`;
  const first=main?.querySelector('.section');if(first)first.insertAdjacentElement('beforebegin',section);else main?.appendChild(section);
  section.querySelector('[data-open-inventario-geral]')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();open();},true);
}
function open(){if(state.open||state.busy)return;state.open=true;state.busy=true;load().then(()=>render()).catch(e=>alert(`Não foi possível abrir o Inventário Geral.\n\n${e.message||e}`)).finally(()=>{state.busy=false;});}
function refresh(){if(!state.data)return;syncBudget();filterStock();filterHomeStock();filterBudget();filterDelivery();addWarehouseSummary();injectGeneralButton();}
function start(){const observer=new MutationObserver(()=>{refresh();});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>{load().then(refresh).catch(e=>console.warn('Inventário Geral',e));},250);}
start();
