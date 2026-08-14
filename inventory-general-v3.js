// DPM — Inventário Geral v3
// Gestão manual e simples do catálogo comum ao Armazém e ao Orçamento.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente", "Portes"];
const state = { data:null, family:"EPI", open:false, loading:false };
const db = () => getFirestore(getApp());
const ref = () => doc(db(), "appdata", DOC);
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g," ").trim();
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const num = v => { const n = Number(String(v ?? "").replace(",",".")); return Number.isFinite(n) ? n : 0; };
const money = v => new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"}).format(num(v));
function ensure(){
  if(!state.data || typeof state.data !== "object") state.data = {};
  state.data.budget ||= {}; state.data.budget.management ||= {}; state.data.budget.management.planning ||= {};
  state.data.stocks ||= {}; state.data.warehouses ||= ["DPM Norte","DPM Sul","DPM Algarve"]; state.data.matriz ||= [];
  state.data.epiModels ||= {}; state.data.budget.inventoryCatalog ||= {families:{}}; state.data.budget.inventoryCatalog.families ||= {};
  FAMILIES.forEach(f => state.data.budget.inventoryCatalog.families[f] ||= []);
}
function catalog(){ ensure(); return state.data.budget.inventoryCatalog.families; }
function items(f=state.family){ return catalog()[f] || []; }
function models(name){ ensure(); return Array.isArray(state.data.epiModels[name]) ? state.data.epiModels[name] : []; }
function activeItems(f){ return items(f).filter(x=>x.active!==false); }
function allNamesInCatalog(){ return new Set(FAMILIES.flatMap(f=>items(f).map(x=>norm(x.name)))); }
function catalogExisting(){
  ensure(); const seen = allNamesInCatalog();
  const addPending = (name, source) => { const clean = String(name ?? "").trim(); if(!clean || seen.has(norm(clean))) return;
    catalog().EPI.push({id:`INV-${Date.now()}-${Math.random().toString(16).slice(2,8)}`, name:clean, active:true, source, needsClassification:true}); seen.add(norm(clean)); };
  state.data.matriz.forEach(x=>addPending(x?.nome,"core"));
  Object.values(state.data.stocks).forEach(s=>Object.keys(s||{}).forEach(n=>addPending(n,"stock")));
  const old = state.data.budget.familyCatalog || {};
  FAMILIES.forEach(f=>(Array.isArray(old[f])?old[f]:[]).forEach(x=>{ const clean=String(x?.name ?? x?.nome ?? "").trim(); if(clean && !seen.has(norm(clean))){
    catalog().EPI.push({id:`INV-${Date.now()}-${Math.random().toString(16).slice(2,8)}`,name:clean,active:true,source:"lista-antiga",needsClassification:true}); seen.add(norm(clean)); }}));
  state.data.budget.inventoryCatalog.version = 7; state.data.budget.inventoryCatalog.initialized = true;
}
async function load(){ const snap = await getDoc(ref()); state.data = snap.exists() ? (snap.data() || {}) : {}; ensure(); catalogExisting(); }
async function save(){ ensure(); await setDoc(ref(), {budget:state.data.budget, matriz:state.data.matriz, stocks:state.data.stocks, epiModels:state.data.epiModels},{merge:true}); }
function priceFor(name){ const matrix = state.data.matriz.find(x=>norm(x?.nome)===norm(name)); return num(matrix?.preco ?? state.data.budget.management.planning?.[name]?.unitPrice); }
function familyBadgeClass(f){ return f === "EPI" ? "blue" : "ok"; }
function familyCount(f){ return activeItems(f).length; }
function close(){ state.open=false; const root=document.getElementById("modal-root"); if(root) root.innerHTML=""; }
function render(){
  ensure(); const root=document.getElementById("modal-root"); if(!root) return; const list=items(); const pending=FAMILIES.flatMap(f=>items(f)).filter(x=>x.needsClassification===true);
  root.innerHTML=`<div class="inventory-general-overlay" data-ig-overlay><div class="inventory-general-shell" role="dialog" aria-modal="true"><div class="inventory-general-content">
    <div class="modal-head"><div><h2>Inventário Geral</h2><p class="meta">Aqui decides o que cada artigo é. Esta é a lista comum ao Armazém e ao Orçamento.</p></div><button type="button" class="icon-btn" data-close>×</button></div>
    <div class="family-tabs">${FAMILIES.map(f=>`<button type="button" class="ghost-btn ${state.family===f?'active':''}" data-family="${f}">${f} <span class="badge ${familyBadgeClass(f)}">${familyCount(f)}</span></button>`).join("")}</div>
    <section class="section" style="padding:14px;margin-bottom:14px"><div class="section-head"><div><h3>Catalogação</h3><p class="meta">${pending.length} artigo(s) ainda por classificar. Os artigos existentes são aproveitados automaticamente.</p></div><button type="button" class="ghost-btn" data-refresh-catalog>↻ Atualizar lista</button></div>${pending.length ? `<div class="budget-help">Escolhe a família na coluna <strong>Família</strong>. Ao guardar, o artigo sai de “por classificar” e passa para a família escolhida.</div>` : `<div class="budget-help">Todos os artigos encontrados já estão classificados. Podes adicionar ou mover artigos.</div>`}</section>
    <section class="section" style="padding:14px"><div class="section-head"><div><h3>${state.family}</h3><p class="meta">${activeItems(state.family).length} ativos · ${list.length} registos</p></div><span class="badge ${familyBadgeClass(state.family)}">Família</span></div>
      <div class="table-wrap"><table class="budget-table"><thead><tr><th>Artigo</th><th>Família</th><th>Estado</th><th>Preço ref.</th><th>${state.family==='EPI'?'Modelos':''}</th><th>Ação</th></tr></thead><tbody>
      ${list.map((x,i)=>`<tr><td><strong>${esc(x.name)}</strong><br><span class="meta">${esc(x.source||'manual')}${x.needsClassification?' · por classificar':''}</span></td><td><select class="select" data-move="${i}" style="min-width:145px">${FAMILIES.map(f=>`<option value="${f}" ${f===state.family?'selected':''}>${f}</option>`).join('')}</select></td><td><span class="badge ${x.active===false?'danger':'ok'}">${x.active===false?'Inativo':'Ativo'}</span></td><td>${money(priceFor(x.name))}</td><td>${state.family==='EPI'?`<button type="button" class="ghost-btn" data-models="${i}">${models(x.name).filter(m=>m.ativo!==false).length} modelo(s)</button>`:''}</td><td><button type="button" class="danger-link" data-toggle="${i}">${x.active===false?'Ativar':'Desativar'}</button><button type="button" class="danger-link" data-delete="${i}" style="margin-left:10px">Apagar definitivamente</button></td></tr>`).join('') || `<tr><td colspan="6">Não existem artigos nesta família.</td></tr>`}</tbody></table></div></section>
    <section class="section" style="padding:14px;margin-top:14px"><div class="section-head"><div><h3>Adicionar artigo</h3><p class="meta">Escolhe logo a família. Não é criado em listas paralelas.</p></div></div><div class="field-row" style="display:grid;grid-template-columns:1fr 180px 170px;gap:8px"><input class="input" id="ig-name" placeholder="Nome do artigo"><select class="select" id="ig-family">${FAMILIES.map(f=>`<option value="${f}" ${f===state.family?'selected':''}>${f}</option>`).join('')}</select><input class="input" id="ig-price" type="number" min="0" step="0.01" placeholder="Preço (€)"></div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button type="button" class="primary-btn" data-add>+ Adicionar ao inventário</button></div></section>
    </div></div></div>`;
  root.querySelector('[data-close]')?.addEventListener('click',close); root.querySelector('[data-ig-overlay]')?.addEventListener('click',e=>{if(e.target===e.currentTarget)close();});
  root.querySelectorAll('[data-family]').forEach(b=>b.addEventListener('click',()=>{state.family=b.dataset.family;render();})); root.querySelector('[data-refresh-catalog]')?.addEventListener('click',async()=>{await load();render();}); root.querySelector('[data-add]')?.addEventListener('click',addItem);
  root.querySelectorAll('[data-move]').forEach(sel=>sel.addEventListener('change',()=>moveItem(Number(sel.dataset.move),sel.value))); root.querySelectorAll('[data-toggle]').forEach(b=>b.addEventListener('click',()=>toggleItem(Number(b.dataset.toggle)))); root.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>deleteItem(Number(b.dataset.delete)))); root.querySelectorAll('[data-models]').forEach(b=>b.addEventListener('click',()=>showModels(Number(b.dataset.models))));
}
async function addItem(){ ensure(); const root=document.getElementById('modal-root'); const name=root?.querySelector('#ig-name')?.value.trim()||''; const fam=root?.querySelector('#ig-family')?.value||'EPI'; const price=num(root?.querySelector('#ig-price')?.value); if(!name)return alert('Indica o nome do artigo.'); if(FAMILIES.some(f=>items(f).some(x=>norm(x.name)===norm(name))))return alert('Esse artigo já existe no Inventário Geral.'); catalog()[fam].push({id:`INV-${Date.now()}`,name,active:true,source:'manual',needsClassification:false});
  if(fam==='EPI'){let epi=state.data.matriz.find(x=>norm(x.nome)===norm(name)); if(!epi)state.data.matriz.push({nome:name,riscos:'',meses:12,preco:price}); else if(price)epi.preco=price; state.data.warehouses.forEach(w=>{state.data.stocks[w] ||= {}; state.data.stocks[w][name] ||= {loose:0,sizes:{}};});}
  try{await save();render();}catch(e){alert(`Não foi possível adicionar o artigo.\n\n${e.message||e}`)}
}
async function moveItem(index,targetFamily){ const sourceFamily=state.family,source=items(sourceFamily),item=source[index]; if(!item||targetFamily===sourceFamily)return; if(items(targetFamily).some(x=>norm(x.name)===norm(item.name)))return alert('Esse artigo já existe na família de destino.'); source.splice(index,1); item.needsClassification=false; items(targetFamily).push(item); try{await save();state.family=targetFamily;render();}catch(e){items(sourceFamily).push(item);alert(`Não foi possível mover o artigo.\n\n${e.message||e}`)} }
async function toggleItem(index){ const x=items()[index]; if(!x)return; const old=x.active!==false; x.active=!old; x.needsClassification=false; try{await save();render();}catch(e){x.active=old;alert(`Não foi possível alterar o artigo.\n\n${e.message||e}`)} }
async function deleteItem(index){
  const x=items()[index]; if(!x)return;
  const name=String(x.name||'').trim(); if(!name)return;
  if(!confirm(`Apagar definitivamente "${name}"?\n\nO artigo será removido do Inventário Mestre, matriz, stocks, modelos e orçamento.\n\nAs entregas históricas permanecem para auditoria.\n\nEsta ação não pode ser desfeita.`))return;
  try{
    const current=state.data;
    const families=current.budget.inventoryCatalog.families||{};
    FAMILIES.forEach(f=>{if(Array.isArray(families[f]))families[f]=families[f].filter(y=>norm(y?.name)!==norm(name));});
    current.budget.inventoryCatalog.families=families;
    if(current.budget.familyCatalog&&typeof current.budget.familyCatalog==='object')FAMILIES.forEach(f=>{if(Array.isArray(current.budget.familyCatalog[f]))current.budget.familyCatalog[f]=current.budget.familyCatalog[f].filter(y=>norm(y?.name)!==norm(name));});
    if(current.budget.management?.catalog){current.budget.management.catalog=Array.isArray(current.budget.management.catalog)?current.budget.management.catalog.filter(y=>!['name','nome','product'].some(k=>norm(y?.[k])===norm(name))):Object.fromEntries(Object.entries(current.budget.management.catalog).filter(([k])=>norm(k)!==norm(name)));}
    if(current.budget.management?.planning)current.budget.management.planning=Object.fromEntries(Object.entries(current.budget.management.planning).filter(([k])=>norm(k)!==norm(name)));
    if(Array.isArray(current.budget.management?.purchases))current.budget.management.purchases=current.budget.management.purchases.filter(p=>![p?.product,p?.name,p?.nome].some(v=>norm(v)===norm(name)));
    if(current.budget.items)current.budget.items=Object.fromEntries(Object.entries(current.budget.items).filter(([k])=>norm(k)!==norm(name)));
    if(Array.isArray(current.matriz)&&state.family==='EPI')current.matriz=current.matriz.filter(e=>norm(e?.nome)!==norm(name));
    if(current.epiModels&&state.family==='EPI')current.epiModels=Object.fromEntries(Object.entries(current.epiModels).filter(([k])=>norm(k)!==norm(name)));
    if(current.stocks&&state.family==='EPI')Object.keys(current.stocks).forEach(w=>{if(current.stocks[w]&&typeof current.stocks[w]==='object')current.stocks[w]=Object.fromEntries(Object.entries(current.stocks[w]).filter(([k])=>norm(k)!==norm(name)));});
    await save();
    render();
    alert(`"${name}" foi apagado definitivamente.`);
  }catch(e){alert(`Não foi possível apagar o artigo.\n\n${e.message||e}`);}
}
function showModels(index){
  if(state.family!=="EPI")return; const epi=items('EPI')[index]; if(!epi)return; const list=models(epi.name); const root=document.getElementById('modal-root');
  root.innerHTML=`<div class="inventory-general-overlay"><div class="inventory-general-shell"><div class="inventory-general-content"><div class="modal-head"><div><h2>Modelos — ${esc(epi.name)}</h2><p class="meta">Os modelos pertencem ao EPI. Na entrega fica registado o modelo escolhido.</p></div><button type="button" class="icon-btn" data-back>×</button></div><div class="table-wrap"><table class="budget-table"><thead><tr><th>Modelo</th><th>Preço</th><th>Tamanhos</th><th></th></tr></thead><tbody>${list.map((m,i)=>`<tr><td>${esc(m.nome)}</td><td>${money(m.preco)}</td><td>${esc((m.tamanhos||[]).join(', '))}</td><td><button class="danger-link" data-del="${i}">Apagar</button></td></tr>`).join('')||'<tr><td colspan="4">Ainda não existem modelos.</td></tr>'}</tbody></table></div><section style="margin-top:18px"><h3>Novo modelo</h3><div class="field-row two"><input class="input" id="m-name" placeholder="Modelo"><input class="input" id="m-price" type="number" min="0" step="0.01" placeholder="Preço (€)"></div><div class="field-row"><input class="input" id="m-sizes" placeholder="Tamanhos: 40, 41, 42"></div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="primary-btn" data-m-add>+ Adicionar modelo</button></div></section></div></div></div>`;
  root.querySelector('[data-back]')?.addEventListener('click',render); root.querySelector('[data-m-add]')?.addEventListener('click',async()=>{const name=root.querySelector('#m-name').value.trim(),price=num(root.querySelector('#m-price').value),sizes=root.querySelector('#m-sizes').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);if(!name)return alert('Indica o modelo.');state.data.epiModels[epi.name] ||= [];if(state.data.epiModels[epi.name].some(m=>norm(m.nome)===norm(name)))return alert('Esse modelo já existe.');state.data.epiModels[epi.name].push({id:`MODEL-${Date.now()}`,nome:name,preco:price,tamanhos:sizes,ativo:true});try{await save();showModels(index)}catch(e){alert(`Não foi possível guardar o modelo.\n\n${e.message||e}`)}}); root.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{const i=Number(b.dataset.del);if(!confirm(`Apagar o modelo \"${list[i]?.nome||''}\"?`))return;const backup=[...list];list.splice(i,1);try{await save();showModels(index)}catch(e){state.data.epiModels[epi.name]=backup;alert(`Não foi possível apagar o modelo.\n\n${e.message||e}`)}}));
}
async function openManager(){ if(state.loading)return; state.loading=true; try{await load();state.open=true;render()}catch(e){console.error('Inventário Geral',e);alert(`Não foi possível abrir o Inventário Geral.\n\n${e.message||e}`)}finally{state.loading=false} }
function start(){ window.addEventListener('dpm:open-inventory',openManager); }
start();