(function () {
  "use strict";

  const content = window.PORTAL_CONTENT;
  const i18n = window.PortalI18n;
  const jobs = content.jobs || [];
  const profile = content.profile || {};
  const housing = content.housingLocations || {};
  const state = { query: "", country: "", openJobId: "" };
  const lightboxState = {
    items: [],
    index: 0,
    trigger: null,
    pointerStartX: null
  };
  const directPathMatch = location.pathname.match(/\/vacancies\/([^/]+)\/?$/);
  const directJobId = directPathMatch ? decodeURIComponent(directPathMatch[1]) : "";

  const $ = (id) => document.getElementById(id);
  const escapeHTML = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function countryCode(job) {
    const format = String(job.format || "").toLowerCase();
    if (format.includes("польш")) return "PL";
    if (format.includes("венгр")) return "HU";
    if (format.includes("бельг")) return "BE";
    return "EU";
  }

  function localized(job) {
    return i18n.job(job);
  }

  function canApply(job) {
    return job?.status === "open" || job?.status === "verify";
  }

  function statusLabel(job) {
    const labels = {
      open: "ui.recruitmentOpen",
      verify: "ui.recruitmentVerify",
      paused: "ui.recruitmentPaused",
      closed: "ui.recruitmentClosed"
    };
    return i18n.t(labels[job?.status] || labels.verify);
  }

  function salary(job) {
    const value = localized(job).salary || {};
    const min = Number(value.min);
    const max = Number(value.max);
    if (!Number.isFinite(min) && !Number.isFinite(max)) {
      return value.display || value.note || i18n.t("ui.rateNeedsConfirmation");
    }
    const number = (amount) => new Intl.NumberFormat(i18n.localeTag(), {
      minimumFractionDigits: amount % 1 ? 2 : 0,
      maximumFractionDigits: 2
    }).format(amount);
    const range = Number.isFinite(min) && Number.isFinite(max) && min !== max
      ? `${number(min)}–${number(max)}`
      : number(Number.isFinite(min) ? min : max);
    const periodLabels = {
      "час": {
        ru: "час", uk: "год", pl: "godz.", en: "hour", az: "saat", ka: "საათი",
        id: "jam", es: "hora", fil: "oras", ne: "घण्टा", hy: "ժամ"
      },
      "месяц": {
        ru: "месяц", uk: "місяць", pl: "mies.", en: "month", az: "ay", ka: "თვე",
        id: "bulan", es: "mes", fil: "buwan", ne: "महिना", hy: "ամիս"
      }
    };
    const period = periodLabels[value.period]?.[i18n.locale] || value.period || "";
    return `${range} ${value.currency || ""}${period ? ` / ${period}` : ""}`.trim();
  }

  function publicJobUrl(job) {
    const url = new URL(`vacancies/${encodeURIComponent(job.id)}/`, new URL("./", document.baseURI));
    url.searchParams.set("lang", i18n.locale);
    const source = new URL(location.href).searchParams.get("src");
    if (source) url.searchParams.set("src", source);
    return url.toString();
  }

  function catalogUrl() {
    const url = new URL("./", document.baseURI);
    url.searchParams.set("lang", i18n.locale);
    const source = new URL(location.href).searchParams.get("src");
    if (source) url.searchParams.set("src", source);
    return url.toString();
  }

  function applicationUrl(job) {
    const url = new URL(publicJobUrl(job));
    url.searchParams.set("apply", "1");
    return url.toString();
  }

  function housingEntries(job) {
    return (job.housingLocations || [])
      .map((key) => [key, housing[key]])
      .filter(([, location]) => location?.photoCount);
  }

  function photoUrl(key, index) {
    return `assets/housing/${key}/${key}-${String(index + 1).padStart(2, "0")}.webp`;
  }

  function card(job) {
    const view = localized(job);
    return `
      <article class="job-card" data-job-id="${escapeHTML(job.id)}" data-status="${escapeHTML(job.status || "verify")}">
        <div class="job-card-body">
          <div class="job-card-copy">
            <div class="job-tags">
              <span class="job-status">${escapeHTML(statusLabel(job))}</span>
            </div>
            <h2>${escapeHTML(view.title)}</h2>
            <p class="job-subtitle">${escapeHTML(view.subtitle || view.summary || "")}</p>
          </div>
          <dl class="job-card-facts">
            <div><dt>${escapeHTML(i18n.t("ui.grossSalary"))}</dt><dd>${escapeHTML(salary(job))}</dd></div>
            <div><dt>${escapeHTML(i18n.t("ui.countryLocation"))}</dt><dd>${escapeHTML(view.location)}</dd></div>
          </dl>
          <a class="primary-button job-open" href="${escapeHTML(publicJobUrl(job))}" data-open-job="${escapeHTML(job.id)}" aria-label="${escapeHTML(`${i18n.t("ui.details")}: ${view.title}`)}">
            ${escapeHTML(i18n.t("ui.details"))}<span aria-hidden="true">→</span>
          </a>
        </div>
      </article>
    `;
  }

  function visibleJobs() {
    const query = state.query.trim().toLocaleLowerCase(i18n.localeTag());
    const statusPriority = { open: 0, verify: 1, paused: 2, closed: 3 };
    const originalOrder = new Map(jobs.map((job, index) => [job.id, index]));
    return jobs.filter((job) => {
      if (state.country && countryCode(job) !== state.country) return false;
      if (!query) return true;
      const view = localized(job);
      return [
        view.title,
        view.subtitle,
        view.company,
        view.category,
        view.level,
        view.format,
        view.location,
        view.summary
      ].join(" ").toLocaleLowerCase(i18n.localeTag()).includes(query);
    }).sort((first, second) => (
      (statusPriority[first.status] ?? 1) - (statusPriority[second.status] ?? 1)
      || originalOrder.get(first.id) - originalOrder.get(second.id)
    ));
  }

  function renderCountryFilter() {
    const container = $("country-filter");
    const codes = [...new Set(jobs.map(countryCode))];
    container.innerHTML = [
      { value: "", label: i18n.t("ui.allCountries") },
      ...codes.map((code) => ({ value: code, label: i18n.countryName(code) }))
    ].map((item) => `
      <button
        type="button"
        data-country-filter="${escapeHTML(item.value)}"
        aria-pressed="${String(state.country === item.value)}"
        class="${state.country === item.value ? "is-active" : ""}"
      >${escapeHTML(item.label)}</button>
    `).join("");
    container.setAttribute("aria-label", i18n.t("ui.allCountries"));
  }

  function renderJobs() {
    const result = visibleJobs();
    $("job-grid").innerHTML = result.map(card).join("");
    $("result-count").textContent = `${i18n.t("ui.found")}: ${result.length}`;
    $("empty-state").hidden = result.length > 0;
    $("job-total").textContent = String(jobs.length);
  }

  function list(items) {
    return `<ul>${(items || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`;
  }

  function housingGallery(job) {
    const entries = housingEntries(job);
    if (!entries.length) return "";
    return `
      <section class="vacancy-section housing-section">
        <div class="section-title">
          <p>${escapeHTML(i18n.t("ui.conditions"))}</p>
          <h3>${escapeHTML(i18n.t("ui.housingPhotos"))}</h3>
        </div>
        <div class="housing-list">
          ${entries.map(([key, location], index) => `
            <details class="housing-location"${index === 0 ? " open" : ""}>
              <summary><strong>${escapeHTML(location.name)}</strong><span>${location.photoCount} ${escapeHTML(i18n.t("ui.photos"))}</span></summary>
              <div class="housing-grid">
                ${Array.from({ length: location.photoCount }, (_, photoIndex) => `
                  <a href="${escapeHTML(photoUrl(key, photoIndex))}" target="_blank" rel="noopener noreferrer">
                    <img src="${escapeHTML(photoUrl(key, photoIndex))}" alt="${escapeHTML(`${location.name} · ${photoIndex + 1}`)}" width="900" height="600" loading="lazy" decoding="async">
                  </a>
                `).join("")}
              </div>
            </details>
          `).join("")}
        </div>
      </section>
    `;
  }

  function detail(job, options = {}) {
    const view = localized(job);
    const headingId = options.page ? "job-page-title" : "job-dialog-title";
    const applyUrl = applicationUrl(job);
    const applicationOpen = canApply(job);
    return `
      <article class="vacancy-detail" data-status="${escapeHTML(job.status || "verify")}">
        <header class="vacancy-hero">
          <div class="vacancy-hero-copy">
            <div class="job-tags">
              <span>${escapeHTML(view.format)}</span>
              <span>${escapeHTML(view.category)}</span>
              <span class="job-status">${escapeHTML(statusLabel(job))}</span>
            </div>
            <h2 id="${headingId}">${escapeHTML(view.title)}</h2>
            <p>${escapeHTML(job.company)} · ${escapeHTML(view.subtitle || "")}</p>
          </div>
        </header>

        <div class="vacancy-layout">
          <div class="vacancy-main">
            <section class="vacancy-section vacancy-summary">
              <p>${escapeHTML(view.summary)}</p>
              <div class="skill-list">${(view.skills || []).map((skill) => `<span>${escapeHTML(skill)}</span>`).join("")}</div>
            </section>

            ${(view.benefits || []).length ? `
              <section class="vacancy-section">
                <div class="section-title"><p>${escapeHTML(i18n.t("ui.details"))}</p><h3>${escapeHTML(i18n.t("ui.conditions"))}</h3></div>
                <div class="condition-grid">${view.benefits.map((item) => `<p>${escapeHTML(item)}</p>`).join("")}</div>
              </section>
            ` : ""}

            <section class="vacancy-section vacancy-columns">
              <div><h3>${escapeHTML(i18n.t("ui.responsibilities"))}</h3>${list(view.responsibilities)}</div>
              <div><h3>${escapeHTML(i18n.t("ui.required"))}</h3>${list(view.required)}</div>
            </section>

            ${housingGallery(job)}
          </div>

          <aside class="vacancy-sidebar">
            <div class="vacancy-apply-bar">
              ${applicationOpen
                ? `<a class="primary-button" href="${escapeHTML(applyUrl)}" data-apply-job="${escapeHTML(job.id)}">${escapeHTML(i18n.t("ui.takeSurvey"))}</a>`
                : `<strong class="vacancy-application-unavailable">${escapeHTML(statusLabel(job))}</strong>`}
              <p class="vacancy-status-note">${escapeHTML(view.statusNote || "")}</p>
            </div>
            <dl class="vacancy-facts">
              <div><dt>${escapeHTML(i18n.t("ui.grossSalary"))}</dt><dd>${escapeHTML(salary(job))}</dd><small>${escapeHTML(view.salary?.note || "")}</small></div>
              <div><dt>${escapeHTML(i18n.t("ui.countryLocation"))}</dt><dd>${escapeHTML(view.format)} · ${escapeHTML(view.location)}</dd></div>
              <div><dt>${escapeHTML(i18n.t("ui.contract"))}</dt><dd>${escapeHTML(view.contract)}</dd></div>
              <div><dt>${escapeHTML(i18n.t("ui.suitableFor"))}</dt><dd>${escapeHTML((view.candidates || []).join(" · "))}</dd></div>
            </dl>
          </aside>
        </div>
      </article>
    `;
  }

  function openJob(jobId) {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;
    state.openJobId = job.id;
    $("job-dialog-content").innerHTML = detail(job);
    const dialog = $("job-dialog");
    if (!dialog.open) dialog.showModal();
    dialog.querySelector(".dialog-panel")?.scrollTo({ top: 0 });
  }

  function renderDirectVacancy() {
    const section = $("direct-vacancy");
    const container = $("direct-vacancy-content");
    const job = jobs.find((item) => item.id === directJobId);
    const isDirectPage = Boolean(directJobId && job);
    document.body.classList.toggle("direct-vacancy-page", isDirectPage);
    section.hidden = !isDirectPage;
    if (!isDirectPage) {
      container.innerHTML = "";
      return;
    }
    state.openJobId = job.id;
    $("direct-vacancy-back").href = catalogUrl();
    $("application-page-back").href = publicJobUrl(job);
    container.innerHTML = detail(job, { page: true });
  }

  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
  }

  function ensureHousingLightbox() {
    if ($("housing-lightbox")) return $("housing-lightbox");
    const dialog = document.createElement("dialog");
    dialog.id = "housing-lightbox";
    dialog.className = "housing-lightbox";
    dialog.innerHTML = `
      <div class="housing-lightbox-shell">
        <header class="housing-lightbox-header">
          <strong data-housing-lightbox-title></strong>
          <button type="button" data-housing-lightbox-close aria-label="">×</button>
        </header>
        <div class="housing-lightbox-stage">
          <button type="button" class="housing-lightbox-nav is-previous" data-housing-lightbox-previous aria-label="">←</button>
          <img data-housing-lightbox-image src="" alt="" draggable="false">
          <button type="button" class="housing-lightbox-nav is-next" data-housing-lightbox-next aria-label="">→</button>
        </div>
        <footer class="housing-lightbox-footer">
          <span data-housing-lightbox-counter></span>
        </footer>
      </div>
    `;
    document.body.append(dialog);

    dialog.querySelector("[data-housing-lightbox-close]")?.addEventListener("click", () => closeDialog(dialog));
    dialog.querySelector("[data-housing-lightbox-previous]")?.addEventListener("click", () => moveHousingPhoto(-1));
    dialog.querySelector("[data-housing-lightbox-next]")?.addEventListener("click", () => moveHousingPhoto(1));
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveHousingPhoto(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveHousingPhoto(1);
      } else if (event.key === "Home") {
        event.preventDefault();
        lightboxState.index = 0;
        renderHousingLightbox();
      } else if (event.key === "End") {
        event.preventDefault();
        lightboxState.index = Math.max(0, lightboxState.items.length - 1);
        renderHousingLightbox();
      }
    });
    dialog.addEventListener("close", () => {
      if (lightboxState.trigger?.isConnected) lightboxState.trigger.focus({ preventScroll: true });
    });

    const stage = dialog.querySelector(".housing-lightbox-stage");
    stage?.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") lightboxState.pointerStartX = event.clientX;
    });
    stage?.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "touch" || lightboxState.pointerStartX == null) return;
      const distance = event.clientX - lightboxState.pointerStartX;
      lightboxState.pointerStartX = null;
      if (Math.abs(distance) >= 42) moveHousingPhoto(distance > 0 ? -1 : 1);
    });
    stage?.addEventListener("pointercancel", () => {
      lightboxState.pointerStartX = null;
    });
    return dialog;
  }

  function renderHousingLightbox() {
    const dialog = ensureHousingLightbox();
    const item = lightboxState.items[lightboxState.index];
    if (!item) return;
    const total = lightboxState.items.length;
    dialog.setAttribute("aria-label", i18n.t("ui.housingPhotos"));
    const image = dialog.querySelector("[data-housing-lightbox-image]");
    image.src = item.href;
    image.alt = item.alt;
    dialog.querySelector("[data-housing-lightbox-title]").textContent = item.location;
    dialog.querySelector("[data-housing-lightbox-counter]").textContent = i18n.t("ui.photoCounter", {
      current: lightboxState.index + 1,
      total
    });
    const closeButton = dialog.querySelector("[data-housing-lightbox-close]");
    const previousButton = dialog.querySelector("[data-housing-lightbox-previous]");
    const nextButton = dialog.querySelector("[data-housing-lightbox-next]");
    closeButton.setAttribute("aria-label", i18n.t("ui.close"));
    previousButton.setAttribute("aria-label", i18n.t("ui.previousPhoto"));
    nextButton.setAttribute("aria-label", i18n.t("ui.nextPhoto"));
    previousButton.hidden = total < 2;
    nextButton.hidden = total < 2;
  }

  function moveHousingPhoto(delta) {
    const total = lightboxState.items.length;
    if (total < 2) return;
    lightboxState.index = (lightboxState.index + delta + total) % total;
    renderHousingLightbox();
  }

  function openHousingLightbox(trigger) {
    const gallery = trigger.closest(".housing-grid");
    if (!gallery) return;
    const location = trigger.closest(".housing-location")?.querySelector("summary strong")?.textContent || "";
    const links = [...gallery.querySelectorAll("a")];
    lightboxState.items = links.map((link) => ({
      href: link.href,
      alt: link.querySelector("img")?.alt || location,
      location
    }));
    lightboxState.index = Math.max(0, links.indexOf(trigger));
    lightboxState.trigger = trigger;
    const dialog = ensureHousingLightbox();
    renderHousingLightbox();
    if (!dialog.open) dialog.showModal();
    dialog.querySelector("[data-housing-lightbox-close]")?.focus({ preventScroll: true });
  }

  function renderStatic() {
    document.documentElement.lang = i18n.locale;
    $("profile-name").textContent = profile.name;
    $("profile-hours").textContent = profile.workHours;
    $("recruiter-name").textContent = profile.name;
    $("recruiter-hours").textContent = profile.workHours;
    $("whatsapp-link").href = profile.whatsapp;
    $("footer-whatsapp").href = profile.whatsapp;
    $("safety-whatsapp").href = profile.whatsapp;
    $("jobs-link").href = catalogUrl();
    $("brand-home").href = catalogUrl();
    if (directJobId) {
      $("job-total").textContent = String(jobs.length);
      renderDirectVacancy();
    } else {
      renderCountryFilter();
      renderJobs();
    }
    if (state.openJobId && $("job-dialog").open) openJob(state.openJobId);
    if ($("housing-lightbox")?.open) renderHousingLightbox();
  }

  function bind() {
    document.querySelector(".catalog-filters")?.addEventListener("submit", (event) => {
      event.preventDefault();
    });
    $("job-search").addEventListener("input", (event) => {
      state.query = event.target.value;
      renderJobs();
    });
    document.addEventListener("click", (event) => {
      const housingPhoto = event.target.closest(".housing-grid a");
      const countryButton = event.target.closest("[data-country-filter]");
      const openButton = event.target.closest("[data-open-job]");
      const applyButton = event.target.closest("[data-apply-job]");
      const closeButton = event.target.closest("[data-close-dialog]");
      if (countryButton) {
        state.country = countryButton.dataset.countryFilter || "";
        renderCountryFilter();
        renderJobs();
        return;
      }
      if (housingPhoto) {
        event.preventDefault();
        openHousingLightbox(housingPhoto);
        return;
      }
      if (openButton && directJobId) event.preventDefault();
      if (applyButton) {
        const job = jobs.find((item) => item.id === applyButton.dataset.applyJob);
        if (!canApply(job)) {
          event.preventDefault();
          return;
        }
        if (directJobId) return;
        event.preventDefault();
        closeDialog($("job-dialog"));
        window.PortalApplication?.open(applyButton.dataset.applyJob);
      }
      if (closeButton) closeDialog(closeButton.closest("dialog"));
    });
    document.querySelectorAll("dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
    });
    window.addEventListener("portal:toast", (event) => {
      const toast = $("toast");
      toast.textContent = event.detail?.message || "";
      toast.hidden = false;
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => { toast.hidden = true; }, 2600);
    });
    i18n.subscribe(renderStatic);
  }

  function openDeepLink() {
    if (directJobId) {
      if (new URL(location.href).searchParams.get("apply") === "1") {
        const job = jobs.find((item) => item.id === directJobId);
        if (!canApply(job)) return;
        document.body.classList.add("standalone-application-page");
        $("application-page-back").hidden = false;
        window.PortalApplication?.open(directJobId, { standalone: true });
      }
      return;
    }
    const hashMatch = location.hash.match(/^#job=(.+)$/);
    const id = hashMatch?.[1];
    if (id) openJob(decodeURIComponent(id));
  }

  function init() {
    i18n.init();
    ensureHousingLightbox();
    bind();
    renderStatic();
    openDeepLink();
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  init();
})();
