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
const orderId = () => `PC-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;

async function load() {
  const snap = await getDoc(MAIN);
  if (!snap.exists()) return;
  data = snap.data();
  data.matriz ||= [];
  data.stocks ||= {};
  data.warehouses ||= [];
  data.budget ||= {};
  data.budget.year ||= new Date().getFullYear();
  data.budget.items ||= {};
  data.budget.purchases = Array.isArray(data.budget.purchases) ? data.budget.purchases : [];
  data.budget.audit = Array.isArray(data.budget.audit) ? data.budget.audit : [];
}

async function saveBudget() {
  if (busy) return false;
  busy = true;
  try {
    await setDoc(MAIN, { budget: data.budget }, { merge: true });
    return true;
  } catch (e) {
    console.error(e);
    alert("Não foi possível guardar as alterações.");
    return false;
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
  const authorizedQty = num(raw.authorizedQty ?? raw.plannedQty ?? raw.qty);
  const stock = epi ? stockTotal(epi) : 0;
  const spent = raw.spent === "" || raw.spent == null ? null : num(raw.spent);
  const planned = authorizedQty * price;
  return { epi, raw, price, authorizedQty, spent, planned, stock };
}

function purchaseTotal(p) {
  return p.actualTotal != null && p.actualTotal !== "" ? num(p.actualTotal) : num(p.qty) * num(p.unitPrice);
}

function totals() {
  const rows = data.matriz.map(e => item(e.nome));
  const authorizedBudget = rows.reduce((s,r) => s+r.planned,0);
  const spent = rows.reduce((s,r) => s+(r.spent ?? 0),0);
  const committed = data.budget.purchases
    .filter(p => ["Aprovado","Encomendado"].includes(p.status))
    .reduce((s,p)=>s+purchaseTotal(p),0);
  const available = Math.max(0, authorizedBudget-spent-committed);
  const authorizedQty = rows.reduce((s,r)=>s+r.authorizedQty,0);
  const purchasedQty = data.budget.purchases.filter(p=>p.status!=="Cancelado").reduce((s,p)=>s+num(p.qty),0);
  return { rows, authorizedBudget, spent, committed, available, authorizedQty, purchasedQty,
    pct: authorizedBudget ? Math.min(100, Math.round((spent+committed)/authorizedBudget*100)) : 0 };
}

function badge(status) {
  const c = status === "Recebido" ? "ok" : status === "Cancelado" ? "danger" : status === "Encomendado" ? "warn" : status === "Aprovado" ? "blue" : "";
  return `<span class="badge ${c}">${esc(status)}</span>`;
}

function cards(t) {
  const tone = t.pct >= 100 ? "danger" : t.pct >= 90 ? "warn" : "ok";
  return `<div class="kpi-grid">
    <div class="kpi"><span>Orçamento calculado</span><strong>${eur(t.authorizedBudget)}</strong><small>${t.authorizedQty.toLocaleString("pt-PT")} unidades autorizadas</small></div>
    <div class="kpi"><span>Comprometido</span><strong>${eur(t.committed)}</strong><small>Pedidos aprovados/encomendados</small></div>
    <div class="kpi"><span>Gasto real</span><strong>${eur(t.spent)}</strong><small>Valores efetivamente registados</small></div>
    <div class="kpi"><span>Disponível</span><strong>${eur(t.available)}</strong><small>Calculado automaticamente</small></div>
    <div class="kpi"><span>Execução</span><strong><span class="badge ${tone}">${t.pct}%</span></strong><small>Gasto + comprometido</small></div>
    <div class="kpi"><span>Unidades compradas</span><strong>${t.purchasedQty.toLocaleString("pt-PT")}</strong><small>Pedidos não cancelados</small></div>
  </div>`;
}

function render() {
  if (!data) return;
  const t = totals();
  const rows = t.rows.filter(r => r.authorizedQty || r.spent != null || r.price);
  const purchases = [...data.budget.purchases].reverse();
  const grouped = {};
  rows.forEach(r => grouped[category(r.epi.nome)] = (grouped[category(r.epi.nome)]||0) + r.planned);
  const alerts = [];
  if (t.pct >= 100 && t.authorizedBudget) alerts.push(`<div class="info-box" style="border-color:#ff5a66">🔴 O valor comprometido/gasto atingiu o orçamento calculado.</div>`);
  else if (t.pct >= 90) alerts.push(`<div class="info-box">🟠 Atenção: mais de 90% do orçamento calculado está comprometido.</div>`);
  rows.filter(r => r.authorizedQty && r.authorizedQty < purchases.filter(p=>p.epi===r.epi.nome && p.status!=="Cancelado").reduce((s,p)=>s+num(p.qty),0)).forEach(r => alerts.push(`<div class="info-box" style="border-color:#ff5a66">🔴 ${esc(r.epi.nome)}: quantidade comprada superior à quantidade autorizada.</div>`));
  const noPrice = rows.filter(r=>r.authorizedQty && !r.price);
  if (noPrice.length) alerts.push(`<div class="info-box">🟠 Existem EPI com quantidade autorizada mas sem preço unitário na matriz: ${noPrice.map(r=>esc(r.epi.nome)).join(", ")}.</div>`);

  document.querySelector("#app .section")?.replaceWith(document.createRange().createContextualFragment(`<div id="budget-enhanced">
    <section class="section">
      <div class="section-head"><div><h2>Orçamento e Gestão de Compras de EPI</h2><p class="meta">${data.budget.year} · A quantidade autorizada é a entrada principal. O sistema calcula automaticamente o valor máximo com base no preço do EPI.</p></div><button class="ghost-btn" data-be="year">⚙ Ano</button></div>
      ${cards(t)}
      <div class="budget-card" style="margin-top:12px"><div class="progress"><span style="width:${t.pct}%"></span></div><p class="meta"><strong>Regra:</strong> orçamento calculado = quantidade autorizada × preço unitário do EPI. O gasto real não é preenchido automaticamente.</p></div>
      ${alerts.join("")}
    </section>

    <section class="section">
      <div class="section-head"><div><h2>1. Quantidades autorizadas</h2><p class="meta">Introduz apenas o número de unidades que está autorizado comprar. O preço vem da matriz de EPI.</p></div><button class="primary-btn" data-be="save-plan">Guardar</button></div>
      <div class="table-wrap"><table><thead><tr><th>EPI</th><th>Categoria</th><th>Stock atual</th><th>Qtd. autorizada</th><th>Preço unitário</th><th>Orçamento calculado</th><th>Gasto real</th><th>Saldo</th></tr></thead><tbody>
      ${data.matriz.map(e => { const r=item(e.nome); return `<tr data-epi-row="${esc(e.nome)}"><td><strong>${esc(e.nome)}</strong></td><td>${esc(category(e.nome))}</td><td class="mono">${r.stock}</td><td><input class="input be-qty" type="number" min="0" step="1" value="${r.authorizedQty||""}" placeholder="0"></td><td class="mono">${eur(r.price)}</td><td class="mono be-plan">${eur(r.planned)}</td><td><input class="input be-spent" type="number" min="0" step="0.01" value="${r.spent==null?"":r.spent}" placeholder="—"></td><td class="mono">${r.spent==null?"—":eur(r.planned-r.spent)}</td></tr>`; }).join("")}
      </tbody></table></div>
      <p class="meta">💡 <strong>Exemplo:</strong> 600 polos × 8 € = <strong>4 800 €</strong> de orçamento calculado. O campo Gasto real fica vazio até existir uma compra/fatura.</p>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>2. Pedidos / compras</h2><p class="meta">Ciclo de controlo: pedido → aprovação → encomenda → receção → fatura/gasto.</p></div><button class="primary-btn" data-be="new-purchase">+ Novo pedido</button></div>
      <div class="table-wrap"><table><thead><tr><th>N.º</th><th>Data</th><th>EPI</th><th>Fornecedor</th><th>Qtd.</th><th>Previsto</th><th>Gasto real</th><th>Estado</th><th>Fatura</th><th></th></tr></thead><tbody>
      ${purchases.map(p=>`<tr><td class="mono">${esc(p.id)}</td><td>${esc(p.date)}</td><td>${esc(p.epi)}</td><td>${esc(p.supplier||"—")}</td><td class="mono">${num(p.qty)}</td><td class="mono">${eur(num(p.qty)*num(p.unitPrice))}</td><td class="mono">${p.actualTotal==null?"—":eur(p.actualTotal)}</td><td>${badge(p.status)}</td><td>${esc(p.invoice||"—")}</td><td><button class="ghost-btn" data-be="edit-purchase" data-id="${esc(p.id)}">Editar</button></td></tr>`).join("") || `<tr><td colspan="10">Ainda não existem pedidos de compra.</td></tr>`}
      </tbody></table></div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>3. Análise e controlo</h2><p class="meta">Visão de gestão para decisão e acompanhamento.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Orçamento calculado</th><th>%</th></tr></thead><tbody>${Object.entries(grouped).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${esc(k)}</td><td class="mono">${eur(v)}</td><td class="mono">${t.authorizedBudget?Math.round(v/t.authorizedBudget*100):0}%</td></tr>`).join("") || `<tr><td colspan="3">Ainda não existem quantidades autorizadas.</td></tr>`}</tbody></table></div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>4. Histórico de alterações</h2><p class="meta">Registo simples das alterações ao planeamento e compras.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>${[...data.budget.audit].reverse().slice(0,30).map(a=>`<tr><td>${esc(a.date)}</td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td></tr>`).join("") || `<tr><td colspan="3">Sem alterações registadas.</td></tr>`}</tbody></table></div>
    </section>
  </div>`));
}

function yearModal() {
  document.querySelector("#modal-root").innerHTML=`<div class="modal-overlay" data-be-close><div class="modal"><div class="modal-head"><h2>Período de orçamento</h2><button class="icon-btn" data-be-close>×</button></div><form id="be-year"><input class="input" name="year" type="number" value="${num(data.budget.year)}" min="2020" max="2100"><p class="meta">Não é necessário introduzir um orçamento em euros. O sistema calcula-o a partir das quantidades autorizadas e dos preços dos EPI.</p><button class="primary-btn" type="submit">Guardar</button></form></div></div>`;
}

function purchaseModal(existing=null) {
  const p=existing||{};
  document.querySelector("#modal-root").innerHTML=`<div class="modal-overlay" data-be-close><div class="modal"><div class="modal-head"><h2>${existing?"Editar pedido":"Novo pedido de compra"}</h2><button class="icon-btn" data-be-close>×</button></div><form id="be-purchase"><input type="hidden" name="id" value="${esc(p.id||"")}"><div class="field-row"><select class="select" name="epi">${data.matriz.map(e=>`<option ${e.nome===p.epi?"selected":""}>${esc(e.nome)}</option>`).join("")}</select></div><div class="field-row two"><input class="input" name="supplier" value="${esc(p.supplier||"")}" placeholder="Fornecedor"><input class="input" name="qty" type="number" min="1" value="${num(p.qty)||1}" placeholder="Quantidade"></div><div class="field-row two"><input class="input" name="unit" type="number" min="0" step="0.01" value="${p.unitPrice!=null?num(p.unitPrice):num(data.matriz.find(e=>e.nome===p.epi)?.preco)}" placeholder="Preço unitário"><select class="select" name="status"><option ${p.status==="Rascunho"?"selected":""}>Rascunho</option><option ${p.status==="Aprovado"?"selected":""}>Aprovado</option><option ${p.status==="Encomendado"?"selected":""}>Encomendado</option><option ${p.status==="Recebido"?"selected":""}>Recebido</option><option ${p.status==="Cancelado"?"selected":""}>Cancelado</option></select></div><div class="field-row two"><input class="input" name="actual" type="number" min="0" step="0.01" value="${p.actualTotal==null?"":num(p.actualTotal)}" placeholder="Gasto real (€), opcional"><input class="input" name="invoice" value="${esc(p.invoice||"")}" placeholder="N.º fatura, opcional"></div><div class="field-row"><input class="input" name="date" value="${esc(p.date||today())}" placeholder="Data"></div><p class="meta">O valor previsto é quantidade × preço unitário. O gasto real pode ficar vazio.</p><button class="primary-btn" type="submit">Guardar</button></form></div></div>`;
}

function audit(action, detail) {
  data.budget.audit.push({ date: today(), action, detail });
  if(data.budget.audit.length>200) data.budget.audit=data.budget.audit.slice(-200);
}

async function savePlan() {
  data.matriz.forEach(e=>{
    const row=document.querySelector(`[data-epi-row="${CSS.escape(e.nome)}"]`);
    if(!row) return;
    const old=data.budget.items[e.nome]||{};
    const qty=num(row.querySelector(".be-qty")?.value);
    const spentRaw=row.querySelector(".be-spent")?.value;
    const spent=spentRaw===""?null:num(spentRaw);
    if(qty !== num(old.authorizedQty) || spent !== (old.spent==null?null:num(old.spent))) audit("Planeamento atualizado", `${e.nome}: ${qty} unidades autorizadas${spent==null?"":"; gasto real ${eur(spent)}"}`);
    data.budget.items[e.nome]={...old, authorizedQty:qty, spent};
  });
  if(await saveBudget()){ render(); toast("Planeamento guardado."); }
}

async function saveYear(form) {
  data.budget.year=num(form.year.value);
  audit("Período alterado", `Orçamento de gestão ${data.budget.year}`);
  if(await saveBudget()){ document.querySelector("#modal-root").innerHTML=""; render(); toast("Ano atualizado."); }
}

async function savePurchase(form) {
  const id=form.id.value;
  const epi=form.epi.value;
  const qty=num(form.qty.value);
  const unit=num(form.unit.value) || num(data.matriz.find(e=>e.nome===epi)?.preco);
  const actual=form.actual.value===""?null:num(form.actual.value);
  const record={ id:id||orderId(), date:form.date.value||today(), epi, supplier:form.supplier.value.trim(), qty, unitPrice:unit, actualTotal:actual, status:form.status.value, invoice:form.invoice.value.trim(), updatedAt:Date.now() };
  if(id){ const idx=data.budget.purchases.findIndex(p=>p.id===id); if(idx>=0) data.budget.purchases[idx]={...data.budget.purchases[idx],...record}; audit("Pedido atualizado", `${record.id} · ${record.epi} · ${record.qty} un.`); }
  else { data.budget.purchases.push({...record,createdAt:Date.now()}); audit("Pedido criado", `${record.id} · ${record.epi} · ${record.qty} un.`); }
  if(await saveBudget()){ document.querySelector("#modal-root").innerHTML=""; render(); toast("Pedido guardado."); }
}

function toast(msg) { const e=document.createElement("div"); e.className="success-pop"; e.textContent=msg; document.body.appendChild(e); setTimeout(()=>e.remove(),1800); }

function enhance(){
  const app=document.querySelector("#app");
  if(!app || !app.innerText.includes("Orçamento de Segurança")) return;
  if(document.querySelector("#budget-enhanced")) return;
  load().then(()=>{if(data) render();}).catch(console.error);
}
const observer=new MutationObserver(enhance);
observer.observe(document.querySelector("#app"),{childList:true,subtree:true});

document.addEventListener("click",ev=>{
  const target=ev.target.closest("[data-be]");
  if(target?.dataset.be==="year") yearModal();
  if(target?.dataset.be==="new-purchase") purchaseModal();
  if(target?.dataset.be==="edit-purchase") purchaseModal(data.budget.purchases.find(p=>p.id===target.dataset.id));
  if(target?.dataset.be==="save-plan") savePlan();
  if(ev.target.closest("[data-be-close]")) document.querySelector("#modal-root").innerHTML="";
});

document.addEventListener("submit",ev=>{
  if(ev.target.id==="be-year"){ev.preventDefault();saveYear(ev.target);}
  if(ev.target.id==="be-purchase"){ev.preventDefault();savePurchase(ev.target);}
});
