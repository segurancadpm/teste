import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, runTransaction, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAqt5RDygjfeQZ3zq8dYhEGbyIjg00Bbks",
  authDomain: "dpm-epi.firebaseapp.com",
  projectId: "dpm-epi",
  storageBucket: "dpm-epi.firebasestorage.app",
  messagingSenderId: "1043253642340",
  appId: "1:1043253642340:web:d3e0920050b8407f48cb71",
  measurementId: "G-VZK3WE1MDJ"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const MAIN_DOC = "dpm_epi_data_v1";

function esc(v) { return String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function todayPT() { return new Date().toLocaleDateString("pt-PT"); }
function currentWorkerName() { return document.querySelector(".detail-header h1")?.textContent?.trim() || ""; }
function normalizeStock(v) {
  if (typeof v === "number") return { loose: v, sizes: {} };
  if (!v || typeof v !== "object") return { loose: 0, sizes: {} };
  return { loose: Number(v.loose || 0), sizes: Object.fromEntries(Object.entries(v.sizes || {}).map(([k,n]) => [String(k).toUpperCase(), Number(n || 0)])) };
}
function addStock(data, warehouse, epi, size, qty) {
  if (!data.stocks) data.stocks = {};
  if (!data.stocks[warehouse]) data.stocks[warehouse] = {};
  const s = normalizeStock(data.stocks[warehouse][epi]);
  const key = String(size || "").trim().toUpperCase();
  if (key) s.sizes[key] = Number(s.sizes[key] || 0) + qty;
  else s.loose += qty;
  data.stocks[warehouse][epi] = s;
}

function installStyles() {
  if (document.getElementById("per-item-return-styles")) return;
  const style = document.createElement("style");
  style.id = "per-item-return-styles";
  style.textContent = `
    .epi-return-btn{margin-top:4px;white-space:nowrap;font-size:0;padding:5px 7px;min-width:32px;min-height:30px;border-radius:7px;border:1px solid #c85a4b;background:#fff1ee;color:#a62f22;font-weight:800;line-height:1}
    .epi-return-btn::before{content:"↩";font-size:16px}
    .epi-return-btn:hover{background:#ffe0da;color:#8f2419}
    .epi-return-cell{width:42px;text-align:center;vertical-align:middle}
    .return-confirm-box{padding:14px;border-radius:10px;background:var(--surface-2,#10202a);border:1px solid var(--border,#28404c)}
    .return-confirm-box strong{display:block;margin-bottom:6px}
    .return-confirm-box .meta{display:block;line-height:1.45}
    .months-help-label{display:block;font-size:.78rem;font-weight:800;margin-bottom:5px;color:var(--text,#17313d)}
    .months-help-text{display:block;margin-top:4px;font-size:.72rem;color:var(--muted,#5b7180);line-height:1.3}
    .return-destination{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
    .return-destination button{min-height:42px}
    .return-destination .selected{outline:2px solid currentColor;outline-offset:1px}
    .return-stock{color:#145b3b!important;background:#e3f5ea!important;border:1px solid #a8d8bb!important}
    .return-discard{color:#8b1e31!important;background:#fde4e8!important;border:1px solid #e5a7b3!important}
    @media (prefers-color-scheme:dark){
      .return-stock{color:#bcefd2!important;background:#195a41!important;border-color:#3d8a67!important}
      .return-discard{color:#ffd3da!important;background:#6e2637!important;border-color:#a85a6b!important}
    }
  `;
  document.head.appendChild(style);
}

function improveMonthsField() {
  document.querySelectorAll('input[name="meses"]').forEach(input => {
    if (input.dataset.monthsEnhanced === "1") return;
    input.dataset.monthsEnhanced = "1";
    const wrap = input.closest(".field-row") || input.parentElement;
    if (!wrap) return;
    const oldLabel = wrap.querySelector(".field-label");
    if (oldLabel) oldLabel.textContent = "Validade do EPI (meses)";
    else {
      const label = document.createElement("label");
      label.className = "months-help-label";
      label.textContent = "Validade do EPI (meses)";
      wrap.insertBefore(label, input);
    }
    const help = document.createElement("span");
    help.className = "months-help-text";
    help.textContent = "Período de validade após a entrega. Já vem preenchido de acordo com o artigo selecionado.";
    wrap.appendChild(help);
    input.setAttribute("aria-label", "Validade do EPI em meses");
    input.title = "Número de meses de validade do EPI";
  });
}

async function getActiveEvents() {
  const snap = await getDoc(doc(db, "appdata", MAIN_DOC));
  if (!snap.exists()) return [];
  const data = snap.data();
  const worker = (data.trabalhadores || []).find(w => String(w.nome).trim() === currentWorkerName());
  if (!worker) return [];
  return (data.eventos || []).filter(e => e.idTrab === worker.id).slice().reverse();
}

async function openItemReturn(event) {
  const root = document.querySelector("#modal-root");
  if (!root) return;
  const max = Number(event.qtd || 0);
  root.innerHTML = `
    <div class="modal-overlay" data-item-return-close>
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h2>Registar devolução</h2><button class="icon-btn" data-item-return-close>×</button></div>
        <div class="return-confirm-box">
          <strong>${esc(event.epi)}${event.tamanho ? ` · Tam. ${esc(event.tamanho)}` : ""}</strong>
          <span class="meta">Entregue em ${esc(event.data || "—")} · Quantidade atualmente entregue: <strong>${max}</strong></span>
        </div>
        <form id="single-return-form" style="margin-top:12px">
          <div class="field-row">
            <label class="field-label">Quantidade a devolver</label>
            <input class="input" name="qtd" type="number" min="1" max="${max}" value="1" required>
          </div>
          <div class="field-row">
            <label class="field-label">Destino do EPI</label>
            <div class="return-destination">
              <button type="button" class="ghost-btn return-stock selected" data-destination="stock">↩ Voltar ao stock</button>
              <button type="button" class="ghost-btn return-discard" data-destination="discard">♻ Retirar / inutilizar</button>
            </div>
            <input type="hidden" name="destination" value="stock">
            <small class="meta" id="return-destination-help">O EPI volta ao armazém associado à entrega.</small>
          </div>
          <div class="field-row">
            <label class="field-label">Observação (opcional)</label>
            <textarea class="textarea" name="obs" placeholder="Ex.: troca, desgaste, dano, fim de vida…"></textarea>
          </div>
          <button class="primary-btn" type="submit">Confirmar devolução</button>
        </form>
      </div>
    </div>`;

  const form = root.querySelector("#single-return-form");
  const destinationInput = form.querySelector("[name=destination]");
  const help = form.querySelector("#return-destination-help");
  root.querySelectorAll("[data-destination]").forEach(btn => {
    btn.addEventListener("click", () => {
      destinationInput.value = btn.dataset.destination;
      root.querySelectorAll("[data-destination]").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      help.textContent = btn.dataset.destination === "discard"
        ? "Não volta ao stock. Fica registado como retirado/inutilizado, sem apagar o histórico."
        : `Volta ao armazém associado à entrega${event.armazem ? ` (${event.armazem})` : ""}.`;
    });
  });

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    await processReturn(event, Number(fd.get("qtd") || 0), String(fd.get("obs") || "").trim(), String(fd.get("destination") || "stock"));
  });
}

async function processReturn(event, qty, obs, destination = "stock") {
  if (!event?.id || qty <= 0) return;
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, "appdata", MAIN_DOC);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Dados principais não encontrados.");
      const data = snap.data();
      const worker = (data.trabalhadores || []).find(w => String(w.nome).trim() === currentWorkerName());
      if (!worker) throw new Error("Trabalhador não encontrado.");
      const target = (data.eventos || []).find(e => String(e.id) === String(event.id) && e.idTrab === worker.id && e.tipo === "ENTREGA" && e.statusAlerta === "ATIVO");
      if (!target) throw new Error("Este EPI já foi devolvido ou alterado. Atualize a ficha e tente novamente.");
      const available = Number(target.qtd || 0);
      if (qty > available) throw new Error(`Só existem ${available} unidade(s) desta entrega para devolver.`);
      if (!["stock", "discard"].includes(destination)) throw new Error("Destino de devolução inválido.");

      if (destination === "stock") addStock(data, target.armazem || worker.delegacao, target.epi, target.tamanho, qty);

      if (qty === available) {
        target.statusAlerta = "BAIXA";
        const actionText = destination === "discard" ? "Retirado / inutilizado" : "Devolvido ao stock";
        target.estado = obs ? `${actionText} · ${obs}` : actionText;
      } else {
        target.qtd = available - qty;
      }

      if (!Array.isArray(data.eventos)) data.eventos = [];
      data.eventos.push({
        id: `DEV-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        idTrab: worker.id,
        data: todayPT(),
        tipo: "DEVOLUÇÃO",
        epi: target.epi,
        qtd: qty,
        tamanho: target.tamanho || "",
        armazem: destination === "stock" ? (target.armazem || worker.delegacao) : "",
        destinoDevolucao: destination === "stock" ? "STOCK" : "INUTILIZADO",
        estado: destination === "discard" ? (obs ? `Retirado / inutilizado · ${obs}` : "Retirado / inutilizado") : (obs ? `Devolvido ao stock · ${obs}` : "Devolvido ao stock"),
        statusAlerta: "BAIXA",
        validade: "",
        responsavel: "Registo na aplicação"
      });
      tx.set(ref, data);
    });
    document.querySelector("#modal-root").innerHTML = "";
    const toast = document.createElement("div");
    toast.className = "success-pop";
    toast.textContent = destination === "discard" ? "Devolução registada como inutilizada" : "EPI devolvido ao stock e stock atualizado";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
  } catch (err) {
    console.error(err);
    alert(`Não foi possível registar a devolução.\n\n${err.message || err}\n\nNenhum dado foi apagado.`);
  }
}

async function injectPerItemButtons() {
  const table = document.querySelector(".detail-header")?.parentElement?.querySelector("table");
  if (!table) return;
  const rows = Array.from(table.querySelectorAll("tbody tr"));
  if (!rows.length || rows.some(r => r.dataset.returnEnhanced === "1")) return;
  let events;
  try { events = await getActiveEvents(); } catch { return; }
  rows.forEach((row, index) => {
    const event = events[index];
    if (!event || event.tipo !== "ENTREGA" || event.statusAlerta !== "ATIVO" || Number(event.qtd || 0) <= 0) return;
    row.dataset.returnEnhanced = "1";
    const cell = row.insertCell(-1);
    cell.className = "epi-return-cell";
    cell.innerHTML = `<button type="button" class="ghost-btn epi-return-btn return-action" title="Devolver este EPI" aria-label="Devolver este EPI"></button>`;
    cell.querySelector("button").addEventListener("click", () => openItemReturn(event));
  });
}

function removeGlobalReturnButton() { document.getElementById("return-epi-btn")?.remove(); }

installStyles();
const observer = new MutationObserver(() => { removeGlobalReturnButton(); improveMonthsField(); injectPerItemButtons(); });
observer.observe(document.body, { childList: true, subtree: true });
setTimeout(() => { removeGlobalReturnButton(); improveMonthsField(); injectPerItemButtons(); }, 500);
