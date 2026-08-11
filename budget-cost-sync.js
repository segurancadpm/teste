import { getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MAIN_DOC = "dpm_epi_data_v1";

const num = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return 0;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const euro = value => new Intl.NumberFormat("pt-PT", {
  style: "currency", currency: "EUR"
}).format(num(value));

const esc = value => String(value ?? "").replace(/[&<>\"]/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"
}[c]));

async function getData() {
  if (window.__dpmBudgetDataPromise) {
    const cached = await window.__dpmBudgetDataPromise;
    if (cached) return cached;
  }
  const apps = getApps();
  if (!apps.length) return null;
  const db = getFirestore(getApp());
  const snap = await getDoc(doc(db, "appdata", MAIN_DOC));
  return snap.exists() ? snap.data() : null;
}

function priceIndex(data) {
  const map = new Map();
  const matriz = Array.isArray(data?.matriz) ? data.matriz : [];
  const legacy = Array.isArray(data?.budget?.items) ? data.budget.items : [];
  const planning = data?.budget?.management?.planning || {};

  matriz.forEach(item => {
    if (item?.nome) map.set(String(item.nome), num(item.preco));
  });
  legacy.forEach(item => {
    const name = item?.nome ?? item?.name ?? item?.epi ?? item?.artigo;
    if (!name) return;
    const price = item?.unitPrice ?? item?.preco ?? item?.price;
    if (num(price)) map.set(String(name), num(price));
  });
  Object.entries(planning).forEach(([name, item]) => {
    if (item && num(item.unitPrice)) map.set(String(name), num(item.unitPrice));
  });
  return map;
}

function buildRows(data) {
  const workers = Array.isArray(data?.trabalhadores) ? data.trabalhadores : [];
  const events = Array.isArray(data?.eventos) ? data.eventos : [];
  const prices = priceIndex(data);
  const result = new Map();

  events.forEach(event => {
    const workerId = event.worker_id ?? event.trabalhador_id ?? event.workerId;
    const worker = workers.find(w => String(w.id) === String(workerId));
    const name = worker?.nome || event.trabalhador || event.worker_name || `Trabalhador ${workerId || ""}`;
    const product = event.epi_type || event.epi || event.nomeEpi || event.nome || "EPI";
    const quantity = num(event.qtd ?? event.quantidade ?? event.qty) || 1;

    // Preço da própria entrega tem prioridade. Caso não exista, usa o preço
    // planeado/guardado para o EPI e só depois o preço da matriz.
    const eventPrice = event.preco ?? event.unitPrice;
    const unitPrice = num(eventPrice) || num(prices.get(product));
    const key = String(workerId || name);

    if (!result.has(key)) {
      result.set(key, {
        name,
        function: worker?.funcao || "",
        delegation: worker?.delegacao || "",
        quantity: 0,
        cost: 0
      });
    }
    const row = result.get(key);
    row.quantity += quantity;
    row.cost += quantity * unitPrice;
  });

  return [...result.values()].sort((a, b) => b.cost - a.cost);
}

function renderRows(rows) {
  return rows.length
    ? rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.function)}</td><td>${esc(r.delegation)}</td><td>${r.quantity}</td><td>${euro(r.cost)}</td></tr>`).join("")
    : `<tr><td colspan="5">Ainda não existem entregas suficientes para calcular custos.</td></tr>`;
}

async function syncCost() {
  const heading = [...document.querySelectorAll(".budget-card h3")].find(el => el.textContent.trim() === "Custo por Funcionário");
  if (!heading) return false;
  const table = heading.closest(".budget-card")?.querySelector("table.budget-table");
  const tbody = table?.querySelector("tbody");
  if (!tbody) return false;
  const data = await getData();
  if (!data) return false;
  tbody.innerHTML = renderRows(buildRows(data));
  return true;
}

document.addEventListener("click", event => {
  const tab = event.target.closest("[data-budget-tab]");
  if (!tab || tab.dataset.budgetTab !== "custo") return;
  [100, 250, 500].forEach(delay => setTimeout(() => syncCost().catch(console.error), delay));
}, true);

// Se a aplicação abrir diretamente neste separador, dá-lhe alguns instantes
// para terminar o render inicial e faz o cruzamento sem alterar a estrutura.
[200, 500, 1000].forEach(delay => setTimeout(() => syncCost().catch(console.error), delay));
