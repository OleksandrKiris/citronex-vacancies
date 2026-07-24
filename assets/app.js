(() => {
  "use strict";

  const content = window.PORTAL_CONTENT;
  const i18n = window.PortalI18n;
  if (!content || !i18n) {
    document.body.innerHTML = "<p style='padding:2rem'>Не удалось загрузить данные портала.</p>";
    return;
  }

  const { site, profile, jobs, resources, process, privacy, faq } = content;
  const t = (path, variables) => i18n.t(path, variables);
  const localizedJob = (job) => i18n.job(job);
  const STORAGE = {
    favorites: "career-hub:favorites:v1",
    compare: "career-hub:compare:v1",
    notes: "career-hub:notes:v1"
  };
  const validRoutes = ["home", "jobs", "resources", "saved", "profile"];
  const state = {
    favorites: readStringSet(STORAGE.favorites),
    compare: readStringSet(STORAGE.compare),
    notes: readObject(STORAGE.notes),
    resourceCategory: "__all__",
    installPrompt: null,
    toastTimer: null,
    jobReturnRoute: "jobs",
    openJobId: ""
  };

  const el = (id) => document.getElementById(id);
  const els = (selector, root = document) => [...root.querySelectorAll(selector)];

  function readStringSet(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return new Set(Array.isArray(value) ? value.filter((item) => typeof item === "string") : []);
    } catch {
      return new Set();
    }
  }

  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function persistSet(key, set) {
    try {
      localStorage.setItem(key, JSON.stringify([...set]));
    } catch {
      showToast(t("ui.noteHelp"));
    }
  }

  function persistNotes() {
    try {
      localStorage.setItem(STORAGE.notes, JSON.stringify(state.notes));
    } catch {
      showToast(t("ui.noteHelp"));
    }
  }

  function escapeHTML(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatSalary(salary) {
    if (!salary) return t("ui.grossSalary");
    if (salary.display) return escapeHTML(salary.display);
    if (salary.min == null || salary.max == null) return t("ui.grossSalary");
    const hasDecimals = !Number.isInteger(salary.min) || !Number.isInteger(salary.max);
    const numberOptions = {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0
    };
    const requestedLocale = i18n.localeTag();
    let formatter = new Intl.NumberFormat(requestedLocale, numberOptions);
    const requestedLanguage = requestedLocale.toLowerCase().split("-")[0];
    const resolvedLanguage = formatter.resolvedOptions().locale.toLowerCase().split("-")[0];
    if (requestedLanguage !== resolvedLanguage) formatter = new Intl.NumberFormat("en", numberOptions);
    const amount = salary.min === salary.max
      ? formatter.format(salary.min)
      : `${formatter.format(salary.min)}–${formatter.format(salary.max)}`;
    const periods = {
      ru: { "час": "час", "месяц": "месяц" },
      uk: { "час": "год", "месяц": "місяць" },
      pl: { "час": "godz.", "месяц": "mies." },
      en: { "час": "hour", "месяц": "month" },
      az: { "час": "saat", "месяц": "ay" },
      ka: { "час": "საათი", "месяц": "თვე" },
      id: { "час": "jam", "месяц": "bulan" },
      es: { "час": "hora", "месяц": "mes" },
      fil: { "час": "oras", "месяц": "buwan" },
      ne: { "час": "घण्टा", "месяц": "महिना" },
      hy: { "час": "ժամ", "месяц": "ամիս" }
    };
    const period = periods[i18n.locale]?.[salary.period] || salary.period;
    return `${amount} ${escapeHTML(salary.currency)} / ${escapeHTML(period)}`;
  }

  function formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(`${dateString}T12:00:00`);
    try {
      const locale = i18n.localeTag();
      const formatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });
      const requestedLanguage = locale.toLowerCase().split("-")[0];
      const resolvedLanguage = formatter.resolvedOptions().locale.toLowerCase().split("-")[0];
      return requestedLanguage === resolvedLanguage ? formatter.format(date) : dateString;
    } catch {
      return dateString;
    }
  }

  function jobById(id) {
    return jobs.find((job) => job.id === id);
  }

  function jobVisualType(id = "") {
    if (id === "plant-protection" || id === "greenhouse-agronomist") return "agronomy";
    if (id.startsWith("greenhouse-")) return "greenhouse";
    if (id.includes("warehouse") || id === "forklift-udt" || id === "tomato-sorting") return "warehouse";
    if (id.startsWith("driver-")) return "transport";
    if (id === "truck-mechanic") return "technical";
    if (id === "team-leader") return "management";
    return "general";
  }

  function svgIcon(name, className = "ui-icon") {
    return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="assets/icons.svg#icon-${name}"></use></svg>`;
  }

  function jobVisualIconName(visualType) {
    const iconByVisual = {
      greenhouse: "greenhouse",
      warehouse: "warehouse",
      transport: "truck",
      technical: "tools",
      management: "people",
      agronomy: "greenhouse",
      general: "jobs"
    };
    return iconByVisual[visualType] || "jobs";
  }

  function favoriteActionMarkup(favorite, savedLabel, saveLabel) {
    return `<span aria-hidden="true">${favorite ? "♥" : "♡"}</span><span>${escapeHTML(favorite ? savedLabel : saveLabel)}</span>`;
  }

  function compareActionMarkup(compared, comparedLabel, compareLabel) {
    return `${compared ? svgIcon("check") : '<span aria-hidden="true">＋</span>'}<span>${escapeHTML(compared ? comparedLabel : compareLabel)}</span>`;
  }

  function resourceIconName(id = "") {
    const iconById = {
      "pay-and-hours": "jobs",
      "locations-guide": "location",
      "arrival-first-day": "truck",
      "housing-rules": "home",
      "documents-countries": "jobs",
      "candidate-faq": "globe",
      "application-guide": "match",
      "privacy-guide": "shield",
      "conditions-guide": "check",
      "offline-guide": "check"
    };
    return iconById[id] || "jobs";
  }

  function showToast(message, actionLabel = "", action = null) {
    const toast = el("toast");
    const actionButton = el("toast-action");
    clearTimeout(state.toastTimer);
    el("toast-message").textContent = message;
    actionButton.hidden = !actionLabel;
    actionButton.textContent = actionLabel;
    actionButton.onclick = action;
    toast.hidden = false;
    state.toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, actionLabel ? 10000 : 4200);
  }

  async function copyText(text, successMessage) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.append(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      showToast(successMessage);
    } catch {
      showToast(t("ui.share"));
    }
  }

  function openWhatsAppSafety(url) {
    if (!url) return;
    if (!navigator.onLine) {
      showToast(t("ui.whatsappNeedsInternet"));
      return;
    }
    const dialog = el("whatsapp-safety-dialog");
    const container = el("whatsapp-safety-content");
    if (!dialog || !container) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    container.innerHTML = `
      <header class="whatsapp-safety-header">
        <span class="candidate-safety-icon" aria-hidden="true">${svgIcon("shield")}</span>
        <div>
          <p class="overline">${escapeHTML(t("ui.privacy"))}</p>
          <h2 id="whatsapp-safety-title">${escapeHTML(t("ui.recruiterEyebrow"))}</h2>
        </div>
      </header>
      <div class="whatsapp-recipient">
        <span>${escapeHTML(profile.name)}</span>
        <strong>${escapeHTML(profile.phone)}</strong>
        <small>WhatsApp</small>
      </div>
      <p class="whatsapp-safety-warning">${escapeHTML(t("ui.antiFraudWarning"))}</p>
      <div class="whatsapp-safety-actions">
        <button class="button button-secondary" type="button" data-close-dialog>${escapeHTML(t("ui.close"))}</button>
        <a class="button button-whatsapp" data-whatsapp-confirmed href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">
          ${svgIcon("whatsapp")}<span>${escapeHTML(t("form.openWhatsapp"))}</span>
        </a>
      </div>
    `;
    container.querySelector("[data-whatsapp-confirmed]")?.addEventListener("click", () => {
      if (dialog.open) dialog.close();
    }, { once: true });
    if (!dialog.open) dialog.showModal();
  }

  window.PortalWhatsApp = { open: openWhatsAppSafety };

  function renderProfileContent() {
    document.title = `${t("ui.navJobs")} Citronex · ${i18n.languageName(i18n.locale)}`;
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("ui.heroIntro"));
    const recruiterRole = `Citronex · ${t("ui.recruiterProfile")}`;
    const recruiterLocations = `${t("ui.navJobs")}: ${i18n.countryName("PL")} · ${i18n.countryName("HU")} · ${i18n.countryName("BE")}`;

    [
      ["brand-name", profile.name],
      ["hero-name", profile.name],
      ["profile-name", profile.name],
      ["footer-name", profile.name],
      ["hero-role", recruiterRole],
      ["profile-role", recruiterRole],
      ["footer-role", recruiterRole],
      ["hero-location", recruiterLocations],
      ["hero-languages", (profile.channels || profile.languages || []).join(" · ")],
      ["hero-availability", t("ui.heroKicker")],
      ["hero-intro", t("ui.heroIntro")],
      ["profile-bio", t("ui.heroIntro")],
      ["hero-promise", `«${t("ui.bannerText")}»`],
      ["hero-response-time", profile.workHours || t("ui.workHours")],
      ["hero-work-hours", `${profile.workHours || t("ui.workHours")} · ${profile.timezone}`],
      ["contact-response", profile.workHours || t("ui.workHours")],
      ["contact-timezone", profile.timezone],
      ["hero-avatar", profile.initials],
      ["profile-avatar", profile.initials]
    ].forEach(([id, value]) => {
      if (el(id)) el(id).textContent = value;
    });
    if (el("hero-whatsapp-direct")) {
      el("hero-whatsapp-direct").href = profile.whatsapp;
      el("hero-whatsapp-direct").innerHTML = `${svgIcon("whatsapp")}<span class="sr-only">WhatsApp · ${escapeHTML(profile.phone)}</span>`;
    }

    const mailSubject = encodeURIComponent(`${t("ui.navJobs")} · Citronex`);
    const mailBody = encodeURIComponent(`${t("ui.directQuestion")}:\n\n`);
    const mailto = `mailto:${profile.email}?subject=${mailSubject}&body=${mailBody}`;
    el("profile-email-link").href = mailto;
    const primaryContact = profile.whatsapp || mailto;
    el("header-contact").href = primaryContact;
    document.querySelector(".mobile-nav-whatsapp")?.setAttribute("href", primaryContact);
    if (el("candidate-safety-contact")) el("candidate-safety-contact").href = primaryContact;
    if (el("candidate-safety-phone")) el("candidate-safety-phone").textContent = profile.phone;
    if (el("home-email-link")) el("home-email-link").href = primaryContact;
    el("profile-whatsapp-link").href = profile.whatsapp || mailto;
    if (el("home-email-link")) {
      el("home-email-link").textContent = profile.whatsapp ? "WhatsApp" : `Email · ${profile.name}`;
    }
    el("footer-github").href = profile.github;
    el("current-year").textContent = new Date().getFullYear();

    const links = [
      profile.email && { label: "Email", href: `mailto:${profile.email}` },
      profile.phone && { label: profile.phone, href: `tel:${profile.phone.replace(/[^\d+]/g, "")}` },
      profile.whatsapp && { label: "WhatsApp ↗", href: profile.whatsapp, external: true },
      profile.github && { label: "GitHub ↗", href: profile.github, external: true },
      profile.linkedin && { label: "LinkedIn ↗", href: profile.linkedin, external: true },
      profile.telegram && { label: "Telegram ↗", href: profile.telegram, external: true }
    ].filter(Boolean);
    el("profile-links").innerHTML = links.map((link) => (
      `<a href="${escapeHTML(link.href)}"${link.external ? ' target="_blank" rel="noreferrer"' : ""}>${escapeHTML(link.label)}</a>`
    )).join("");

    const localizedPrinciples = i18n.locale === "ru" ? profile.principles : [
      { title: t("ui.trustGrossTitle"), text: t("ui.trustGrossText") },
      { title: t("ui.trustChatTitle"), text: t("ui.trustChatText") },
      { title: t("ui.trustOfflineTitle"), text: t("ui.trustOfflineText") },
      { title: t("ui.privacy"), text: t("form.noDocumentNumbers") }
    ];
    el("profile-principles").innerHTML = localizedPrinciples.map((item) => `
      <article class="principle">
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.text)}</p>
      </article>
    `).join("");

    const localizedProcess = i18n.locale === "ru" ? process : [
      { title: t("form.stepContact"), time: "1", text: t("form.intro") },
      { title: t("form.stepLocation"), time: "2", text: t("form.latinHint") },
      { title: t("form.stepDocuments"), time: "3", text: t("form.noDocumentNumbers") },
      { title: t("form.stepReview"), time: "4", text: t("form.reviewHint") }
    ];
    const processMarkup = localizedProcess.map((item) => `
      <li>
        <h3>${escapeHTML(item.title)}<span>${escapeHTML(item.time)}</span></h3>
        <p>${escapeHTML(item.text)}</p>
      </li>
    `).join("");
    el("home-process").innerHTML = processMarkup;
    el("profile-process").innerHTML = processMarkup;

    const localizedPrivacy = i18n.locale === "ru"
      ? privacy
      : [t("ui.trustIntro"), t("form.noDocumentNumbers"), t("form.reviewHint")];
    el("privacy-copy").innerHTML = localizedPrivacy.map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join("") + `
      <button class="button button-secondary" id="clear-local-data" type="button">${escapeHTML(t("ui.reset"))}</button>
    `;

    const localizedFaq = i18n.locale === "ru" ? faq : [
      { question: t("ui.grossSalary"), answer: t("ui.trustGrossText") },
      { question: t("ui.clarify"), answer: t("ui.trustChatText") },
      { question: t("ui.privacy"), answer: t("form.noDocumentNumbers") }
    ];
    el("faq-list").innerHTML = localizedFaq.map((item) => `
      <details>
        <summary>${escapeHTML(item.question)}</summary>
        <p>${escapeHTML(item.answer)}</p>
      </details>
    `).join("");

    el("clear-local-data").onclick = clearLocalData;

    const availableCount = jobs.filter((job) => ["open", "verify"].includes(job.status)).length;
    el("hero-open-count").textContent = String(availableCount);
    el("nav-job-count").textContent = String(availableCount);
    if (el("catalog-job-count")) el("catalog-job-count").textContent = String(availableCount);
    if (el("hero-rate")) el("hero-rate").textContent = site.baseRate || "31,40 PLN";
    if (el("catalog-base-rate")) el("catalog-base-rate").textContent = site.baseRate || "31,40 PLN";
    if (el("hero-rate-label")) el("hero-rate-label").textContent = t("ui.grossRate");
    const bannerVisible = Boolean(site.isDemo || site.notice);
    el("demo-banner").hidden = !bannerVisible;
    if (bannerVisible) {
      el("catalog-banner-title").textContent = t("ui.bannerTitle");
      el("catalog-banner-text").textContent = t("ui.bannerText");
    }
    el("jobs-updated-label").textContent = `${t("ui.catalogDate")} ${formatDate(site.lastUpdated)}`;

    const personSchema = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: profile.name,
      jobTitle: profile.role,
      email: `mailto:${profile.email}`,
      telephone: profile.phone,
      url: site.baseUrl,
      sameAs: [profile.github, profile.linkedin].filter(Boolean)
    };
    document.getElementById("person-schema")?.remove();
    const schemaNode = document.createElement("script");
    schemaNode.type = "application/ld+json";
    schemaNode.id = "person-schema";
    schemaNode.textContent = JSON.stringify(personSchema);
    document.head.append(schemaNode);
  }

  function renderJobCard(job, context = "catalog") {
    const view = localizedJob(job);
    const favorite = state.favorites.has(job.id);
    const compared = state.compare.has(job.id);
    const visualType = jobVisualType(job.id);
    const benefits = view.benefits || [];
    const highlights = benefits.slice(0, 1);
    const titleId = `${context}-job-${job.id}-title`;
    return `
      <article class="job-card" data-status="${escapeHTML(job.status)}" data-visual="${visualType}" data-salary-confirmed="${Boolean(job.salary?.confirmed)}" aria-labelledby="${escapeHTML(titleId)}">
        <div class="job-card-top">
          <div class="job-card-tags">
            <span class="tag tag-country">${escapeHTML(view.format)}</span>
            <span class="tag">${escapeHTML(view.level)}</span>
          </div>
          <button class="icon-button${favorite ? " active" : ""}" type="button" data-favorite="${escapeHTML(job.id)}" aria-label="${escapeHTML(favorite ? t("ui.removeSaved") : t("ui.save"))}" aria-pressed="${favorite}">
            <span aria-hidden="true">${favorite ? "♥" : "♡"}</span>
          </button>
        </div>
        <div class="job-card-identity">
          <span class="job-card-visual" aria-hidden="true">${svgIcon(jobVisualIconName(visualType), "job-visual-icon")}</span>
          <div>
            <h3 id="${escapeHTML(titleId)}"><button class="job-title-button" type="button" data-job-open="${escapeHTML(job.id)}">${escapeHTML(view.title)}</button></h3>
            <p class="job-company">${escapeHTML(view.subtitle || job.company)}</p>
          </div>
        </div>
        <dl class="job-card-facts">
          <div class="job-card-fact job-card-fact-salary">
            <dt>${escapeHTML(t("ui.grossSalary"))}</dt>
            <dd class="job-salary">${formatSalary(view.salary)}</dd>
          </div>
          <div class="job-card-fact">
            <dt>${svgIcon("location")}<span>${escapeHTML(t("ui.countryLocation"))}</span></dt>
            <dd>${escapeHTML(view.location)}</dd>
          </div>
          <div class="job-card-fact">
            <dt>${svgIcon("clock")}<span>${escapeHTML(t("ui.contract"))}</span></dt>
            <dd>${escapeHTML(view.contract)}</dd>
          </div>
        </dl>
        <p class="job-card-summary">${escapeHTML(view.summary || "")}</p>
        <div class="job-candidates" aria-label="${escapeHTML(t("ui.suitableFor"))}">
          ${(view.candidates || []).slice(0, 3).map((candidate) => `<span>${svgIcon("check")}${escapeHTML(candidate)}</span>`).join("")}
        </div>
        ${view.statusNote ? `
          <div class="job-card-status">
            <div class="job-status-badges">
              <span class="${job.salary?.confirmed ? "is-confirmed" : "needs-confirmation"}">
                ${svgIcon(job.salary?.confirmed ? "check" : "clock")}
                ${escapeHTML(t(job.salary?.confirmed ? "ui.rateGrossShown" : "ui.rateNeedsConfirmation"))}
              </span>
              <span class="needs-confirmation">
                ${svgIcon("clock")}
                ${escapeHTML(t("ui.startNeedsConfirmation"))}
              </span>
            </div>
            <p>${escapeHTML(view.statusNote)}</p>
          </div>
        ` : ""}
        ${highlights.length ? `
          <div class="job-card-highlights">
            <strong>${escapeHTML(t("ui.conditions"))}</strong>
            <ul>
              ${highlights.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}
            </ul>
          </div>
        ` : ""}
        <div class="job-skills">
          ${(view.skills || []).slice(0, 4).map((skill) => `<span>${escapeHTML(skill)}</span>`).join("")}
        </div>
        <div class="job-card-actions">
          <button class="button button-primary" type="button" data-job-survey="${escapeHTML(job.id)}">${svgIcon("match")}<span>${escapeHTML(t("ui.takeSurvey"))}</span></button>
          <button class="button button-secondary" type="button" data-job-open="${escapeHTML(job.id)}"><span>${escapeHTML(t("ui.details"))}</span>${svgIcon("arrow")}</button>
        </div>
        <button class="job-card-chat" type="button" data-job-chat="${escapeHTML(job.id)}">${svgIcon("whatsapp")}<span>${escapeHTML(t("ui.clarify"))}</span></button>
        <div class="job-card-footer">
          <small>${escapeHTML(t("ui.catalogDate"))} ${escapeHTML(formatDate(job.updatedAt))}</small>
          <label class="compare-check">
            <input type="checkbox" data-compare="${escapeHTML(job.id)}" ${compared ? "checked" : ""}>
            <span>${escapeHTML(t("ui.compare"))}</span>
          </label>
        </div>
      </article>
    `;
  }

  function renderFeaturedJobs() {
    const featured = jobs.filter((job) => job.featured).slice(0, 3);
    el("featured-jobs").innerHTML = featured.map((job) => renderJobCard(job, "featured")).join("");
  }

  function populateFilters() {
    const fill = (id, placeholder, values) => {
      const select = el(id);
      const previous = select.value;
      select.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>`;
      values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.append(option);
      });
      if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    };
    const views = jobs.map(localizedJob);
    fill("filter-category", t("ui.allDirections"), [...new Set(views.map((job) => job.category))].sort());
    fill("filter-format", t("ui.allCountries"), [...new Set(views.map((job) => job.format))].sort());
    fill("filter-level", t("ui.anyExperience"), [...new Set(views.map((job) => job.level))].sort());
  }

  function filteredJobs() {
    const query = el("job-search").value.trim().toLocaleLowerCase(i18n.localeTag());
    const category = el("filter-category").value;
    const format = el("filter-format").value;
    const level = el("filter-level").value;
    const sort = el("job-sort").value;

    const result = jobs.filter((job) => {
      const view = localizedJob(job);
      const searchable = [
        view.title,
        view.subtitle,
        view.company,
        view.category,
        view.level,
        view.location,
        view.summary,
        ...(view.candidates || []),
        ...(view.skills || []),
        ...(view.required || []),
        ...(view.responsibilities || [])
      ].join(" ").toLocaleLowerCase(i18n.localeTag());
      return (!query || searchable.includes(query))
        && (!category || view.category === category)
        && (!format || view.format === format)
        && (!level || view.level === level);
    });

    result.sort((a, b) => {
      if (sort === "confirmed") return Number(Boolean(b.salary?.confirmed)) - Number(Boolean(a.salary?.confirmed));
      if (sort === "title") return localizedJob(a).title.localeCompare(localizedJob(b).title, i18n.localeTag());
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    return result;
  }

  function renderAllJobs() {
    const result = filteredJobs();
    el("all-jobs").innerHTML = result.map((job) => renderJobCard(job, "catalog")).join("");
    el("results-count").textContent = `${t("ui.found")}: ${result.length}`;
    el("jobs-empty").hidden = result.length > 0;
  }

  function resetFilters() {
    el("job-filters").reset();
    renderAllJobs();
  }

  function toggleFavorite(id) {
    if (!jobById(id)) return;
    if (state.favorites.has(id)) {
      state.favorites.delete(id);
      showToast(t("ui.removeSaved"));
    } else {
      state.favorites.add(id);
      showToast(t("ui.saved"));
    }
    persistSet(STORAGE.favorites, state.favorites);
    refreshJobLists();
  }

  function toggleCompare(id, checked) {
    if (!jobById(id)) return;
    if (checked && !state.compare.has(id) && state.compare.size >= 3) {
      showToast(`${t("ui.compare")}: 3`);
      refreshJobLists();
      return;
    }
    if (checked) state.compare.add(id);
    else state.compare.delete(id);
    persistSet(STORAGE.compare, state.compare);
    renderSavedJobs();
    updateSavedBadge();
  }

  function refreshJobLists() {
    renderFeaturedJobs();
    renderAllJobs();
    renderSavedJobs();
    updateSavedBadge();
  }

  function renderSavedJobs() {
    const saved = jobs.filter((job) => state.favorites.has(job.id));
    el("saved-jobs").innerHTML = saved.map((job) => renderJobCard(job, "saved")).join("");
    el("saved-empty").hidden = saved.length > 0;
    const comparison = jobs.filter((job) => state.compare.has(job.id));
    el("compare-count").textContent = String(comparison.length);
    el("compare-button").disabled = comparison.length < 2;
  }

  function updateSavedBadge() {
    const badge = el("saved-badge");
    if (!badge) return;
    badge.textContent = String(state.favorites.size);
    badge.hidden = state.favorites.size === 0;
  }

  function listMarkup(items) {
    return `<ul class="detail-list">${items.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`;
  }

  function openJob(id, updateRoute = true) {
    const job = jobById(id);
    if (!job) {
      showToast(t("ui.noMatchesTitle"));
      return;
    }
    const view = localizedJob(job);
    state.openJobId = job.id;
    state.jobReturnRoute = document.querySelector("[data-view]:not([hidden])")?.dataset.view || "jobs";
    const dialog = el("job-dialog");
    const favorite = state.favorites.has(job.id);
    const compared = state.compare.has(job.id);
    const applicationSteps = [
      t("form.stepContact"),
      t("form.stepLocation"),
      t("form.stepDocuments"),
      t("form.stepWork"),
      t("form.stepQualification"),
      t("form.stepReview"),
      t("form.openWhatsapp")
    ];
    const visualType = jobVisualType(job.id);
    const conditionCards = (view.benefits || []).map((item) => `
      <article>
        <span aria-hidden="true">${svgIcon("check")}</span>
        <p>${escapeHTML(item)}</p>
      </article>
    `).join("");
    el("job-dialog-content").innerHTML = `
      <header class="job-detail-header" data-visual="${visualType}">
        <div class="job-detail-identity">
          <span class="job-detail-visual" aria-hidden="true">${svgIcon(jobVisualIconName(visualType), "job-visual-icon")}</span>
          <div>
            <div class="job-card-tags">
              <button class="availability-chat" type="button" data-job-chat="${escapeHTML(job.id)}">${svgIcon("whatsapp")}<span>${escapeHTML(t("ui.clarify"))}</span></button>
              <span class="tag">${escapeHTML(view.category)}</span>
              <span class="tag">${escapeHTML(view.level)}</span>
            </div>
            <h2 id="job-dialog-title">${escapeHTML(view.title)}</h2>
            <p class="job-company">${escapeHTML(job.company)} · ${escapeHTML(t("ui.catalogDate"))} ${escapeHTML(formatDate(job.updatedAt))}</p>
          </div>
        </div>
      </header>
      <dl class="job-detail-facts">
        <div><dt>${svgIcon("jobs")}<span>${escapeHTML(t("ui.grossSalary"))}</span></dt><dd>${formatSalary(view.salary)}<br><small>${escapeHTML(view.salary?.note || "")}</small></dd></div>
        <div><dt>${svgIcon("location")}<span>${escapeHTML(t("ui.countryLocation"))}</span></dt><dd>${escapeHTML(view.format)} · ${escapeHTML(view.location)}</dd></div>
        <div><dt>${svgIcon("clock")}<span>${escapeHTML(t("ui.contract"))}</span></dt><dd>${escapeHTML(view.contract)}</dd></div>
        <div><dt>${svgIcon("people")}<span>${escapeHTML(t("ui.suitableFor"))}</span></dt><dd>${escapeHTML((view.candidates || []).join(", "))}</dd></div>
      </dl>
      <div class="job-detail-summary">
        <p class="detail-intro">${escapeHTML(view.summary)}</p>
        <div class="job-detail-candidates" aria-label="${escapeHTML(t("ui.suitableFor"))}">
          ${(view.candidates || []).map((candidate) => `<span>${svgIcon("check")}${escapeHTML(candidate)}</span>`).join("")}
        </div>
        <div class="job-detail-skills">
          ${(view.skills || []).map((skill) => `<span>${escapeHTML(skill)}</span>`).join("")}
        </div>
      </div>
      ${view.statusNote ? `
        <div class="availability-note">
          <div class="job-status-badges">
            <span class="${job.salary?.confirmed ? "is-confirmed" : "needs-confirmation"}">
              ${svgIcon(job.salary?.confirmed ? "check" : "clock")}
              ${escapeHTML(t(job.salary?.confirmed ? "ui.rateGrossShown" : "ui.rateNeedsConfirmation"))}
            </span>
            <span class="needs-confirmation">
              ${svgIcon("clock")}
              ${escapeHTML(t("ui.startNeedsConfirmation"))}
            </span>
          </div>
          <p>${escapeHTML(view.statusNote)}</p>
        </div>
      ` : ""}
      ${(view.benefits || []).length ? `
        <section class="job-condition-overview">
          <div class="detail-section-heading">
            <p class="overline">${escapeHTML(t("ui.details"))}</p>
            <h3>${escapeHTML(t("ui.conditions"))}</h3>
          </div>
          <div class="job-condition-grid">${conditionCards}</div>
        </section>
      ` : ""}
      <div class="job-detail-grid">
        <div>
          <details class="detail-disclosure" open>
            <summary>${escapeHTML(t("ui.responsibilities"))}</summary>
            ${listMarkup(view.responsibilities || [])}
          </details>
          <details class="detail-disclosure" open>
            <summary>${escapeHTML(t("ui.required"))}</summary>
            ${listMarkup(view.required || [])}
          </details>
          ${(view.niceToHave || []).length ? `
            <details class="detail-disclosure">
              <summary>${escapeHTML(t("ui.niceToHave"))}</summary>
              ${listMarkup(view.niceToHave)}
            </details>
          ` : ""}
        </div>
        <aside class="detail-side">
          <section class="detail-section">
            <h3>${escapeHTML(t("ui.applicationRoute"))}</h3>
            <ol class="hiring-list">${applicationSteps.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ol>
          </section>
          <section class="detail-section">
            <label for="job-note"><strong>${escapeHTML(t("ui.notes"))}</strong></label>
            <textarea class="note-box" id="job-note">${escapeHTML(state.notes[job.id] || "")}</textarea>
            <small class="note-help">${escapeHTML(t("ui.noteHelp"))}</small>
          </section>
        </aside>
      </div>
      <div class="job-detail-actions">
        <div class="job-detail-primary-actions">
          <button class="button button-primary" type="button" data-job-survey="${escapeHTML(job.id)}">${svgIcon("match")}<span>${escapeHTML(t("ui.takeSurvey"))}</span></button>
          <button class="button button-whatsapp" type="button" data-job-chat="${escapeHTML(job.id)}">${svgIcon("whatsapp")}<span>${escapeHTML(t("ui.askAboutJob"))}</span></button>
        </div>
        <div class="job-detail-tools">
          <button class="button button-secondary" type="button" id="job-favorite">${favoriteActionMarkup(favorite, t("ui.saved"), t("ui.save"))}</button>
          <button class="button button-secondary" type="button" id="job-compare">${compareActionMarkup(compared, t("ui.inComparison"), t("ui.compare"))}</button>
          <button class="button button-secondary" type="button" id="job-share">${escapeHTML(t("ui.share"))}</button>
          <button class="button button-quiet" type="button" id="job-print">${escapeHTML(t("ui.print"))}</button>
        </div>
      </div>
    `;

    el("job-note").addEventListener("input", (event) => {
      state.notes[job.id] = event.target.value;
      persistNotes();
    });
    el("job-favorite").addEventListener("click", () => {
      toggleFavorite(job.id);
      el("job-favorite").innerHTML = favoriteActionMarkup(state.favorites.has(job.id), t("ui.saved"), t("ui.save"));
    });
    el("job-compare").addEventListener("click", () => {
      toggleCompare(job.id, !state.compare.has(job.id));
      el("job-compare").innerHTML = compareActionMarkup(state.compare.has(job.id), t("ui.inComparison"), t("ui.compare"));
    });
    el("job-share").addEventListener("click", () => shareJob(job));
    el("job-print").addEventListener("click", printOpenModal);

    updateJobSchema(job);
    if (!dialog.open) dialog.showModal();
    if (updateRoute) history.pushState(null, "", `#job=${encodeURIComponent(job.id)}`);
  }

  function jobShareUrl(job) {
    const url = new URL(window.location.href);
    url.hash = `job=${encodeURIComponent(job.id)}`;
    return url.toString();
  }

  async function shareJob(job) {
    const view = localizedJob(job);
    const shareData = {
      title: view.title,
      text: `${view.title} · ${job.company} · ${formatSalary(view.salary).replaceAll("&nbsp;", " ")}`,
      url: jobShareUrl(job)
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await copyText(shareData.url, t("ui.share"));
      }
    } catch (error) {
      if (error?.name !== "AbortError") showToast(t("ui.share"));
    }
  }

  function updateJobSchema(job) {
    document.getElementById("job-schema")?.remove();
    if (job.demo || job.status !== "open" || !job.salary?.confirmed) return;
    const view = localizedJob(job);
    const schema = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: view.title,
      description: [view.summary, ...(view.responsibilities || []), ...(view.required || [])].join(" "),
      datePosted: job.publishedAt,
      employmentType: "FULL_TIME",
      hiringOrganization: {
        "@type": "Organization",
        name: job.company
      },
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: job.salary.currency,
        value: {
          "@type": "QuantitativeValue",
          minValue: job.salary.min,
          maxValue: job.salary.max,
          unitText: job.salary.period === "час" ? "HOUR" : "MONTH"
        }
      }
    };
    const node = document.createElement("script");
    node.type = "application/ld+json";
    node.id = "job-schema";
    node.textContent = JSON.stringify(schema);
    document.head.append(node);
  }

  function closeDialog(dialog, updateRoute = true) {
    if (!dialog) return;
    if (dialog.open) dialog.close();
    if (dialog.id !== "job-dialog") return;
    state.openJobId = "";
    document.getElementById("job-schema")?.remove();
    if (updateRoute && location.hash.startsWith("#job=")) {
      const returnRoute = validRoutes.includes(state.jobReturnRoute) ? state.jobReturnRoute : "jobs";
      history.pushState(null, "", `#${returnRoute}`);
      showView(returnRoute, false, false);
    }
  }

  function localizedResources() {
    if (i18n.locale === "ru") return resources;
    const updatedAt = site.lastUpdated;
    return [
      {
        id: "application-guide",
        category: t("ui.processTitle"),
        title: t("form.title"),
        description: t("form.intro"),
        readTime: "3 min",
        updatedAt,
        sections: [
          {
            heading: t("form.stepContact"),
            items: [t("form.latinHint"), t("form.whatsappHint")]
          },
          {
            heading: t("form.stepLocation"),
            items: [t("form.citizenship"), t("form.currentCountry"), t("form.currentCity")]
          },
          {
            heading: t("form.stepDocuments"),
            items: [t("form.legalStatus"), t("form.workRight"), t("form.noDocumentNumbers")]
          },
          {
            heading: t("form.stepReview"),
            items: [t("form.reviewHint")]
          }
        ]
      },
      {
        id: "privacy-guide",
        category: t("ui.privacy"),
        title: t("ui.trustTitle"),
        description: t("ui.trustIntro"),
        readTime: "2 min",
        updatedAt,
        sections: [
          {
            heading: t("ui.privacy"),
            items: [t("form.noDocumentNumbers"), t("form.reviewHint")]
          },
          {
            heading: t("ui.trustOfflineTitle"),
            items: [t("ui.trustOfflineText"), t("ui.whatsappNeedsInternet")]
          }
        ]
      },
      {
        id: "conditions-guide",
        category: t("ui.conditions"),
        title: t("ui.bannerTitle"),
        description: t("ui.bannerText"),
        readTime: "2 min",
        updatedAt,
        sections: [
          {
            heading: t("ui.trustGrossTitle"),
            items: [t("ui.trustGrossText")]
          },
          {
            heading: t("ui.trustChatTitle"),
            items: [t("ui.trustChatText")]
          }
        ]
      },
      {
        id: "offline-guide",
        category: t("ui.offlineChip"),
        title: t("ui.trustOfflineTitle"),
        description: t("ui.trustOfflineText"),
        readTime: "1 min",
        updatedAt,
        sections: [
          {
            heading: t("ui.offlineChip"),
            items: [t("ui.offline"), t("ui.whatsappNeedsInternet")]
          }
        ]
      }
    ];
  }

  function renderResourceCard(resource) {
    const iconName = resourceIconName(resource.id);
    return `
      <article class="resource-card" data-resource-visual="${iconName}">
        <div class="resource-card-header">
          <span class="resource-card-icon" aria-hidden="true">${svgIcon(iconName, "resource-visual-icon")}</span>
          <span class="offline-chip">${svgIcon("check")}<span>${escapeHTML(t("ui.offlineChip"))}</span></span>
        </div>
        <h3>${escapeHTML(resource.title)}</h3>
        <p>${escapeHTML(resource.description)}</p>
        <div class="resource-card-footer">
          <span>${escapeHTML(resource.category)} · ${escapeHTML(resource.readTime)}</span>
          <button class="text-link" type="button" data-resource-open="${escapeHTML(resource.id)}"><span>${escapeHTML(t("ui.open"))}</span>${svgIcon("arrow")}</button>
        </div>
      </article>
    `;
  }

  function renderResources() {
    const visibleResources = localizedResources();
    el("featured-resources").innerHTML = visibleResources.slice(0, 3).map(renderResourceCard).join("");
    const categories = [
      { value: "__all__", label: t("ui.allResources") },
      ...[...new Set(visibleResources.map((resource) => resource.category))]
        .map((category) => ({ value: category, label: category }))
    ];
    el("resource-filters").innerHTML = categories.map((category) => `
      <button class="filter-chip${state.resourceCategory === category.value ? " active" : ""}" type="button" data-resource-category="${escapeHTML(category.value)}" aria-pressed="${state.resourceCategory === category.value}">${escapeHTML(category.label)}</button>
    `).join("");
    const filtered = state.resourceCategory === "__all__"
      ? visibleResources
      : visibleResources.filter((resource) => resource.category === state.resourceCategory);
    el("all-resources").innerHTML = filtered.map(renderResourceCard).join("");
  }

  function openResource(id) {
    const resource = localizedResources().find((item) => item.id === id);
    if (!resource) return;
    el("resource-dialog-content").innerHTML = `
      <header class="modal-heading resource-detail-header">
        <p class="overline">${escapeHTML(resource.category)}</p>
        <h2 id="resource-dialog-title">${escapeHTML(resource.title)}</h2>
        <div class="resource-detail-meta">
          <span>${escapeHTML(resource.readTime)}</span>
          <span>${escapeHTML(t("ui.updated"))} ${escapeHTML(formatDate(resource.updatedAt))}</span>
          <span>${svgIcon("check")}<span>${escapeHTML(t("ui.offlineChip"))}</span></span>
        </div>
        <p class="resource-detail-lead">${escapeHTML(resource.description)}</p>
      </header>
      <div class="resource-sections">
        ${resource.sections.map((section) => `
          <section class="resource-section">
            <h3>${escapeHTML(section.heading)}</h3>
            <ul>${section.items.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
          </section>
        `).join("")}
      </div>
      <div class="resource-detail-actions">
        <button class="button button-primary" type="button" id="resource-print">${escapeHTML(t("ui.print"))}</button>
        <button class="button button-secondary" type="button" id="resource-copy">⧉ ${escapeHTML(t("ui.share"))}</button>
      </div>
    `;
    el("resource-print").addEventListener("click", printOpenModal);
    el("resource-copy").addEventListener("click", () => {
      const text = [
        resource.title,
        resource.description,
        ...resource.sections.flatMap((section) => [section.heading, ...section.items.map((item) => `• ${item}`)])
      ].join("\n");
      copyText(text, t("ui.share"));
    });
    el("resource-dialog").showModal();
  }

  function printOpenModal() {
    document.body.classList.add("printing-modal");
    const cleanup = () => document.body.classList.remove("printing-modal");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 1000);
  }

  function openComparison() {
    const compared = jobs.filter((job) => state.compare.has(job.id));
    if (compared.length < 2) return;
    const rows = [
      [t("ui.grossSalary"), (job) => formatSalary(localizedJob(job).salary)],
      [t("ui.countryLocation"), (job) => `${escapeHTML(localizedJob(job).format)} · ${escapeHTML(localizedJob(job).location)}`],
      [t("ui.suitableFor"), (job) => escapeHTML((localizedJob(job).candidates || []).join(", "))],
      [t("ui.contract"), (job) => escapeHTML(localizedJob(job).contract)],
      [t("ui.updated"), (job) => escapeHTML(formatDate(job.updatedAt))]
    ];
    el("compare-content").innerHTML = `
      <table class="compare-table">
        <thead>
          <tr>
            <th>${escapeHTML(t("ui.details"))}</th>
            ${compared.map((job) => `<th>${escapeHTML(localizedJob(job).title)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map(([label, value]) => `
            <tr>
              <th>${escapeHTML(label)}</th>
              ${compared.map((job) => `<td>${value(job)}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    el("compare-dialog").showModal();
  }

  function clearLocalData() {
    const confirmed = window.confirm(`${t("ui.removeSaved")}? ${t("ui.noteHelp")}`);
    if (!confirmed) return;
    Object.values(STORAGE).forEach((key) => localStorage.removeItem(key));
    state.favorites.clear();
    state.compare.clear();
    state.notes = {};
    refreshJobLists();
    showToast(t("ui.reset"));
  }

  function showView(route, updateHash = true, scroll = true) {
    const next = validRoutes.includes(route) ? route : "home";
    els("[data-view]").forEach((view) => {
      view.hidden = view.dataset.view !== next;
    });
    els("[data-route]").forEach((button) => {
      if (button.dataset.route === next) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (next === "saved") renderSavedJobs();
    if (updateHash) history.pushState(null, "", `#${next}`);
    if (scroll) {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
      const heading = document.querySelector(`#view-${next} h1`);
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
    }
  }

  function handleHashRoute() {
    const raw = decodeURIComponent(location.hash.slice(1));
    if (raw.startsWith("job=")) {
      showView("jobs", false, false);
      openJob(raw.slice(4), false);
      return;
    }
    const route = validRoutes.includes(raw) ? raw : "home";
    closeDialog(el("job-dialog"), false);
    showView(route, false, false);
  }

  function updateConnectionStatus() {
    const online = navigator.onLine;
    el("status-strip").classList.toggle("offline", !online);
    el("connection-label").textContent = online ? t("ui.online") : t("ui.offline");
    if (online && window.__portalRegistration) window.__portalRegistration.update().catch(() => {});
  }

  function setupInstallFlow() {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.installPrompt = event;
      els(".install-button").forEach((button) => {
        button.hidden = false;
      });
    });
    els(".install-button").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!state.installPrompt) {
          showToast(`${t("ui.install")} · ${t("ui.trustOfflineTitle")}`);
          return;
        }
        state.installPrompt.prompt();
        await state.installPrompt.userChoice;
        state.installPrompt = null;
        els(".install-button").forEach((item) => {
          item.hidden = true;
        });
      });
    });
    window.addEventListener("appinstalled", () => showToast(t("ui.trustOfflineTitle")));
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    try {
      const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      window.__portalRegistration = registration;
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showToast(t("ui.updated"), t("ui.updated"), () => {
              registration.waiting?.postMessage({ type: "SKIP_WAITING" });
            });
          }
        });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    } catch {
      showToast(t("ui.whatsappNeedsInternet"));
    }
  }

  function setupEvents() {
    document.addEventListener("click", (event) => {
      const whatsappLink = event.target.closest('a[href*="wa.me"]');
      if (whatsappLink && !whatsappLink.hasAttribute("data-whatsapp-confirmed")) {
        event.preventDefault();
        openWhatsAppSafety(whatsappLink.href);
        return;
      }
      const routeButton = event.target.closest("[data-route]");
      if (routeButton) {
        event.preventDefault();
        els("dialog[open]").forEach((dialog) => closeDialog(dialog, false));
        showView(routeButton.dataset.route);
        return;
      }
      const jobButton = event.target.closest("[data-job-open]");
      if (jobButton) {
        openJob(jobButton.dataset.jobOpen);
        return;
      }
      const surveyButton = event.target.closest("[data-job-survey]");
      if (surveyButton) {
        const id = surveyButton.dataset.jobSurvey;
        if (el("job-dialog").open) closeDialog(el("job-dialog"), false);
        window.PortalApplication?.open(id);
        return;
      }
      const generalSurveyButton = event.target.closest("[data-application-general]");
      if (generalSurveyButton) {
        window.PortalApplication?.open();
        return;
      }
      const chatButton = event.target.closest("[data-job-chat]");
      if (chatButton) {
        window.PortalApplication?.clarify(chatButton.dataset.jobChat);
        return;
      }
      const favoriteButton = event.target.closest("[data-favorite]");
      if (favoriteButton) {
        toggleFavorite(favoriteButton.dataset.favorite);
        return;
      }
      const resourceButton = event.target.closest("[data-resource-open]");
      if (resourceButton) {
        openResource(resourceButton.dataset.resourceOpen);
        return;
      }
      const categoryButton = event.target.closest("[data-resource-category]");
      if (categoryButton) {
        state.resourceCategory = categoryButton.dataset.resourceCategory;
        renderResources();
        return;
      }
      if (event.target.closest("[data-close-dialog]")) {
        closeDialog(event.target.closest("dialog"));
      }
    });

    document.addEventListener("change", (event) => {
      if (event.target.matches("[data-compare]")) {
        toggleCompare(event.target.dataset.compare, event.target.checked);
      }
    });

    ["job-search", "filter-category", "filter-format", "filter-level", "job-sort"].forEach((id) => {
      el(id).addEventListener(id === "job-search" ? "input" : "change", renderAllJobs);
    });
    el("reset-filters").addEventListener("click", resetFilters);
    el("empty-reset").addEventListener("click", resetFilters);
    el("compare-button").addEventListener("click", openComparison);
    el("copy-phone-button").addEventListener("click", () => copyText(profile.phone || profile.email, t("ui.contact")));

    els("dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        closeDialog(dialog);
      });
      dialog.addEventListener("close", () => {
        if (dialog.id === "job-dialog" && location.hash.startsWith("#job=")) {
          const returnRoute = validRoutes.includes(state.jobReturnRoute) ? state.jobReturnRoute : "jobs";
          history.pushState(null, "", `#${returnRoute}`);
          showView(returnRoute, false, false);
        }
      });
    });

    window.addEventListener("hashchange", handleHashRoute);
    window.addEventListener("popstate", handleHashRoute);
    window.addEventListener("online", updateConnectionStatus);
    window.addEventListener("offline", updateConnectionStatus);
    window.addEventListener("portal:toast", (event) => showToast(event.detail?.message || ""));
    i18n.subscribe(() => {
      state.resourceCategory = "__all__";
      i18n.applyStaticTranslations();
      renderProfileContent();
      populateFilters();
      renderResources();
      refreshJobLists();
      updateConnectionStatus();
      if (state.openJobId && el("job-dialog").open) openJob(state.openJobId, false);
    });
  }

  function sanitizeStoredState() {
    const ids = new Set(jobs.map((job) => job.id));
    state.favorites = new Set([...state.favorites].filter((id) => ids.has(id)));
    state.compare = new Set([...state.compare].filter((id) => ids.has(id)));
    if (state.compare.size > 3) state.compare = new Set([...state.compare].slice(0, 3));
    persistSet(STORAGE.favorites, state.favorites);
    persistSet(STORAGE.compare, state.compare);
  }

  function init() {
    i18n.init();
    sanitizeStoredState();
    renderProfileContent();
    populateFilters();
    renderResources();
    refreshJobLists();
    setupEvents();
    setupInstallFlow();
    updateConnectionStatus();
    registerServiceWorker();
    handleHashRoute();
  }

  init();
})();
