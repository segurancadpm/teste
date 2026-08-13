import assert from "node:assert/strict";
import {
  stableId, quarterOf, normalizeArticle, normalizePurchase,
  calculateBudget, validateData
} from "../enterprise-data-model.js";

assert.equal(stableId("EPI", "Capacete + Francalete"), "epi_capacete-francalete");
assert.equal(quarterOf("2026-01-15"), "T1");
assert.equal(quarterOf("2026-08-13"), "T3");

const article = normalizeArticle({ nome: " SAPATO DE SEGURANÇA ", preco: "12,50" }, 0);
assert.equal(article.id, "epi_sapato-de-seguranca");
assert.equal(article.codigo, "EPI-001");
assert.equal(article.preco, 12.5);
assert.equal(article.unidade, "un");

const purchase = normalizePurchase({ date: "2026-08-13", invoice: "FT-1", product: "SAPATO DE SEGURANÇA", quantity: 10, unitPrice: 12.5 }, 0);
assert.equal(purchase.total, 125);
assert.equal(purchase.quarter, "T3");
assert.equal(purchase.currency, "EUR");

const budget = calculateBudget(
  [{ unitPrice: 10, authorizedQty: 20 }, { unitPrice: 5, authorizedQty: 10 }],
  [{ quantity: 10, unitPrice: 10 }, { quantity: 2, unitPrice: 5 }]
);
assert.deepEqual(budget, { planned: 250, spent: 110, balance: 140, execution: 44 });

const errors = validateData({
  matriz: [{ nome: "A" }, { nome: "A" }],
  budget: { management: { purchases: [{ id: "x", quantity: -1, unitPrice: 2 }, { id: "x", quantity: 1, unitPrice: -2 }] } }
});
assert.ok(errors.some((e) => e.includes("Artigo duplicado")));
assert.ok(errors.some((e) => e.includes("quantidade negativa")));
assert.ok(errors.some((e) => e.includes("preço negativo")));
assert.ok(errors.some((e) => e.includes("Compra duplicada")));

console.log("OK — enterprise-data-model: todos os testes passaram.");
