import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs,
  deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Módulo único de gestão financeira. Não cria Firebase nem altera a estrutura
// principal da aplicação: lê o mesmo appdata/dpm_epi_data_v1 usado pelo app.js.
const MAIN_DOC = "dpm_epi_data_v1";
const ARCHIVE_COLLECTION = "budget_archive";
const FAMILIES = ["EPI", "Equipamento", "Ambiente"];
const QUARTERS = ["T1", "T2", "T3", "T4"];
const TABS = [
  ["resumo", "Resumo"],
  ["orcamento", "Orçamento"],
  ["compras", "Compras"],
  ["custo", "Custo / Funcionário"],
  ["arquivo", "Arquivo"]
];
const TAB_KEY = "dpm.budget.activeTab";

let db = null;
let activeTab = "resumo";
let rendering = false;
let lastBudgetMain = null;

try {
  const saved = sessionStorage.getItem(TAB_KEY);
  if (TABS.some(([id]) => id === saved)) activeTab = saved;
} catch (_) {}

function getDb() {
  if (db) return db;
  const apps = getApps();
  if (!apps.length) throw new Error("Firebase ainda não foi inicializado.");
  db = getFirestore(getApp());
  return db;
}

const mainRef = () => doc(getDb(), "appdata", MAIN_DOC);
const num = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return 0;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};
const euro = value => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(num(value));
const esc = value => String(value ?? "").replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const quarterOf = date => {
  const d = new Date(`${String(date || "").slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "T1" : `T${Math.floor(d.getMonth() / 3) + 1}`;
};
const epis = data => Array.isArray(data?.matriz) ? data.matriz : [];
const workers = data => Array.isArray(data?.trabalhadores) ? data.trabalhadores : [];
const deliveries = data => Array.isArray(data?.eventos) ? data.eventos : [];

function management(data) {
  if (!data.budget || typeof data.budget !== "object") data.budget = {};
  if (!data.budget.management || typeof data.budget.management !== "object") data.budget.management = {};
  const m = data.budget.management;
  if (!m.planning || typeof m.planning !== "object") m.planning = {};
  if (!Array.isArray(m.purchases)) m.purchases = [];
  return m;
}

function legacyPlanning(data) {
  const items = Array.isArray(data?.budget?.items) ? data.budget.items : [];
  const result = new Map();
  items.forEach(item => {
    const name = item?.nome ?? item?.name ?? item?.epi ?? item?.artigo;
    if (!name) return;
    const price = item?.unitPrice ?? item?.preco ?? item?.price;
    const qty = item?.authorizedQty ?? item?.quantidadeAutorizada ?? item?.quantidade ?? item?.qty;
    result.set(String(name), { price: num(price), qty: num(qty) });
  });
  return result;
}

async function loadData() {
  const snap = await getDoc(mainRef());
  if (!snap.exists()) throw new Error("Não foi encontrado o documento principal de dados.");
  const data = snap.data();
  management(data);
  return data;
}

async function saveManagement(data) {
  management(data);
  await setDoc(mainRef(), { budget: data.budget }, { merge: true });
}

function budgetMain() {
  const title = document.querySelector(".screen-title h1");
  const main = document.querySelector("main");
  return title?.textContent.trim() === "Orçamento" && main ? main : null;
}

function ensureRoot(main) {
  let root = main.querySelector(":scope > .budget-management-root");
  if (!root) {
    root = document.createElement("section");
    root.className = "budget-management-root";
    const header = main.querySelector(":scope > .screen-title");
    if (header) header.insertAdjacentElement("afterend", root);
    else main.insertBefore(root, main.firstChild);
  }
  [...main.children].forEach(child => {
    if (child !== root && child.classList.contains("section")) child.style.display = "none";
  });
  return root;
}

function tabsHtml() {
  return `<nav class="budget-management-tabs" role="tablist" aria-label="Módulos do orçamento">
    ${TABS.map(([id, label]) => `<button type="button" role="tab" class="budget-management-tab ${activeTab === id ? "active" : ""}" data-budget-tab="${id}" aria-selected="${activeTab === id}">${label}</button>`).join("")}
  </nav>`;
}

function planningRows(data) {
  const m = management(data);
  const legacy = legacyPlanning(data);
  const matrixPrices = new Map(epis(data).map(e => [e.nome, num(e.preco)]));
  const names = new Set([...Object.keys(m.planning), ...legacy.keys(), ...epis(data).map(e => e.nome)]);
  return [...names].filter(Boolean).map(name => {
    const current = m.planning[name] || {};
    const old = legacy.get(name);
    const price = num(current.unitPrice ?? old?.price ?? matrixPrices.get(name));
    const qty = num(current.authorizedQty ?? old?.qty);
    return { name, price, qty, total: price * qty };
  });
}

function purchaseTotal(purchase) {
  return num(purchase.quantity) * num(purchase.unitPrice);
}

function renderChart(values) {
  const max = Math.max(1, ...QUARTERS.map(q => values[q] || 0));
  return `<div class="chart-bars">${QUARTERS.map(q => {
    const value = values[q] || 0;
    const height = Math.max(4, (value / max) * 150);
    return `<div class="chart-col"><span>${euro(value)}</span><div class="chart-bar" style="height:${height}px"></div><b>${q}</b></div>`;
  }).join("")}</div>`;
}

function renderSummary(data) {
  const m = management(data);
  const purchases = m.purchases;
  const planned = planningRows(data).reduce((sum, row) => sum + row.total, 0);
  const spent = purchases.reduce((sum, purchase) => sum + purchaseTotal(purchase), 0);
  const byFamily = Object.fromEntries(FAMILIES.map(f => [f, 0]));
  const byQuarter = Object.fromEntries(QUARTERS.map(q => [q, 0]));
  purchases.forEach(p => {
    const value = purchaseTotal(p);
    if (byFamily[p.family] !== undefined) byFamily[p.family] += value;
    if (byQuarter[p.quarter] !== undefined) byQuarter[p.quarter] += value;
  });
  const execution = planned ? spent / planned * 100 : 0;
  return `<div class="budget-view">
    <div class="budget-kpis">
      <article><span>Orçamento planeado</span><strong>${euro(planned)}</strong></article>
      <article><span>Gasto realizado</span><strong>${euro(spent)}</strong></article>
      <article><span>Saldo</span><strong>${euro(planned - spent)}</strong></article>
      <article><span>Execução</span><strong>${execution.toFixed(1)}%</strong></article>
    </div>
    <div class="budget-grid-2">
      <section class="budget-card"><h3>Gasto por família</h3>${FAMILIES.map(f => `<div class="metric-row"><span>${f}</span><strong>${euro(byFamily[f])}</strong></div>`).join("")}</section>
      <section class="budget-card"><h3>Gasto por trimestre</h3>${QUARTERS.map(q => `<div class="metric-row"><span>${q}</span><strong>${euro(byQuarter[q])}</strong></div>`).join("")}</section>
    </div>
    <section class="budget-card"><h3>Evolução trimestral</h3>${renderChart(byQuarter)}</section>
  </div>`;
}

function renderPlanning(data) {
  const rows = planningRows(data);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return `<div class="budget-view">
    <div class="budget-help"><strong>Regra:</strong> quantidade autorizada × preço unitário. O gasto real é registado apenas em <strong>Compras</strong>.</div>
    <section class="budget-card">
      <div class="section-head"><div><h3>Planeamento</h3><p class="muted">Introduz o preço unitário e a quantidade autorizada. Guarda no final.</p></div><strong>${euro(total)}</strong></div>
      <div class="table-wrap"><table class="budget-table"><thead><tr><th>EPI</th><th>Preço unitário (€)</th><th>Qtd. autorizada</th><th>Orçamento</th></tr></thead><tbody>
      ${rows.map(row => `<tr><td>${esc(row.name)}</td><td><input type="number" min="0" step="0.01" data-plan-price="${esc(row.name)}" value="${row.price ? row.price : ""}" placeholder="0,00"></td><td><input type="number" min="0" step="1" data-plan-qty="${esc(row.name)}" value="${row.qty ? row.qty : ""}" placeholder="0"></td><td data-plan-total="${esc(row.name)}">${euro(row.total)}</td></tr>`).join("")}
      </tbody></table></div>
      <button type="button" class="primary" data-save-planning>Guardar planeamento</button>
    </section>
  </div>`;
}

function renderPurchases(data) {
  const m = management(data);
  const rows = m.purchases.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const epiOptions = epis(data).map(e => `<option value="${esc(e.nome)}">${esc(e.nome)}</option>`).join("");
  const total = rows.reduce((sum, p) => sum + purchaseTotal(p), 0);
  return `<div class="budget-view">
    <section class="budget-card"><h3>Registar compra</h3><div class="form-grid">
      <label>Família<select id="purchase-family"><option>EPI</option><option>Equipamento</option><option>Ambiente</option></select></label>
      <label>Trimestre<select id="purchase-quarter">${QUARTERS.map(q => `<option>${q}</option>`).join("")}</select></label>
      <label>Data<input id="purchase-date" type="date" value="${today()}"></label>
      <label id="purchase-epi-wrap">EPI<select id="purchase-epi"><option value="">Selecionar EPI</option>${epiOptions}</select></label>
      <label id="purchase-product-wrap" class="wide" style="display:none">Produto<input id="purchase-product" placeholder="Produto / equipamento / serviço"></label>
      <label>Quantidade<input id="purchase-quantity" type="number" min="0" step="1"></label>
      <label>Preço unitário (€)<input id="purchase-price" type="number" min="0" step="0.01"></label>
      <label>Fornecedor<input id="purchase-supplier"></label>
      <label>N.º fatura<input id="purchase-invoice"></label>
    </div><button type="button" class="primary" data-add-purchase>Registar compra</button></section>
    <section class="budget-card"><div class="section-head"><div><h3>Compras registadas</h3><p class="muted">Família e trimestre ficam associados à própria compra.</p></div><strong>${euro(total)}</strong></div>
    <div class="table-wrap"><table class="budget-table"><thead><tr><th>Data</th><th>Família</th><th>Trimestre</th><th>Produto</th><th>Qtd.</th><th>Preço</th><th>Total</th><th>Fornecedor</th><th></th></tr></thead><tbody>
    ${rows.length ? rows.map(p => `<tr><td>${esc(p.date)}</td><td>${esc(p.family)}</td><td>${esc(p.quarter)}</td><td>${esc(p.product)}</td><td>${num(p.quantity)}</td><td>${euro(p.unitPrice)}</td><td>${euro(purchaseTotal(p))}</td><td>${esc(p.supplier)}</td><td><button type="button" class="danger-link" data-archive-purchase="${esc(p.id)}">Arquivar</button></td></tr>`).join("") : `<tr><td colspan="9">Ainda não existem compras registadas.</td></tr>`}
    </tbody></table></div></section>
  </div>`;
}

function renderCostByEmployee(data) {
  const priceMap = new Map(epis(data).map(e => [e.nome, num(e.preco)]));
  const result = new Map();
  deliveries(data).forEach(event => {
    const workerId = event.worker_id ?? event.trabalhador_id ?? event.workerId;
    const worker = workers(data).find(w => String(w.id) === String(workerId));
    const name = worker?.nome || event.trabalhador || event.worker_name || `Trabalhador ${workerId || ""}`;
    const product = event.epi_type || event.epi || event.nomeEpi || event.nome || "EPI";
    const quantity = num(event.qtd ?? event.quantidade ?? event.qty) || 1;
    const unitPrice = num(event.preco ?? event.unitPrice ?? priceMap.get(product));
    const key = String(workerId || name);
    if (!result.has(key)) result.set(key, { name, function: worker?.funcao || "", delegation: worker?.delegacao || "", quantity: 0, cost: 0 });
    const row = result.get(key);
    row.quantity += quantity;
    row.cost += quantity * unitPrice;
  });
  const rows = [...result.values()].sort((a, b) => b.cost - a.cost);
  return `<div class="budget-view"><section class="budget-card"><h3>Custo por Funcionário</h3><p class="muted">Calculado a partir das entregas registadas. O gasto trimestral não é tratado neste módulo.</p>
    <div class="table-wrap"><table class="budget-table"><thead><tr><th>Funcionário</th><th>Função</th><th>Delegação</th><th>Qtd. EPI</th><th>Custo</th></tr></thead><tbody>
    ${rows.length ? rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.function)}</td><td>${esc(r.delegation)}</td><td>${r.quantity}</td><td>${euro(r.cost)}</td></tr>`).join("") : `<tr><td colspan="5">Ainda não existem entregas suficientes para calcular custos.</td></tr>`}
    </tbody></table></div></section></div>`;
}

async function renderArchive() {
  const snap = await getDocs(collection(getDb(), ARCHIVE_COLLECTION));
  const rows = snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `<div class="budget-view"><section class="budget-card"><div class="section-head"><div><h3>Arquivo</h3><p class="muted">Histórico retirado da vista principal, sem apagar os dados.</p></div><strong>${rows.length} registos</strong></div>
    <div class="table-wrap"><table class="budget-table"><thead><tr><th>Data</th><th>Família</th><th>Trimestre</th><th>Produto</th><th>Qtd.</th><th>Total</th><th></th></tr></thead><tbody>
    ${rows.length ? rows.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.family)}</td><td>${esc(r.quarter)}</td><td>${esc(r.product)}</td><td>${num(r.quantity)}</td><td>${euro(purchaseTotal(r))}</td><td><button type="button" class="danger-link" data-delete-archive="${esc(r.id)}">Apagar</button></td></tr>`).join("") : `<tr><td colspan="7">O arquivo está vazio.</td></tr>`}
    </tbody></table></div></section></div>`;
}

async function render() {
  const main = budgetMain();
  if (!main || rendering) return;
  rendering = true;
  try {
    const root = ensureRoot(main);
    root.innerHTML = `${tabsHtml()}<div class="budget-loading">A carregar...</div>`;
    const data = await loadData();
    let body;
    if (activeTab === "resumo") body = renderSummary(data);
    else if (activeTab === "orcamento") body = renderPlanning(data);
    else if (activeTab === "compras") body = renderPurchases(data);
    else if (activeTab === "custo") body = renderCostByEmployee(data);
    else body = await renderArchive();
    root.innerHTML = tabsHtml() + body;
    bind(root, data);
    lastBudgetMain = main;
  } catch (error) {
    const root = ensureRoot(main);
    root.innerHTML = tabsHtml() + `<div class="budget-error">Não foi possível carregar o módulo: ${esc(error?.message || error)}</div>`;
  } finally {
    rendering = false;
  }
}

function bind(root, data) {
  root.querySelectorAll("[data-budget-tab]").forEach(button => button.addEventListener("click", () => {
    activeTab = button.dataset.budgetTab;
    try { sessionStorage.setItem(TAB_KEY, activeTab); } catch (_) {}
    render();
  }));

  root.querySelectorAll("[data-plan-price], [data-plan-qty]").forEach(input => input.addEventListener("input", () => {
    const name = input.dataset.planPrice || input.dataset.planQty;
    const price = num(root.querySelector(`[data-plan-price="${CSS.escape(name)}"]`)?.value);
    const qty = num(root.querySelector(`[data-plan-qty="${CSS.escape(name)}"]`)?.value);
    const total = root.querySelector(`[data-plan-total="${CSS.escape(name)}"]`);
    if (total) total.textContent = euro(price * qty);
  }));

  root.querySelector("[data-save-planning]")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const fresh = await loadData();
      const m = management(fresh);
      root.querySelectorAll("[data-plan-price]").forEach(input => {
        const name = input.dataset.planPrice;
        if (!m.planning[name]) m.planning[name] = {};
        m.planning[name].unitPrice = num(input.value);
        const qty = root.querySelector(`[data-plan-qty="${CSS.escape(name)}"]`);
        m.planning[name].authorizedQty = num(qty?.value);
      });
      await saveManagement(fresh);
      button.textContent = "Guardado ✓";
      setTimeout(() => { if (button.isConnected) button.textContent = "Guardar planeamento"; }, 1400);
    } catch (error) {
      alert(`Não foi possível guardar: ${error?.message || error}`);
    } finally { button.disabled = false; }
  });

  const family = root.querySelector("#purchase-family");
  const epiWrap = root.querySelector("#purchase-epi-wrap");
  const productWrap = root.querySelector("#purchase-product-wrap");
  const epi = root.querySelector("#purchase-epi");
  const product = root.querySelector("#purchase-product");
  const price = root.querySelector("#purchase-price");
  const syncFamily = () => {
    const isEpi = family?.value === "EPI";
    if (epiWrap) epiWrap.style.display = isEpi ? "grid" : "none";
    if (productWrap) productWrap.style.display = isEpi ? "none" : "grid";
  };
  family?.addEventListener("change", syncFamily);
  epi?.addEventListener("change", () => {
    const item = epis(data).find(e => e.nome === epi.value);
    if (item && num(item.preco)) price.value = num(item.preco);
  });
  syncFamily();

  root.querySelector("[data-add-purchase]")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    const familyValue = family?.value || "EPI";
    const productValue = familyValue === "EPI" ? epi?.value : product?.value?.trim();
    const quantity = num(root.querySelector("#purchase-quantity")?.value);
    const unitPrice = num(price?.value);
    if (!productValue) return alert("Indica o produto/EPI.");
    if (quantity <= 0) return alert("Indica uma quantidade superior a zero.");
    button.disabled = true;
    try {
      const fresh = await loadData();
      const m = management(fresh);
      const date = root.querySelector("#purchase-date")?.value || today();
      m.purchases.push({
        id: `purchase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        family: familyValue,
        quarter: root.querySelector("#purchase-quarter")?.value || quarterOf(date),
        product: productValue,
        quantity,
        unitPrice,
        supplier: root.querySelector("#purchase-supplier")?.value?.trim() || "",
        invoice: root.querySelector("#purchase-invoice")?.value?.trim() || "",
        createdAt: new Date().toISOString()
      });
      await saveManagement(fresh);
      await render();
    } catch (error) { alert(`Não foi possível registar: ${error?.message || error}`); } finally { button.disabled = false; }
  });

  root.querySelectorAll("[data-archive-purchase]").forEach(button => button.addEventListener("click", async () => {
    const fresh = await loadData();
    const m = management(fresh);
    const item = m.purchases.find(p => p.id === button.dataset.archivePurchase);
    if (!item || !confirm(`Arquivar a compra de ${item.product}?`)) return;
    await addDoc(collection(getDb(), ARCHIVE_COLLECTION), { ...item, archivedAt: serverTimestamp() });
    m.purchases = m.purchases.filter(p => p.id !== item.id);
    await saveManagement(fresh);
    await render();
  }));

  root.querySelectorAll("[data-delete-archive]").forEach(button => button.addEventListener("click", async () => {
    if (!confirm("Apagar definitivamente este registo do Arquivo?")) return;
    await deleteDoc(doc(getDb(), ARCHIVE_COLLECTION, button.dataset.deleteArchive));
    await render();
  }));
}

// A aplicação principal controla a navegação. Não usamos MutationObserver:
// basta detetar o clique que abre Orçamento e renderizar depois do app.js.
document.addEventListener("click", event => {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.textContent.trim() === "Orçamento") setTimeout(render, 0);
}, true);

// Se a página já estiver aberta quando este módulo é carregado.
setTimeout(render, 0);

// Pequena verificação, sem observar o DOM: recupera a página caso a navegação
// interna seja feita por código e não por um clique.
setInterval(() => {
  const main = budgetMain();
  if (main && main !== lastBudgetMain && !rendering) render();
}, 700);
