(() => {
  "use strict";

  const content = window.PORTAL_CONTENT;
  if (!content) {
    document.body.innerHTML = "<p style='padding:2rem'>Не удалось загрузить data/content.js.</p>";
    return;
  }

  const { site, profile, jobs, resources, process, privacy, faq } = content;
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
    resourceCategory: "Все",
    installPrompt: null,
    toastTimer: null,
    jobReturnRoute: "jobs"
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
      showToast("Браузер не разрешил сохранить данные на этом устройстве.");
    }
  }

  function persistNotes() {
    try {
      localStorage.setItem(STORAGE.notes, JSON.stringify(state.notes));
    } catch {
      showToast("Заметка не сохранилась: локальное хранилище недоступно.");
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
    if (!salary || salary.min == null || salary.max == null) return "Вилка по запросу";
    const formatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
    return `${formatter.format(salary.min)}–${formatter.format(salary.max)} ${escapeHTML(salary.currency)} / ${escapeHTML(salary.period)}`;
  }

  function formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(`${dateString}T12:00:00`);
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
  }

  function relativeDate(dateString) {
    if (!dateString) return "";
    const source = new Date(`${dateString}T12:00:00`);
    const today = new Date();
    source.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const days = Math.round((source - today) / 86400000);
    if (days === 0) return "сегодня";
    if (days === -1) return "вчера";
    if (days > -7 && days < 0) return `${Math.abs(days)} дн. назад`;
    return formatDate(dateString);
  }

  function statusText(job) {
    const statuses = {
      open: "Открыта",
      paused: "На паузе",
      closed: "Закрыта"
    };
    return statuses[job.status] || job.status;
  }

  function jobById(id) {
    return jobs.find((job) => job.id === id);
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
      showToast("Не удалось скопировать. Выделите текст вручную.");
    }
  }

  function renderProfileContent() {
    document.title = site.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", site.description);

    [
      ["brand-name", profile.name],
      ["hero-name", profile.name],
      ["profile-name", profile.name],
      ["footer-name", profile.name],
      ["hero-role", profile.role],
      ["profile-role", profile.role],
      ["footer-role", profile.role],
      ["hero-location", profile.location],
      ["hero-languages", profile.languages.join(" · ")],
      ["hero-availability", profile.availability],
      ["hero-intro", profile.intro],
      ["profile-bio", profile.bio],
      ["hero-promise", `«${profile.promise}»`],
      ["hero-response-time", profile.responseTime.replace("рабочих ", "")],
      ["contact-response", profile.responseTime],
      ["contact-timezone", profile.timezone],
      ["hero-avatar", profile.initials],
      ["profile-avatar", profile.initials]
    ].forEach(([id, value]) => {
      if (el(id)) el(id).textContent = value;
    });

    const mailSubject = encodeURIComponent("Вопрос о вакансии");
    const mailBody = encodeURIComponent(`Здравствуйте, ${profile.name}!\n\nХочу уточнить: `);
    const mailto = `mailto:${profile.email}?subject=${mailSubject}&body=${mailBody}`;
    ["header-contact", "home-email-link", "profile-email-link"].forEach((id) => {
      if (el(id)) el(id).href = mailto;
    });
    el("home-email-link").textContent = `Написать ${profile.name}`;
    el("footer-github").href = profile.github;
    el("current-year").textContent = new Date().getFullYear();

    const links = [
      profile.email && { label: "Email", href: `mailto:${profile.email}` },
      profile.github && { label: "GitHub ↗", href: profile.github, external: true },
      profile.linkedin && { label: "LinkedIn ↗", href: profile.linkedin, external: true },
      profile.telegram && { label: "Telegram ↗", href: profile.telegram, external: true }
    ].filter(Boolean);
    el("profile-links").innerHTML = links.map((link) => (
      `<a href="${escapeHTML(link.href)}"${link.external ? ' target="_blank" rel="noreferrer"' : ""}>${escapeHTML(link.label)}</a>`
    )).join("");

    el("profile-principles").innerHTML = profile.principles.map((item) => `
      <article class="principle">
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.text)}</p>
      </article>
    `).join("");

    const processMarkup = process.map((item) => `
      <li>
        <h3>${escapeHTML(item.title)}<span>${escapeHTML(item.time)}</span></h3>
        <p>${escapeHTML(item.text)}</p>
      </li>
    `).join("");
    el("home-process").innerHTML = processMarkup;
    el("profile-process").innerHTML = processMarkup;

    el("privacy-copy").innerHTML = privacy.map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join("") + `
      <button class="button button-secondary" id="clear-local-data" type="button">Удалить избранное и заметки</button>
    `;

    el("faq-list").innerHTML = faq.map((item) => `
      <details>
        <summary>${escapeHTML(item.question)}</summary>
        <p>${escapeHTML(item.answer)}</p>
      </details>
    `).join("");

    el("clear-local-data").addEventListener("click", clearLocalData);

    const openCount = jobs.filter((job) => job.status === "open").length;
    el("hero-open-count").textContent = String(openCount);
    el("nav-job-count").textContent = String(openCount);
    el("demo-banner").hidden = !site.isDemo;
    el("jobs-updated-label").textContent = `Обновлено ${relativeDate(site.lastUpdated)}`;

    const personSchema = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: profile.name,
      jobTitle: profile.role,
      email: `mailto:${profile.email}`,
      url: site.baseUrl,
      sameAs: [profile.github, profile.linkedin].filter(Boolean)
    };
    const schemaNode = document.createElement("script");
    schemaNode.type = "application/ld+json";
    schemaNode.id = "person-schema";
    schemaNode.textContent = JSON.stringify(personSchema);
    document.head.append(schemaNode);
  }

  function renderJobCard(job) {
    const favorite = state.favorites.has(job.id);
    const compared = state.compare.has(job.id);
    return `
      <article class="job-card" data-status="${escapeHTML(job.status)}">
        <div class="job-card-top">
          <div class="job-card-tags">
            <span class="status-tag${job.demo ? " demo" : ""}">${job.demo ? "Демо" : escapeHTML(statusText(job))}</span>
            <span class="tag">${escapeHTML(job.format)}</span>
            <span class="tag">${escapeHTML(job.level)}</span>
          </div>
          <button class="icon-button${favorite ? " active" : ""}" type="button" data-favorite="${escapeHTML(job.id)}" aria-label="${favorite ? "Убрать из избранного" : "Сохранить в избранное"}" aria-pressed="${favorite}">
            ${favorite ? "♥" : "♡"}
          </button>
        </div>
        <h3>${escapeHTML(job.title)}</h3>
        <p class="job-company">${escapeHTML(job.company)}</p>
        <p class="job-salary">${formatSalary(job.salary)}</p>
        <ul class="job-meta">
          <li><span aria-hidden="true">⌖</span>${escapeHTML(job.location)}</li>
          <li><span aria-hidden="true">◷</span>${escapeHTML(job.contract)}</li>
        </ul>
        <div class="job-skills" aria-label="Навыки">
          ${job.skills.slice(0, 4).map((skill) => `<span>${escapeHTML(skill)}</span>`).join("")}
        </div>
        <div class="job-card-actions">
          <div>
            <button class="button button-primary" type="button" data-job-open="${escapeHTML(job.id)}">Подробнее</button>
            <small>Обновлено ${escapeHTML(relativeDate(job.updatedAt))}</small>
          </div>
          <label class="compare-check">
            <input type="checkbox" data-compare="${escapeHTML(job.id)}" ${compared ? "checked" : ""}>
            Сравнить
          </label>
        </div>
      </article>
    `;
  }

  function renderFeaturedJobs() {
    const featured = jobs.filter((job) => job.featured && job.status === "open").slice(0, 3);
    el("featured-jobs").innerHTML = featured.map(renderJobCard).join("");
  }

  function populateFilters() {
    const fill = (id, values) => {
      const select = el(id);
      values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.append(option);
      });
    };
    fill("filter-category", [...new Set(jobs.map((job) => job.category))].sort());
    fill("filter-format", [...new Set(jobs.map((job) => job.format))].sort());
    fill("filter-level", [...new Set(jobs.map((job) => job.level))].sort());
  }

  function filteredJobs() {
    const query = el("job-search").value.trim().toLocaleLowerCase("ru");
    const category = el("filter-category").value;
    const format = el("filter-format").value;
    const level = el("filter-level").value;
    const activeOnly = el("active-only").checked;
    const sort = el("job-sort").value;

    const result = jobs.filter((job) => {
      const searchable = [
        job.title,
        job.company,
        job.category,
        job.level,
        job.location,
        job.summary,
        ...job.skills,
        ...job.required
      ].join(" ").toLocaleLowerCase("ru");
      return (!query || searchable.includes(query))
        && (!category || job.category === category)
        && (!format || job.format === format)
        && (!level || job.level === level)
        && (!activeOnly || job.status === "open");
    });

    result.sort((a, b) => {
      if (sort === "salary") return (b.salary?.max || 0) - (a.salary?.max || 0);
      if (sort === "title") return a.title.localeCompare(b.title, "ru");
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    return result;
  }

  function renderAllJobs() {
    const result = filteredJobs();
    el("all-jobs").innerHTML = result.map(renderJobCard).join("");
    el("results-count").textContent = `Найдено: ${result.length}`;
    el("jobs-empty").hidden = result.length > 0;
  }

  function resetFilters() {
    el("job-filters").reset();
    el("active-only").checked = true;
    renderAllJobs();
  }

  function toggleFavorite(id) {
    if (!jobById(id)) return;
    if (state.favorites.has(id)) {
      state.favorites.delete(id);
      showToast("Удалено из избранного.");
    } else {
      state.favorites.add(id);
      showToast("Вакансия сохранена на этом устройстве.");
    }
    persistSet(STORAGE.favorites, state.favorites);
    refreshJobLists();
  }

  function toggleCompare(id, checked) {
    if (!jobById(id)) return;
    if (checked && !state.compare.has(id) && state.compare.size >= 3) {
      showToast("Можно сравнить не больше трёх вакансий.");
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
    el("saved-jobs").innerHTML = saved.map(renderJobCard).join("");
    el("saved-empty").hidden = saved.length > 0;
    const comparison = jobs.filter((job) => state.compare.has(job.id));
    el("compare-count").textContent = String(comparison.length);
    el("compare-button").disabled = comparison.length < 2;
  }

  function updateSavedBadge() {
    const badge = el("saved-badge");
    badge.textContent = String(state.favorites.size);
    badge.hidden = state.favorites.size === 0;
  }

  function listMarkup(items) {
    return `<ul class="detail-list">${items.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`;
  }

  function openJob(id, updateRoute = true) {
    const job = jobById(id);
    if (!job) {
      showToast("Эта вакансия не найдена или уже удалена.");
      return;
    }
    state.jobReturnRoute = document.querySelector("[data-view]:not([hidden])")?.dataset.view || "jobs";
    const dialog = el("job-dialog");
    const favorite = state.favorites.has(job.id);
    const compared = state.compare.has(job.id);
    el("job-dialog-content").innerHTML = `
      <header class="job-detail-header">
        <div class="job-card-tags">
          <span class="status-tag${job.demo ? " demo" : ""}">${job.demo ? "Демо-вакансия" : escapeHTML(statusText(job))}</span>
          <span class="tag">${escapeHTML(job.category)}</span>
          <span class="tag">${escapeHTML(job.level)}</span>
        </div>
        <h2>${escapeHTML(job.title)}</h2>
        <p class="job-company">${escapeHTML(job.company)} · Обновлено ${escapeHTML(relativeDate(job.updatedAt))}</p>
      </header>
      <dl class="job-detail-facts">
        <div><dt>Зарплата</dt><dd>${formatSalary(job.salary)}<br><small>${escapeHTML(job.salary.note)}</small></dd></div>
        <div><dt>Формат</dt><dd>${escapeHTML(job.format)} · ${escapeHTML(job.location)}</dd></div>
        <div><dt>Договор</dt><dd>${escapeHTML(job.contract)}</dd></div>
        <div><dt>Язык</dt><dd>${escapeHTML(job.languages.join(", "))}</dd></div>
      </dl>
      <p class="detail-intro">${escapeHTML(job.summary)}</p>
      ${job.demo ? '<p class="demo-note"><strong>Это демонстрационный контент.</strong> Условия и компания вымышлены и показывают формат будущей реальной вакансии.</p>' : ""}
      ${job.confidentialReason ? `<p class="confidential-note"><strong>Почему компания не названа:</strong> ${escapeHTML(job.confidentialReason)}</p>` : ""}
      <div class="job-detail-grid">
        <div>
          <section class="detail-section">
            <h3>Зачем открыта роль</h3>
            <p>${escapeHTML(job.reason)}</p>
          </section>
          <section class="detail-section">
            <h3>Что предстоит делать</h3>
            ${listMarkup(job.responsibilities)}
          </section>
          <section class="detail-section">
            <h3>Обязательно</h3>
            ${listMarkup(job.required)}
          </section>
          <section class="detail-section">
            <h3>Будет плюсом</h3>
            ${listMarkup(job.niceToHave)}
          </section>
          <section class="detail-section">
            <h3>Условия</h3>
            ${listMarkup(job.benefits)}
          </section>
        </div>
        <aside class="detail-side">
          <section class="detail-section">
            <h3>Этапы отбора</h3>
            <ol class="hiring-list">${job.hiring.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ol>
          </section>
          <section class="detail-section">
            <label for="job-note"><strong>Мои заметки</strong></label>
            <textarea class="note-box" id="job-note" placeholder="Вопросы, впечатления, что проверить…">${escapeHTML(state.notes[job.id] || "")}</textarea>
            <small class="note-help">Хранится только на этом устройстве и никуда не отправляется.</small>
          </section>
        </aside>
      </div>
      <div class="job-detail-actions">
        <a class="button button-primary" id="job-apply" href="${makeApplyLink(job)}">Откликнуться по email</a>
        <button class="button button-secondary" type="button" id="job-favorite">${favorite ? "♥ В избранном" : "♡ Сохранить"}</button>
        <button class="button button-secondary" type="button" id="job-compare">${compared ? "✓ В сравнении" : "＋ Сравнить"}</button>
        <button class="button button-secondary" type="button" id="job-share">Поделиться</button>
        <button class="button button-quiet" type="button" id="job-print">Печать / PDF</button>
      </div>
    `;

    el("job-note").addEventListener("input", (event) => {
      state.notes[job.id] = event.target.value;
      persistNotes();
    });
    el("job-favorite").addEventListener("click", () => {
      toggleFavorite(job.id);
      el("job-favorite").textContent = state.favorites.has(job.id) ? "♥ В избранном" : "♡ Сохранить";
    });
    el("job-compare").addEventListener("click", () => {
      toggleCompare(job.id, !state.compare.has(job.id));
      el("job-compare").textContent = state.compare.has(job.id) ? "✓ В сравнении" : "＋ Сравнить";
    });
    el("job-share").addEventListener("click", () => shareJob(job));
    el("job-print").addEventListener("click", printOpenModal);
    el("job-apply").addEventListener("click", () => {
      if (!navigator.onLine) showToast("Вы офлайн. Почтовое приложение может сохранить письмо до подключения.");
    });

    updateJobSchema(job);
    if (!dialog.open) dialog.showModal();
    if (updateRoute) history.pushState(null, "", `#job=${encodeURIComponent(job.id)}`);
  }

  function makeApplyLink(job) {
    const subject = encodeURIComponent(`Отклик: ${job.title}`);
    const body = encodeURIComponent(
      `Здравствуйте, ${profile.name}!\n\nМеня заинтересовала вакансия «${job.title}».\n\nКоротко обо мне:\n\nСсылка на профиль / резюме (по желанию):\n\nУдобный способ связи:\n`
    );
    return `mailto:${job.applyEmail || profile.email}?subject=${subject}&body=${body}`;
  }

  function jobShareUrl(job) {
    const url = new URL(window.location.href);
    url.hash = `job=${encodeURIComponent(job.id)}`;
    return url.toString();
  }

  async function shareJob(job) {
    const shareData = {
      title: job.title,
      text: `${job.title} · ${job.company} · ${formatSalary(job.salary).replaceAll("&nbsp;", " ")}`,
      url: jobShareUrl(job)
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await copyText(shareData.url, "Ссылка на вакансию скопирована.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") showToast("Не удалось поделиться ссылкой.");
    }
  }

  function updateJobSchema(job) {
    document.getElementById("job-schema")?.remove();
    if (job.demo || job.status !== "open") return;
    const schema = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: job.title,
      description: [job.summary, ...job.responsibilities, ...job.required].join(" "),
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
          unitText: "MONTH"
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
    if (dialog.open) dialog.close();
    document.getElementById("job-schema")?.remove();
    if (updateRoute && location.hash.startsWith("#job=")) {
      const returnRoute = validRoutes.includes(state.jobReturnRoute) ? state.jobReturnRoute : "jobs";
      history.pushState(null, "", `#${returnRoute}`);
      showView(returnRoute, false, false);
    }
  }

  function renderResourceCard(resource) {
    const icons = {
      "Интервью": "◎",
      "Резюме": "▤",
      "Оффер": "↗",
      "Безопасность": "◇"
    };
    return `
      <article class="resource-card">
        <div class="resource-card-header">
          <span class="resource-card-icon" aria-hidden="true">${icons[resource.category] || "◇"}</span>
          <span class="offline-chip">✓ Офлайн</span>
        </div>
        <h3>${escapeHTML(resource.title)}</h3>
        <p>${escapeHTML(resource.description)}</p>
        <div class="resource-card-footer">
          <span>${escapeHTML(resource.category)} · ${escapeHTML(resource.readTime)}</span>
          <button class="text-link" type="button" data-resource-open="${escapeHTML(resource.id)}">Открыть →</button>
        </div>
      </article>
    `;
  }

  function renderResources() {
    el("featured-resources").innerHTML = resources.slice(0, 3).map(renderResourceCard).join("");
    const categories = ["Все", ...new Set(resources.map((resource) => resource.category))];
    el("resource-filters").innerHTML = categories.map((category) => `
      <button class="filter-chip${state.resourceCategory === category ? " active" : ""}" type="button" data-resource-category="${escapeHTML(category)}">${escapeHTML(category)}</button>
    `).join("");
    const filtered = state.resourceCategory === "Все"
      ? resources
      : resources.filter((resource) => resource.category === state.resourceCategory);
    el("all-resources").innerHTML = filtered.map(renderResourceCard).join("");
  }

  function openResource(id) {
    const resource = resources.find((item) => item.id === id);
    if (!resource) return;
    el("resource-dialog-content").innerHTML = `
      <header class="modal-heading resource-detail-header">
        <p class="overline">${escapeHTML(resource.category)}</p>
        <h2>${escapeHTML(resource.title)}</h2>
        <div class="resource-detail-meta">
          <span>${escapeHTML(resource.readTime)}</span>
          <span>Обновлено ${escapeHTML(formatDate(resource.updatedAt))}</span>
          <span>✓ Офлайн</span>
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
        <button class="button button-primary" type="button" id="resource-print">Печать / PDF</button>
        <button class="button button-secondary" type="button" id="resource-copy">Скопировать краткий план</button>
      </div>
    `;
    el("resource-print").addEventListener("click", printOpenModal);
    el("resource-copy").addEventListener("click", () => {
      const text = [
        resource.title,
        resource.description,
        ...resource.sections.flatMap((section) => [section.heading, ...section.items.map((item) => `• ${item}`)])
      ].join("\n");
      copyText(text, "Памятка скопирована.");
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
      ["Зарплата", (job) => formatSalary(job.salary)],
      ["Формат", (job) => `${escapeHTML(job.format)} · ${escapeHTML(job.location)}`],
      ["Уровень", (job) => escapeHTML(job.level)],
      ["Договор", (job) => escapeHTML(job.contract)],
      ["Язык", (job) => escapeHTML(job.languages.join(", "))],
      ["Навыки", (job) => escapeHTML(job.skills.join(", "))],
      ["Этапов", (job) => String(job.hiring.length)],
      ["Обновлено", (job) => escapeHTML(formatDate(job.updatedAt))]
    ];
    el("compare-content").innerHTML = `
      <table class="compare-table">
        <thead>
          <tr>
            <th>Критерий</th>
            ${compared.map((job) => `<th>${escapeHTML(job.title)}</th>`).join("")}
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
    const confirmed = window.confirm("Удалить избранное, сравнение и все личные заметки с этого устройства?");
    if (!confirmed) return;
    Object.values(STORAGE).forEach((key) => localStorage.removeItem(key));
    state.favorites.clear();
    state.compare.clear();
    state.notes = {};
    refreshJobLists();
    showToast("Локальные данные удалены.");
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
    if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
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
    el("connection-label").textContent = online
      ? "Онлайн · портал готов к работе офлайн"
      : "Вы офлайн · вакансии, материалы и избранное доступны";
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
          showToast("В меню браузера выберите «Установить приложение» или «На экран Домой».");
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
    window.addEventListener("appinstalled", () => showToast("Портал установлен и готов к офлайн-работе."));
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
            showToast("Доступна свежая версия портала.", "Обновить", () => {
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
      showToast("Офлайн-режим пока не активирован. Обновите страницу при наличии сети.");
    }
  }

  function setupEvents() {
    document.addEventListener("click", (event) => {
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

    ["job-search", "filter-category", "filter-format", "filter-level", "job-sort", "active-only"].forEach((id) => {
      el(id).addEventListener(id === "job-search" ? "input" : "change", renderAllJobs);
    });
    el("reset-filters").addEventListener("click", resetFilters);
    el("empty-reset").addEventListener("click", resetFilters);
    el("compare-button").addEventListener("click", openComparison);
    el("copy-email-button").addEventListener("click", () => copyText(profile.email, "Email скопирован."));

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
