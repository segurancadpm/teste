// DPM — Modelos de EPI na entrega
// Mantém o core intacto e acrescenta apenas a escolha do modelo quando o EPI tem modelos.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DB_DOC="dpm_epi_data_v1";
let data=null;
const db=()=>getFirestore(getApp());
const ref=()=>doc(db(),"appdata",DB_DOC);
const norm=v=>String(v??"").trim().toUpperCase();
const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));

async function load(){
  const snap=await getDoc(ref());
  data=snap.exists()?snap.data():{};
  data.matriz=Array.isArray(data.matriz)?data.matriz:[];
  data.epiModels=data.epiModels&&typeof data.epiModels==='object'?data.epiModels:{};
}
function modelsFor(epi){
  const list=Array.isArray(data?.epiModels?.[epi])?data.epiModels[epi]:[];
  return list.filter(x=>x&&x.ativo!==false);
}
function findEpiSelect(root){
  const selects=[...root.querySelectorAll('select')];
  if(!selects.length)return null;
  const known=new Set(data.matriz.map(x=>norm(x?.nome)).filter(Boolean));
  let best=null,score=0;
  for(const s of selects){
    const vals=[...s.options].map(o=>norm(o.value||o.textContent));
    const hits=vals.filter(v=>known.has(v)).length;
    if(hits>score){score=hits;best=s;}
  }
  return best;
}
function decorate(root){
  if(!root||root.dataset.modelDelivery==='1')return;
  const epiSelect=findEpiSelect(root);
  if(!epiSelect)return;
  root.dataset.modelDelivery='1';
  const wrap=document.createElement('div');
  wrap.className='field-row';
  wrap.style.marginTop='8px';
  wrap.innerHTML='<label style="display:grid;gap:6px"><span class="meta">Modelo (quando aplicável)</span><select class="select" name="modelo_epi"><option value="">Sem modelo</option></select></label>';
  const parent=epiSelect.closest('.field-row')||epiSelect.parentElement;
  if(parent?.parentElement) parent.parentElement.insertBefore(wrap,parent.nextSibling); else root.appendChild(wrap);
  const modelSelect=wrap.querySelector('select');
  const refresh=()=>{
    const epi=epiSelect.value||epiSelect.selectedOptions?.[0]?.textContent||'';
    const list=modelsFor(epi);
    modelSelect.innerHTML=list.length?'<option value="">Selecionar modelo</option>'+list.map(m=>`<option value="${esc(m.nome)}">${esc(m.nome)}${m.preco?` · ${Number(m.preco).toLocaleString('pt-PT',{style:'currency',currency:'EUR'})}`:''}</option>`).join(''):'<option value="">Sem modelo configurado</option>';
    wrap.style.display=list.length?'':'none';
    if(list.length===1) modelSelect.value=list[0].nome;
  };
  epiSelect.addEventListener('change',refresh);
  refresh();
}
async function start(){
  try{await load();}catch(e){console.warn('Modelos de EPI:',e);return;}
  const scan=()=>{
    document.querySelectorAll('form, .modal, .section').forEach(decorate);
  };
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
  scan();
}
start();
