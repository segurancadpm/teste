// DPM — catálogo mestre: modelos na entrega
// Integração passiva: nunca recria o seletor enquanto o formulário está a ser usado.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const db=()=>getFirestore(getApp()), mainRef=()=>doc(db(),"appdata","dpm_epi_data_v1");
let cache=null, loading=null;
const norm=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
async function data(){if(cache)return cache;if(loading)return loading;loading=getDoc(mainRef()).then(s=>cache=s.exists()?(s.data()||{}):{}).finally(()=>loading=null);return loading}
function models(d,epi){return Array.isArray(d?.epiModels?.[epi])?d.epiModels[epi].filter(m=>m&&m.ativo!==false):[]}
function getModel(list,v){return list.find(m=>String(m.id||m.nome)===String(v)||norm(m.nome)===norm(v))}
function filterSizes(item,m){const s=item.querySelector('[name="tamanho"],[name="size"]');if(!s||!m||!Array.isArray(m.tamanhos))return;const a=new Set(m.tamanhos.map(norm));[...s.options].forEach(o=>{if(o.value){o.hidden=!a.has(norm(o.value));o.disabled=o.hidden}});if(s.value&&!a.has(norm(s.value)))s.value=''}
function getItems(){return [...document.querySelectorAll('.delivery-item,[data-delivery-item],.epi-delivery-item,.df-item')]}
async function syncItem(item){const epi=item.querySelector('[name="epi"]');if(!epi)return;const d=await data(),list=models(d,epi.value);let model=item.querySelector('[name="modelo"],[name="model"]');if(!model){const wrap=document.createElement('div');wrap.className='field-row delivery-model-row';wrap.innerHTML='<label class="field-label">Modelo</label><select class="select delivery-model" name="modelo"><option value="">Selecionar modelo…</option></select>';const anchor=epi.closest('.field-row')||epi.parentElement;if(!anchor)return;anchor.insertAdjacentElement('afterend',wrap);model=wrap.querySelector('[name="modelo"]')}
if(!model.dataset.dpmCatalogOwned){model.dataset.dpmCatalogOwned='1';const current=model.value;model.innerHTML='<option value="">Selecionar modelo…</option>'+list.map(m=>`<option value="${esc(m.id||m.nome)}">${esc(m.nome)}${m.preco?` · ${Number(m.preco).toFixed(2)} €`:''}</option>`).join('');model.disabled=!list.length;if(current)model.value=current;model.addEventListener('change',()=>filterSizes(item,getModel(list,model.value)),{passive:true});}
filterSizes(item,getModel(list,model.value));}
async function enhance(){for(const item of getItems()){try{await syncItem(item)}catch(e){console.error('[DPM catálogo entrega]',e)}}}
document.addEventListener('change',ev=>{if(ev.target?.name==='epi'){const item=ev.target.closest('.delivery-item,[data-delivery-item],.epi-delivery-item,.df-item');if(item)setTimeout(()=>syncItem(item),0)}});
document.addEventListener('click',ev=>{if(ev.target.closest('[data-action="addDeliveryItem"],[data-df-add]'))setTimeout(enhance,100);if(ev.target.closest('[data-action="removeDeliveryItem"],[data-df-remove]'))setTimeout(enhance,100)});
setTimeout(enhance,800);