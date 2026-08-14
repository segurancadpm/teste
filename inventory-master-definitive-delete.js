// DPM — Inventário Mestre: eliminação definitiva do artigo.
// Usa os seletores reais do Inventário Geral (data-ig-toggle) e o mesmo
// documento Firebase. Não cria outro catálogo nem outra base de dados.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente", "Portes"];
const db = () => getFirestore(getApp());
const ref = () => doc(db(), "appdata", DOC);
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

function removeArray(arr, name, fields=["name","nome"]) {
  if (!Array.isArray(arr)) return arr;
  return arr.filter(x => !fields.some(f => norm(x?.[f]) === norm(name)));
}

function removeMap(map, name) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return map;
  const out = {};
  for (const [key, value] of Object.entries(map)) {
    if (norm(key) !== norm(name)) out[key] = value;
  }
  return out;
}

function addButtons() {
  const root = document.getElementById("modal-root");
  if (!root) return;
  root.querySelectorAll("[data-ig-toggle]").forEach(toggle => {
    const cell = toggle.closest("td");
    if (!cell || cell.querySelector("[data-definitive-delete]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "danger-link";
    button.dataset.definitiveDelete = "1";
    button.style.display = "block";
    button.style.marginTop = "8px";
    button.textContent = "Apagar definitivamente";
    cell.appendChild(button);
  });
}

async function definitiveDelete(toggle) {
  const row = toggle.closest("tr");
  const name = row?.querySelector("td:first-child strong")?.textContent?.trim();
  if (!name) return;

  const ok = confirm(`APAGAR DEFINITIVAMENTE\n\n"${name}" será removido do Inventário Mestre, matriz, stocks, modelos e orçamento.\n\nAs entregas históricas não serão apagadas.\n\nContinuar?`);
  if (!ok) return;

  try {
    const snap = await getDoc(ref());
    if (!snap.exists()) throw new Error("O documento principal do Firebase não existe.");
    const d = snap.data() || {};
    d.budget ||= {};
    d.budget.inventoryCatalog ||= { families: {} };
    d.budget.inventoryCatalog.families ||= {};

    for (const family of FAMILIES) {
      d.budget.inventoryCatalog.families[family] = removeArray(d.budget.inventoryCatalog.families[family], name);
    }

    if (d.budget.familyCatalog) {
      for (const family of FAMILIES) d.budget.familyCatalog[family] = removeArray(d.budget.familyCatalog[family], name);
    }

    if (d.budget.management?.planning) d.budget.management.planning = removeMap(d.budget.management.planning, name);
    if (d.budget.management?.catalog) {
      d.budget.management.catalog = Array.isArray(d.budget.management.catalog)
        ? removeArray(d.budget.management.catalog, name)
        : removeMap(d.budget.management.catalog, name);
    }
    if (d.budget.items) d.budget.items = removeMap(d.budget.items, name);

    d.matriz = removeArray(d.matriz, name, ["nome"]);
    if (d.epiModels) d.epiModels = removeMap(d.epiModels, name);

    if (d.stocks && typeof d.stocks === "object") {
      for (const [warehouse, stock] of Object.entries(d.stocks)) {
        d.stocks[warehouse] = removeMap(stock, name);
      }
    }

    await setDoc(ref(), {
      budget: d.budget,
      matriz: d.matriz,
      stocks: d.stocks,
      epiModels: d.epiModels
    }, { merge: true });

    // Atualiza imediatamente a janela sem reload e sem deixar a linha antiga visível.
    row.remove();
    alert(`"${name}" foi eliminado definitivamente do Inventário Mestre e do Firebase.`);

    // O Inventário Geral possui o seu próprio reload ao ser fechado/reaberto.
    // Não usamos location.reload() para não interferir com o login ou com a entrega.
  } catch (err) {
    console.error("Eliminação definitiva do inventário:", err);
    alert(`Não foi possível eliminar "${name}".\n\n${err.message || err}`);
  }
}

const root = document.getElementById("modal-root");
if (root) {
  const observer = new MutationObserver(addButtons);
  observer.observe(root, { childList: true, subtree: true });
  addButtons();

  root.addEventListener("click", event => {
    const button = event.target.closest?.("[data-definitive-delete]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const toggle = button.closest("td")?.querySelector("[data-ig-toggle]");
    if (toggle) definitiveDelete(toggle);
  }, true);
}
