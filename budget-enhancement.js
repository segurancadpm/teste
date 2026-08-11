import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAqt5RDygjfeQZ3zq8dYhEGbyIjg00Bbks",
  authDomain: "dpm-epi.firebaseapp.com",
  projectId: "dpm-epi",
  storageBucket: "dpm-epi.firebasestorage.app",
  messagingSenderId: "1043253642340",
  appId: "1:1043253642340:web:d3e0920050b8407f48cb71",
  measurementId: "G-VZK3WE1MDJ"
};
const db = getFirestore(initializeApp(firebaseConfig));
const MAIN = doc(db, "appdata", "dpm_epi_data_v1");
let data = null;
let busy = false;

const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const eur = v => new Intl.NumberFormat("pt-PT", { style:"currency", currency:"EUR", maximumFractionDigits:2 }).format(Number(v || 0));
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const today = () => new Date().toLocaleDateString("pt-PT");
const id = () => `PC-${Date.now().toString(36).toUpperCase()}`;

async function load() {
  const snap = await getDoc(MAIN);
  if (!snap.exists()) return;
  data = snap.data();
  data.matriz ||= [];
  data.stocks ||= {};
  data.warehouses ||= [];
  data.budget ||= {};
  data.budget.year ||= new Date().getFullYear();
  data.budget.limit = num(data.budget.limit);
  data.budget.items ||= {};
  data.budget.purchases ||= [];
  data.budget.purchases = Array.isArray(data.budget.purchases) ? data.budget.purchases : [];
}

async function saveBudget() {
  if (busy) return false;
  busy = true;
  try {
    await setDoc(MAIN, { budget: data.budget }, { merge: true });
    return true;
  } finally { busy = false; }
}

function stockTotal(epi) {
  return (data.warehouses || []).reduce((sum, w) => {
    const r = data.stocks?.[w]?.[epi.nome];
    if (typeof r === "number") return sum + r;
    return sum + num(r?.loose) + Object.values(r?.sizes || {}).reduce((a,b) => a + num(b), 0);
  }, 0);
}

function category(name) {
  const n = name.toUpperCase();
  if (/POLO|CALÇ|PARKA|POLAR|COLETE|FATO/.test(n)) return "Vestuário";
  if (/SAPATO|GALOCHA/.test(n)) return "Proteção dos pés";
  if (/CAPACETE|FRANCALETE/.test(n)) return "Proteção da cabeça";
  if (/OCULOS/.test(n)) return "Proteção ocular";
  if (/MASCARA|FILTRO/.test(n)) return "Proteção respiratória";
  if (/LUVA/.test(n)) return "Proteção das mãos";
  if (/ARNES|CORDA|ABS/.test(n)) return "Trabalho em altura";
  return "Outros";
}

function item(name) {
  const epi = data.matriz.find(e => e.nome === name);
  const raw = data.budget.items?.[name] || {};
  const price = num(epi?.preco);
  const qty = num(raw.plannedQty ?? raw.qty ?? 0);
  const need = num(raw.needQty ?? 0);
  const spent = raw.spent === "" || raw.spent == null ? null : num(raw.spent);
  const planned = qty * price;
  return { epi, raw, price, qty, need, spent, planned, stock: epi ? stockTotal(epi) : 0 };
}

function totals() {
  const rows = data.matriz.map(e => item(e.nome));
  const planned = rows.reduce((s,r) => s+r.planned,0);
  const spent = rows.reduce((s,r) => s+(r.spent ?? 0),0);
  const committed = data.budget.purchases.filter(p => ["Encomendado","Aprovado"].includes(p.status)).reduce((s,p)=>s+num(p.total),0);
  const available = Math.max(0, num(data.budget.limit)-spent-committed);
  return { rows, planned, spent, committed, available, pct:data.budget.limit ? Math.min(100, Math.round((spent+committed)/data.budget.limit*100)) : 0 };
}

function cards(t) {
  const tone = t.pct >= 100 ? "danger" : t.pct >= 90 ? "warn" : "ok";
  return `<div class="kpi-grid">
    <div class="kpi"><span>Orçamento aprovado</span><strong>${eur(data.budget.limit)}</strong></div>
    <div class="kpi"><span>Planeado</span><strong>${eur(t.planned)}</strong></div>
    <div class="kpi"><span>Comprometido</span><strong>${eur(t.committed)}</strong></div>
    <div class="kpi"><span>Gasto real</span><strong>${eur(t.spent)}</strong></div>
    <div class="kpi"><span>Saldo disponível</span><strong>${eur(t.available)}</strong></div>
    <div class="kpi"><span>Execução</span><strong><span class="badge ${tone}">${t.pct}%</span></strong></div>
  </div>`;
}

function render() {
  if (!data) return;
  const t = totals();
  const rows = t.rows.filter(r => r.qty || r.need || r.spent != null || r.price);
  const purchases = [...data.budget.purchases].reverse();
  const grouped = {};
  rows.forEach(r => grouped[category(r.epi.nome)] = (grouped[category(r.epi.nome)]||0) + r.planned);
  const limitWarning = t.pct >= 100 ? `<div class="info-box" style="border-color:#ff5a66">🔴 O orçamento disponível foi atingido ou ultrapassado.</div>` : t.pct >= 90 ? `<div class="info-box">🟠 Atenção: mais de 90% do orçamento está comprometido.</div>` : "";
  document.querySelector("#app .section")?.replaceWith(document.createRange().createContextualFragment(`<div id="budget-enhanced">
    <section class="section">
      <div class="section-head"><div><h2>Orçamento de Segurança</h2><p class="meta">Planeamento e controlo anual de compras de EPI · ${data.budget.year}</p></div><button class="ghost-btn" data-be="settings">⚙ Configurar</button></div>
      ${cards(t)}
      <div class="budget-card" style="margin-top:12px"><div class="progress"><span style="width:${t.pct}%"></span></div><p class="meta">Executado/comprometido: ${eur(t.spent+t.committed)} de ${eur(data.budget.limit)} · Disponível: ${eur(t.available)}</p></div>
      ${limitWarning}
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Planeamento de compras</h2><p class="meta">O orçamento de cada EPI é calculado automaticamente: <strong>quantidade a comprar × preço unitário</strong>.</p></div><button class="primary-btn" data-be="save-plan">Guardar planeamento</button></div>
      <div class="table-wrap"><table><thead><tr><th>EPI</th><th>Categoria</th><th>Stock atual</th><th>Necessidade</th><th>Qtd. a comprar</th><th>Preço unit.</th><th>Orçamento</th><th>Gasto real</th><th>Saldo</th></tr></thead><tbody>
      ${data.matriz.map(e => { const r=item(e.nome); return `<tr data-epi-row="${esc(e.nome)}"><td><strong>${esc(e.nome)}</strong></td><td>${esc(category(e.nome))}</td><td class="mono">${r.stock}</td><td><input class="input be-need" type="number" min="0" step="1" value="${r.need||""}" placeholder="—"></td><td><input class="input be-qty" type="number" min="0" step="1" value="${r.qty||""}" placeholder="0"></td><td class="mono">${eur(r.price)}</td><td class="mono be-plan">${eur(r.planned)}</td><td><input class="input be-spent" type="number" min="0" step="0.01" value="${r.spent==null?"":r.spent}" placeholder="—"></td><td class="mono">${r.spent==null?"—":eur(r.planned-r.spent)}</td></tr>`; }).join("")}
      </tbody></table></div>
      <p class="meta">O campo <strong>Gasto real</strong> fica opcional e pode permanecer vazio até a compra/fatura estar efetivamente registada.</p>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Pedidos e compras</h2><p class="meta">Regista o que está aprovado/encomendado para separar dinheiro gasto de dinheiro já comprometido.</p></div><button class="primary-btn" data-be="new-purchase">+ Novo pedido</button></div>
      <div class="table-wrap"><table><thead><tr><th>N.º</th><th>Data</th><th>EPI</th><th>Fornecedor</th><th>Qtd.</th><th>Valor</th><th>Estado</th><th>Fatura</th></tr></thead><tbody>
      ${purchases.map(p=>`<tr><td class="mono">${esc(p.id)}</td><td>${esc(p.date)}</td><td>${esc(p.epi)}</td><td>${esc(p.supplier||"—")}</td><td class="mono">${num(p.qty)}</td><td class="mono">${eur(p.total)}</td><td><span class="badge ${p.status==="Encomendado"?"warn":p.status==="Recebido"?"ok":p.status==="Cancelado"?"danger":"blue"}">${esc(p.status)}</span></td><td>${esc(p.invoice||"—")}</td></tr>`).join("") || `<tr><td colspan="8">Ainda não existem pedidos.</td></tr>`}
      </tbody></table></div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Análise por categoria</h2><span class="badge blue">${eur(t.planned)}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Valor planeado</th><th>% do planeamento</th></tr></thead><tbody>${Object.entries(grouped).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${esc(k)}</td><td class="mono">${eur(v)}</td><td class="mono">${t.planned?Math.round(v/t.planned*100):0}%</td></tr>`).join("")}</tbody></table></div>
    </section>
  </div>`));
}

function settingsModal() {
  const b=data.budget;
  const html=`<div class="modal-overlay" data-be-close><div class="modal"><div class="modal-head"><h2>Configurar orçamento</h2><button class="icon-btn" data-be-close>×</button></div><form id="be-settings"><div class="field-row two"><input class="input" name="year" type="number" value="${num(b.year)}" min="2020" max="2100"><input class="input" name="limit" type="number" min="0" step="0.01" value="${num(b.limit)}" placeholder="Orçamento aprovado (€)"></div><p class="meta">Este é o limite anual. Não é automaticamente convertido em gasto.</p><button class="primary-btn" type="submit">Guardar</button></form></div></div>`;
  document.querySelector("#modal-root").innerHTML=html;
}

function purchaseModal() {
  const html=`<div class="modal-overlay" data-be-close><div class="modal"><div class="modal-head"><h2>Novo pedido de compra</h2><button class="icon-btn" data-be-close>×</button></div><form id="be-purchase"><div class="field-row"><select class="select" name="epi">${data.matriz.map(e=>`<option>${esc(e.nome)}</option>`).join("")}</select></div><div class="field-row two"><input class="input" name="supplier" placeholder="Fornecedor"><input class="input" name="qty" type="number" min="1" value="1" placeholder="Quantidade"></div><div class="field-row two"><input class="input" name="unit" type="number" min="0" step="0.01" placeholder="Preço unitário"><select class="select" name="status"><option>Rascunho</option><option>Aprovado</option><option>Encomendado</option><option>Recebido</option><option>Cancelado</option></select></div><div class="field-row two"><input class="input" name="invoice" placeholder="N.º fatura (opcional)"><input class="input" name="date" value="${today()}" placeholder="Data"></div><button class="primary-btn" type="submit">Guardar pedido</button></form></div></div>`;
  document.querySelector("#modal-root").innerHTML=html;
}

async function savePlan() {
  data.matriz.forEach(e=>{
    const row=document.querySelector(`[data-epi-row="${CSS.escape(e.nome)}"]`);
    if(!row) return;
    const old=data.budget.items[e.nome]||{};
    const q=num(row.querySelector(".be-qty")?.value);
    const need=num(row.querySelector(".be-need")?.value);
    const spentRaw=row.querySelector(".be-spent")?.value;
    data.budget.items[e.nome]={...old, plannedQty:q, needQty:need, spent:spentRaw===""?null:num(spentRaw)};
  });
  if(await saveBudget()) { render(); toast("Planeamento de orçamento guardado."); }
}

function toast(msg) { const e=document.createElement("div"); e.className="success-pop"; e.textContent=msg; document.body.appendChild(e); setTimeout(()=>e.remove(),1800); }

async function saveSettings(form) {
  data.budget.year=num(form.year.value);
  data.budget.limit=num(form.limit.value);
  if(await saveBudget()) { document.querySelector("#modal-root").innerHTML=""; render(); toast("Orçamento anual atualizado."); }
}

async function savePurchase(form) {
  const epi=form.epi.value;
  const qty=num(form.qty.value);
  const unit=num(form.unit.value) || num(data.matriz.find(e=>e.nome===epi)?.preco);
  data.budget.purchases.push({ id:id(), date:form.date.value||today(), epi, supplier:form.supplier.value.trim(), qty, unitPrice:unit, total:qty*unit, status:form.status.value, invoice:form.invoice.value.trim(), createdAt:Date.now() });
  if(await saveBudget()) { document.querySelector("#modal-root").innerHTML=""; render(); toast("Pedido de compra registado."); }
}

function enhance() {
  const app=document.querySelector("#app");
  if(!app || !app.innerText.includes("Orçamento de Segurança")) return;
  if(document.querySelector("#budget-enhanced")) return;
  load().then(()=>{ if(data) render(); }).catch(console.error);
}

const observer=new MutationObserver(enhance);
observer.observe(document.querySelector("#app"), {childList:true, subtree:true});

document.addEventListener("click", ev=>{
  const target=ev.target.closest("[data-be]");
  if(target?.dataset.be==="settings") settingsModal();
  if(target?.dataset.be==="new-purchase") purchaseModal();
  if(target?.dataset.be==="save-plan") savePlan();
  if(ev.target.closest("[data-be-close]")) document.querySelector("#modal-root").innerHTML="";
});

document.addEventListener("submit", ev=>{
  if(ev.target.id==="be-settings") { ev.preventDefault(); saveSettings(ev.target); }
  if(ev.target.id==="be-purchase") { ev.preventDefault(); savePurchase(ev.target); }
});
