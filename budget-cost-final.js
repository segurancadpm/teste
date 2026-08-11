import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Único sincronizador do Custo / Funcionário.
// O módulo principal continua responsável pelo layout; este módulo apenas
// substitui os dados da tabela depois de cruzar entregas + trabalhadores + preços.
const MAIN_DOC = "dpm_epi_data_v1";
const DELIVERY_COLLECTION = "deliveries";
let busy = false;
let lastRoot = null;

const db = () => getFirestore(getApp());
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const num = v => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim().replace(/\s/g, "");
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};
const euro = v => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(num(v));
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));

function setLoading(on) {
  const root = document.querySelector(".budget-management-root");
  if (root) root.dataset.costLoading = on ? "1" : "0";
}

async function load() {
  const firestore = db();
  const [mainSnap, deliverySnap] = await Promise.all([
    getDoc(doc(firestore, "appdata", MAIN_DOC)),
    getDocs(collection(firestore, DELIVERY_COLLECTION))
  ]);
  const data = mainSnap.exists() ? mainSnap.data() : {};
  return { data, deliveries: deliverySnap.docs.map(d => ({ id: d.id, ...d.data() })) };
}

function priceMap(data) {
  const map = new Map();
  const put = (name, value) => {
    const key = norm(name);
    if (!key) return;
    const price = num(value);
    if (price > 0 || !map.has(key)) map.set(key, price);
  };
  (Array.isArray(data.matriz) ? data.matriz : []).forEach(e => put(e.nome, e.preco));
  const legacy = data?.budget?.items;
  if (Array.isArray(legacy)) legacy.forEach(e => put(e.nome ?? e.name ?? e.epi ?? e.artigo, e.unitPrice ?? e.preco ?? e.price));
  else if (legacy && typeof legacy === "object") Object.entries(legacy).forEach(([name, e]) => put(e?.nome ?? e?.name ?? name, e?.unitPrice ?? e?.preco ?? e?.price ?? e));
  const planning = data?.budget?.management?.planning;
  if (planning && typeof planning === "object") Object.entries(planning).forEach(([name, e]) => put(name, e?.unitPrice));
  return map;
}

function fields(e) {
  return {
    workerId: e.worker_id ?? e.trabalhador_id ?? e.workerId ?? e.idTrab,
    workerName: e.worker_nome ?? e.trabalhador ?? e.worker_name ?? e.nomeTrabalhador,
    product: e.epi_type ?? e.epi ?? e.nomeEpi ?? e.artigo ?? e.produto ?? e.nome,
    quantity: num(e.qtd ?? e.quantidade ?? e.qty ?? e.quantity),
    price: num(e.preco ?? e.unitPrice ?? e.unit_price ?? e.price)
  };
}

function workerFor(data, row) {
  const list = Array.isArray(data.trabalhadores) ? data.trabalhadores : [];
  const f = fields(row);
  let worker = list.find(w => String(w.id) === String(f.workerId));
  if (!worker && f.workerName) worker = list.find(w => norm(w.nome) === norm(f.workerName));
  return worker || null;
}

async function refresh() {
  const root = document.querySelector(".budget-management-root");
  const tab = root?.querySelector('[data-budget-tab="custo"].active');
  if (!root || !tab || busy || root === lastRoot) return;
  const heading = [...root.querySelectorAll("h3")].find(h => norm(h.textContent) === "CUSTO POR FUNCIONARIO");
  const section = heading?.closest("section");
  const tableWrap = section?.querySelector(".table-wrap");
  if (!tableWrap) return;

  busy = true;
  setLoading(true);
  try {
    const { data, deliveries } = await load();
    const prices = priceMap(data);
    const rowsSource = deliveries.length
      ? deliveries
      : (Array.isArray(data.eventos) ? data.eventos.filter(e => e.tipo === "ENTREGA") : []);
    const result = new Map();

    rowsSource.forEach(raw => {
      const f = fields(raw);
      if (!f.product) return;
      const worker = workerFor(data, raw);
      const name = worker?.nome || f.workerName || (f.workerId ? `Trabalhador ${f.workerId}` : "Trabalhador não identificado");
      const key = String(worker?.id ?? f.workerId ?? norm(name));
      const quantity = f.quantity > 0 ? f.quantity : 1;
      const unitPrice = f.price > 0 ? f.price : (prices.get(norm(f.product)) || 0);
      if (!result.has(key)) result.set(key, { name, function: worker?.funcao || "", delegation: worker?.delegacao || "", quantity: 0, cost: 0 });
      const row = result.get(key);
      row.quantity += quantity;
      row.cost += quantity * unitPrice;
    });

    const rows = [...result.values()].sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name, "pt-PT"));
    tableWrap.innerHTML = `<table class="budget-table"><thead><tr><th>Funcionário</th><th>Função</th><th>Delegação</th><th>Qtd. EPI</th><th>Custo</th></tr></thead><tbody>${rows.length ? rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.function)}</td><td>${esc(r.delegation)}</td><td>${r.quantity}</td><td>${euro(r.cost)}</td></tr>`).join("") : `<tr><td colspan="5">Não existem entregas registadas.</td></tr>`}</tbody></table>`;
    lastRoot = root;
  } catch (error) {
    console.error("Custo por funcionário:", error);
  } finally {
    setLoading(false);
    busy = false;
  }
}

document.addEventListener("click", event => {
  if (!event.target.closest('[data-budget-tab="custo"]')) return;
  lastRoot = null;
  setLoading(true);
  setTimeout(refresh, 80);
}, true);

setInterval(() => {
  const root = document.querySelector(".budget-management-root");
  if (root?.querySelector('[data-budget-tab="custo"].active')) refresh().catch(console.error);
}, 600);

setTimeout(() => refresh().catch(console.error), 250);
