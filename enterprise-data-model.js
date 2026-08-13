// DPM Enterprise Data Model v1
// Pure helpers: no Firebase, no DOM. Safe to use from tests and future modules.

export const MODEL_VERSION = 1;

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function slug(value) {
  return normalizeText(value)
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function stableId(type, value) {
  const prefix = slug(type) || "item";
  const body = slug(value) || "sem-nome";
  return `${prefix}_${body}`;
}

export function quarterOf(date) {
  const d = new Date(`${String(date || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "T1";
  return `T${Math.floor(d.getMonth() / 3) + 1}`;
}

export function money(value) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function articleId(article) {
  if (article?.id) return String(article.id);
  return stableId("epi", article?.codigo || article?.nome || article?.name);
}

export function workerId(worker) {
  if (worker?.id != null) return String(worker.id);
  return stableId("worker", worker?.nif || worker?.numero || worker?.nome || worker?.name);
}

export function supplierId(supplier) {
  if (supplier?.id) return String(supplier.id);
  return stableId("supplier", supplier?.nif || supplier?.nome || supplier?.name);
}

export function normalizeArticle(article, index = 0) {
  const name = String(article?.nome || article?.name || `Artigo ${index + 1}`).trim();
  return {
    ...article,
    id: articleId({ ...article, nome: name }),
    codigo: String(article?.codigo || `EPI-${String(index + 1).padStart(3, "0")}`),
    nome: name,
    unidade: article?.unidade || article?.unit || "un",
    preco: money(article?.preco ?? article?.unitPrice ?? article?.price),
    modelo: String(article?.modelo || article?.model || "").trim(),
    ativo: article?.ativo !== false
  };
}

export function normalizePurchase(purchase, index = 0) {
  const product = String(purchase?.product || purchase?.nome || purchase?.artigo || "").trim();
  const id = purchase?.id || stableId("purchase", `${purchase?.date || "sem-data"}-${purchase?.invoice || "sem-fatura"}-${product}-${index}`);
  const quantity = Math.max(0, Number(purchase?.quantity) || 0);
  const unitPrice = money(purchase?.unitPrice ?? purchase?.price);
  return {
    ...purchase,
    id: String(id),
    articleId: String(purchase?.articleId || stableId("epi", product)),
    product,
    quantity,
    unitPrice,
    total: money(quantity * unitPrice),
    quarter: purchase?.quarter || quarterOf(purchase?.date),
    currency: purchase?.currency || "EUR",
    status: purchase?.status || "POSTED"
  };
}

export function normalizePlanningEntry(name, entry = {}) {
  const article = String(name || entry.nome || entry.name || "").trim();
  return {
    ...entry,
    articleId: String(entry.articleId || stableId("epi", article)),
    nome: article,
    unitPrice: money(entry.unitPrice ?? entry.preco ?? entry.price),
    authorizedQty: Math.max(0, Number(entry.authorizedQty ?? entry.quantidade ?? entry.qty) || 0),
    unidade: entry.unidade || "un"
  };
}

export function calculateBudget(planning = [], purchases = []) {
  const plan = planning.reduce((sum, row) => sum + money(row.unitPrice) * (Number(row.authorizedQty) || 0), 0);
  const spent = purchases.reduce((sum, row) => sum + money(row.total ?? (Number(row.quantity) || 0) * money(row.unitPrice)), 0);
  return {
    planned: money(plan),
    spent: money(spent),
    balance: money(plan - spent),
    execution: plan > 0 ? money((spent / plan) * 100) : 0
  };
}

export function validateData(data) {
  const errors = [];
  if (!data || typeof data !== "object") return ["Documento de dados inválido."];
  const articles = Array.isArray(data.matriz) ? data.matriz : [];
  const ids = new Set();
  articles.forEach((article, i) => {
    const id = articleId(article);
    if (ids.has(id)) errors.push(`Artigo duplicado: ${id}`);
    ids.add(id);
    if (!String(article?.nome || "").trim()) errors.push(`Artigo ${i + 1} sem nome.`);
  });
  const purchases = Array.isArray(data?.budget?.management?.purchases) ? data.budget.management.purchases : [];
  const purchaseIds = new Set();
  purchases.forEach((purchase, i) => {
    const id = String(purchase?.id || "");
    if (!id) errors.push(`Compra ${i + 1} sem ID.`);
    if (id && purchaseIds.has(id)) errors.push(`Compra duplicada: ${id}`);
    if (id) purchaseIds.add(id);
    if (Number(purchase?.quantity) < 0) errors.push(`Compra ${id || i + 1} com quantidade negativa.`);
    if (Number(purchase?.unitPrice) < 0) errors.push(`Compra ${id || i + 1} com preço negativo.`);
  });
  return errors;
}
