// DPM — sincronização final das listagens do Orçamento
// A fonte de verdade das listas do módulo é budget.familyCatalog.
// O core de entrega de EPI não é alterado.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente", "Portes"];
const db = () => getFirestore(getApp());
const ref = () => doc(db(), "appdata", DOC);
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

let active = new Set();
let lastSignature = "";
let loading = false;

function onBudgetPage(){ return document.querySelector('.screen-title h1')?.textContent?.trim() === 'Orçamento'; }
function isSuperAdmin(){ return !!document.querySelector('.bottom-nav [data-page="budget"]'); }

async function readCatalog(){
  if(loading) return;
  loading = true;
  try{
    const snap = await getDoc(ref());
    if(!snap.exists()) return;
    const data = snap.data();
    const catalog = data?.budget?.familyCatalog || {};
    const names = [];
    for(const family of FAMILIES){
      const list = Array.isArray(catalog[family]) ? catalog[family] : [];
      list.forEach(item => { if(item?.active !== false && String(item?.name || '').trim()) names.push(item.name); });
    }
    const next = new Set(names.map(norm));
    const signature = [...next].sort().join('|');
    if(signature !== lastSignature){ active = next; lastSignature = signature; apply(); }
    else apply();
  } finally { loading = false; }
}

function rowName(row){
  const first = row?.querySelector('td');
  return first?.textContent?.trim() || '';
}

function applyPlanning(){
  const title = [...document.querySelectorAll('.budget-view h3')].find(h => h.textContent.trim() === 'Orçamento autorizado');
  const table = title?.closest('.budget-card')?.querySelector('table');
  if(!table) return;
  table.querySelectorAll('tbody tr').forEach(row => {
    const name = rowName(row);
    if(name && !active.has(norm(name))) row.remove();
  });
}

function applyExecution(){
  const title = [...document.querySelectorAll('.budget-view h3')].find(h => h.textContent.trim() === 'Planeado vs. Realizado');
  const table = title?.closest('.budget-card')?.querySelector('table');
  if(!table) return;
  table.querySelectorAll('tbody tr').forEach(row => {
    const name = rowName(row);
    if(name && !active.has(norm(name))) row.remove();
  });
}

function applyPurchaseForm(){
  const family = document.querySelector('#purchase-family');
  const product = document.querySelector('#purchase-product');
  const epiWrap = document.querySelector('#purchase-epi-wrap');
  const epi = document.querySelector('#purchase-epi');
  if(!family) return;
  const fam = norm(family.value);
  if(epiWrap) epiWrap.style.display = fam === 'EPI' ? '' : 'none';
  const productWrap = document.querySelector('#purchase-product-wrap');
  if(productWrap) productWrap.style.display = fam === 'EPI' ? 'none' : '';
  if(!epi || fam !== 'EPI') return;
  const current = epi.value;
  const names = [...active].filter(n => {
    // Nesta camada os modelos continuam fora da lista principal.
    return true;
  });
  // Para EPI só entram os nomes ativos da família; removemos equipamento/ambiente/portes pelo texto do catálogo
  // usando o dataset guardado no DOM quando disponível.
  const catalogNames = [...document.querySelectorAll('#purchase-epi option')].map(o => o.value).filter(Boolean);
  const allowed = new Set(catalogNames.map(norm).filter(n => active.has(n)));
  const known = [...new Set([...catalogNames.filter(x => allowed.has(norm(x)))])];
  epi.innerHTML = '<option value="">Selecionar EPI</option>' + known.map(name => `<option value="${name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}">${name}</option>`).join('');
  if(known.some(x => norm(x) === norm(current))) epi.value = current;
}

function apply(){
  if(!onBudgetPage() || !isSuperAdmin() || !active.size) return;
  applyPlanning();
  applyExecution();
  applyPurchaseForm();
}

const observer = new MutationObserver(() => {
  if(onBudgetPage() && isSuperAdmin()) apply();
});
observer.observe(document.body, {childList:true, subtree:true});

setInterval(() => { if(onBudgetPage() && isSuperAdmin()) readCatalog().catch(console.error); }, 1200);
readCatalog().catch(console.error);
