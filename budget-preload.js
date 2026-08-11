import { getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Pré-carrega o documento único usado pelo módulo de orçamento. O mesmo cliente
// Firestore é reutilizado pelo budget-management-clean.js, evitando uma segunda
// ida desnecessária à rede quando a tabela é montada.
const MAIN_DOC = "dpm_epi_data_v1";

window.__dpmBudgetDataPromise = (async () => {
  const apps = getApps();
  if (!apps.length) throw new Error("Firebase ainda não foi inicializado.");
  const db = getFirestore(getApp());
  const snap = await getDoc(doc(db, "appdata", MAIN_DOC));
  if (!snap.exists()) throw new Error("Não foi encontrado o documento principal de dados.");
  return snap.data();
})().catch(error => {
  console.warn("Pré-carregamento do orçamento falhou; o módulo principal fará o carregamento normal.", error);
  return null;
});
