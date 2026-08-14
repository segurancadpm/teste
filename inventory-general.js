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
function modelsFor(epi){return Array.isArray(state.data?.epiModels?.[epi])?state.data.epiModels[epi]:[];}

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
  state.data.epiModels ||= {};
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
  Object.entries(state.data.budget.management.planning||{}).forEach(([name,x])=>add(FAMILIES.includes(x?.family)?x.family:"EPI",name,"planning"));
  (Array.isArray(state.data.budget.management.purchases)?state.data.budget.management.purchases:[]).forEach(p=>add(FAMILIES.includes(p?.family)?p.family:"EPI",p?.product,"purchase"));
  b.inventoryCatalog.families=c;b.inventoryCatalog.version=4;b.inventoryCatalog.initialized=true;b.inventoryCatalog.updatedAt=new Date().toISOString();
}

function syncBudget(){
  const p=state.data.budget.management.planning||{},activeMap=new Map();
  FAMILIES.forEach(f=>active(f).forEach(x=>activeMap.set(norm(x.name),{name:x.name,family:f})));
  Object.keys(p).forEach(name=>{if(!activeMap.has(norm(name)))delete p[name];});
  activeMap.forEach(v=>{if(!p[v.name])p[v.name]={unitPrice:0,authorizedQty:0,family:v.family};else p[v.name].family=v.family;});
}
async function save(){syncBudget();await setDoc(ref(),{budget:state.data.budget,matriz:state.data.matriz,stocks:state.data.stocks,epiModels:state.data.epiModels},{merge:true});}

function filterStock(){if(document.querySelector('.screen-title h1')?.textContent?.trim()!=="Armazém")return;const allowed=new Set(active('EPI').map(x=>norm(x.name)));document.querySelectorAll('main table tbody tr').forEach(row=>{const name=norm(row.querySelector('td:first-child')?.textContent);if(name)row.style.display=allowed.has(name)?"":"none";});}
function filterHomeStock(){const allowed=new Set(active('EPI').map(x=>norm(x.name)));document.querySelectorAll('section.section').forEach(section=>{if(!section.querySelector('h2')?.textContent.includes('Matriz Consolidada de Stocks'))return;section.querySelectorAll('tbody tr').forEach(row=>{const name=norm(row.querySelector('td:first-child')?.textContent);if(name)row.style.display=allowed.has(name)?"":"none";});});}
function filterBudget(){const allowed=new Set(FAMILIES.flatMap(f=>active(f).map(x=>norm(x.name))));document.querySelectorAll('.budget-table tbody tr').forEach(row=>{const name=norm(row.querySelector('td:first-child')?.textContent);const isPlan=!!row.querySelector('[data-plan-price],[data-plan-qty],.budget-status');if(isPlan&&name)row.style.display=allowed.has(name)?"":"none";});}
function filterDelivery(){const allowed=new Set(active('EPI').map(x=>norm(x.name)));document.querySelectorAll('select[name="epi"]').forEach(sel=>{[...sel.options].forEach(o=>{if(o.value)o.hidden=!allowed.has(norm(o.value));});});}
function priceFor(epi){return num(state.data.matriz.find(x=>norm(x.nome)===norm(epi))?.preco||0);}

function render(){
  const root=document.getElementById("modal-root");if(!root)return;const rows=items();
  root.innerHTML=`<div class="modal-overlay" data-ig-overlay><div class="modal" role="dialog" aria-modal="true" style="max-width:980px;max-height:92vh;overflow:auto"><div class="modal-head"><div><h2>Inventário Geral</h2><p class="meta">Uma única listagem para Armazém e Orçamento.</p></div><button type="button" class="icon-btn" data-ig-close>×</button></div><div class="family-tabs">${FAMILIES.map(f=>`<button type="button" class="ghost-btn ${state.family===f?'active':''}" data-ig-family="${f}">${f}</button>`).join('')}</div><section style="margin-top:14px"><div class="section-head"><div><h3>${state.family}</h3><p class="meta">${active(state.family).length} ativos · ${rows.length} total</p></div><span class="badge blue">Fonte única</span></div><div class="table-wrap"><table class="budget-table"><thead><tr><th>Artigo</th><th>Estado</th><th>Preço ref.</th><th>${state.family==='EPI'?'Modelos':'Gestão'}</th><th>Ação</th></tr></thead><tbody>${rows.map((x,i)=>{const models=modelsFor(x.name);return `<tr><td><strong>${esc(x.name)}</strong><br><span class="meta">${esc(x.source||'inventário')}</span></td><td><span class="badge ${x.active===false?'danger':'ok'}">${x.active===false?'Inativo':'Ativo'}</span></td><td>${money(priceFor(x.name))}</td><td>${state.family==='EPI'?`<button type="button" class="ghost-btn" data-ig-models="${i}">${models.filter(m=>m.ativo!==false).length} modelo(s)</button>`:`<span class="meta">Catálogo geral</span>`}</td><td><button type="button" class="danger-link" data-ig-toggle="${i}">${x.active===false?'Ativar':'Desativar'}</button><button type="button" class="danger-link" data-ig-delete="${i}" style="margin-left:10px">Apagar definitivamente</button></td></tr>`;}).join('')||'<tr><td colspan="5">Sem artigos nesta família.</td></tr>'}</tbody></table></div></section><section style="margin-top:18px;border-top:1px solid var(--line);padding-top:18px"><div class="section-head"><div><h3>Adicionar ao inventário</h3><p class="meta">Um EPI novo passa a estar disponível no Armazém e no Orçamento.</p></div></div><div class="field-row two"><input class="input" id="ig-name" placeholder="Nome do artigo"><input class="input" id="ig-price" type="number" min="0" step="0.01" placeholder="Preço de referência (€)"></div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button type="button" class="primary-btn" data-ig-add>+ Adicionar</button></div></section></div></div>`;
  root.querySelector('[data-ig-close]')?.addEventListener('click',()=>{state.open=false;root.innerHTML=''});
  root.querySelector('[data-ig-overlay]')?.addEventListener('click',e=>{if(e.target===e.currentTarget){state.open=false;root.innerHTML=''}});
  root.querySelectorAll('[data-ig-family]').forEach(b=>b.addEventListener('click',()=>{state.family=b.dataset.igFamily;render();}));
  root.querySelector('[data-ig-add]')?.addEventListener('click',addItem);
  root.querySelectorAll('[data-ig-toggle]').forEach(b=>b.addEventListener('click',()=>toggle(Number(b.dataset.igToggle))));
  root.querySelectorAll('[data-ig-delete]').forEach(b=>b.addEventListener('click',()=>deleteItem(Number(b.dataset.igDelete))));
  root.querySelectorAll('[data-ig-models]').forEach(b=>b.addEventListener('click',()=>openModels(Number(b.dataset.igModels))));
}

async function addItem(){const name=document.getElementById('ig-name')?.value.trim();const price=num(document.getElementById('ig-price')?.value);if(!name)return alert('Indica o nome do artigo.');if(items().some(x=>norm(x.name)===norm(name)))return alert('Esse artigo já existe nesta família.');catalog()[state.family].push({id:`INV-${Date.now()}`,name,active:true,source:'manual'});if(state.family==='EPI'){let epi=state.data.matriz.find(x=>norm(x.nome)===norm(name));if(!epi){epi={nome:name,riscos:'',meses:12,preco:price};state.data.matriz.push(epi);}else if(price)epi.preco=price;state.data.warehouses.forEach(w=>{state.data.stocks[w] ||= {};if(typeof state.data.stocks[w][name]==='undefined')state.data.stocks[w][name]={loose:0,sizes:{}};});}await save();render();}
async function toggle(i){const x=items()[i];if(!x)return;x.active=x.active===false;await save();render();}

async function deleteItem(i){
  const x=items()[i];
  if(!x)return;
  const name=String(x.name||"").trim();
  if(!name)return;
  if(!confirm(`Apagar definitivamente "${name}"?\n\nO artigo será removido do Inventário Mestre, matriz, stocks, modelos e orçamento.\n\nAs entregas históricas permanecem para auditoria.\n\nEsta ação não pode ser desfeita.`))return;
  if(state.busy)return;
  state.busy=true;
  try{
    const current=state.data;
    const families=current.budget.inventoryCatalog.families||{};
    FAMILIES.forEach(f=>{if(Array.isArray(families[f]))families[f]=families[f].filter(y=>norm(y?.name)!==norm(name));});
    current.budget.inventoryCatalog.families=families;
    if(current.budget.familyCatalog&&typeof current.budget.familyCatalog==='object')FAMILIES.forEach(f=>{if(Array.isArray(current.budget.familyCatalog[f]))current.budget.familyCatalog[f]=current.budget.familyCatalog[f].filter(y=>norm(y?.name)!==norm(name));});
    if(current.budget.management?.catalog){current.budget.management.catalog=Array.isArray(current.budget.management.catalog)?current.budget.management.catalog.filter(y=>!['name','nome','product'].some(k=>norm(y?.[k])===norm(name))):Object.fromEntries(Object.entries(current.budget.management.catalog).filter(([k])=>norm(k)!==norm(name)));}
    if(current.budget.management?.planning)current.budget.management.planning=Object.fromEntries(Object.entries(current.budget.management.planning).filter(([k])=>norm(k)!==norm(name)));
    if(Array.isArray(current.budget.management?.purchases))current.budget.management.purchases=current.budget.management.purchases.filter(p=>![p?.product,p?.name,p?.nome].some(v=>norm(v)===norm(name)));
    if(current.budget.items)current.budget.items=Object.fromEntries(Object.entries(current.budget.items).filter(([k])=>norm(k)!==norm(name)));
    if(Array.isArray(current.matriz)&&state.family==='EPI')current.matriz=current.matriz.filter(e=>norm(e?.nome)!==norm(name));
    if(current.epiModels&&state.family==='EPI')current.epiModels=Object.fromEntries(Object.entries(current.epiModels).filter(([k])=>norm(k)!==norm(name)));
    if(current.stocks&&state.family==='EPI')Object.keys(current.stocks).forEach(w=>{if(current.stocks[w]&&typeof current.stocks[w]==='object')current.stocks[w]=Object.fromEntries(Object.entries(current.stocks[w]).filter(([k])=>norm(k)!==norm(name)));});
    await save();
    render();
    alert(`"${name}" foi apagado definitivamente.`);
  }catch(err){
    console.error('[DPM] Erro ao apagar artigo:',err);
    alert(`Não foi possível apagar o artigo.\n\n${err?.message||err}`);
  }finally{state.busy=false;}
}

function openModels(index){const epi=items('EPI')[index];if(!epi)return;const list=modelsFor(epi.name);const r=document.getElementById('modal-root');r.innerHTML=`<div class="modal-overlay" data-mm-overlay><div class="modal" style="max-width:760px"><div class="modal-head"><div><h2>Modelos — ${esc(epi.name)}</h2><p class="meta">Os modelos pertencem ao EPI e ficam registados nas entregas.</p></div><button class="icon-btn" data-mm-close>×</button></div><div class="table-wrap"><table class="budget-table"><thead><tr><th>Modelo</th><th>Preço</th><th>Tamanhos</th><th></th></tr></thead><tbody>${list.map((m,i)=>`<tr><td>${esc(m.nome)}</td><td>${money(m.preco)}</td><td>${esc((m.tamanhos||[]).join(', '))}</td><td><button class="danger-link" data-mm-del="${i}">Apagar</button></td></tr>`).join('')||'<tr><td colspan="4">Ainda não existem modelos.</td></tr>'}</tbody></table></div><section style="margin-top:18px"><h3>Novo modelo</h3><div class="field-row two"><input class="input" id="mm-name" placeholder="Modelo"><input class="input" id="mm-price" type="number" min="0" step="0.01" placeholder="Preço (€)"></div><div class="field-row"><input class="input" id="mm-sizes" placeholder="Tamanhos/variantes: 40, 41, 42"></div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="primary-btn" data-mm-add>+ Adicionar modelo</button></div></section></div></div>`;r.querySelector('[data-mm-close]').onclick=render;r.querySelector('[data-mm-overlay]').addEventListener('click',e=>{if(e.target===e.currentTarget)render()});r.querySelector('[data-mm-add]').onclick=async()=>{const name=r.querySelector('#mm-name').value.trim(),price=num(r.querySelector('#mm-price').value),sizes=r.querySelector('#mm-sizes').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);if(!name)return alert('Indica o modelo.');state.data.epiModels[epi.name] ||= [];if(state.data.epiModels[epi.name].some(m=>norm(m.nome)===norm(name)))return alert('Esse modelo já existe.');state.data.epiModels[epi.name].push({id:`MODEL-${Date.now()}`,nome:name,preco:price,tamanhos:sizes,ativo:true});await save();openModels(index);};r.querySelectorAll('[data-mm-del]').forEach(b=>b.onclick=async()=>{const i=Number(b.dataset.mmDel);if(!confirm(`Apagar o modelo "${list[i]?.nome||''}"?`))return;list.splice(i,1);await save();openModels(index);});}
function open(){if(state.open||state.busy)return;state.open=true;state.busy=true;load().then(()=>render()).catch(e=>{state.open=false;alert(`Não foi possível abrir o Inventário Geral.\n\n${e.message||e}`)}).finally(()=>state.busy=false);}
function injectGeneralButton(){if(!isSuper())return;const title=document.querySelector('.screen-title h1')?.textContent?.trim();if(title!=="Armazém"&&title!=="Orçamento")return;if(document.querySelector('[data-open-inventario-geral]'))return;const target=document.querySelector('main .section-head')||document.querySelector('main .screen-title');if(!target)return;const b=document.createElement('button');b.type='button';b.className='ghost-btn';b.dataset.openInventarioGeral='1';b.textContent='▦ Inventário Geral';target.prepend(b);b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();open();},true);}
function addWarehouseSummary(){if(!isSuper()||document.querySelector('.screen-title h1')?.textContent?.trim()!=="Armazém"||document.querySelector('[data-inventario-resumo]'))return;const main=document.querySelector('main'),section=document.createElement('section');section.className='section';section.dataset.inventarioResumo='1';section.innerHTML=`<div class="section-head"><div><h2>Inventário Geral</h2><p class="meta">Catálogo único · ${active('EPI').length} EPI · ${active('Equipamento').length} equipamentos</p></div><button type="button" class="ghost-btn" data-open-inventario-geral>Gerir inventário</button></div><div class="kpi-grid"><div class="kpi"><span>EPI</span><strong>${active('EPI').length}</strong></div><div class="kpi"><span>Equipamentos</span><strong>${active('Equipamento').length}</strong></div><div class="kpi"><span>Ambiente</span><strong>${active('Ambiente').length}</strong></div><div class="kpi"><span>Portes</span><strong>${active('Portes').length}</strong></div></div>`;const first=main?.querySelector('.section');if(first)first.insertAdjacentElement('beforebegin',section);else main?.appendChild(section);section.querySelector('[data-open-inventario-geral]').onclick=e=>{e.preventDefault();e.stopImmediatePropagation();open();};}
function refresh(){if(!state.data)return;syncBudget();filterStock();filterHomeStock();filterBudget();filterDelivery();addWarehouseSummary();injectGeneralButton();}
function start(){new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});setTimeout(()=>load().then(refresh).catch(e=>console.warn('Inventário Geral',e)),250);}
start();
