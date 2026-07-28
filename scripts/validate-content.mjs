import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../data/content.js", import.meta.url), "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: "data/content.js" });
vm.runInContext(
  fs.readFileSync(new URL("../data/locales/pl.js", import.meta.url), "utf8"),
  context,
  { filename: "data/locales/pl.js" }
);

const content = context.window.PORTAL_CONTENT;
const polishJobs = context.window.PORTAL_TRANSLATIONS?.pl?.jobs || {};
const errors = [];
const add = (condition, message) => {
  if (!condition) errors.push(message);
};

add(content && typeof content === "object", "PORTAL_CONTENT не найден");
add(content?.profile?.name, "profile.name обязателен");
add(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content?.profile?.email || ""), "profile.email некорректен");
add(Array.isArray(content?.jobs), "jobs должен быть массивом");
add(Array.isArray(content?.resources), "resources должен быть массивом");

const housingLocations = content?.housingLocations || {};
add(
  housingLocations && typeof housingLocations === "object" && !Array.isArray(housingLocations),
  "housingLocations должен быть объектом"
);
let housingPhotoTotal = 0;
for (const [locationId, location] of Object.entries(housingLocations)) {
  const prefix = `housingLocations.${locationId}`;
  add(/^[a-z0-9-]+$/.test(locationId), `${prefix}: используйте kebab-case`);
  add(typeof location?.name === "string" && location.name.trim(), `${prefix}.name обязателен`);
  add(typeof location?.country === "string" && location.country.trim(), `${prefix}.country обязателен`);
  add(Number.isInteger(location?.photoCount) && location.photoCount > 0, `${prefix}.photoCount некорректен`);
  const photoCount = Number.isInteger(location?.photoCount) ? location.photoCount : 0;
  housingPhotoTotal += photoCount;
  for (let index = 1; index <= photoCount; index += 1) {
    const fileName = `${locationId}-${String(index).padStart(2, "0")}.webp`;
    const file = new URL(`../assets/housing/${locationId}/${fileName}`, import.meta.url);
    add(fs.existsSync(file), `${prefix}: отсутствует ${fileName}`);
  }
}

const jobIds = new Set();
for (const [index, job] of (content?.jobs || []).entries()) {
  const prefix = `jobs[${index}]`;
  add(job.id && /^[a-z0-9-]+$/.test(job.id), `${prefix}.id: используйте kebab-case`);
  add(!jobIds.has(job.id), `${prefix}.id дублируется: ${job.id}`);
  jobIds.add(job.id);
  const vacancyPage = new URL(`../vacancies/${job.id}/index.html`, import.meta.url);
  const shareCard = new URL(`../assets/share/jobs/${job.id}.png`, import.meta.url);
  const polishTitle = polishJobs[job.id]?.title || job.title;
  add(fs.existsSync(vacancyPage), `${prefix}: отсутствует отдельная страница vacancies/${job.id}/`);
  add(fs.existsSync(shareCard), `${prefix}: отсутствует Facebook-карточка assets/share/jobs/${job.id}.png`);
  if (fs.existsSync(shareCard)) {
    add(fs.statSync(shareCard).size > 10_000, `${prefix}: Facebook-карточка слишком мала или повреждена`);
  }
  if (fs.existsSync(vacancyPage)) {
    const vacancyHtml = fs.readFileSync(vacancyPage, "utf8");
    add(vacancyHtml.includes(`/vacancies/${job.id}/`), `${prefix}: отдельная страница содержит неверную canonical/OG ссылку`);
    add(vacancyHtml.includes(polishTitle), `${prefix}: на отдельной странице отсутствует польское название вакансии`);
    add(
      vacancyHtml.includes(`/assets/share/jobs/${job.id}.png?v=190`),
      `${prefix}: отдельная страница содержит неверную Facebook-карточку`
    );
  }
  add(job.title, `${prefix}.title обязателен`);
  add(job.company, `${prefix}.company обязателен`);
  add(["open", "verify", "paused", "closed"].includes(job.status), `${prefix}.status некорректен`);
  add(job.updatedAt && !Number.isNaN(Date.parse(job.updatedAt)), `${prefix}.updatedAt некорректен`);
  add(job.applyEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.applyEmail), `${prefix}.applyEmail некорректен`);
  const hasSalaryDisplay = typeof job.salary?.display === "string" && job.salary.display.trim().length > 0;
  const hasSalaryRange = Number.isFinite(job.salary?.min)
    && Number.isFinite(job.salary?.max)
    && job.salary.min <= job.salary.max
    && typeof job.salary?.currency === "string"
    && job.salary.currency.length > 0
    && typeof job.salary?.period === "string"
    && job.salary.period.length > 0;
  add(hasSalaryDisplay || hasSalaryRange, `${prefix}.salary: укажите display или корректные min/max/currency/period`);
  add(Array.isArray(job.candidates) && job.candidates.length > 0, `${prefix}.candidates пуст`);
  add(Array.isArray(job.responsibilities) && job.responsibilities.length > 0, `${prefix}.responsibilities пуст`);
  add(Array.isArray(job.required) && job.required.length > 0, `${prefix}.required пуст`);
  add(Array.isArray(job.niceToHave), `${prefix}.niceToHave должен быть массивом`);
  add(Array.isArray(job.benefits) && job.benefits.length > 0, `${prefix}.benefits пуст`);
  add(Array.isArray(job.hiring) && job.hiring.length > 0, `${prefix}.hiring пуст`);
  const assignedHousing = job.housingLocations || [];
  add(Array.isArray(assignedHousing), `${prefix}.housingLocations должен быть массивом`);
  for (const locationId of Array.isArray(assignedHousing) ? assignedHousing : []) {
    add(Boolean(housingLocations[locationId]), `${prefix}.housingLocations: неизвестная локация ${locationId}`);
  }
}


const resourceIds = new Set();
for (const [index, resource] of (content?.resources || []).entries()) {
  const prefix = `resources[${index}]`;
  add(resource.id && /^[a-z0-9-]+$/.test(resource.id), `${prefix}.id: используйте kebab-case`);
  add(!resourceIds.has(resource.id), `${prefix}.id дублируется: ${resource.id}`);
  resourceIds.add(resource.id);
  add(resource.title, `${prefix}.title обязателен`);
  add(Array.isArray(resource.sections) && resource.sections.length > 0, `${prefix}.sections пуст`);
}

if (errors.length) {
  console.error(`Проверка контента не пройдена (${errors.length}):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Контент корректен: ${content.jobs.length} вакансии, ${content.resources.length} материала, ${housingPhotoTotal} фото жилья.`);
