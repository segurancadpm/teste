import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const isLocalAsset = (value) => value && !/^(?:[a-z]+:|\/\/|#|data:|mailto:|javascript:)/i.test(value);
const stripQuery = (value) => value.split(/[?#]/, 1)[0];

function checkAsset(ownerFile, reference) {
  if (!isLocalAsset(reference)) return;
  const clean = stripQuery(reference);
  if (!clean) return;
  const target = normalize(join(dirname(ownerFile), clean));
  if (!target.startsWith(root) || !existsSync(target)) {
    failures.push(`${ownerFile.replace(root, ".")}: recurso inexistente -> ${reference}`);
  }
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.name === ".git" || entry.name === "node_modules") return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(root);
const jsFiles = files.filter((file) => extname(file) === ".js" || extname(file) === ".mjs");

for (const file of jsFiles) {
  const text = readFileSync(file, "utf8");
  const relative = file.replace(root, ".");

  for (const match of text.matchAll(/(?:from\s*["']|import\s*\(\s*["']|(?:src|href)\s*=\s*["'])([^"']+)["']/g)) {
    checkAsset(file, match[1]);
  }

  if (/\b(?:TODO|FIXME)\b/i.test(text)) {
    failures.push(`${relative}: TODO/FIXME encontrado; resolver antes de publicar.`);
  }
}

const index = join(root, "index.html");
if (!existsSync(index)) failures.push(".: index.html não existe.");
else {
  const text = readFileSync(index, "utf8");
  for (const match of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) checkAsset(index, match[1]);
}

const required = ["index.html", "app.js", "styles.css", "styles-contrast.css", "logo.css", "budget-management-clean.js"];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`Ficheiro essencial em falta: ${file}`);

if (failures.length) {
  console.error("Validação falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`OK — ${files.length} ficheiros analisados; referências locais e ficheiros essenciais válidos.`);
