import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localeCodes = ["ru", "uk", "pl", "en", "az", "ka", "id", "es", "fil", "ne", "hy"];
const context = { window: {} };
vm.createContext(context);

for (const locale of localeCodes) {
  const file = path.join(root, "data", "locales", `${locale}.js`);
  if (!fs.existsSync(file)) {
    console.error(`Отсутствует локаль: ${locale}`);
    process.exit(1);
  }
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

vm.runInContext(fs.readFileSync(path.join(root, "data", "content.js"), "utf8"), context, {
  filename: "data/content.js"
});

const translations = context.window.PORTAL_TRANSLATIONS;
const jobs = context.window.PORTAL_CONTENT.jobs;
const reference = translations.ru;
const errors = [];

function compareKeys(section, locale) {
  const expected = Object.keys(reference[section]).sort();
  const actual = Object.keys(translations[locale]?.[section] || {}).sort();
  for (const key of expected) {
    if (!actual.includes(key)) errors.push(`${locale}.${section}.${key} отсутствует`);
    const value = translations[locale]?.[section]?.[key];
    if (typeof value !== "string" || !value.trim()) errors.push(`${locale}.${section}.${key} пуст`);
  }
  for (const key of actual) {
    if (!expected.includes(key)) errors.push(`${locale}.${section}.${key} не входит в базовую схему`);
  }
}

const requiredJobFields = [
  "title",
  "subtitle",
  "category",
  "level",
  "format",
  "location",
  "contract",
  "candidates",
  "skills",
  "summary",
  "responsibilities",
  "required",
  "niceToHave",
  "benefits",
  "statusNote"
];

for (const locale of localeCodes) {
  if (!translations[locale]) {
    errors.push(`Локаль ${locale} не зарегистрирована`);
    continue;
  }
  for (const section of ["ui", "form", "options"]) compareKeys(section, locale);
  if (locale === "ru") continue;
  for (const job of jobs) {
    const translated = translations[locale].jobs?.[job.id];
    if (!translated) {
      errors.push(`${locale}.jobs.${job.id} отсутствует`);
      continue;
    }
    for (const field of requiredJobFields) {
      const value = translated[field];
      if (Array.isArray(value)) {
        if (!value.length || value.some((item) => typeof item !== "string" || !item.trim())) {
          errors.push(`${locale}.jobs.${job.id}.${field} пуст`);
        }
      } else if (typeof value !== "string" || !value.trim()) {
        errors.push(`${locale}.jobs.${job.id}.${field} пуст`);
      }
    }
    const translatedSalaryNote = translated.salaryNote || translated.salary?.note;
    if (typeof translatedSalaryNote !== "string" || !translatedSalaryNote.trim()) {
      errors.push(`${locale}.jobs.${job.id}.salaryNote пуст`);
    }
    if (job.salary?.display) {
      const translatedSalaryDisplay = translated.salaryDisplay || translated.salary?.display;
      if (typeof translatedSalaryDisplay !== "string" || !translatedSalaryDisplay.trim()) {
        errors.push(`${locale}.jobs.${job.id}.salaryDisplay пуст`);
      }
    }
  }
}

if (errors.length) {
  console.error(`Проверка переводов не пройдена (${errors.length}):`);
  errors.slice(0, 100).forEach((error) => console.error(`- ${error}`));
  if (errors.length > 100) console.error(`... и ещё ${errors.length - 100}`);
  process.exit(1);
}

console.log(`Переводы корректны: ${localeCodes.length} языков, ${jobs.length} вакансий.`);
