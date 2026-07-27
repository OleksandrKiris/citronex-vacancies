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
    && applicationScript.includes("DRAFT_MAX_AGE"),
  "assets/application-form.js: candidate drafts must be saved and restored with an expiry."
);
assert(
  applicationScript.includes('class="application-optional"')
    && applicationScript.includes("isPhysicalJob()"),
  "assets/application-form.js: optional answers and vacancy-specific physical questions are required."
);
assert(
  candidateScript.includes('aria-label="${escapeHTML(`${i18n.t("ui.details")}: ${view.title}`)}"'),
  "assets/candidate.js: each full-card vacancy link needs a specific accessible label."
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
