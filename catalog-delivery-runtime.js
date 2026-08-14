// DPM — catálogo mestre na Entrega
// Compatibilidade apenas: preenche o seletor se o fluxo de Entrega não o tiver preenchido.
// Não re-renderiza o formulário nem intercepta cliques/change.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const db=()=>getFirestore(getApp()),ref=()=>doc(db(),"appdata","dpm_epi_data_v1");
const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
let cache=null;
async function load(){if(cache)return cache;const s=await getDoc(ref());return cache=s.exists()?(s.data()||{}):{}}
async function fill(row){const epi=row?.querySelector('[name="epi"]'),sel=row?.querySelector('[name="model"]');if(!epi||!sel)return;const d=await load(),list=Array.isArray(d.epiModels?.[epi.value])?d.epiModels[epi.value].filter(m=>m&&m.ativo!==false):[];if(!list.length)return;const selected=sel.value;const hasReal=[...sel.options].some(o=>o.value);if(hasReal&&sel.dataset.dpmCanonical==='1')return;sel.innerHTML='<option value="">Selecionar modelo</option>'+list.map(m=>`<option value="${esc(m.id||m.nome)}">${esc(m.nome)}${m.preco?` · ${Number(m.preco).toFixed(2)} €`:''}</option>`).join('');sel.disabled=false;sel.dataset.dpmCanonical='1';if(selected)sel.value=selected}
function scan(){document.querySelectorAll('.df-item').forEach(row=>fill(row).catch(e=>console.warn('DPM catálogo entrega',e)))}
document.addEventListener('change',e=>{if(e.target?.name==='epi')setTimeout(scan,30)});document.addEventListener('click',e=>{if(e.target.closest('[data-df-add]'))setTimeout(scan,80)});setTimeout(scan,1000);
window.addEventListener('dpm:master-changed',()=>{cache=null;setTimeout(scan,150)});window.DPMDeliveryCatalog={version:()=>1};