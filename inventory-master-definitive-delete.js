// DPM — Inventário Mestre: eliminação definitiva
// O botão é tratado fora do fluxo de renderização do Inventário Geral.
// Não usa links/anchors e não permite que outros handlers mudem o scroll.
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
  return Object.fromEntries(Object.entries(value).filter(([key]) => norm(key) !== norm(name)));
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
    const actionCell = row.querySelector("td:last-child");
    if (!name || !actionCell || row.querySelector("[data-definitive-delete-v3]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "danger-link";
    button.dataset.definitiveDeleteV3 = "1";
    button.textContent = "Apagar definitivamente";
    button.title = "Eliminar este artigo definitivamente do Firebase";
    button.setAttribute("aria-label", `Apagar definitivamente ${name}`);
    button.style.display = "inline-block";
    button.style.marginLeft = "10px";
    button.style.cursor = "pointer";
    actionCell.appendChild(button);
  });
}
async function deleteArticle(button) {
  const row = button.closest("tr");
  const name = getRowName(row);
  if (!row || !name) return;
  const scrollY = window.scrollY;
  const ok = window.confirm(`APAGAR DEFINITIVAMENTE\n\n"${name}" será removido do Inventário Mestre, catálogo, matriz, stocks, modelos e orçamento.\n\nAs entregas históricas permanecem para auditoria.\n\nContinuar?`);
  if (!ok) {
    window.scrollTo({ top: scrollY, behavior: "instant" });
    return;
  }
  button.disabled = true;
  button.textContent = "A apagar…";
  try {
    const snap = await getDoc(dataRef());
    if (!snap.exists()) throw new Error("O documento principal do Firebase não existe.");
    const d = snap.data() || {};
    d.budget ||= {};
    d.budget.management ||= {};
    d.budget.management.planning ||= {};
    d.budget.inventoryCatalog ||= {};
    d.budget.inventoryCatalog.families ||= {};
    for (const family of FAMILIES) {
      d.budget.inventoryCatalog.families[family] = removeArrayByName(d.budget.inventoryCatalog.families[family], name);
    }
    if (d.budget.familyCatalog && typeof d.budget.familyCatalog === "object") {
      for (const family of FAMILIES) d.budget.familyCatalog[family] = removeArrayByName(d.budget.familyCatalog[family], name);
    }
    if (d.budget.management.catalog) {
      d.budget.management.catalog = Array.isArray(d.budget.management.catalog)
        ? removeArrayByName(d.budget.management.catalog, name)
        : removeMapKey(d.budget.management.catalog, name);
    }
    d.budget.management.planning = removeMapKey(d.budget.management.planning, name);
    if (Array.isArray(d.budget.management.purchases)) {
      d.budget.management.purchases = d.budget.management.purchases.filter(p =>
        ![p?.product, p?.name, p?.nome].some(v => norm(v) === norm(name))
      );
    }
    if (d.budget.items) d.budget.items = removeMapKey(d.budget.items, name);
    d.matriz = removeArrayByName(d.matriz, name, ["nome", "name"]);
    d.epiModels = removeMapKey(d.epiModels, name);
    if (d.stocks && typeof d.stocks === "object") {
      for (const [warehouse, stock] of Object.entries(d.stocks)) d.stocks[warehouse] = removeMapKey(stock, name);
    }
    await setDoc(dataRef(), {
      budget: d.budget,
      matriz: d.matriz,
      stocks: d.stocks,
      epiModels: d.epiModels
    }, { merge: true });
    row.remove();
    window.scrollTo({ top: scrollY, behavior: "instant" });
    alert(`"${name}" foi apagado definitivamente.`);
  } catch (error) {
    console.error("[DPM] Erro ao apagar artigo:", error);
    button.disabled = false;
    button.textContent = "Apagar definitivamente";
    window.scrollTo({ top: scrollY, behavior: "instant" });
    alert(`Não foi possível apagar o artigo.\n\n${error?.message || error}`);
  }
}

function handleDeleteEvent(event) {
  const button = event.target?.closest?.("[data-definitive-delete-v3]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  // Impede que o foco do botão ou outro handler provoque um salto de scroll.
  try { button.focus({ preventScroll: true }); } catch (_) { button.focus(); }
  if (event.type === "click") deleteArticle(button);
}

document.addEventListener("pointerdown", handleDeleteEvent, true);
document.addEventListener("mousedown", handleDeleteEvent, true);
document.addEventListener("click", handleDeleteEvent, true);

const observer = new MutationObserver(() => addDeleteButtons());
observer.observe(document.body, { childList: true, subtree: true });
addDeleteButtons();
