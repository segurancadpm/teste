// DPM — catálogo mestre: apagar artigos sem histórico + modelos na entrega
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs, query, where, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const db = () => getFirestore(getApp());
const mainRef = () => doc(db(), "appdata", "dpm_epi_data_v1");
let cache = null;
let loading = null;
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g," ").trim();
const n = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));

async function data(){
  if (cache) return cache;
  if (loading) return loading;
  loading = getDoc(mainRef()).then(s => { cache = s.exists() ? (s.data() || {}) : {}; return cache; }).finally(() => { loading = null; });
  return loading;
}

function modelList(d, epi){
  const raw = d?.epiModels?.[epi];
  return Array.isArray(raw) ? raw.filter(m => m && m.ativo !== false) : [];
}

function modelOptions(models, current=""){
  return `<option value="">Selecionar modelo…</option>${models.map(m => `<option value="${esc(m.nome)}" ${norm(m.nome)===norm(current)?"selected":""}>${esc(m.nome)}${m.preco ? ` · ${Number(m.preco).toFixed(2)} €` : ""}</option>`).join("")}`;
}

function filterSizes(item, modelName){
  const size = item.querySelector('[name="tamanho"]');
  if (!size || !modelName) return;
  const d = cache;
  const epi = item.querySelector('[name="epi"]')?.value || '';
  const model = modelList(d, epi).find(m => norm(m.nome) === norm(modelName));
  const allowed = Array.isArray(model?.tamanhos) ? new Set(model.tamanhos.map(norm)) : null;
  if (!allowed) return;
  [...size.options].forEach(o => {
    if (!o.value) return;
    o.hidden = !allowed.has(norm(o.value));
    o.disabled = o.hidden;
  });
  if (size.value && !allowed.has(norm(size.value))) size.value = '';
}

async function enhanceDeliveryItem(item){
  if (!item) return;
  const epiSelect = item.querySelector('[name="epi"]');
  if (!epiSelect) return;
  const d = await data();
  let model = item.querySelector('[name="modelo"]');
  if (!model){
    const wrap = document.createElement('div');
    wrap.className = 'field-row';
    wrap.innerHTML = `<select class="select delivery-model" name="modelo"><option value="">Selecionar modelo…</option></select>`;
    epiSelect.closest('.field-row')?.insertAdjacentElement('afterend', wrap);
    model = wrap.querySelector('[name="modelo"]');
    model.addEventListener('change', () => filterSizes(item, model.value));
  }
  const current = model.value;
  model.innerHTML = modelOptions(modelList(d, epiSelect.value), current);
  if (model.value) filterSizes(item, model.value);
}

async function enhanceDelivery(){
  const form = document.querySelector('[data-form="delivery"]');
  if (!form) return;
  for (const item of form.querySelectorAll('.delivery-item')) await enhanceDeliveryItem(item);
}

const deliveryObserver = new MutationObserver(() => { enhanceDelivery().catch(console.error); });
deliveryObserver.observe(document.body, {childList:true, subtree:true});
setTimeout(() => enhanceDelivery().catch(console.error), 100);

document.addEventListener('change', ev => {
  const form = ev.target.closest('[data-form="delivery"]');
  if (!form || ev.target.name !== 'epi') return;
  const item = ev.target.closest('.delivery-item');
  if (item) enhanceDeliveryItem(item).catch(console.error);
});

let pendingModels = null;
document.addEventListener('submit', ev => {
  const form = ev.target;
  if (form?.dataset?.form !== 'delivery') return;
  pendingModels = [...form.querySelectorAll('.delivery-item')].map(item => ({
    epi: item.querySelector('[name="epi"]')?.value || '',
    modelo: item.querySelector('[name="modelo"]')?.value || '',
    tamanho: item.querySelector('[name="tamanho"]')?.value || ''
  }));
  setTimeout(() => enrichNewDeliveries(pendingModels).catch(console.error), 1800);
}, true);

async function enrichNewDeliveries(items){
  if (!items?.some(x => x.modelo)) return;
  try{
    const qs = await getDocs(collection(db(), 'deliveries'));
    const now = Date.now();
    const candidates = qs.docs.filter(x => now - n(x.data()?.created_at) < 20000).sort((a,b) => n(a.data()?.created_at)-n(b.data()?.created_at));
    for (const item of items.filter(x => x.modelo)){
      const target = candidates.find(x => {
        const v=x.data();
        return v.epi_type===item.epi && String(v.tamanho||'').toUpperCase()===String(item.tamanho||'').toUpperCase() && !v.modelo;
      });
      if (target) await setDoc(target.ref, { modelo: item.modelo }, {merge:true});
    }
  }catch(e){ console.error('Modelo da entrega:', e); }
}

async function hardDeleteCatalogItem(button){
  const row = button.closest('tr');
  const name = row?.querySelector('td strong')?.textContent?.trim();
  if (!name) return;
  const d = await data();
  const events = Array.isArray(d.eventos) ? d.eventos.filter(e => norm(e.epi)===norm(name)) : [];
  let stockTotal = 0;
  Object.values(d.stocks || {}).forEach(w => {
    const r = w?.[name];
    if (typeof r === 'number') stockTotal += n(r);
    else { stockTotal += n(r?.loose); Object.values(r?.sizes || {}).forEach(v => stockTotal += n(v)); }
  });
  let deliveries = [];
  try { deliveries = (await getDocs(query(collection(db(),'deliveries'), where('epi_type','==',name)))).docs; } catch(e) { console.warn('Não foi possível verificar deliveries:',e); }
  if (stockTotal || events.length || deliveries.length){
    alert(`Não posso apagar "${name}" porque já existe histórico/stock associado.\n\nStock: ${stockTotal}\nEventos: ${events.length}\nEntregas: ${deliveries.length}\n\nPara manter a integridade dos dados, este artigo deve ser apenas desativado.`);
    return;
  }
  if (!confirm(`Apagar definitivamente "${name}" do Inventário Geral?\n\nSó é permitido porque não existem stock nem entregas/histórico. Esta ação não pode ser desfeita.`)) return;
  try{
    await runTransaction(db(), async tx => {
      const snap = await tx.get(mainRef());
      const x = snap.data() || {};
      const budget = {...(x.budget||{})};
      const catalog = {...(budget.inventoryCatalog||{})};
      const families = {...(catalog.families||{})};
      Object.keys(families).forEach(f => { families[f] = (Array.isArray(families[f]) ? families[f] : []).filter(i => norm(i?.name)!==norm(name)); });
      catalog.families = families;
      budget.inventoryCatalog = catalog;
      if (budget.items) { const bi={...budget.items}; delete bi[name]; budget.items=bi; }
      if (budget.management?.planning) { const bp={...budget.management.planning}; delete bp[name]; budget.management={...(budget.management||{}),planning:bp}; }
      if (budget.familyCatalog) { const fc={...budget.familyCatalog}; Object.keys(fc).forEach(f=>{ if(Array.isArray(fc[f])) fc[f]=fc[f].filter(i=>norm(i?.name||i?.nome)!==norm(name)); }); budget.familyCatalog=fc; }
      const matriz=(Array.isArray(x.matriz)?x.matriz:[]).filter(i=>norm(i?.nome)!==norm(name));
      const epiModels={...(x.epiModels||{})}; delete epiModels[name];
      const stocks={...(x.stocks||{})};
      Object.keys(stocks).forEach(w=>{ const copy={...(stocks[w]||{})}; delete copy[name]; stocks[w]=copy; });
      tx.set(mainRef(), {budget, matriz, epiModels, stocks}, {merge:true});
    });
    cache=null;
    alert(`"${name}" foi apagado.`);
    location.reload();
  }catch(e){ console.error(e); alert(`Não foi possível apagar o artigo.\n\n${e.message||e}`); }
}

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-toggle]');
  if (!b) return;
  ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
  hardDeleteCatalogItem(b).catch(e => alert(`Erro ao apagar: ${e.message||e}`));
}, true);

function relabel(){ document.querySelectorAll('[data-toggle]').forEach(b => { b.textContent = 'Apagar'; }); }
new MutationObserver(relabel).observe(document.body,{childList:true,subtree:true});
relabel();
