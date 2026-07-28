import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const [html, legacyCss, css, cleanCss, homepageCss, candidateScript, applicationScript, serviceWorker] = await Promise.all([
  read("index.html"),
  read("assets/styles.css"),
  read("assets/candidate-base.css"),
  read("assets/clean.css"),
  read("assets/homepage.css"),
  read("assets/candidate.js"),
  read("assets/application-form.js"),
  read("sw.js")
]);

const errors = [];
const activeCss = `${css}\n${cleanCss}\n${homepageCss}`;
const buildMessageSource = applicationScript.slice(
  applicationScript.indexOf("function buildMessage()"),
  applicationScript.indexOf("async function writeMessageToClipboard")
);
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

const versionOf = (source, asset) => (
  source.match(new RegExp(`${asset.replaceAll(".", "\\.")}\\?v=(\\d+)`))?.[1]
);
const styleVersion = versionOf(html, "assets/candidate-base.css");
const cleanStyleVersion = versionOf(html, "assets/clean.css");
const homepageStyleVersion = versionOf(html, "assets/homepage.css");
const appVersion = versionOf(html, "assets/candidate.js");
const applicationVersion = versionOf(html, "assets/application-form.js");
assert(styleVersion, "index.html: candidate-base.css must have a numeric cache-busting version.");
assert(cleanStyleVersion, "index.html: clean.css must have a numeric cache-busting version.");
assert(homepageStyleVersion, "index.html: homepage.css must have a numeric cache-busting version.");
assert(appVersion, "index.html: candidate.js must have a numeric cache-busting version.");
assert(applicationVersion, "index.html: application-form.js must have a numeric cache-busting version.");
assert(
  [cleanStyleVersion, homepageStyleVersion, appVersion, applicationVersion].every((version) => version === styleVersion),
  "index.html: all candidate CSS and JS versions must match."
);
assert(
  serviceWorker.includes(`assets/candidate-base.css?v=${styleVersion}`)
    && serviceWorker.includes(`assets/clean.css?v=${cleanStyleVersion}`)
    && serviceWorker.includes(`assets/homepage.css?v=${homepageStyleVersion}`)
    && serviceWorker.includes(`assets/application-form.js?v=${applicationVersion}`)
    && serviceWorker.includes(`assets/candidate.js?v=${appVersion}`),
  "sw.js: cached CSS/JS versions must match index.html."
);
assert(
  !html.includes("assets/styles.css")
    && !serviceWorker.includes("assets/styles.css")
    && Buffer.byteLength(css) < Buffer.byteLength(legacyCss) * 0.35
    && activeCss.includes(".candidate-header")
    && activeCss.includes(".vacancy-layout")
    && activeCss.includes(".application-modal")
    && activeCss.includes(".housing-lightbox"),
  "The generated candidate CSS must replace the oversized legacy stylesheet and preserve critical UI selectors."
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
    && applicationScript.includes("EXCEL: PRZYJAZDY (11 KOLUMN)")
    && applicationScript.includes("EXCEL: KWESTIONARIUSZ WSTĘPNY (12 KOLUMN)")
    && applicationScript.includes("Wklej od pierwszej komórki:")
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
    && applicationScript.includes("const candidateName =")
    && applicationScript.includes("const summaryLocation =")
    && applicationScript.includes("const summaryReady ="),
  "Candidate convenience improvements are incomplete."
);
assert(
  applicationScript.includes("function normalizeWhatsAppMessage(")
    && applicationScript.includes("point <= 0xFFFF")
    && applicationScript.includes('"*ZGŁOSZENIE KANDYDATA*"')
    && applicationScript.includes('section("NAJWAŻNIEJSZE"')
    && applicationScript.includes('section("WSTĘPNA WERYFIKACJA"')
    && applicationScript.includes('"*EXCEL: PRZYJAZDY (11 KOLUMN)*"')
    && applicationScript.includes('"*EXCEL: KWESTIONARIUSZ WSTĘPNY (12 KOLUMN)*"')
    && applicationScript.includes('url.searchParams.set("text", normalizeWhatsAppMessage(message))')
    && !buildMessageSource.includes("\uFFFD")
    && !/[\u{10000}-\u{10FFFF}]/u.test(buildMessageSource),
  "The recruiter WhatsApp message must remain compact and Unicode-safe."
);
assert(
  homepageCss.includes("v197 · unified candidate homepage")
    && homepageCss.includes(".catalog-filters")
    && homepageCss.includes("overflow-x: auto")
    && homepageCss.includes("grid-template-columns: 1fr")
    && homepageCss.includes(".job-card-salary")
    && homepageCss.includes(".job-card-location")
    && homepageCss.includes(".job-card::before")
    && homepageCss.includes("box-shadow: none")
    && homepageCss.includes(".candidate-footer"),
  "The unified candidate homepage stylesheet is incomplete."
);
assert(
  html.includes('id="page-heading"')
    && html.includes('id="other-job-grid"')
    && html.includes('data-i18n="ui.otherVacancies"')
    && html.includes('id="catalog-date"')
    && html.includes('id="reset-filters"')
    && html.includes('class="catalog-loading-card"')
    && candidateScript.includes('data-country-filter="${escapeHTML(item.value)}"')
    && candidateScript.includes("const statusPriority =")
    && candidateScript.includes("function openJobCount()")
    && candidateScript.includes('result.filter((job) => job.status === "open")')
    && candidateScript.includes('result.filter((job) => job.status !== "open")')
    && candidateScript.includes("function catalogDate()")
    && candidateScript.includes("function resetFilters()")
    && candidateScript.includes('setAttribute("aria-busy", "false")')
    && !candidateScript.includes('class="job-subtitle"')
    && !candidateScript.includes("<span>${escapeHTML(view.level)}</span>"),
  "The candidate homepage catalogue behavior is incomplete."
);
assert(
  serviceWorker.includes('cached\n        || await caches.match("./index.html")')
    && serviceWorker.includes("event.waitUntil(networkUpdate"),
  "The offline-first homepage behavior is incomplete."
);
assert(
  cleanCss.includes("v193 · refined application form hierarchy")
    && cleanCss.includes("--application-surface-soft")
    && cleanCss.includes(".application-choice-button input:checked + span::after")
    && cleanCss.includes(".application-message-preview[open] summary > span:last-child")
    && cleanCss.includes(".application-message-preview textarea")
    && cleanCss.includes("@media (max-width: 380px)"),
  "The refined application form hierarchy is incomplete."
);
assert(
  cleanCss.includes("v194 · focused application flow")
    && cleanCss.includes(".application-review-summary")
    && cleanCss.includes(".application-submit-status")
    && applicationScript.includes('class="application-review-summary"')
    && applicationScript.includes('id="application-submit-status"')
    && applicationScript.includes("const copyPromise = writeMessageToClipboard(message)")
    && applicationScript.includes('t("form.whatsappReady")'),
  "The focused four-part application flow improvement is incomplete."
);
assert(
  cleanCss.includes("v195 · focused validation and final action")
    && cleanCss.includes(".application-review-details[open]")
    && cleanCss.includes('.whatsapp-submit[aria-busy="true"]')
    && applicationScript.includes("function focusFirstInvalidField()")
    && applicationScript.includes('class="application-review-details"')
    && applicationScript.includes('t("form.sendWhatsapp")')
    && applicationScript.includes("if (state.submitting) return")
    && applicationScript.includes('submitButton.setAttribute("aria-busy", "true")'),
  "The focused validation and final WhatsApp action improvements are incomplete."
);
assert(
  cleanCss.includes("v198 · faster candidate decision page")
    && cleanCss.includes(".vacancy-sidebar > .vacancy-status-note")
    && candidateScript.includes("function photoThumbnailUrl(")
    && candidateScript.includes("assets/housing-thumbs/")
    && candidateScript.includes('width="480" height="320"')
    && candidateScript.includes('i18n.t("ui.grossShort")')
    && applicationScript.includes('t("ui.grossShort")')
    && candidateScript.indexOf('class="vacancy-facts"') < candidateScript.indexOf('class="vacancy-status-note"'),
  "The v198 loading, salary, and vacancy-priority improvements are incomplete."
);
assert(
  homepageCss.includes('#job-grid .job-card[data-status="open"]')
    && homepageCss.includes(".recruiter-card")
    && homepageCss.includes("position: sticky")
    && homepageCss.includes("top: 54px")
    && candidateScript.includes('const cardAction = i18n.t("ui.viewOffer")')
    && candidateScript.includes('class="job-card-salary"')
    && candidateScript.includes('class="job-card-location"')
    && candidateScript.includes('class="sr-only"'),
  "The vacancy-first homepage focus is incomplete."
);
assert(
  html.includes('data-i18n="ui.availableJobs"')
    && html.includes("Znajdź pracę dla siebie")
    && html.includes("Szukaj stanowiska lub miejscowości")
    && html.includes("Bez rejestracji. Dane otrzymam dopiero po wysłaniu wiadomości.")
    && !html.includes("Wszystkie aktualne oferty")
    && !html.includes("Katalog z dnia"),
  "The concise candidate-facing homepage copy is incomplete."
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
