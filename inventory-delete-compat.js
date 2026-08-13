// DPM — Inventário: eliminação persistente e compatível
// Este módulo intercepta apenas o botão de apagar do Inventário Geral.
// Não executa migrações automáticas e não altera dados com stock/histórico.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente", "Portes"];
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const ref = () => doc(getFirestore(getApp()), "appdata", DOC);

function stockTotal(stocks, name){
  let total = 0;
  Object.values(stocks || {}).forEach(w => {
    const r = w?.[name];
    if (typeof r === "number") total += num(r);
    else {
      total += num(r?.loose);
      Object.values(r?.sizes || {}).forEach(v => total += num(v));
    }
  });
  return total;
}

function nameFromButton(button){
  const row = button.closest("tr");
  return row?.querySelector("td strong")?.textContent?.trim() || "";
}

function familyFromButton(button){
  const select = button.closest("tr")?.querySelector("[data-move]");
  const value = select?.value;
  return FAMILIES.includes(value) ? value : "EPI";
}

async function removePersistently(name, family){
  const db = getFirestore(getApp());
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref());
    if (!snap.exists()) return;
    const x = snap.data() || {};
    const budget = { ...(x.budget || {}) };
    const inv = { ...(budget.inventoryCatalog || {}) };
    const families = { ...(inv.families || {}) };
    const current = Array.isArray(families[family]) ? families[family] : [];
    families[family] = current.filter(i => norm(i?.name) !== norm(name));
    inv.families = families;
    // Tombstone: impede catalogExisting() de recriar um artigo eliminado a partir de listas legadas.
    const deleted = { ...(inv.deleted || {}) };
    deleted[norm(name)] = { name, deletedAt: new Date().toISOString(), family };
    inv.deleted = deleted;
    inv.version = Math.max(Number(inv.version) || 0, 8);
    budget.inventoryCatalog = inv;
    if (Array.isArray(x.matriz)) x.matriz = x.matriz.filter(i => norm(i?.nome) !== norm(name));
    const epiModels = { ...(x.epiModels || {}) };
    if (family === "EPI") delete epiModels[name];
    const stocks = { ...(x.stocks || {}) };
    Object.keys(stocks).forEach(w => {
      const copy = { ...(stocks[w] || {}) };
      delete copy[name];
      stocks[w] = copy;
    });
    tx.set(ref(), { budget, matriz: x.matriz || [], epiModels, stocks }, { merge: true });
  });
}

async function handle(button){
  const name = nameFromButton(button);
  if (!name) return;
  const family = familyFromButton(button);
  const snap = await getDoc(ref());
  const data = snap.exists() ? snap.data() || {} : {};
  const stock = stockTotal(data.stocks, name);
  const events = Array.isArray(data.eventos) ? data.eventos.filter(e => norm(e?.epi) === norm(name)) : [];
  if (stock || events.length) {
    alert(`Não posso apagar "${name}" porque existem dados associados.\n\nStock: ${stock}\nEventos: ${events.length}\n\nO histórico fica protegido.`);
    return;
  }
  if (!confirm(`Apagar definitivamente "${name}"?\n\nEste artigo não tem stock nem eventos no sistema.`)) return;
  try {
    await removePersistently(name, family);
    // Atualiza o ecrã sem recarregar a página inteira.
    const row = button.closest("tr");
    row?.remove();
    alert(`"${name}" foi apagado do Inventário Geral.`);
  } catch (error) {
    console.error("Erro ao apagar artigo:", error);
    alert(`Não foi possível apagar "${name}".\n\n${error.message || error}`);
  }
}

// Captura antes do listener original do Inventário para evitar a implementação antiga,
// que podia recriar o artigo através das listas legadas.
document.addEventListener("click", event => {
  const button = event.target.closest?.("[data-delete-item]");
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  handle(button);
}, true);

// Limpa visualmente artigos que tenham tombstone quando o modal é re-renderizado.
// Não toca em documentos que não tenham sido marcados como eliminados.
