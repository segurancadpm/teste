// DPM Enterprise Data Migration v1
// Executa apenas quando explicitamente chamado. Nunca migra dados automaticamente.
import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  MODEL_VERSION, normalizeArticle, normalizePurchase, normalizePlanningEntry,
  workerId, validateData
} from "./enterprise-data-model.js";

const MAIN_DOC = "dpm_epi_data_v1";

function db() {
  if (!getApps().length) throw new Error("Firebase ainda não foi inicializado.");
  return getFirestore(getApp());
}

export async function auditCurrentData() {
  const snap = await getDoc(doc(db(), "appdata", MAIN_DOC));
  if (!snap.exists()) throw new Error("Documento principal não encontrado.");
  const data = snap.data();
  return {
    exists: true,
    modelVersion: data?.meta?.modelVersion || 0,
    errors: validateData(data),
    articles: Array.isArray(data?.matriz) ? data.matriz.length : 0,
    workers: Array.isArray(data?.trabalhadores) ? data.trabalhadores.length : 0,
    purchases: Array.isArray(data?.budget?.management?.purchases) ? data.budget.management.purchases.length : 0
  };
}

export async function migrateCurrentData({ dryRun = true } = {}) {
  const ref = doc(db(), "appdata", MAIN_DOC);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Documento principal não encontrado.");

  const data = snap.data();
  const articles = (Array.isArray(data.matriz) ? data.matriz : []).map(normalizeArticle);
  const workers = (Array.isArray(data.trabalhadores) ? data.trabalhadores : []).map(worker => ({
    ...worker,
    id: workerId(worker)
  }));
  const budget = data.budget && typeof data.budget === "object" ? { ...data.budget } : {};
  const management = budget.management && typeof budget.management === "object" ? { ...budget.management } : {};
  const purchases = (Array.isArray(management.purchases) ? management.purchases : []).map(normalizePurchase);
  const planning = management.planning && typeof management.planning === "object"
    ? Object.fromEntries(Object.entries(management.planning).map(([name, entry]) => [name, normalizePlanningEntry(name, entry)]))
    : {};

  const migrated = {
    ...data,
    matriz: articles,
    trabalhadores: workers,
    budget: {
      ...budget,
      management: {
        ...management,
        planning,
        purchases
      }
    },
    meta: {
      ...(data.meta || {}),
      modelVersion: MODEL_VERSION,
      lastMigration: new Date().toISOString(),
      migrationTool: "enterprise-migration-v1"
    }
  };

  const beforeErrors = validateData(data);
  const afterErrors = validateData(migrated);
  const result = {
    dryRun,
    beforeErrors,
    afterErrors,
    articlesChanged: articles.length,
    workersChanged: workers.length,
    purchasesChanged: purchases.length
  };

  if (!dryRun) {
    await setDoc(ref, migrated, { merge: false });
    await setDoc(doc(db(), "appdata", `${MAIN_DOC}_audit`), {
      type: "DATA_MIGRATION",
      modelVersion: MODEL_VERSION,
      executedAt: serverTimestamp(),
      result
    }, { merge: true });
  }
  return result;
}
