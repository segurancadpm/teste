// DPM — Inventário Mestre
// Fonte única de artigos para o extra de gestão: Armazém + Orçamento.
// O core de entrega continua no app.js; artigos inativos são ocultados das operações novas.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente", "Portes"];
const state = { data:null, family:"EPI", busy:false };
const ref = () => doc(getFirestore(getApp()), "appdata", DOC);
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const num = v => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const money = v => new Intl.NumberFormat("pt-PT", { style:"currency", currency:"EUR" }).format(num(v));

async function load(){
  const snap = await getDoc(ref());
  if(!snap.exists()) throw new Error("Não foi encontrado o documento principal de dados.");
  state.data = snap.data();
  state.data.budget ||= {};
  state.data.budget.management ||= {};
  state.data.budget.management.planning ||= {};
  state.data.matriz ||= [];
  state.data.stocks ||= {};
  state.data.warehouses ||= ["DPM Norte","DPM Sul","DPM Algarve"];
  ensureInventory();
  return state.data;
}

function ensureInventory(){
  const b = state.data.budget;
  if(b.inventoryCatalog && typeof b.inventoryCatalog === "object" && b.inventoryCatalog.initialized) return;
  const legacy = b.familyCatalog && typeof b.familyCatalog === "object" ? b.familyCatalog : null;
  const catalog = {};
  for(const family of FAMILIES){
    if(legacy && Array.isArray(legacy[family])){
      catalog[family] = legacy[family].map((x,i)=>({id:x.id || `INV-${family}-${i}-${Date.now()}`,name:String(x.name || "").trim(),active:x.active !== false,source:x.source || "migrated"})).filter(x=>x.name);
    } else if(family === "EPI") {
      catalog[family] = state.data.matriz.map((x,i)=>({id:`EPI-${i}-${Date.now()}`,name:x.nome,active:true,source:"core"}));
    } else catalog[family] = [];
  }
  b.inventoryCatalog = { initialized:true, version:1, families:catalog };
}

function items(family=state.family){ return state.data?.budget?.inventoryCatalog?.families?.[family] || []; }
function active(family){ return items(family).filter(x=>x.active !== false); }
function activeNames(family="EPI"){ return new Set(active(family).map(x=>norm(x.name))); }
async function save(){ await setDoc(ref(), { budget:state.data.budget, matriz:state.data.matriz, stocks:state.data.stocks }, { merge:true }); }

function ensureEpiInCore(name, price=0){
  let epi=state.data.matriz.find(x=>norm(x.nome)===norm(name));
  if(!epi){ epi={nome:name,riscos:"",meses:12,preco:num(price),inventoryManaged:true}; state.data.matriz.push(epi); }
  else epi.preco=num(price);
  for(const w of state.data.warehouses){ state.data.stocks[w] ||= {}; if(typeof state.data.stocks[w][name]==="undefined") state.data.stocks[w][name]={loose:0,sizes:{}}; }
  return epi;
}

function ensurePlanning(item,family){
  const p=state.data.budget.management.planning;
  if(!p[item.name]) p[item.name]={unitPrice:0,authorizedQty:0,family}; else p[item.name].family=family;
}
function syncPlanning(){
  const cat=state.data.budget.inventoryCatalog.families;
  const activeAll=new Map();
  FAMILIES.forEach(f=>(cat[f]||[]).forEach(i=>{if(i.active!==false)activeAll.set(norm(i.name),f);}));
  const p=state.data.budget.management.planning;
  Object.keys(p).forEach(name=>{if(!activeAll.has(norm(name)))delete p[name];});
  FAMILIES.forEach(f=>active(f).forEach(i=>ensurePlanning(i,f)));
}

function filterStock(){
  if(!document.querySelector('.bottom-nav [data-page="stock"]')) return;
  const allowed=activeNames("EPI");
  document.querySelectorAll('table tbody tr').forEach(row=>{
    const first=row.querySelector('td:first-child'); if(!first)return;
    const name=norm(first.textContent);
    if(!name)return;
    const isStockPage=/Armazém/i.test(document.querySelector('.screen-title h1')?.textContent||"");
    if(isStockPage)row.style.display=allowed.has(name)?"":"none";
  });
}
function filterHomeMatrix(){
  const allowed=activeNames("EPI");
  document.querySelectorAll('section.section').forEach(section=>{
    if(!section.querySelector('h2')?.textContent.includes('Matriz Consolidada de Stocks'))return;
    section.querySelectorAll('tbody tr').forEach(row=>{const name=norm(row.querySelector('td:first-child')?.textContent);if(name)row.style.display=allowed.has(name)?"":"none";});
  });
}
function filterDelivery(){
  const allowed=activeNames("EPI");
  document.querySelectorAll('select[name="epi"]').forEach(select=>{
    [...select.options].forEach(o=>{if(o.value)o.hidden=!allowed.has(norm(o.value));});
    if(select.value && !allowed.has(norm(select.value))){
      const first=[...select.options].find(o=>allowed.has(norm(o.value))); if(first){first.hidden=false;select.value=first.value;select.dispatchEvent(new Event('change',{bubbles:true}));}
    }
  });
}
function filterBudget(){
  const allowed=new Map();FAMILIES.forEach(f=>active(f).forEach(i=>allowed.set(norm(i.name),f)));
  document.querySelectorAll('.budget-table tbody tr').forEach(row=>{
    const name=norm(row.querySelector('td:first-child')?.textContent); if(!name)return;
    const budgetRow=row.querySelector('[data-plan-price],[data-plan-qty],.budget-status');
    if(budgetRow)row.style.display=allowed.has(name)?"":"none";
  });
  const epi=document.querySelector('#purchase-epi');
  if(epi){const e=activeNames('EPI');[...epi.options].forEach(o=>{if(o.value)o.hidden=!e.has(norm(o.value));});}
}
function refresh(){ if(!state.data)return; syncPlanning(); filterStock();filterHomeMatrix();filterDelivery();filterBudget(); }

function renderModal(){
  const root=document.getElementById('modal-root'); if(!root)return;
  const rows=items();
  root.innerHTML=`<div class="modal-overlay" data-inventory-overlay><div class="modal" role="dialog" aria-modal="true" style="max-width:900px"><div class="modal-head"><div><h2>Inventário Mestre</h2><p class="meta">A mesma listagem alimenta o Armazém e o Orçamento.</p></div><button type="button" class="icon-btn" data-inventory-close>×</button></div><div class="family-tabs">${FAMILIES.map(f=>`<button type="button" class="ghost-btn ${state.family===f?'active':''}" data-inventory-family="${f}">${f}</button>`).join('')}</div><section style="margin-top:14px"><div class="section-head"><div><h3>${state.family}</h3><p class="meta">${active(state.family).length} ativos · ${rows.length} total</p></div></div><div class="table-wrap"><table class="budget-table"><thead><tr><th>Artigo</th><th>Estado</th><th>Preço</th><th>Modelos</th><th></th></tr></thead><tbody>${rows.map((item,i)=>{const models=state.data.epiModels?.[item.name]||[];const price=state.data.matriz.find(x=>norm(x.nome)===norm(item.name))?.preco ?? state.data.budget.management.planning?.[item.name]?.unitPrice ?? 0;return `<tr><td><strong>${esc(item.name)}</strong><br><span class="meta">${item.source==='core'?'Ligado ao core':'Inventário mestre'}</span></td><td><span class="badge ${item.active===false?'danger':'ok'}">${item.active===false?'Inativo':'Ativo'}</span></td><td>${money(price)}</td><td>${state.family==='EPI'?`${models.length} modelo(s)`: '—'}</td><td><button type="button" class="danger-link" data-inventory-toggle="${i}">${item.active===false?'Ativar':'Desativar'}</button></td></tr>`;}).join('')||'<tr><td colspan="5">Sem artigos.</td></tr>'}</tbody></table></div></section><section style="margin-top:18px;border-top:1px solid var(--line);padding-top:18px"><h3>Adicionar artigo</h3><div class="field-row two"><input class="input" id="inventory-name" placeholder="Nome do artigo"><input class="input" id="inventory-price" type="number" min="0" step="0.01" placeholder="Preço de referência (€)"></div><div class="field-row" style="display:flex;justify-content:flex-end"><button type="button" class="primary-btn" data-inventory-add>+ Adicionar</button></div></section><p class="meta" style="margin-top:12px">Desativar não apaga histórico; apenas retira o artigo das operações novas.</p></div></div>`;
  root.querySelector('[data-inventory-close]')?.addEventListener('click',()=>root.innerHTML='');
  root.querySelector('[data-inventory-overlay]')?.addEventListener('click',e=>{if(e.target===e.currentTarget)root.innerHTML='';});
  root.querySelectorAll('[data-inventory-family]').forEach(b=>b.addEventListener('click',()=>{state.family=b.dataset.inventoryFamily;renderModal();}));
  root.querySelector('[data-inventory-add]')?.addEventListener('click',addItem);
  root.querySelectorAll('[data-inventory-toggle]').forEach(b=>b.addEventListener('click',()=>toggleItem(Number(b.dataset.inventoryToggle))));
}

async function addItem(){
  const name=document.getElementById('inventory-name')?.value.trim(); const price=num(document.getElementById('inventory-price')?.value);
  if(!name){alert('Indica o nome do artigo.');return;}
  if(items().some(x=>norm(x.name)===norm(name))){alert('Esse artigo já existe nesta família.');return;}
  const item={id:`INV-${Date.now()}`,name,active:true,source:'inventory'};
  state.data.budget.inventoryCatalog.families[state.family].push(item);
  if(state.family==='EPI') ensureEpiInCore(name,price);
  state.data.budget.management.planning[name] ||= {unitPrice:state.family==='EPI'?price:price,authorizedQty:0,family:state.family};
  await save(); refresh(); renderModal(); window.dispatchEvent(new Event('dpm:inventory-changed'));
}
async function toggleItem(index){
  const item=items()[index]; if(!item)return;
  item.active=item.active===false;
  if(item.active && state.family==='EPI')ensureEpiInCore(item.name, state.data.matriz.find(x=>norm(x.nome)===norm(item.name))?.preco||0);
  await save(); refresh(); renderModal(); window.dispatchEvent(new Event('dpm:inventory-changed'));
}
async function openManager(){if(state.busy)return;state.busy=true;try{await load();renderModal();}catch(e){alert(`Não foi possível abrir o Inventário Mestre.\n\n${e.message||e}`);}finally{state.busy=false;}}
function isSuper(){return !!document.querySelector('.bottom-nav [data-page="budget"]');}
function inject(){
  if(!isSuper())return;
  const navStock=document.querySelector('.bottom-nav [data-page="stock"]'); const navBudget=document.querySelector('.bottom-nav [data-page="budget"]');
  if(!(navStock?.classList.contains('active')||navBudget?.classList.contains('active')))return;
  if(document.querySelector('[data-open-inventory-master]'))return;
  const main=document.querySelector('main'); if(!main)return; const target=main.querySelector('.section-head')||main.querySelector('.screen-title')||main.firstElementChild;
  if(!target)return; const b=document.createElement('button');b.type='button';b.className='ghost-btn';b.textContent='▦ Inventário Mestre';b.dataset.openInventoryMaster='1';target.prepend(b);b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openManager();});
}
function start(){
  const observer=new MutationObserver(()=>{refresh();inject();}); observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(async()=>{try{await load();refresh();inject();}catch(e){console.warn('Inventário Mestre',e);}},300);
}
start();
