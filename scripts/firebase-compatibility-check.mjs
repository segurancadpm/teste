// Guardrails for the shared Firebase data model.
// This script intentionally performs static checks only: it never connects to Firebase
// and therefore cannot mutate production data.
import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const index = readFileSync("index.html", "utf8");
const failures = [];

const forbidden = [
  /deleteDoc\s*\(\s*doc\([^)]*dpm_epi_data_v1/i,
  /deleteDoc\s*\(\s*doc\([^)]*deliveries/i,
  /deleteField\s*\(/i
];

for (const pattern of forbidden) {
  if (pattern.test(app)) failures.push(`Potentially destructive Firebase operation detected: ${pattern}`);
}

if (!app.includes('"dpm_epi_data_v1"')) failures.push("The shared main document identifier is missing from app.js.");
if (!app.includes('"deliveries"')) failures.push("The shared deliveries collection identifier is missing from app.js.");
if (!index.includes("app.js")) failures.push("index.html no longer loads app.js.");

if (failures.length) {
  console.error("Firebase compatibility guard failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("OK — shared Firebase identifiers preserved and no forbidden destructive pattern detected.");
