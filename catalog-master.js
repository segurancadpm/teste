// DPM — Catálogo Mestre Canónico v1
// Único ponto de verdade para artigos/modelos novos.
// Compatível com o documento Firebase existente; não migra nem apaga dados históricos.
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const DATA_DOC="dpm_epi_data_v1", FAMILIES=["EPI","Equipamento","Ambiente","Portes"];
const normalize=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toUpperCase();
const stableId=(family,name)=>`${String(family).toLowerCase()}_${normalize(name).replace(/[^A-Z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase()}`;
export function catalogRef(db){return doc(db,"appdata",DATA_DOC)}
export function articleId(article,family="EPI"){return String(article?.id||stableId(family,article?.nome||article?.name))}
export function normalizeArticle(article,family="EPI"){const nome=String(article?.nome||article?.name||"").trim();return {...article,id:articleId({...article,nome},family),nome,familia:family,ativo:article?.ativo!==false}}
export async function loadCatalog(db){
 const snap=await getDoc(catalogRef(db));const data=snap.exists()?(snap.data()||{}):{};const existing=data.budget?.inventoryCatalog?.families||{};
 const families=Object.fromEntries(FAMILIES.map(f=>[f,Array.isArray(existing[f])?existing[f].map(x=>normalizeArticle(x,f)):[]]));
 // Compatibilidade de leitura: se o catálogo canónico ainda estiver vazio, apresenta a matriz legada como catálogo.
 // Isto NÃO grava nada no Firebase e permite a migração gradual sem perder os artigos existentes.
 if(families.EPI.length===0&&Array.isArray(data.matriz))families.EPI=data.matriz.map(x=>normalizeArticle({nome:x?.nome||x?.name,preco:x?.preco,riscos:x?.riscos,meses:x?.meses},"EPI")).filter(x=>x.nome);
 return {...data,budget:{...(data.budget||{}),inventoryCatalog:{...(data.budget?.inventoryCatalog||{}),version:1,canonical:true,families}}}
}
export async function saveCatalog(db,data){const families=data?.budget?.inventoryCatalog?.families||{};await setDoc(catalogRef(db),{budget:{...(data.budget||{}),inventoryCatalog:{...(data.budget?.inventoryCatalog||{}),version:1,canonical:true,families}}},{merge:true})}
export function getArticles(data,family="EPI",includeInactive=true){const list=data?.budget?.inventoryCatalog?.families?.[family]||[];return includeInactive?list:list.filter(x=>x.ativo!==false)}
export function findArticle(data,name,family="EPI"){const wanted=normalize(name);return getArticles(data,family).find(x=>normalize(x.nome)===wanted||articleId(x,family)===String(name))}
export function addArticle(data,article,family="EPI"){const normalized=normalizeArticle(article,family);const families=data.budget.inventoryCatalog.families;families[family]||=[];if(families[family].some(x=>normalize(x.nome)===normalize(normalized.nome)))throw new Error("Artigo já existe no Catálogo Mestre.");families[family].push(normalized);return normalized}
export function setArticleActive(data,id,active,family="EPI"){const item=getArticles(data,family).find(x=>articleId(x,family)===String(id));if(!item)throw new Error("Artigo não encontrado no Catálogo Mestre.");item.ativo=Boolean(active);return item}
export function canHardDelete(data,id,family="EPI"){const item=getArticles(data,family).find(x=>articleId(x,family)===String(id));if(!item)return{ok:false,reason:"Artigo não encontrado."};const name=normalize(item.nome);const stock=Object.values(data.stocks||{}).reduce((sum,warehouse)=>{const value=warehouse?.[item.nome];if(typeof value==="number")return sum+Math.max(0,value);return sum+Math.max(0,Number(value?.loose||0))+Object.values(value?.sizes||{}).reduce((s,n)=>s+Math.max(0,Number(n)||0),0)},0);const events=Array.isArray(data.eventos)?data.eventos.filter(e=>normalize(e?.epi)===name).length:0;return stock===0&&events===0?{ok:true}:{ok:false,reason:`O artigo tem stock (${stock}) ou histórico (${events} eventos).`}}
export function hardDeleteArticle(data,id,family="EPI"){const check=canHardDelete(data,id,family);if(!check.ok)throw new Error(check.reason);const item=getArticles(data,family).find(x=>articleId(x,family)===String(id));const name=normalize(item.nome);data.budget.inventoryCatalog.families[family]=getArticles(data,family).filter(x=>articleId(x,family)!==String(id));if(family==="EPI"){data.matriz=(data.matriz||[]).filter(x=>normalize(x?.nome||x?.name)!==name);if(data.epiModels)delete data.epiModels[item.nome];data.budget.management||={};data.budget.management.planning=Object.fromEntries(Object.entries(data.budget.management.planning||{}).filter(([key])=>normalize(key)!==name))}return item}
window.DPMCatalogMaster={articleId,normalizeArticle,loadCatalog,saveCatalog,getArticles,findArticle,addArticle,setArticleActive,canHardDelete,hardDeleteArticle};
