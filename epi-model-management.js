// DPM — Gestão complementar de modelos de EPI
// Extra exclusivo do SuperAdmin. Não altera o core de entrega.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ref = () => doc(getFirestore(getApp()), "appdata", "dpm_epi_data_v1");
const state = { data: null, pending: null, observer: null };
const num = v => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const norm = v => String(v ?? "").trim().toUpperCase();
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const money = v => new Intl.NumberFormat("pt-PT", { style:"currency", currency:"EUR" }).format(num(v));

async function load() {
  const snap = await getDoc(ref());
  if (!snap.exists()) throw new Error("Não foi encontrado o registo principal de EPI.");
  state.data = snap.data();
  state.data.epiModels ||= {};
  state.data.modelStock ||= {};
  const matriz = Array.isArray(state.data.matriz) ? state.data.matriz : [];
  matriz.forEach(e => { if (!Array.isArray(state.data.epiModels[e.nome])) state.data.epiModels[e.nome] = []; });
  return state.data;
}

async function save() {
  if (!state.data) return;
  await setDoc(ref(), { epiModels: state.data.epiModels, modelStock: state.data.modelStock }, { merge:true });
}

function isSuperAdmin() {
  return !!document.querySelector('.bottom-nav [data-page="budget"]');
}

const epis = () => Array.isArray(state.data?.matriz) ? state.data.matriz : [];
const models = name => Array.isArray(state.data?.epiModels?.[name]) ? state.data.epiModels[name] : [];
const warehouses = () => Array.isArray(state.data?.warehouses) ? state.data.warehouses : Object.keys(state.data?.stocks || {});

function warehouseFromWorkerPage() {
  const meta = document.querySelector('.detail-header .meta')?.textContent || "";
  const parts = meta.split("·").map(v => v.trim()).filter(Boolean);
  return parts.at(-1) || "";
}

function modelStock(warehouse, epi, model) {
  return state.data?.modelStock?.[warehouse]?.[epi]?.[model] || { loose:0, sizes:{} };
}

function modelTotal(warehouse, epi, model) {
  const s = modelStock(warehouse, epi, model);
  return num(s.loose) + Object.values(s.sizes || {}).reduce((sum, q) => sum + num(q), 0);
}

function modelPrice(epi, model) {
  const item = models(epi).find(m => norm(m.nome) === norm(model));
  return num(item?.preco ?? epis().find(e => e.nome === epi)?.preco);
}

function modelOptions(warehouse, epi, selected = "") {
  const list = models(epi).filter(m => m.ativo !== false);
  if (!list.length) return `<option value="">Sem modelo configurado</option>`;
  return `<option value="">Selecionar modelo</option>${list.map(m => `<option value="${esc(m.nome)}" ${norm(m.nome)===norm(selected)?"selected":""}>${esc(m.nome)}${modelTotal(warehouse,epi,m.nome) ? ` · ${modelTotal(warehouse,epi,m.nome)} em stock` : ""}</option>`).join("")}`;
}

function modelSizeOptions(warehouse, epi, model) {
  const item = models(epi).find(m => norm(m.nome) === norm(model));
  const stock = modelStock(warehouse, epi, model);
  const configured = Array.isArray(item?.tamanhos) ? item.tamanhos.map(norm) : [];
  const stocked = Object.keys(stock.sizes || {}).map(norm);
  const sizes = [...new Set([...configured, ...stocked])].sort((a,b) => a.localeCompare(b, "pt-PT", { numeric:true }));
  return `<option value="">Sem tamanho</option>${sizes.map(s => `<option value="${esc(s)}">${esc(s)}${stock.sizes?.[s] !== undefined ? ` (${num(stock.sizes[s])})` : ""}</option>`).join("")}`;
}

function renderModelManager() {
  const root = document.getElementById("modal-root");
  if (!root) return;
  const groups = epis().map(epi => {
    const list = models(epi.nome);
    return `<section class="model-manager-group">
      <div class="section-head"><h3>${esc(epi.nome)}</h3><span class="meta">${list.length} modelo(s)</span></div>
      ${list.map((m, i) => `<div class="model-manager-row">
        <div><strong>${esc(m.nome)}</strong><span class="meta">${money(m.preco)}${m.tamanhos?.length ? ` · ${esc(m.tamanhos.join(", "))}` : ""}</span></div>
        <button type="button" class="danger-btn" data-model-delete-epi="${esc(epi.nome)}" data-model-delete-index="${i}">Apagar</button>
      </div>`).join("") || `<div class="meta model-empty">Ainda não existem modelos para este EPI.</div>`}
    </section>`;
  }).join("");

  root.innerHTML = `<div class="modal-overlay" data-model-overlay>
    <div class="modal" role="dialog" aria-modal="true" style="max-width:760px">
      <div class="modal-head"><h2>Modelos de EPI</h2><button type="button" class="icon-btn" data-model-close>×</button></div>
      <p class="meta" style="margin-bottom:14px">Cria os modelos que podem ser escolhidos na entrega. Cada entrega ficará associada ao modelo e ao custo correspondente.</p>
      <div>${groups || `<div class="empty">Não existem EPI no catálogo.</div>`}</div>
      <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:18px">
        <h3 style="margin-bottom:12px">Novo modelo</h3>
        <div class="field-row"><select class="select" id="model-epi-select"><option value="">Escolher EPI</option>${epis().map(e => `<option value="${esc(e.nome)}">${esc(e.nome)}</option>`).join("")}</select></div>
        <div class="field-row two"><input class="input" id="model-name-input" placeholder="Nome do modelo"><input class="input" id="model-price-input" type="number" min="0" step="0.01" placeholder="Preço unitário (€)"></div>
        <div class="field-row"><input class="input" id="model-sizes-input" placeholder="Tamanhos/variantes: 40, 41, 42, 43"></div>
        <div class="field-row" style="display:flex;justify-content:flex-end"><button type="button" class="primary-btn" data-model-create>+ Criar modelo</button></div>
      </div>
    </div>
  </div>`;

  root.querySelector("[data-model-close]")?.addEventListener("click", closeModelManager);
  root.querySelector("[data-model-overlay]")?.addEventListener("click", e => { if (e.target === e.currentTarget) closeModelManager(); });
  root.querySelector("[data-model-create]")?.addEventListener("click", createModelFromModal);
  root.querySelectorAll("[data-model-delete-epi]").forEach(btn => btn.addEventListener("click", () => deleteModelFromModal(btn)));
}

function closeModelManager() {
  const root = document.getElementById("modal-root");
  if (root) root.innerHTML = "";
}

async function createModelFromModal() {
  const epi = document.getElementById("model-epi-select")?.value || "";
  const name = document.getElementById("model-name-input")?.value.trim() || "";
  const price = num(document.getElementById("model-price-input")?.value);
  const sizes = (document.getElementById("model-sizes-input")?.value || "").split(",").map(norm).filter(Boolean);
  if (!epi) { alert("Escolhe primeiro o EPI."); return; }
  if (!name) { alert("Indica o nome do modelo."); return; }
  try {
    await load();
    state.data.epiModels[epi] ||= [];
    if (state.data.epiModels[epi].some(m => norm(m.nome) === norm(name))) {
      alert("Esse modelo já existe para este EPI.");
      return;
    }
    state.data.epiModels[epi].push({ id:`MODEL-${Date.now()}`, nome:name, preco:price, tamanhos:sizes, ativo:true });
    await save();
    await load();
    renderModelManager();
  } catch (error) {
    console.error("Erro ao criar modelo", error);
    alert(`Não foi possível guardar o modelo.\n\n${error.message || error}`);
  }
}

async function deleteModelFromModal(button) {
  const epi = button.dataset.modelDeleteEpi;
  const index = Number(button.dataset.modelDeleteIndex);
  if (!epi || !Number.isInteger(index)) return;
  try {
    await load();
    const list = models(epi);
    if (!list[index]) return;
    if (!confirm(`Apagar o modelo "${list[index].nome}"? O histórico de entregas não será apagado.`)) return;
    list.splice(index, 1);
    state.data.epiModels[epi] = list;
    await save();
    await load();
    renderModelManager();
  } catch (error) {
    console.error("Erro ao apagar modelo", error);
    alert(`Não foi possível apagar o modelo.\n\n${error.message || error}`);
  }
}

async function openModelManager() {
  try {
    await load();
    renderModelManager();
  } catch (error) {
    console.error("Erro ao abrir Modelos EPI", error);
    alert(`Não foi possível abrir Modelos EPI.\n\n${error.message || error}`);
  }
}

function injectManagerButton() {
  if (!isSuperAdmin()) return;
  const head = [...document.querySelectorAll(".section-head")].find(x => x.querySelector("h2")?.textContent?.trim().startsWith("Inventário"));
  if (!head || head.querySelector("[data-model-manager]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost-btn";
  button.textContent = "⚙ Modelos EPI";
  button.dataset.modelManager = "1";
  head.appendChild(button);
  button.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); openModelManager(); });
}

function decorateDelivery(item) {
  if (item.dataset.modelDecorated === "1") return;
  const epiSelect = item.querySelector('[name="epi"]');
  const sizeSelect = item.querySelector('[name="tamanho"]');
  if (!epiSelect || !sizeSelect) return;
  const currentEpi = epiSelect.value;
  const parent = sizeSelect.closest(".field-row");
  if (!parent) return;
  item.dataset.modelDecorated = "1";
  const wrapper = document.createElement("div");
  wrapper.className = "field-row";
  wrapper.innerHTML = `<label style="display:grid;gap:6px"><span class="meta">Modelo (quando aplicável)</span><select class="select" name="modelo">${modelOptions(warehouseFromWorkerPage(), currentEpi)}</select></label>`;
  parent.parentElement?.insertBefore(wrapper, parent);
  const modelSelect = wrapper.querySelector('[name="modelo"]');
  const refresh = () => {
    const model = modelSelect?.value || "";
    sizeSelect.innerHTML = model ? modelSizeOptions(warehouseFromWorkerPage(), currentEpi, model) : '<option value="">Escolher modelo primeiro</option>';
    let info = item.querySelector(".model-stock-info");
    if (!info) { info = document.createElement("div"); info.className = "info-box model-stock-info"; parent.before(info); }
    info.textContent = model ? `Modelo: ${model} · ${money(modelPrice(currentEpi, model))} · Stock: ${modelTotal(warehouseFromWorkerPage(), currentEpi, model)}` : "Escolhe o modelo para controlar stock e custo.";
  };
  modelSelect?.addEventListener("change", refresh);
  refresh();
  epiSelect.addEventListener("change", () => {
    const epi = epiSelect.value;
    if (modelSelect) modelSelect.innerHTML = modelOptions(warehouseFromWorkerPage(), epi);
    refresh();
  });
}

function enhanceDelivery() {
  const form = document.querySelector('form[data-form="delivery"]');
  if (!form || form.dataset.modelEnhanced === "1") return;
  form.dataset.modelEnhanced = "1";
  form.querySelectorAll(".delivery-item").forEach(decorateDelivery);
  const target = form.querySelector("#delivery-items") || form;
  new MutationObserver(() => form.querySelectorAll(".delivery-item").forEach(decorateDelivery)).observe(target, { childList:true, subtree:true });
}

function start() {
  state.observer = new MutationObserver(() => { injectManagerButton(); enhanceDelivery(); });
  state.observer.observe(document.body, { childList:true, subtree:true });
  injectManagerButton();
  enhanceDelivery();
}

start();
