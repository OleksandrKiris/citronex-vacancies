(function () {
  "use strict";

  const SUPPORTED = ["ru", "uk", "pl", "en", "az", "ka", "id", "es", "fil", "ne", "hy"];
  const STORAGE_KEY = "citronex:language:v1";
  const fallbackLocale = "ru";
  const translations = window.PORTAL_TRANSLATIONS || {};
  const listeners = new Set();

  function normalizeLocale(value) {
    const normalized = String(value || "").toLowerCase().split("-")[0];
    return SUPPORTED.includes(normalized) && translations[normalized] ? normalized : "";
  }

  function initialLocale() {
    const query = normalizeLocale(new URL(window.location.href).searchParams.get("lang"));
    if (query) return query;
    try {
      const stored = normalizeLocale(localStorage.getItem(STORAGE_KEY));
      if (stored) return stored;
    } catch {
      // Local storage is optional.
    }
    return normalizeLocale(navigator.language) || fallbackLocale;
  }

  let currentLocale = initialLocale();

  function getByPath(object, path) {
    return path.split(".").reduce((value, key) => value?.[key], object);
  }

  function interpolate(value, variables) {
    return String(value).replace(/\{(\w+)\}/g, (_, key) => (
      Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : `{${key}}`
    ));
  }

  function t(path, variables = {}) {
    const current = getByPath(translations[currentLocale], path);
    const fallback = getByPath(translations[fallbackLocale], path);
    return interpolate(current ?? fallback ?? path, variables);
  }

  function deepMerge(base, overlay) {
    if (Array.isArray(overlay)) return [...overlay];
    if (!overlay || typeof overlay !== "object") return overlay === undefined ? base : overlay;
    const result = { ...(base || {}) };
    Object.entries(overlay).forEach(([key, value]) => {
      result[key] = value && typeof value === "object" && !Array.isArray(value)
        ? deepMerge(base?.[key], value)
        : value;
    });
    return result;
  }

  function job(baseJob) {
    const overlay = translations[currentLocale]?.jobs?.[baseJob.id] || {};
    const localized = deepMerge(baseJob, overlay);
    localized.salary = { ...(baseJob.salary || {}), ...(overlay.salary || {}) };
    if (overlay.salaryDisplay) localized.salary.display = overlay.salaryDisplay;
    if (overlay.salaryNote) localized.salary.note = overlay.salaryNote;
    return localized;
  }

  function localeTag(locale = currentLocale) {
    return translations[locale]?.meta?.locale || locale;
  }

  function languageName(locale) {
    return translations[locale]?.meta?.name || locale.toUpperCase();
  }

  function countryName(code, locale = currentLocale) {
    if (code === "OTHER") return translations[locale]?.options?.other || translations.ru.options.other;
    try {
      const requestedLocale = localeTag(locale);
      const displayNames = new Intl.DisplayNames([requestedLocale], { type: "region" });
      const requestedLanguage = requestedLocale.toLowerCase().split("-")[0];
      const resolvedLanguage = displayNames.resolvedOptions().locale.toLowerCase().split("-")[0];
      if (requestedLanguage !== resolvedLanguage) throw new Error("Unsupported display-name locale");
      return displayNames.of(code) || code;
    } catch {
      try {
        return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
      } catch {
        return code;
      }
    }
  }

  function applyStaticTranslations(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-html]").forEach((node) => {
      node.innerHTML = t(node.dataset.i18nHtml);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
      node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((node) => {
      node.setAttribute("title", t(node.dataset.i18nTitle));
    });
    document.documentElement.lang = currentLocale;
    const pack = translations[currentLocale] || translations[fallbackLocale];
    if (pack?.ui?.metaTitle) document.title = pack.ui.metaTitle;
  }

  function populateLanguageSelect() {
    const select = document.getElementById("language-select");
    if (!select) return;
    select.innerHTML = SUPPORTED.filter((locale) => translations[locale]).map((locale) => (
      `<option value="${locale}">${languageName(locale)}</option>`
    )).join("");
    select.value = currentLocale;
  }

  function setLocale(locale, options = {}) {
    const next = normalizeLocale(locale);
    if (!next) return false;
    currentLocale = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Local storage is optional.
    }
    if (options.updateUrl !== false) {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      history.replaceState(history.state, "", url);
    }
    populateLanguageSelect();
    applyStaticTranslations();
    listeners.forEach((listener) => listener(next));
    window.dispatchEvent(new CustomEvent("portal:languagechange", { detail: { locale: next } }));
    return true;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function init() {
    populateLanguageSelect();
    applyStaticTranslations();
    document.getElementById("language-select")?.addEventListener("change", (event) => {
      setLocale(event.target.value);
    });
  }

  window.PortalI18n = {
    supported: SUPPORTED,
    t,
    job,
    countryName,
    languageName,
    localeTag,
    get locale() {
      return currentLocale;
    },
    setLocale,
    subscribe,
    applyStaticTranslations,
    init
  };
})();
