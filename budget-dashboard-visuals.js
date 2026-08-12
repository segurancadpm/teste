// DPM — Complemento visual do Dashboard de Orçamento
// Apenas acrescenta indicadores ao Dashboard existente. Não cria navegação nem altera separadores.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MAIN_DOC = "dpm_epi_data_v1";
let mounted = false;
let loading = false;
let observerStarted = false;
const db = () => getFirestore(getApp());
const ref = () => doc(db(), "appdata", MAIN_DOC);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const euro = v => new Intl.NumberFormat("pt-PT", {style:"currency", currency:"EUR"}).format(num(v));
function stockTotal(value){
  if (value && typeof value === "object") return num(value.loose) + Object.values(value.sizes || value.tamanhos || {}).reduce((s,q)=>s+num(q),0);
  return num(value);
}
function icon(name){
  const paths={
    box:'<path d="m3 7 9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>',
    arrows:'<path d="M7 7h13l-3-3M17 17H4l3 3M20 7l-3 3M4 17l3-3"/>'
  };
  return `<svg class="budget-insight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]||""}</svg>`;
}
async function readData(){ const snap=await getDoc(ref()); return snap.exists()?snap.data():null; }
function findRoot(){ return document.querySelector('.budget-management-root'); }
function isDashboard(root){ return !!root && document.querySelector('.screen-title h1')?.textContent.trim()==='Orçamento' && document.querySelector('.budget-management-tab.active')?.dataset.budgetTab==='resumo'; }
function removeCard(){ document.querySelector('.budget-insights-grid')?.remove(); mounted=false; }
async function render(root){
  if (!isDashboard(root) || mounted || loading) return;
  loading=true;
  try{
    const data=await readData();
    if(!data) return;
    const epis=Array.isArray(data.matriz)?data.matriz:[];
    const stocks=data.stocks||{};
    const total=Object.values(stocks).reduce((sum,w)=>sum+Object.values(w||{}).reduce((s,q)=>s+stockTotal(q),0),0);
    const low=epis.map(e=>({name:e.nome,qty:Object.values(stocks).reduce((s,w)=>s+stockTotal(w?.[e.nome]),0)})).filter(x=>x.qty<=5).sort((a,b)=>a.qty-b.qty).slice(0,5);
    const events=(Array.isArray(data.eventos)?data.eventos:[]).filter(e=>!e.tipo||String(e.tipo).toUpperCase()==='ENTREGA').slice().reverse().slice(0,5);
    const value=Object.entries(stocks).reduce((sum,w)=>sum+Object.entries(w||{}).reduce((s,[name,q])=>s+stockTotal(q)*num(epis.find(e=>e.nome===name)?.preco),0),0);
    const card=document.createElement('section');
    card.className='budget-insights-grid';
    card.innerHTML=`<article class="budget-insight-card"><div class="budget-insight-head"><div><span>Stock EPI</span><strong>${total.toLocaleString('pt-PT')}</strong><small>unidades disponíveis</small></div><span class="budget-insight-bubble blue">${icon('box')}</span></div><div class="budget-insight-meta"><span>Valor estimado</span><strong>${euro(value)}</strong></div></article><article class="budget-insight-card"><div class="budget-insight-title"><h3>Stock baixo</h3><span>${low.length}</span></div><div class="budget-insight-list">${low.map(x=>`<div><span>${esc(x.name)}</span><strong>${x.qty}</strong></div>`).join('') || '<div class="budget-insight-empty">Sem artigos críticos.</div>'}</div></article><article class="budget-insight-card"><div class="budget-insight-title"><h3>Entregas recentes</h3><span>${events.length}</span></div><div class="budget-insight-list">${events.map(e=>`<div><span><strong>${esc(e.trabalhador||e.worker_name||e.worker_id||'Trabalhador')}</strong><small>${esc(e.epi||e.epi_type||'EPI')}</small></span><span class="budget-insight-delivery">${icon('arrows')}</span></div>`).join('') || '<div class="budget-insight-empty">Sem entregas recentes.</div>'}</div></article>`;
    root.querySelector('.budget-view')?.insertAdjacentElement('afterend',card);
    mounted=true;
  } finally { loading=false; }
}
function sync(){
  const root=findRoot();
  if(!isDashboard(root)){ removeCard(); return; }
  if(!mounted) render(root);
}
function start(){
  if(observerStarted) return;
  observerStarted=true;
  const observer=new MutationObserver(sync);
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-selected']});
  sync();
}
start();
