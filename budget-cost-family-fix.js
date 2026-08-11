import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Apenas apresentação por família da Matriz Consolidada de Stocks.
// O Custo / Funcionário é tratado exclusivamente por budget-cost-final.js.
const MAIN_DOC = "dpm_epi_data_v1";
const FAMILIES = ["Todos", "EPI", "Equipamento", "Ambiente"];
let stockFamily = "Todos";
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
const norm = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const esc = value => String(value ?? "").replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
const familyOf = item => ["EPI", "Equipamento", "Ambiente"].includes(item?.familia ?? item?.family) ? (item.familia ?? item.family) : "EPI";

async function mainData() {
  const snap = await getDoc(doc(db(), "appdata", MAIN_DOC));
  return snap.exists() ? snap.data() : {};
}

function renderStockFamilies() {
  const heading = [...document.querySelectorAll("h2")].find(h => norm(h.textContent) === "MATRIZ CONSOLIDADA DE STOCKS");
  const section = heading?.closest("section.section");
  const table = section?.querySelector("table");
  const rows = window.__dpmFamilyMatrix;
  if (!section || !table || !Array.isArray(rows)) return;

  let filter = section.querySelector("[data-family-stock-filter]");
  if (!filter) {
    filter = document.createElement("div");
    filter.dataset.familyStockFilter = "1";
    filter.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px";
    filter.innerHTML = `<strong style="font-size:.9rem">Família:</strong>${FAMILIES.map(f => `<button type="button" data-family-stock="${f}" class="ghost-btn" style="min-height:34px;padding:0 12px">${f}</button>`).join("")}`;
    heading.parentElement?.insertAdjacentElement("afterend", filter);
    filter.querySelectorAll("[data-family-stock]").forEach(button => button.addEventListener("click", () => {
      stockFamily = button.dataset.familyStock;
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
}

async function refresh() {
  const heading = [...document.querySelectorAll("h2")].find(h => norm(h.textContent) === "MATRIZ CONSOLIDADA DE STOCKS");
  const section = heading?.closest("section.section");
  const table = section?.querySelector("table");
  if (!table) return;
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
  refresh();
}

if (!initialized) {
  initialized = true;
  document.addEventListener("click", event => {
    if (event.target.closest("[data-budget-tab]")) setTimeout(kick, 100);
  }, true);
  setInterval(kick, 1500);
  setTimeout(kick, 400);
}
