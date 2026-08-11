import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, getApp as firebaseGetApp, doc, getDoc, setDoc, collection, addDoc, getDocs, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MAIN_DOC = "dpm_epi_data_v1";
const ARCHIVE = "budget_archive";
const DELIVERIES_COLLECTION = "deliveries";
const FAMILIES = ["EPI", "Equipamento", "Ambiente"];
const QUARTERS = ["T1", "T2", "T3", "T4"];
const TABS = [["resumo", "Resumo"], ["orcamento", "Orçamento"], ["compras", "Compras"], ["custo", "Custo / Funcionário"], ["arquivo", "Arquivo"]];
const TAB_KEY = "dpm.budget.activeTab";
let db;
let active = "resumo";
let busy = false;
let lastMain = null;

try { const x = sessionStorage.getItem(TAB_KEY); if (TABS.some(t => t[0] === x)) active = x; } catch (_) {}

function firestore() {
  if (db) return db;
  const apps = getApps();
  if (!apps.length) throw new Error("Firebase ainda não foi inicializado.");
  db = getFirestore(firebaseGetApp());
  return db;
}
const mainRef = () => doc(firestore(), "appdata", MAIN_DOC);
const num = v => { const x = Number(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const euro = v => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(num(v));
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const quarterOf = date => { const d = new Date(date); return Number.isNaN(d.getTime()) ? "T1" : `T${Math.floor(d.getMonth() / 3) + 1}`; };
const epis = d => Array.isArray(d?.matriz) ? d.matriz : [];
const workers = d => Array.isArray(d?.trabalhadores) ? d.trabalhadores : [];
const deliveries = d => Array.isArray(d?.eventos) ? d.eventos : [];

function budget(d) {
  if (!d.budget || typeof d.budget !== "object") d.budget = {};
  if (!d.budget.management || typeof d.budget.management !== "object") d.budget.management = {};
  const b = d.budget.management;
  if (!b.planning || typeof b.planning !== "object") b.planning = {};
  if (!Array.isArray(b.purchases)) b.purchases = [];
  return b;
}

function legacyItems(d) {
  const items = d?.budget?.items;
  return items && typeof items === "object" && !Array.isArray(items) ? items : {};
}
function legacyItem(d, name) { const item = legacyItems(d)[name]; return item && typeof item === "object" ? item : {}; }
function legacyPrice(d, name) {
  const item = legacyItem(d, name);
  return num(item.unitPrice ?? item.preco ?? item.price ?? item.precoUnitario ?? item.valorUnitario ?? item.custo);
}
function legacyQty(d, name) {
  const item = legacyItem(d, name);
  return num(item.authorizedQty ?? item.quantity ?? item.qty ?? item.quantidade ?? item.limit ?? item.quantidadeAutorizada);
}

async function load() {
  const s = await getDoc(mainRef());
  if (!s.exists()) throw new Error("Não foi encontrado o documento principal de dados.");
  const d = s.data();
  budget(d);
  return d;
}
async function save(d) { budget(d); await setDoc(mainRef(), { budget: d.budget }, { merge: true }); }
function page() { const title = document.querySelector(".screen-title h1"); const main = document.querySelector("main"); return title?.textContent.trim() === "Orçamento" && main ? main : null; }
function totalPurchase(p) { return num(p.quantity) * num(p.unitPrice); }

function planningRows(d) {
  const b = budget(d);
  const matrizPrices = new Map(epis(d).map(e => [e.nome, num(e.preco)]));
  const names = new Set([...Object.keys(legacyItems(d)), ...Object.keys(b.planning), ...epis(d).map(e => e.nome)]);
  return [...names].filter(Boolean).map(name => {
    const p = b.planning[name] || {};
    const lp = legacyPrice(d, name);
    const lq = legacyQty(d, name);
    const mp = matrizPrices.get(name) || 0;
    const price = num(p.unitPrice ?? (lp || mp));
    const qty = num(p.authorizedQty ?? lq);
    return { name, price, qty, total: price * qty };
  });
}

function tabs() { return `<nav class="budget-management-tabs" role="tablist" aria-label="Módulos do orçamento">${TABS.map(([id,label])=>`<button type="button" role="tab" class="budget-management-tab ${active===id?"active":""}" data-tab="${id}" aria-selected="${active===id}">${label}</button>`).join("")}</nav>`; }
function chart(values) { const max=Math.max(1,...QUARTERS.map(q=>values[q]||0)); return `<div class="chart-bars">${QUARTERS.map(q=>{const v=values[q]||0,h=Math.max(4,v/max*150);return `<div class="chart-col"><span>${euro(v)}</span><div class="chart-bar" style="height:${h}px"></div><b>${q}</b></div>`;}).join("")}</div>`; }

function summary(d) {
  const b=budget(d), plan=planningRows(d), ps=b.purchases;
  const planned=plan.reduce((s,r)=>s+r.total,0), spent=ps.reduce((s,p)=>s+totalPurchase(p),0);
  const fam=Object.fromEntries(FAMILIES.map(x=>[x,0])), q=Object.fromEntries(QUARTERS.map(x=>[x,0]));
  ps.forEach(p=>{const v=totalPurchase(p);if(fam[p.family]!==undefined)fam[p.family]+=v;if(q[p.quarter]!==undefined)q[p.quarter]+=v;});
  return `<div class="budget-view"><div class="budget-kpis"><article><span>Orçamento planeado</span><strong>${euro(planned)}</strong></article><article><span>Gasto realizado</span><strong>${euro(spent)}</strong></article><article><span>Saldo</span><strong>${euro(planned-spent)}</strong></article><article><span>Execução</span><strong>${planned?(spent/planned*100).toFixed(1):"0.0"}%</strong></article></div><div class="budget-grid-2"><section class="budget-card"><h3>Gasto por família</h3>${FAMILIES.map(f=>`<div class="metric-row"><span>${f}</span><strong>${euro(fam[f])}</strong></div>`).join("")}</section><section class="budget-card"><h3>Gasto por trimestre</h3>${QUARTERS.map(x=>`<div class="metric-row"><span>${x}</span><strong>${euro(q[x])}</strong></div>`).join("")}</section></div><section class="budget-card"><h3>Evolução trimestral</h3>${chart(q)}</section></div>`;
}

function planningView(d) {
  const rows=planningRows(d);
  return `<div class="budget-view"><div class="budget-help"><strong>Orçamento:</strong> quantidade autorizada × preço unitário. O gasto real só é registado em <strong>Compras</strong>.</div><section class="budget-card"><div class="section-head"><div><h3>Planeamento</h3><p class="muted">Pode alterar diretamente o preço e a quantidade autorizada. Grave no final.</p></div><strong>${euro(rows.reduce((s,r)=>s+r.total,0))}</strong></div><div class="table-wrap"><table class="budget-table"><thead><tr><th>EPI</th><th>Preço unitário (€)</th><th>Qtd. autorizada</th><th>Orçamento</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td><input type="number" min="0" step="0.01" data-plan-price="${esc(r.name)}" value="${r.price ? r.price : ""}" placeholder="0,00"></td><td><input type="number" min="0" step="1" data-plan="${esc(r.name)}" value="${r.qty||""}" placeholder="0"></td><td data-plan-total="${esc(r.name)}">${euro(r.total)}</td></tr>`).join("")}</tbody></table></div><button type="button" class="primary" data-save-plan>Guardar planeamento</button></section></div>`;
}

function purchaseView(d) {
  const b=budget(d), options=epis(d).map(e=>`<option value="${esc(e.nome)}">${esc(e.nome)}</option>`).join(""), rows=b.purchases.slice().sort((a,c)=>String(c.date).localeCompare(String(a.date)));
  return `<div class="budget-view"><section class="budget-card"><h3>Registar compra</h3><div class="form-grid"><label>Família<select id="bf"><option>EPI</option><option>Equipamento</option><option>Ambiente</option></select></label><label>Trimestre<select id="bq">${QUARTERS.map(q=>`<option>${q}</option>`).join("")}</select></label><label>Data<input id="bd" type="date" value="${today()}"></label><label id="epi-field">EPI<select id="be"><option value="">Selecionar EPI</option>${options}</select></label><label id="product-field" class="wide">Produto<input id="bp" placeholder="Produto / equipamento / serviço"></label><label>Quantidade<input id="bqty" type="number" min="0" step="1"></label><label>Preço unitário (€)<input id="bprice" type="number" min="0" step="0.01"></label><label>Fornecedor<input id="bsupplier"></label><label>N.º fatura<input id="binvoice"></label></div><button type="button" class="primary" data-add-purchase>Registar compra</button></section><section class="budget-card"><div class="section-head"><div><h3>Compras registadas</h3><p class="muted">Cada compra é registada uma única vez. O Resumo e o trimestre são atualizados automaticamente.</p></div><strong>${euro(rows.reduce((s,p)=>s+totalPurchase(p),0))}</strong></div><div class="table-wrap"><table class="budget-table"><thead><tr><th>Data</th><th>Família</th><th>Trimestre</th><th>Produto</th><th>Qtd.</th><th>Preço</th><th>Total</th><th>Fornecedor</th><th></th></tr></thead><tbody>${rows.length?rows.map(p=>`<tr><td>${esc(p.date)}</td><td>${esc(p.family)}</td><td>${esc(p.quarter)}</td><td>${esc(p.product)}</td><td>${num(p.quantity)}</td><td>${euro(p.unitPrice)}</td><td>${euro(totalPurchase(p))}</td><td>${esc(p.supplier)}</td><td><button type="button" class="danger-link" data-archive="${esc(p.id)}">Arquivar</button></td></tr>`).join(""):`<tr><td colspan="9">Ainda não existem compras registadas.</td></tr>`}</tbody></table></div></section></div>`;
}

async function getHistoricalDeliveries(d) {
  try {
    const snap = await getDocs(collection(firestore(), DELIVERIES_COLLECTION));
    const rows = snap.docs.map(s => ({ id: s.id, ...s.data() }));
    if (rows.length) return rows;
  } catch (e) {
    console.warn("Não foi possível ler a coleção deliveries; a usar eventos antigos.", e);
  }
  return deliveries(d);
}

async function costView(d) {
  const historical = await getHistoricalDeliveries(d);
  const prices = new Map(epis(d).map(e=>[e.nome,num(e.preco)]));
  Object.keys(legacyItems(d)).forEach(name => { const p=legacyPrice(d,name); if(p) prices.set(name,p); });
  const map=new Map();

  historical.forEach(e=>{
    const id=e.worker_id??e.trabalhador_id??e.workerId??e.trabalhadorId;
    const w=workers(d).find(x=>String(x.id)===String(id));
    const name=w?.nome||e.worker_nome||e.trabalhador||e.worker_name||e.nomeTrabalhador||e.nome_funcionario||`Trabalhador ${id||""}`;
    const product=e.epi_type||e.epi||e.nomeEpi||e.epi_nome||e.artigo||e.nome||"EPI";
    const qty=num(e.qtd??e.quantidade??e.qty??e.quantity)||1;
    const unit=prices.get(product)??num(e.preco??e.unitPrice??e.precoUnitario??e.valorUnitario);
    const key=String(id||name);
    if(!map.has(key))map.set(key,{name,funcao:w?.funcao||e.funcao||"",delegacao:w?.delegacao||e.delegacao||"",qty:0,cost:0});
    const r=map.get(key);r.qty+=qty;r.cost+=qty*unit;
  });

  const rows=[...map.values()].sort((a,b)=>b.cost-a.cost);
  return `<div class="budget-view"><section class="budget-card"><h3>Custo por Funcionário</h3><p class="muted">Calculado a partir das entregas reais e dos preços históricos dos EPI. O gasto trimestral não é tratado neste módulo.</p><div class="table-wrap"><table class="budget-table"><thead><tr><th>Funcionário</th><th>Função</th><th>Delegação</th><th>Qtd. EPI</th><th>Custo</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.funcao)}</td><td>${esc(r.delegacao)}</td><td>${r.qty}</td><td>${euro(r.cost)}</td></tr>`).join(""):`<tr><td colspan="5">Ainda não existem entregas suficientes.</td></tr>`}</tbody></table></div></section></div>`;
}

async function archiveView() {
  const s=await getDocs(collection(firestore(),ARCHIVE)),rows=s.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  return `<div class="budget-view"><section class="budget-card"><div class="section-head"><div><h3>Arquivo</h3><p class="muted">Histórico retirado da vista principal, sem apagar os dados.</p></div><strong>${rows.length} registos</strong></div><div class="table-wrap"><table class="budget-table"><thead><tr><th>Data</th><th>Família</th><th>Trimestre</th><th>Produto</th><th>Qtd.</th><th>Total</th><th></th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.family)}</td><td>${esc(r.quarter)}</td><td>${esc(r.product)}</td><td>${num(r.quantity)}</td><td>${euro(totalPurchase(r))}</td><td><button type="button" class="danger-link" data-delete-archive="${esc(r.id)}">Apagar</button></td></tr>`).join(""):`<tr><td colspan="7">O arquivo está vazio.</td></tr>`}</tbody></table></div></section></div>`;
}

async function render() {
  const main=page(); if(!main||busy)return; busy=true;
  try {
    let root=main.querySelector(".budget-management-root");
    if(!root){root=document.createElement("section");root.className="budget-management-root";main.insertBefore(root,main.firstChild);}
    [...main.children].forEach(c=>{if(c!==root&&c.classList.contains("section"))c.style.display="none";});
    root.innerHTML=`${tabs()}<div class="budget-loading">A carregar...</div>`;
    const d=await load();
    let body=active==="resumo"?summary(d):active==="orcamento"?planningView(d):active==="compras"?purchaseView(d):active==="custo"?await costView(d):await archiveView();
    root.innerHTML=`${tabs()}${body}`;
    bind(root,d);
    lastMain=main;
  } catch(e) {
    const r=main.querySelector(".budget-management-root");
    if(r)r.innerHTML=`${tabs()}<div class="budget-error"><strong>Não foi possível carregar o módulo.</strong><br>${esc(e.message||e)}</div>`;
  } finally {busy=false;}
}

function bind(root,d) {
  root.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{active=b.dataset.tab;try{sessionStorage.setItem(TAB_KEY,active);}catch(_){}render();}));
  const family=root.querySelector("#bf"),epi=root.querySelector("#be"),product=root.querySelector("#bp"),price=root.querySelector("#bprice"),epiField=root.querySelector("#epi-field"),productField=root.querySelector("#product-field");
  function sync(){const isEpi=family?.value==="EPI";if(epiField)epiField.style.display=isEpi?"grid":"none";if(productField)productField.style.display=isEpi?"none":"grid";if(epi)epi.disabled=!isEpi;if(isEpi&&epi?.value){const e=epis(d).find(x=>x.nome===epi.value);if(e)price.value=num(e.preco)||legacyPrice(d,epi.value)||"";}}
  family?.addEventListener("change",sync);epi?.addEventListener("change",sync);sync();

  root.querySelectorAll("[data-plan-price], [data-plan]").forEach(input=>input.addEventListener("input",()=>{
    const name=input.dataset.planPrice||input.dataset.plan;
    const priceInput=root.querySelector(`[data-plan-price="${CSS.escape(name)}"]`);
    const qtyInput=root.querySelector(`[data-plan="${CSS.escape(name)}"]`);
    const total=root.querySelector(`[data-plan-total="${CSS.escape(name)}"]`);
    if(total)total.textContent=euro(num(priceInput?.value)*num(qtyInput?.value));
  }));

  root.querySelector("[data-save-plan]")?.addEventListener("click",async()=>{
    const b=budget(d);
    root.querySelectorAll("[data-plan]").forEach(i=>{
      const name=i.dataset.plan;
      const priceInput=root.querySelector(`[data-plan-price="${CSS.escape(name)}"]`);
      const old=b.planning[name]||{};
      b.planning[name]={...old,family:"EPI",authorizedQty:num(i.value),unitPrice:num(priceInput?.value)};
      if(d.budget.items && d.budget.items[name] && typeof d.budget.items[name]==="object") d.budget.items[name]={...d.budget.items[name],authorizedQty:num(i.value),unitPrice:num(priceInput?.value)};
    });
    await save(d);
    alert("Planeamento guardado com sucesso.");
    await render();
  });

  root.querySelector("[data-add-purchase]")?.addEventListener("click",async()=>{
    const fam=family.value,date=root.querySelector("#bd").value||today(),q=root.querySelector("#bq").value||quarterOf(date),productName=(fam==="EPI"?epi.value:product.value).trim(),qty=num(root.querySelector("#bqty").value),unit=num(price.value);
    if(!productName||qty<=0||unit<0){alert("Preenche o produto, quantidade e preço unitário.");return;}
    const b=budget(d);
    b.purchases.push({id:`buy_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,family:fam,quarter:q,date,product:productName,quantity:qty,unitPrice:unit,supplier:root.querySelector("#bsupplier").value.trim(),invoice:root.querySelector("#binvoice").value.trim(),createdAt:new Date().toISOString()});
    await save(d);
    await render();
  });

  root.querySelectorAll("[data-archive]").forEach(btn=>btn.addEventListener("click",async()=>{const id=btn.dataset.archive,b=budget(d),item=b.purchases.find(x=>x.id===id);if(!item)return;if(!confirm(`Arquivar a compra de ${item.product}?`))return;await addDoc(collection(firestore(),ARCHIVE),{...item,archivedAt:serverTimestamp()});b.purchases=b.purchases.filter(x=>x.id!==id);await save(d);await render();}));
  root.querySelectorAll("[data-delete-archive]").forEach(btn=>btn.addEventListener("click",async()=>{if(!confirm("Apagar definitivamente este registo do arquivo?"))return;await deleteDoc(doc(firestore(),ARCHIVE,btn.dataset.deleteArchive));await render();}));
}

setInterval(()=>{const main=page();if(main&&main!==lastMain&&!busy)render();},500);
setTimeout(()=>{if(page())render();},100);
