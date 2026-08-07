import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAqt5RDygjfeQZ3zq8dYhEGbyIjg00Bbks",
  authDomain: "dpm-epi.firebaseapp.com",
  projectId: "dpm-epi",
  storageBucket: "dpm-epi.firebasestorage.app",
  messagingSenderId: "1043253642340",
  appId: "1:1043253642340:web:d3e0920050b8407f48cb71",
  measurementId: "G-VZK3WE1MDJ"
};

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const MAIN_DOC = "dpm_epi_data_v1";
const RETURN_BUTTON_ID = "return-epi-btn";

function esc(value) {
  return String(value ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}

function todayPT() {
  return new Date().toLocaleDateString("pt-PT");
}

function normalizeStock(value) {
  if (typeof value === "number") return { loose: value, sizes: {} };
  if (!value || typeof value !== "object") return { loose: 0, sizes: {} };
  return {
    loose: Number(value.loose || 0),
    sizes: Object.fromEntries(Object.entries(value.sizes || {}).map(([k, v]) => [String(k).toUpperCase(), Number(v || 0)]))
  };
}

function addStockToData(data, warehouse, epi, size, qty) {
  if (!data.stocks) data.stocks = {};
  if (!data.stocks[warehouse]) data.stocks[warehouse] = {};
  const current = normalizeStock(data.stocks[warehouse][epi]);
  const key = String(size || "").trim().toUpperCase();
  if (key) current.sizes[key] = Number(current.sizes[key] || 0) + qty;
  else current.loose += qty;
  data.stocks[warehouse][epi] = current;
}

function currentWorkerName() {
  return document.querySelector(".detail-header h1")?.textContent?.trim() || "";
}

function currentWorkerIdFromData(data, name) {
  const worker = (data.trabalhadores || []).find(w => String(w.nome).trim() === String(name).trim());
  return worker?.id ?? null;
}

function activeItems(data, workerId) {
  return (data.eventos || []).filter(e =>
    e.idTrab === workerId &&
    e.tipo === "ENTREGA" &&
    e.statusAlerta === "ATIVO" &&
    Number(e.qtd || 0) > 0
  );
}

function openReturnModal() {
  const root = document.querySelector("#modal-root");
  if (!root) return;
  root.innerHTML = `
    <div class="modal-overlay" data-return-close>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="return-title">
        <div class="modal-head">
          <h2 id="return-title">Devolver EPI</h2>
          <button class="icon-btn" type="button" data-return-close>×</button>
        </div>
        <div id="return-epi-body" class="empty">A carregar EPIs ativos…</div>
      </div>
    </div>`;

  loadReturnItems();
}

async function loadReturnItems() {
  const body = document.querySelector("#return-epi-body");
  if (!body) return;
  try {
    const snap = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js").then(({ getDoc }) => getDoc(doc(db, "appdata", MAIN_DOC)));
    if (!snap.exists()) {
      body.innerHTML = `<div class="empty">Não foi possível carregar os dados.</div>`;
      return;
    }
    const data = snap.data();
    const workerId = currentWorkerIdFromData(data, currentWorkerName());
    const items = activeItems(data, workerId);
    if (!items.length) {
      body.innerHTML = `<div class="empty">Este trabalhador não tem EPIs ativos para devolver.</div>`;
      return;
    }
    body.innerHTML = `
      <p class="meta">Selecione <strong>um único EPI</strong> para devolver. A devolução não apaga o registo da entrega.</p>
      <form data-return-form>
        <div class="field-row">
          <label class="field-label">EPI a devolver</label>
          <select class="select" name="eventId" required>
            ${items.map((e, i) => `<option value="${esc(e.id)}" ${i === 0 ? "selected" : ""}>${esc(e.epi)}${e.tamanho ? ` · Tam. ${esc(e.tamanho)}` : " · Sem tamanho"} · ${Number(e.qtd || 0)} un.</option>`).join("")}
          </select>
        </div>
        <div class="field-row two">
          <div>
            <label class="field-label">Quantidade a devolver</label>
            <input class="input" name="qtd" type="number" min="1" value="1" required>
          </div>
          <div>
            <label class="field-label">Destino do EPI</label>
            <input class="input" value="Armazém do trabalhador" disabled>
          </div>
        </div>
        <div class="info-box" id="return-info"></div>
        <div class="field-row">
          <label class="field-label">Observação (opcional)</label>
          <textarea class="textarea" name="obs" placeholder="Ex.: devolvido por troca, desgaste, saída do trabalhador…"></textarea>
        </div>
        <button class="primary-btn" type="submit">↩ Registar devolução</button>
      </form>`;
    updateReturnPreview(body, items);
  } catch (e) {
    console.error("Erro ao carregar devolução:", e);
    body.innerHTML = `<div class="empty">Erro ao carregar os EPIs. ${esc(e.message || e)}</div>`;
  }
}

function updateReturnPreview(root, items) {
  const form = root.querySelector("[data-return-form]");
  const info = root.querySelector("#return-info");
  if (!form || !info) return;
  const event = items.find(e => String(e.id) === String(form.eventId.value)) || items[0];
  const max = Number(event?.qtd || 0);
  form.qtd.max = String(max);
  if (Number(form.qtd.value) > max) form.qtd.value = String(max);
  info.textContent = event
    ? `Será devolvido para ${event.armazem || "o armazém do trabalhador"}: ${event.epi}${event.tamanho ? ` · tamanho ${event.tamanho}` : " · sem tamanho"}. Máximo: ${max} unidade(s).`
    : "";
}

async function processReturn(form) {
  const workerName = currentWorkerName();
  const eventId = form.eventId.value;
  const qty = Number(form.qtd.value || 0);
  const obs = String(form.obs.value || "").trim();
  if (!workerName || !eventId || qty <= 0) return;

  try {
    await runTransaction(db, async transaction => {
      const ref = doc(db, "appdata", MAIN_DOC);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error("Dados principais não encontrados.");
      const data = snap.data();
      const worker = (data.trabalhadores || []).find(w => String(w.nome).trim() === String(workerName).trim());
      if (!worker) throw new Error("Trabalhador não encontrado.");
      const event = (data.eventos || []).find(e => e.id === eventId && e.idTrab === worker.id && e.tipo === "ENTREGA" && e.statusAlerta === "ATIVO");
      if (!event) throw new Error("Este EPI já foi alterado ou devolvido. Atualize a página e tente novamente.");
      const available = Number(event.qtd || 0);
      if (qty > available) throw new Error(`Só existem ${available} unidade(s) desta entrega para devolver.`);

      addStockToData(data, event.armazem || worker.delegacao, event.epi, event.tamanho, qty);

      if (qty === available) {
        event.statusAlerta = "BAIXA";
        event.estado = obs ? `Devolvido · ${obs}` : "Devolvido";
      } else {
        event.qtd = available - qty;
      }

      data.eventos = data.eventos || [];
      data.eventos.push({
        id: `DEV-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        idTrab: worker.id,
        data: todayPT(),
        tipo: "DEVOLUÇÃO",
        epi: event.epi,
        qtd: qty,
        tamanho: event.tamanho || "",
        armazem: event.armazem || worker.delegacao,
        estado: obs ? `Devolvido · ${obs}` : "Devolvido",
        statusAlerta: "BAIXA",
        validade: "",
        responsavel: document.body.dataset.operador || "Registo na aplicação"
      });

      transaction.set(ref, data);
    });
    document.querySelector("#modal-root").innerHTML = "";
    const toast = document.createElement("div");
    toast.className = "success-pop";
    toast.textContent = "Devolução registada com sucesso";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
  } catch (e) {
    console.error("Erro ao registar devolução:", e);
    alert(`Não foi possível registar a devolução.\n\n${e.message || e}\n\nNenhum dado foi apagado.`);
  }
}

function injectReturnButton() {
  const actionRow = document.querySelector(".detail-header")?.nextElementSibling;
  if (!actionRow || !actionRow.classList.contains("action-row")) return;
  if (document.getElementById(RETURN_BUTTON_ID)) return;
  const button = document.createElement("button");
  button.id = RETURN_BUTTON_ID;
  button.className = "ghost-btn";
  button.type = "button";
  button.textContent = "↩ Devolver EPI";
  button.title = "Devolver um único EPI desta ficha";
  actionRow.insertBefore(button, actionRow.children[1] || null);
  button.addEventListener("click", openReturnModal);
}

function enhanceDeliveryModal() {
  const form = document.querySelector('form[data-form="delivery"]');
  if (!form) return;
  form.querySelectorAll(".delivery-item").forEach(item => {
    const months = item.querySelector('[name="meses"]');
    const qty = item.querySelector('[name="qtd"]');
    if (!months || !qty || item.dataset.enhanced === "1") return;
    item.dataset.enhanced = "1";

    const qtyWrap = qty.parentElement;
    const monthsWrap = months.parentElement;
    if (qtyWrap && !qtyWrap.querySelector(".field-label")) {
      qtyWrap.insertAdjacentHTML("afterbegin", `<label class="field-label">Quantidade a entregar</label>`);
    }
    if (monthsWrap && !monthsWrap.querySelector(".field-label")) {
      monthsWrap.insertAdjacentHTML("afterbegin", `<label class="field-label">Validade do EPI (meses)</label><span class="field-help">Preenchido automaticamente pela validade padrão deste EPI. Pode alterar se necessário.</span>`);
    }
  });
}

document.addEventListener("click", ev => {
  if (ev.target.closest("[data-return-close]")) {
    document.querySelector("#modal-root").innerHTML = "";
  }
});

document.addEventListener("change", ev => {
  const form = ev.target.closest("[data-return-form]");
  if (form && ev.target.name === "eventId") {
    loadReturnItems();
  }
});

document.addEventListener("submit", ev => {
  if (ev.target.matches("[data-return-form]")) {
    ev.preventDefault();
    processReturn(ev.target);
  }
});

const observer = new MutationObserver(() => {
  injectReturnButton();
  enhanceDeliveryModal();
});
observer.observe(document.body, { childList: true, subtree: true });
setTimeout(() => { injectReturnButton(); enhanceDeliveryModal(); }, 300);
