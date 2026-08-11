import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MAIN_DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente"];
const CATEGORIES = {
  EPI: ["Vestuário", "Calçado", "Cabeça", "Olhos/Face", "Audição", "Respiração", "Mãos", "Quedas", "Corpo", "Outros EPI"],
  Equipamento: ["Deteção/medição", "Sinalização", "Emergência", "Ferramentas", "Acessórios", "Outros equipamentos"],
  Ambiente: ["Resíduos", "Produtos químicos", "Absorção/derrames", "Manutenção", "Consumíveis", "Outros ambiente"]
};

// Lista fixa que a DPM usa recorrentemente. O conteúdo dentro de cada nome-mãe é editável.
const MASTER_EPI = [
  ["POLOS MANGA CURTA", "Vestuário", []],
  ["POLOS MANGA COMPRIDA", "Vestuário", []],
  ["CALÇAS DE TRABALHO", "Vestuário", []],
  ["PARKA IMPERMEÁVEL ALTA VISIBILIDADE", "Vestuário", ["Baixa visibilidade", "Chuva/intempérie", "Exposição ao frio"]],
  ["CASACO POLAR", "Vestuário", ["Exposição ao frio"]],
  ["COLETE DE ALTA VISIBILIDADE", "Vestuário", ["Baixa visibilidade"]],
  ["SAPATO DE SEGURANÇA", "Calçado", ["Queda de objetos", "Esmagamento dos pés", "Perfuração", "Escorregamento"]],
  ["CAPACETE + FRANCALETE", "Cabeça", ["Queda de objetos", "Impacto na cabeça"]],
  ["OCULOS PROTEÇÃO", "Olhos/Face", ["Projeção de partículas", "Poeiras", "Salpicos"]],
  ["PROTETORES AUDITIVOS", "Audição", ["Exposição ao ruído"]],
  ["MASCARA PROTEÇÃO ABEK1 OU BLS", "Respiração", ["Inalação de poeiras", "Gases/vapores, conforme filtro", "Aerossóis/partículas, conforme filtro"]],
  ["AVENTAL PROTEÇÃO", "Corpo", ["Salpicos", "Contacto com sujidade/contaminantes"]],
  ["LUVAS PROTEÇÃO MECÂNICA", "Mãos", ["Cortes", "Abrasão", "Perfuração", "Riscos mecânicos"]],
  ["LUVAS PROTEÇÃO QUÍMICA", "Mãos", ["Contacto com produtos químicos"]],
  ["LUVAS NITRILO", "Mãos", ["Contacto com contaminantes", "Contacto com determinados produtos químicos, conforme modelo"]],
  ["GALOCHAS", "Calçado", ["Humidade", "Salpicos", "Contacto com contaminantes, conforme modelo", "Escorregamento"]],
  ["FATO PESCADOR", "Corpo", ["Humidade", "Salpicos", "Contacto com sujidade/contaminantes"]],
  ["FATO IMPERMEÁVEL", "Corpo", ["Chuva/intempérie", "Humidade"]],
  ["FATO TYVEK", "Corpo", ["Poeiras/partículas", "Salpicos", "Contacto com contaminantes, conforme modelo"]],
  ["ARNÊS + CORDAS + ABS ENERGIA", "Quedas", ["Queda em altura"]]
];

let db;
let catalog = [];
let modalOpen = false;
const getDb = () => { if (db) return db; if (!getApps().length) throw new Error("Firebase ainda não foi inicializado."); db = getFirestore(getApp()); return db; };
const ref = () => doc(getDb(), "appdata", MAIN_DOC);
const norm = v => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const list = v => String(v || "").split(/[;\n]/).map(x => x.trim()).filter(Boolean);
const money = v => Number(v || 0).toLocaleString("pt-PT", {style:"currency", currency:"EUR"});
const validCategory = (f,c) => CATEGORIES[f]?.includes(c) ? c : CATEGORIES[f][0];

function css(){
 if(document.getElementById("dpm-catalog-v3-css")) return;
 const s=document.createElement("style"); s.id="dpm-catalog-v3-css"; s.textContent=`
.dpmc-bg{position:fixed;inset:0;z-index:3000;background:rgba(3,10,15,.70);display:grid;place-items:center;padding:18px}.dpmc{width:min(1180px,97vw);max-height:92vh;overflow:auto;background:#f7fbfd;color:#123047;border:1px solid #c8d7df;border-radius:14px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.3);font-family:Outfit,Arial,sans-serif}.dpmc-head{display:flex;justify-content:space-between;gap:15px}.dpmc h2{margin:0 0 4px}.dpmc-muted{font-size:13px;color:#617783}.dpmc-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:15px 0 10px}.dpmc-tab,.dpmc-btn{border:1px solid #b9ccd5;background:#fff;color:#17364b;border-radius:8px;padding:8px 12px;font-weight:800;cursor:pointer}.dpmc-tab.active,.dpmc-btn.primary{background:#00a3e0;color:#fff;border-color:#00a3e0}.dpmc-toolbar{display:grid;grid-template-columns:1fr 180px 180px;gap:8px;margin-bottom:12px}.dpmc input,.dpmc select,.dpmc textarea{box-sizing:border-box;width:100%;border:1px solid #aec2cc;border-radius:7px;padding:8px;background:#fff;color:#122d3d}.dpmc-table{border:1px solid #cbd9df;border-radius:10px;overflow:hidden;background:#fff}.dpmc-row{display:grid;grid-template-columns:1.45fr 155px 1.1fr 80px;gap:12px;padding:11px 13px;border-bottom:1px solid #dce5e9;align-items:center}.dpmc-row:last-child{border-bottom:0}.dpmc-row.head{font-size:11px;text-transform:uppercase;font-weight:800;color:#55707d;background:#f2f7f9}.dpmc-chip{display:inline-block;border:1px solid #d3dfe4;border-radius:20px;padding:3px 7px;margin:2px;font-size:11px;color:#8d3e00}.dpmc-edit{display:none;grid-column:1/-1;background:#edf7fb;padding:12px;border-top:1px solid #d2e1e7}.dpmc-edit.open{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.dpmc-edit label{font-size:12px;font-weight:800;color:#4b6672}.dpmc-full{grid-column:1/-1}.dpmc-add{display:none;grid-template-columns:1.5fr 150px 170px 120px auto;gap:7px;padding:12px;background:#eef7fb;border:1px solid #d0e0e6;border-radius:10px;margin-bottom:12px}.dpmc-add.open{display:grid}.dpmc-manage{display:inline-block;margin-left:9px}.dpmc-small{font-size:12px;color:#607783}@media(max-width:850px){.dpmc-toolbar,.dpmc-add.open,.dpmc-edit.open{grid-template-columns:1fr}.dpmc-row{grid-template-columns:1fr}.dpmc-row.head{display:none}.dpmc-manage{margin-left:0}}
`;
 document.head.appendChild(s);
}

async function load(){ const snap=await getDoc(ref()); if(!snap.exists()) throw new Error("Documento principal não encontrado."); const data=snap.data(); if(!Array.isArray(data.matriz)) data.matriz=[]; return data; }

function build(data){
 const saved=Array.isArray(data.catalogMaster)?data.catalogMaster:[]; const map=new Map(saved.map(x=>[norm(x.nome),x]));
 for(const [name,cat,hazards] of MASTER_EPI){
  const k=norm(name), old=map.get(k), match=data.matriz.find(x=>norm(x?.nome)===k||norm(x?.nomeMae)===k);
  if(!old) map.set(k,{id:`epi-${k.toLowerCase().replace(/ /g,"-")}`,nome:name,familia:"EPI",categoria:cat,preco:Number(match?.preco||0),perigos:[...hazards],modelos:[],ativo:true});
  else { old.familia=old.familia||"EPI"; old.categoria=validCategory(old.familia,old.categoria||cat); old.preco=Number(old.preco||0); old.perigos=Array.isArray(old.perigos)&&old.perigos.length?old.perigos:[...hazards]; old.modelos=Array.isArray(old.modelos)?old.modelos:[]; old.ativo=old.ativo!==false; }
 }
 return [...map.values()];
}

async function save(data){
 await setDoc(ref(),{catalogMaster:catalog},{merge:true});
 const matriz=(data.matriz||[]).map(x=>({...x})); let changed=false;
 for(const c of catalog){ for(const m of matriz.filter(x=>norm(x?.nome)===norm(c.nome)||norm(x?.nomeMae)===norm(c.nome))){ if(!m.familia){m.familia=c.familia;changed=true;} if(!m.categoria){m.categoria=c.categoria;changed=true;} if(!m.nomeMae){m.nomeMae=c.nome;changed=true;} if(!Array.isArray(m.perigos)||!m.perigos.length){m.perigos=[...(c.perigos||[])];changed=true;} } }
 if(changed) await setDoc(ref(),{matriz},{merge:true});
 data.matriz=matriz;
}

function syncPurchase(){
 const root=document.querySelector(".budget-management-root"), fam=root?.querySelector("#purchase-family"), sel=root?.querySelector("#purchase-epi");
 if(!fam||!sel||fam.value!=="EPI") return;
 const old=sel.value, active=catalog.filter(x=>x.familia==="EPI"&&x.ativo!==false);
 sel.innerHTML=`<option value="">Selecionar EPI</option>`+active.map(x=>`<option value="${esc(x.nome)}">${esc(x.nome)}</option>`).join(""); if(active.some(x=>x.nome===old))sel.value=old;
 if(!fam.dataset.dpmcBound){fam.dataset.dpmcBound="1";fam.addEventListener("change",()=>setTimeout(syncPurchase,0));}
}

function addButton(){
 const root=document.querySelector(".budget-management-root"); if(!root||!root.querySelector("#purchase-family")||root.querySelector("[data-dpmc-open]"))return;
 const h=root.querySelector(".budget-view .budget-card h3")||root.querySelector(".budget-view h3"); if(!h)return;
 const span=document.createElement("span");span.className="dpmc-manage";span.innerHTML=`<button type="button" class="dpmc-btn" data-dpmc-open>⚙ Gerir catálogo</button>`;h.parentElement.appendChild(span);span.querySelector("button").addEventListener("click",open);
}

function editor(item,row,data){
 const e=document.createElement("div");e.className="dpmc-edit open";
 const models=(item.modelos||[]).map(m=>`${m.nome||""} | ${m.preco||0} | ${m.referencia||""}`).join("\n");
 e.innerHTML=`<label>Família<select data-f>${FAMILIES.map(f=>`<option ${f===item.familia?"selected":""}>${f}</option>`).join("")}</select></label><label>Categoria<select data-c>${CATEGORIES[item.familia].map(c=>`<option ${c===item.categoria?"selected":""}>${esc(c)}</option>`).join("")}</select></label><label>Preço base (€)<input data-p type="number" min="0" step="0.01" value="${Number(item.preco||0)}"></label><label class="dpmc-full">Nome-mãe<input data-n value="${esc(item.nome)}"></label><label class="dpmc-full">Perigos / proteções<textarea data-h>${esc((item.perigos||[]).join("; "))}</textarea></label><label class="dpmc-full">Modelos / variantes — Nome | Preço | Referência<textarea data-m placeholder="Dortmund | 58,20 | REF123">${esc(models)}</textarea></label><label>Estado<select data-a><option value="true" ${item.ativo!==false?"selected":""}>Ativo</option><option value="false" ${item.ativo===false?"selected":""}>Inativo</option></select></label><div><button class="dpmc-btn primary" data-save>Guardar</button></div>`;
 row.after(e);
 e.querySelector("[data-f]").addEventListener("change",ev=>{const f=ev.target.value;e.querySelector("[data-c]").innerHTML=CATEGORIES[f].map(c=>`<option>${esc(c)}</option>`).join("");});
 e.querySelector("[data-save]").addEventListener("click",async()=>{
  const f=e.querySelector("[data-f]").value; item.familia=f; item.categoria=validCategory(f,e.querySelector("[data-c]").value); item.nome=e.querySelector("[data-n]").value.trim()||item.nome; item.preco=Number(e.querySelector("[data-p]").value||0); item.perigos=list(e.querySelector("[data-h]").value); item.ativo=e.querySelector("[data-a]").value!=="false"; item.modelos=list(e.querySelector("[data-m]").value).map(line=>{const p=line.split("|").map(x=>x.trim());return {nome:p[0]||"",preco:Number(String(p[1]||"0").replace(",","."))||0,referencia:p[2]||""};}).filter(x=>x.nome); try{await save(data);render(data);}catch(err){alert(`Não foi possível guardar: ${err?.message||err}`);}
 });
}

function render(data,filter="Todos",search=""){
 const area=document.querySelector(".dpmc-table");if(!area)return;
 const rows=catalog.filter(x=>(filter==="Todos"||x.familia===filter)&&(!search||`${x.nome} ${(x.modelos||[]).map(m=>m.nome).join(" ")}`.toLocaleLowerCase("pt-PT").includes(search.toLocaleLowerCase("pt-PT"))));
 area.innerHTML=`<div class="dpmc-row head"><div>Nome-mãe</div><div>Família / categoria</div><div>Perigos automáticos</div><div></div></div>`;
 rows.forEach(item=>{const r=document.createElement("div");r.className="dpmc-row";const chips=(item.perigos||[]).map(p=>`<span class="dpmc-chip">${esc(p)}</span>`).join("");const models=(item.modelos||[]).map(m=>m.nome).filter(Boolean);r.innerHTML=`<div><strong>${esc(item.nome)}</strong><div class="dpmc-small">${models.length?`${models.length} modelo(s): ${esc(models.join(", "))}`:"Sem modelo definido"}</div></div><div>${esc(item.familia)}<br><span class="dpmc-small">${esc(item.categoria)}</span></div><div>${chips||`<span class="dpmc-small">Sem perigo específico definido</span>`}</div><div><button class="dpmc-btn" data-edit>Editar</button></div>`;area.appendChild(r);r.querySelector("[data-edit]").addEventListener("click",()=>{if(r.nextElementSibling?.classList.contains("dpmc-edit"))r.nextElementSibling.remove();else editor(item,r,data);});});
 if(!rows.length)area.innerHTML+=`<div class="dpmc-row"><div>Não existem artigos nesta seleção.</div></div>`;
}

function open(){
 if(modalOpen)return;modalOpen=true;css();load().then(data=>{catalog=build(data);const bg=document.createElement("div");bg.className="dpmc-bg";bg.innerHTML=`<div class="dpmc"><div class="dpmc-head"><div><h2>Catálogo mestre</h2><div class="dpmc-muted">Lista recorrente: dentro de cada nome-mãe podes alterar preços, modelos/variantes e perigos.</div></div><button class="dpmc-btn" data-close>Fechar</button></div><div class="dpmc-tabs"><button class="dpmc-tab active" data-filter="Todos">Todos (${catalog.length})</button>${FAMILIES.map(f=>`<button class="dpmc-tab" data-filter="${f}">${f} (${catalog.filter(x=>x.familia===f).length})</button>`).join("")}</div><div class="dpmc-toolbar"><input data-search placeholder="Pesquisar nome-mãe ou modelo"><select data-cat><option>Todos</option>${CATEGORIES.EPI.map(c=>`<option>${esc(c)}</option>`).join("")}</select><button class="dpmc-btn primary" data-add>+ Adicionar nome-mãe</button></div><div class="dpmc-add"><input data-new-name placeholder="Nome principal"><select data-new-family>${FAMILIES.map(f=>`<option>${f}</option>`).join("")}</select><select data-new-cat></select><input data-new-price type="number" min="0" step="0.01" placeholder="Preço base €"><button class="dpmc-btn primary" data-create>Criar</button></div><div class="dpmc-table"></div><p class="dpmc-muted" style="margin-top:12px">Os perigos predefinidos são sugestões automáticas e ficam sempre editáveis. Artigos com histórico não são apagados fisicamente.</p></div>`;document.body.appendChild(bg);
 const add=bg.querySelector(".dpmc-add"), nf=bg.querySelector("[data-new-family]"), nc=bg.querySelector("[data-new-cat]");const fill=()=>nc.innerHTML=CATEGORIES[nf.value].map(c=>`<option>${esc(c)}</option>`).join("");fill();nf.addEventListener("change",fill);bg.querySelector("[data-add]").addEventListener("click",()=>add.classList.toggle("open"));bg.querySelector("[data-close]").addEventListener("click",()=>{bg.remove();modalOpen=false;});
 let filter="Todos";const doRender=()=>render(data,filter,bg.querySelector("[data-search]").value);bg.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;bg.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));doRender();}));bg.querySelector("[data-search]").addEventListener("input",doRender);bg.querySelector("[data-create]").addEventListener("click",async()=>{const name=bg.querySelector("[data-new-name]").value.trim();if(!name)return alert("Indica o nome-mãe.");if(catalog.some(x=>norm(x.nome)===norm(name)))return alert("Esse nome-mãe já existe.");const f=nf.value;catalog.push({id:`custom-${Date.now()}`,nome:name,familia:f,categoria:validCategory(f,nc.value),preco:Number(bg.querySelector("[data-new-price]").value||0),perigos:[],modelos:[],ativo:true});try{await save(data);add.classList.remove("open");render(data);}catch(e){catalog.pop();alert(`Não foi possível criar: ${e?.message||e}`);}});render(data);}).catch(e=>{alert(`Não foi possível carregar o catálogo: ${e?.message||e}`);modalOpen=false;});
}

async function boot(){try{const data=await load();catalog=build(data);if(!Array.isArray(data.catalogMaster))await setDoc(ref(),{catalogMaster:catalog},{merge:true});syncPurchase();addButton();}catch(e){console.warn("Catálogo mestre:",e);}}
const observer=new MutationObserver(()=>{syncPurchase();addButton();});observer.observe(document.documentElement,{childList:true,subtree:true});
boot();
