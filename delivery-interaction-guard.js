// DPM — proteção do formulário de entrega contra renderizações globais do app.js
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const db=()=>getFirestore(getApp());
const ref=()=>doc(db(),"appdata","dpm_epi_data_v1");
let cache=null;
const norm=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));

async function getData(){
  if(cache)return cache;
  const s=await getDoc(ref());
  cache=s.exists()?(s.data()||{}):{};
  return cache;
}
function modelList(d,epi){
  const exact=Array.isArray(d?.epiModels?.[epi])?d.epiModels[epi]:[];
  if(exact.length)return exact.filter(m=>m&&m.ativo!==false);
  const key=Object.keys(d?.epiModels||{}).find(x=>norm(x)===norm(epi));
  return key&&Array.isArray(d.epiModels[key])?d.epiModels[key].filter(m=>m&&m.ativo!==false):[];
}
function stockSizes(d,warehouse,epi,model){
  const rec=d?.stocks?.[warehouse]?.[epi];
  const r=rec&&typeof rec==='object'?rec:null;
  const mr=r?.models?.[model];
  const configured=[];
  const m=modelList(d,epi).find(x=>String(x.id||x.nome)===String(model)||norm(x.nome)===norm(model));
  if(Array.isArray(m?.tamanhos))configured.push(...m.tamanhos);
  if(mr?.sizes)configured.push(...Object.keys(mr.sizes));
  if(r?.sizes)configured.push(...Object.keys(r.sizes));
  return [...new Set(configured.map(x=>String(x).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-PT',{numeric:true}));
}
async function refreshRow(row){
  const d=await getData();
  const epi=row.querySelector('[name="epi"]')?.value||'';
  const model=row.querySelector('[name="model"]');
  const size=row.querySelector('[name="size"]');
  if(!model||!size)return;
  const models=modelList(d,epi);
  const currentModel=model.value;
  model.disabled=!models.length;
  model.innerHTML=models.length
    ? '<option value="">Selecionar modelo</option>'+models.map(m=>`<option value="${esc(m.id||m.nome)}">${esc(m.nome)}</option>`).join('')
    : '<option value="">Sem modelo configurado</option>';
  if(currentModel && [...model.options].some(o=>o.value===currentModel))model.value=currentModel;
  const selected=models.find(m=>String(m.id||m.nome)===String(model.value)||norm(m.nome)===norm(model.value));
  const warehouse=row.closest('[data-df-form]')?.dataset.warehouse||'';
  const sizes=stockSizes(d,warehouse,epi,selected?.nome||model.value||'');
  const old=size.value;
  size.innerHTML='<option value="">Sem tamanho</option>'+sizes.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  if(old && [...size.options].some(o=>o.value===old))size.value=old;
}

window.addEventListener('change',e=>{
  const row=e.target?.closest?.('.df-item');
  const form=e.target?.closest?.('[data-df-form]');
  if(!row||!form)return;
  if(e.target.name==='epi'||e.target.name==='model'){
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    refreshRow(row).catch(err=>console.error('[DPM entrega guard]',err));
  } else if(e.target.name==='size'||e.target.name==='qty'||e.target.name==='months'){
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  }
},true);
window.addEventListener('input',e=>{
  const form=e.target?.closest?.('[data-df-form]');
  if(!form)return;
  if(e.target.name==='qty'||e.target.name==='months'){
    e.stopPropagation(); e.stopImmediatePropagation();
  }
},true);
