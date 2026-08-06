// ─── Firebase SDK (CDN modular compat) ───────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, collection, getDocs,
  query, where, addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAqt5RDygjfeQZ3zq8dYhEGbyIjg00Bbks",
  authDomain: "dpm-epi.firebaseapp.com",
  projectId: "dpm-epi",
  storageBucket: "dpm-epi.firebasestorage.app",
  messagingSenderId: "1043253642340",
  appId: "1:1043253642340:web:d3e0920050b8407f48cb71",
  measurementId: "G-VZK3WE1MDJ"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ─── Constantes ──────────────────────────────────────────────────────────────
const USERS = [
  { pin: "5678", nome: "Jorge", perfil: "SuperAdmin", armazem: "GERAL", color: "#00a3e0" },
  { pin: "1234", nome: "Técnico Norte", perfil: "Operador Local", armazem: "DPM Norte", color: "#11c5ad" },
  { pin: "2222", nome: "Técnico Sul", perfil: "Operador Local", armazem: "DPM Sul", color: "#ffb020" },
  { pin: "3333", nome: "Técnico Algarve", perfil: "Operador Local", armazem: "DPM Algarve", color: "#ff5a66" }
];

const WAREHOUSES = ["DPM Norte", "DPM Sul", "DPM Algarve"];

const RISKS = {
  1: "Quedas em altura", 2: "Quedas ao mesmo nível", 3: "Queda de objetos",
  4: "Queda por escorregamento", 5: "Esmagamento / perfuração", 6: "Cortes",
  7: "Entalamentos", 8: "Choque com objetos", 9: "Exposição ao ruído",
  10: "Inalação de poeiras / vapores", 11: "Contacto com substâncias",
  12: "Pancadas na cabeça", 13: "Projeção de partículas", 14: "Choque elétrico",
  15: "Queimaduras", 16: "Condições climatéricas adversas",
  17: "Atmosferas com O₂ rarefeito", 18: "Atropelamento",
  19: "Exposição a bactérias e vírus"
};

const MATRIZ_INICIAL = [
  ["POLOS MANGA CURTA", "6,11,13,16", 12],
  ["POLOS MANGA COMPRIDA", "6,11,13,15,16", 12],
  ["CALÇAS DE TRABALHO", "6,11,13,15,16", 12],
  ["PARKA IMPERMEÁVEL ALTA VIS.", "6,11,13,15,16,18", 24],
  ["CASACO POLAR", "6,11,13,15,16", 24],
  ["COLETE DE ALTA VISIBILIDADE", "18", 24],
  ["SAPATO DE SEGURANÇA", "2,3,4,5,6,7,8,11,13,15,16,18", 12],
  ["CAPACETE + FRANCALETE", "1,3,8,12", 48],
  ["OCULOS PROTEÇÃO", "13", 24],
  ["PROTETORES AUDITIVOS", "9", 12],
  ["MASCARA PROTEÇÃO ABEK1 OU BLS", "10", 6],
  ["AVENTAL PROTEÇÃO", "11,13", 12],
  ["LUVAS PROTEÇÃO MECÂNICA", "6,7", 6],
  ["LUVAS PROTEÇÃO QUÍMICA", "11", 6],
  ["LUVAS NITRILO", "11", 3],
  ["GALOCHAS", "2,3,4,5,6,7,8,11", 24],
  ["FATO PESCADOR", "2,3,4,5,6,7,8,11,13,15,16,18", 24],
  ["FATO IMPERMEÁVEL", "6,11,13,15,16", 24],
  ["FATO TYVEK", "11", 1],
  ["ARNES + CORDAS + ABS ENERGIA", "1", 36]
].map(([nome, riscos, meses]) => ({ nome, riscos, meses, preco: 0 }));

// ─── DOM ─────────────────────────────────────────────────────────────────────
const appEl = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  user: null,
  operadorAtual: null,
  page: "home",
  selectedWorkerId: null,
  filters: { workerSearch: "", delegacao: "TODAS", stockWarehouse: "DPM Norte", auditEstado: "TODOS" },
  data: defaultData(),
  syncing: false,
  loaded: false,
  workerSignatureCache: {},
  // Kiosk state
  kioskPhase: null,          // 'worker' ou 'deliverer'
  pendingDelivery: null,
  pendingWorkerSig: null,
  pendingDelivererSig: null,
  pendingNoSignWorker: false,
  pendingNoSignDeliverer: false,
  currentPad: null,          // instância do signature pad ativo
};

// ─── Firestore helpers ───────────────────────────────────────────────────────
const MAIN_DOC = "dpm_epi_data_v1";
const DELIVERIES_COLLECTION = "deliveries";

function defaultData() {
  const stocks = {};
  WAREHOUSES.forEach((w, wi) => {
    stocks[w] = {};
    MATRIZ_INICIAL.forEach((epi, i) => {
      stocks[w][epi.nome] = wi === 1 ? 18 - (i % 9) : 10 + ((i + wi) % 14);
    });
  });
  const worker = { id: 1, nome: "JOSÉ HILSON INACIO DA SILVA", funcao: "Operador ETAR", delegacao: "DPM Sul" };
  const past = new Date(); past.setMonth(past.getMonth() - 13);
  const soon = new Date(); soon.setDate(soon.getDate() + 42);
  const seedEvents = [
    makeEventRaw(worker, MATRIZ_INICIAL[6], 1, past.toISOString().slice(0, 10), "ATIVO", "Jorge"),
    makeEventRaw(worker, MATRIZ_INICIAL[12], 2, soon.toISOString().slice(0, 10), "ATIVO", "Técnico Sul")
  ];
  return { matriz: MATRIZ_INICIAL, trabalhadores: [worker], eventos: seedEvents, stocks, budget: { limit: 0, items: {} }, operadores: [], warehouses: WAREHOUSES.slice() };
}

async function loadFromFirestore() {
  showLoading(true);
  try {
    const snap = await getDoc(doc(db, "appdata", MAIN_DOC));
    if (snap.exists()) {
      state.data = snap.data();
      ensureDataShape();
    } else {
      await saveAll();
    }
  } catch (e) {
    console.error("Firestore load error:", e);
    showToast("Erro ao carregar dados. A tentar novamente…");
  }
  state.loaded = true;
  showLoading(false);
  render();
}

async function saveAll() {
  if (state.syncing) return;
  state.syncing = true;
  try {
    await setDoc(doc(db, "appdata", MAIN_DOC), state.data);
  } catch (e) {
    console.error("Firestore save error:", e);
    showToast("Erro ao guardar. Verifique a ligação.");
  } finally {
    state.syncing = false;
  }
}

function subscribeRealtime() {
  onSnapshot(doc(db, "appdata", MAIN_DOC), (snap) => {
    if (!snap.exists()) return;
    const newData = snap.data();
    if (!state.syncing) {
      state.data = newData;
      ensureDataShape();
      if (state.user) render();
    }
  }, (err) => {
    console.error("Realtime error:", err);
  });
}

// ─── Loading overlay ─────────────────────────────────────────────────────────
function showLoading(on) {
  let el = document.querySelector("#loading-overlay");
  if (on) {
    if (!el) {
      el = document.createElement("div");
      el.id = "loading-overlay";
      el.style.cssText = "position:fixed;inset:0;z-index:200;display:grid;place-items:center;background:rgba(2,7,11,.88);font-size:1.1rem;font-weight:700;color:var(--accent)";
      el.textContent = "A carregar dados…";
      document.body.appendChild(el);
    }
  } else {
    el?.remove();
  }
}

function showToast(msg) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:300;background:#ff5a66;color:#fff;padding:10px 18px;border-radius:8px;font-weight:700;font-size:.9rem";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function ensureDataShape() {
  if (!state.data.budget) state.data.budget = { limit: 0, items: {} };
  if (!state.data.budget.items) {
    state.data.budget = {
      limit: Number(state.data.budget.annual || state.data.budget.limit || 0),
      items: {},
      legacySpent: Number(state.data.budget.spent || 0)
    };
  }
  if (!state.data.operadores) state.data.operadores = [];
  if (!state.data.matriz) state.data.matriz = MATRIZ_INICIAL;
  state.data.matriz.forEach(epi => { if (typeof epi.preco !== "number" || isNaN(epi.preco)) epi.preco = 0; });
  if (!state.data.trabalhadores) state.data.trabalhadores = [];
  if (!state.data.eventos) state.data.eventos = [];
  if (!state.data.latestSignatures) state.data.latestSignatures = {};
  if (!state.data.stocks) state.data.stocks = {};
  if (!Array.isArray(state.data.warehouses) || !state.data.warehouses.length) {
    state.data.warehouses = WAREHOUSES.slice();
  }
  state.data.warehouses.forEach(w => {
    if (!state.data.stocks[w]) state.data.stocks[w] = {};
    state.data.matriz.forEach(epi => {
      state.data.stocks[w][epi.nome] = normalizeStockRecord(state.data.stocks[w][epi.nome]);
    });
  });
  if (!state.data.warehouses.includes(state.filters.stockWarehouse)) {
    state.filters.stockWarehouse = state.data.warehouses[0] || "";
  }
}

function isProtectedWarehouse(name) {
  return USERS.some(u => u.armazem === name);
}

function warehouseList() {
  return state.data.warehouses || WAREHOUSES;
}

async function migrateLegacySignatures() {
  const legacy = state.data.latestSignatures || {};
  const workerIds = Object.keys(legacy);
  if (!workerIds.length) { showToast("Não há assinaturas antigas para migrar."); return; }
  if (!confirm(`Migrar ${workerIds.length} assinatura(s) antiga(s) para o novo sistema? As entregas atuais não são afetadas.`)) return;

  let migrated = 0, failed = 0;
  for (const workerId of workerIds) {
    const record = legacy[workerId];
    if (!record) continue;
    try {
      await addDoc(collection(db, DELIVERIES_COLLECTION), {
        worker_id: Number(workerId),
        epi_type: "Migração de assinatura anterior",
        qtd: null,
        tamanho: "",
        delivery_date: record.data || todayISO(),
        validity_date: null,
        riscos: "",
        responsavel: record.responsavel || "",
        sem_assinatura: !!record.semAssinatura,
        signature_points_trabalhador: null,
        signature_points_entregador: null,
        legacy_image_trabalhador: record.trabalhador || null,
        legacy_image_entregador: record.entregador || null,
        legacy: true,
        created_at: Date.now()
      });
      delete state.data.latestSignatures[workerId];
      invalidateSignatureCache(Number(workerId));
      migrated++;
    } catch (e) {
      console.error(`Erro a migrar assinatura do trabalhador ${workerId}:`, e);
      failed++;
    }
  }
  await saveAll();
  showToast(`Migração concluída: ${migrated} migrada(s)${failed ? `, ${failed} falhada(s) (mantidas para nova tentativa)` : ""}.`);
  render();
}

function parsePtDate(str) {
  const [d, m, y] = String(str || "").split("/").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

async function archiveOldEvents() {
  const CUTOFF_MONTHS = 24;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - CUTOFF_MONTHS);

  const toArchive = state.data.eventos.filter(e => {
    const d = parsePtDate(e.data);
    return d && d < cutoff && e.statusAlerta !== "ATIVO";
  });
  if (!toArchive.length) { showToast(`Não há eventos com mais de ${CUTOFF_MONTHS} meses (e sem alerta ativo) para arquivar.`); return; }
  if (!confirm(`Arquivar ${toArchive.length} evento(s) com mais de ${CUTOFF_MONTHS} meses (já sem alerta ativo)?\n\nContinuam guardados na coleção "events_archive" do Firestore — só saem da lista rápida da app, para o documento principal não crescer indefinidamente.`)) return;

  try {
    await Promise.all(toArchive.map(e => addDoc(collection(db, "events_archive"), e)));
  } catch (err) {
    console.error("Erro ao arquivar eventos:", err);
    alert(`Não foi possível arquivar os eventos.\n\nErro: ${err.code || err.message || err}\n\nNada foi apagado do documento principal.`);
    return;
  }
  const archivedIds = new Set(toArchive.map(e => e.id));
  state.data.eventos = state.data.eventos.filter(e => !archivedIds.has(e.id));
  await saveAll();
  showToast(`${toArchive.length} evento(s) arquivado(s) com sucesso.`);
  render();
}

function normalizeStockRecord(value) {
  if (typeof value === "number") return { loose: value, sizes: {} };
  if (!value || typeof value !== "object") return { loose: 0, sizes: {} };
  const sizes = value.sizes || value.tamanhos || {};
  const cleanSizes = {};
  Object.entries(sizes).forEach(([size, qty]) => {
    const key = String(size || "").trim().toUpperCase();
    if (key) cleanSizes[key] = Number(qty || 0);
  });
  return { loose: Number(value.loose ?? value.semTamanho ?? 0), sizes: cleanSizes };
}

function stockRecord(warehouse, epiName) {
  if (!state.data.stocks[warehouse]) state.data.stocks[warehouse] = {};
  state.data.stocks[warehouse][epiName] = normalizeStockRecord(state.data.stocks[warehouse][epiName]);
  return state.data.stocks[warehouse][epiName];
}

function stockTotal(warehouse, epiName) {
  const record = stockRecord(warehouse, epiName);
  return record.loose + Object.values(record.sizes).reduce((sum, qty) => sum + Number(qty || 0), 0);
}

function stockSizeEntries(warehouse, epiName) {
  const record = stockRecord(warehouse, epiName);
  return Object.entries(record.sizes)
    .filter(([, qty]) => Number(qty || 0) > 0)
    .sort(([a], [b]) => a.localeCompare(b, "pt-PT", { numeric: true }));
}

function addStock(warehouse, epiName, qty, size = "") {
  const record = stockRecord(warehouse, epiName);
  const amount = Number(qty || 0);
  const key = String(size || "").trim().toUpperCase();
  if (key) record.sizes[key] = Number(record.sizes[key] || 0) + amount;
  else record.loose += amount;
}

function removeStock(warehouse, epiName, qty, size = "") {
  const record = stockRecord(warehouse, epiName);
  let amount = Number(qty || 0);
  const key = String(size || "").trim().toUpperCase();
  if (key) {
    record.sizes[key] = Math.max(0, Number(record.sizes[key] || 0) - amount);
    return;
  }
  const fromLoose = Math.min(record.loose, amount);
  record.loose -= fromLoose;
  amount -= fromLoose;
  for (const [sizeKey, current] of Object.entries(record.sizes)) {
    if (amount <= 0) break;
    const take = Math.min(Number(current || 0), amount);
    record.sizes[sizeKey] = Math.max(0, Number(current || 0) - take);
    amount -= take;
  }
}

function budgetTotals() {
  const budget = state.data.budget || { limit: 0, items: {} };
  const items = budget.items || {};
  const planned = Object.values(items).reduce((sum, item) => sum + Number(item.planned || 0), 0);
  const spent = Object.values(items).reduce((sum, item) => sum + Number(item.spent || 0), Number(budget.legacySpent || 0));
  const limit = Number(budget.limit || 0);
  return { limit, planned, spent, remaining: Math.max(0, limit - spent), pct: limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0 };
}

// Custo em EPIs, calculado a partir das entregas reais (qtd × preço unitário
// do artigo no matriz, o mesmo preço que está no armazém/compra) — não
// depende de preencher nada à mão, cruza sempre com o que foi de facto entregue.
function epiPreco(epiName) {
  return Number(state.data.matriz.find(m => m.nome === epiName)?.preco || 0);
}

function workerEpiCost(workerId) {
  return state.data.eventos
    .filter(e => e.tipo === "ENTREGA" && e.idTrab === workerId)
    .reduce((sum, e) => sum + epiPreco(e.epi) * Number(e.qtd || 0), 0);
}

function allWorkerCosts() {
  return state.data.trabalhadores
    .map(w => ({ worker: w, custo: workerEpiCost(w.id) }))
    .sort((a, b) => b.custo - a.custo);
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months));
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return "——";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-PT");
}

function longDate() {
  return new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function uid(prefix = "EVT") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeEventRaw(worker, epi, qtd, validade, statusAlerta, responsavel, tamanho = "") {
  return {
    id: uid(),
    idTrab: worker.id,
    data: new Date().toLocaleDateString("pt-PT"),
    tipo: "ENTREGA",
    epi: epi.nome,
    qtd,
    tamanho: String(tamanho || "").trim().toUpperCase(),
    armazem: worker.delegacao,
    estado: statusAlerta === "ATIVO" ? "Entregue" : "Baixa",
    statusAlerta,
    validade,
    responsavel
  };
}

function isSuper() { return state.user?.perfil === "SuperAdmin"; }

function scopedWorkers() {
  return state.data.trabalhadores.filter(w => isSuper() || w.delegacao === state.user.armazem);
}

function activeEvents() {
  return state.data.eventos.filter(e => e.tipo === "ENTREGA" && e.statusAlerta === "ATIVO");
}

function eventStatus(event) {
  if (event.statusAlerta !== "ATIVO" || !event.validade) return "normal";
  const today = new Date(`${todayISO()}T00:00:00`);
  const end = new Date(`${event.validade}T00:00:00`);
  const diff = Math.ceil((end - today) / 86400000);
  if (diff < 0) return "expired";
  if (diff <= 90) return "warning";
  return "normal";
}

function alerts() {
  const workersById = Object.fromEntries(state.data.trabalhadores.map(w => [w.id, w]));
  return activeEvents()
    .filter(e => {
      const worker = workersById[e.idTrab];
      return worker && (isSuper() || worker.delegacao === state.user.armazem);
    })
    .map(e => ({ ...e, worker: workersById[e.idTrab], alert: eventStatus(e) }))
    .filter(e => e.alert !== "normal")
    .sort((a, b) => a.validade.localeCompare(b.validade));
}

function workerStats(workerId) {
  const events = activeEvents().filter(e => e.idTrab === workerId);
  return {
    active: events.length,
    expired: events.filter(e => eventStatus(e) === "expired").length,
    warning: events.filter(e => eventStatus(e) === "warning").length
  };
}

function html(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

// ─── Render principal ────────────────────────────────────────────────────────
function render() {
  if (!state.user) return renderLogin();
  if (!isSuper() && !state.operadorAtual) return renderOperadorPicker();
  if (state.selectedWorkerId) return renderWorkerDetail();
  const views = { home: renderHome, people: renderPeople, stock: renderStock, alerts: renderAlerts, audit: renderAudit, budget: renderBudget };

  // Guarda o foco/posição do cursor e o scroll antes de substituir o HTML.
  // Sem isto, escrever num campo de pesquisa (que chama render() a cada
  // tecla) perde o foco a cada carácter e obriga a clicar de novo no input.
  const active = document.activeElement;
  let refocus = null;
  if (active && appEl.contains(active) && active.dataset && active.dataset.filter) {
    refocus = { filterKey: active.dataset.filter, start: active.selectionStart, end: active.selectionEnd };
  }
  const scrollY = window.scrollY;

  appEl.innerHTML = `
    <main>
      <div class="app-top">
        <div class="screen-title">
          <h1>${pageTitle()}</h1>
          <p>${longDate()}</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${!isSuper() ? `<button class="user-chip" data-action="trocarOperador" title="Trocar operador"><span class="mini-avatar">${initials(state.operadorAtual)}</span><span>${html(state.operadorAtual)}</span></button>` : ""}
          <button class="logout-btn" data-action="logout">Sair</button>
        </div>
      </div>
      ${views[state.page]()}
    </main>
    ${bottomNav()}
  `;

  if (refocus) {
    const el = appEl.querySelector(`[data-filter="${refocus.filterKey}"]`);
    if (el) {
      el.focus();
      if (typeof refocus.start === "number" && el.setSelectionRange) {
        try { el.setSelectionRange(refocus.start, refocus.end); } catch { /* campo não suporta seleção (ex: select) */ }
      }
    }
    window.scrollTo(0, scrollY);
  }
}

function pageTitle() {
  return { home: "Início", people: "Pessoal", stock: "Armazém", alerts: "Alertas", audit: "Auditoria", budget: "Orçamento" }[state.page];
}

function renderOperadorPicker() {
  const ops = state.data.operadores.filter(o => o.armazem === state.user.armazem || o.armazem === "TODAS");
  appEl.innerHTML = `
    <section class="login-shell">
      <div class="brand">
        <div class="brand-mark">DPM</div>
        <div>
          <div class="login-logo">DPM<span>Solutions</span></div>
          <p>${html(state.user.armazem)}</p>
        </div>
      </div>
      <div style="width:min(100%,420px)">
        <p class="meta" style="margin-bottom:12px">Quem está a trabalhar hoje?</p>
        <div class="worker-list">
          ${ops.length ? ops.map(o => `
            <button class="worker-card" data-operador="${html(o.nome)}">
              <span class="avatar" style="background:#0f86b7">${initials(o.nome)}</span>
              <span class="worker-main"><strong>${html(o.nome)}</strong></span>
            </button>
          `).join("") : `<div class="empty">Sem operadores configurados.<br>Peça ao SuperAdmin para adicionar.</div>`}
        </div>
      </div>
      <button class="ghost-btn" data-action="logout" style="margin-top:8px">← Voltar ao login</button>
    </section>
  `;
}

function renderLogin() {
  const selected = state.loginUser || USERS[0];
  state.loginUser = selected;
  appEl.innerHTML = `
    <section class="login-shell">
      <div class="brand">
        <div class="brand-mark">DPM</div>
        <div>
          <div class="login-logo">DPM<span>Solutions</span></div>
          <p>Sistema interno DPM Solutions</p>
        </div>
      </div>
      <div class="user-grid">
        ${USERS.map(user => `
          <button class="user-card ${selected.pin === user.pin ? "active" : ""}" data-login-user="${user.pin}">
            <span class="avatar" style="background:${user.color}">${initials(user.nome)}</span>
            <strong>${html(user.nome)}</strong>
            <span class="meta">${html(user.perfil)} · ${html(user.armazem)}</span>
          </button>
        `).join("")}
      </div>
      <div class="pin-panel" id="pin-panel">
        <div class="meta">PIN de 4 dígitos</div>
        <div class="pin-dots">${[0,1,2,3].map(i => `<span class="pin-dot ${i < (state.pin || "").length ? "filled" : ""}"></span>`).join("")}</div>
        <div class="keypad">
          ${["1","2","3","4","5","6","7","8","9","⌫","0","OK"].map(k => `<button class="key" data-key="${k}">${k}</button>`).join("")}
        </div>
      </div>
    </section>
  `;
}

function bottomNav() {
  const count = alerts().length;
  const items = [
    ["home", iconHome(), "Início"],
    ["people", iconUsers(), "Pessoal"],
    ["stock", iconBox(), "Armazém"],
    ["alerts", iconBell(), "Alertas"],
    ["audit", iconAudit(), "Auditoria"]
  ];
  if (isSuper()) items.push(["budget", iconBudget(), "Orçamento"]);
  return `<nav class="bottom-nav">${items.map(([id, icon, label]) => `
    <button class="nav-btn ${state.page === id ? "active" : ""}" data-page="${id}">
      ${id === "alerts" && count ? `<span class="nav-badge">${count}</span>` : ""}
      <span class="nav-icon">${icon}</span><span>${label}</span>
    </button>
  `).join("")}</nav>`;
}

function renderHome() {
  const workers = scopedWorkers();
  const workerIds = new Set(workers.map(w => w.id));
  const evts = activeEvents().filter(e => workerIds.has(e.idTrab));
  const expired = evts.filter(e => eventStatus(e) === "expired");
  const warning = evts.filter(e => eventStatus(e) === "warning");
  const alertItems = alerts().filter(a => a.alert === "expired").slice(0, 4);
  return `
    <section class="section">
      <p class="meta">Olá, ${html(state.user.nome)}. Hoje é ${longDate()}.</p>
      <div class="kpi-grid">
        <div class="kpi"><span>Trabalhadores</span><strong>${workers.length}</strong></div>
        <div class="kpi"><span>EPIs Ativos</span><strong>${evts.length}</strong></div>
        <div class="kpi"><span>Expirados</span><strong>${expired.length}</strong></div>
        <div class="kpi"><span>A Expirar</span><strong>${warning.length}</strong></div>
      </div>
    </section>
    ${isSuper() ? renderStockMatrix() : ""}
    <section class="section">
      <div class="section-head"><h2>Ações Rápidas</h2></div>
      <div class="quick-grid">
        <button class="quick-card" data-page="people"><strong>Gerir Pessoal</strong><span class="meta">Fichas e entregas</span></button>
        <button class="quick-card" data-page="stock"><strong>Armazém</strong><span class="meta">Stocks e entradas</span></button>
        ${isSuper() ? `<button class="quick-card" data-modal="operadores"><strong>Operadores</strong><span class="meta">Gerir lista de nomes</span></button>` : ""}
        ${isSuper() ? `<button class="quick-card" data-modal="warehouses"><strong>Armazéns</strong><span class="meta">Criar, renomear e transferir stock</span></button>` : ""}
        ${isSuper() && state.data.latestSignatures && Object.keys(state.data.latestSignatures).length ? `<button class="quick-card" data-action="migrateSignatures"><strong>Migrar Assinaturas</strong><span class="meta">${Object.keys(state.data.latestSignatures).length} por migrar</span></button>` : ""}
        ${isSuper() ? `<button class="quick-card" data-action="archiveOldEvents"><strong>Arquivar Eventos Antigos</strong><span class="meta">Liberta espaço no documento principal</span></button>` : ""}
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>EPIs Expirados Críticos</h2></div>
      <div class="alert-list">
        ${alertItems.length ? alertItems.map(alertCard).join("") : `<div class="empty">Tudo em ordem.</div>`}
      </div>
    </section>
  `;
}

function renderBudget() {
  if (!isSuper()) {
    return `<section class="section"><p class="empty">Acesso restrito ao SuperAdmin.</p></section>`;
  }
  const totals = budgetTotals();
  const usedItems = Object.entries(state.data.budget.items || {})
    .filter(([, item]) => Number(item.planned || 0) || Number(item.spent || 0))
    .slice(0, 4);
  const costs = allWorkerCosts();
  const totalCusto = costs.reduce((sum, c) => sum + c.custo, 0);
  return `
    <section class="section">
      <div class="section-head"><h2>Orçamento de Segurança</h2><button class="ghost-btn" data-modal="budget">Editar Limite</button></div>
      <div class="budget-card">
        <div class="budget-row">
          <div><span>Limite Geral</span><strong>${money(totals.limit)}</strong></div>
          <div><span>Previsto EPIs</span><strong>${money(totals.planned)}</strong></div>
          <div><span>Gasto EPIs</span><strong>${money(totals.spent)}</strong></div>
        </div>
        <div class="progress" aria-label="${totals.pct}% utilizado"><span style="width:${totals.pct}%"></span></div>
        <p class="meta">${totals.pct}% utilizado · Restante ${money(totals.remaining)}</p>
        ${usedItems.length ? `<div class="budget-mini-list">${usedItems.map(([name, item]) => `
          <div><span>${html(name)}</span><strong>${money(Number(item.spent || 0))} / ${money(Number(item.planned || 0))}</strong></div>
        `).join("")}</div>` : ""}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Preço dos Artigos EPI</h2></div>
      <p class="meta">O preço de compra/armazém de cada artigo — usado para calcular o custo real por trabalhador, cruzando com as quantidades já entregues.</p>
      <form data-form="precos">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Artigo</th><th style="width:120px">Preço unitário (€)</th></tr></thead>
            <tbody>
              ${state.data.matriz.map(epi => `
                <tr>
                  <td>${html(epi.nome)}</td>
                  <td><input class="input" data-preco-epi="${html(epi.nome)}" type="number" min="0" step="0.01" value="${Number(epi.preco || 0)}"></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <button class="primary-btn" type="submit" style="margin-top:10px">Guardar Preços</button>
      </form>
    </section>

    <section class="section">
      <div class="section-head"><h2>Custo em EPIs por Trabalhador</h2><span class="badge blue">${money(totalCusto)}</span></div>
      <p class="meta">Quantidade entregue a cada trabalhador × preço unitário do artigo — soma de todas as entregas registadas até hoje.</p>
      <button class="ghost-btn" data-action="exportBudgetCsv">↓ Exportar (CSV)</button>
      <div class="table-wrap" style="margin-top:10px">
        <table>
          <thead><tr><th>Trabalhador</th><th>Função</th><th>Delegação</th><th>Custo Total</th></tr></thead>
          <tbody>
            ${costs.map(c => `
              <tr>
                <td>${html(c.worker.nome)}</td>
                <td>${html(c.worker.funcao)}</td>
                <td>${html(c.worker.delegacao)}</td>
                <td class="mono">${money(c.custo)}</td>
              </tr>
            `).join("") || `<tr><td colspan="4">Sem trabalhadores.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function money(value) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function epiLabel(event) {
  return `${event.epi}${event.tamanho ? ` · Tam. ${event.tamanho}` : ""}`;
}

function epiRiscos(event) {
  if (event.tipo === "AUDITORIA_GLOBAL") return "—";
  return state.data.matriz.find(m => m.nome === event.epi)?.riscos || "";
}

function renderStockMatrix() {
  return `
    <section class="section">
      <div class="section-head"><h2>Matriz Consolidada de Stocks</h2></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Artigo EPI</th><th>Norte</th><th>Sul</th><th>Algarve</th><th>Total</th></tr></thead>
          <tbody>
            ${state.data.matriz.map(epi => {
              const nums = warehouseList().map(w => stockTotal(w, epi.nome));
              return `<tr><td>${html(epi.nome)}</td>${nums.map(n => `<td class="mono">${n}</td>`).join("")}<td class="mono">${nums.reduce((a,b) => a + b, 0)}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderPeople() {
  const delegacoes = isSuper() ? ["TODAS", ...warehouseList()] : [state.user.armazem];
  const q = state.filters.workerSearch.toLowerCase();
  const workers = scopedWorkers().filter(w =>
    (state.filters.delegacao === "TODAS" || w.delegacao === state.filters.delegacao) &&
    `${w.nome} ${w.funcao}`.toLowerCase().includes(q)
  );
  return `
    <section class="section">
      <div class="field-row two">
        <input class="input" data-filter="workerSearch" placeholder="Pesquisar por nome ou função" value="${html(state.filters.workerSearch)}">
        <select class="select" data-filter="delegacao" ${isSuper() ? "" : "disabled"}>
          ${delegacoes.map(d => `<option ${state.filters.delegacao === d ? "selected" : ""}>${d}</option>`).join("")}
        </select>
      </div>
      <div class="section-head"><h2>Trabalhadores</h2><button class="primary-btn" data-modal="worker">+ Novo</button></div>
      <div class="worker-list">
        ${workers.map(workerCard).join("") || `<div class="empty">Sem trabalhadores no filtro atual.</div>`}
      </div>
    </section>
  `;
}

function workerCard(worker) {
  const s = workerStats(worker.id);
  const cls = s.expired ? "expired" : s.warning ? "warning" : "";
  return `
    <button class="worker-card ${cls}" data-worker="${worker.id}">
      <span class="avatar" style="background:#0f86b7">${initials(worker.nome)}</span>
      <span class="worker-main">
        <strong>${html(worker.nome)}</strong>
        <span class="meta">${html(worker.funcao)} · ${html(worker.delegacao)}</span>
        <span class="badges">
          <span class="badge ok">${s.active} ativo(s)</span>
          ${s.expired ? `<span class="badge danger">${s.expired} expirado(s)</span>` : ""}
          ${s.warning ? `<span class="badge warn">${s.warning} a expirar</span>` : ""}
        </span>
      </span>
    </button>
  `;
}

function renderWorkerDetail() {
  const worker = state.data.trabalhadores.find(w => w.id === state.selectedWorkerId);
  if (!worker) { state.selectedWorkerId = null; return render(); }
  const events = state.data.eventos.filter(e => e.idTrab === worker.id).slice().reverse();
  const latestEntregaId = events.find(e => e.tipo === "ENTREGA")?.id;
  appEl.innerHTML = `
    <main>
      <button class="ghost-btn" data-action="backPeople">← Voltar</button>
      <section class="detail-header">
        <span class="avatar" style="background:#0f86b7">${initials(worker.nome)}</span>
        <div>
          <h1>${html(worker.nome)}</h1>
          <p class="meta">${html(worker.funcao)} · ${html(worker.delegacao)}</p>
        </div>
      </section>
      <div class="action-row">
        <button class="primary-btn" data-modal="delivery">+ Registar Entrega</button>
        <button class="ghost-btn" data-modal="audit">Inspeção Anual</button>
        <button class="ghost-btn" data-action="word">↓ Word Oficial</button>
        <button class="ghost-btn" data-action="printOfficial">Imprimir/PDF</button>
        ${isSuper() ? `<button class="danger-btn" data-action="deleteWorker">🗑 Apagar</button>` : ""}
      </div>
      <section class="section">
        <div class="section-head"><h2>Linha de Tempo de Eventos</h2></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Tipo</th><th>EPI/Âmbito</th><th>Qtd</th><th>Estado/Validade</th><th>Rubrica</th></tr></thead>
            <tbody>
              ${events.map(e => eventRow(e, worker, e.id === latestEntregaId)).join("") || `<tr><td colspan="6">Sem eventos registados.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </main>
    ${bottomNav()}
  `;
}

function eventRow(e, worker, isLatestEntrega) {
  const signatures = worker ? cachedWorkerSignature(worker.id) : {};
  const hasSig = isLatestEntrega && e.tipo === "ENTREGA" && (signatures.trabalhador || signatures.entregador) && !signatures.semAssinatura;
  const sig = hasSig
    ? `<img class="signature-thumb" src="${signatures.trabalhador || signatures.entregador}" alt="Assinatura">`
    : html(e.responsavel || "Sem assinatura");
  return `
    <tr class="${e.tipo === "AUDITORIA_GLOBAL" ? "audit" : ""}">
      <td>${html(e.data)}</td>
      <td>${e.tipo === "AUDITORIA_GLOBAL" ? "Auditoria" : "Entrega"}</td>
      <td>${html(epiLabel(e))}</td>
      <td class="mono">${e.qtd || "—"}</td>
      <td>${html(e.estado)}<br><span class="meta">${fmtDate(e.validade)}</span></td>
      <td>${sig}</td>
    </tr>
  `;
}

function renderStock() {
  const warehouse = isSuper() ? state.filters.stockWarehouse : state.user.armazem;
  return `
    <section class="section">
      <div class="field-row">
        <select class="select" data-filter="stockWarehouse" ${isSuper() ? "" : "disabled"}>
          ${warehouseList().map(w => `<option ${warehouse === w ? "selected" : ""}>${w}</option>`).join("")}
        </select>
      </div>
      <div class="section-head">
        <h2>Inventário · ${html(warehouse)}</h2>
        ${isSuper() ? `<button class="primary-btn" data-modal="article">+ Artigo</button>` : ""}
      </div>
      <div class="stock-list">
        ${state.data.matriz.map(epi => stockCard(epi, warehouse)).join("")}
      </div>
    </section>
  `;
}

function stockCard(epi, warehouse) {
  const qty = stockTotal(warehouse, epi.nome);
  const record = stockRecord(warehouse, epi.nome);
  const sizes = stockSizeEntries(warehouse, epi.nome);
  const tone = qty > 15 ? "ok" : qty > 5 ? "warn" : "danger";
  return `
    <div class="stock-card">
      <div>
        <strong>${html(epi.nome)}</strong>
        <div class="risks">Riscos: ${html(epi.riscos)} · ${epi.meses} meses</div>
        <div class="size-list">
          ${record.loose ? `<span>Sem tamanho: ${record.loose}</span>` : ""}
          ${sizes.map(([size, amount]) => `<span>${html(size)}: ${amount}</span>`).join("") || (!record.loose ? `<span>Sem stock por tamanho</span>` : "")}
        </div>
      </div>
      <div class="stock-actions">
        <span class="badge ${tone}">Total ${qty}</span>
        ${isSuper() ? `<button class="ghost-btn" data-entry="${html(epi.nome)}">+ Entrada</button>` : ""}
      </div>
    </div>
  `;
}

function renderAlerts() {
  const items = alerts();
  const expired = items.filter(a => a.alert === "expired");
  const warning = items.filter(a => a.alert === "warning");
  return `
    <section class="section">
      <div class="section-head"><h2>Expirados</h2><span class="badge danger">${expired.length}</span></div>
      <div class="alert-list">${expired.map(alertCard).join("") || `<div class="empty">Sem EPIs expirados.</div>`}</div>
    </section>
    <section class="section">
      <div class="section-head"><h2>A Expirar</h2><span class="badge warn">${warning.length}</span></div>
      <div class="alert-list">${warning.map(alertCard).join("") || `<div class="empty">Tudo em ordem.</div>`}</div>
    </section>
  `;
}

function alertCard(a) {
  return `
    <div class="alert-card">
      <div>
        <strong>${html(a.epi)}</strong>
        <span class="meta">${html(a.worker.nome)} · ${html(a.armazem)} · validade ${fmtDate(a.validade)}</span>
      </div>
      <button class="ghost-btn" data-renew-alert="${html(a.id)}">Trocar EPI</button>
    </div>
  `;
}

// ─── Auditoria ────────────────────────────────────────────────────────────────
function auditRows() {
  const workers = scopedWorkers();
  const workerIds = new Set(workers.map(w => w.id));
  const workersById = Object.fromEntries(workers.map(w => [w.id, w]));
  const rank = { expired: 0, warning: 1, normal: 2 }; // usado só na ordenação
  return state.data.eventos
    .filter(e => e.tipo === "ENTREGA" && workerIds.has(e.idTrab))
    .map(e => ({ ...e, worker: workersById[e.idTrab], status: eventStatus(e) }))
    .sort((a, b) => {
      // Mais urgente primeiro: expirado > a expirar > válido > substituído (baixa).
      const ra = a.statusAlerta === "ATIVO" ? rank[a.status] : 3;
      const rb = b.statusAlerta === "ATIVO" ? rank[b.status] : 3;
      if (ra !== rb) return ra - rb;
      return (a.validade || "").localeCompare(b.validade || "");
    });
}

function auditSummary(rows) {
  const workers = scopedWorkers();
  const ativos = rows.filter(r => r.statusAlerta === "ATIVO");
  const semAssinatura = ativos.filter(r => r.assinado === false);
  const desconhecida = ativos.filter(r => r.assinado === undefined);
  const expirados = ativos.filter(r => r.status === "expired");
  const aExpirar = ativos.filter(r => r.status === "warning");
  const validos = ativos.filter(r => r.status === "normal");
  const workersComEntrega = new Set(rows.map(r => r.idTrab));
  const semNenhumaEntrega = workers.filter(w => !workersComEntrega.has(w.id));
  const porDelegacao = warehouseList().map(d => {
    const dAtivos = ativos.filter(r => r.worker?.delegacao === d);
    return {
      delegacao: d,
      total: dAtivos.length,
      expirados: dAtivos.filter(r => r.status === "expired").length,
      aExpirar: dAtivos.filter(r => r.status === "warning").length,
      semAssinatura: dAtivos.filter(r => r.assinado === false).length
    };
  });
  return { ativos, semAssinatura, desconhecida, expirados, aExpirar, validos, semNenhumaEntrega, workers, porDelegacao };
}

function renderAudit() {
  const allRows = auditRows();
  const s = auditSummary(allRows);
  const conformidade = s.ativos.length ? Math.round((s.validos.length / s.ativos.length) * 100) : 100;
  const delegacoesFiltro = isSuper() ? ["TODAS", ...warehouseList()] : [state.user.armazem];
  const estados = ["TODOS", "expired", "warning", "normal", "semAssinatura", "baixa"];
  const estadoLabel = { TODOS: "Todos os estados", expired: "Expirados", warning: "A expirar", normal: "Válidos", semAssinatura: "Sem assinatura", baixa: "Substituídas (baixa)" };
  const rows = allRows.filter(r => {
    const okDelegacao = state.filters.delegacao === "TODAS" || r.worker?.delegacao === state.filters.delegacao;
    if (!okDelegacao) return false;
    const est = state.filters.auditEstado;
    if (est === "TODOS") return true;
    if (est === "semAssinatura") return r.statusAlerta === "ATIVO" && r.assinado === false;
    if (est === "baixa") return r.statusAlerta !== "ATIVO";
    return r.statusAlerta === "ATIVO" && r.status === est;
  });
  return `
    <section class="section">
      <div class="section-head"><h2>Estado de Conformidade</h2></div>
      <div class="kpi-grid">
        <div class="kpi"><span>Entregas ativas</span><strong>${s.ativos.length}</strong></div>
        <div class="kpi"><span>Válidas</span><strong>${s.validos.length}</strong></div>
        <div class="kpi"><span>A expirar (≤90 dias)</span><strong>${s.aExpirar.length}</strong></div>
        <div class="kpi"><span>Expiradas</span><strong>${s.expirados.length}</strong></div>
        <div class="kpi"><span>Sem assinatura</span><strong>${s.semAssinatura.length}</strong></div>
        <div class="kpi"><span>Trabalhadores sem entregas</span><strong>${s.semNenhumaEntrega.length}</strong></div>
      </div>
      <p class="meta">Taxa de conformidade (entregas ativas dentro da validade): <strong>${conformidade}%</strong>.
        As assinaturas e o registo completo de cada entrega ficam gravados de forma imutável na coleção
        <span class="mono">deliveries</span> do Firestore — a app nunca edita nem apaga esses documentos, só acrescenta.</p>
      <button class="primary-btn" data-action="exportAuditCsv">↓ Exportar Auditoria Completa (CSV)</button>
    </section>

    ${isSuper() ? `
    <section class="section">
      <div class="section-head"><h2>Por Delegação</h2></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Delegação</th><th>Ativas</th><th>Expiradas</th><th>A expirar</th><th>Sem assinatura</th></tr></thead>
          <tbody>${s.porDelegacao.map(d => `
            <tr>
              <td>${html(d.delegacao)}</td><td class="mono">${d.total}</td>
              <td class="mono">${d.expirados ? `<span class="badge danger">${d.expirados}</span>` : "0"}</td>
              <td class="mono">${d.aExpirar ? `<span class="badge warn">${d.aExpirar}</span>` : "0"}</td>
              <td class="mono">${d.semAssinatura ? `<span class="badge danger">${d.semAssinatura}</span>` : "0"}</td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    </section>` : ""}

    ${s.semNenhumaEntrega.length ? `
    <section class="section">
      <div class="section-head"><h2>Trabalhadores sem qualquer entrega</h2><span class="badge danger">${s.semNenhumaEntrega.length}</span></div>
      <div class="alert-list">${s.semNenhumaEntrega.map(w => `
        <div class="alert-card"><div><strong>${html(w.nome)}</strong><span class="meta">${html(w.funcao)} · ${html(w.delegacao)}</span></div></div>
      `).join("")}</div>
    </section>` : ""}

    ${s.semAssinatura.length ? `
    <section class="section">
      <div class="section-head"><h2>Entregas ativas sem assinatura</h2><span class="badge danger">${s.semAssinatura.length}</span></div>
      <div class="alert-list">${s.semAssinatura.map(r => `
        <div class="alert-card"><div><strong>${html(r.worker?.nome || "—")}</strong><span class="meta">${html(epiLabel(r))} · ${html(r.data)} · ${html(r.responsavel)}</span></div></div>
      `).join("")}</div>
    </section>` : ""}

    <section class="section">
      <div class="section-head"><h2>Registo Completo</h2><span class="badge blue">${rows.length} de ${allRows.length}</span></div>
      <div class="field-row two">
        <select class="select" data-filter="delegacao" ${isSuper() ? "" : "disabled"}>
          ${delegacoesFiltro.map(d => `<option ${state.filters.delegacao === d ? "selected" : ""}>${d}</option>`).join("")}
        </select>
        <select class="select" data-filter="auditEstado">
          ${estados.map(e => `<option value="${e}" ${state.filters.auditEstado === e ? "selected" : ""}>${estadoLabel[e]}</option>`).join("")}
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Trabalhador</th><th>EPI</th><th>Data</th><th>Validade</th><th>Estado</th><th>Assinatura</th><th>Responsável</th></tr></thead>
          <tbody>
            ${rows.map(auditRow).join("") || `<tr><td colspan="7">Sem entregas neste filtro.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function auditRow(r) {
  const isActive = r.statusAlerta === "ATIVO";
  const statusLabel = isActive ? ({ expired: "Expirado", warning: "A expirar", normal: "Válido" }[r.status] || r.estado) : "Substituída (baixa)";
  const statusBadge = isActive ? ({ expired: "danger", warning: "warn", normal: "ok" }[r.status] || "blue") : "blue";
  const sigLabel = r.assinado === true ? "Sim" : r.assinado === false ? "Não" : "N/D (anterior)";
  const sigBadge = r.assinado === true ? "ok" : r.assinado === false ? "danger" : "blue";
  return `
    <tr>
      <td>${html(r.worker?.nome || "—")}</td>
      <td>${html(epiLabel(r))}</td>
      <td>${html(r.data)}</td>
      <td>${fmtDate(r.validade)}</td>
      <td><span class="badge ${statusBadge}">${html(statusLabel)}</span></td>
      <td><span class="badge ${sigBadge}">${sigLabel}</span></td>
      <td>${html(r.responsavel)}</td>
    </tr>
  `;
}

function exportAuditCsv() {
  const rows = auditRows();
  const header = ["Trabalhador", "Função", "Delegação", "EPI", "Tamanho", "Data Entrega", "Validade", "Estado", "Assinatura", "Responsável"];
  const csvLines = [header.join(";")];
  rows.forEach(r => {
    const sig = r.assinado === true ? "Sim" : r.assinado === false ? "Não" : "N/D (anterior)";
    const statusLabel = r.statusAlerta === "ATIVO" ? ({ expired: "Expirado", warning: "A expirar", normal: "Válido" }[r.status] || r.estado) : "Substituída (baixa)";
    csvLines.push([
      r.worker?.nome || "", r.worker?.funcao || "", r.worker?.delegacao || "",
      r.epi, r.tamanho || "", r.data, fmtDate(r.validade), statusLabel, sig, r.responsavel
    ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
  });
  downloadTextFile("\uFEFF" + csvLines.join("\r\n"), `auditoria-epi-${todayISO()}.csv`, "text/csv;charset=utf-8");
}

function exportBudgetCsv() {
  const costs = allWorkerCosts();
  const header = ["Trabalhador", "Função", "Delegação", "Custo Total EPIs (€)"];
  const csvLines = [header.join(";")];
  costs.forEach(c => {
    csvLines.push([c.worker.nome, c.worker.funcao, c.worker.delegacao, c.custo.toFixed(2)]
      .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
  });
  downloadTextFile("\uFEFF" + csvLines.join("\r\n"), `custo-epis-por-trabalhador-${todayISO()}.csv`, "text/csv;charset=utf-8");
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function openModal(title, body) {
  modalRoot.innerHTML = `
    <div class="modal-overlay" data-close-modal>
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close-modal>×</button></div>
        ${body}
      </div>
    </div>
  `;
}

function closeModal() { modalRoot.innerHTML = ""; }

function workerModal() {
  const options = isSuper() ? warehouseList() : [state.user.armazem];
  openModal("Criar Trabalhador", `
    <form data-form="worker">
      <div class="field-row"><input class="input" name="nome" placeholder="Nome completo" required></div>
      <div class="field-row"><input class="input" name="funcao" placeholder="Função/Posto" required></div>
      <div class="field-row"><select class="select" name="delegacao">${options.map(w => `<option>${w}</option>`).join("")}</select></div>
      <button class="primary-btn" type="submit">Criar e Abrir Ficha</button>
    </form>
  `);
}

function deliveryModal(preselectedName = "") {
  const first = state.data.matriz.find(e => e.nome === preselectedName) || state.data.matriz[0];
  const worker = state.data.trabalhadores.find(w => w.id === state.selectedWorkerId);
  openModal("Registar Entrega", `
    <form data-form="delivery">
      <div id="delivery-items">
        ${deliveryItemRow(first.nome, worker?.delegacao)}
      </div>
      <button class="ghost-btn" type="button" data-action="addDeliveryItem">+ EPI</button>
      <button class="primary-btn" type="submit">Continuar → Recolher Assinatura</button>
    </form>
  `);
}

function deliveryItemRow(selectedName = "", warehouse = "") {
  const epi = state.data.matriz.find(e => e.nome === selectedName) || state.data.matriz[0];
  return `
    <div class="delivery-item">
      <div class="field-row">
        <select class="select" name="epi">${state.data.matriz.map(e => `<option value="${html(e.nome)}" ${e.nome === epi.nome ? "selected" : ""}>${html(e.nome)}</option>`).join("")}</select>
      </div>
      <div class="info-box delivery-info">Riscos ${epi.riscos}. Validade estimada: ${fmtDate(addMonths(new Date(), epi.meses))}</div>
      <div class="field-row two">
        <input class="input" name="qtd" type="number" min="1" value="1" required>
        <input class="input" name="meses" type="number" min="1" value="${epi.meses}" required>
      </div>
      <div class="field-row two">
        <select class="select delivery-size" name="tamanho">${deliverySizeOptions(warehouse, epi.nome)}</select>
        <button class="ghost-btn" type="button" data-action="removeDeliveryItem">Remover</button>
      </div>
    </div>
  `;
}

function deliverySizeOptions(warehouse, epiName) {
  const entries = warehouse ? stockSizeEntries(warehouse, epiName) : [];
  const loose = warehouse ? stockRecord(warehouse, epiName).loose : 0;
  return `
    <option value="">Sem tamanho${loose ? ` (${loose})` : ""}</option>
    ${entries.map(([size, qty]) => `<option value="${html(size)}">${html(size)} (${qty})</option>`).join("")}
  `;
}

function auditModal() {
  openModal("Inspeção Anual", `
    <form data-form="audit">
      <div class="field-row">
        <select class="select" name="estado">
          <option>Totalmente Aprovado</option>
          <option>Anomalias Detetadas</option>
        </select>
      </div>
      <div class="field-row"><textarea class="textarea" name="obs" placeholder="Observações técnicas"></textarea></div>
      <button class="primary-btn" type="submit">Gravar Inspeção</button>
    </form>
  `);
}

function articleModal() {
  openModal("Novo Artigo Global", `
    <form data-form="article">
      <div class="field-row"><input class="input" name="nome" placeholder="Designação" required></div>
      <div class="field-row"><input class="input" name="riscos" placeholder="Códigos de risco, ex: 6,11,13" required></div>
      <div class="field-row"><input class="input" name="meses" type="number" min="1" placeholder="Meses de validade padrão" required></div>
      <div class="field-row"><input class="input" name="preco" type="number" min="0" step="0.01" placeholder="Preço unitário (€) — opcional, editável depois"></div>
      <button class="primary-btn" type="submit">Adicionar à Matriz</button>
    </form>
  `);
}

function operadoresModal() {
  const ops = state.data.operadores;
  openModal("Gerir Operadores", `
    <form data-form="operador" style="margin-bottom:16px">
      <div class="field-row two">
        <input class="input" name="nome" placeholder="Nome do operador" required>
        <select class="select" name="armazem">
          <option value="TODAS">Todas as delegações</option>
          ${warehouseList().map(w => `<option value="${html(w)}">${html(w)}</option>`).join("")}
        </select>
      </div>
      <button class="primary-btn" type="submit">+ Adicionar</button>
    </form>
    <div class="worker-list" id="ops-list">
      ${ops.length ? ops.map((o, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:rgba(7,19,29,.92)">
          <span><strong>${html(o.nome)}</strong> <span class="meta">· ${html(o.armazem)}</span></span>
          <button class="danger-btn" style="min-height:32px;padding:0 10px;font-size:.82rem" data-del-op="${i}">Apagar</button>
        </div>
      `).join("") : `<div class="empty">Sem operadores ainda.</div>`}
    </div>
  `);
}

function warehousesModal() {
  const list = warehouseList();
  openModal("Gerir Armazéns", `
    <div class="section-head" style="margin-bottom:6px"><h2 style="font-size:1rem">Armazéns Existentes</h2></div>
    <div class="worker-list" id="warehouses-list">
      ${list.map((w, i) => {
        const protectedWh = isProtectedWarehouse(w);
        return `
        <div data-warehouse-row style="display:flex;gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:rgba(7,19,29,.92)">
          <input class="input" style="flex:1" data-warehouse-rename value="${html(w)}" ${protectedWh ? "disabled" : ""}>
          ${protectedWh
            ? `<span class="meta" style="white-space:nowrap">fixo (login)</span>`
            : `<button class="ghost-btn" style="min-height:32px;padding:0 10px;font-size:.82rem" data-action="renameWarehouse" data-index="${i}">Renomear</button>
               <button class="danger-btn" style="min-height:32px;padding:0 10px;font-size:.82rem" data-action="deleteWarehouse" data-index="${i}">Apagar</button>`}
        </div>
      `;}).join("")}
    </div>
    <p class="meta" style="margin-top:8px">Armazéns "fixos" estão associados a um login de operador local e não podem ser renomeados/apagados. Só é possível apagar um armazém sem trabalhadores e sem stock.</p>
    <form data-form="warehouse" style="margin-top:14px">
      <div class="field-row"><input class="input" name="nome" placeholder="Nome do novo armazém" required></div>
      <button class="primary-btn" type="submit">+ Adicionar Armazém</button>
    </form>

    <hr style="border-color:var(--line);margin:18px 0">

    <div class="section-head" style="margin-bottom:6px"><h2 style="font-size:1rem">Transferir Stock entre Armazéns</h2></div>
    <form data-form="transfer">
      <div class="field-row two">
        <select class="select" name="origem">${list.map(w => `<option>${html(w)}</option>`).join("")}</select>
        <select class="select" name="destino">${list.map((w, i) => `<option ${i === 1 ? "selected" : ""}>${html(w)}</option>`).join("")}</select>
      </div>
      <div class="field-row"><select class="select" name="epi">${state.data.matriz.map(e => `<option value="${html(e.nome)}">${html(e.nome)}</option>`).join("")}</select></div>
      <div class="field-row two">
        <select class="select" name="tamanho" id="transfer-size"></select>
        <input class="input" name="qtd" type="number" min="1" value="1" placeholder="Quantidade" required>
      </div>
      <div class="info-box" id="transfer-info"></div>
      <button class="primary-btn" type="submit">↔ Transferir</button>
    </form>
  `);
  updateTransferPreview(document.querySelector('[data-form="transfer"]'));
}

function transferStock(origem, destino, epiName, tamanho, qtd) {
  const record = stockRecord(origem, epiName);
  const key = String(tamanho || "").trim().toUpperCase();
  const available = key ? Number(record.sizes[key] || 0) : record.loose;
  if (qtd <= 0 || qtd > available) return false;
  if (key) record.sizes[key] -= qtd;
  else record.loose -= qtd;
  addStock(destino, epiName, qtd, tamanho);
  return true;
}

function updateTransferPreview(form) {
  if (!form) return;
  const origem = form.origem.value;
  const epiName = form.epi.value;
  const sizeSelect = form.tamanho;
  const currentSize = sizeSelect.value;
  sizeSelect.innerHTML = deliverySizeOptions(origem, epiName);
  if ([...sizeSelect.options].some(o => o.value === currentSize)) sizeSelect.value = currentSize;
  const info = form.querySelector("#transfer-info");
  if (info) {
    const total = stockTotal(origem, epiName);
    info.textContent = `Disponível em ${origem}: ${total} unidade(s) no total.`;
  }
}

async function renameWarehouse(target) {
  const index = Number(target.dataset.index);
  const oldName = warehouseList()[index];
  const row = target.closest("[data-warehouse-row]");
  const input = row?.querySelector("[data-warehouse-rename]");
  const newName = (input?.value || "").trim();
  if (isProtectedWarehouse(oldName)) { showToast("Este armazém está associado a um login fixo e não pode ser renomeado."); return; }
  if (!newName) { showToast("Indique um nome válido."); return; }
  if (newName === oldName) return;
  if (warehouseList().some((w, i) => i !== index && w.toLowerCase() === newName.toLowerCase())) {
    showToast("Já existe um armazém com esse nome."); return;
  }
  state.data.warehouses[index] = newName;
  state.data.stocks[newName] = state.data.stocks[oldName] || {};
  delete state.data.stocks[oldName];
  state.data.trabalhadores.forEach(w => { if (w.delegacao === oldName) w.delegacao = newName; });
  state.data.operadores.forEach(o => { if (o.armazem === oldName) o.armazem = newName; });
  if (state.filters.delegacao === oldName) state.filters.delegacao = newName;
  if (state.filters.stockWarehouse === oldName) state.filters.stockWarehouse = newName;
  await saveAll();
  warehousesModal();
  showToast(`Armazém renomeado para "${newName}".`);
}

async function deleteWarehouse(target) {
  const index = Number(target.dataset.index);
  const name = warehouseList()[index];
  if (isProtectedWarehouse(name)) { showToast("Este armazém está associado a um login fixo e não pode ser apagado."); return; }
  if (state.data.trabalhadores.some(w => w.delegacao === name)) {
    showToast(`Existem trabalhadores associados a "${name}". Mude-os de delegação antes de apagar.`); return;
  }
  const totalStock = state.data.matriz.reduce((sum, epi) => sum + stockTotal(name, epi.nome), 0);
  if (totalStock > 0) {
    showToast(`Ainda há ${totalStock} unidade(s) em stock em "${name}". Transfira o stock antes de apagar.`); return;
  }
  if (!confirm(`Apagar o armazém "${name}"? Esta ação não pode ser desfeita.`)) return;
  state.data.warehouses.splice(index, 1);
  delete state.data.stocks[name];
  if (state.filters.delegacao === name) state.filters.delegacao = "TODAS";
  if (state.filters.stockWarehouse === name) state.filters.stockWarehouse = warehouseList()[0] || "";
  await saveAll();
  warehousesModal();
  showToast(`Armazém "${name}" apagado.`);
}

function budgetModal() {
  const budget = state.data.budget || { limit: 0, items: {} };
  openModal("Editar Orçamento", `
    <form data-form="budget">
      <div class="field-row">
        <input class="input" name="limit" type="number" min="0" step="1" value="${Number(budget.limit || 0)}" placeholder="Limite geral disponível">
      </div>
      <div class="budget-editor">
        <div class="budget-editor-head"><span>EPI</span><span>Posso gastar</span><span>Gasto</span></div>
        ${state.data.matriz.map((epi, i) => {
          const item = budget.items?.[epi.nome] || {};
          return `
            <div class="budget-editor-row">
              <span>${html(epi.nome)}</span>
              <input class="input" name="planned_${i}" type="number" min="0" step="1" value="${Number(item.planned || 0)}">
              <input class="input" name="spent_${i}" type="number" min="0" step="1" value="${Number(item.spent || 0)}">
            </div>
          `;
        }).join("")}
      </div>
      <button class="primary-btn" type="submit">Guardar Orçamento</button>
    </form>
  `);
}

function entryModal(epiName) {
  const warehouse = state.filters.stockWarehouse;
  openModal("Entrada de Stock", `
    <form data-form="entry" data-epi="${html(epiName)}">
      <p class="meta">${html(epiName)} · ${html(warehouse)}</p>
      <div class="field-row two">
        <input class="input" name="qtd" type="number" min="1" value="1" placeholder="Quantidade" required>
        <input class="input" name="tamanho" placeholder="Tamanho, ex: M, XL, 42">
      </div>
      <button class="primary-btn" type="submit">Adicionar Entrada</button>
    </form>
  `);
}

// ─── Kiosk / assinatura ───────────────────────────────────────────────────────
function startKiosk(payload) {
  closeModal();
  state.pendingDelivery = payload;
  state.kioskPhase = 'worker';
  state.pendingWorkerSig = null;
  state.pendingDelivererSig = null;
  state.pendingNoSignWorker = false;
  state.pendingNoSignDeliverer = false;
  renderKiosk();
}

function renderKiosk() {
  const phase = state.kioskPhase;
  const payload = state.pendingDelivery;
  if (!payload) return;

  const workerName = payload.worker.nome;
  const itemSummary = payload.items.map(item =>
    `${item.epi.nome}${item.tamanho ? ` · Tam. ${item.tamanho}` : ''} · Qtd ${item.qtd}`
  ).join('<br>');

  const isWorker = phase === 'worker';
  const title = isWorker ? 'Assinatura do Trabalhador' : 'Rubrica de Quem Entrega';
  const instruction = isWorker
    ? 'Declaro ter recebido os EPIs indicados, em bom estado, comprometendo-me a utilizá-los corretamente.'
    : 'Confirmo a entrega dos EPIs ao trabalhador, nos termos da formação e informação prestada.';

  let kioskEl = document.querySelector('#kiosk');
  if (!kioskEl) {
    kioskEl = document.createElement('section');
    kioskEl.id = 'kiosk';
    kioskEl.className = 'kiosk';
    document.body.appendChild(kioskEl);
  }

  kioskEl.innerHTML = `
    <header>
      <div>
        <h1>${title}</h1>
        <p class="meta">${workerName}<br>${itemSummary}</p>
      </div>
      <button class="ghost-btn" data-action="cancelKiosk">Cancelar</button>
    </header>
    <div>
      <p class="legal">${instruction}</p>
      <label class="signature-label">Assine abaixo</label>
      <canvas class="signature-pad" id="kiosk-signature-pad"></canvas>
    </div>
    <div class="kiosk-actions">
      <button class="ghost-btn" data-action="clearSign">Limpar</button>
      <button class="ghost-btn" data-action="noSign">Sem assinatura</button>
      <button class="primary-btn" data-action="confirmKioskPhase">
        ${isWorker ? 'Confirmar assinatura →' : 'Confirmar e Guardar'}
      </button>
    </div>
  `;

  const canvas = document.querySelector('#kiosk-signature-pad');
  if (canvas) {
    state.currentPad = createSignaturePad(canvas);
  }

  requestAnimationFrame(() => {
    const canvasEl = document.querySelector('#kiosk-signature-pad');
    if (canvasEl) {
      const rect = canvasEl.getBoundingClientRect();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvasEl.width = Math.max(1, Math.floor(rect.width * ratio));
      canvasEl.height = Math.max(1, Math.floor(rect.height * ratio));
      const ctx = canvasEl.getContext('2d');
      ctx.scale(ratio, ratio);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#ffc35a';
      ctx.lineWidth = 3;
    }
  });
}

function createSignaturePad(canvas) {
  if (!canvas) return null;
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#ffc35a";
  ctx.lineWidth = 3;

  const strokes = [];
  let currentStroke = null;
  let drawing = false;

  const point = ev => {
    const box = canvas.getBoundingClientRect();
    const p = ev.touches ? ev.touches[0] : ev;
    return { x: p.clientX - box.left, y: p.clientY - box.top };
  };

  canvas.addEventListener("pointerdown", ev => {
    drawing = true;
    currentStroke = { points: [] };
    strokes.push(currentStroke);
    const p = point(ev);
    currentStroke.points.push(p);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvas.setPointerCapture?.(ev.pointerId);
  });
  canvas.addEventListener("pointermove", ev => {
    if (!drawing) return;
    ev.preventDefault();
    const p = point(ev);
    currentStroke.points.push(p);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  const stop = () => { drawing = false; currentStroke = null; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointerleave", stop);
  canvas.addEventListener("pointercancel", stop);

  return {
    isEmpty: () => strokes.length === 0,
    toData: () => strokes,
    clear: () => {
      strokes.length = 0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
}

function handleConfirmKioskPhase() {
  const phase = state.kioskPhase;
  const pad = state.currentPad;
  const isEmpty = !pad || pad.isEmpty();

  if (phase === 'worker') {
    state.pendingWorkerSig = isEmpty ? null : pad.toData();
    state.pendingNoSignWorker = false;
    if (isEmpty) {
      if (!confirm('A assinatura do trabalhador está vazia. Pretende avançar mesmo assim?')) {
        return;
      }
    }
    state.kioskPhase = 'deliverer';
    renderKiosk();
  } else { // deliverer
    state.pendingDelivererSig = isEmpty ? null : pad.toData();
    state.pendingNoSignDeliverer = false;
    if (isEmpty) {
      if (!confirm('A rubrica de quem entrega está vazia. Pretende guardar mesmo assim?')) {
        return;
      }
    }
    confirmDeliveryWithStoredSignatures();
  }
}

function handleNoSign() {
  const phase = state.kioskPhase;
  if (phase === 'worker') {
    state.pendingWorkerSig = null;
    state.pendingNoSignWorker = true;
    if (state.currentPad) state.currentPad.clear();
    state.kioskPhase = 'deliverer';
    renderKiosk();
  } else {
    state.pendingDelivererSig = null;
    state.pendingNoSignDeliverer = true;
    if (state.currentPad) state.currentPad.clear();
    confirmDeliveryWithStoredSignatures();
  }
}

async function confirmDeliveryWithStoredSignatures() {
  const payload = state.pendingDelivery;
  if (!payload) return;

  const worker = payload.worker;
  const responsavel = payload.responsavel || state.user.nome;
  const deliveryDate = todayISO();

  const hasWorkerSig = state.pendingWorkerSig !== null && state.pendingWorkerSig.length > 0;
  const hasDelivererSig = state.pendingDelivererSig !== null && state.pendingDelivererSig.length > 0;
  const withSignature = hasWorkerSig || hasDelivererSig;
  const semAssinatura = !withSignature || state.pendingNoSignWorker || state.pendingNoSignDeliverer;

  try {
    await Promise.all(payload.items.map(item => addDoc(collection(db, DELIVERIES_COLLECTION), {
      worker_id: worker.id,
      worker_nome: worker.nome,
      epi_type: item.epi.nome,
      qtd: item.qtd,
      tamanho: String(item.tamanho || '').trim().toUpperCase(),
      delivery_date: deliveryDate,
      validity_date: item.validade,
      riscos: item.epi.riscos,
      responsavel,
      sem_assinatura: semAssinatura,
      signature_points_trabalhador: state.pendingWorkerSig,
      signature_points_entregador: state.pendingDelivererSig,
      created_at: Date.now()
    })));
  } catch (e) {
    console.error('Erro a gravar assinatura da entrega:', e);
    alert(`Não foi possível guardar a entrega/assinatura.\n\nErro: ${e.code || ''} ${e.message || e}\n\nA entrega NÃO foi registada. Tira uma foto a este ecrã e mostra ao responsável técnico.`);
    return;
  }

  state.data.eventos.forEach(e => {
    if (e.idTrab === worker.id && e.tipo === 'ENTREGA' && payload.items.some(item => item.epi.nome === e.epi) && e.statusAlerta === 'ATIVO') {
      e.statusAlerta = 'BAIXA';
      e.estado = 'Baixa por nova entrega';
    }
  });
  const assinado = withSignature && !semAssinatura;
  payload.items.forEach(item => {
    const event = makeEventRaw(worker, item.epi, item.qtd, item.validade, 'ATIVO', responsavel, item.tamanho);
    event.assinado = assinado;
    state.data.eventos.push(event);
    removeStock(worker.delegacao, item.epi.nome, item.qtd, item.tamanho);
  });
  invalidateSignatureCache(worker.id);
  await saveAll();

  document.querySelector('#kiosk')?.remove();
  state.pendingDelivery = null;
  state.kioskPhase = null;
  state.currentPad = null;
  state.pendingWorkerSig = null;
  state.pendingDelivererSig = null;
  state.pendingNoSignWorker = false;
  state.pendingNoSignDeliverer = false;

  appEl.insertAdjacentHTML('beforeend', `<div class="success-pop">Entrega guardada</div>`);
  setTimeout(() => render(), 900);
}

// ─── Event listeners ──────────────────────────────────────────────────────────
document.addEventListener("click", ev => {
  const operador = ev.target.closest("[data-operador]")?.dataset.operador;
  if (operador) { state.operadorAtual = operador; render(); return; }

  const loginPin = ev.target.closest("[data-login-user]")?.dataset.loginUser;
  if (loginPin) { state.loginUser = USERS.find(u => u.pin === loginPin); state.pin = ""; renderLogin(); return; }

  const key = ev.target.closest("[data-key]")?.dataset.key;
  if (key) {
    state.pin = state.pin || "";
    if (key === "⌫") state.pin = state.pin.slice(0, -1);
    else if (key === "OK") tryLogin();
    else if (state.pin.length < 4) state.pin += key;
    if (state.pin.length === 4) tryLogin();
    else renderLogin();
    return;
  }

  const page = ev.target.closest("[data-page]")?.dataset.page;
  if (page) { state.page = page; state.selectedWorkerId = null; render(); return; }

  const actionTarget = ev.target.closest("[data-action]");
  const action = actionTarget?.dataset.action;
  if (action) { handleAction(action, actionTarget); return; }

  const workerId = ev.target.closest("[data-worker]")?.dataset.worker;
  if (workerId) { state.selectedWorkerId = Number(workerId); render(); return; }

  const modal = ev.target.closest("[data-modal]")?.dataset.modal;
  if (modal) { ({ worker: workerModal, delivery: deliveryModal, audit: auditModal, article: articleModal, budget: budgetModal, operadores: operadoresModal, warehouses: warehousesModal })[modal]?.(); return; }

  const renewAlertId = ev.target.closest("[data-renew-alert]")?.dataset.renewAlert;
  if (renewAlertId) {
    const alertEvent = alerts().find(a => a.id === renewAlertId);
    if (alertEvent) { state.selectedWorkerId = alertEvent.idTrab; deliveryModal(alertEvent.epi); }
    return;
  }

  const delOp = ev.target.closest("[data-del-op]")?.dataset.delOp;
  if (delOp !== undefined) {
    state.data.operadores.splice(Number(delOp), 1);
    saveAll();
    operadoresModal();
    return;
  }

  const entry = ev.target.closest("[data-entry]")?.dataset.entry;
  if (entry) entryModal(entry);

  if (ev.target.matches("[data-close-modal]")) closeModal();
});

function tryLogin() {
  if (state.pin === state.loginUser.pin) {
    state.user = state.loginUser;
    state.pin = "";
    state.filters.delegacao = isSuper() ? "TODAS" : state.user.armazem;
    state.filters.stockWarehouse = isSuper() ? "DPM Norte" : state.user.armazem;
    render();
  } else {
    const panel = document.querySelector("#pin-panel");
    state.pin = "";
    panel?.classList.add("shake");
    setTimeout(renderLogin, 450);
  }
}

async function deleteWorker() {
  const worker = state.data.trabalhadores.find(w => w.id === state.selectedWorkerId);
  if (!worker) return;
  if (!confirm(`Apagar "${worker.nome}" e todos os seus registos?\nEsta ação não pode ser desfeita.`)) return;
  state.data.trabalhadores = state.data.trabalhadores.filter(w => w.id !== worker.id);
  state.data.eventos = state.data.eventos.filter(e => e.idTrab !== worker.id);
  state.selectedWorkerId = null;
  state.page = "people";
  await saveAll();
  render();
}

function handleAction(action, target = null) {
  if (action === "logout") { state.user = null; state.operadorAtual = null; state.selectedWorkerId = null; renderLogin(); }
  if (action === "trocarOperador") { state.operadorAtual = null; render(); }
  if (action === "backPeople") { state.selectedWorkerId = null; state.page = "people"; render(); }
  if (action === "pdf") exportPdf();
  if (action === "word") exportWordOfficial();
  if (action === "printOfficial") openPrintOfficial();
  if (action === "deleteWorker") deleteWorker();
  if (action === "cancelKiosk") {
    document.querySelector('#kiosk')?.remove();
    state.pendingDelivery = null;
    state.kioskPhase = null;
    state.currentPad = null;
    state.pendingWorkerSig = null;
    state.pendingDelivererSig = null;
    state.pendingNoSignWorker = false;
    state.pendingNoSignDeliverer = false;
    render();
  }
  if (action === "clearSign") {
    if (state.currentPad) state.currentPad.clear();
  }
  if (action === "noSign") handleNoSign();
  if (action === "confirmKioskPhase") handleConfirmKioskPhase();
  if (action === "addDeliveryItem") addDeliveryItem();
  if (action === "removeDeliveryItem") removeDeliveryItem(target);
  if (action === "migrateSignatures") migrateLegacySignatures();
  if (action === "exportAuditCsv") exportAuditCsv();
  if (action === "exportBudgetCsv") exportBudgetCsv();
  if (action === "archiveOldEvents") archiveOldEvents();
  if (action === "renameWarehouse") renameWarehouse(target);
  if (action === "deleteWarehouse") deleteWarehouse(target);
}

function addDeliveryItem() {
  const worker = state.data.trabalhadores.find(w => w.id === state.selectedWorkerId);
  document.querySelector("#delivery-items")?.insertAdjacentHTML("beforeend", deliveryItemRow("", worker?.delegacao));
}

function removeDeliveryItem(target) {
  const items = [...document.querySelectorAll(".delivery-item")];
  if (items.length <= 1) return;
  target?.closest(".delivery-item")?.remove();
}

document.addEventListener("input", ev => {
  const filter = ev.target.dataset.filter;
  if (filter) { state.filters[filter] = ev.target.value; render(); return; }

  const form = ev.target.closest("form");

  if (form?.dataset.form === "delivery" && ev.target.name === "epi") {
    const epi = state.data.matriz.find(e => e.nome === ev.target.value);
    const item = ev.target.closest(".delivery-item");
    const meses = item?.querySelector('[name="meses"]') || form?.meses;
    if (meses) meses.value = epi.meses;
    const info = item?.querySelector(".delivery-info") || document.querySelector("#delivery-info");
    if (info) info.textContent = `Riscos ${epi.riscos}. Validade estimada: ${fmtDate(addMonths(new Date(), epi.meses))}`;
    const worker = state.data.trabalhadores.find(w => w.id === state.selectedWorkerId);
    const sizeSelect = item?.querySelector(".delivery-size") || form.querySelector("#delivery-size");
    if (sizeSelect) sizeSelect.innerHTML = deliverySizeOptions(worker?.delegacao, epi.nome);
    return;
  }

  if (form?.dataset.form === "transfer" && ["epi", "origem", "destino"].includes(ev.target.name)) {
    updateTransferPreview(form);
  }
});

document.addEventListener("submit", async ev => {
  ev.preventDefault();
  const form = ev.target;
  const kind = form.dataset.form;
  if (kind === "operador") {
    state.data.operadores.push({ nome: form.nome.value.trim(), armazem: form.armazem.value });
    await saveAll();
    operadoresModal();
    return;
  }
  if (kind === "worker") {
    const worker = { id: Date.now(), nome: form.nome.value.trim().toUpperCase(), funcao: form.funcao.value.trim(), delegacao: form.delegacao.value };
    state.data.trabalhadores.push(worker);
    await saveAll();
    closeModal();
    state.selectedWorkerId = worker.id;
    render();
  }
  if (kind === "delivery") {
    const worker = state.data.trabalhadores.find(w => w.id === state.selectedWorkerId);
    const responsavel = state.operadorAtual || state.user.nome;
    const items = [...form.querySelectorAll(".delivery-item")].map(item => {
      const epi = state.data.matriz.find(e => e.nome === item.querySelector('[name="epi"]').value);
      const meses = Number(item.querySelector('[name="meses"]').value);
      return {
        epi,
        qtd: Number(item.querySelector('[name="qtd"]').value),
        tamanho: item.querySelector('[name="tamanho"]').value,
        validade: addMonths(new Date(), meses)
      };
    }).filter(item => item.epi && item.qtd > 0);
    if (!items.length) return;
    startKiosk({ worker, items, responsavel });
  }
  if (kind === "audit") {
    const worker = state.data.trabalhadores.find(w => w.id === state.selectedWorkerId);
    state.data.eventos.push({
      id: uid("AUD"), idTrab: worker.id, data: new Date().toLocaleDateString("pt-PT"),
      tipo: "AUDITORIA_GLOBAL", epi: "Inspeção Anual", qtd: 0,
      armazem: worker.delegacao, estado: `${form.estado.value}${form.obs.value ? ` · ${form.obs.value}` : ""}`,
      statusAlerta: "—", validade: "", responsavel: state.user.nome
    });
    await saveAll(); closeModal(); render();
  }
  if (kind === "article") {
    const epi = { nome: form.nome.value.trim().toUpperCase(), riscos: form.riscos.value.trim(), meses: Number(form.meses.value), preco: Math.max(0, Number(form.preco.value) || 0) };
    state.data.matriz.push(epi);
    warehouseList().forEach(w => { state.data.stocks[w][epi.nome] = { loose: 0, sizes: {} }; });
    await saveAll(); closeModal(); render();
  }
  if (kind === "entry") {
    const epi = form.dataset.epi;
    const warehouse = state.filters.stockWarehouse;
    addStock(warehouse, epi, Number(form.qtd.value), form.tamanho.value);
    await saveAll(); closeModal(); render();
  }
  if (kind === "budget") {
    if (!isSuper()) return;
    const items = {};
    state.data.matriz.forEach((epi, i) => {
      const planned = Number(form[`planned_${i}`]?.value || 0);
      const spent = Number(form[`spent_${i}`]?.value || 0);
      if (planned || spent) items[epi.nome] = { planned, spent };
    });
    state.data.budget = { limit: Number(form.limit.value || 0), items };
    await saveAll(); closeModal(); render();
  }
  if (kind === "warehouse") {
    if (!isSuper()) return;
    const nome = form.nome.value.trim();
    if (!nome) return;
    if (warehouseList().some(w => w.toLowerCase() === nome.toLowerCase())) {
      showToast("Já existe um armazém com esse nome."); return;
    }
    state.data.warehouses.push(nome);
    state.data.stocks[nome] = {};
    state.data.matriz.forEach(epi => { state.data.stocks[nome][epi.nome] = { loose: 0, sizes: {} }; });
    await saveAll();
    warehousesModal();
    showToast(`Armazém "${nome}" criado.`);
  }
  if (kind === "transfer") {
    if (!isSuper()) return;
    const origem = form.origem.value;
    const destino = form.destino.value;
    const epiName = form.epi.value;
    const tamanho = form.tamanho.value;
    const qtd = Number(form.qtd.value || 0);
    if (origem === destino) { showToast("Escolha armazéns de origem e destino diferentes."); return; }
    if (!qtd || qtd <= 0) { showToast("Indique uma quantidade válida."); return; }
    const record = stockRecord(origem, epiName);
    const key = String(tamanho || "").trim().toUpperCase();
    const available = key ? Number(record.sizes[key] || 0) : record.loose;
    if (qtd > available) {
      showToast(`Só há ${available} unidade(s) disponível(eis) em ${origem}${tamanho ? ` (tam. ${tamanho})` : " sem tamanho"}.`);
      return;
    }
    transferStock(origem, destino, epiName, tamanho, qtd);
    await saveAll();
    showToast(`${qtd} unidade(s) de "${epiName}" transferida(s) de ${origem} para ${destino}.`);
    warehousesModal();
  }
  if (kind === "precos") {
    if (!isSuper()) return;
    form.querySelectorAll("[data-preco-epi]").forEach(input => {
      const epi = state.data.matriz.find(m => m.nome === input.dataset.precoEpi);
      if (epi) epi.preco = Math.max(0, Number(input.value) || 0);
    });
    await saveAll();
    showToast("Preços guardados.");
    render();
  }
});

// ─── PDF / Word / Print ──────────────────────────────────────────────────────
function workerDeliveryHistory(worker) {
  return state.data.eventos
    .filter(e => e.idTrab === worker.id && e.tipo === "ENTREGA" && e.statusAlerta === "ATIVO")
    .slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function workerOfficialRows(worker) {
  return state.data.eventos
    .filter(e => e.idTrab === worker.id && ((e.tipo === "ENTREGA" && e.statusAlerta === "ATIVO") || e.tipo === "AUDITORIA_GLOBAL"))
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function renderSignaturePoints(strokes) {
  if (!strokes || !strokes.length) return null;
  const width = 260, height = 100, pad = 10;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  strokes.forEach(stroke => (stroke?.points || []).forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }));
  if (!isFinite(minX)) return null;

  const boxW = Math.max(1, maxX - minX);
  const boxH = Math.max(1, maxY - minY);
  const scale = Math.min((width - pad * 2) / boxW, (height - pad * 2) / boxH, 4);
  const offsetX = (width - boxW * scale) / 2 - minX * scale;
  const offsetY = (height - boxH * scale) / 2 - minY * scale;

  ctx.strokeStyle = "#1a2a33";
  ctx.fillStyle = "#1a2a33";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  strokes.forEach(stroke => {
    const points = stroke?.points || [];
    if (!points.length) return;
    if (points.length === 1) {
      const p = points[0];
      ctx.beginPath();
      ctx.arc(p.x * scale + offsetX, p.y * scale + offsetY, 1.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x * scale + offsetX, points[0].y * scale + offsetY);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * scale + offsetX, points[i].y * scale + offsetY);
    }
    ctx.stroke();
  });
  return canvas.toDataURL("image/jpeg", 0.7);
}

async function fetchLatestSignature(workerId) {
  try {
    const q = query(collection(db, DELIVERIES_COLLECTION), where("worker_id", "==", workerId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docsData = snap.docs.map(d => d.data()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      const latest = docsData.find(d => d.signature_points_trabalhador || d.signature_points_entregador || d.legacy_image_trabalhador || d.legacy_image_entregador || d.sem_assinatura) || docsData[0];
      return {
        trabalhador: latest.legacy_image_trabalhador || renderSignaturePoints(latest.signature_points_trabalhador),
        entregador: latest.legacy_image_entregador || renderSignaturePoints(latest.signature_points_entregador),
        responsavel: latest.responsavel || "",
        semAssinatura: !!latest.sem_assinatura
      };
    }
    const legacy = state.data.latestSignatures?.[workerId];
    if (legacy) {
      return { trabalhador: legacy.trabalhador || null, entregador: legacy.entregador || null, responsavel: legacy.responsavel || "", semAssinatura: !!legacy.semAssinatura, legacyImage: true };
    }
    return {};
  } catch (e) {
    console.error("Erro a obter assinatura mais recente:", e);
    showToast(`Erro ao ir buscar assinatura (${e.code || e.message || "desconhecido"}). Ver consola (F12).`);
    return {};
  }
}

async function workerSignatures(worker) {
  return fetchLatestSignature(worker.id);
}

function invalidateSignatureCache(workerId) {
  delete state.workerSignatureCache[workerId];
}

function cachedWorkerSignature(workerId) {
  if (state.workerSignatureCache[workerId] !== undefined) return state.workerSignatureCache[workerId];
  state.workerSignatureCache[workerId] = {};
  fetchLatestSignature(workerId).then(sig => {
    state.workerSignatureCache[workerId] = sig;
    if (state.selectedWorkerId === workerId) render();
  });
  return {};
}

async function exportPdf() {
  await openPrintOfficial();
}

function downloadTextFile(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportWordOfficial() {
  const worker = state.data.trabalhadores.find(w => w.id === state.selectedWorkerId);
  const events = workerOfficialRows(worker);
  const signatures = await workerSignatures(worker);
  const riskCells = Object.entries(RISKS).map(([n, label]) => `<td><b>${n}</b> - ${html(label)}</td>`);
  const riskRows = [];
  for (let i = 0; i < riskCells.length; i += 3) {
    riskRows.push(`<tr>${riskCells.slice(i, i + 3).join("")}${"<td></td>".repeat(3 - riskCells.slice(i, i + 3).length)}</tr>`);
  }
  const rows = events.map(e => `
    <tr>
      <td>${html(e.tipo === "AUDITORIA_GLOBAL" ? "INSPEÇÃO ANUAL" : epiLabel(e))}</td>
      <td>${html(epiRiscos(e))}</td>
      <td class="center">${e.qtd || "—"}</td>
      <td class="center">${html(e.data)}</td>
      <td class="center">${html(e.responsavel)}</td>
      <td class="center">${fmtDate(e.validade)}</td>
      <td class="center">${e.tipo === "AUDITORIA_GLOBAL" ? html(e.estado) : ""}</td>
    </tr>`).join("") || `<tr><td colspan="7" class="center">Sem entregas registadas.</td></tr>`;

  const doc = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>IMP35.001</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1{size:21cm 29.7cm;margin:.65cm .65cm .65cm .65cm}div.WordSection1{page:WordSection1}
body{font-family:Arial,sans-serif;font-size:7.5pt;color:#000}table{border-collapse:collapse;width:100%;table-layout:fixed}
td,th{border:.75pt solid #000;padding:2pt 3pt;vertical-align:middle;line-height:1.05}th{background:#e9eef2;font-weight:bold;text-align:center}
thead{display:table-header-group}tfoot{display:table-footer-group}tr{page-break-inside:avoid;break-inside:avoid}
.head td{border:1.2pt solid #000;font-size:10pt;font-weight:bold}.worker td{height:24pt;font-size:8.5pt}
.legal{font-size:7pt;margin:4pt 0;line-height:1.15}.epi th,.epi td{font-size:6.7pt;min-height:14.5pt}
.center{text-align:center}.risk td{font-size:6.4pt;border:.5pt solid #777}
.sign{max-width:86pt;max-height:26pt;object-fit:contain}.sign-rubrica{width:58pt;height:18pt}
.sign-footer{width:120pt;height:32pt}.foot td{height:42pt;border-top:1pt solid #000;border-left:none;border-right:none;border-bottom:none}
h3{font-size:8pt;margin:5pt 0 2pt}
</style></head><body><div class="WordSection1">
<table class="head"><tr>
<td style="width:42%">DPM Solutions</td>
<td style="width:58%;text-align:right">Registo de Entrega de EPI's<br><span style="font-size:8pt">IMP35.001 Ed.1</span></td>
</tr></table>
<table class="worker"><tr>
<td style="width:52%"><b>Nome:</b><br>${html(worker.nome.toUpperCase())}</td>
<td style="width:48%"><b>Função:</b><br>${html(worker.funcao)} [${html(worker.delegacao)}]</td>
</tr></table>
<p class="legal">Declaro que recebi os Equipamentos de Proteção Individual abaixo indicados, tomei conhecimento das regras de utilização, conservação e devolução, no âmbito das obrigações previstas no Decreto-Lei 102/2009.</p>
<table class="epi">
<thead><tr>
  <th style="width:28%">Designação do EPI</th>
  <th style="width:18%">Riscos</th>
  <th style="width:6%">QTD</th>
  <th style="width:13%">Data</th>
  <th style="width:15%">Resp. pela entrega</th>
  <th style="width:12%">Validade</th>
  <th style="width:8%">Devolução</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<h3>Riscos a eliminar/minimizar</h3>
<table class="risk">${riskRows.join("")}</table>
<table class="foot" style="margin-top:8pt"><tr>
<td style="width:50%"><b>Declaração final:</b> Declaro que todos os EPIs acima listados me foram entregues nas datas indicadas, com a respetiva rubrica.<br><br>Assinatura digital do trabalhador<br>${signatures.trabalhador ? `<img class="sign sign-footer" width="160" height="42" src="${signatures.trabalhador}">` : ""}</td>
<td style="width:50%">Rubrica de quem entrega<br>${signatures.entregador ? `<img class="sign sign-footer" width="160" height="42" src="${signatures.entregador}">` : html(signatures.responsavel || "")}</td>
</tr></table>
</div></body></html>`;

  downloadTextFile(doc, `IMP35.001_${worker.nome.replace(/\s+/g, "_")}.doc`, "application/msword;charset=utf-8");
}

async function openPrintOfficial() {
  const worker = state.data.trabalhadores.find(w => w.id === state.selectedWorkerId);
  const printWindow = window.open("", "_blank");
  if (!printWindow) { alert("O browser bloqueou a janela de impressão. Permita pop-ups e tente novamente."); return; }
  printWindow.document.write("<p style='font-family:sans-serif;padding:2rem;color:#555'>A preparar documento…</p>");
  const events = workerOfficialRows(worker);
  const signatures = await workerSignatures(worker);
  const riskCells = Object.entries(RISKS).map(([n, label]) => `<td><b>${n}</b> - ${html(label)}</td>`);
  const riskRows = [];
  for (let i = 0; i < riskCells.length; i += 3) {
    const slice = riskCells.slice(i, i + 3);
    riskRows.push(`<tr>${slice.join("")}${"<td></td>".repeat(3 - slice.length)}</tr>`);
  }
  const rows = events.map(e => `
    <tr>
      <td>${html(e.tipo === "AUDITORIA_GLOBAL" ? "INSPEÇÃO ANUAL" : epiLabel(e))}</td>
      <td>${html(epiRiscos(e))}</td>
      <td class="center">${e.qtd || "—"}</td>
      <td class="center">${html(e.data)}</td>
      <td class="center">${html(e.responsavel)}</td>
      <td class="center">${fmtDate(e.validade)}</td>
      <td class="center">${e.tipo === "AUDITORIA_GLOBAL" ? html(e.estado) : ""}</td>
    </tr>`).join("") || `<tr><td colspan="7" class="center">Sem entregas registadas.</td></tr>`;

  const doc = `<!doctype html>
<html lang="pt-PT"><head><meta charset="utf-8"><title>IMP35.001 - ${html(worker.nome)}</title>
<style>
@page{size:A4 portrait;margin:6.5mm}*{box-sizing:border-box}
body{margin:0;background:#fff;color:#000;font-family:Arial,sans-serif;font-size:7.5pt}
.sheet{width:197mm;min-height:284mm;margin:0 auto;background:#fff}
table{border-collapse:collapse;width:100%;table-layout:fixed}
td,th{border:.75pt solid #000;padding:2pt 3pt;vertical-align:middle;line-height:1.05}
th{background:#e9eef2;text-align:center;font-weight:700}
thead{display:table-header-group}tfoot{display:table-footer-group}tr{page-break-inside:avoid;break-inside:avoid}
.head td{border:1.2pt solid #000;font-size:10pt;font-weight:700}.worker td{height:24pt;font-size:8.5pt}
.legal{font-size:7pt;margin:4pt 0;line-height:1.15}.epi th,.epi td{font-size:6.7pt;min-height:14.5pt}
.center{text-align:center}.rubrica{padding:0}
.sign-row{display:block;width:22mm;height:7mm;object-fit:contain;margin:0 auto}
.sign-footer{display:block;width:42mm;height:12mm;object-fit:contain;margin-top:2mm}
.risk td{font-size:6.4pt;border:.5pt solid #777}
.foot{margin-top:8pt}.foot td{height:42pt;border-top:1pt solid #000;border-left:none;border-right:none;border-bottom:none}
h3{font-size:8pt;margin:5pt 0 2pt}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{width:auto;min-height:auto}}
</style></head><body><div class="sheet">
<table class="head"><tr>
<td style="width:42%">DPM Solutions</td>
<td style="width:58%;text-align:right">Registo de Entrega de EPI's<br><span style="font-size:8pt">IMP35.001 Ed.1</span></td>
</tr></table>
<table class="worker"><tr>
<td style="width:52%"><b>Nome:</b><br>${html(worker.nome.toUpperCase())}</td>
<td style="width:48%"><b>Função:</b><br>${html(worker.funcao)} [${html(worker.delegacao)}]</td>
</tr></table>
<p class="legal">Declaro que recebi os Equipamentos de Proteção Individual abaixo indicados, tomei conhecimento das regras de utilização, conservação e devolução, no âmbito das obrigações previstas no Decreto-Lei 102/2009.</p>
<table class="epi">
<thead><tr>
  <th style="width:28%">Designação do EPI</th>
  <th style="width:18%">Riscos</th>
  <th style="width:6%">QTD</th>
  <th style="width:13%">Data</th>
  <th style="width:15%">Resp. pela entrega</th>
  <th style="width:12%">Validade</th>
  <th style="width:8%">Devolução</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<h3>Riscos a eliminar/minimizar</h3>
<table class="risk">${riskRows.join("")}</table>
<table class="foot"><tr>
<td style="width:50%"><b>Declaração final:</b> Declaro que todos os EPIs acima listados me foram entregues nas datas indicadas, com a respetiva rubrica.<br><br>Assinatura digital do trabalhador<br>${signatures.trabalhador ? `<img class="sign-footer" src="${signatures.trabalhador}" alt="">` : ""}</td>
<td style="width:50%">Rubrica de quem entrega<br>${signatures.entregador ? `<img class="sign-footer" src="${signatures.entregador}" alt="">` : html(signatures.responsavel || "")}</td>
</tr></table>
</div>
<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},250);});<\/script>
</body></html>`;

  printWindow.document.open();
  printWindow.document.write(doc);
  printWindow.document.close();
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function iconHome() { return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>`; }
function iconUsers() { return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`; }
function iconBox() { return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>`; }
function iconBell() { return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`; }
function iconAudit() { return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M9 11.5 11 13.5 15.5 9"/><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z"/></svg>`; }
function iconBudget() { return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c0-1.4 1.2-2.5 2.5-2.5s2.5.8 2.5 2c0 2-5 1.5-5 3.5 0 1.2 1.2 2 2.5 2s2.5-1.1 2.5-2.5"/></svg>`; }

// ─── Arranque ─────────────────────────────────────────────────────────────────
renderLogin();
loadFromFirestore().then(() => subscribeRealtime());