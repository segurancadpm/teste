// DPM — Gestão de EPI e Equipamentos (extra ao core de registo de entregas)
// Não altera a navegação nem o fluxo de assinatura do core. Usa os mesmos dados Firebase.
import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MAIN_DOC = "dpm_epi_data_v1";
const state = { tab: "stock", data: null, equipment: [], warehouse: "DPM Norte" };
const db = () => getFirestore(getApp());
const mainRef = () => doc(db(), "appdata", MAIN_DOC);
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const num = v => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const money = v => new Intl.NumberFormat("pt-PT", {style:"currency", currency:"EUR"}).format(num(v));
const warehouses = () => Array.isArray(state.data?.warehouses) && state.data.warehouses.length ? state.data.warehouses : ["DPM Norte","DPM Sul","DPM Algarve"];
const epis = () => Array.isArray(state.data?.matriz) ? state.data.matriz : [];
const workers = () => Array.isArray(state.data?.trabalhadores) ? state.data.trabalhadores : [];

async function load() {
  const snap = await getDoc(mainRef());
  if (!snap.exists()) throw new Error("Não foi encontrado o registo principal de EPI.");
  state.data = snap.data();
  state.data.stocks ||= {};
  state.data.matriz ||= [];
  for (const w of warehouses()) {
    state.data.stocks[w] ||= {};
    epis().forEach(e => { if (typeof state.data.stocks[w][e.nome] === "undefined") state.data.stocks[w][e.nome] = 0; });
  }
  const eq = await getDocs(collection(db(), "equipment"));
  state.equipment = eq.docs.map(d => ({id:d.id, ...d.data()}));
}
async function saveMain() { await setDoc(mainRef(), state.data); }

function shell() {
  return `<div class="dpm-mgmt-overlay"><div class="dpm-mgmt"><header><div><span class="eyebrow">DPM • Gestão complementar</span><h2>Gestão de EPI e Equipamentos</h2><p>O registo digital de entrega continua a ser o core. Esta área gere catálogo, stock, movimentos e equipamentos.</p></div><button class="mgmt-close" data-close>Fechar</button></header><nav>${[["stock","Stock EPI"],["catalogo","Catálogo EPI"],["movimentos","Movimentos"],["equipamentos","Equipamentos"]].map(([id,l])=>`<button class="${state.tab===id?"active":""}" data-mgmt-tab="${id}">${l}</button>`).join("")}</nav><main id="dpm-mgmt-body"></main></div></div>`;
}
function renderStock() {
  const wh = state.warehouse;
  const rows = epis().map(e => ({name:e.nome, price:num(e.preco), stock:num(state.data.stocks?.[wh]?.[e.nome])}));
  return `<section><div class="mgmt-toolbar"><label>Armazém<select id="mgmt-warehouse">${warehouses().map(w=>`<option ${w===wh?"selected":""}>${esc(w)}</option>`).join("")}</select></label><div class="mgmt-kpis"><b>${rows.reduce((s,r)=>s+r.stock,0)}<small> unidades em stock</small></b><b>${rows.filter(r=>r.stock<=5).length}<small> artigos ≤ 5</small></b><b>${money(rows.reduce((s,r)=>s+r.stock*r.price,0))}<small> valor estimado</small></b></div></div><div class="mgmt-table"><table><thead><tr><th>EPI</th><th>Preço</th><th>Stock</th><th>Estado</th><th>Entrada manual</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${money(r.price)}</td><td><strong>${r.stock}</strong></td><td><span class="badge ${r.stock<=5?"danger":r.stock<=10?"warn":"ok"}">${r.stock<=5?"Repor":r.stock<=10?"Atenção":"OK"}</span></td><td><input type="number" min="0" step="1" data-stock-name="${esc(r.name)}" placeholder="+ unidades"></td></tr>`).join("")}</tbody></table></div><button class="primary" data-stock-save>Guardar entradas</button></section>`;
}
function renderCatalog() {
  return `<section><div class="mgmt-toolbar"><div><h3>Catálogo de EPI</h3><p>O catálogo existente do core é a fonte dos artigos. Aqui apenas gerimos referência e preço.</p></div><strong>${epis().length} artigos</strong></div><div class="mgmt-table"><table><thead><tr><th>Artigo</th><th>Riscos</th><th>Validade (meses)</th><th>Preço referência</th></tr></thead><tbody>${epis().map(e=>`<tr><td>${esc(e.nome)}</td><td>${esc(e.riscos)}</td><td>${num(e.meses)}</td><td><input type="number" min="0" step="0.01" data-price-name="${esc(e.nome)}" value="${num(e.preco)||""}"></td></tr>`).join("")}</tbody></table></div><button class="primary" data-catalog-save>Guardar catálogo</button></section>`;
}
function renderMovements() {
  const events = Array.isArray(state.data?.eventos) ? state.data.eventos.filter(e => String(e.tipo||"").toUpperCase()==="ENTREGA") : [];
  return `<section><div class="mgmt-toolbar"><div><h3>Movimentos EPI</h3><p>Consulta os movimentos do core. Não são criados registos paralelos.</p></div><strong>${events.length} entregas</strong></div><div class="mgmt-table"><table><thead><tr><th>Data</th><th>Trabalhador</th><th>EPI</th><th>Qtd.</th><th>Responsável</th></tr></thead><tbody>${events.slice().reverse().map(e=>`<tr><td>${esc(e.delivery_date||e.data||"")}</td><td>${esc(e.trabalhador||e.worker_name||e.worker_id||"")}</td><td>${esc(e.epi_type||e.epi||e.nomeEpi||"")}</td><td>${num(e.qtd||e.quantidade)}</td><td>${esc(e.responsavel||"")}</td></tr>`).join("") || `<tr><td colspan="5">Sem movimentos.</td></tr>`}</tbody></table></div></section>`;
}
function renderEquipment() {
  return `<section><div class="mgmt-toolbar"><div><h3>Inventário de equipamentos</h3><p>Cada equipamento tem identidade própria e histórico independente do stock de EPI.</p></div><button class="primary" data-eq-new>Novo equipamento</button></div><div class="mgmt-table"><table><thead><tr><th>ID</th><th>Equipamento</th><th>N.º série</th><th>Local</th><th>Responsável</th><th>Estado</th><th></th></tr></thead><tbody>${state.equipment.map(e=>`<tr><td><code>${esc(e.codigo||e.id)}</code></td><td>${esc(e.nome)}</td><td>${esc(e.serie)}</td><td>${esc(e.local)}</td><td>${esc(e.responsavel)}</td><td><span class="badge ${e.estado==="Em serviço"?"ok":e.estado==="Manutenção"?"warn":"danger"}">${esc(e.estado||"Em serviço")}</span></td><td><button data-eq-edit="${esc(e.id)}">Editar</button></td></tr>`).join("") || `<tr><td colspan="7">Ainda não existem equipamentos registados.</td></tr>`}</tbody></table></div></section>`;
}
function body() { const el=document.querySelector("#dpm-mgmt-body"); if(el) el.innerHTML=state.tab==="stock"?renderStock():state.tab==="catalogo"?renderCatalog():state.tab==="movimentos"?renderMovements():renderEquipment(); bindBody(); }
function bindBody() {
  document.querySelector("#mgmt-warehouse")?.addEventListener("change", e=>{state.warehouse=e.target.value;body();});
  document.querySelector("[data-stock-save]")?.addEventListener("click",async()=>{for(const input of document.querySelectorAll("[data-stock-name]")){const q=num(input.value);if(q>0)state.data.stocks[state.warehouse][input.dataset.stockName]=num(state.data.stocks[state.warehouse][input.dataset.stockName])+q;}await saveMain();state.data&&body();alert("Entradas de stock guardadas.");});
  document.querySelector("[data-catalog-save]")?.addEventListener("click",async()=>{for(const input of document.querySelectorAll("[data-price-name]")){const e=epis().find(x=>x.nome===input.dataset.priceName);if(e)e.preco=num(input.value);}await saveMain();alert("Catálogo guardado.");});
  document.querySelector("[data-eq-new]")?.addEventListener("click",()=>equipmentForm());
  document.querySelectorAll("[data-eq-edit]").forEach(b=>b.addEventListener("click",()=>equipmentForm(state.equipment.find(e=>e.id===b.dataset.eqEdit))));
}
function equipmentForm(item={}) {
  const overlay=document.createElement("div");overlay.className="mgmt-dialog";overlay.innerHTML=`<form><h3>${item.id?"Editar":"Novo"} equipamento</h3><div class="form-grid"><label>Código<input name="codigo" value="${esc(item.codigo)}" placeholder="EQP-0001"></label><label>Equipamento<input name="nome" value="${esc(item.nome)}" required></label><label>N.º série<input name="serie" value="${esc(item.serie)}"></label><label>Local<input name="local" value="${esc(item.local)}"></label><label>Responsável<input name="responsavel" value="${esc(item.responsavel)}"></label><label>Estado<select name="estado"><option ${item.estado==="Em serviço"?"selected":""}>Em serviço</option><option ${item.estado==="Manutenção"?"selected":""}>Manutenção</option><option ${item.estado==="Fora de serviço"?"selected":""}>Fora de serviço</option></select></label><label>Próxima inspeção<input type="date" name="inspecao" value="${esc(item.inspecao)}"></label><label>Próxima calibração<input type="date" name="calibracao" value="${esc(item.calibracao)}"></label></div><div class="dialog-actions"><button type="button" data-dialog-close>Cancelar</button><button class="primary">Guardar</button></div></form>`;document.body.appendChild(overlay);overlay.querySelector("[data-dialog-close]").onclick=()=>overlay.remove();overlay.querySelector("form").onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(ev.target),obj=Object.fromEntries(fd.entries());if(item.id)await updateDoc(doc(db(),"equipment",item.id),obj);else await addDoc(collection(db(),"equipment"),{...obj,createdAt:new Date().toISOString()});overlay.remove();await load();body();};
}
async function open() { if(document.querySelector(".dpm-mgmt-overlay"))return; try{await load();state.warehouse=warehouses()[0]||"DPM Norte";const host=document.createElement("div");host.innerHTML=shell();document.body.appendChild(host.firstElementChild);body();}catch(e){alert(`Não foi possível abrir a gestão: ${e.message}`);} }
function close(){document.querySelector(".dpm-mgmt-overlay")?.remove();}
document.addEventListener("click",e=>{const b=e.target.closest("[data-mgmt-tab]");if(b){state.tab=b.dataset.mgmtTab;document.querySelectorAll("[data-mgmt-tab]").forEach(x=>x.classList.toggle("active",x===b));body();}if(e.target.closest("[data-close]"))close();});
function installButton(){const candidates=[...document.querySelectorAll("button,a")];const budget=candidates.find(x=>x.textContent.trim()==="Orçamento");if(!budget)return; if(document.querySelector("[data-open-management]"))return;const b=document.createElement(budget.tagName.toLowerCase());b.className=budget.className;b.type="button";b.dataset.openManagement="1";b.textContent="Gestão EPI / Equipamentos";b.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();open();},true);budget.insertAdjacentElement("afterend",b);}
setInterval(installButton,700);setTimeout(installButton,1000);
