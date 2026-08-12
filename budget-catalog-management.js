// DPM — Gestão de famílias e listagens do módulo extra de Orçamento
// Exclusivo do Super Admin. Não altera o core de entrega de EPI.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const REF = () => doc(getFirestore(getApp()), "appdata", "dpm_epi_data_v1");
const state = { data: null, families: ["EPI", "Equipamento", "Ambiente", "Portes"] };
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const norm = v => String(v ?? "").trim().replace(/\s+/g, " ");

function isSuperAdmin() {
  return !!document.querySelector('.bottom-nav [data-page="budget"]');
}

async function load() {
  const snap = await getDoc(REF());
  if (!snap.exists()) throw new Error("Não foi encontrado o documento principal.");
  state.data = snap.data();
  state.data.budget ||= {};
  state.data.budget.management ||= {};
  const m = state.data.budget.management;
  m.catalog ||= {};
  state.families.forEach(f => {
    if (!Array.isArray(m.catalog[f])) m.catalog[f] = [];
  });
  // Primeira inicialização: importar apenas nomes únicos existentes no catálogo core.
  const matriz = Array.isArray(state.data.matriz) ? state.data.matriz : [];
  if (!m.catalog.EPI.length && matriz.length) {
    m.catalog.EPI = [...new Set(matriz.map(x => norm(x.nome)).filter(Boolean))];
  }
  return state.data;
}

async function save() {
  await setDoc(REF(), { budget: state.data.budget }, { merge: true });
}

function items(family) {
  const list = state.data?.budget?.management?.catalog?.[family];
  return Array.isArray(list) ? [...list].sort((a,b) => a.localeCompare(b, "pt-PT")) : [];
}

function render() {
  const root = document.getElementById("modal-root");
  if (!root) return;
  const cards = state.families.map(f => `
    <section class="catalog-family-card">
      <div class="catalog-family-head">
        <div><h3>${esc(f)}</h3><span class="meta">${items(f).length} listagem(ns)</span></div>
      </div>
      <div class="catalog-items">
        ${items(f).map(item => `<div class="catalog-item"><span>${esc(item)}</span><button type="button" class="danger-link" data-catalog-delete="${esc(f)}" data-catalog-item="${esc(item)}">Apagar</button></div>`).join("") || '<div class="meta">Sem artigos definidos.</div>'}
      </div>
      <div class="catalog-add-row">
        <input class="input" data-catalog-input="${esc(f)}" placeholder="Adicionar à família ${esc(f)}">
        <button type="button" class="primary" data-catalog-add="${esc(f)}">+ Adicionar</button>
      </div>
    </section>
  `).join("");
  root.innerHTML = `<div class="modal-overlay" data-catalog-overlay>
    <div class="modal" role="dialog" aria-modal="true" style="max-width:900px">
      <div class="modal-head"><div><h2>Gerir famílias e listagens</h2><p class="meta">Aqui defines o que aparece como artigo no módulo de gestão. Os modelos de EPI continuam separados desta lista.</p></div><button type="button" class="icon-btn" data-catalog-close>×</button></div>
      <div class="catalog-grid">${cards}</div>
      <div class="info-box" style="margin-top:14px">Apagar uma listagem aqui <strong>não apaga</strong> entregas, histórico, modelos nem dados do core.</div>
    </div>
  </div>`;
  root.querySelector('[data-catalog-close]')?.addEventListener('click', close);
  root.querySelector('[data-catalog-overlay]')?.addEventListener('click', e => { if (e.target === e.currentTarget) close(); });
  root.querySelectorAll('[data-catalog-add]').forEach(btn => btn.addEventListener('click', () => add(btn.dataset.catalogAdd)));
  root.querySelectorAll('[data-catalog-delete]').forEach(btn => btn.addEventListener('click', () => remove(btn.dataset.catalogDelete, btn.dataset.catalogItem)));
}

function close() {
  const root = document.getElementById("modal-root");
  if (root) root.innerHTML = "";
}

async function add(family) {
  const input = document.querySelector(`[data-catalog-input="${CSS.escape(family)}"]`);
  const value = norm(input?.value);
  if (!value) return;
  try {
    await load();
    const list = state.data.budget.management.catalog[family];
    if (list.some(x => x.toLowerCase() === value.toLowerCase())) {
      alert("Essa listagem já existe nesta família.");
      return;
    }
    list.push(value);
    await save();
    await load();
    render();
  } catch (error) {
    console.error(error);
    alert(`Não foi possível adicionar a listagem.\n\n${error.message || error}`);
  }
}

async function remove(family, item) {
  try {
    await load();
    const list = state.data.budget.management.catalog[family] || [];
    if (!list.includes(item)) return;
    if (!confirm(`Apagar "${item}" da família ${family}?\n\nO histórico existente não será apagado.`)) return;
    state.data.budget.management.catalog[family] = list.filter(x => x !== item);
    await save();
    await load();
    render();
  } catch (error) {
    console.error(error);
    alert(`Não foi possível apagar a listagem.\n\n${error.message || error}`);
  }
}

async function open() {
  try { await load(); render(); }
  catch (error) { alert(`Não foi possível abrir a gestão de listagens.\n\n${error.message || error}`); }
}

function installButton() {
  if (!isSuperAdmin()) return;
  const root = document.querySelector('.budget-management-root');
  if (!root || root.querySelector('[data-open-catalog-manager]')) return;
  const buttons = root.querySelectorAll('button');
  const host = [...buttons].find(b => b.textContent.trim() === 'Guardar planeamento')?.parentElement
    || root.querySelector('.section-head')
    || root;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ghost-btn';
  btn.dataset.openCatalogManager = '1';
  btn.textContent = '⚙ Gerir listagens';
  btn.style.marginInlineStart = '8px';
  host.appendChild(btn);
  btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open(); });
}

const observer = new MutationObserver(installButton);
observer.observe(document.body, { childList:true, subtree:true });
installButton();
