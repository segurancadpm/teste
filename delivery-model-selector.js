import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const db=getFirestore(getApp());
const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
let data=null;
async function load(){const s=await getDoc(doc(db,"appdata","dpm_epi_data_v1"));data=s.exists()?s.data():{};return data;}
function models(name){return Array.isArray(data?.epiModels?.[name])?data.epiModels[name].filter(m=>m&&m.ativo!==false):[];}
function enhance(){const root=document.querySelector("#modal-root");if(!root||!root.querySelector('[data-form="delivery"]'))return;root.querySelectorAll(".delivery-item").forEach(row=>{if(row.querySelector("[data-master-model]"))return;const epi=row.querySelector('[name="epi"]');if(!epi)return;const ms=models(epi.value);const wrap=document.createElement("div");wrap.className="field-row";wrap.innerHTML=`<label>Modelo<select class="select" data-master-model><option value="">${ms.length?"Selecionar modelo":"Sem modelo configurado"}</option>${ms.map(m=>`<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join("")}</select></label>`;epi.closest(".field-row")?.insertAdjacentElement("afterend",wrap);});}
load().then(()=>{const observer=new MutationObserver(enhance);observer.observe(document.getElementById("modal-root"),{childList:true,subtree:true});enhance();});
