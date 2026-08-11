import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Correção isolada: cruza entregas reais com preços do Orçamento e acrescenta
// apresentação por família à matriz consolidada de stocks. Não altera dados.
const MAIN_DOC = "dpm_epi_data_v1";
const DELIVERY_COLLECTION = "deliveries";
const FAMILIES = ["Todos", "EPI", "Equipamento", "Ambiente"];
let runningCost = false;
let lastCostRoot = null;
let stockFamily = "Todos";
let stockDataSignature = "";
let initialized = false;

const db = () => getFirestore(getApp());
const num = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return 0;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};
const euro = value => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(num(value));
const norm = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const familyOf = item => {
  const f = item?.familia ?? item?.family;
  return ["EPI", "Equipamento", "Ambiente"].includes(f) ? f : "EPI";
};
const esc = value => String(value ?? "").replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));

async function mainData() {
  const snap = await getDoc(doc(db(), "appdata", MAIN_DOC));
  return snap.exists() ? snap.data() : {};
}

function priceMap(data) {
  const map = new Map();
  const put = (name, price) => {
    const key = norm(name);
    if (!key) return;
    const value = num(price);
    if (value > 0 || !map.has(key)) map.set(key, value);
  };
  (Array.isArray(data.matriz) ? data.matriz : []).forEach(item => put(item.nome, item.preco));
  const legacy = Array.isArray(data?.budget?.items) ? data.budget.items : [];
  legacy.forEach(item => put(item.nome ?? item.name ?? item.epi ?? item.artigo, item.unitPrice ?? item.preco ?? item.price));
  const planning = data?.budget?.management?.planning;
  if (planning && typeof planning === "object") Object.entries(planning).forEach(([name, item]) => put(name, item?.unitPrice));
  return map;
}

function workerMap(data) {
  return new Map((Array.isArray(data.trabalhadores) ? data.trabalhadores : []).map(w => [String(w.id), w]));
}

function deliveryFields(row) {
  return {
    workerId: row.worker_id ?? row.trabalhador_id ?? row.workerId ?? row.idTrab,
    workerName: row.worker_nome ?? row.trabalhador ?? row.worker_name,
    product: row.epi_type ?? row.epi ?? row.nomeEpi ?? row.nome,
    quantity: num(row.qtd ?? row.quantidade ?? row.qty),
    price: num(row.preco ?? row.unitPrice ?? row.unit_price)
  };
}

function mergeDeliveries(data, firestoreRows) {
  const rows = [];
  const seen = new Set();
  firestoreRows.forEach(r => {
    const key = [r.worker_id ?? r.trabalhador_id ?? r.workerId, r.epi_type ?? r.epi ?? r.nomeEpi, r.delivery_date ?? r.data, r.qtd ?? r.quantidade ?? r.qty, r.created_at].map(norm).join("|");
    seen.add(key);
    rows.push(r);
  });
  (Array.isArray(data.eventos) ? data.eventos : []).filter(e => e.tipo === "ENTREGA").forEach(e => {
    const key = [e.idTrab ?? e.worker_id, e.epi, e.data ?? e.delivery_date, e.qtd, e.id].map(norm).join("|");
    if (!seen.has(key)) rows.push(e);
  });
  return rows;
}

async function renderRealCost() {
  if (runningCost) return;
  const root = document.querySelector(".budget-management-root");
  if (!root?.querySelector('[data-budget-tab="custo"].active') || root === lastCostRoot) return;
  const section = [...root.querySelectorAll("h3")].find(h => norm(h.textContent) === "CUSTO / FUNCIONARIO")?.closest("section");
  if (!section?.querySelector(".table-wrap")) return;
  runningCost = true;
  try {
    const [data, snap] = await Promise.all([mainData(), getDocs(collection(db(), DELIVERY_COLLECTION))]);
    const workers = workerMap(data);
    const prices = priceMap(data);
    const rows = mergeDeliveries(data, snap.docs.map(d => ({ id: d.id, ...d.data() })));
    const result = new Map();
    rows.forEach(raw => {
      const r = deliveryFields(raw);
      if (!r.product || (!r.workerId && !r.workerName)) return;
      const worker = workers.get(String(r.workerId));
      const name = worker?.nome || r.workerName || `Trabalhador ${r.workerId || ""}`;
      const key = String(r.workerId || name);
      const unitPrice = r.price > 0 ? r.price : (prices.get(norm(r.product)) ?? 0);
      const quantity = r.quantity;
      if (!result.has(key)) result.set(key, { name, function: worker?.funcao || "", delegation: worker?.delegacao || "", quantity: 0, cost: 0 });
      const item = result.get(key);
      item.quantity += quantity;
      item.cost += quantity * unitPrice;
    });
    const list = [...result.values()].sort((a, b) => b.cost - a.cost);
    section.querySelector(".table-wrap").innerHTML = `<table class="budget-table"><thead><tr><th>Funcionário</th><th>Função</th><th>Delegação</th><th>Qtd. EPI</th><th>Custo</th></tr></thead><tbody>${list.length ? list.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.function)}</td><td>${esc(r.delegation)}</td><td>${r.quantity}</td><td>${euro(r.cost)}</td></tr>`).join("") : `<tr><td colspan="5">Não existem entregas registadas.</td></tr>`}</tbody></table>`;
    lastCostRoot = root;
  } catch (error) {
    console.error("Custo por funcionário:", error);
  } finally {
    runningCost = false;
  }
}

function renderStockFamilies() {
  const heading = [...document.querySelectorAll("h2")].find(h => norm(h.textContent) === "MATRIZ CONSOLIDADA DE STOCKS");
  const section = heading?.closest("section.section");
  const table = section?.querySelector("table");
  const rows = Array.isArray(window.__dpmFamilyMatrix) ? window.__dpmFamilyMatrix : null;
  if (!section || !table || !rows) return;

  let filter = section.querySelector("[data-family-stock-filter]");
  if (!filter) {
    filter = document.createElement("div");
    filter.dataset.familyStockFilter = "1";
    filter.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px";
    filter.innerHTML = `<strong style="font-size:.9rem">Família:</strong>${FAMILIES.map(f => `<button type="button" data-family-stock="${f}" class="ghost-btn" style="min-height:34px;padding:0 12px">${f}</button>`).join("")}`;
    heading.parentElement?.insertAdjacentElement("afterend", filter);
    filter.querySelectorAll("[data-family-stock]").forEach(button => button.addEventListener("click", () => {
      stockFamily = button.dataset.familyStock;
      stockDataSignature = "";
      renderStockFamilies();
    }));
  }

  filter.querySelectorAll("[data-family-stock]").forEach(button => {
    const selected = button.dataset.familyStock === stockFamily;
    button.style.background = selected ? "var(--accent, #00a3e0)" : "";
    button.style.color = selected ? "#00131d" : "";
  });

  const filtered = stockFamily === "Todos" ? rows : rows.filter(item => item.family === stockFamily);
  const grouped = [];
  let lastFamily = "";
  filtered.forEach(item => {
    if (item.family !== lastFamily) {
      grouped.push(`<tr><td colspan="${(item.nums?.length || 3) + 2}" style="font-weight:800;background:rgba(0,163,224,.08)">${esc(item.family)}</td></tr>`);
      lastFamily = item.family;
    }
    grouped.push(`<tr><td>${esc(item.name)}</td>${item.nums.map(n => `<td class="mono">${n}</td>`).join("")}<td class="mono">${item.total}</td></tr>`);
  });
  table.querySelector("tbody").innerHTML = grouped.join("") || `<tr><td colspan="5">Sem artigos nesta família.</td></tr>`;
  const first = table.querySelector("thead th:first-child");
  if (first) first.textContent = "Artigo";
  stockDataSignature = table.querySelector("tbody")?.textContent || "";
}

async function refreshStockFamilyData() {
  const heading = [...document.querySelectorAll("h2")].find(h => norm(h.textContent) === "MATRIZ CONSOLIDADA DE STOCKS");
  const section = heading?.closest("section.section");
  const table = section?.querySelector("table");
  if (!table) return;
  const domSignature = table.querySelector("tbody")?.textContent || "";
  if (window.__dpmFamilyMatrix && domSignature && stockDataSignature === domSignature) {
    renderStockFamilies();
    return;
  }
  try {
    const data = await mainData();
    const warehouses = Array.isArray(data.warehouses) && data.warehouses.length ? data.warehouses : ["DPM Norte", "DPM Sul", "DPM Algarve"];
    const stocks = data.stocks || {};
    const matriz = Array.isArray(data.matriz) ? data.matriz : [];
    window.__dpmFamilyMatrix = matriz.map(item => {
      const nums = warehouses.map(w => {
        const record = stocks?.[w]?.[item.nome];
        if (typeof record === "number") return record;
        if (!record || typeof record !== "object") return 0;
        return num(record.loose) + Object.values(record.sizes || {}).reduce((s, q) => s + num(q), 0);
      });
      return { name: item.nome, family: familyOf(item), nums, total: nums.reduce((a, b) => a + b, 0) };
    });
    renderStockFamilies();
  } catch (error) {
    console.error("Famílias da matriz de stocks:", error);
  }
}

function kick() {
  if (!getApps().length) return;
  const budget = document.querySelector(".budget-management-root");
  if (budget?.querySelector('[data-budget-tab="custo"].active')) renderRealCost();
  refreshStockFamilyData();
}

if (!initialized) {
  initialized = true;
  document.addEventListener("click", event => {
    if (event.target.closest("[data-budget-tab]")) {
      lastCostRoot = null;
      setTimeout(kick, 80);
    }
  }, true);
  setInterval(kick, 1200);
  setTimeout(kick, 300);
}
