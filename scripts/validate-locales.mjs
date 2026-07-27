import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localeCodes = ["ru", "uk", "pl", "en", "az", "ka", "id", "es", "fil", "ne", "hy"];
const nonCyrillicLocales = new Set(["pl", "en", "az", "ka", "id", "es", "fil", "ne", "hy"]);
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

function collectStrings(value, prefix = "", result = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${prefix}[${index}]`, result));
    return result;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => {
      collectStrings(item, prefix ? `${prefix}.${key}` : key, result);
    });
    return result;
  }
  if (typeof value === "string") result.push([prefix, value]);
  return result;
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
const englishReference = new Map(collectStrings(translations.en));
const allowedFilipinoEnglish = new Set([
  "18+",
  "Greenhouse",
  "UDT",
  "Forklift",
  "CV",
  "Umowa o pracę",
  "C+E",
  "MAN",
  "Code 95"
]);

for (const locale of localeCodes) {
  const pack = translations[locale];
  if (!pack) {
    errors.push(`Локаль ${locale} не зарегистрирована`);
    continue;
  }

  for (const metaKey of ["name", "short", "locale"]) {
    if (typeof pack.meta?.[metaKey] !== "string" || !pack.meta[metaKey].trim()) {
      errors.push(`${locale}.meta.${metaKey} пуст`);
    }
  }

  for (const section of ["ui", "form", "options"]) compareKeys(section, locale);

  if (nonCyrillicLocales.has(locale)) {
    for (const [field, value] of collectStrings(pack)) {
      if (/\p{Script=Cyrillic}/u.test(value)) {
        errors.push(`${locale}.${field} содержит кириллицу: ${JSON.stringify(value)}`);
      }
    }
  }

  if (locale !== "ru" && locale !== "uk") {
    for (const section of ["ui", "form", "options"]) {
      for (const key of Object.keys(reference[section])) {
        if (pack[section]?.[key] === reference[section][key]) {
          errors.push(`${locale}.${section}.${key} совпадает с русским текстом`);
        }
      }
    }
  }

  if (locale === "fil") {
    for (const [field, value] of collectStrings(pack)) {
      const isLocation = field.endsWith(".location");
      if (
        englishReference.get(field) === value
        && !isLocation
        && !allowedFilipinoEnglish.has(value)
      ) {
        errors.push(`${locale}.${field} не переведён с английского: ${JSON.stringify(value)}`);
      }
    }
  }

  if (locale === "ru") continue;
  for (const job of jobs) {
    const translated = pack.jobs?.[job.id];
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

console.log(`Переводы корректны: ${localeCodes.length} языков, ${jobs.length} вакансий, русских фрагментов в иностранных локалях нет.`);
