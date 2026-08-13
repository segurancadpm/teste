// DPM — catálogo mestre: modelos na entrega
// Importante: este módulo NÃO captura cliques globais nem altera data-toggle de outros módulos.
// A gestão/apagamento do Inventário é responsabilidade do próprio inventory-general-v3.js.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs, query, where
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
    wrap.className = 'field-row delivery-model-row';
    wrap.innerHTML = `<label class="field-label">Modelo</label><select class="select delivery-model" name="modelo"><option value="">Selecionar modelo…</option></select>`;
    const anchor = epiSelect.closest('.field-row') || epiSelect.parentElement;
    anchor?.insertAdjacentElement('afterend', wrap);
    model = wrap.querySelector('[name="modelo"]');
    model.addEventListener('change', () => filterSizes(item, model.value));
  }
  const current = model.value;
  model.innerHTML = modelOptions(modelList(d, epiSelect.value), current);
  model.disabled = model.options.length <= 1;
  if (model.value) filterSizes(item, model.value);
}

async function enhanceDelivery(){
  // Compatibilidade com as duas formas usadas pela aplicação para renderizar entregas.
  const forms = [...document.querySelectorAll('[data-form="delivery"], form[data-delivery-form], .delivery-form')];
  for (const form of forms){
    const items = form.querySelectorAll('.delivery-item, [data-delivery-item], .epi-delivery-item');
    for (const item of items) await enhanceDeliveryItem(item);
  }
  // Alguns ecrãs criam um único bloco de EPI sem .delivery-item.
  document.querySelectorAll('[name="epi"]').forEach(select => {
    const item = select.closest('.delivery-item,[data-delivery-item],.epi-delivery-item');
    if (item) enhanceDeliveryItem(item).catch(console.error);
  });
}

const deliveryObserver = new MutationObserver(() => { enhanceDelivery().catch(console.error); });
deliveryObserver.observe(document.body, {childList:true, subtree:true});
setTimeout(() => enhanceDelivery().catch(console.error), 300);
setTimeout(() => enhanceDelivery().catch(console.error), 1200);

// Quando o EPI muda, atualiza imediatamente o catálogo de modelos.
document.addEventListener('change', ev => {
  if (ev.target?.name !== 'epi') return;
  const item = ev.target.closest('.delivery-item,[data-delivery-item],.epi-delivery-item');
  if (item) enhanceDeliveryItem(item).catch(console.error);
});

// Não escrevemos modelo em deliveries aqui. O módulo de entrega deve guardar o modelo
// no mesmo momento que guarda a entrega, evitando uma segunda escrita assíncrona que
// possa atingir a entrega errada.
