// DPM — Catalogação dos dados existentes no Inventário Mestre
// Migra/combina o que já existe no sistema sem apagar histórico.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente", "Portes"];
const ref = () => doc(getFirestore(getApp()), "appdata", DOC);
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

async function migrateExistingInventory() {
  const snap = await getDoc(ref());
  if (!snap.exists()) throw new Error("Não foi encontrado o registo principal de dados.");
  const data = snap.data();
  data.budget ||= {};
  data.budget.management ||= {};
  data.budget.management.planning ||= {};
  data.budget.inventoryCatalog ||= { initialized:true, version:1, families:{} };
  const catalog = data.budget.inventoryCatalog.families ||= {};
  FAMILIES.forEach(f => { if (!Array.isArray(catalog[f])) catalog[f] = []; });

  const added = { EPI:0, Equipamento:0, Ambiente:0, Portes:0 };
  const seen = new Map();
  for (const family of FAMILIES) {
    for (const item of catalog[family]) {
      const key = norm(item?.name);
      if (key) seen.set(`${family}|${key}`, true);
    }
  }

  const add = (family, name, source="catalog") => {
    const clean = String(name ?? "").trim();
    const key = norm(clean);
    if (!clean || !key) return false;
    if (seen.has(`${family}|${key}`)) return false;
    catalog[family].push({ id:`INV-${family}-${Date.now()}-${Math.random().toString(16).slice(2,8)}`, name:clean, active:true, source });
    seen.set(`${family}|${key}`, true);
    added[family] += 1;
    return true;
  };

  // 1) Tudo o que já existe na matriz de EPI passa para a família EPI.
  (Array.isArray(data.matriz) ? data.matriz : []).forEach(e => add("EPI", e?.nome, "core"));

  // 2) Stock existente também é uma fonte de artigos já utilizados.
  Object.values(data.stocks || {}).forEach(stock => {
    Object.keys(stock || {}).forEach(name => add("EPI", name, "stock"));
  });

  // 3) A antiga gestão de famílias é incorporada sem duplicar.
  const legacyFamilies = data.budget.familyCatalog || {};
  for (const family of FAMILIES) {
    (Array.isArray(legacyFamilies[family]) ? legacyFamilies[family] : []).forEach(item => {
      const wasAdded = add(family, item?.name, item?.source || "legacy-family");
      if (!wasAdded) {
        const existing = catalog[family].find(x => norm(x.name) === norm(item?.name));
        if (existing && item?.active === false) existing.active = false;
      }
    });
  }

  // 4) O Planeamento atual também é aproveitado, preservando a família quando existe.
  Object.entries(data.budget.management.planning || {}).forEach(([name, item]) => {
    const family = FAMILIES.includes(item?.family) ? item.family : "EPI";
    add(family, name, "planning");
  });

  // 5) Compras antigas entram no catálogo apenas se ainda não existirem.
  (Array.isArray(data.budget.management.purchases) ? data.budget.management.purchases : []).forEach(p => {
    const family = FAMILIES.includes(p?.family) ? p.family : "EPI";
    add(family, p?.product, "purchase-history");
  });

  data.budget.inventoryCatalog.initialized = true;
  data.budget.inventoryCatalog.version = 2;
  data.budget.inventoryCatalog.migratedAt = new Date().toISOString();
  data.budget.inventoryCatalog.migrationSummary = added;

  await setDoc(ref(), { budget:data.budget }, { merge:true });
  return added;
}

function isSuperAdmin() { return !!document.querySelector('.bottom-nav [data-page="budget"]'); }

function injectMigrationButton() {
  if (!isSuperAdmin()) return;
  const modal = document.querySelector('#modal-root .modal');
  if (!modal || modal.querySelector('[data-catalog-existing]')) return;
  const sections = modal.querySelectorAll('section');
  const target = sections[sections.length - 1] || modal;
  const box = document.createElement('section');
  box.style.cssText = 'margin-top:18px;border-top:1px solid var(--line);padding-top:16px';
  box.innerHTML = `<div class="section-head"><div><h3>Catalogar dados existentes</h3><p class="meta">Importa para o Inventário Mestre os artigos que já existem na matriz, stocks, planeamento e histórico de compras. Não apaga entregas nem compras.</p></div><button type="button" class="primary-btn" data-catalog-existing>Catalogar agora</button></div>`;
  target.after(box);
  box.querySelector('[data-catalog-existing]').addEventListener('click', async () => {
    const btn = box.querySelector('[data-catalog-existing]');
    btn.disabled = true;
    btn.textContent = 'A catalogar…';
    try {
      const result = await migrateExistingInventory();
      const total = Object.values(result).reduce((a,b)=>a+b,0);
      alert(`Catalogação concluída.\n\nForam adicionados ${total} registos ao Inventário Mestre:\nEPI: ${result.EPI}\nEquipamentos: ${result.Equipamento}\nAmbiente: ${result.Ambiente}\nPortes: ${result.Portes}`);
      window.dispatchEvent(new Event('dpm:inventory-changed'));
      btn.textContent = 'Catalogação concluída';
    } catch (e) {
      alert(`Não foi possível catalogar os dados existentes.\n\n${e.message || e}`);
      btn.disabled = false;
      btn.textContent = 'Catalogar agora';
    }
  });
}

new MutationObserver(injectMigrationButton).observe(document.body, { childList:true, subtree:true });
injectMigrationButton();
