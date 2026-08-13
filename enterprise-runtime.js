// DPM Enterprise Runtime v1
// Read-only monitor. It never changes business data automatically.
import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { validateData } from "./enterprise-data-model.js";
import { auditCurrentData, migrateCurrentData } from "./enterprise-migration.js";

const MAIN_DOC = "dpm_epi_data_v1";

function db() {
  if (!getApps().length) throw new Error("Firebase não inicializado.");
  return getFirestore(getApp());
}

function badge(status, detail = "") {
  let el = document.querySelector("#dpm-data-integrity");
  if (!el) {
    el = document.createElement("div");
    el.id = "dpm-data-integrity";
    el.setAttribute("role", "status");
    el.style.cssText = "position:fixed;right:12px;bottom:76px;z-index:190;font:600 11px/1.2 system-ui,sans-serif;padding:7px 10px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:#101820;color:#b9cbd4;box-shadow:0 4px 16px rgba(0,0,0,.2);opacity:.88";
    document.body.appendChild(el);
  }
  el.textContent = detail ? `● Dados ${status} · ${detail}` : `● Dados ${status}`;
  el.title = "Monitor de integridade DPM — apenas leitura";
}

async function check() {
  try {
    const snap = await getDoc(doc(db(), "appdata", MAIN_DOC));
    if (!snap.exists()) return badge("indisponíveis");
    const data = snap.data();
    const errors = validateData(data);
    badge(errors.length ? "com alertas" : "íntegros", errors.length ? `${errors.length} alerta(s)` : "v1");
    if (errors.length) console.warn("DPM data integrity:", errors);
    return { errors, data };
  } catch (error) {
    console.warn("DPM data integrity check failed:", error);
    badge("não verificados");
    return { errors: [error.message || String(error)] };
  }
}

window.DPMEnterprise = Object.freeze({ auditCurrentData, migrateCurrentData, check });

// Delay slightly so the existing application can finish its first render.
setTimeout(check, 1200);
