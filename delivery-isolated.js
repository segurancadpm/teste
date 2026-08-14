// DPM — Entrega isolada
// Fluxo autónomo: Artigo → Modelo → Tamanho → Quantidade → Assinatura.
// Não usa listeners globais de change/submit e não depende do render() do app.js.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DB_DOC = "dpm_epi_data_v1";
const db = () => getFirestore(getApp());
const ref = () => doc(db(), "appdata", DB_DOC);
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const money = v => new Intl.NumberFormat("pt-PT", { style:"currency", currency:"EUR" }).format(Number(v || 0));
const today = () => new Date().toISOString().slice(0,10);
const addMonths = (date, months) => { const d = new Date(date); d.setMonth(d.getMonth()+Number(months||0)); return d.toISOString().slice(0,10); };

let data = null;
let open = false;

async function load(){
  const s = await getDoc(ref());
  data = s.exists() ? (s.data() || {}) : {};
  data.matriz = Array.isArray(data.matriz) ? data.matriz : [];
  data.trabalhadores = Array.isArray(data.trabalhadores) ? data.trabalhadores : [];
  data.eventos = Array.isArray(data.eventos) ? data.eventos : [];
  data.stocks ||= {};
  data.epiModels ||= {};
  data.warehouses = Array.isArray(data.warehouses) ? data.warehouses : [];
  return data;
}

function models(epi){
  const list = Array.isArray(data.epiModels?.[epi]) ? data.epiModels[epi] : [];
  return list.filter(m => m && m.ativo !== false);
}

function stockRec(warehouse, epi){
  data.stocks[warehouse] ||= {};
  let r = data.stocks[warehouse][epi];
  if(typeof r === "number") r = { loose:r, sizes:{} };
  if(!r || typeof r !== "object") r = { loose:0, sizes:{} };
  r.loose = Number(r.loose ?? r.semTamanho ?? 0);
  r.sizes ||= {};
  r.models ||= {};
  data.stocks[warehouse][epi] = r;
  return r;
}

function modelStock(warehouse, epi, model){
  const r = stockRec(warehouse, epi);
  if(!model) return r;
  r.models ||= {};
  const key = String(model.nome || model.id || "");
  r.models[key] ||= { loose:0, sizes:{} };
  r.models[key].loose = Number(r.models[key].loose || 0);
  r.models[key].sizes ||= {};
  return r.models[key];
}

function sizesFor(warehouse, epi, model){
  const configured = Array.isArray(model?.tamanhos) ? model.tamanhos : [];
  const ms = modelStock(warehouse, epi, model);
  const existing = Object.keys(ms.sizes || {});
  return [...new Set([...configured, ...existing].map(x => String(x).trim().toUpperCase()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"pt-PT",{numeric:true}));
}

function available(warehouse, epi, model, size){
  const r = modelStock(warehouse, epi, model);
  const k = String(size || "").trim().toUpperCase();
  return k ? Number(r.sizes[k] || 0) : Number(r.loose || 0);
}

function removeStock(warehouse, epi, model, qty, size){
  const r = modelStock(warehouse, epi, model);
  const k = String(size || "").trim().toUpperCase();
  if(k) r.sizes[k] = Math.max(0, Number(r.sizes[k] || 0) - Number(qty || 0));
  else r.loose = Math.max(0, Number(r.loose || 0) - Number(qty || 0));
}

function worker(){
  const name = document.querySelector('.detail-header h1')?.textContent?.trim() || '';
  return data.trabalhadores.find(w => norm(w.nome) === norm(name));
}

function itemRow(epiName, warehouse){
  const epi = data.matriz.find(e => e.nome === epiName) || data.matriz[0];
  const ms = models(epi?.nome);
  return `<div class="delivery-item iso-delivery-item">
    <div class="field-row"><select class="select" name="epi"><option value="">Selecionar EPI</option>${data.matriz.map(e=>`<option value="${esc(e.nome)}" ${e.nome===epi?.nome?'selected':''}>${esc(e.nome)}</option>`).join('')}</select></div>
    <div class="field-row"><select class="select" name="model" ${ms.length?'':'disabled'}>${ms.length?'<option value="">Selecionar modelo</option>'+ms.map(m=>`<option value="${esc(m.id||m.nome)}">${esc(m.nome)}${m.preco?` · ${money(m.preco)}`:''}</option>`).join(''):'<option value="">Sem modelo configurado</option>'}</select></div>
    <div class="field-row two"><select class="select" name="size"><option value="">Sem tamanho</option></select><input class="input" name="qty" type="number" min="1" value="1" required></div>
    <div class="field-row"><input class="input" name="months" type="number" min="1" value="${Number(epi?.meses||12)}" required></div>
    <div class="info-box iso-info"></div>
    <div style="display:flex;justify-content:flex-end"><button class="ghost-btn" type="button" data-iso-remove>Remover</button></div>
  </div>`;
}

function refresh(row, warehouse){
  const epiSel = row.querySelector('[name="epi"]');
  const modelSel = row.querySelector('[name="model"]');
  const sizeSel = row.querySelector('[name="size"]');
  if(!epiSel || !modelSel || !sizeSel) return;
  const epi = data.matriz.find(e=>e.nome===epiSel.value) || data.matriz[0];
  const list = models(epi?.nome);
  const currentModel = modelSel.value;
  modelSel.innerHTML = list.length ? '<option value="">Selecionar modelo</option>'+list.map(m=>`<option value="${esc(m.id||m.nome)}">${esc(m.nome)}${m.preco?` · ${money(m.preco)}`:''}</option>`).join('') : '<option value="">Sem modelo configurado</option>';
  modelSel.disabled = !list.length;
  if(currentModel && list.some(m=>String(m.id||m.nome)===String(currentModel))) modelSel.value=currentModel;
  const chosen = list.find(m=>String(m.id||m.nome)===String(modelSel.value));
  const sizes = sizesFor(warehouse, epi?.nome, chosen);
  sizeSel.innerHTML = '<option value="">Sem tamanho</option>'+sizes.map(s=>`<option value="${esc(s)}">${esc(s)} (${available(warehouse,epi.nome,chosen,s)})</option>`).join('');
  row.querySelector('[name="months"]').value = Number(epi?.meses||12);
  row.querySelector('.iso-info').textContent = `Riscos: ${epi?.riscos||'—'} · ${chosen?`Modelo: ${chosen.nome} · ${money(chosen.preco||0)}`:'Selecione o modelo'} · Validade estimada: ${new Date(addMonths(new Date(), Number(epi?.meses||12))).toLocaleDateString('pt-PT')}`;
}

function signaturePad(canvas){
  const ratio=Math.max(devicePixelRatio||1,1), box=canvas.getBoundingClientRect();
  canvas.width=Math.max(1,Math.floor(box.width*ratio)); canvas.height=Math.max(1,Math.floor(box.height*ratio));
  const c=canvas.getContext('2d'); c.scale(ratio,ratio); c.lineCap='round'; c.lineJoin='round'; c.lineWidth=3; c.strokeStyle='#ffc35a';
  const strokes=[]; let cur=null, drawing=false;
  const point=e=>{const b=canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top}};
  canvas.addEventListener('pointerdown',e=>{drawing=true;cur={points:[]};strokes.push(cur);const p=point(e);cur.points.push(p);c.beginPath();c.moveTo(p.x,p.y);canvas.setPointerCapture?.(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();const p=point(e);cur.points.push(p);c.lineTo(p.x,p.y);c.stroke()});
  const stop=()=>{drawing=false;cur=null}; canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);canvas.addEventListener('pointerleave',stop);
  return {strokes,clear:()=>{strokes.length=0;c.clearRect(0,0,canvas.width,canvas.height)}};
}

function signature(payload){
  const root=document.getElementById('modal-root');
  root.innerHTML=`<section class="kiosk"><header><div><h1>Assinatura do Trabalhador</h1><p class="meta">${esc(payload.worker.nome)}<br>${payload.items.map(i=>`${esc(i.epi.nome)}${i.model?` · ${esc(i.model.nome)}`:''}${i.size?` · Tam. ${esc(i.size)}`:''} · Qtd ${i.qty}`).join('<br>')}</p></div><button class="ghost-btn" type="button" data-iso-cancel>Cancelar</button></header><div><p class="legal">Declaro ter recebido os EPIs indicados, em bom estado, comprometendo-me a utilizá-los corretamente.</p><label class="signature-label">Assine abaixo</label><canvas class="signature-pad" id="iso-sign"></canvas></div><div class="kiosk-actions"><button class="ghost-btn" type="button" data-iso-clear>Limpar</button><button class="ghost-btn" type="button" data-iso-nosign>Sem assinatura</button><button class="primary-btn" type="button" data-iso-confirm>Continuar → Rubrica</button></div></section>`;
  const pad=signaturePad(document.getElementById('iso-sign'));
  root.querySelector('[data-iso-clear]').onclick=()=>pad.clear();
  root.querySelector('[data-iso-cancel]').onclick=()=>root.innerHTML='';
  root.querySelector('[data-iso-nosign]').onclick=()=>rubrica({...payload,workerSig:null,noSign:true});
  root.querySelector('[data-iso-confirm]').onclick=()=>rubrica({...payload,workerSig:pad.strokes.length?pad.strokes:null,noSign:false});
}

function rubrica(payload){
  const root=document.getElementById('modal-root');
  root.innerHTML=`<section class="kiosk"><header><div><h1>Rubrica de Quem Entrega</h1><p class="meta">${esc(payload.worker.nome)}</p></div><button class="ghost-btn" type="button" data-iso-cancel>Cancelar</button></header><div><p class="legal">Confirmo a entrega dos EPIs ao trabalhador.</p><label class="signature-label">Assine abaixo</label><canvas class="signature-pad" id="iso-sign"></canvas></div><div class="kiosk-actions"><button class="ghost-btn" type="button" data-iso-clear>Limpar</button><button class="ghost-btn" type="button" data-iso-nosign>Sem assinatura</button><button class="primary-btn" type="button" data-iso-save>Confirmar e Guardar</button></div></section>`;
  const pad=signaturePad(document.getElementById('iso-sign'));
  root.querySelector('[data-iso-clear]').onclick=()=>pad.clear();
  root.querySelector('[data-iso-cancel]').onclick=()=>root.innerHTML='';
  root.querySelector('[data-iso-nosign]').onclick=()=>save({...payload,delivererSig:null,noSign:true});
  root.querySelector('[data-iso-save]').onclick=()=>save({...payload,delivererSig:pad.strokes.length?pad.strokes:null,noSign:payload.noSign||false});
}

async function save(payload){
  try{
    const batch=`DEL-${Date.now()}-${Math.random().toString(16).slice(2,8)}`;
    await Promise.all(payload.items.map(i=>addDoc(collection(db(),'deliveries'),{batch_id:batch,worker_id:payload.worker.id,worker_nome:payload.worker.nome,epi_type:i.epi.nome,model_id:i.model?.id||'',model_name:i.model?.nome||'',qtd:i.qty,tamanho:String(i.size||'').toUpperCase(),delivery_date:today(),validity_date:i.validity,riscos:i.epi.riscos||'',responsavel:payload.responsavel,sem_assinatura:!!payload.noSign,signature_points_trabalhador:payload.workerSig||null,signature_points_entregador:payload.delivererSig||null,unit_price:Number(i.model?.preco??i.epi.preco??0),total_cost:Number(i.qty)*Number(i.model?.preco??i.epi.preco??0),created_at:Date.now()})));
    data.eventos ||= [];
    data.eventos.forEach(e=>{if(e.idTrab===payload.worker.id&&e.tipo==='ENTREGA'&&e.statusAlerta==='ATIVO'&&payload.items.some(i=>norm(i.epi.nome)===norm(e.epi)&&norm(i.model?.nome||'')===norm(e.modelo||''))){e.statusAlerta='BAIXA';e.estado='Baixa por nova entrega'}});
    payload.items.forEach(i=>{removeStock(payload.worker.delegacao,i.epi.nome,i.model,i.qty,i.size);data.eventos.push({id:`EVT-${Date.now()}-${Math.random().toString(16).slice(2,8)}`,idTrab:payload.worker.id,data:new Date().toLocaleDateString('pt-PT'),tipo:'ENTREGA',epi:i.epi.nome,modelo:i.model?.nome||'',modelo_id:i.model?.id||'',qtd:i.qty,tamanho:String(i.size||'').toUpperCase(),armazem:payload.worker.delegacao,estado:'Entregue',statusAlerta:'ATIVO',validade:i.validity,responsavel:payload.responsavel,assinado:!payload.noSign});});
    await setDoc(ref(),{stocks:data.stocks,eventos:data.eventos},{merge:true});
    document.getElementById('modal-root').innerHTML='';
    alert('Entrega guardada com modelo, tamanho e quantidade.');
  }catch(e){console.error('DPM entrega isolada',e);alert(`Não foi possível guardar a entrega.\n\n${e.message||e}`)}
}

async function openDelivery(){
  if(open)return; open=true;
  try{
    await load();
    const w=worker(); if(!w) throw new Error('Não foi possível identificar o trabalhador selecionado.');
    const root=document.getElementById('modal-root'); if(!root) throw new Error('Janela de entrega indisponível.');
    root.innerHTML=`<div class="modal-overlay"><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>Registar Entrega</h2><p class="meta">${esc(w.nome)} · ${esc(w.delegacao)}</p></div><button class="icon-btn" type="button" data-iso-close>×</button></div><form id="iso-delivery-form"><div id="iso-items">${itemRow(data.matriz[0]?.nome||'',w.delegacao)}</div><button type="button" class="ghost-btn" id="iso-add">+ EPI</button><div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="primary-btn" type="submit">Continuar → Recolher Assinatura</button></div></form></div></div>`;
    const form=root.querySelector('#iso-delivery-form');
    root.querySelectorAll('.iso-delivery-item').forEach(r=>refresh(r,w.delegacao));
    root.querySelector('[data-iso-close]').onclick=()=>{root.innerHTML='';open=false};
    root.querySelector('#iso-add').onclick=()=>{const holder=root.querySelector('#iso-items');holder.insertAdjacentHTML('beforeend',itemRow('',w.delegacao));const row=holder.lastElementChild;refresh(row,w.delegacao);bindRow(row,w.delegacao)};
    bindRow(root.querySelector('.iso-delivery-item'),w.delegacao);
    form.addEventListener('submit',e=>{e.preventDefault();e.stopPropagation();const items=[...form.querySelectorAll('.iso-delivery-item')].map(row=>{const epi=data.matriz.find(x=>x.nome===row.querySelector('[name="epi"]').value);const m=models(epi?.nome).find(x=>String(x.id||x.nome)===String(row.querySelector('[name="model"]').value));const qty=Number(row.querySelector('[name="qty"]').value||0);const size=row.querySelector('[name="size"]').value;const months=Number(row.querySelector('[name="months"]').value||epi?.meses||12);return{epi,model:m||null,qty,size,validity:addMonths(new Date(),months)}}).filter(i=>i.epi&&i.qty>0);if(!items.length){alert('Adicione pelo menos uma entrega.');return}if(items.some(i=>models(i.epi.nome).length&&!i.model)){alert('Selecione o modelo de todos os EPI que têm modelos configurados.');return}if(items.some(i=>available(w.delegacao,i.epi.nome,i.model,i.size)<i.qty)){alert('Não existe stock suficiente para uma ou mais linhas.');return}signature({worker:w,items,responsavel:document.querySelector('.user-chip span:last-child')?.textContent?.trim()||'SuperAdmin'});});
  }catch(e){console.error('DPM entrega isolada',e);document.getElementById('modal-root').innerHTML='';alert(`Não foi possível abrir a entrega.\n\n${e.message||e}`);open=false}
}

function bindRow(row,warehouse){
  if(!row)return;
  row.querySelector('[name="epi"]')?.addEventListener('change',()=>refresh(row,warehouse));
  row.querySelector('[name="model"]')?.addEventListener('change',()=>refresh(row,warehouse));
  row.querySelector('[data-iso-remove]')?.addEventListener('click',()=>{const rows=document.querySelectorAll('.iso-delivery-item');if(rows.length>1)row.remove()});
}

// Apenas o botão que abre a entrega é capturado globalmente. Depois de aberta,
// todos os eventos ficam ligados diretamente ao formulário isolado.
document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-modal="delivery"]');
  if(!btn)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openDelivery();
},true);

window.DPMDeliveryIsolated={version:()=>2};