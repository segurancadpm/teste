// DPM — Inventário Mestre: eliminação definitiva
// Ligação direta à UI atual do Inventário Geral.
// Mantém o mesmo documento Firebase e não interfere com Entregas/Armazém.
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente", "Portes"];
const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const db = () => getFirestore(getApp());
const dataRef = () => doc(db(), "appdata", DOC);

function removeArrayByName(value, name, fields = ["name", "nome", "product"]) {
  if (!Array.isArray(value)) return value;
  return value.filter(item => !fields.some(field => norm(item?.[field]) === norm(name)));
}

function removeMapKey(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (norm(key) !== norm(name)) out[key] = item;
  }
  return out;
}

function getRowName(row) {
  return row?.querySelector("td:first-child strong")?.textContent?.trim() ||
         row?.querySelector("td:first-child")?.textContent?.trim() || "";
}

function inventoryModal() {
  return [...document.querySelectorAll("#modal-root .modal")]
    .find(el => /Inventário Geral/i.test(el.querySelector("h2")?.textContent || ""));
}

function addDeleteButtons() {
  const modal = inventoryModal();
  if (!modal) return;

  modal.querySelectorAll("tbody tr").forEach(row => {
    const name = getRowName(row);
    if (!name || row.querySelector("[data-definitive-delete-v2]")) return;
    const actionCell = row.querySelector("td:last-child");
    if (!actionCell) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "danger-link";
    button.dataset.definitiveDeleteV2 = "1";
    button.textContent = "Eliminar definitivamente";
    button.title = "Eliminar este artigo do catálogo e dos dados de stock";
    button.style.display = "block";
    button.style.marginTop = "6px";
    actionCell.appendChild(button);
  });
}

async function deleteArticle(button) {
  const row = button.closest("tr");
  const name = getRowName(row);
  if (!name) {
    alert("Não foi possível identificar o artigo.");
    return;
  }

  if (!confirm(`ELIMINAR DEFINITIVAMENTE\n\n"${name}" será removido do Inventário Mestre, catálogo, matriz, stocks, modelos e orçamento.\n\nAs entregas históricas não serão alteradas.\n\nContinuar?`)) return;

  button.disabled = true;
  button.textContent = "A eliminar…";

  try {
    const snap = await getDoc(dataRef());
    if (!snap.exists()) throw new Error("O documento principal do Firebase não existe.");

    const d = snap.data() || {};
    d.budget ||= {};
    d.budget.management ||= {};
    d.budget.management.planning ||= {};
    d.budget.inventoryCatalog ||= {};
    d.budget.inventoryCatalog.families ||= {};

    // Fonte principal do Inventário Mestre.
    for (const family of FAMILIES) {
      d.budget.inventoryCatalog.families[family] = removeArrayByName(
        d.budget.inventoryCatalog.families[family], name
      );
    }

    // Catálogos antigos que poderiam voltar a recriar o artigo.
    if (d.budget.familyCatalog && typeof d.budget.familyCatalog === "object") {
      for (const family of FAMILIES) {
        d.budget.familyCatalog[family] = removeArrayByName(d.budget.familyCatalog[family], name);
      }
    }

    if (d.budget.management.catalog) {
      d.budget.management.catalog = Array.isArray(d.budget.management.catalog)
        ? removeArrayByName(d.budget.management.catalog, name)
        : removeMapKey(d.budget.management.catalog, name);
    }

    if (d.budget.management.planning) {
      d.budget.management.planning = removeMapKey(d.budget.management.planning, name);
    }

    // Compras também alimentavam a migração do Inventário Geral e podiam fazer o artigo reaparecer.
    if (Array.isArray(d.budget.management.purchases)) {
      d.budget.management.purchases = d.budget.management.purchases.filter(p =>
        ![p?.product, p?.name, p?.nome].some(v => norm(v) === norm(name))
      );
    }

    if (d.budget.items) d.budget.items = removeMapKey(d.budget.items, name);

    // Estruturas EPI centrais.
    d.matriz = removeArrayByName(d.matriz, name, ["nome", "name"]);
    d.epiModels = removeMapKey(d.epiModels, name);

    // Stock dos armazéns.
    if (d.stocks && typeof d.stocks === "object") {
      for (const [warehouse, stock] of Object.entries(d.stocks)) {
        d.stocks[warehouse] = removeMapKey(stock, name);
      }
    }

    await setDoc(dataRef(), {
      budget: d.budget,
      matriz: d.matriz,
      stocks: d.stocks,
      epiModels: d.epiModels
    }, { merge: true });

    // Remove imediatamente da UI. Não faz reload da aplicação.
    row.remove();
    alert(`"${name}" foi eliminado do Firebase e deixou de existir no Inventário Mestre.`);
  } catch (error) {
    console.error("[DPM] Erro ao eliminar artigo:", error);
    button.disabled = false;
    button.textContent = "Eliminar definitivamente";
    alert(`Não foi possível eliminar o artigo.\n\n${error?.message || error}`);
  }
}

// Delegação no document em captura: funciona mesmo quando o Inventário Geral recria o modal.
document.addEventListener("click", event => {
  const button = event.target?.closest?.("[data-definitive-delete-v2]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  deleteArticle(button);
}, true);

// O Inventário Geral recria o HTML ao mudar família/abrir modelos; reaplica apenas o botão.
const observer = new MutationObserver(addDeleteButtons);
observer.observe(document.body, { childList: true, subtree: true });
addDeleteButtons();
