// DPM — Gestão EPI / Equipamentos | EXTRA exclusivo do perfil SuperAdmin
// O CORE (registo digital, assinatura e entrega de EPI) permanece intacto.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MAIN_DOC = "dpm_epi_data_v1";
const state = { view: "overview", data: null, equipment: [], warehouse: null };
const db = () => getFirestore(getApp());
const mainRef = () => doc(db(), "appdata", MAIN_DOC);
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const num = v => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const money = v => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num(v));
const fmtDate = v => { if (!v) return "—"; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-PT"); };
const epis = () => Array.isArray(state.data?.matriz) ? state.data.matriz : [];
const workers = () => Array.isArray(state.data?.trabalhadores) ? state.data.trabalhadores : [];
const events = () => Array.isArray(state.data?.eventos) ? state.data.eventos.filter(e => String(e.tipo || "").toUpperCase() === "ENTREGA") : [];
const warehouses = () => Array.isArray(state.data?.warehouses) && state.data.warehouses.length ? state.data.warehouses : ["DPM Norte", "DPM Sul", "DPM Algarve"];

const icon = (name, cls = "") => {
  const p = {
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    clipboard:'<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M8 10h8M8 14h6M8 18h4"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 7v5l3 2"/>',
    pen:'<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m13.5 7.5 3 3"/>',
    chart:'<path d="M4 19V5M4 19h17"/><rect x="7" y="12" width="2.5" height="5" rx=".5"/><rect x="12" y="8" width="2.5" height="9" rx=".5"/><rect x="17" y="4" width="2.5" height="13" rx=".5"/>',
    box:'<path d="m3 7 9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>',
    shield:'<path d="M12 3 20 6v5c0 5.2-3.4 8.8-8 10-4.6-1.2-8-4.8-8-10V6z"/>',
    arrows:'<path d="M7 7h13l-3-3M17 17H4l3 3M20 7l-3 3M4 17l3-3"/>',
    wrench:'<path d="M14.7 6.3a6 6 0 0 0-7.8 7.8L3 18l3 3 3.9-3.9a6 6 0 0 0 7.8-7.8L14 12l-3-3z"/>',
    euro:'<circle cx="12" cy="12" r="9"/><path d="M8 10h7M8 14h6M9 7.5c-2 1.5-2 5.5 0 7"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.8v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2-2 .1-.1A1.7 1.7 0 0 0 7.4 15a1.7 1.7 0 0 0-1.6-1H5.6v-2.8h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L7 8.2l2-2 .1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h2.8V5a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2 2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2V14h-.2a1.7 1.7 0 0 0-1.6 1z"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    alert:'<path d="M12 3 22 20H2z"/><path d="M12 9v5M12 17h.01"/>',
    external:'<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
  }[name] || "";
  return `<svg class="dpm-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
};

function stockRecord(w, name) {
  const raw = state.data?.stocks?.[w]?.[name];
  if (raw && typeof raw === "object") return num(raw.loose ?? raw.semTamanho) + Object.values(raw.sizes || raw.tamanhos || {}).reduce((s, q) => s + num(q), 0);
  return num(raw);
}
function totalStock() { return warehouses().reduce((sum, w) => sum + epis().reduce((s, e) => s + stockRecord(w, e.nome), 0), 0); }
function stockValue() { return warehouses().reduce((sum, w) => sum + epis().reduce((s, e) => s + stockRecord(w, e.nome) * num(e.preco), 0), 0); }
function activeEquipment() { return state.equipment.filter(e => String(e.estado || "Em serviço") === "Em serviço").length; }
function lowItems() { return epis().map(e => ({...e, total: warehouses().reduce((s,w) => s + stockRecord(w,e.nome),0)})).filter(e => e.total <= 10).sort((a,b)=>a.total-b.total); }
function recentEvents() { return events().slice().sort((a,b)=>String(b.delivery_date||b.data||"").localeCompare(String(a.delivery_date||a.data||""))).slice(0,5); }
function productEmoji(name) { const n=String(name||"").toLowerCase(); if(n.includes("sapato"))return "🥾"; if(n.includes("luva"))return "🧤"; if(n.includes("capacete"))return "🪖"; if(n.includes("óculo"))return "🥽"; if(n.includes("colete"))return "🦺"; return "🛡️"; }

async function load() {
  const snap = await getDoc(mainRef());
  if (!snap.exists()) throw new Error("Não foi encontrado o registo principal de EPI.");
  state.data = snap.data();
  state.data.stocks ||= {};
  state.data.matriz ||= [];
  for (const w of warehouses()) state.data.stocks[w] ||= {};
  const eq = await getDocs(collection(db(), "equipment"));
  state.equipment = eq.docs.map(d => ({ id:d.id, ...d.data() }));
  state.warehouse = state.data?.warehouses?.[0] || warehouses()[0];
}
async function saveMain() { await setDoc(mainRef(), state.data); }

function header() {
  return `<header class="dpm-mgmt-header"><div class="brand-mini"><strong>DPM</strong><span>SEGURANÇA</span></div><button class="header-menu" data-menu>${icon("menu")}</button><div class="header-title">${icon("wrench","header-title-icon")}<strong>Gestão EPI / Equipamentos</strong></div><div class="header-right">${icon("bell")}<span class="profile">${icon("user")}<strong>Super Admin</strong><span class="chevron">⌄</span></span></div></header>`;
}
function sidebar() {
  const items = [["core","Início","home"],["workers","Trabalhadores","users"],["deliveries","Entregas de EPI","clipboard"],["history","Histórico","history"],["signatures","Assinaturas","pen"],["reports","Relatórios","chart"]];
  return `<aside class="dpm-mgmt-sidebar"><div class="sidebar-main">${items.map(([id,label,ico])=>`<button class="side-item" data-core="${id}">${icon(ico)}<span>${label}</span></button>`).join("")}<div class="side-divider"></div><div class="side-label">EXTRA - GESTÃO</div><button class="side-item active">${icon("wrench")}<span>Gestão EPI / Equipamentos</span></button><button class="side-item" data-core="budget">${icon("euro")}<span>Orçamento</span></button><button class="side-item" data-core="settings">${icon("settings")}<span>Configurações</span></button></div><div class="sidebar-footer"><strong>DPM - Segurança</strong><span>v2.0.0</span></div></aside>`;
}
function tabs() {
  const t=[["overview","Visão geral","chart"],["stock","Stock EPI","box"],["catalogo","Catálogo EPI","shield"],["movimentos","Movimentos","arrows"],["equipamentos","Equipamentos","wrench"]];
  return `<nav class="mgmt-tabs" role="tablist">${t.map(([id,label,ico])=>`<button class="mgmt-tab ${state.view===id?"active":""}" data-view="${id}">${icon(ico)}<strong>${label}</strong>${id==="movimentos"?"<small>Entregas</small>":""}</button>`).join("")}</nav>`;
}
function overview() {
  const lows = lowItems().slice(0,5), recent = recentEvents();
  return `<div class="overview-grid"><div class="kpi-grid-wide"><article class="mgmt-kpi"><div><span>Total EPI em stock</span><strong class="blue-text">${totalStock().toLocaleString("pt-PT")}</strong><small>unidades</small></div><span class="kpi-icon blue-bg">${icon("box")}</span></article><article class="mgmt-kpi"><div><span>Valor estimado</span><strong class="green-text">${money(stockValue())}</strong><small>valor total</small></div><span class="kpi-icon green-bg">${icon("euro")}</span></article><article class="mgmt-kpi"><div><span>Artigos com stock baixo</span><strong class="orange-text">${lowItems().length}</strong><small>itens</small></div><span class="kpi-icon orange-bg">${icon("alert")}</span></article><article class="mgmt-kpi"><div><span>Equipamentos ativos</span><strong class="purple-text">${activeEquipment()}</strong><small>unidades</small></div><span class="kpi-icon purple-bg">${icon("wrench")}</span></article></div><div class="dash-columns"><section class="dash-card"><div class="dash-head"><h3>Stock baixo <em>${lowItems().length}</em></h3><button data-view="stock">Ver todos</button></div><div class="dash-list">${lows.map(r=>`<div class="dash-row"><span class="product-thumb">${productEmoji(r.nome)}</span><div class="product-main"><strong>${esc(r.nome)}</strong><small>Stock consolidado</small></div><span class="status-low">Stock baixo</span><strong class="qty">${r.total}</strong></div>`).join("") || `<div class="empty">Não existem artigos com stock baixo.</div>`}</div></section><section class="dash-card"><div class="dash-head"><h3>Movimentos recentes</h3><button data-view="movimentos">Ver todos</button></div><div class="dash-list">${recent.map(e=>`<div class="dash-row"><span class="person-thumb">${icon("user")}</span><div class="product-main"><strong>${esc(e.trabalhador||e.worker_name||e.worker_id||"Trabalhador")}</strong><small>${esc(e.epi_type||e.epi||e.nomeEpi||"EPI")}</small></div><span class="status-ok">Entrega</span><small class="row-date">${fmtDate(e.delivery_date||e.data)}</small></div>`).join("") || `<div class="empty">Sem movimentos recentes.</div>`}</div></section></div><section class="sync-banner">${icon("info")}<div><strong>Todos os dados são sincronizados com o registo de entregas de EPI.</strong><small>As entregas são efetuadas no módulo principal.</small></div><button data-core="deliveries">${icon("external")}Ir para Entregas de EPI</button></section></div>`;
}
function stockView() {
  const w=state.warehouse||warehouses()[0];
  const rows=epis().map(e=>({name:e.nome,price:num(e.preco),stock:stockRecord(w,e.nome)}));
  return `<section class="inner-view"><div class="view-head"><div><h2>Stock EPI</h2><p>Controlo por armazém. As saídas resultam das entregas feitas no core.</p></div><label>Armazém<select id="mgmt-warehouse">${warehouses().map(x=>`<option ${x===w?"selected":""}>${esc(x)}</option>`).join("")}</select></label></div><div class="stock-summary"><strong>${rows.reduce((s,r)=>s+r.stock,0).toLocaleString("pt-PT")}<small>unidades</small></strong><strong>${money(rows.reduce((s,r)=>s+r.stock*r.price,0))}<small>valor</small></strong></div><div class="data-table"><table><thead><tr><th>EPI</th><th>Preço</th><th>Stock</th><th>Estado</th><th>Entrada</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${money(r.price)}</td><td><strong>${r.stock}</strong></td><td><span class="status ${r.stock<=5?'danger':r.stock<=10?'warn':'good'}">${r.stock<=5?'Repor':r.stock<=10?'Atenção':'OK'}</span></td><td><input type="number" min="0" data-stock-name="${esc(r.name)}" placeholder="+ unidades"></td></tr>`).join("")}</tbody></table></div><button class="primary-action" data-stock-save>Guardar entradas</button></section>`;
}
function catalogView() { return `<section class="inner-view"><div class="view-head"><div><h2>Catálogo EPI</h2><p>Catálogo existente no core. O extra acrescenta referência de preço.</p></div><strong>${epis().length} artigos</strong></div><div class="data-table"><table><thead><tr><th>Artigo</th><th>Riscos</th><th>Validade</th><th>Preço referência</th></tr></thead><tbody>${epis().map(e=>`<tr><td>${esc(e.nome)}</td><td>${esc(e.riscos)}</td><td>${num(e.meses)} meses</td><td><input type="number" min="0" step="0.01" data-price-name="${esc(e.nome)}" value="${num(e.preco)||""}"></td></tr>`).join("")}</tbody></table></div><button class="primary-action" data-catalog-save>Guardar catálogo</button></section>`; }
function movementsView() { const es=events().slice().reverse(); return `<section class="inner-view"><div class="view-head"><div><h2>Movimentos / Entregas</h2><p>Consulta do histórico produzido pelo core.</p></div><strong>${es.length} entregas</strong></div><div class="data-table"><table><thead><tr><th>Data</th><th>Trabalhador</th><th>EPI</th><th>Qtd.</th><th>Responsável</th></tr></thead><tbody>${es.map(e=>`<tr><td>${fmtDate(e.delivery_date||e.data)}</td><td>${esc(e.trabalhador||e.worker_name||e.worker_id||"—")}</td><td>${esc(e.epi_type||e.epi||e.nomeEpi||"—")}</td><td>${num(e.qtd||e.quantidade)||1}</td><td>${esc(e.responsavel||"—")}</td></tr>`).join("")||`<tr><td colspan="5">Sem movimentos.</td></tr>`}</tbody></table></div></section>`; }
function equipmentView() { return `<section class="inner-view"><div class="view-head"><div><h2>Equipamentos</h2><p>Cada equipamento é uma unidade identificável, com responsável e controlo de inspeção.</p></div><button class="primary-action" data-eq-new>+ Novo equipamento</button></div><div class="data-table"><table><thead><tr><th>Código</th><th>Equipamento</th><th>N.º série</th><th>Local</th><th>Responsável</th><th>Estado</th><th></th></tr></thead><tbody>${state.equipment.map(e=>`<tr><td><code>${esc(e.codigo||e.id)}</code></td><td>${esc(e.nome)}</td><td>${esc(e.serie)}</td><td>${esc(e.local)}</td><td>${esc(e.responsavel)}</td><td><span class="status ${e.estado==='Em serviço'?'good':e.estado==='Manutenção'?'warn':'danger'}">${esc(e.estado||'Em serviço')}</span></td><td><button class="table-action" data-eq-edit="${esc(e.id)}">Editar</button></td></tr>`).join("")||`<tr><td colspan="7">Ainda não existem equipamentos registados.</td></tr>`}</tbody></table></div></section>`; }
function content() { return state.view==='overview'?overview():state.view==='stock'?stockView():state.view==='catalogo'?catalogView():state.view==='movimentos'?movementsView():equipmentView(); }
function shell() { return `<div class="dpm-mgmt-page">${header()}<div class="dpm-mgmt-layout">${sidebar()}<main class="dpm-mgmt-content"><div class="content-inner">${tabs()}<div id="mgmt-content">${content()}</div></div></main></div></div>`; }
function close() { document.querySelector('.dpm-mgmt-page')?.remove(); state.autoOpened=false; }
function goCore(target) { close(); const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim()===target); if(b) b.click(); }
function bind() {
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;render();});
  document.querySelector('#mgmt-warehouse')?.addEventListener('change',e=>{state.warehouse=e.target.value;render();});
  document.querySelector('[data-stock-save]')?.addEventListener('click',async()=>{const w=state.warehouse;for(const i of document.querySelectorAll('[data-stock-name]')){const q=num(i.value);if(q>0)state.data.stocks[w][i.dataset.stockName]=num(state.data.stocks[w][i.dataset.stockName])+q;}await saveMain();await load();render();});
  document.querySelector('[data-catalog-save]')?.addEventListener('click',async()=>{for(const i of document.querySelectorAll('[data-price-name]')){const e=epis().find(x=>x.nome===i.dataset.priceName);if(e)e.preco=num(i.value);}await saveMain();render();});
  document.querySelector('[data-eq-new]')?.addEventListener('click',()=>equipmentForm());
  document.querySelectorAll('[data-eq-edit]').forEach(b=>b.onclick=()=>equipmentForm(state.equipment.find(e=>e.id===b.dataset.eqEdit)));
  document.querySelectorAll('[data-core]').forEach(b=>b.onclick=()=>{const map={core:'Início',workers:'Pessoal',deliveries:'Entregas de EPI',history:'Histórico',signatures:'Assinaturas',reports:'Relatórios',budget:'Orçamento'}; if(map[b.dataset.core]) goCore(map[b.dataset.core]);});
  document.querySelector('[data-menu]')?.addEventListener('click',()=>document.querySelector('.dpm-mgmt-page')?.classList.toggle('sidebar-collapsed'));
}
function render(){const c=document.querySelector('#mgmt-content');if(c)c.innerHTML=content();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));bind();}
function equipmentForm(item={}) {
  const o=document.createElement('div'); o.className='mgmt-dialog'; o.innerHTML=`<form><h3>${item.id?'Editar':'Novo'} equipamento</h3><div class="form-grid"><label>Código<input name="codigo" value="${esc(item.codigo)}" placeholder="EQP-0001"></label><label>Equipamento<input name="nome" value="${esc(item.nome)}" required></label><label>N.º série<input name="serie" value="${esc(item.serie)}"></label><label>Local<input name="local" value="${esc(item.local)}"></label><label>Responsável<input name="responsavel" value="${esc(item.responsavel)}"></label><label>Estado<select name="estado"><option ${item.estado==='Em serviço'?'selected':''}>Em serviço</option><option ${item.estado==='Manutenção'?'selected':''}>Manutenção</option><option ${item.estado==='Fora de serviço'?'selected':''}>Fora de serviço</option></select></label><label>Próxima inspeção<input type="date" name="inspecao" value="${esc(item.inspecao)}"></label><label>Próxima calibração<input type="date" name="calibracao" value="${esc(item.calibracao)}"></label></div><div class="dialog-actions"><button type="button" data-dialog-close>Cancelar</button><button class="primary-action">Guardar</button></div></form>`;
  document.body.appendChild(o); o.querySelector('[data-dialog-close]').onclick=()=>o.remove(); o.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const obj=Object.fromEntries(new FormData(ev.target).entries());if(item.id)await updateDoc(doc(db(),'equipment',item.id),obj);else await addDoc(collection(db(),'equipment'),{...obj,createdAt:new Date().toISOString()});o.remove();await load();render();};
}
async function open() { if(document.querySelector('.dpm-mgmt-page')) return; try { await load(); document.body.insertAdjacentHTML('beforeend',shell()); render(); } catch(e) { console.error('Gestão EPI/Equipamentos:',e); } }

// Só abre automaticamente quando o perfil atual expõe "Orçamento", que no core DPM é exclusivo do SuperAdmin.
function isSuperAdminContext(){ return [...document.querySelectorAll('button,a')].some(x=>x.textContent.trim()==='Orçamento'); }
function autoOpen(){ if(window.__dpmMgmtOpened || document.querySelector('.dpm-mgmt-page')) return; if(!isSuperAdminContext()) return; window.__dpmMgmtOpened=true; setTimeout(()=>open(),120); }
window.dpmOpenEpiManagement=open;
setInterval(autoOpen,500);
setTimeout(autoOpen,900);
