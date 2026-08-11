import { getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// CATÁLOGO MESTRE — não altera a página Orçamento.
// A lista abaixo representa os nomes-mãe usados recorrentemente pela DPM.
// Modelos/variantes, preços, componentes e perigos são geridos dentro de cada nome-mãe.
const MAIN_DOC = "dpm_epi_data_v1";
const FAMILIES = ["EPI", "Equipamento", "Ambiente"];
const CATEGORIES = {
  EPI: ["Vestuário", "Calçado", "Cabeça", "Olhos/Face", "Audição", "Respiração", "Mãos", "Quedas", "Corpo", "Outros EPI"],
  Equipamento: ["Deteção/medição", "Sinalização", "Emergência", "Ferramentas", "Acessórios", "Outros equipamentos"],
  Ambiente: ["Resíduos", "Produtos químicos", "Absorção/derrames", "Manutenção", "Consumíveis", "Outros ambiente"]
};

const MASTER_EPI = [
  ["POLOS MANGA CURTA", "Vestuário", []],
  ["POLOS MANGA COMPRIDA", "Vestuário", []],
  ["CALÇAS DE TRABALHO", "Vestuário", []],
  ["PARKA IMPERMEÁVEL ALTA VISIBILIDADE", "Vestuário", ["Baixa visibilidade", "Chuva/intempérie", "Exposição ao frio"]],
  ["CASACO POLAR", "Vestuário", ["Exposição ao frio"]],
  ["COLETE DE ALTA VISIBILIDADE", "Vestuário", ["Baixa visibilidade"]],
  ["SAPATO DE SEGURANÇA", "Calçado", ["Queda de objetos", "Esmagamento dos pés", "Perfuração", "Escorregamento"]],
  ["CAPACETE + FRANCALETE", "Cabeça", ["Queda de objetos", "Impacto na cabeça"]],
  ["OCULOS PROTEÇÃO", "Olhos/Face", ["Projeção de partículas", "Poeiras", "Salpicos"]],
  ["PROTETORES AUDITIVOS", "Audição", ["Exposição ao ruído"]],
  ["MASCARA PROTEÇÃO ABEK1 OU BLS", "Respiração", ["Inalação de poeiras", "Gases/vapores, conforme filtro", "Aerossóis/partículas, conforme filtro"]],
  ["AVENTAL PROTEÇÃO", "Corpo", ["Salpicos", "Contacto com sujidade/contaminantes"]],
  ["LUVAS PROTEÇÃO MECÂNICA", "Mãos", ["Cortes", "Abrasão", "Perfuração", "Riscos mecânicos"]],
  ["LUVAS PROTEÇÃO QUÍMICA", "Mãos", ["Contacto com produtos químicos"]],
  ["LUVAS NITRILO", "Mãos", ["Contacto com contaminantes", "Contacto com determinados produtos químicos, conforme modelo"]],
  ["GALOCHAS", "Calçado", ["Humidade", "Salpicos", "Contacto com contaminantes, conforme modelo", "Escorregamento"]],
  ["FATO PESCADOR", "Corpo", ["Humidade", "Salpicos", "Contacto com sujidade/contaminantes"]],
  ["FATO IMPERMEÁVEL", "Corpo", ["Chuva/intempérie", "Humidade"]],
  ["FATO TYVEK", "Corpo", ["Poeiras/partículas", "Salpicos", "Contacto com contaminantes, conforme modelo"]],
  ["ARNÊS + CORDAS + ABS ENERGIA", "Quedas", ["Queda em altura"]]
];

let db = null;
let opened = false;
let catalog = null;

const getDb = () => {
  if (db) return db;
  if (!getApps().length) throw new Error("Firebase ainda não foi inicializado.");
  db = getFirestore(getApp());
  return db;
};
const mainRef = () => doc(getDb(), "appdata", MAIN_DOC);
const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;" }[c]));
const money = v => Number(v || 0).toLocaleString("pt-PT", { style:"currency", currency:"EUR" });
const key = v => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const splitList = v => String(v || "").split(/[;\n]/).map(x => x.trim()).filter(Boolean);
const categoryOk = (family, category) => CATEGORIES[family]?.includes(category) ? category : (CATEGORIES[family]?.[0] || "Outros EPI");

function styles() {
  if (document.getElementById("catalog-master-v2-style")) return;
  const s = document.createElement("style");
  s.id = "catalog-master-v2-style";
  s.textContent = `
    .dpm-cat-backdrop{position:fixed;inset:0;z-index:3000;background:rgba(4,12,18,.68);display:grid;place-items:center;padding:18px}
    .dpm-cat-modal{width:min(1180px,97vw);max-height:92vh;overflow:auto;background:#f7fbfd;color:#123047;border:1px solid #c8d7df;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.32);padding:18px;font-family:Outfit,Arial,sans-serif}
    .dpm-cat-head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start}.dpm-cat-head h2{margin:0 0 4px;font-size:20px}.dpm-cat-muted{font-size:13px;color:#617783}
    .dpm-cat-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0 10px}.dpm-cat-tab{border:1px solid #b9ccd5;background:#fff;color:#17364b;border-radius:8px;padding:8px 13px;font-weight:800;cursor:pointer}.dpm-cat-tab.active{background:#00a3e0;color:#fff;border-color:#00a3e0}
    .dpm-cat-search{width:100%;box-sizing:border-box;border:1px solid #aebfc8;border-radius:8px;padding:10px;margin-bottom:12px;background:#fff}.dpm-cat-grid{display:grid;grid-template-columns:1fr 170px 180px;gap:8px;margin-bottom:12px}
    .dpm-cat-list{border:1px solid #cbd9df;border-radius:10px;overflow:hidden;background:#fff}.dpm-cat-row{display:grid;grid-template-columns:1.6fr 150px 1fr 90px;gap:12px;padding:11px 13px;border-bottom:1px solid #dce5e9;align-items:center}.dpm-cat-row:last-child{border-bottom:0}.dpm-cat-row.head{font-size:11px;text-transform:uppercase;font-weight:800;color:#55707d;background:#f2f7f9}.dpm-cat-row strong{display:block}.dpm-cat-btn{border:1px solid #b9ccd5;background:#fff;color:#17364b;border-radius:7px;padding:7px 10px;font-weight:800;cursor:pointer}.dpm-cat-btn.primary{background:#00a3e0;border-color:#00a3e0;color:#fff}.dpm-cat-btn.danger{color:#a52218}.dpm-cat-edit{display:none;grid-column:1/-1;background:#edf7fb;border-top:1px solid #d2e1e7;padding:12px}.dpm-cat-edit.open{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.dpm-cat-edit label{font-size:12px;font-weight:800;color:#4b6672}.dpm-cat-edit input,.dpm-cat-edit select,.dpm-cat-edit textarea,.dpm-cat-add input,.dpm-cat-add select{width:100%;box-sizing:border-box;border:1px solid #aec2cc;border-radius:7px;padding:8px;background:#fff;color:#122d3d;margin-top:4px}.dpm-cat-edit textarea{min-height:70px}.dpm-cat-full{grid-column:1/-1}.dpm-cat-add{display:grid;grid-template-columns:1.3fr 150px 170px 1fr 120px auto;gap:7px;padding:12px;background:#eef7fb;border:1px solid #d0e0e6;border-radius:10px;margin-bottom:12px}.dpm-cat-small{font-size:12px;color:#5c7380}.dpm-cat-models{margin-top:8px;font-size:12px;color:#4d6875}.dpm-cat-chip{display:inline-block;border:1px solid #c9d8df;background:#f7fafb;border-radius:20px;padding:3px 8px;margin:2px 3px 2px 0}.dpm-cat-danger{color:#8d3e00}.dpm-cat-management{display:inline-flex;margin-left:8px;vertical-align:middle}
    @media(max-width:850px){.dpm-cat-grid,.dpm-cat-add,.dpm-cat-edit.open{grid-template-columns:1fr}.dpm-cat-row{grid-template-columns:1fr}.dpm-cat-row.head{display:none}.dpm-cat-edit{grid-column:1}.dpm-cat-management{margin-left:0;margin-top:8px}}
  `;
  document.head.appendChild(s);
}

async function loadMain() {
  const snap = await getDoc(mainRef());
  if (!snap.exists()) throw new Error("Documento principal de dados não encontrado.");
  const data = snap.data();
  if (!Array.isArray(data.matriz)) data.matriz = [];
  return data;
}

function buildCatalog(data) {
  const existing = Array.isArray(data.catalogMaster) ? data.catalogMaster : [];
  const byKey = new Map(existing.map(x => [key(x.nome), x]));
  for (const [nome, categoria, perigos] of MASTER_EPI) {
    const k = key(nome);
    if (!byKey.has(k)) {
      const match = data.matriz.find(x => key(x?.nome) === k || key(x?.nomeMae) === k);
      byKey.set(k, {
        id: `epi-${k.toLowerCase().replace(/ /g,"-")}`,
        nome,
        familia: "EPI",
        categoria,
        perigos: perigos.slice(),
        preco: Number(match?.preco || 0),
        ativo: true,
        modelos: []
      });
    } else {
      const item = byKey.get(k);
      item.familia = item.familia || "EPI";
      item.categoria = categoryOk(item.familia, item.categoria || categoria);
      item.perigos = Array.isArray(item.perigos) && item.perigos.length ? item.perigos : perigos.slice();
      item.modelos = Array.isArray(item.modelos) ? item.modelos : [];
      item.ativo = item.ativo !== false;
      item.preco = Number(item.preco || 0);
    }
  }
  const all = [...byKey.values()];
  return all;
}

async function saveCatalog(data, items) {
  await setDoc(mainRef(), { catalogMaster: items }, { merge:true });
  // Liga os nomes-mãe ao catálogo existente sem apagar histórico.
  const matriz = Array.isArray(data.matriz) ? data.matriz.map(x => ({...x})) : [];
  let changed = false;
  for (const item of items) {
    const matches = matriz.filter(x => key(x?.nome) === key(item.nome) || key(x?.nomeMae) === key(item.nome));
    for (const m of matches) {
      if (!m.familia || m.familia !== item.familia) { m.familia = item.familia; changed = true; }
      if (!m.categoria) { m.categoria = item.categoria; changed = true; }
      if (!m.nomeMae) { m.nomeMae = item.nome; changed = true; }
      if (!Array.isArray(m.perigos) || !m.perigos.length) { m.perigos = item.perigos.slice(); changed = true; }
    }
  }
  if (changed) await setDoc(mainRef(), { matriz }, { merge:true });
  data.matriz = matriz;
  data.catalogMaster = items;
  catalog = items;
}

function seedPurchaseList(items) {
  const root = document.querySelector(".budget-management-root");
  const familySelect = root?.querySelector("#purchase-family");
  const epiSelect = root?.querySelector("#purchase-epi");
  if (!root || !familySelect || !epiSelect || familySelect.value !== "EPI") return;
  const current = epiSelect.value;
  const active = items.filter(x => x.familia === "EPI" && x.ativo !== false);
  epiSelect.innerHTML = `<option value="">Selecionar EPI</option>` + active.map(x => `<option value="${esc(x.nome)}">${esc(x.nome)}</option>`).join("");
  if (active.some(x => x.nome === current)) epiSelect.value = current;
}

function syncPurchaseUI() {
  if (!catalog) return;
  seedPurchaseList(catalog);
  const root = document.querySelector(".budget-management-root");
  const familySelect = root?.querySelector("#purchase-family");
  if (familySelect && !familySelect.dataset.catalogMasterBound) {
    familySelect.dataset.catalogMasterBound = "1";
    familySelect.addEventListener("change", () => setTimeout(() => seedPurchaseList(catalog), 0));
  }
}

function addManagementButton() {
  const root = document.querySelector(".budget-management-root");
  if (!root || !root.querySelector("#purchase-family") || root.querySelector("[data-open-catalog-master]")) return;
  const heading = root.querySelector(".budget-view .budget-card h3") || root.querySelector(".budget-view h3");
  if (!heading) return;
  const wrap = document.createElement("span");
  wrap.className = "dpm-cat-management";
  wrap.innerHTML = `<button type="button" class="dpm-cat-btn" data-open-catalog-master>⚙ Gerir catálogo</button>`;
  heading.parentElement?.appendChild(wrap);
  wrap.querySelector("button").addEventListener("click", openCatalog);
}

function renderEditor(item, index, list, data, container) {
  const models = Array.isArray(item.modelos) ? item.modelos : [];
  const modelText = models.map(m => `${m.nome || ""} | ${Number(m.preco || 0).toFixed(2)} | ${m.referencia || ""}`).join("\n");
  const edit = document.createElement("div");
  edit.className = "dpm-cat-edit open";
  edit.innerHTML = `
    <label>Família<select data-family>${FAMILIES.map(f=>`<option ${f===item.familia?"selected":""}>${f}</option>`).join("")}</select></label>
    <label>Categoria<select data-category>${CATEGORIES[item.familia].map(c=>`<option ${c===item.categoria?"selected":""}>${esc(c)}</option>`).join("")}</select></label>
    <label>Preço base (€)<input data-price type="number" min="0" step="0.01" value="${Number(item.preco||0)}"></label>
    <label class="dpm-cat-full">Nome mãe<input data-name value="${esc(item.nome)}"></label>
    <label class="dpm-cat-full">Perigos / proteções (preenchidos automaticamente, mas editáveis)<textarea data-hazards>${esc((item.perigos||[]).join("; "))}</textarea></label>
    <label class="dpm-cat-full">Modelos / variantes — Nome | Preço | Referência<textarea data-models placeholder="Ex.: Dortmund | 58,20 | REF123">${esc(modelText)}</textarea></label>
    <label>Estado<select data-active><option value="true" ${item.ativo!==false?"selected":""}>Ativo</option><option value="false" ${item.ativo===false?"selected":""}>Inativo</option></select></label>
    <div style="display:flex;gap:7px;align-items:end"><button class="dpm-cat-btn primary" data-save>Guardar</button><button class="dpm-cat-btn danger" data-delete>Eliminar</button></div>
    <div class="dpm-cat-small dpm-cat-full">Os modelos ficam dentro do nome-mãe. O histórico existente não é apagado.</div>`;
  container.appendChild(edit);

  edit.querySelector("[data-family]").addEventListener("change", e => {
    const f = e.target.value;
    edit.querySelector("[data-category]").innerHTML = CATEGORIES[f].map(c=>`<option>${esc(c)}</option>`).join("");
  });
  edit.querySelector("[data-save]").addEventListener("click", async () => {
    const f = edit.querySelector("[data-family]").value;
    const name = edit.querySelector("[data-name]").value.trim();
    if (!name) return alert("O nome-mãe é obrigatório.");
    item.familia = f;
    item.categoria = categoryOk(f, edit.querySelector("[data-category]").value);
    item.nome = name;
    item.preco = Number(edit.querySelector("[data-price]").value || 0);
    item.perigos = splitList(edit.querySelector("[data-hazards]").value);
    item.ativo = edit.querySelector("[data-active").value !== "false";
    item.modelos = splitList(edit.querySelector("[data-models]").value).map(line => {
      const p = line.split("|").map(x=>x.trim());
      return { nome:p[0] || "", preco:Number(String(p[1]||"0").replace(",",".")) || 0, referencia:p[2] || "" };
    }).filter(x=>x.nome);
    try { await saveCatalog(data, list); container.remove(); renderList(data, list); } catch(e) { alert(`Não foi possível guardar: ${e?.message || e}`); }
  });
  edit.querySelector("[data-delete]").addEventListener("click", async () => {
    if (!confirm(`Eliminar "${item.nome}" do catálogo? Se já tiver histórico, será mantido como inativo.`)) return;
    item.ativo = false;
    try { await saveCatalog(data, list); container.remove(); renderList(data, list); } catch(e) { alert(`Não foi possível alterar o estado: ${e?.message || e}`); }
  });
}

function renderList(data, list, filter="Todos", search="") {
  const area = document.querySelector(".dpm-cat-list");
  if (!area) return;
  const rows = list.filter(x => (filter === "Todos" || x.familia === filter) && (!search || `${x.nome} ${(x.modelos||[]).map(m=>m.nome).join(" ")}`.toLocaleLowerCase("pt-PT").includes(search.toLocaleLowerCase("pt-PT"))));
  area.innerHTML = `<div class="dpm-cat-row head"><div>Nome-mãe</div><div>Família / categoria</div><div>Perigos automáticos</div><div></div></div>`;
  if (!rows.length) { area.innerHTML += `<div class="dpm-cat-row"><div>Não existem artigos nesta seleção.</div></div>`; return; }
  rows.forEach(item => {
    const row = document.createElement("div"); row.className = "dpm-cat-row";
    const chips = (item.perigos||[]).slice(0,4).map(p=>`<span class="dpm-cat-chip dpm-cat-danger">${esc(p)}</span>`).join("");
    const models = (item.modelos||[]).map(m=>m.nome).filter(Boolean);
    row.innerHTML = `<div><strong>${esc(item.nome)}</strong><div class="dpm-cat-small">${models.length ? `${models.length} modelo(s): ${esc(models.join(", "))}` : "Sem modelo definido"}</div></div><div>${esc(item.familia)}<br><span class="dpm-cat-small">${esc(item.categoria)}</span></div><div>${chips || `<span class="dpm-cat-small">Sem perigo específico definido</span>`}</div><div><button class="dpm-cat-btn" data-edit>Editar</button></div>`;
    area.appendChild(row);
    row.querySelector("[data-edit]").addEventListener("click", () => {
      if (row.nextElementSibling?.classList.contains("dpm-cat-edit")) { row.nextElementSibling.remove(); return; }
      renderEditor(item, list.indexOf(item), list, data, row);
    });
  });
}

function openCatalog() {
  if (opened) return;
  opened = true;
  styles();
  loadMain().then(data => {
    const list = buildCatalog(data);
    catalog = list;
    const bg = document.createElement("div");
    bg.className = "dpm-cat-backdrop";
    bg.innerHTML = `<div class="dpm-cat-modal"><div class="dpm-cat-head"><div><h2>Catálogo mestre de EPI</h2><div class="dpm-cat-muted">Esta é a lista principal que usas recorrentemente. Dentro de cada nome-mãe podes gerir modelos, preços e perigos.</div></div><button class="dpm-cat-btn" data-close>Fechar</button></div><div class="dpm-cat-tabs"><button class="dpm-cat-tab active" data-filter="Todos">Todos (${list.length})</button>${FAMILIES.map(f=>`<button class="dpm-cat-tab" data-filter="${f}">${f} (${list.filter(x=>x.familia===f).length})</button>`).join("")}</div><div class="dpm-cat-grid"><input class="dpm-cat-search" style="margin:0" data-search placeholder="Pesquisar nome-mãe ou modelo"><select class="dpm-cat-search" style="margin:0" data-filter-category><option>Todos</option>${CATEGORIES.EPI.map(c=>`<option>${esc(c)}</option>`).join("")}</select><button class="dpm-cat-btn primary" data-add-new>+ Adicionar nome-mãe</button></div><div class="dpm-cat-add" data-add-form style="display:none"><input data-new-name placeholder="Nome principal (ex.: Calçado de segurança)"><select data-new-family>${FAMILIES.map(f=>`<option>${f}</option>`).join("")}</select><select data-new-category></select><input data-new-price type="number" min="0" step="0.01" placeholder="Preço base €"><button class="dpm-cat-btn primary" data-create>Criar</button><button class="dpm-cat-btn" data-cancel>Cancelar</button><input class="dpm-cat-full" data-new-hazards placeholder="Perigos/proteções; deixar vazio para preencher automaticamente"></div><div class="dpm-cat-list"></div><p class="dpm-cat-muted" style="margin:12px 0 0">Os perigos predefinidos são sugestões de catálogo e ficam sempre editáveis. Artigos com histórico não são apagados fisicamente; são desativados.</p></div>`;
    document.body.appendChild(bg);

    const catSelect = bg.querySelector("[data-filter-category]");
    const fillNewCats = () => { const f=bg.querySelector("[data-new-family]").value; bg.querySelector("[data-new-category]").innerHTML=CATEGORIES[f].map(c=>`<option>${esc(c)}</option>`).join(""); };
    fillNewCats();
    bg.querySelector("[data-new-family]").addEventListener("change", fillNewCats);
    bg.querySelector("[data-add-new]").addEventListener("click", () => { bg.querySelector("[data-add-form]").style.display="grid"; });
    bg.querySelector("[data-cancel]").addEventListener("click", () => { bg.querySelector("[data-add-form]").style.display="none"; });
    bg.querySelector("[data-close]").addEventListener("click", () => { bg.remove(); opened=false; });
    bg.addEventListener("click", e => { if(e.target===bg){bg.remove();opened=false;} });

    let filter = "Todos";
    const doRender = () => renderList(data,list,filter,bg.querySelector("[data-search]").value);
    bg.querySelectorAll("[data-filter]").forEach(btn => btn.addEventListener("click", () => {
      filter=btn.dataset.filter;
      bg.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("active",b===btn));
      doRender();
    }));
    bg.querySelector("[data-search]").addEventListener("input", doRender);
    catSelect.addEventListener("change", doRender);
    bg.querySelector("[data-create]").addEventListener("click", async () => {
      const name=bg.querySelector("[data-new-name]").value.trim();
      if(!name)return alert("Indica o nome principal.");
      if(list.some(x=>key(x.nome)===key(name)))return alert("Já existe esse nome-mãe no catálogo.");
      const f=bg.querySelector("[data-new-family]").value;
      const c=categoryOk(f,bg.querySelector("[data-new-category]").value);
      let hazards=splitList(bg.querySelector("[data-new-hazards]").value);
      if(!hazards && f==="EPI") hazards=[];
      list.push({id:`custom-${Date.now()}`,nome:name,familia:f,categoria:c,perigos:hazards,preco:Number(bg.querySelector("[data-new-price]").value||0),ativo:true,modelos:[]});
      try { await saveCatalog(data,list); bg.querySelector("[data-add-form]").style.display="none"; doRender(); } catch(e) { list.pop(); alert(`Não foi possível criar: ${e?.message||e}`); }
    });
    renderList(data,list);
  }).catch(e => { alert(`Não foi possível carregar o catálogo: ${e?.message || e}`); opened=false; });
}

async function bootCatalog() {
  try {
    const data = await loadMain();
    catalog = buildCatalog(data);
    // Apenas garante que a nova lista existe no documento; não substitui a matriz nem o Orçamento.
    if (!Array.isArray(data.catalogMaster)) await setDoc(mainRef(), { catalogMaster: catalog }, { merge:true });
    syncPurchaseUI();
    addManagementButton();
  } catch (e) {
    console.warn("Catálogo mestre não inicializado:", e);
  }
}

const observer = new MutationObserver(() => { syncPurchaseUI(); addManagementButton(); });
observer.observe(document.documentElement, { childList:true, subtree:true });

// Recarrega os dados quando o utilizador abre Compras, sem tocar no Orçamento.
document.addEventListener("click", () => setTimeout(() => { syncPurchaseUI(); addManagementButton(); }, 50));
bootCatalog();
