// DPM — Organização do stock por famílias + entrada de stock com modelo
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DOC="dpm_epi_data_v1";
const FAMILIES=["EPI","Equipamento","Ambiente","Portes"];
let selectedFamily="EPI";
let busy=false;
const db=()=>getFirestore(getApp());
const ref=()=>doc(db(),"appdata",DOC);
const norm=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const money=v=>new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"}).format(Number(v||0));

function stockRec(stocks,w,epi){
  stocks[w] ||= {};
  const v=stocks[w][epi];
  if(typeof v==="number") stocks[w][epi]={loose:v,sizes:{}};
  else if(!v||typeof v!=="object") stocks[w][epi]={loose:0,sizes:{}};
  stocks[w][epi].loose=Number(stocks[w][epi].loose ?? stocks[w][epi].semTamanho ?? 0);
  stocks[w][epi].sizes=stocks[w][epi].sizes||stocks[w][epi].tamanhos||{};
  return stocks[w][epi];
}
function modelRec(rec,name){
  rec.models ||= {};
  rec.models[name]=rec.models[name]&&typeof rec.models[name]==="object"?rec.models[name]:{loose:0,sizes:{}};
  rec.models[name].loose=Number(rec.models[name].loose||0);
  rec.models[name].sizes=rec.models[name].sizes||{};
  return rec.models[name];
}
async function getData(){
  const s=await getDoc(ref());
  const d=s.exists()?(s.data()||{}):{};
  d.stocks ||= {};
  d.warehouses ||= ["DPM Norte","DPM Sul","DPM Algarve"];
  d.matriz ||= [];
  d.epiModels ||= {};
  d.budget ||= {};
  d.budget.inventoryCatalog ||= {families:{}};
  d.budget.inventoryCatalog.families ||= {};
  FAMILIES.forEach(f=>d.budget.inventoryCatalog.families[f] ||= []);
  return d;
}
function familyMap(data){
  const out={};
  FAMILIES.forEach(f=>out[f]=new Set((data.budget.inventoryCatalog.families[f]||[]).filter(x=>x?.active!==false).map(x=>norm(x.name))));
  return out;
}
function installFamilyBar(root,data){
  if(!root||root.querySelector("[data-stock-family-bar]"))return;
  const section=root.querySelector(".section");
  const list=root.querySelector(".stock-list");
  if(!section||!list)return;
  const bar=document.createElement("div");
  bar.dataset.stockFamilyBar="1";
  bar.style.cssText="display:flex;gap:8px;overflow-x:auto;padding:2px 0 10px;margin:0 0 10px;position:sticky;top:0;z-index:5;background:var(--bg,Canvas);";
  bar.innerHTML=FAMILIES.map(f=>`<button type="button" class="ghost-btn" data-stock-family="${f}" style="white-space:nowrap;${selectedFamily===f?'background:var(--accent,#00a3e0);color:#00131d;':''}">${f}</button>`).join("");
  section.insertBefore(bar,section.children[1]||section.firstChild);
  bar.querySelectorAll("[data-stock-family]").forEach(b=>b.addEventListener("click",()=>{selectedFamily=b.dataset.stockFamily;applyFamily(root,data)}));
  applyFamily(root,data);
}
function applyFamily(root,data){
  const map=familyMap(data); const set=map[selectedFamily]||new Set();
  root.querySelectorAll(".stock-card").forEach(card=>{
    const name=norm(card.querySelector("strong")?.textContent||"");
    card.style.display=set.has(name)?"grid":"none";
  });
  root.querySelectorAll("[data-stock-family]").forEach(b=>{const on=b.dataset.stockFamily===selectedFamily;b.style.background=on?"var(--accent,#00a3e0)":"";b.style.color=on?"#00131d":"";});
}
function sizesFor(rec,model){
  const source=model&&rec.models?.[model]?rec.models[model]:rec;
  return Object.entries(source.sizes||{}).filter(([,q])=>Number(q||0)>0).sort(([a],[b])=>a.localeCompare(b,"pt-PT",{numeric:true}));
}
function openEntry(epiName,warehouse){
  if(busy)return; busy=true;
  getData().then(data=>{
    const epi=data.matriz.find(e=>norm(e.nome)===norm(epiName));
    const models=Array.isArray(data.epiModels?.[epiName])?data.epiModels[epiName].filter(m=>m&&m.ativo!==false):[];
    const root=document.getElementById("modal-root"); if(!root)throw new Error("Janela de entrada indisponível.");
    const modelOptions=models.length?`<option value="">Selecionar modelo</option>${models.map(m=>`<option value="${esc(m.nome)}">${esc(m.nome)}${m.preco?` · ${money(m.preco)}`:""}</option>`).join("")}`:`<option value="">Sem modelo</option>`;
    root.innerHTML=`<div class="modal-overlay" data-stock-entry-overlay><div class="modal" role="dialog" aria-modal="true" style="max-width:620px;width:min(96vw,620px)"><div class="modal-head"><div><h2>Entrada de Stock</h2><p class="meta">${esc(epiName)} · ${esc(warehouse)}</p></div><button type="button" class="icon-btn" data-stock-entry-close>×</button></div><form data-stock-entry-form><div class="field-row"><select class="select" name="modelo" ${models.length?'':'disabled'}>${modelOptions}</select></div><div class="field-row two"><select class="select" name="tamanho"><option value="">Sem tamanho</option></select><input class="input" name="qtd" type="number" min="1" value="1" required></div><p class="meta" data-stock-entry-info></p><div style="display:flex;justify-content:flex-end;gap:8px"><button class="ghost-btn" type="button" data-stock-entry-close>Cancelar</button><button class="primary-btn" type="submit">Adicionar Entrada</button></div></form></div></div>`;
    const form=root.querySelector("[data-stock-entry-form]"),modelSel=form.modelo,sizeSel=form.tamanho,info=form.querySelector("[data-stock-entry-info]");
    const refresh=()=>{
      const model=modelSel?.value||"";
      const rec=stockRec(data.stocks,warehouse,epiName);
      const entries=sizesFor(rec,model);
      const old=sizeSel.value;
      sizeSel.innerHTML='<option value="">Sem tamanho</option>'+entries.map(([s,q])=>`<option value="${esc(s)}">${esc(s)} (${q})</option>`).join("");
      if([...sizeSel.options].some(o=>o.value===old))sizeSel.value=old;
      const m=models.find(x=>x.nome===model);
      info.textContent=m?`Preço do modelo: ${money(m.preco)} · Tamanhos configurados: ${(m.tamanhos||[]).join(", ")||"—"}`:`Entrada sem modelo · stock geral do artigo`;
    };
    modelSel?.addEventListener("change",refresh);refresh();
    root.querySelectorAll("[data-stock-entry-close]").forEach(b=>b.addEventListener("click",()=>root.innerHTML=""));
    form.addEventListener("submit",async e=>{
      e.preventDefault();
      if(busy)return;
      const model=modelSel?.value||"";
      const size=sizeSel.value;
      const qty=Number(form.qtd.value||0);
      if(qty<=0){alert("Indica uma quantidade válida.");return;}
      if(models.length&&!model){alert("Escolhe o modelo comprado.");return;}
      busy=true;
      try{
        const latest=await getData();
        const rec=stockRec(latest.stocks,warehouse,epiName);
        if(model){const mr=modelRec(rec,model);if(size)mr.sizes[size]=(Number(mr.sizes[size]||0)+qty);else mr.loose=Number(mr.loose||0)+qty;}
        else{if(size)rec.sizes[size]=(Number(rec.sizes[size]||0)+qty);else rec.loose=Number(rec.loose||0)+qty;}
        await setDoc(ref(),{stocks:latest.stocks},{merge:true});
        root.innerHTML="";
        window.dispatchEvent(new CustomEvent("dpm:stock-updated"));
      }catch(err){console.error("Entrada de stock",err);alert(`Não foi possível guardar a entrada.\n\n${err.message||err}`)}finally{busy=false}
    });
  }).catch(err=>alert(`Não foi possível abrir a entrada de stock.\n\n${err.message||err}`)).finally(()=>busy=false);
}
function interceptEntries(){
  document.addEventListener("click",e=>{
    const btn=e.target.closest("[data-entry]");
    if(!btn)return;
    e.preventDefault();e.stopImmediatePropagation();
    const epi=btn.dataset.entry;
    const wh=document.querySelector('[data-filter="stockWarehouse"]')?.value||"DPM Norte";
    openEntry(epi,wh);
  },true);
}
function observeStock(){
  const sync=async()=>{
    const main=document.getElementById("app");if(!main)return;
    const title=main.querySelector("h1")?.textContent||"";if(title!=="Armazém")return;
    try{const d=await getData();installFamilyBar(main,d);applyFamily(main,d)}catch{}
  };
  const mo=new MutationObserver(()=>sync());
  mo.observe(document.body,{childList:true,subtree:true});
  sync();
}
interceptEntries();
observeStock();
