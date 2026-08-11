import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, addDoc, deleteDoc,
  writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/*
 * Orçamento / Compras / Custo por Funcionário / Arquivo
 *
 * Este módulo não cria uma segunda aplicação Firebase nem uma segunda lista
 * de EPI. Usa o mesmo documento appdata/dpm_epi_data_v1 da aplicação principal.
 */
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
const STORAGE_TAB = "dpm.budget.activeTab";

let db = null;
let activeTab = "resumo";
let root = null;
let bound = false;
let observer = null;
let dataCache = null;

try {
  const saved = sessionStorage.getItem(STORAGE_TAB);
  if (TABS.some(([id]) => id === saved)) activeTab = saved;
} catch (_) {}

function getDb() {
  if (db) return db;
  const apps = getApps();
  if (!apps.length) throw new Error("Firebase ainda não foi inicializado.");
  db = getFirestore(getApp());
  return db;
}

function money(v) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(v) || 0);
}
function num(v) {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function esc(v) {
  return String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}
function quarter(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "T1";
  return `T${Math.floor(d.getMonth() / 3) + 1}`;
}
function year(dateValue) {
  const d = new Date(dateValue);
  return Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function idFor(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9À-ÿ]+/gi, "-").replace(/^-|-$/g, "");
}
function getEvents(data) {
  return Array.isArray(data?.eventos) ? data.eventos : [];
}
function getEmployees(data) {
  return Array.isArray(data?.trabalhadores) ? data.trabalhadores : [];
}
function getEpis(data) {
  return Array.isArray(data?.matriz) ? data.matriz : [];
}
function management(data) {
  if (!data.budget || typeof data.budget !== "object") data.budget = {};
  if (!data.budget.management || typeof data.budget.management !== "object") data.budget.management = {};
  const m = data.budget.management;
  if (!m.planning || typeof m.planning !== "object") m.planning = {};
  if (!Array.isArray(m.purchases)) m.purchases = [];
  return m;
}

async function loadData() {
  const snap = await getDoc(doc(getDb(), "appdata", MAIN_DOC));
  if (!snap.exists()) throw new Error("O documento principal de dados ainda não existe.");
  const data = snap.data();
  management(data);
  dataCache = data;
  return data;
}

async function saveManagement(data) {
  management(data);
  await setDoc(doc(getDb(), "appdata", MAIN_DOC), { budget: data.budget }, { merge: true });
  dataCache = data;
}

function budgetPage() {
  const title = document.querySelector(".screen-title h1");
  const main = document.querySelector("main");
  return title && main && title.textContent.trim() === "Orçamento" ? main : null;
}

function ensureRoot(main) {
  let el = main.querySelector(".budget-management-root");
  if (!el) {
    el = document.createElement("section");
    el.className = "budget-management-root";
    main.insertBefore(el, main.firstChild);
  }
  [...main.children].forEach(child => {
    if (child !== el && child.classList.contains("section")) child.style.display = "none";
  });
  root = el;
  return el;
}

function navHtml() {
  return `<nav class="budget-management-tabs" role="tablist" aria-label="Módulos do orçamento">
    ${TABS.map(([id, label]) => `<button type="button" role="tab" class="budget-management-tab ${activeTab === id ? "active" : ""}" data-budget-tab="${id}" aria-selected="${activeTab === id}">${label}</button>`).join("")}
  </nav>`;
}

function planningRows(data) {
  const m = management(data);
  const prices = new Map(getEpis(data).map(e => [e.nome, num(e.preco)]));
  const entries = Object.entries(m.planning);
  const names = new Set(entries.map(([k]) => k));
  getEpis(data).forEach(e => names.add(e.nome));
  return [...names].map(name => {
    const p = m.planning[name] || {};
    const price = num(p.unitPrice ?? prices.get(name));
    const qty = num(p.authorizedQty);
    return { name, price, qty, total: price * qty };
  });
}

function renderSummary(data) {
  const m = management(data);
  const purchases = m.purchases;
  const planning = planningRows(data);
  const budget = planning.reduce((s, x) => s + x.total, 0);
  const spent = purchases.reduce((s, p) => s + num(p.quantity) * num(p.unitPrice), 0);
  const byFamily = Object.fromEntries(FAMILIES.map(f => [f, 0]));
  const byQuarter = Object.fromEntries(QUARTERS.map(q => [q, 0]));
  purchases.forEach(p => {
    const value = num(p.quantity) * num(p.unitPrice);
    if (byFamily[p.family] !== undefined) byFamily[p.family] += value;
    if (byQuarter[p.quarter] !== undefined) byQuarter[p.quarter] += value;
  });
  const remaining = budget - spent;
  const execution = budget ? (spent / budget) * 100 : 0;
  return `<div class="budget-view">
    <div class="budget-kpis">
      <article><span>Orçamento planeado</span><strong>${money(budget)}</strong></article>
      <article><span>Gasto realizado</span><strong>${money(spent)}</strong></article>
      <article><span>Saldo</span><strong>${money(remaining)}</strong></article>
      <article><span>Execução</span><strong>${execution.toFixed(1)}%</strong></article>
    </div>
    <div class="budget-grid-2">
      <section class="budget-card"><h3>Gasto por família</h3>${FAMILIES.map(f => `<div class="metric-row"><span>${f}</span><strong>${money(byFamily[f])}</strong></div>`).join("")}</section>
      <section class="budget-card"><h3>Gasto por trimestre</h3>${QUARTERS.map(q => `<div class="metric-row"><span>${q}</span><strong>${money(byQuarter[q])}</strong></div>`).join("")}</section>
    </div>
    <section class="budget-card"><h3>Evolução trimestral</h3><div class="quarter-chart" aria-label="Gasto por trimestre">${renderChart(byQuarter)}</div></section>
  </div>`;
}

function renderChart(values) {
  const max = Math.max(1, ...QUARTERS.map(q => values[q]));
  return `<div class="chart-bars">${QUARTERS.map(q => {
    const h = Math.max(4, (values[q] / max) * 150);
    return `<div class="chart-col"><span>${money(values[q])}</span><div class="chart-bar" style="height:${h}px"></div><b>${q}</b></div>`;
  }).join("")}</div>`;
}

function renderPlanning(data) {
  const rows = planningRows(data);
  return `<div class="budget-view"><div class="budget-help"><strong>Orçamento:</strong> quantidade autorizada × preço unitário. O gasto real é registado apenas em <strong>Compras</strong>.</div>
    <div class="table-wrap"><table class="budget-table"><thead><tr><th>EPI</th><th>Preço unitário</th><th>Qtd. autorizada</th><th>Orçamento</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.name)}</td><td>${money(r.price)}</td><td><input type="number" min="0" step="1" data-plan-name="${esc(r.name)}" value="${r.qty || ""}" placeholder="0"></td><td>${money(r.total)}</td></tr>`).join("")}
    </tbody></table></div><button type="button" class="primary" data-action="save-planning">Guardar planeamento</button></div>`;
}

function purchaseForm(data) {
  const epis = getEpis(data);
  const todayDate = today();
  return `<section class="budget-card purchase-form"><h3>Registar compra</h3>
    <div class="form-grid">
      <label>Família<select id="purchase-family"><option>EPI</option><option>Equipamento</option><option>Ambiente</option></select></label>
      <label>Trimestre<select id="purchase-quarter">${QUARTERS.map(q => `<option>${q}</option>`).join("")}</select></label>
      <label>Data<input id="purchase-date" type="date" value="${todayDate}"></label>
      <label>EPI<select id="purchase-epi">${epis.map(e => `<option value="${esc(e.nome)}">${esc(e.nome)}</option>`).join("")}</select></label>
      <label class="wide">Produto (Equipamento/Ambiente)<input id="purchase-product" placeholder="Nome do produto"></label>
      <label>Quantidade<input id="purchase-qty" type="number" min="0" step="1"></label>
      <label>Preço unitário (€)<input id="purchase-price" type="number" min="0" step="0.01"></label>
      <label>Fornecedor<input id="purchase-supplier"></label>
      <label>N.º fatura<input id="purchase-invoice"></label>
    </div><button type="button" class="primary" data-action="add-purchase">Registar compra</button>
  </section>`;
}

function renderPurchases(data) {
  const purchases = management(data).purchases.slice().sort((a,b) => String(b.date).localeCompare(String(a.date)));
  const total = purchases.reduce((s,p)=>s+num(p.quantity)*num(p.unitPrice),0);
  return `<div class="budget-view">${purchaseForm(data)}
    <section class="budget-card"><div class="section-head"><h3>Compras registadas</h3><strong>${money(total)}</strong></div>
      <div class="table-wrap"><table class="budget-table"><thead><tr><th>Data</th><th>Família</th><th>Trimestre</th><th>Produto</th><th>Qtd.</th><th>Preço</th><th>Total</th><th></th></tr></thead><tbody>
      ${purchases.length ? purchases.map(p => `<tr><td>${esc(p.date)}</td><td>${esc(p.family)}</td><td>${esc(p.quarter)}</td><td>${esc(p.product)}</td><td>${num(p.quantity)}</td><td>${money(p.unitPrice)}</td><td>${money(num(p.quantity)*num(p.unitPrice))}</td><td><button type="button" class="danger-link" data-archive-purchase="${esc(p.id)}">Arquivar</button></td></tr>`).join("") : `<tr><td colspan="8">Ainda não existem compras registadas.</td></tr>`}
      </tbody></table></div></section></div>`;
}

function renderCostByEmployee(data) {
  const prices = new Map(getEpis(data).map(e => [e.nome, num(e.preco)]));
  const rows = new Map();
  getEvents(data).forEach(e => {
    const workerId = e.worker_id ?? e.trabalhador_id ?? e.workerId;
    const worker = getEmployees(data).find(w => String(w.id) === String(workerId));
    const name = worker?.nome || e.trabalhador || e.worker_name || `Trabalhador ${workerId || ""}`;
    const product = e.epi_type || e.epi || e.nomeEpi || e.nome || "EPI";
    const qty = num(e.qtd ?? e.quantidade ?? e.qty) || 1;
    const price = prices.get(product) ?? num(e.preco ?? e.unitPrice);
    const key = `${workerId || name}`;
    if (!rows.has(key)) rows.set(key, { name, function: worker?.funcao || "", delegation: worker?.delegacao || "", qty: 0, cost: 0 });
    const r = rows.get(key); r.qty += qty; r.cost += qty * price;
  });
  const values = [...rows.values()].sort((a,b)=>b.cost-a.cost);
  return `<div class="budget-view"><section class="budget-card"><div class="section-head"><div><h3>Custo por Funcionário</h3><p class="muted">Calculado a partir das entregas efetivamente registadas. Não existe aqui a métrica antiga de gasto por trimestre.</p></div></div>
    <div class="table-wrap"><table class="budget-table"><thead><tr><th>Funcionário</th><th>Função</th><th>Delegação</th><th>Qtd. EPI</th><th>Custo</th></tr></thead><tbody>${values.length ? values.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.function)}</td><td>${esc(r.delegation)}</td><td>${r.qty}</td><td>${money(r.cost)}</td></tr>`).join("") : `<tr><td colspan="5">Ainda não existem entregas suficientes para calcular custos.</td></tr>`}</tbody></table></div></section></div>`;
}

async function archivePurchase(id) {
  const data = dataCache || await loadData();
  const m = management(data);
  const item = m.purchases.find(p => p.id === id);
  if (!item) return;
  if (!confirm(`Arquivar a compra de ${item.product}?\n\nA compra sai da vista principal mas fica guardada no Arquivo.`)) return;
  await addDoc(collection(getDb(), ARCHIVE_COLLECTION), { ...item, archivedAt: serverTimestamp() });
  m.purchases = m.purchases.filter(p => p.id !== id);
  await saveManagement(data);
  await renderActive();
}

async function renderArchive() {
  const snap = await getDoc(doc(getDb(), "appdata", MAIN_DOC));
  const data = snap.exists() ? snap.data() : {};
  const m = management(data);
  let archiveSnap = { docs: [] };
  try { archiveSnap = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js").then(async mod => ({ docs: await mod.getDocs(collection(getDb(), ARCHIVE_COLLECTION)) })).catch(() => ({ docs: [] })); } catch (_) {}
  const archived = archiveSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  return `<div class="budget-view"><section class="budget-card"><div class="section-head"><div><h3>Arquivo</h3><p class="muted">Histórico retirado da vista principal. Os registos arquivados permanecem no Firestore.</p></div><strong>${archived.length} registo(s)</strong></div>
    <div class="table-wrap"><table class="budget-table"><thead><tr><th>Data</th><th>Família</th><th>Trimestre</th><th>Produto</th><th>Qtd.</th><th>Total</th></tr></thead><tbody>${archived.length ? archived.map(p=>`<tr><td>${esc(p.date)}</td><td>${esc(p.family)}</td><td>${esc(p.quarter)}</td><td>${esc(p.product)}</td><td>${num(p.quantity)}</td><td>${money(num(p.quantity)*num(p.unitPrice))}</td></tr>`).join("") : `<tr><td colspan="6">O Arquivo está vazio.</td></tr>`}</tbody></table></div></section></div>`;
}

async function renderActive() {
  if (!root) return;
  root.innerHTML = `${navHtml()}<div class="budget-content"><div class="budget-loading">A carregar…</div></div>`;
  try {
    const data = await loadData();
    const content = root.querySelector(".budget-content");
    if (activeTab === "resumo") content.innerHTML = renderSummary(data);
    else if (activeTab === "orcamento") content.innerHTML = renderPlanning(data);
    else if (activeTab === "compras") content.innerHTML = renderPurchases(data);
    else if (activeTab === "custo") content.innerHTML = renderCostByEmployee(data);
    else content.innerHTML = await renderArchive();
    bindView();
  } catch (err) {
    root.querySelector(".budget-content").innerHTML = `<div class="budget-error">Não foi possível carregar o módulo: ${esc(err.message || err)}</div>`;
  }
}

function bindView() {
  if (!root) return;
  root.querySelectorAll("[data-budget-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.budgetTab;
      try { sessionStorage.setItem(STORAGE_TAB, activeTab); } catch (_) {}
      renderActive();
    });
  });

  root.querySelector("[data-action='save-planning']")?.addEventListener("click", async () => {
    const data = dataCache || await loadData();
    const m = management(data);
    root.querySelectorAll("[data-plan-name]").forEach(input => {
      const name = input.dataset.planName;
      const current = m.planning[name] || {};
      m.planning[name] = { ...current, family: "EPI", authorizedQty: num(input.value) };
    });
    await saveManagement(data);
    await renderActive();
  });

  root.querySelector("[data-action='add-purchase']")?.addEventListener("click", async () => {
    const data = dataCache || await loadData();
    const family = root.querySelector("#purchase-family").value;
    const date = root.querySelector("#purchase-date").value || today();
    const q = root.querySelector("#purchase-quarter").value || quarter(date);
    const product = family === "EPI" ? root.querySelector("#purchase-epi").value : root.querySelector("#purchase-product").value.trim();
    const quantity = num(root.querySelector("#purchase-qty").value);
    const unitPrice = num(root.querySelector("#purchase-price").value);
    if (!product || quantity <= 0 || unitPrice < 0) { alert("Preenche família, produto, quantidade e preço unitário."); return; }
    const m = management(data);
    m.purchases.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, family, quarter: q, date, product, quantity, unitPrice, supplier: root.querySelector("#purchase-supplier").value.trim(), invoice: root.querySelector("#purchase-invoice").value.trim(), createdAt: Date.now() });
    await saveManagement(data);
    await renderActive();
  });

  root.querySelectorAll("[data-archive-purchase]").forEach(btn => btn.addEventListener("click", () => archivePurchase(btn.dataset.archivePurchase)));
}

function install() {
  const main = budgetPage();
  if (!main) return;
  ensureRoot(main);
  if (!bound) {
    bound = true;
    renderActive();
  }
}

function watch() {
  install();
  if (!observer) {
    observer = new MutationObserver(() => {
      const main = budgetPage();
      if (!main) { root = null; bound = false; return; }
      const previous = root;
      ensureRoot(main);
      if (!previous || previous !== root || !root.querySelector(".budget-management-tabs")) {
        bound = false;
        renderActive();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

watch();
