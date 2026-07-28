import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const [html, css, cleanCss, candidateScript, applicationScript, serviceWorker] = await Promise.all([
  read("index.html"),
  read("assets/styles.css"),
  read("assets/clean.css"),
  read("assets/candidate.js"),
  read("assets/application-form.js"),
  read("sw.js")
]);

const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

const versionOf = (source, asset) => (
  source.match(new RegExp(`${asset.replaceAll(".", "\\.")}\\?v=(\\d+)`))?.[1]
);
const styleVersion = versionOf(html, "assets/styles.css");
const cleanStyleVersion = versionOf(html, "assets/clean.css");
const appVersion = versionOf(html, "assets/candidate.js");
const applicationVersion = versionOf(html, "assets/application-form.js");
assert(styleVersion, "index.html: styles.css must have a numeric cache-busting version.");
assert(cleanStyleVersion, "index.html: clean.css must have a numeric cache-busting version.");
assert(appVersion, "index.html: candidate.js must have a numeric cache-busting version.");
assert(applicationVersion, "index.html: application-form.js must have a numeric cache-busting version.");
assert(
  [cleanStyleVersion, appVersion, applicationVersion].every((version) => version === styleVersion),
  "index.html: all candidate CSS and JS versions must match."
);
assert(
  serviceWorker.includes(`assets/styles.css?v=${styleVersion}`)
    && serviceWorker.includes(`assets/clean.css?v=${cleanStyleVersion}`)
    && serviceWorker.includes(`assets/application-form.js?v=${applicationVersion}`)
    && serviceWorker.includes(`assets/candidate.js?v=${appVersion}`),
  "sw.js: cached CSS/JS versions must match index.html."
);
assert(
  serviceWorker.includes(`v${styleVersion}-`),
  "sw.js: CACHE_VERSION must include the current UI version."
);

const staticIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = staticIds.filter((id, index) => staticIds.indexOf(id) !== index);
assert(duplicateIds.length === 0, `index.html: duplicate ids: ${[...new Set(duplicateIds)].join(", ")}`);

for (const match of html.matchAll(/<dialog\b[^>]*>/g)) {
  assert(
    /\saria-(?:label|labelledby)="[^"]+"/.test(match[0]),
    `index.html: dialog has no accessible name: ${match[0]}`
  );
}

for (const match of html.matchAll(/<img\b[^>]*>/g)) {
  assert(/\salt="[^"]*"/.test(match[0]), `index.html: image has no alt attribute: ${match[0]}`);
  assert(/\swidth="\d+"/.test(match[0]), `index.html: image has no width: ${match[0]}`);
  assert(/\sheight="\d+"/.test(match[0]), `index.html: image has no height: ${match[0]}`);
}

for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
  assert(
    /\srel="[^"]*(?:noopener|noreferrer)[^"]*"/.test(match[0]),
    `index.html: external target=_blank link lacks a safe rel: ${match[0]}`
  );
}

for (const match of html.matchAll(/<button\b[^>]*>/g)) {
  assert(/\stype="button"/.test(match[0]), `index.html: button must declare type="button": ${match[0]}`);
}

assert(
  (html.match(/data-i18n-aria-label="ui\.mainNavigation"/g) || []).length === 1,
  "index.html: the simplified vacancy catalog needs one localized mainNavigation label."
);
assert(
  serviceWorker.includes("key.startsWith(CACHE_PREFIX)"),
  "sw.js: activation must only remove this app's caches."
);
assert(
  serviceWorker.includes("cache.addAll([...CORE_SHELL, ...OPTIONAL_LOCALES])"),
  "sw.js: every locale must be guaranteed in the offline app shell."
);
assert(
  cleanCss.includes(".direct-vacancy-page:not(.standalone-application-page) .vacancy-layout")
    && cleanCss.includes("flex-direction: column")
    && cleanCss.includes(".vacancy-facts")
    && cleanCss.includes("width: 100% !important"),
  "assets/clean.css: mobile vacancy facts must stay full-width and precede the long description."
);
assert(
  applicationScript.includes("localStorage.setItem(draftKey(state.jobId)")
    && applicationScript.includes("readDraft(state.jobId)")
    && applicationScript.includes("DRAFT_MAX_AGE")
    && applicationScript.includes("function clearDraft()")
    && applicationScript.includes("localStorage.removeItem(draftKey(state.jobId))"),
  "assets/application-form.js: candidate drafts must be saved and restored with an expiry."
);
assert(
  applicationScript.includes('class="application-optional"')
    && applicationScript.includes("isPhysicalJob()")
    && applicationScript.includes("function renderPrecheck(")
    && applicationScript.includes("precheckComplete"),
  "assets/application-form.js: optional answers and vacancy-specific physical questions are required."
);
assert(
  applicationScript.includes("function choiceButtons(")
    && applicationScript.includes('type="radio"')
    && applicationScript.includes("application-progress-meta")
    && applicationScript.includes("data-edit-application-step")
    && applicationScript.includes('class="application-message-preview"')
    && applicationScript.includes("application-field-error"),
  "assets/application-form.js: the calm mobile form needs choice buttons, compact progress, inline errors and editable review sections."
);
assert(
  !applicationScript.includes('field("employerTransport"')
    && !applicationScript.includes('field("independentArrival"')
    && !applicationScript.includes("Potrzebny transport pracodawcy")
    && !applicationScript.includes("Może przyjechać samodzielnie"),
  "assets/application-form.js: transport questions must not return to the candidate form or recruiter message."
);
assert(
  applicationScript.includes('field("gender"')
    && applicationScript.includes('field("formerCitronexWorker"')
    && applicationScript.includes("function arrivalsExcelRow(record)")
    && applicationScript.includes("function questionnaireExcelRow(record)")
    && applicationScript.includes('recruiter: profile.name || "Oleksandr Kiris"')
    && applicationScript.includes("PRZYJAZDY — WIERSZ DO EXCEL")
    && applicationScript.includes("KWESTIONARIUSZ — WIERSZ WSTĘPNY")
    && applicationScript.includes("/^[=+\\-@]/"),
  "assets/application-form.js: the recruiter workflow must provide safe Excel-ready Przyjazdy and Kwestionariusz rows."
);
assert(
  applicationScript.includes('field("hasPesel"')
    && applicationScript.includes('field("passportNumber"')
    && applicationScript.includes('field("passportExpiry"')
    && applicationScript.includes('field("emergencyContactName"')
    && applicationScript.includes('field("emergencyContactPhone"')
    && applicationScript.includes("function validPesel(value)")
    && applicationScript.includes("SENSITIVE_DRAFT_FIELDS")
    && applicationScript.includes("!SENSITIVE_DRAFT_FIELDS.has(key)")
    && applicationScript.includes("function isoWeekLabel(value)")
    && applicationScript.includes('employeeStatus: state.values.formerCitronexWorker === "yes" ? "stary" : "nowy"'),
  "assets/application-form.js: onboarding fields, Polish Excel formats and sensitive-draft protection are incomplete."
);
assert(
  applicationScript.includes("function peselIdentity(value)")
    && applicationScript.includes("function passportExpiresSoon(value)")
    && applicationScript.includes("function candidateDecision(job, flags)")
    && applicationScript.includes('status: "GOTOWY"')
    && applicationScript.includes('status: "DO WERYFIKACJI"')
    && applicationScript.includes('status: "BRAK WARUNKÓW"')
    && applicationScript.includes('field("preferredLocation"')
    && applicationScript.includes('field("groupCode"')
    && applicationScript.includes("function createGroupCode()")
    && applicationScript.includes("JOB_LOCATIONS"),
  "assets/application-form.js: identity checks, recruiter decision, exact location or linked group applications are incomplete."
);
assert(
  applicationScript.includes("const section = (title, lines)")
    && applicationScript.includes('line("E-mail", record.e)')
    && applicationScript.includes('line("Praca stojąca", record.standing, record.physical)')
    && applicationScript.includes('line("Kod grupy", record.group, groupApplication)')
    && !applicationScript.includes('`*E-mail:* ${record.e || "—"}`')
    && !applicationScript.includes('`*Kwalifikacje:* ${record.q.join("; ") || "—"}`'),
  "assets/application-form.js: recruiter message must omit empty and irrelevant rows."
);
assert(
  cleanCss.includes("v184 · focused application cleanup")
    && cleanCss.includes("min-height: 46px")
    && cleanCss.includes(".application-security"),
  "assets/clean.css: focused mobile application cleanup is incomplete."
);
assert(
  cleanCss.includes("v179 · calm mobile-first application form")
    && cleanCss.includes(".application-choice-buttons")
    && cleanCss.includes("position: sticky")
    && cleanCss.includes(".application-review-group > header"),
  "assets/clean.css: the v179 mobile application visual layer is incomplete."
);
assert(
  cleanCss.includes("v185 · project-wide visual consistency audit")
    && cleanCss.includes(".language-switcher-menu::before")
    && cleanCss.includes("max-height: min(560px, calc(100dvh - 88px))")
    && cleanCss.includes(".application-modal::before")
    && cleanCss.includes(".application-actions .button-primary::after")
    && cleanCss.includes(".vacancy-columns li")
    && cleanCss.includes("@media (max-width: 390px)"),
  "assets/clean.css: project-wide visual cleanup is incomplete."
);
assert(
  cleanCss.includes("v186 · focused convenience improvements")
    && cleanCss.includes(".housing-lightbox-stage")
    && cleanCss.includes("touch-action: pan-y")
    && candidateScript.includes("function ensureHousingLightbox()")
    && candidateScript.includes("function moveHousingPhoto(delta)")
    && candidateScript.includes('i18n.t("ui.photoCounter"')
    && applicationScript.includes("function normalizePhoneInput(")
    && applicationScript.includes("function bindApplicationInputNormalization(")
    && applicationScript.includes('data-normalize="digits"')
    && applicationScript.includes('data-normalize="passport"')
    && applicationScript.includes("const recruiterHeadline =")
    && applicationScript.includes("record.decision.status} · ${candidateName} · ${record.j}"),
  "Candidate convenience improvements are incomplete."
);
assert(
  cleanCss.includes("v187 · simplified vacancy catalogue")
    && cleanCss.includes(".country-filter-buttons button.is-active")
    && cleanCss.includes("grid-template-columns: repeat(2, minmax(0, 1fr))")
    && candidateScript.includes('data-country-filter="${escapeHTML(item.value)}"')
    && candidateScript.includes("const statusPriority =")
    && !candidateScript.includes("<span>${escapeHTML(view.level)}</span>"),
  "The simplified main vacancy catalogue is incomplete."
);
assert(
  cleanCss.includes("v188 · focused homepage hierarchy")
    && cleanCss.includes(".catalog-list-heading")
    && cleanCss.includes(".other-jobs summary")
    && cleanCss.includes(".job-card-link:focus-visible")
    && html.includes('id="page-heading"')
    && html.includes('id="other-job-grid"')
    && html.includes('data-i18n="ui.otherVacancies"')
    && candidateScript.includes("function openJobCount()")
    && candidateScript.includes('result.filter((job) => job.status === "open")')
    && candidateScript.includes('result.filter((job) => job.status !== "open")')
    && !candidateScript.includes('class="job-subtitle"'),
  "The focused candidate homepage is incomplete."
);
assert(
  cleanCss.includes("v189 · offline-first homepage polish")
    && cleanCss.includes(".catalog-loading-card")
    && cleanCss.includes(".candidate-empty-actions")
    && html.includes('id="catalog-date"')
    && html.includes('id="reset-filters"')
    && html.includes('class="catalog-loading-card"')
    && candidateScript.includes("function catalogDate()")
    && candidateScript.includes("function resetFilters()")
    && candidateScript.includes('setAttribute("aria-busy", "false")')
    && serviceWorker.includes('cached\n        || await caches.match("./index.html")')
    && serviceWorker.includes("event.waitUntil(networkUpdate"),
  "The offline-first homepage improvements are incomplete."
);
assert(
  cleanCss.includes("v190 · lighter candidate visual hierarchy")
    && cleanCss.includes(".job-tags .job-status")
    && cleanCss.includes(".job-card-facts > div:first-child dd")
    && cleanCss.includes(".job-card-link:active")
    && cleanCss.includes(".safety-panel .eyebrow")
    && cleanCss.includes(".candidate-footer"),
  "The lighter candidate visual hierarchy is incomplete."
);
assert(
  candidateScript.includes('aria-label="${escapeHTML(accessibleLabel)}"')
    && candidateScript.includes('class="job-card-link job-open"'),
  "assets/candidate.js: each full-card vacancy link needs a specific accessible label."
);
assert(
  candidateScript.includes("function canApply(job)")
    && candidateScript.includes("recruitmentPaused")
    && candidateScript.includes("vacancy-application-unavailable"),
  "assets/candidate.js: vacancy status must control whether the application can be opened."
);

const requiredOfflineFonts = [
  "noto-sans-georgian-variable.woff2",
  "noto-sans-armenian-variable.woff2",
  "noto-sans-devanagari-variable.woff2"
];
for (const font of requiredOfflineFonts) {
  assert(css.includes(`fonts/${font}`), `assets/styles.css: missing @font-face for ${font}.`);
  assert(serviceWorker.includes(`assets/fonts/${font}`), `sw.js: ${font} is not cached offline.`);
}

const localFiles = new Set();
for (const match of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
  const ref = match[1];
  if (/^(?:https?:|mailto:|tel:|#)/.test(ref)) continue;
  localFiles.add(ref.split(/[?#]/)[0]);
}
for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
  const ref = match[1];
  if (/^(?:data:|https?:)/.test(ref)) continue;
  localFiles.add(path.posix.join("assets", ref).split(/[?#]/)[0]);
}
for (const match of serviceWorker.matchAll(/["']\.\/([^"'?]+)(?:\?[^"']*)?["']/g)) {
  localFiles.add(match[1]);
}

for (const relativePath of localFiles) {
  if (!relativePath || relativePath === ".") continue;
  try {
    await access(path.join(root, relativePath));
  } catch {
    errors.push(`Missing local UI asset: ${relativePath}`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`UI quality check passed: ${staticIds.length} static ids, ${localFiles.size} local assets, v${styleVersion}.`);
