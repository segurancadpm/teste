import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Catálogo central de artigos e famílias.
// As famílias de negócio são fixas: EPI, Equipamento e Ambiente.
// Os artigos ficam na mesma matriz principal para que Orçamento, Compras,
// Stocks e Entregas possam reutilizar a mesma lista.
const MAIN_DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente"];
const DEFAULT_FAMILY = "EPI";
let db = null;
let catalogData = null;
let modalOpen = false;

function getDb() {
  if (db) return db;
  const apps = getApps();
  if (!apps.length) throw new Error("Firebase ainda não foi inicializado.");
  db = getFirestore(getApp());
  return db;
}

const mainRef = () => doc(getDb(), "appdata", MAIN_DOC);
const esc = value => String(value ?? "").replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));

function normalizeFamily(value) {
  return FAMILIES.includes(value) ? value : DEFAULT_FAMILY;
}

function normalizeCatalog(data) {
  if (!Array.isArray(data.matriz)) data.matriz = [];
  data.matriz = data.matriz.map((item, index) => ({
    ...item,
    nome: String(item?.nome || "Artigo sem nome").trim(),
    familia: normalizeFamily(item?.familia),
    ativo: item?.ativo !== false,
    preco: Number.isFinite(Number(item?.preco)) ? Number(item.preco) : 0,
    _catalogIndex: index
  }));
  return data;
}

async function loadCatalog() {
  const snap = await getDoc(mainRef());
  if (!snap.exists()) throw new Error("Não foi encontrado o documento principal de dados.");
  return normalizeCatalog(snap.data());
}

async function saveCatalog(data) {
  const matriz = data.matriz.map(({ _catalogIndex, ...item }) => item);
  await setDoc(mainRef(), { matriz }, { merge: true });
}

function activeItems(data, family) {
  return data.matriz.filter(item => item.ativo !== false && normalizeFamily(item.familia) === family);
}

function injectModalStyles() {
  if (document.getElementById("catalog-family-style")) return;
  const style = document.createElement("style");
  style.id = "catalog-family-style";
  style.textContent = `
    .catalog-modal-backdrop{position:fixed;inset:0;z-index:500;display:grid;place-items:center;background:rgba(2,7,11,.72);padding:20px}
    .catalog-modal{width:min(1050px,96vw);max-height:90vh;overflow:auto;background:#f7fbfd;color:#0d2940;border:1px solid #c6d5dc;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.28);padding:18px}
    .catalog-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
    .catalog-head h2{margin:0;font-size:1.15rem}.catalog-muted{color:#587080;font-size:.84rem}
    .catalog-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.catalog-filter{border:1px solid #b8cbd4;background:#fff;border-radius:7px;padding:8px 12px;cursor:pointer;font-weight:700;color:#17364b}.catalog-filter.active{background:#00a3e0;color:#fff;border-color:#00a3e0}
    .catalog-add{display:grid;grid-template-columns:minmax(220px,1fr) 180px auto;gap:8px;margin:12px 0;padding:12px;border:1px solid #d2dfe5;border-radius:9px;background:#eef7fb}
    .catalog-input,.catalog-select{width:100%;box-sizing:border-box;min-height:38px;border:1px solid #aebfc8;border-radius:7px;padding:7px 9px;background:#fff;color:#122d3d}
    .catalog-btn{border:0;border-radius:7px;padding:8px 13px;background:#00a3e0;color:#fff;font-weight:800;cursor:pointer}.catalog-btn.secondary{background:#fff;color:#17364b;border:1px solid #b8cbd4}.catalog-btn.danger{background:#fff;color:#b42318;border:1px solid #e1aaa5}
    .catalog-table{width:100%;border-collapse:collapse;font-size:.82rem}.catalog-table th,.catalog-table td{padding:8px;border-bottom:1px solid #d5e0e5;text-align:left;vertical-align:middle}.catalog-table th{font-size:.72rem;text-transform:uppercase;color:#48616f}.catalog-table input[type=text]{min-width:230px}.catalog-status{font-weight:700}.catalog-status.off{color:#9a4b00}.catalog-status.on{color:#147044}
    @media(max-width:700px){.catalog-add{grid-template-columns:1fr}.catalog-table{font-size:.75rem}.catalog-table th:nth-child(4),.catalog-table td:nth-child(4){display:none}}
  `;
  document.head.appendChild(style);
}

function closeModal() {
  document.querySelector(".catalog-modal-backdrop")?.remove();
  modalOpen = false;
}

function renderModal(data, filter = "Todos", search = "") {
  injectModalStyles();
  const old = document.querySelector(".catalog-modal-backdrop");
  old?.remove();
  const filtered = data.matriz.filter(item => {
    const familyOk = filter === "Todos" || normalizeFamily(item.familia) === filter;
    const textOk = !search || item.nome.toLocaleLowerCase("pt-PT").includes(search.toLocaleLowerCase("pt-PT"));
    return familyOk && textOk;
  });
  const counts = Object.fromEntries(FAMILIES.map(f => [f, data.matriz.filter(i => normalizeFamily(i.familia) === f).length]));
  const backdrop = document.createElement("div");
  backdrop.className = "catalog-modal-backdrop";
  backdrop.innerHTML = `<div class="catalog-modal" role="dialog" aria-modal="true">
    <div class="catalog-head"><div><h2>Gestão de artigos e famílias</h2><div class="catalog-muted">Catálogo único usado pelas entradas de Compras, Orçamento, Stocks e Entregas.</div></div><button class="catalog-btn secondary" data-catalog-close>Fechar</button></div>
    <div class="catalog-toolbar">
      <button class="catalog-filter ${filter === "Todos" ? "active" : ""}" data-catalog-filter="Todos">Todos (${data.matriz.length})</button>
      ${FAMILIES.map(f => `<button class="catalog-filter ${filter === f ? "active" : ""}" data-catalog-filter="${esc(f)}">${esc(f)} (${counts[f]})</button>`).join("")}
      <input class="catalog-input" style="max-width:260px;margin-left:auto" placeholder="Pesquisar artigo" value="${esc(search)}" data-catalog-search>
    </div>
    <form class="catalog-add" data-catalog-add>
      <input class="catalog-input" name="nome" placeholder="Nome do novo artigo" required maxlength="120">
      <select class="catalog-select" name="familia">${FAMILIES.map(f => `<option>${esc(f)}</option>`).join("")}</select>
      <button class="catalog-btn" type="submit">+ Adicionar artigo</button>
    </form>
    <div style="overflow:auto"><table class="catalog-table"><thead><tr><th>Artigo</th><th>Família</th><th>Estado</th><th>Preço atual</th><th>Ações</th></tr></thead><tbody>
      ${filtered.length ? filtered.map(item => `<tr data-catalog-row="${item._catalogIndex}">
        <td><input class="catalog-input" type="text" value="${esc(item.nome)}" disabled title="O nome de artigos existentes não é alterado para não quebrar o histórico de entregas."></td>
        <td><select class="catalog-select" data-catalog-family><option ${item.familia === "EPI" ? "selected" : ""}>EPI</option><option ${item.familia === "Equipamento" ? "selected" : ""}>Equipamento</option><option ${item.familia === "Ambiente" ? "selected" : ""}>Ambiente</option></select></td>
        <td><label class="catalog-status ${item.ativo === false ? "off" : "on"}"><input type="checkbox" data-catalog-active ${item.ativo === false ? "" : "checked"}> ${item.ativo === false ? "Inativo" : "Ativo"}</label></td>
        <td>${Number(item.preco || 0).toLocaleString("pt-PT", { style:"currency", currency:"EUR" })}</td>
        <td><button type="button" class="catalog-btn secondary" data-catalog-save-row>Guardar</button></td>
      </tr>`).join("") : `<tr><td colspan="5">Não existem artigos nesta seleção.</td></tr>`}
    </tbody></table></div>
    <p class="catalog-muted" style="margin:12px 0 0">Os artigos existentes não são apagados fisicamente: podem ficar <strong>Inativos</strong>. Assim não se perde o histórico de entregas/compras.</p>
  </div>`;
  document.body.appendChild(backdrop);
  modalOpen = true;

  backdrop.addEventListener("click", async event => {
    if (event.target === backdrop || event.target.closest("[data-catalog-close]")) return closeModal();
    const filterButton = event.target.closest("[data-catalog-filter]");
    if (filterButton) return renderModal(data, filterButton.dataset.catalogFilter, backdrop.querySelector("[data-catalog-search]")?.value || "");
    const saveRow = event.target.closest("[data-catalog-save-row]");
    if (saveRow) {
      const row = saveRow.closest("tr");
      const index = Number(row?.dataset.catalogRow);
      const item = data.matriz[index];
      if (!item) return;
      item.familia = normalizeFamily(row.querySelector("[data-catalog-family]")?.value);
      item.ativo = !!row.querySelector("[data-catalog-active]")?.checked;
      try { saveRow.disabled = true; await saveCatalog(data); saveRow.textContent = "Guardado ✓"; setTimeout(() => { if (saveRow.isConnected) saveRow.textContent = "Guardar"; }, 1200); } catch (e) { alert(`Não foi possível guardar: ${e?.message || e}`); } finally { saveRow.disabled = false; }
      return;
    }
  });
  backdrop.querySelector("[data-catalog-add]")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.nome.value.trim();
    const family = normalizeFamily(form.familia.value);
    if (!name) return;
    if (data.matriz.some(item => item.nome.toLocaleLowerCase("pt-PT") === name.toLocaleLowerCase("pt-PT"))) return alert("Já existe um artigo com esse nome.");
    const item = { nome: name, riscos: "", meses: 12, preco: 0, familia: family, ativo: true };
    data.matriz.push(item);
    (data.warehouses || []).forEach(warehouse => {
      if (!data.stocks) data.stocks = {};
      if (!data.stocks[warehouse]) data.stocks[warehouse] = {};
      if (data.stocks[warehouse][name] == null) data.stocks[warehouse][name] = { loose: 0, sizes: {} };
    });
    try { await saveCatalog(data); renderModal(data, family, ""); } catch (e) { data.matriz.pop(); alert(`Não foi possível adicionar: ${e?.message || e}`); }
  });
  backdrop.querySelector("[data-catalog-search]")?.addEventListener("input", event => {
    const value = event.currentTarget.value;
    clearTimeout(event.currentTarget._catalogTimer);
    event.currentTarget._catalogTimer = setTimeout(() => renderModal(data, filter, value), 180);
  });
}

function addManagementButton() {
  const root = document.querySelector(".budget-management-root");
  if (!root || !root.querySelector("[data-budget-tab].active")?.dataset.budgetTab === "compras") return;
  if (root.querySelector("[data-open-catalog]") || !root.querySelector("#purchase-family")) return;
  const heading = root.querySelector(".budget-view .budget-card h3");
  if (!heading) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "catalog-btn secondary";
  button.dataset.openCatalog = "1";
  button.textContent = "⚙ Gerir artigos / famílias";
  button.style.marginLeft = "10px";
  heading.parentElement?.appendChild(button);
  button.addEventListener("click", async () => {
    try { const data = await loadCatalog(); renderModal(data); } catch (e) { alert(`Não foi possível carregar o catálogo: ${e?.message || e}`); }
  });
}

function enhancePurchaseForm() {
  const root = document.querySelector(".budget-management-root");
  if (!root || !root.querySelector("#purchase-family")) return;
  const family = root.querySelector("#purchase-family");
  const epiSelect = root.querySelector("#purchase-epi");
  const productInput = root.querySelector("#purchase-product");
  if (!family || !epiSelect || !productInput) return;

  loadCatalog().then(data => {
    const currentFamily = family.value || "EPI";
    const items = activeItems(data, currentFamily);
    if (currentFamily === "EPI") {
      epiSelect.innerHTML = `<option value="">Selecionar EPI</option>${items.map(i => `<option value="${esc(i.nome)}">${esc(i.nome)}</option>`).join("")}`;
    } else {
      let list = document.getElementById("catalog-product-list");
      if (!list) { list = document.createElement("datalist"); list.id = "catalog-product-list"; document.body.appendChild(list); }
      list.innerHTML = items.map(i => `<option value="${esc(i.nome)}"></option>`).join("");
      productInput.setAttribute("list", "catalog-product-list");
      productInput.placeholder = items.length ? "Selecionar artigo do catálogo" : "Adicionar primeiro o artigo no catálogo";
    }
  }).catch(() => {});

  if (!family.dataset.catalogEnhanced) {
    family.dataset.catalogEnhanced = "1";
    family.addEventListener("change", () => setTimeout(enhancePurchaseForm, 0));
  }
  addManagementButton();
}

// Garante que as compras só aceitam artigos previamente catalogados.
document.addEventListener("click", async event => {
  const button = event.target.closest("[data-add-purchase]");
  if (!button) return;
  const root = button.closest(".budget-management-root");
  const family = root?.querySelector("#purchase-family")?.value || "EPI";
  const product = family === "EPI" ? root?.querySelector("#purchase-epi")?.value : root?.querySelector("#purchase-product")?.value?.trim();
  try {
    const data = await loadCatalog();
    const found = data.matriz.find(item => item.ativo !== false && normalizeFamily(item.familia) === family && item.nome === product);
    if (!found) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert(`O artigo "${product || ""}" não está registado na família ${family}.\n\nVai a «Gerir artigos / famílias» e adiciona-o ao catálogo primeiro.`);
    }
  } catch (e) {
    event.preventDefault();
    event.stopImmediatePropagation();
    alert("Não foi possível validar o catálogo. Tenta novamente.");
  }
}, true);

document.addEventListener("click", event => {
  if (event.target.closest("[data-budget-tab=\"compras\"]")) setTimeout(enhancePurchaseForm, 80);
});
setTimeout(enhancePurchaseForm, 120);
setInterval(() => {
  if (!modalOpen) enhancePurchaseForm();
}, 800);
