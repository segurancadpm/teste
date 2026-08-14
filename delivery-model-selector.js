import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const db=getFirestore(getApp());
const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
let data=null;
async function load(){const s=await getDoc(doc(db,"appdata","dpm_epi_data_v1"));data=s.exists()?s.data():{};return data;}
function models(name){return Array.isArray(data?.epiModels?.[name])?data.epiModels[name].filter(m=>m&&m.ativo!==false):[];}
function fill(row){const epi=row.querySelector('[name="epi"]');const select=row.querySelector('[data-master-model]');if(!epi||!select)return;const ms=models(epi.value);select.innerHTML=`<option value="">${ms.length?"Selecionar modelo":"Sem modelo configurado"}</option>`+ms.map(m=>`<option value="${esc(m.id)}">${esc(m.nome)}${m.preco?` · ${Number(m.preco).toFixed(2)} €`:""}</option>`).join('');select.disabled=!ms.length;}
function enhance(){const root=document.querySelector("#modal-root");if(!root||!root.querySelector('[data-form="delivery"]'))return;root.querySelectorAll(".delivery-item").forEach(row=>{let select=row.querySelector('[data-master-model]');if(!select){const epi=row.querySelector('[name="epi"]');if(!epi)return;const wrap=document.createElement("div");wrap.className="field-row";wrap.innerHTML=`<label>Modelo<select class="select" data-master-model></select></label>`;epi.closest(".field-row")?.insertAdjacentElement("afterend",wrap);select=wrap.querySelector('select');epi.addEventListener('change',()=>fill(row));}fill(row);});}
load().then(()=>{const root=document.getElementById("modal-root");const observer=new MutationObserver(enhance);observer.observe(root,{childList:true,subtree:true});enhance();});
