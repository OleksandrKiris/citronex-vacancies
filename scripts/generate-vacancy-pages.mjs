import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const templatePath = path.join(root, "index.html");
const contentPath = path.join(root, "data", "content.js");
const polishLocalePath = path.join(root, "data", "locales", "pl.js");
const outputRoot = path.join(root, "vacancies");

const template = await fs.readFile(templatePath, "utf8");
const contentSource = await fs.readFile(contentPath, "utf8");
const polishLocaleSource = await fs.readFile(polishLocalePath, "utf8");
const sandbox = { window: {} };
vm.runInNewContext(contentSource, sandbox, { filename: contentPath });
vm.runInNewContext(polishLocaleSource, sandbox, { filename: polishLocalePath });

const content = sandbox.window.PORTAL_CONTENT;
const polishJobs = sandbox.window.PORTAL_TRANSLATIONS?.pl?.jobs || {};
if (!content?.site?.baseUrl || !Array.isArray(content.jobs)) {
  throw new Error("Не удалось прочитать вакансии из data/content.js");
}

const escapeAttribute = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const replaceMeta = (html, selector, value) => {
  const pattern = new RegExp(`(<meta ${selector} content=")[^"]*(">)`);
  return html.replace(pattern, `$1${escapeAttribute(value)}$2`);
};

const salaryText = (job, localized) => {
  const salary = job.salary || {};
  if (localized.salaryDisplay || salary.display) return localized.salaryDisplay || salary.display;
  const number = (value) => new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 2
  }).format(Number(value));
  const range = salary.min === salary.max ? number(salary.min) : `${number(salary.min)}–${number(salary.max)}`;
  const period = salary.period === "час" ? "godz." : salary.period === "месяц" ? "mies." : salary.period;
  return [range, salary.currency, period ? `/ ${period}` : ""].filter(Boolean).join(" ");
};

await fs.mkdir(outputRoot, { recursive: true });

for (const job of content.jobs) {
  const localized = { ...job, ...(polishJobs[job.id] || {}) };
  const pageUrl = new URL(`vacancies/${encodeURIComponent(job.id)}/`, content.site.baseUrl).toString();
  const imageUrl = new URL(`assets/share/jobs/${encodeURIComponent(job.id)}.png?v=197`, content.site.baseUrl).toString();
  const title = `${localized.title} · ${job.company} · Kiris Jobs`;
  const description = [
    localized.summary,
    localized.location ? `${localized.format}, ${localized.location}.` : "",
    salaryText(job, localized) ? `Stawka: ${salaryText(job, localized).replace(/[.]+$/, "")}.` : "",
    "Warunki, zdjęcia zakwaterowania i ankieta do wysłania przez WhatsApp."
  ].filter(Boolean).join(" ");

  let html = template;
  html = html.replace("<meta charset=\"utf-8\">", "<meta charset=\"utf-8\">\n  <base href=\"../../\">");
  html = replaceMeta(html, 'name="description"', description);
  html = replaceMeta(html, 'property="og:title"', title);
  html = replaceMeta(html, 'property="og:description"', description);
  html = replaceMeta(html, 'property="og:url"', pageUrl);
  html = replaceMeta(html, 'property="og:image"', imageUrl);
  html = replaceMeta(html, 'property="og:image:alt"', `${localized.title} — Kiris Jobs`);
  html = replaceMeta(html, 'name="twitter:title"', title);
  html = replaceMeta(html, 'name="twitter:description"', description);
  html = replaceMeta(html, 'name="twitter:image"', imageUrl);
  html = html.replace(/<link rel="canonical" href="[^"]+">/, `<link rel="canonical" href="${escapeAttribute(pageUrl)}">`);
  html = html.replace(/<title>[^<]+<\/title>/, `<title>${escapeAttribute(title)}</title>`);

  const schema = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: localized.title,
    description: [localized.summary, ...(localized.responsibilities || []), ...(localized.required || [])].join(" "),
    datePosted: job.publishedAt,
    employmentType: "FULL_TIME",
    url: pageUrl,
    hiringOrganization: {
      "@type": "Organization",
      name: job.company
    }
  };
  html = html.replace(
    "</head>",
    `  <script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>\n</head>`
  );

  const outputDirectory = path.join(outputRoot, job.id);
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(path.join(outputDirectory, "index.html"), html, "utf8");
}

console.log(`Созданы отдельные страницы вакансий: ${content.jobs.length}.`);
