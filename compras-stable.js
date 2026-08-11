import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, getDocFromCache, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Fallback independente para a aba Compras.
// Nunca deixa a interface presa indefinidamente em "A carregar...".
const MAIN_DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente"];
const QUARTERS = ["T1", "T2", "T3", "T4"];
const LOAD_TIMEOUT = 5000;
let db = null;
let busy = false;

const getDb = () => db || (db = getFirestore(getApp()));
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const num = v => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim().replace(/\s/g, "");
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};
const euro = v => new Intl.NumberFormat("pt-PT", {style:"currency",currency:"EUR"}).format(num(v));
const today = () => new Date().toISOString().slice(0,10);

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("O Firestore demorou demasiado tempo a responder.")), ms));
}

async function load() {
  const ref = doc(getDb(), "appdata", MAIN_DOC);
  try {
    // A app principal já costuma ter este documento em cache. Primeiro tentamos
    // a leitura normal, mas nunca permitimos que a aba fique bloqueada.
    const snap = await Promise.race([getDoc(ref), timeout(LOAD_TIMEOUT)]);
    if (snap.exists()) return snap.data();
  } catch (serverError) {
    console.warn("Compras: leitura online demorou/falhou; a tentar cache local.", serverError);
  }

  try {
    const cached = await getDocFromCache(ref);
    if (cached.exists()) return cached.data();
  } catch (cacheError) {
    console.warn("Compras: documento não disponível no cache local.", cacheError);
  }

  throw new Error("Não foi possível carregar os dados das Compras. Verifica a ligação ao Firebase e tenta novamente.");
}

async function savePurchases(data, purchases) {
  if (!data.budget || typeof data.budget !== "object") data.budget = {};
  if (!data.budget.management || typeof data.budget.management !== "object") data.budget.management = {};
  data.budget.management.purchases = purchases;
  await setDoc(doc(getDb(), "appdata", MAIN_DOC), { budget: data.budget }, { merge: true });
}

function root() { return document.querySelector(".budget-management-root"); }
function comprasButton() { return [...document.querySelectorAll("[data-budget-tab]")].find(b => b.getAttribute("data-budget-tab") === "compras"); }
function activeCompras() {
  const b = comprasButton();
  return !!b && (b.classList.contains("active") || b.getAttribute("aria-selected") === "true");
}

function renderError(message) {
  const r = root();
  if (!r || !activeCompras()) return;
  const old = r.querySelector(".compras-stable-view");
  if (old) old.remove();
  const error = document.createElement("div");
  error.className = "budget-error compras-stable-error";
  error.innerHTML = `<strong>Compras</strong><br>${esc(message)}<br><button type="button" class="primary" id="cs-retry" style="margin-top:10px">Tentar novamente</button>`;
  r.appendChild(error);
  error.querySelector("#cs-retry")?.addEventListener("click", () => activate(true));
}

function render(data) {
  const r = root();
  if (!r || !activeCompras()) return false;
  const purchases = Array.isArray(data?.budget?.management?.purchases) ? data.budget.management.purchases : [];
  const epis = Array.isArray(data?.matriz) ? data.matriz : [];
  const total = purchases.reduce((s,p) => s + num(p.quantity) * num(p.unitPrice), 0);
  const options = epis.map(e => `<option value="${esc(e.nome)}">${esc(e.nome)}</option>`).join("");

  const view = document.createElement("div");
  view.className = "budget-view compras-stable-view";
  view.innerHTML = `
    <section class="budget-card">
      <div class="section-head"><div><h3>Compras</h3><p class="muted">Regista cada compra pela família e pelo trimestre. Os dados alimentam automaticamente o Resumo e o gasto trimestral.</p></div><strong>${euro(total)}</strong></div>
      <div class="form-grid">
        <label>Família<select id="cs-family">${FAMILIES.map(f => `<option>${f}</option>`).join("")}</select></label>
        <label>Trimestre<select id="cs-quarter">${QUARTERS.map(q => `<option>${q}</option>`).join("")}</select></label>
        <label>Data<input id="cs-date" type="date" value="${today()}"></label>
        <label id="cs-epi-wrap">EPI<select id="cs-epi"><option value="">Selecionar EPI</option>${options}</select></label>
        <label id="cs-product-wrap" class="wide" style="display:none">Produto<input id="cs-product" placeholder="Produto / equipamento / serviço"></label>
        <label>Quantidade<input id="cs-qty" type="number" min="0" step="1" placeholder="0"></label>
        <label>Preço unitário (€)<input id="cs-price" type="number" min="0" step="0.01" placeholder="0,00"></label>
        <label>Fornecedor<input id="cs-supplier" placeholder="Fornecedor"></label>
        <label>N.º fatura<input id="cs-invoice" placeholder="Opcional"></label>
      </div>
      <button type="button" class="primary" id="cs-add">Registar compra</button>
    </section>
    <section class="budget-card">
      <div class="section-head"><div><h3>Compras registadas</h3><p class="muted">${purchases.length} registo(s)</p></div><strong>${euro(total)}</strong></div>
      <div class="table-wrap"><table class="budget-table"><thead><tr><th>Data</th><th>Família</th><th>Trimestre</th><th>Produto</th><th>Qtd.</th><th>Preço</th><th>Total</th><th>Fornecedor</th><th></th></tr></thead><tbody>
      ${purchases.length ? purchases.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map((p,i)=>`<tr><td>${esc(p.date)}</td><td>${esc(p.family)}</td><td>${esc(p.quarter)}</td><td>${esc(p.product)}</td><td>${num(p.quantity)}</td><td>${euro(p.unitPrice)}</td><td>${euro(num(p.quantity)*num(p.unitPrice))}</td><td>${esc(p.supplier)}</td><td><button type="button" class="danger-link" data-cs-delete="${esc(p.id || i)}">Eliminar</button></td></tr>`).join("") : `<tr><td colspan="9">Ainda não existem compras registadas.</td></tr>`}
      </tbody></table></div>
    </section>`;

  r.querySelectorAll(".compras-stable-view").forEach(v => v.remove());
  r.querySelectorAll(".compras-stable-error").forEach(v => v.remove());
  r.appendChild(view);

  const family = view.querySelector("#cs-family");
  const toggleProduct = () => {
    const isEpi = family.value === "EPI";
    view.querySelector("#cs-epi-wrap").style.display = isEpi ? "" : "none";
    view.querySelector("#cs-product-wrap").style.display = isEpi ? "none" : "";
  };
  family.addEventListener("change", toggleProduct);
  toggleProduct();

  view.querySelector("#cs-epi")?.addEventListener("change", () => {
    const item = epis.find(e => e.nome === view.querySelector("#cs-epi").value);
    if (item && num(item.preco) > 0) view.querySelector("#cs-price").value = num(item.preco);
  });

  view.querySelector("#cs-add").addEventListener("click", async () => {
    if (busy) return;
    const f = family.value;
    const product = f === "EPI" ? view.querySelector("#cs-epi").value : view.querySelector("#cs-product").value.trim();
    const quantity = num(view.querySelector("#cs-qty").value);
    const unitPrice = num(view.querySelector("#cs-price").value);
    if (!product) return alert("Seleciona/indica o produto.");
    if (quantity <= 0) return alert("Indica uma quantidade superior a zero.");
    if (unitPrice < 0) return alert("O preço não pode ser negativo.");
    busy = true;
    try {
      const fresh = await load();
      const list = Array.isArray(fresh?.budget?.management?.purchases) ? fresh.budget.management.purchases.slice() : [];
      list.push({ id:`p_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, date:view.querySelector("#cs-date").value || today(), family:f, quarter:view.querySelector("#cs-quarter").value, product, quantity, unitPrice, supplier:view.querySelector("#cs-supplier").value.trim(), invoice:view.querySelector("#cs-invoice").value.trim(), createdAt:Date.now() });
      await savePurchases(fresh, list);
      render(fresh);
    } catch (e) {
      console.error("Compras:", e);
      alert(`Não foi possível guardar a compra.\n\n${e.message || e}`);
    } finally { busy = false; }
  });

  view.addEventListener("click", async e => {
    const btn = e.target.closest("[data-cs-delete]");
    if (!btn || busy) return;
    if (!confirm("Eliminar este registo de compra?")) return;
    busy = true;
    try {
      const fresh = await load();
      const list = Array.isArray(fresh?.budget?.management?.purchases) ? fresh.budget.management.purchases.slice() : [];
      const id = btn.dataset.csDelete;
      const index = list.findIndex((p,i) => String(p.id || i) === String(id));
      if (index >= 0) list.splice(index,1);
      await savePurchases(fresh, list);
      render(fresh);
    } catch (e) { console.error(e); alert(`Não foi possível eliminar o registo.\n\n${e.message || e}`); }
    finally { busy = false; }
  });
  return true;
}

async function activate(force = false) {
  if (!activeCompras()) return;
  const r = root();
  if (!r) return;
  if (!force && r.dataset.comprasStable === "1" && r.querySelector(".compras-stable-view")) return;
  try {
    const data = await load();
    if (render(data)) r.dataset.comprasStable = "1";
  } catch (e) {
    console.error("Compras stable:", e);
    r.dataset.comprasStable = "0";
    renderError(e?.message || e);
  }
}

document.addEventListener("click", e => {
  const b = e.target.closest('[data-budget-tab="compras"]');
  if (b) setTimeout(() => activate(true), 30);
});

new MutationObserver(() => {
  if (activeCompras()) activate();
}).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class","aria-selected"] });

setTimeout(() => activate(), 400);
