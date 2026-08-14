// DPM — isolamento do formulário de Entrega
// Intercepta apenas eventos CHANGE dentro da nova Entrega para impedir que o app.js
// faça re-render/navegação enquanto o utilizador escolhe modelo ou tamanho.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const db=()=>getFirestore(getApp());
const ref=()=>doc(db(),"appdata","dpm_epi_data_v1");
const norm=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
let cache=null;

async function getData(){
  if(cache)return cache;
  const snap=await getDoc(ref());
  cache=snap.exists()?(snap.data()||{}):{};
  return cache;
}
function models(data,epi){
  const list=Array.isArray(data?.epiModels?.[epi])?data.epiModels[epi]:[];
  return list.filter(m=>m&&m.ativo!==false);
}
function stockSizes(data,warehouse,epi,model){
  const r=data?.stocks?.[warehouse]?.[epi];
  if(!r||typeof r!=="object")return [];
  const mr=r.models?.[model];
  return mr&&mr.sizes&&typeof mr.sizes==="object"?Object.keys(mr.sizes):Object.keys(r.sizes||{});
}
function refreshRow(row,data){
  const form=row.closest('[data-df-form]');
  if(!form)return;
  const epiSel=row.querySelector('[name="epi"]');
  const modelSel=row.querySelector('[name="model"]');
  const sizeSel=row.querySelector('[name="size"]');
  if(!epiSel||!modelSel||!sizeSel)return;
  const epi=String(epiSel.value||"");
  const list=models(data,epi);
  const previousModel=modelSel.value;
  const selected=list.find(m=>String(m.id)===String(previousModel));
  modelSel.innerHTML=list.length
    ? '<option value="">Selecionar modelo</option>'+list.map(m=>`<option value="${esc(m.id)}">${esc(m.nome)}${m.preco?` · ${Number(m.preco).toFixed(2)} €`:''}</option>`).join("")
    : '<option value="">Sem modelo configurado</option>';
  modelSel.disabled=!list.length;
  if(selected)modelSel.value=String(selected.id);
  const chosen=list.find(m=>String(m.id)===String(modelSel.value));
  const configured=chosen?.tamanhos||[];
  const existing=stockSizes(data,form.dataset.warehouse,epi,chosen?.nome||"");
  const sizes=[...new Set([...configured,...existing].map(v=>String(v).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-PT",{numeric:true}));
  const oldSize=sizeSel.value;
  sizeSel.innerHTML='<option value="">Sem tamanho</option>'+sizes.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
  if(sizes.includes(oldSize))sizeSel.value=oldSize;
  const info=row.querySelector('.df-info');
  if(info)info.textContent=`${chosen?`Modelo: ${chosen.nome}`:'Selecione um modelo'} · ${sizes.length?`Tamanhos: ${sizes.join(', ')}`:'Sem tamanhos predefinidos'}`;
}

window.addEventListener('change',async e=>{
  const row=e.target?.closest?.('[data-df-form] .df-item');
  if(!row)return;
  // Impede o app.js e outros listeners de re-renderizarem a página/modal.
  e.stopPropagation();
  e.stopImmediatePropagation();
  try{
    const data=await getData();
    refreshRow(row,data);
  }catch(err){console.error('[DPM delivery guard]',err)}
},true);
