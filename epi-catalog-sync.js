import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = getApps().length ? getApp() : null;
if (!app) throw new Error("Firebase principal ainda não foi inicializado.");

const db = getFirestore(app);
const MAIN = doc(db, "appdata", "dpm_epi_data_v1");
const BUDGET = doc(db, "appdata", "dpm_orcamento_2026_v2");
let writingMain = false;
let writingBudget = false;
let started = false;
let activeCatalog = new Set();
let reloadTimer = null;

const key = value => String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function budgetRowFromEpi(epi, index) {
  return {
    area: "Segurança",
    tipo: "EPI",
    descricao: epi.nome,
    fornecedor: "",
    preco: num(epi.preco),
    previsao: 0,
    gasto: "",
    q1: 0,
    q2: 0,
    q3: 0,
    q4: 0,
    ativo: epi.ativo !== false,
    id: `CAT-${key(epi.nome).replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || index + 1}`,
    catalogKey: key(epi.nome)
  };
}

function ensureStock(data, epiName) {
  if (!data.stocks) data.stocks = {};
  const warehouses = Array.isArray(data.warehouses) && data.warehouses.length ? data.warehouses : ["DPM Norte", "DPM Sul", "DPM Algarve"];
  data.warehouses = warehouses;
  warehouses.forEach(warehouse => {
    if (!data.stocks[warehouse]) data.stocks[warehouse] = {};
    if (!data.stocks[warehouse][epiName]) data.stocks[warehouse][epiName] = { loose: 0, sizes: {} };
  });
}

function updateDeliveryLists() {
  document.querySelectorAll('select[name="epi"]').forEach(select => {
    const current = select.value;
    [...select.options].forEach(option => {
      option.hidden = !activeCatalog.has(key(option.value));
    });
    if (!activeCatalog.has(key(current))) {
      const first = [...select.options].find(option => !option.hidden);
      if (first) select.value = first.value;
    }
  });
}

function updateCatalogFromMain(main) {
  activeCatalog = new Set((Array.isArray(main.matriz) ? main.matriz : [])
    .filter(epi => epi?.nome && epi.ativo !== false)
    .map(epi => key(epi.nome)));
  updateDeliveryLists();
}

async function syncMainToBudget() {
  if (writingMain || writingBudget) return;
  const [mainSnap, budgetSnap] = await Promise.all([getDoc(MAIN), getDoc(BUDGET)]);
  if (!mainSnap.exists()) return;
  const main = mainSnap.data();
  updateCatalogFromMain(main);
  const budget = budgetSnap.exists() ? budgetSnap.data() : { year: 2026, rows: [] };
  const rows = Array.isArray(budget.rows) ? budget.rows.map(r => ({ ...r, ativo: r.ativo !== false })) : [];
  const existing = new Map(rows.filter(r => r.descricao).map(r => [r.catalogKey || key(r.descricao), r]));
  let changed = false;

  (Array.isArray(main.matriz) ? main.matriz : []).forEach((epi, index) => {
    if (!epi?.nome) return;
    const k = key(epi.nome);
    const row = existing.get(k);
    if (!row) {
      rows.push(budgetRowFromEpi(epi, index));
      changed = true;
      return;
    }
    if (num(row.preco) !== num(epi.preco) || row.ativo !== (epi.ativo !== false) || row.catalogKey !== k) {
      row.preco = num(epi.preco);
      row.ativo = epi.ativo !== false;
      row.catalogKey = k;
      changed = true;
    }
  });

  if (changed) {
    writingBudget = true;
    try {
      await setDoc(BUDGET, { ...budget, year: 2026, rows, updatedAt: Date.now() });
      window.dispatchEvent(new CustomEvent("dpm:catalog-updated"));
    } finally {
      writingBudget = false;
    }
  }
}

async function syncBudgetToMain() {
  if (writingMain || writingBudget) return;
  const [mainSnap, budgetSnap] = await Promise.all([getDoc(MAIN), getDoc(BUDGET)]);
  if (!budgetSnap.exists()) return;
  const main = mainSnap.exists() ? mainSnap.data() : {};
  const matriz = Array.isArray(main.matriz) ? main.matriz.map(e => ({ ...e })) : [];
  const rows = Array.isArray(budgetSnap.data().rows) ? budgetSnap.data().rows : [];
  const byKey = new Map(matriz.filter(e => e?.nome).map(e => [key(e.nome), e]));
  let changed = false;

  rows.filter(r => r?.descricao && r.area !== "Ambiente").forEach(row => {
    const k = row.catalogKey || key(row.descricao);
    let epi = byKey.get(k);
    if (!epi && row.ativo !== false) {
      epi = {
        nome: String(row.descricao).trim().toUpperCase(),
        riscos: "",
        meses: 12,
        preco: num(row.preco),
        ativo: true,
        catalogKey: k
      };
      matriz.push(epi);
      byKey.set(k, epi);
      ensureStock(main, epi.nome);
      changed = true;
    } else if (epi) {
      if (num(epi.preco) !== num(row.preco)) {
        epi.preco = num(row.preco);
        changed = true;
      }
      if (epi.ativo !== (row.ativo !== false)) {
        epi.ativo = row.ativo !== false;
        changed = true;
      }
      if (!epi.catalogKey) {
        epi.catalogKey = k;
        changed = true;
      }
      ensureStock(main, epi.nome);
    }
  });

  if (changed) {
    writingMain = true;
    try {
      await setDoc(MAIN, { ...main, matriz, updatedAt: Date.now() });
      updateCatalogFromMain({ ...main, matriz });
      window.dispatchEvent(new CustomEvent("dpm:catalog-updated"));
    } finally {
      writingMain = false;
    }
  }
}

async function reconcile() {
  if (!started) return;
  try {
    await syncMainToBudget();
    await syncBudgetToMain();
  } catch (error) {
    console.error("Erro ao sincronizar catálogo de EPI:", error);
  }
}

onSnapshot(MAIN, () => reconcile());
onSnapshot(BUDGET, () => reconcile());

window.addEventListener("dpm:catalog-updated", () => {
  updateDeliveryLists();
  if (document.querySelector(".budget-tabs")) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => location.reload(), 350);
  }
});

const deliveryObserver = new MutationObserver(() => updateDeliveryLists());
deliveryObserver.observe(document.body, { childList: true, subtree: true });

started = true;
reconcile();

window.DPMCatalog = {
  sync: reconcile,
  mainDocument: MAIN.path,
  budgetDocument: BUDGET.path
};
