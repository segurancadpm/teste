// DPM — Entrega: modelo proveniente do Inventário Mestre
// Integração deliberadamente simples: sem MutationObserver e sem substituir o fluxo core.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DOC = "dpm_epi_data_v1";
let catalog = null;
let loading = null;

function db(){ return getFirestore(getApp()); }
async function loadCatalog(){
  if(catalog) return catalog;
  if(!loading){
    loading = getDoc(doc(db(), "appdata", DOC)).then(s => {
      const d = s.exists() ? s.data() : {};
      catalog = d.epiModels || {};
      return catalog;
    }).catch(err => {
      console.warn("Entrega: não foi possível carregar modelos do Inventário Mestre", err);
      catalog = {};
      return catalog;
    });
  }
  return loading;
}

const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const norm = v => String(v ?? "").trim();

function modelsFor(epi){
  const list = Array.isArray(catalog?.[epi]) ? catalog[epi] : [];
  return list.filter(m => m && m.ativo !== false);
}

function sizeOptions(model, current = ""){
  const sizes = Array.isArray(model?.tamanhos) ? model.tamanhos.map(norm).filter(Boolean) : [];
  const unique = [...new Set(sizes)];
  return `<option value="">Sem tamanho</option>${unique.map(s => `<option value="${esc(s)}" ${s===current?'selected':''}>${esc(s)}</option>`).join("")}`;
}

function installForItem(item){
  if(!item || item.dataset.modelIntegrated === "1") return;
  const epiSelect = item.querySelector('[name="epi"]');
  const sizeSelect = item.querySelector('[name="tamanho"]');
  if(!epiSelect || !sizeSelect) return;

  const oldModel = item.querySelector('[name="modelo"]');
  if(oldModel) oldModel.closest('.field-row')?.remove();

  const row = document.createElement('div');
  row.className = 'field-row';
  row.innerHTML = `<label style="display:block;width:100%">Modelo<select class="select delivery-model" name="modelo"><option value="">A carregar modelos…</option></select></label>`;
  epiSelect.closest('.field-row')?.insertAdjacentElement('afterend', row);
  const modelSelect = row.querySelector('[name="modelo"]');
  item.dataset.modelIntegrated = "1";

  const refreshModels = async () => {
    const epi = epiSelect.value;
    const models = modelsFor(epi);
    modelSelect.innerHTML = models.length
      ? `<option value="">Selecionar modelo</option>${models.map(m => `<option value="${esc(m.id || m.nome)}">${esc(m.nome)}</option>`).join('')}`
      : '<option value="">Sem modelo configurado</option>';
    modelSelect.disabled = !models.length;
    sizeSelect.innerHTML = '<option value="">Sem tamanho</option>';
  };

  modelSelect.addEventListener('change', () => {
    const model = modelsFor(epiSelect.value).find(m => String(m.id || m.nome) === String(modelSelect.value));
    sizeSelect.innerHTML = sizeOptions(model);
  });
  epiSelect.addEventListener('change', refreshModels);
  refreshModels();
}

async function enhanceDelivery(){
  const form = document.querySelector('form[data-form="delivery"]');
  if(!form) return;
  await loadCatalog();
  form.querySelectorAll('.delivery-item').forEach(installForItem);
}

document.addEventListener('click', ev => {
  const target = ev.target.closest('[data-modal="delivery"], [data-renew-alert]');
  if(!target) return;
  // O app.js abre o modal no mesmo evento; executamos depois, sem interferir no clique.
  setTimeout(enhanceDelivery, 0);
});

document.addEventListener('click', ev => {
  if(ev.target.closest('[data-action="addDeliveryItem"]')) setTimeout(enhanceDelivery, 0);
});
