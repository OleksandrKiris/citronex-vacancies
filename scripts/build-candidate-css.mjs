import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = path.join(root, "assets", "styles.css");
const outputPath = path.join(root, "assets", "candidate-base.css");

const sourceFiles = [
  "index.html",
  "assets/clean.css",
  "assets/homepage.css",
  "assets/candidate.js",
  "assets/application-form.js",
  "assets/i18n.js",
  "data/content.js",
  "data/locales/az.js",
  "data/locales/en.js",
  "data/locales/es.js",
  "data/locales/fil.js",
  "data/locales/hy.js",
  "data/locales/id.js",
  "data/locales/ka.js",
  "data/locales/ne.js",
  "data/locales/pl.js",
  "data/locales/ru.js",
  "data/locales/uk.js"
];

const identifierPattern = /[A-Za-z_][A-Za-z0-9_-]*/g;
const selectorTokenPattern = /([.#])(-?[_A-Za-z]+[_A-Za-z0-9-]*)/g;
const usedClasses = new Set();
const usedIds = new Set();

function addTokens(value, target) {
  for (const token of String(value || "").match(identifierPattern) || []) target.add(token);
}

function collectMarkupTokens(source) {
  for (const match of source.matchAll(/\bclass(?:Name)?\s*=\s*["']([^"']+)["']/g)) {
    addTokens(match[1], usedClasses);
  }
  for (const match of source.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) {
    addTokens(match[1], usedIds);
  }
  for (const match of source.matchAll(/\bclassList\.(?:add|remove|toggle|contains)\(\s*["']([^"']+)["']/g)) {
    addTokens(match[1], usedClasses);
  }
  for (const match of source.matchAll(/(?:querySelector|querySelectorAll|closest)\(\s*["'`]([^"'`]+)["'`]/g)) {
    collectSelectorTokens(match[1]);
  }
}

function collectSelectorTokens(selector) {
  for (const match of selector.matchAll(selectorTokenPattern)) {
    (match[1] === "." ? usedClasses : usedIds).add(match[2]);
  }
}

for (const relativePath of sourceFiles) {
  const source = await fs.readFile(path.join(root, relativePath), "utf8");
  collectMarkupTokens(source);
  if (relativePath.endsWith(".css")) collectSelectorTokens(source);
}

[
  "direct-vacancy-page",
  "standalone-application-page",
  "is-active",
  "is-selected",
  "is-invalid",
  "is-previous",
  "is-next",
  "open",
  "verify",
  "paused",
  "closed"
].forEach((token) => usedClasses.add(token));

function findOpeningBrace(source, start) {
  let quote = "";
  let inComment = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && char === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "{") return index;
  }
  return -1;
}

function findClosingBrace(source, start) {
  let depth = 1;
  let quote = "";
  let inComment = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && char === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Unbalanced CSS block.");
}

function splitSelectors(value) {
  const result = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "(") round += 1;
    else if (char === ")") round -= 1;
    else if (char === "[") square += 1;
    else if (char === "]") square -= 1;
    else if (char === "," && round === 0 && square === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

function selectorIsUsed(selector) {
  for (const match of selector.matchAll(selectorTokenPattern)) {
    const collection = match[1] === "." ? usedClasses : usedIds;
    if (!collection.has(match[2])) return false;
  }
  return true;
}

const nestedAtRules = /^@(media|supports|container|layer|document|scope)\b/i;
const preservedAtRules = /^@(font-face|keyframes|-webkit-keyframes|property|page|counter-style)\b/i;

function filterCss(source) {
  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    const open = findOpeningBrace(source, cursor);
    if (open < 0) break;
    const close = findClosingBrace(source, open);
    const prelude = source.slice(cursor, open)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();
    const body = source.slice(open + 1, close);
    cursor = close + 1;
    if (!prelude) continue;

    if (nestedAtRules.test(prelude)) {
      const filteredBody = filterCss(body);
      if (filteredBody.trim()) output += `${prelude} {\n${filteredBody}}\n`;
      continue;
    }
    if (preservedAtRules.test(prelude)) {
      output += `${prelude} {\n${body.trim()}\n}\n`;
      continue;
    }
    if (prelude.startsWith("@")) continue;

    const selectors = splitSelectors(prelude).filter(selectorIsUsed);
    if (selectors.length) {
      output += `${selectors.join(",\n")} {\n${body.trim()}\n}\n`;
    }
  }
  return output;
}

const original = await fs.readFile(sourcePath, "utf8");
const filtered = [
  "/* Generated by scripts/build-candidate-css.mjs from assets/styles.css. */",
  filterCss(original).trim(),
  ""
].join("\n");

await fs.writeFile(outputPath, filtered, "utf8");
console.log(`Candidate CSS: ${Buffer.byteLength(original)} -> ${Buffer.byteLength(filtered)} bytes.`);
