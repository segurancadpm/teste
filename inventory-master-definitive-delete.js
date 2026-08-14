// DPM — Inventário Mestre: eliminação definitiva do artigo.
// Remove o artigo do catálogo mestre, matriz, stocks, modelos e catálogos
// de orçamento no mesmo documento Firestore. O histórico de entregas NÃO é
// apagado, para não destruir o registo/auditoria de entregas já efetuadas.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente", "Portes"];
const db = () => getFirestore(getApp());
const ref = () => doc(db(), "appdata", DOC);
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

function removeFromArray(arr, name, fields=["name","nome"]) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(x => !fields.some(f => norm(x?.[f]) === norm(name)));
}

function removeFromMap(map, name) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return map;
  const out = {};
  Object.entries(map).forEach(([k,v]) => { if (norm(k) !== norm(name)) out[k] = v; });
  return out;
}

function injectButtons() {
  const root = document.getElementById("modal-root");
  const shell = root?.querySelector(".inventory-general-shell");
  if (!shell) return;
  const rows = shell.querySelectorAll("table.budget-table tbody tr");
  rows.forEach(row => {
    const toggle = row.querySelector("[data-toggle]");
    if (!toggle || row.querySelector("[data-definitive-delete]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "danger-link";
    button.dataset.definitiveDelete = "1";
    button.style.marginLeft = "10px";
    button.textContent = "Apagar definitivamente";
    button.addEventListener("click", () => definitiveDelete(row));
    toggle.parentElement?.appendChild(button);
  });
}

async function definitiveDelete(row) {
  const name = row.querySelector("td strong")?.textContent?.trim();
  if (!name) return;
  const ok = confirm(`APAGAR DEFINITIVAMENTE\n\n"${name}" será removido do Inventário Mestre, matriz, stocks, modelos e orçamento.\n\nEsta ação não apaga o histórico de entregas já registadas.\n\nContinuar?`);
  if (!ok) return;
  try {
    const snap = await getDoc(ref());
    if (!snap.exists()) throw new Error("O documento principal do Firebase não existe.");
    const d = snap.data() || {};
    d.budget ||= {};
    d.budget.inventoryCatalog ||= {families:{}};
    d.budget.inventoryCatalog.families ||= {};
    FAMILIES.forEach(f => { d.budget.inventoryCatalog.families[f] = removeFromArray(d.budget.inventoryCatalog.families[f], name); });
    d.budget.familyCatalog ||= {};
    FAMILIES.forEach(f => { d.budget.familyCatalog[f] = removeFromArray(d.budget.familyCatalog[f], name); });
    if (d.budget.management?.planning) d.budget.management.planning = removeFromMap(d.budget.management.planning, name);
    if (d.budget.management?.catalog) {
      if (Array.isArray(d.budget.management.catalog)) d.budget.management.catalog = removeFromArray(d.budget.management.catalog, name);
      else d.budget.management.catalog = removeFromMap(d.budget.management.catalog, name);
    }
    if (d.budget.items) d.budget.items = removeFromMap(d.budget.items, name);
    d.matriz = removeFromArray(d.matriz, name, ["nome"]);
    if (d.epiModels) d.epiModels = removeFromMap(d.epiModels, name);
    if (d.stocks && typeof d.stocks === "object") {
      Object.entries(d.stocks).forEach(([warehouse, stock]) => { d.stocks[warehouse] = removeFromMap(stock, name); });
    }
    await setDoc(ref(), {budget:d.budget, matriz:d.matriz, stocks:d.stocks, epiModels:d.epiModels}, {merge:true});
    alert(`"${name}" foi eliminado definitivamente do Inventário Mestre e do documento principal Firebase.`);
    const refresh = document.querySelector("#modal-root [data-refresh-catalog]");
    if (refresh) refresh.click();
  } catch (err) {
    console.error("Eliminação definitiva do inventário:", err);
    alert(`Não foi possível eliminar "${name}".\n\n${err.message || err}`);
  }
}

const root = document.getElementById("modal-root");
if (root) new MutationObserver(injectButtons).observe(root, {childList:true, subtree:true});
setTimeout(injectButtons, 700);
