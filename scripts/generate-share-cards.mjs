import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = path.join(root, "assets", "share", "jobs");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(await fs.readFile(path.join(root, "data", "content.js"), "utf8"), sandbox);
vm.runInContext(await fs.readFile(path.join(root, "data", "locales", "pl.js"), "utf8"), sandbox);

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch (error) {
  const fallback = process.env.SHARP_MODULE_PATH;
  if (!fallback) {
    throw new Error("Pakiet sharp jest wymagany. Ustaw SHARP_MODULE_PATH lub zainstaluj sharp.", { cause: error });
  }
  ({ default: sharp } = await import(pathToFileURL(fallback).href));
}

const content = sandbox.window.PORTAL_CONTENT;
const polishJobs = sandbox.window.PORTAL_TRANSLATIONS?.pl?.jobs || {};
const statusLabels = {
  open: "REKRUTACJA OTWARTA",
  verify: "MIEJSCE DO POTWIERDZENIA",
  paused: "REKRUTACJA WSTRZYMANA",
  closed: "REKRUTACJA ZAKOŃCZONA"
};

const escapeXml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function wrapText(value, maxLength = 31, maxLines = 3) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  for (const word of words) {
    const current = lines.at(-1) || "";
    if (!current || `${current} ${word}`.length > maxLength) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  if (lines.length > maxLines) {
    const last = lines.slice(maxLines - 1).join(" ");
    lines.splice(maxLines - 1, lines.length, `${last.slice(0, maxLength - 1).trim()}…`);
  }
  return lines.slice(0, maxLines);
}

function salaryText(job, localized) {
  if (localized.salaryDisplay || job.salary?.display) {
    return localized.salaryDisplay || job.salary.display;
  }
  const salary = job.salary || {};
  const number = (value) => new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 2
  }).format(Number(value));
  const range = Number(salary.min) === Number(salary.max)
    ? number(salary.min)
    : `${number(salary.min)}–${number(salary.max)}`;
  const period = salary.period === "час" ? "godz." : salary.period === "месяц" ? "mies." : salary.period;
  return `${range} ${salary.currency || ""}${period ? ` / ${period}` : ""}`.trim();
}

function cardSvg(job) {
  const localized = { ...job, ...(polishJobs[job.id] || {}) };
  const titleLines = wrapText(localized.title, 32, 3);
  const status = statusLabels[job.status] || statusLabels.verify;
  const statusTone = job.status === "open"
    ? { fill: "#e5f5eb", text: "#12643f", dot: "#14804e" }
    : job.status === "verify"
      ? { fill: "#fff3cf", text: "#76500c", dot: "#c1840d" }
      : { fill: "#ffe9e7", text: "#7c302b", dot: "#bd4a42" };
  const title = titleLines.map((line, index) => (
    `<text x="82" y="${218 + index * 64}" font-size="52" font-weight="800" fill="#17352a">${escapeXml(line)}</text>`
  )).join("");
  const detailsY = 218 + titleLines.length * 64 + 22;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#f7faf8"/>
          <stop offset="1" stop-color="#e9f2ed"/>
        </linearGradient>
        <linearGradient id="brand" x1="0" x2="1">
          <stop offset="0" stop-color="#be2226"/>
          <stop offset="1" stop-color="#ec3a32"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      <rect x="0" y="0" width="22" height="630" fill="url(#brand)"/>
      <circle cx="1085" cy="108" r="165" fill="#d9e9df" opacity=".62"/>
      <circle cx="1110" cy="510" r="238" fill="#edf5f0"/>
      <rect x="82" y="58" width="58" height="58" rx="16" fill="#173f2f"/>
      <text x="111" y="98" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="900" fill="#fff">KJ</text>
      <text x="160" y="84" font-family="Arial, sans-serif" font-size="26" font-weight="900" letter-spacing="2" fill="#17352a">KIRIS JOBS</text>
      <text x="160" y="111" font-family="Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="3" fill="#61736b">OLEKSANDR KIRIS</text>
      <rect x="850" y="68" width="268" height="46" rx="23" fill="${statusTone.fill}"/>
      <circle cx="878" cy="91" r="7" fill="${statusTone.dot}"/>
      <text x="896" y="97" font-family="Arial, sans-serif" font-size="15" font-weight="800" fill="${statusTone.text}">${escapeXml(status)}</text>
      ${title}
      <text x="82" y="${detailsY}" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#53675e">${escapeXml(localized.format)} · ${escapeXml(localized.location)}</text>
      <line x1="82" y1="${detailsY + 36}" x2="1118" y2="${detailsY + 36}" stroke="#cad8d0" stroke-width="2"/>
      <text x="82" y="538" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="1.4" fill="#687a72">STAWKA BRUTTO</text>
      <text x="82" y="582" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#173f2f">${escapeXml(salaryText(job, localized))}</text>
      <rect x="806" y="514" width="312" height="70" rx="18" fill="#173f2f"/>
      <text x="962" y="545" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="800" fill="#fff">SZCZEGÓŁY I ANKIETA</text>
      <text x="962" y="569" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="600" fill="#cfe4d8">bezpośrednio przez WhatsApp</text>
    </svg>
  `;
}

await fs.mkdir(outputRoot, { recursive: true });
for (const job of content.jobs) {
  await sharp(Buffer.from(cardSvg(job)))
    .png({ compressionLevel: 9, palette: true })
    .toFile(path.join(outputRoot, `${job.id}.png`));
}

console.log(`Utworzono karty udostępniania: ${content.jobs.length}.`);
