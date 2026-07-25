(function () {
  "use strict";

  const SUPPORTED = ["ru", "uk", "pl", "en", "az", "ka", "id", "es", "fil", "ne", "hy"];
  const LANGUAGE_FLAGS = {
    ru: "🇷🇺",
    uk: "🇺🇦",
    pl: "🇵🇱",
    en: "🇬🇧",
    az: "🇦🇿",
    ka: "🇬🇪",
    id: "🇮🇩",
    es: "🇪🇸",
    fil: "🇵🇭",
    ne: "🇳🇵",
    hy: "🇦🇲"
  };
  const STORAGE_KEY = "citronex:language:v1";
  const fallbackLocale = "ru";
  const translations = window.PORTAL_TRANSLATIONS || {};
  const listeners = new Set();
  let languageSwitcher = null;

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

  function languageFlag(locale) {
    return LANGUAGE_FLAGS[locale] || "🌐";
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
    renderLanguageSwitcher();
  }

  function closeLanguageSwitcher(restoreFocus = false) {
    if (!languageSwitcher) return;
    languageSwitcher.menu.hidden = true;
    languageSwitcher.root.classList.remove("is-open");
    languageSwitcher.button.setAttribute("aria-expanded", "false");
    if (restoreFocus) languageSwitcher.button.focus({ preventScroll: true });
  }

  function renderLanguageSwitcher() {
    if (!languageSwitcher) return;
    const currentName = languageName(currentLocale);
    languageSwitcher.button.querySelector("[data-language-flag]").textContent = languageFlag(currentLocale);
    languageSwitcher.button.querySelector("[data-language-code]").textContent = currentLocale.toUpperCase();
    languageSwitcher.button.querySelector("[data-language-name]").textContent = currentName;
    languageSwitcher.button.setAttribute("aria-label", `${t("ui.language")}: ${currentName}`);
    languageSwitcher.menu.setAttribute("aria-label", t("ui.language"));
    languageSwitcher.menu.querySelectorAll("[data-language-option]").forEach((option) => {
      const selected = option.dataset.languageOption === currentLocale;
      option.classList.toggle("is-active", selected);
      option.setAttribute("aria-selected", String(selected));
      option.querySelector("[data-language-status]").textContent = selected ? "\u2713" : "";
    });
  }

  function enhanceLanguageSelect() {
    if (languageSwitcher) return;
    const select = document.getElementById("language-select");
    const fallback = select?.closest(".language-control");
    if (!select || !fallback) return;

    const root = document.createElement("div");
    root.className = "language-switcher";
    root.innerHTML = `
      <button class="language-switcher-button" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span class="language-switcher-flag" data-language-flag aria-hidden="true"></span>
        <span class="language-switcher-current">
          <small data-language-code></small>
          <strong data-language-name></strong>
        </span>
        <span class="language-switcher-chevron" aria-hidden="true"></span>
      </button>
      <div class="language-switcher-menu" role="listbox" hidden>
        <div class="language-switcher-grid">
          ${SUPPORTED.filter((locale) => translations[locale]).map((locale) => `
            <button
              class="language-switcher-option"
              type="button"
              role="option"
              data-language-option="${locale}"
              aria-selected="false"
            >
              <span class="language-switcher-index language-switcher-option-flag" aria-hidden="true">${languageFlag(locale)}</span>
              <span class="language-switcher-option-copy">
                <strong>${languageName(locale)}</strong>
                <small>${locale.toUpperCase()}</small>
              </span>
              <span class="language-switcher-status" data-language-status aria-hidden="true"></span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
    fallback.insertAdjacentElement("afterend", root);
    fallback.classList.add("is-enhanced-fallback");

    languageSwitcher = {
      root,
      button: root.querySelector(".language-switcher-button"),
      menu: root.querySelector(".language-switcher-menu")
    };

    languageSwitcher.button.addEventListener("click", () => {
      const opening = languageSwitcher.menu.hidden;
      if (!opening) {
        closeLanguageSwitcher();
        return;
      }
      languageSwitcher.menu.hidden = false;
      languageSwitcher.root.classList.add("is-open");
      languageSwitcher.button.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => {
        languageSwitcher.menu.querySelector(".is-active")?.focus({ preventScroll: true });
      });
    });

    languageSwitcher.menu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-language-option]");
      if (!option) return;
      setLocale(option.dataset.languageOption);
      closeLanguageSwitcher(true);
    });

    languageSwitcher.menu.addEventListener("keydown", (event) => {
      const options = [...languageSwitcher.menu.querySelectorAll("[data-language-option]")];
      const currentIndex = options.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeLanguageSwitcher(true);
        return;
      }
      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = currentIndex;
      if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = options.length - 1;
      else if (["ArrowDown", "ArrowRight"].includes(event.key)) nextIndex = (currentIndex + 1 + options.length) % options.length;
      else nextIndex = (currentIndex - 1 + options.length) % options.length;
      options[nextIndex]?.focus({ preventScroll: true });
    });

    document.addEventListener("pointerdown", (event) => {
      if (!languageSwitcher.menu.hidden && !languageSwitcher.root.contains(event.target)) {
        closeLanguageSwitcher();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !languageSwitcher.menu.hidden) closeLanguageSwitcher(true);
    });
    renderLanguageSwitcher();
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
    enhanceLanguageSelect();
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
