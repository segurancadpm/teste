import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Migração não destrutiva: preserva o orçamento antigo e copia os valores
// reconhecíveis para o novo modelo budget.management.planning.
const MAIN_DOC = "dpm_epi_data_v1";

function n(value) {
  const x = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

async function migrate() {
  const apps = getApps();
  if (!apps.length) return;
  const db = getFirestore(getApp());
  const ref = doc(db, "appdata", MAIN_DOC);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const budget = data.budget && typeof data.budget === "object" ? data.budget : {};
  const legacy = budget.items && typeof budget.items === "object" ? budget.items : {};
  const management = budget.management && typeof budget.management === "object" ? budget.management : {};
  const planning = management.planning && typeof management.planning === "object" ? { ...management.planning } : {};

  let changed = false;
  Object.entries(legacy).forEach(([name, item]) => {
    if (planning[name] || !item || typeof item !== "object") return;
    const quantity = n(item.authorizedQty ?? item.quantity ?? item.qty ?? item.quantidade ?? item.limit);
    const unitPrice = n(item.unitPrice ?? item.preco ?? item.price ?? item.precoUnitario);
    planning[name] = { family: "EPI", authorizedQty: quantity, unitPrice };
    changed = true;
  });

  if (!changed) return;
  await setDoc(ref, {
    budget: {
      management: {
        ...management,
        planning,
        legacyPlanningMigratedAt: new Date().toISOString()
      }
    }
  }, { merge: true });
}

migrate().catch(error => console.warn("Migração de orçamento não concluída:", error));
