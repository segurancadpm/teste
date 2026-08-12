// DPM — Liga Famílias/Listagens a TODA a camada de Orçamento
// O core de entrega de EPI permanece intacto. Este extra só controla o que aparece
// no módulo Orçamento e mantém Planeamento/Compras/Execução sincronizados com a lista.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente", "Portes"];
const ref = () => doc(getFirestore(getApp()), "appdata", DOC);
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const num = v => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const euro = v => new Intl.NumberFormat("pt-PT", { style:"currency", currency:"EUR" }).format(num(v));
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));

let syncing = false;
let lastFamilySignature = "";

function isBudgetPage(){ return document.querySelector(".screen-title h1")?.textContent?.trim() === "Orçamento"; }
function isSuperAdmin(){ return !!document.querySelector('.bottom-nav [data-page="budget"]'); }

function ensureCatalog(data){
  data.budget ||= {};
  data.budget.familyCatalog ||= {};
  data.budget.familyCatalogInitialized ??= false;
  for(const family of FAMILIES) data.budget.familyCatalog[family] ||= [];
  if(!data.budget.familyCatalogInitialized){
    const matrix = Array.isArray(data.matriz) ? data.matriz : [];
    data.budget.familyCatalog.EPI = matrix.map((e,i)=>({id:`EPI-${i}-${Date.now()}`,name:e.nome,active:true,source:"core"}));
    data.budget.familyCatalogInitialized = true;
  }
  return data.budget.familyCatalog;
}

function activeCatalog(data){
  const catalog = ensureCatalog(data);
  const out = {};
  for(const family of FAMILIES) out[family] = (Array.isArray(catalog[family]) ? catalog[family] : []).filter(x=>x && x.active !== false && String(x.name||"").trim());
  return out;
}

function activeNames(data){
  const cat = activeCatalog(data);
  return new Map(FAMILIES.flatMap(f => cat[f].map(x => [norm(x.name), f])));
}

async function syncPlanningWithCatalog(){
  if(syncing) return null;
  syncing = true;
  try{
    const snap = await getDoc(ref());
    if(!snap.exists()) return null;
    const data = snap.data();
    const catalog = activeCatalog(data);
    const active = activeNames(data);
    data.budget ||= {};
    data.budget.management ||= {};
    data.budget.management.planning ||= {};
    const planning = data.budget.management.planning;
    let changed = false;

    // Remove do Planeamento tudo o que já não pertence à listagem ativa.
    Object.keys(planning).forEach(name => {
      if(!active.has(norm(name))){ delete planning[name]; changed = true; }
    });

    // Adiciona à estrutura de Planeamento tudo o que foi criado na listagem.
    for(const family of FAMILIES){
      for(const item of catalog[family]){
        const name = String(item.name).trim();
        if(!planning[name]){ planning[name] = { unitPrice:0, authorizedQty:0, family }; changed = true; }
        else if(planning[name].family !== family){ planning[name].family = family; changed = true; }
      }
    }

    // Também limpa o planeamento legado para evitar reaparecimento através de migrações.
    if(Array.isArray(data.budget.items)){
      const filtered = data.budget.items.filter(item => active.has(norm(item?.nome ?? item?.name ?? item?.epi ?? item?.artigo)));
      if(filtered.length !== data.budget.items.length){ data.budget.items = filtered; changed = true; }
    }

    if(changed) await setDoc(ref(), { budget:data.budget }, { merge:true });
    const signature = JSON.stringify(FAMILIES.map(f=>catalog[f].map(x=>[x.id,x.name,x.active])));
    lastFamilySignature = signature;
    return {data, catalog, active, changed};
  } finally { syncing = false; }
}

function filterPlanningAndExecutionRows(data){
  const active = activeNames(data);
  document.querySelectorAll('.budget-table tbody tr').forEach(row => {
    const planInput = row.querySelector('[data-plan-price], [data-plan-qty]');
    const firstCell = row.querySelector('td');
    if(!firstCell) return;
    // Só mexemos em tabelas do Orçamento. Linhas de compras são preservadas como histórico.
    const isPlanning = !!planInput;
    const isExecution = /Planeado vs\. Realizado/i.test(document.querySelector('.budget-view h3')?.textContent || "") && row.children.length >= 6;
    if(isPlanning || isExecution){
      const name = firstCell.textContent.trim();
      row.style.display = active.has(norm(name)) ? "" : "none";
    }
  });

  const planningTitle = [...document.querySelectorAll('.budget-view h3')].find(h => h.textContent.trim() === "Orçamento autorizado");
  if(planningTitle){
    const table = planningTitle.closest('.budget-card')?.querySelector('table');
    if(table){ const head = table.querySelector('thead th'); if(head) head.textContent = "Artigo"; }
  }
}

function filterPurchaseSelectors(data){
  const active = activeCatalog(data);
  const familySelect = document.querySelector('#purchase-family');
  if(familySelect){
    const existing = new Set([...familySelect.options].map(o=>o.value));
    if(!existing.has("Portes")){ const option=document.createElement('option'); option.value="Portes"; option.textContent="Portes"; familySelect.appendChild(option); }
  }
  const epiSelect = document.querySelector('#purchase-epi');
  if(!epiSelect) return;
  const current = epiSelect.value;
  const names = active.EPI.map(x=>String(x.name));
  epiSelect.innerHTML = '<option value="">Selecionar EPI</option>' + names.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
  if(names.includes(current)) epiSelect.value = current;
}

function updateDashboard(data){
  if(!isBudgetPage()) return;
  const planning = data?.budget?.management?.planning || {};
  const active = activeNames(data);
  let planned = 0;
  Object.entries(planning).forEach(([name,item])=>{
    if(!active.has(norm(name))) return;
    planned += num(item?.unitPrice) * num(item?.authorizedQty);
  });
  const purchases = Array.isArray(data?.budget?.management?.purchases) ? data.budget.management.purchases : [];
  const spent = purchases.reduce((s,p)=>s + num(p?.quantity)*num(p?.unitPrice), 0);
  const saldo = planned - spent;
  const pct = planned ? spent/planned*100 : 0;
  const values = document.querySelectorAll('.budget-kpis article strong');
  if(values[0]) values[0].textContent = euro(planned);
  if(values[1]) values[1].textContent = euro(spent);
  if(values[2]){ values[2].textContent = euro(saldo); values[2].classList.toggle('budget-negative', saldo < 0); }
  if(values[3]) values[3].textContent = `${pct.toFixed(1)}%`;
}

function addPortesFamilyToDashboard(data){
  const section = [...document.querySelectorAll('.budget-card')].find(s=>s.querySelector('h3')?.textContent?.trim()==="Gasto por família");
  if(!section) return;
  const existing = [...section.querySelectorAll('.metric-row span')].some(s=>norm(s.textContent)==='PORTES');
  if(existing) return;
  const purchases = Array.isArray(data?.budget?.management?.purchases) ? data.budget.management.purchases : [];
  const total = purchases.filter(p=>norm(p?.family)==='PORTES').reduce((s,p)=>s+num(p.quantity)*num(p.unitPrice),0);
  const row = document.createElement('div'); row.className='metric-row'; row.innerHTML=`<span>Portes</span><strong>${euro(total)}</strong>`;
  section.appendChild(row);
}

async function refresh(){
  if(!isBudgetPage() || !isSuperAdmin() || syncing) return;
  const result = await syncPlanningWithCatalog();
  if(!result) return;
  filterPlanningAndExecutionRows(result.data);
  filterPurchaseSelectors(result.data);
  updateDashboard(result.data);
  addPortesFamilyToDashboard(result.data);
}

function handleFamilyModalClose(){
  setTimeout(async()=>{
    try{
      const result=await syncPlanningWithCatalog();
      if(result?.changed){
        const activeTab=document.querySelector('.budget-management-tab.active');
        activeTab?.click();
        setTimeout(()=>refresh().catch(console.error),120);
      } else refresh();
    }catch(e){ console.error('Erro a sincronizar famílias:',e); }
  },100);
}

function init(){
  if(!isBudgetPage()) return;
  const observer = new MutationObserver(()=>{ injectFamiliesIndicator(); filterPlanningAndExecutionRows(stateSnapshot); filterPurchaseSelectors(stateSnapshot); });
  observer.observe(document.body,{childList:true,subtree:true});
  document.getElementById('modal-root')?.addEventListener('click',()=>{});
  document.addEventListener('click',ev=>{
    const familyBtn = ev.target.closest('[data-family-manager]');
    const closeBtn = ev.target.closest('[data-family-close]');
    if(familyBtn) setTimeout(()=>refresh().catch(console.error),250);
    if(closeBtn) handleFamilyModalClose();
  }, true);
  refresh().catch(console.error);
}

let stateSnapshot = {};
async function loadSnapshot(){ try{ const snap=await getDoc(ref()); if(snap.exists()) stateSnapshot=snap.data(); }catch(_){} return stateSnapshot; }
function injectFamiliesIndicator(){
  if(!isBudgetPage() || !isSuperAdmin()) return;
  const root=document.querySelector('.budget-management-root'); if(!root) return;
  if(root.querySelector('[data-family-manager]')) return;
  // A gestão de famílias já injeta o botão; não criamos um segundo botão.
}

// Atualiza o snapshot antes dos ciclos de renderização.
(async()=>{ await loadSnapshot(); init(); })();
