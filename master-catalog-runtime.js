// DPM — Catálogo Mestre Runtime v2
// O Inventário Mestre é a fonte de verdade. Este runtime apenas mantém compatibilidade
// com o modelo legacy; nunca recria artigos apagados a partir de matriz/stock.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadCatalog, articleId, getArticles } from "./catalog-master.js";

const DOC="dpm_epi_data_v1", FAMILIES=["EPI","Equipamento","Ambiente","Portes"];
const db=()=>getFirestore(getApp()), ref=()=>doc(db(),"appdata",DOC);
const norm=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toUpperCase();
let busy=false;

function ensure(data){
  const d=data||{}; d.budget ||= {}; d.budget.inventoryCatalog ||= {families:{}}; d.budget.inventoryCatalog.families ||= {};
  FAMILIES.forEach(f=>d.budget.inventoryCatalog.families[f] ||= []);
  d.matriz=Array.isArray(d.matriz)?d.matriz:[]; d.stocks ||= {}; d.epiModels ||= {};
  d.warehouses=Array.isArray(d.warehouses)&&d.warehouses.length?d.warehouses:["DPM Norte","DPM Sul","DPM Algarve"];
  return d;
}

async function syncCanonicalToLegacy(){
  if(busy)return; busy=true;
  try{
    const canonical=await loadCatalog(db());
    const d=ensure(canonical);
    // Canonical -> legacy only. Never read legacy to recreate a deleted catalog item.
    for(const x of getArticles(d,"EPI",false)){
      const name=x.nome; if(!name)continue;
      let epi=d.matriz.find(e=>norm(e?.nome)===norm(name));
      if(!epi){
        d.matriz.push({nome:name,riscos:Array.isArray(x.perigos)?x.perigos.join(", "):"",meses:12,preco:Number(x.preco||0),familia:"EPI",categoria:x.categoria||""});
      }else{
        if(Number(x.preco||0)>0)epi.preco=Number(x.preco);
        epi.familia="EPI";
      }
      d.epiModels[name]=Array.isArray(d.epiModels[name])?d.epiModels[name]:[];
      for(const w of d.warehouses){
        d.stocks[w] ||= {};
        if(!d.stocks[w][name])d.stocks[w][name]={loose:0,sizes:{},models:{}};
        if(typeof d.stocks[w][name]==="number")d.stocks[w][name]={loose:Number(d.stocks[w][name]),sizes:{},models:{}};
        d.stocks[w][name].models ||= {}; d.stocks[w][name].sizes ||= {};
      }
    }
    await setDoc(ref(),{budget:d.budget,matriz:d.matriz,stocks:d.stocks,epiModels:d.epiModels},{merge:true});
  }catch(e){console.warn("Catálogo Mestre sync:",e)}finally{busy=false}
}

window.DPMMasterCatalogSync={sync:syncCanonicalToLegacy};
window.addEventListener("dpm:open-inventory",()=>setTimeout(syncCanonicalToLegacy,0));
window.addEventListener("dpm:master-changed",()=>setTimeout(syncCanonicalToLegacy,0));
setTimeout(syncCanonicalToLegacy,800);
