(function () {
  "use strict";

  const content = window.PORTAL_CONTENT;
  const i18n = window.PortalI18n;
  if (!content || !i18n) return;

  const { profile, jobs } = content;
  const COUNTRY_CODES = [
    "PL", "UA", "MD", "GE", "AZ", "AM", "NP", "PH", "ID",
    "RU", "BY", "KZ", "UZ", "KG", "TJ", "TM",
    "IN", "BD", "PK", "LK", "VN", "TH", "MY",
    "HU", "BE", "DE", "CZ", "SK", "RO", "BG", "LT", "LV", "EE",
    "ES", "IT", "FR", "NL", "PT", "GR", "AT", "DK", "SE", "FI",
    "NO", "CH", "SI", "HR", "RS", "BA", "ME", "MK", "AL", "TR", "GB", "IE",
    "MX", "CO", "VE", "PE", "EC", "AR", "CL", "BO", "PY", "UY", "BR",
    "OTHER"
  ];
  const CITIZENSHIP_CODES = COUNTRY_CODES;
  const STEP_KEYS = [
    "stepContact",
    "stepLocation",
    "stepDocuments",
    "stepWork",
    "stepQualification",
    "stepReview"
  ];
  const MATCH_STEP_COUNT = 4;
  const MATCH_RESULTS_STEP = MATCH_STEP_COUNT;
  const LATIN_NAME = /^[\p{Script=Latin}\p{Mark}\s'-]+$/u;
  const LATIN_TEXT = /^[\p{Script=Latin}\p{Mark}\d\s.,'()/:+&\-]*$/u;
  const PHONE = /^\+[1-9]\d{7,14}$/;
  const MATCH_RULES = {
    "greenhouse-tomatoes": { country: "PL", areas: ["greenhouse", "general"], entry: true },
    "greenhouse-renewal": { country: "PL", areas: ["greenhouse", "general"], entry: true },
    "tomato-sorting": { country: "PL", areas: ["warehouse", "general"], entry: true },
    "banana-warehouse-poland": { country: "PL", areas: ["warehouse", "general"], entry: true },
    "plant-protection": { country: "PL", areas: ["agronomy", "greenhouse"], preferredQualification: "agronomy" },
    "site-cleaning": { country: "PL", areas: ["general"], entry: true },
    "forklift-udt": { country: "PL", areas: ["warehouse"], requiredQualification: "udt" },
    "team-leader": { country: "PL", areas: ["management"], requiredQualification: "leader" },
    "greenhouse-agronomist": { country: "PL", areas: ["agronomy", "greenhouse"], requiredQualification: "agronomy" },
    "truck-mechanic": { country: "PL", areas: ["technical"], requiredQualification: "mechanic" },
    "driver-ce-poland": { country: "PL", areas: ["transport"], requiredQualification: "driver" },
    "driver-ce-relief": { country: "PL", areas: ["transport"], requiredQualification: "driver" },
    "banana-warehouse-hungary": { country: "HU", areas: ["warehouse", "general"], entry: true, documentCheck: true },
    "banana-warehouse-belgium": { country: "BE", areas: ["warehouse", "general"], documentCheck: true }
  };
  const EXPERIENCE_SCORE = {
    expNone: 0,
    expUnder6: 1,
    exp6to12: 2,
    exp1to2: 3,
    exp2plus: 4
  };
  const state = {
    mode: "application",
    matchStep: 0,
    jobId: "",
    step: 0,
    values: {},
    error: "",
    recommendations: []
  };

  const escapeHTML = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const t = (path, variables) => i18n.t(path, variables);
  const baseJob = () => jobs.find((job) => job.id === state.jobId);
  const effectiveJob = () => jobs.find((job) => job.id === state.values.matchedJobId) || baseJob();
  const localizedJob = () => {
    const job = effectiveJob();
    return job ? i18n.job(job) : null;
  };
  const today = () => new Date().toISOString().slice(0, 10);

  function createApplicationId() {
    const date = today().replaceAll("-", "");
    const bytes = new Uint8Array(3);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else bytes.forEach((_, index) => {
      bytes[index] = Math.floor(Math.random() * 256);
    });
    const suffix = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
    return `KJ-${date}-${suffix}`;
  }

  function personalMessageCopy() {
    const copy = {
      ru: {
        greeting: "Здравствуйте",
        source: "Отправляю вам анкету через вашу платформу Kiris Jobs.",
        reference: "Номер заявки"
      },
      uk: {
        greeting: "Вітаю",
        source: "Надсилаю вам анкету через вашу платформу Kiris Jobs.",
        reference: "Номер заявки"
      },
      pl: {
        greeting: "Dzień dobry",
        source: "Wysyłam zgłoszenie przez Pana platformę Kiris Jobs.",
        reference: "Numer zgłoszenia"
      },
      en: {
        greeting: "Hello",
        source: "I am sending my application through your Kiris Jobs platform.",
        reference: "Application reference"
      },
      az: {
        greeting: "Salam",
        source: "Anketamı sizin Kiris Jobs platformanız vasitəsilə göndərirəm.",
        reference: "Müraciət nömrəsi"
      },
      ka: {
        greeting: "გამარჯობა",
        source: "განაცხადს თქვენი Kiris Jobs პლატფორმიდან გიგზავნით.",
        reference: "განაცხადის ნომერი"
      },
      id: {
        greeting: "Halo",
        source: "Saya mengirim lamaran melalui platform Kiris Jobs milik Anda.",
        reference: "Nomor lamaran"
      },
      es: {
        greeting: "Hola",
        source: "Le envío mi solicitud desde su plataforma Kiris Jobs.",
        reference: "Referencia de solicitud"
      },
      fil: {
        greeting: "Hello",
        source: "Ipinapadala ko ang aplikasyon sa pamamagitan ng iyong Kiris Jobs platform.",
        reference: "Reference ng aplikasyon"
      },
      ne: {
        greeting: "नमस्ते",
        source: "म तपाईंको Kiris Jobs प्लेटफर्ममार्फत आवेदन पठाउँदै छु।",
        reference: "आवेदन नम्बर"
      },
      hy: {
        greeting: "Բարև",
        source: "Իմ հայտը ուղարկում եմ ձեր Kiris Jobs հարթակի միջոցով։",
        reference: "Հայտի համարը"
      }
    };
    return { ...copy.en, ...(copy[i18n.locale] || {}) };
  }

  function candidateEngineCopy() {
    const copy = {
      ru: {
        birthDate: "Дата рождения",
        birthHint: "Возраст рассчитывается на вашем устройстве и попадёт только в подготовленное сообщение WhatsApp.",
        age: "Возраст",
        underage: "Анкету можно отправить только после достижения 18 лет.",
        source: "Источник ссылки"
      },
      uk: {
        birthDate: "Дата народження",
        birthHint: "Вік обчислюється на вашому пристрої та потрапить лише до підготовленого повідомлення WhatsApp.",
        age: "Вік",
        underage: "Анкету можна надіслати лише після досягнення 18 років.",
        source: "Джерело посилання"
      },
      pl: {
        birthDate: "Data urodzenia",
        birthHint: "Wiek jest obliczany na urządzeniu i trafia wyłącznie do przygotowanej wiadomości WhatsApp.",
        age: "Wiek",
        underage: "Zgłoszenie można wysłać dopiero po ukończeniu 18 lat.",
        source: "Źródło linku"
      },
      en: {
        birthDate: "Date of birth",
        birthHint: "Age is calculated on your device and appears only in the prepared WhatsApp message.",
        age: "Age",
        underage: "You must be at least 18 to send the application.",
        source: "Link source"
      },
      az: {
        birthDate: "Doğum tarixi",
        birthHint: "Yaş cihazınızda hesablanır və yalnız hazırlanmış WhatsApp mesajına əlavə olunur.",
        age: "Yaş",
        underage: "Müraciət yalnız 18 yaşdan sonra göndərilə bilər.",
        source: "Link mənbəyi"
      },
      ka: {
        birthDate: "დაბადების თარიღი",
        birthHint: "ასაკი ითვლება თქვენს მოწყობილობაზე და მხოლოდ მომზადებულ WhatsApp შეტყობინებაში ხვდება.",
        age: "ასაკი",
        underage: "განაცხადის გაგზავნა შესაძლებელია მხოლოდ 18 წლის შემდეგ.",
        source: "ბმულის წყარო"
      },
      id: {
        birthDate: "Tanggal lahir",
        birthHint: "Usia dihitung di perangkat Anda dan hanya masuk ke pesan WhatsApp yang disiapkan.",
        age: "Usia",
        underage: "Lamaran hanya dapat dikirim setelah berusia 18 tahun.",
        source: "Sumber tautan"
      },
      es: {
        birthDate: "Fecha de nacimiento",
        birthHint: "La edad se calcula en su dispositivo y solo aparece en el mensaje preparado para WhatsApp.",
        age: "Edad",
        underage: "La solicitud solo puede enviarse a partir de los 18 años.",
        source: "Origen del enlace"
      },
      fil: {
        birthDate: "Petsa ng kapanganakan",
        birthHint: "Kinakalkula ang edad sa iyong device at isinasama lamang sa inihandang WhatsApp message.",
        age: "Edad",
        underage: "Maipapadala lamang ang aplikasyon kapag 18 taong gulang o higit pa.",
        source: "Pinagmulan ng link"
      },
      ne: {
        birthDate: "जन्म मिति",
        birthHint: "उमेर तपाईंको उपकरणमै गणना हुन्छ र तयार गरिएको WhatsApp सन्देशमा मात्र समावेश हुन्छ।",
        age: "उमेर",
        underage: "१८ वर्ष पूरा भएपछि मात्र आवेदन पठाउन सकिन्छ।",
        source: "लिङ्क स्रोत"
      },
      hy: {
        birthDate: "Ծննդյան ամսաթիվ",
        birthHint: "Տարիքը հաշվարկվում է ձեր սարքում և ավելացվում է միայն պատրաստված WhatsApp հաղորդագրությանը։",
        age: "Տարիք",
        underage: "Հայտը կարելի է ուղարկել միայն 18 տարին լրանալուց հետո։",
        source: "Հղման աղբյուր"
      }
    };
    return { ...copy.en, ...(copy[i18n.locale] || {}) };
  }

  function calculateAge(value) {
    if (!value) return null;
    const birthDate = new Date(`${value}T00:00:00`);
    if (Number.isNaN(birthDate.getTime())) return null;
    const current = new Date();
    let age = current.getFullYear() - birthDate.getFullYear();
    const month = current.getMonth() - birthDate.getMonth();
    if (month < 0 || (month === 0 && current.getDate() < birthDate.getDate())) age -= 1;
    return age >= 0 && age <= 100 ? age : null;
  }

  function yearsAgo(years) {
    const date = new Date();
    date.setFullYear(date.getFullYear() - years);
    return date.toISOString().slice(0, 10);
  }

  function campaignSource() {
    const params = new URL(window.location.href).searchParams;
    const raw = params.get("src") || params.get("source") || params.get("ref") || "direct";
    return raw.replace(/[^\p{L}\p{N}_.:@+-]/gu, "_").slice(0, 60) || "direct";
  }

  function renderStepTrack(labels, currentStep, completeAll = false) {
    return `
      <ol class="application-step-track${completeAll ? " is-complete" : ""}" aria-hidden="true" style="--application-step-count:${labels.length}">
        ${labels.map((label, index) => {
          const step = index + 1;
          const status = completeAll || step < currentStep
            ? "is-done"
            : step === currentStep
              ? "is-current"
              : "is-upcoming";
          return `
            <li class="${status}">
              <span>${String(step).padStart(2, "0")}</span>
              <small>${escapeHTML(label)}</small>
            </li>
          `;
        }).join("")}
      </ol>
    `;
  }

  function recruiterHandoff() {
    return `
      <aside class="application-recruiter-handoff">
        <span class="application-recruiter-photo">
          <img src="assets/oleksandr-kiris-greenhouse.jpg" width="960" height="1280" alt="">
          <i aria-hidden="true"></i>
        </span>
        <span class="application-recruiter-copy">
          <small>${escapeHTML(t("ui.recruiterEyebrow"))}</small>
          <strong>${escapeHTML(profile.name)}</strong>
          <em>${escapeHTML(profile.workHours || t("ui.workHours"))} · ${escapeHTML(profile.timezone)}</em>
          <b class="application-reference">${escapeHTML(state.values.applicationId || "KJ")}</b>
        </span>
        <span class="application-recruiter-channel" aria-label="WhatsApp">
          <b aria-hidden="true">W</b><span>WhatsApp</span>
        </span>
      </aside>
    `;
  }

  function field(name, label, input, hint = "") {
    return `
      <label class="application-field" for="application-${escapeHTML(name)}">
        <span>${escapeHTML(label)}</span>
        ${input}
        ${hint ? `<small>${escapeHTML(hint)}</small>` : ""}
      </label>
    `;
  }

  function input(name, type = "text", attributes = "") {
    const value = state.values[name] ?? "";
    return `<input id="application-${escapeHTML(name)}" name="${escapeHTML(name)}" type="${escapeHTML(type)}" value="${escapeHTML(value)}" ${attributes}>`;
  }

  function option(value, label, current) {
    return `<option value="${escapeHTML(value)}"${String(current ?? "") === String(value) ? " selected" : ""}>${escapeHTML(label)}</option>`;
  }

  function select(name, items, attributes = "") {
    const current = state.values[name] ?? "";
    return `
      <select id="application-${escapeHTML(name)}" name="${escapeHTML(name)}" ${attributes}>
        ${option("", t("options.choose"), current)}
        ${items.map((item) => option(item.value, item.label, current)).join("")}
      </select>
    `;
  }

  function yesNoUnknown(name) {
    return select(name, [
      { value: "yes", label: t("options.yes") },
      { value: "no", label: t("options.no") },
      { value: "unknown", label: t("options.unknown") }
    ], "required");
  }

  function countryOptions(codes) {
    return codes.map((code) => ({ value: code, label: i18n.countryName(code) }));
  }

  function jobOptions() {
    return jobs.map((job) => ({ value: job.id, label: i18n.job(job).title }));
  }

  function matchAreaItems() {
    return [
      "any", "greenhouse", "warehouse", "general", "transport", "technical", "management", "agronomy"
    ].map((value) => ({ value, label: t(`options.matchArea${value[0].toUpperCase()}${value.slice(1)}`) }));
  }

  function matchQualificationItems() {
    return [
      "none", "driver", "udt", "mechanic", "leader", "agronomy", "other"
    ].map((value) => ({ value, label: t(`options.matchQualification${value[0].toUpperCase()}${value.slice(1)}`) }));
  }

  function matchChoiceCards(name, label, items, describedBy = "") {
    const current = String(state.values[name] ?? "");
    const legendId = `matcher-${name}-legend`;
    return `
      <fieldset class="matcher-choice-fieldset">
        <legend id="${escapeHTML(legendId)}">${escapeHTML(label)}</legend>
        <div class="matcher-choice-grid" role="radiogroup" aria-labelledby="${escapeHTML(legendId)}"${describedBy ? ` aria-describedby="${escapeHTML(describedBy)}"` : ""} aria-required="true">
          ${items.map((item) => {
            const selected = current === String(item.value);
            return `
              <label class="matcher-choice${selected ? " is-selected" : ""}">
                <input
                  type="radio"
                  name="${escapeHTML(name)}"
                  value="${escapeHTML(item.value)}"
                  ${selected ? "checked" : ""}
                  required
                >
                <span class="matcher-choice-label">${escapeHTML(item.label)}</span>
                <span class="matcher-choice-check" aria-hidden="true">✓</span>
              </label>
            `;
          }).join("")}
        </div>
      </fieldset>
    `;
  }

  function qualificationFieldsForType(type) {
    if (type === "driver") {
      return [
        field("driverLicense", t("form.driverLicense"), yesNoUnknown("driverLicense")),
        field("code95", t("form.code95"), yesNoUnknown("code95")),
        field("tachograph", t("form.tachograph"), yesNoUnknown("tachograph")),
        field("reeferExperience", t("form.reeferExperience"), yesNoUnknown("reeferExperience"))
      ].join("");
    }
    if (type === "udt") {
      return [
        field("udtLicense", t("form.udtLicense"), yesNoUnknown("udtLicense")),
        field("udtCategory", t("form.udtCategory"), input("udtCategory"))
      ].join("");
    }
    if (type === "leader") {
      return field("leadershipExperience", t("form.leadershipExperience"), yesNoUnknown("leadershipExperience"));
    }
    if (type === "mechanic") {
      return field("mechanicExperience", t("form.mechanicExperience"), yesNoUnknown("mechanicExperience"));
    }
    if (type === "agronomy") {
      return field("specialistEducation", t("form.specialistEducation"), yesNoUnknown("specialistEducation"));
    }
    return "";
  }

  function qualificationAnswer(type) {
    if (type === "driver") {
      const answers = [state.values.driverLicense, state.values.code95, state.values.tachograph];
      if (answers.includes("no")) return "no";
      return answers.every((answer) => answer === "yes") ? "yes" : "unknown";
    }
    if (type === "udt") return state.values.udtLicense || "unknown";
    if (type === "leader") return state.values.leadershipExperience || "unknown";
    if (type === "mechanic") return state.values.mechanicExperience || "unknown";
    if (type === "agronomy") return state.values.specialistEducation || "unknown";
    return "unknown";
  }

  function recommendJobs() {
    const preferredCountry = state.values.preferredDestination;
    const preferredArea = state.values.preferredArea;
    const qualification = state.values.qualificationType;
    const experienceScore = EXPERIENCE_SCORE[state.values.experience] ?? 0;

    return jobs.map((job) => {
      const rule = MATCH_RULES[job.id];
      if (!rule) return null;
      if (preferredCountry !== "any" && rule.country !== preferredCountry) return null;
      if (preferredArea !== "any" && !rule.areas.includes(preferredArea)) return null;

      let score = 20;
      const reasons = [];
      const warnings = [];

      if (preferredCountry === "any") {
        score += rule.country === "PL" ? 5 : 2;
      } else {
        score += 28;
        reasons.push(t("form.matchReasonCountry"));
      }

      if (preferredArea === "any") {
        score += rule.entry ? 8 : 2;
      } else {
        score += 30;
        reasons.push(t("form.matchReasonArea"));
      }

      if (rule.requiredQualification) {
        if (qualification !== rule.requiredQualification) return null;
        const answer = qualificationAnswer(rule.requiredQualification);
        if (answer === "no") return null;
        if (answer === "yes") {
          score += 36;
          reasons.push(t("form.matchReasonQualification"));
        } else {
          score += 8;
          warnings.push(t("form.matchNeedsVerification"));
        }
      } else if (rule.preferredQualification && qualification === rule.preferredQualification) {
        score += 22;
        reasons.push(t("form.matchReasonQualification"));
      } else if (qualification !== "none" && qualification !== "other") {
        score += 3;
      }

      if (rule.entry && experienceScore <= 1) {
        score += 16;
        reasons.push(t("form.matchReasonNoExperience"));
      } else if (!rule.entry && experienceScore >= 2) {
        score += 14 + experienceScore;
        reasons.push(t("form.matchReasonExperience"));
      } else if (!rule.entry && experienceScore === 0 && rule.requiredQualification) {
        score -= 12;
      }

      if (rule.documentCheck) warnings.push(t("form.matchNeedsDocumentCheck"));
      if (!reasons.length) reasons.push(t("form.matchReasonFlexible"));

      return { job, score, reasons: [...new Set(reasons)].slice(0, 3), warnings: [...new Set(warnings)] };
    })
      .filter(Boolean)
      .sort((a, b) => (
        a.warnings.length - b.warnings.length
        || b.score - a.score
        || a.job.title.localeCompare(b.job.title)
      ))
      .slice(0, 3);
  }

  function matchSalary(job) {
    const view = i18n.job(job);
    if (view.salary?.display) return view.salary.display;
    if (view.salary?.min == null || view.salary?.max == null) return t("ui.grossSalary");
    const formatAmount = (value) => new Intl.NumberFormat(i18n.locale, {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2
    }).format(value);
    const amount = view.salary.min === view.salary.max
      ? formatAmount(view.salary.min)
      : `${formatAmount(view.salary.min)}–${formatAmount(view.salary.max)}`;
    return `${amount} ${view.salary.currency} · ${t("ui.grossSalary")}`;
  }

  function renderMatchStep() {
    if (state.matchStep === 0) {
      return `
        <div class="matcher-privacy-note" id="matcher-privacy-note">
          <span aria-hidden="true">✓</span>
          <p>${escapeHTML(t("form.matchPrivacy"))}</p>
        </div>
        ${matchChoiceCards("preferredDestination", t("form.preferredDestination"), [
          { value: "any", label: t("options.matchCountryAny") },
          { value: "PL", label: i18n.countryName("PL") },
          { value: "HU", label: i18n.countryName("HU") },
          { value: "BE", label: i18n.countryName("BE") }
        ], "matcher-privacy-note")}
      `;
    }
    if (state.matchStep === 1) {
      return matchChoiceCards("preferredArea", t("form.preferredArea"), matchAreaItems());
    }
    if (state.matchStep === 2) {
      const experienceItems = ["expNone", "expUnder6", "exp6to12", "exp1to2", "exp2plus"]
        .map((key) => ({ value: key, label: t(`options.${key}`) }));
      return matchChoiceCards("experience", t("form.experience"), experienceItems);
    }
    const qualificationType = state.values.qualificationType || "";
    const qualificationFields = qualificationFieldsForType(qualificationType);
    return `
      ${matchChoiceCards("qualificationType", t("form.qualificationType"), matchQualificationItems())}
      ${qualificationFields ? `
        <div class="application-grid matcher-qualification-fields" role="region" aria-label="${escapeHTML(t("form.qualificationType"))}" aria-live="polite">
          ${qualificationFields}
        </div>
      ` : ""}
    `;
  }

  function renderMatchResults() {
    if (!state.recommendations.length) {
      return `
        <div class="matcher-empty">
          <span aria-hidden="true">?</span>
          <h3>${escapeHTML(t("form.matchNoResultsTitle"))}</h3>
          <p>${escapeHTML(t("form.matchNoResultsText"))}</p>
          <button class="button button-primary" type="button" data-match-contact>${escapeHTML(t("ui.contact"))}</button>
        </div>
      `;
    }
    return `
      <div class="matcher-results">
        <p class="matcher-disclaimer">${escapeHTML(t("form.matchDisclaimer"))}</p>
        ${state.recommendations.map((result, index) => {
          const view = i18n.job(result.job);
          return `
            <article class="match-card${index === 0 ? " best" : ""}">
              <div class="match-card-top">
                <span>${escapeHTML(index === 0 ? t("form.matchBest") : t("form.matchSuitable"))}</span>
                <strong>${escapeHTML(view.format)}</strong>
              </div>
              <h3>${escapeHTML(view.title)}</h3>
              <p class="match-salary">${escapeHTML(matchSalary(result.job))}</p>
              <ul>
                ${result.reasons.map((reason) => `<li>✓ ${escapeHTML(reason)}</li>`).join("")}
                ${result.warnings.map((warning) => `<li class="warning">! ${escapeHTML(warning)}</li>`).join("")}
              </ul>
              <button class="button button-primary button-block" type="button" data-match-select="${escapeHTML(result.job.id)}">${escapeHTML(t("form.chooseAndContinue"))}</button>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderContactStep() {
    const engine = candidateEngineCopy();
    const age = calculateAge(state.values.birthDate);
    const ageHint = age == null ? engine.birthHint : `${engine.age}: ${age}. ${engine.birthHint}`;
    return `
      <div class="application-grid">
        ${field("jobId", t("form.selectedVacancy"), select("jobId", jobOptions(), "required"))}
        ${field("preferredLanguage", t("form.preferredLanguage"), select(
          "preferredLanguage",
          i18n.supported.map((locale) => ({ value: locale, label: i18n.languageName(locale) })),
          "required"
        ))}
        ${field("firstName", t("form.firstName"), input("firstName", "text", 'autocomplete="given-name" inputmode="text" autocapitalize="characters" required'), t("form.latinHint"))}
        ${field("lastName", t("form.lastName"), input("lastName", "text", 'autocomplete="family-name" inputmode="text" autocapitalize="characters" required'), t("form.latinHint"))}
        ${field("birthDate", engine.birthDate, input("birthDate", "date", `min="${yearsAgo(100)}" max="${yearsAgo(18)}" required`), ageHint)}
        ${field("phone", t("form.whatsapp"), input("phone", "tel", 'autocomplete="tel" inputmode="tel" placeholder="+48500100200" required'), t("form.whatsappHint"))}
        ${field("email", t("form.email"), input("email", "email", 'autocomplete="email" inputmode="email"'))}
      </div>
    `;
  }

  function renderLocationStep() {
    const currentCountry = state.values.currentCountry || "";
    const citizenship = state.values.citizenship || "";
    return `
      <div class="application-grid">
        ${field("citizenship", t("form.citizenship"), select("citizenship", countryOptions(CITIZENSHIP_CODES), "required"))}
        ${citizenship === "OTHER" ? field("otherCitizenship", t("form.otherCountry"), input("otherCitizenship", "text", "required"), t("form.latinHint")) : ""}
        ${field("currentCountry", t("form.currentCountry"), select("currentCountry", countryOptions(COUNTRY_CODES), "required"))}
        ${currentCountry === "OTHER" ? field("otherCountry", t("form.otherCountry"), input("otherCountry", "text", "required"), t("form.latinHint")) : ""}
        ${field("currentCity", t("form.currentCity"), input("currentCity", "text", 'autocomplete="address-level2" required'), t("form.latinHint"))}
      </div>
    `;
  }

  function renderDocumentsStep() {
    const legalStatuses = [
      "statusReady", "statusClarify", "statusNoDocuments"
    ].map((key) => ({ value: key, label: t(`options.${key}`) }));
    const targetCode = destinationCode(baseJob());
    const workRightLabel = targetCode
      ? `${t("form.workRight")} — ${i18n.countryName(targetCode)}`
      : t("form.workRight");
    return `
      <div class="application-grid">
        ${field("legalStatus", t("form.legalStatus"), select("legalStatus", legalStatuses, "required"))}
        ${field("workRight", workRightLabel, select("workRight", [
          { value: "yes", label: t("options.workRightYes") },
          { value: "no", label: t("options.workRightNo") },
          { value: "unknown", label: t("options.workRightUnknown") }
        ], "required"))}
      </div>
      <p class="application-security">ⓘ ${escapeHTML(t("form.noDocumentNumbers"))}</p>
    `;
  }

  function renderWorkStep() {
    const shifts = ["shiftDay", "shiftNight", "shiftLong", "shiftWeekend"];
    const currentShifts = Array.isArray(state.values.shiftReadiness) ? state.values.shiftReadiness : [];
    return `
      <div class="application-grid">
        ${field("readyDate", t("form.readyDate"), input("readyDate", "date", `min="${today()}" required`))}
        ${field("housing", t("form.housing"), select("housing", [
          { value: "required", label: t("options.housingRequired") },
          { value: "notRequired", label: t("options.housingNotRequired") }
        ], "required"))}
        ${field("travellingWith", t("form.travellingWith"), select("travellingWith", [
          { value: "alone", label: t("options.alone") },
          { value: "partner", label: t("options.partner") },
          { value: "family", label: t("options.family") },
          { value: "friends", label: t("options.friends") }
        ], "required"))}
        ${state.values.travellingWith && state.values.travellingWith !== "alone"
          ? field("partnerAlsoApplies", t("form.partnerAlsoApplies"), yesNoUnknown("partnerAlsoApplies"))
          : ""}
      </div>
      <fieldset class="application-fieldset">
        <legend>${escapeHTML(t("form.shiftReadiness"))}</legend>
        <div class="application-check-grid">
          ${shifts.map((key) => `
            <label class="application-check">
              <input name="shiftReadiness" type="checkbox" value="${key}" ${currentShifts.includes(key) ? "checked" : ""}>
              <span>${escapeHTML(t(`options.${key}`))}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
    `;
  }

  function qualificationFields(job) {
    const id = job?.id || "";
    if (id.startsWith("driver-ce")) return qualificationFieldsForType("driver");
    if (id === "forklift-udt") return qualificationFieldsForType("udt");
    if (id === "team-leader") return qualificationFieldsForType("leader");
    if (id === "truck-mechanic") return qualificationFieldsForType("mechanic");
    if (["greenhouse-agronomist", "plant-protection"].includes(id)) return qualificationFieldsForType("agronomy");
    return "";
  }

  function renderQualificationStep() {
    const experienceItems = ["expNone", "expUnder6", "exp6to12", "exp1to2", "exp2plus"]
      .map((key) => ({ value: key, label: t(`options.${key}`) }));
    return `
      <div class="application-grid">
        ${field("experience", t("form.experience"), select("experience", experienceItems, "required"))}
        ${qualificationFields(effectiveJob())}
      </div>
      ${field("experienceDetails", t("form.experienceDetails"), `<textarea id="application-experienceDetails" name="experienceDetails" rows="3">${escapeHTML(state.values.experienceDetails || "")}</textarea>`)}
      ${field("extraNotes", t("form.extraNotes"), `<textarea id="application-extraNotes" name="extraNotes" rows="3">${escapeHTML(state.values.extraNotes || "")}</textarea>`)}
    `;
  }

  function reviewValue(label, value) {
    if (!value) return "";
    return `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`;
  }

  function optionLabel(group, value) {
    if (!value) return "";
    const key = group === "legalStatus" ? value : value;
    return t(`options.${key}`);
  }

  function localizedCountry(code, otherValue) {
    return code === "OTHER" ? otherValue : i18n.countryName(code);
  }

  function destinationCode(job) {
    return MATCH_RULES[job?.id]?.country || "";
  }

  function renderReviewStep() {
    const job = localizedJob();
    const engine = candidateEngineCopy();
    const age = calculateAge(state.values.birthDate);
    const shiftValues = (state.values.shiftReadiness || []).map((key) => t(`options.${key}`)).join(", ");
    const qualificationValues = [
      state.values.driverLicense && `${t("form.driverLicense")}: ${t(`options.${state.values.driverLicense}`)}`,
      state.values.code95 && `${t("form.code95")}: ${t(`options.${state.values.code95}`)}`,
      state.values.tachograph && `${t("form.tachograph")}: ${t(`options.${state.values.tachograph}`)}`,
      state.values.reeferExperience && `${t("form.reeferExperience")}: ${t(`options.${state.values.reeferExperience}`)}`,
      state.values.udtLicense && `${t("form.udtLicense")}: ${t(`options.${state.values.udtLicense}`)}`,
      state.values.udtCategory && `${t("form.udtCategory")}: ${state.values.udtCategory}`,
      state.values.leadershipExperience && `${t("form.leadershipExperience")}: ${t(`options.${state.values.leadershipExperience}`)}`,
      state.values.mechanicExperience && `${t("form.mechanicExperience")}: ${t(`options.${state.values.mechanicExperience}`)}`,
      state.values.specialistEducation && `${t("form.specialistEducation")}: ${t(`options.${state.values.specialistEducation}`)}`
    ].filter(Boolean).join(" · ");
    return `
      <div class="application-review">
        <h3>${escapeHTML(t("form.reviewTitle"))}</h3>
        <p>${escapeHTML(t("form.reviewHint"))}</p>
        <dl>
          ${reviewValue(t("form.selectedVacancy"), job?.title)}
          ${reviewValue(`${t("form.firstName")} / ${t("form.lastName")}`, `${state.values.firstName || ""} ${state.values.lastName || ""}`.trim())}
          ${reviewValue(engine.birthDate, state.values.birthDate)}
          ${reviewValue(engine.age, age == null ? "" : String(age))}
          ${reviewValue(t("form.whatsapp"), state.values.phone)}
          ${reviewValue(t("form.citizenship"), localizedCountry(state.values.citizenship, state.values.otherCitizenship))}
          ${reviewValue(t("form.currentCountry"), localizedCountry(state.values.currentCountry, state.values.otherCountry))}
          ${reviewValue(t("form.currentCity"), state.values.currentCity)}
          ${reviewValue(t("form.legalStatus"), optionLabel("legalStatus", state.values.legalStatus))}
          ${reviewValue(t("form.workRight"), state.values.workRight ? t(`options.workRight${state.values.workRight[0].toUpperCase()}${state.values.workRight.slice(1)}`) : "")}
          ${reviewValue(t("form.readyDate"), state.values.readyDate)}
          ${reviewValue(t("form.housing"), state.values.housing === "required" ? t("options.housingRequired") : t("options.housingNotRequired"))}
          ${reviewValue(t("form.shiftReadiness"), shiftValues)}
          ${reviewValue(t("form.experience"), state.values.experience ? t(`options.${state.values.experience}`) : "")}
          ${reviewValue(t("form.experienceDetails"), state.values.experienceDetails)}
          ${reviewValue(t("form.stepQualification"), qualificationValues)}
          ${reviewValue(t("form.extraNotes"), state.values.extraNotes)}
        </dl>
      </div>
      <aside class="application-safety-note">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>${escapeHTML(t("ui.recruiterEyebrow"))}: ${escapeHTML(profile.name)} · ${escapeHTML(profile.phone)}</strong>
          <p>${escapeHTML(t("ui.antiFraudWarning"))}</p>
        </div>
      </aside>
      <section class="application-message-preview" aria-labelledby="application-message-heading">
        <div>
          <h3 id="application-message-heading">${escapeHTML(t("form.messagePreview"))}</h3>
          <button class="button button-secondary" type="button" data-copy-application-message>⧉ ${escapeHTML(t("form.copyMessage"))}</button>
        </div>
        <p>${escapeHTML(t("form.messagePreviewHint"))}</p>
        <textarea readonly rows="12" aria-label="${escapeHTML(t("form.messagePreview"))}">${escapeHTML(buildMessage())}</textarea>
      </section>
      <label class="application-check application-consent">
        <input name="consent" type="checkbox" ${state.values.consent ? "checked" : ""}>
        <span>${escapeHTML(t("form.consent"))}</span>
      </label>
    `;
  }

  function stepContent() {
    if (state.step === 0) return renderContactStep();
    if (state.step === 1) return renderLocationStep();
    if (state.step === 2) return renderDocumentsStep();
    if (state.step === 3) return renderWorkStep();
    if (state.step === 4) return renderQualificationStep();
    return renderReviewStep();
  }

  function focusDialogStart() {
    requestAnimationFrame(() => {
      const dialog = document.getElementById("application-dialog");
      dialog?.querySelector(".modal-shell")?.scrollTo({ top: 0, behavior: "smooth" });
      dialog?.querySelector("#application-step-title")?.focus({ preventScroll: true });
    });
  }

  function renderMatcher(focusStart = false) {
    const dialog = document.getElementById("application-dialog");
    const container = document.getElementById("application-dialog-content");
    if (!dialog || !container) return;
    const isResults = state.matchStep === MATCH_RESULTS_STEP;
    const stepTitles = [
      t("form.preferredDestination"),
      t("form.preferredArea"),
      t("form.experience"),
      t("form.qualificationType")
    ];
    const visibleStep = isResults ? MATCH_STEP_COUNT : state.matchStep + 1;
    const progress = (visibleStep / MATCH_STEP_COUNT) * 100;
    const title = isResults ? t("form.matchResultsTitle") : stepTitles[state.matchStep];
    container.innerHTML = `
      <header class="application-header" data-stage="${visibleStep}" data-stage-total="${MATCH_STEP_COUNT}"${isResults ? ' data-stage-complete="true"' : ""}>
        <p class="overline">${escapeHTML(t("form.matchKicker"))}</p>
        <h2 id="application-step-title" tabindex="-1">${escapeHTML(title)}</h2>
        <p>${escapeHTML(isResults ? t("form.matchResultsHint") : t("form.matchIntro"))}</p>
        ${recruiterHandoff()}
        ${renderStepTrack(stepTitles, visibleStep, isResults)}
        <div class="application-progress" role="progressbar" aria-label="${escapeHTML(`${t("ui.formStep")} ${visibleStep} ${t("ui.of")} ${MATCH_STEP_COUNT}`)}" aria-valuemin="1" aria-valuemax="${MATCH_STEP_COUNT}" aria-valuenow="${visibleStep}">
          <span style="width:${progress}%"></span>
        </div>
        <small>${escapeHTML(t("ui.formStep"))} ${visibleStep} ${escapeHTML(t("ui.of"))} ${MATCH_STEP_COUNT}</small>
      </header>
      <form id="matching-form" novalidate>
        <div class="application-error" id="application-error" tabindex="-1" role="alert" ${state.error ? "" : "hidden"}>${escapeHTML(state.error)}</div>
        <section class="application-step"${isResults ? ' aria-live="polite"' : ""}>
          ${isResults ? renderMatchResults() : renderMatchStep()}
        </section>
        <footer class="application-actions matcher-step-nav">
          <button class="button button-secondary" type="button" data-match-back ${state.matchStep === 0 ? "disabled" : ""}>${escapeHTML(t("form.back"))}</button>
          ${isResults ? "" : `
            <button class="button button-primary" type="submit">
              ${escapeHTML(state.matchStep === MATCH_STEP_COUNT - 1 ? t("form.showMatches") : t("form.next"))} →
            </button>
          `}
        </footer>
      </form>
    `;
    container.querySelectorAll(".matcher-choice input[type='radio']").forEach((radio) => {
      radio.addEventListener("change", handleMatchChoiceChange);
    });
    container.querySelector("[data-match-back]")?.addEventListener("click", () => {
      collectMatchValues();
      state.error = "";
      state.matchStep = Math.max(0, state.matchStep - 1);
      renderMatcher(true);
    });
    container.querySelectorAll("[data-match-select]").forEach((button) => {
      button.addEventListener("click", () => startApplicationFromMatch(button.dataset.matchSelect));
    });
    container.querySelector("[data-match-contact]")?.addEventListener("click", clarifyGeneral);
    container.querySelector("#matching-form")?.addEventListener("submit", handleMatchSubmit);
    if (focusStart) focusDialogStart();
  }

  function render(focusStart = false) {
    if (state.mode === "match") {
      renderMatcher(focusStart);
      return;
    }
    const dialog = document.getElementById("application-dialog");
    const container = document.getElementById("application-dialog-content");
    if (!dialog || !container) return;
    const percent = ((state.step + 1) / STEP_KEYS.length) * 100;
    const stepLabels = STEP_KEYS.map((key) => t(`form.${key}`));
    container.innerHTML = `
      <header class="application-header" data-stage="${state.step + 1}" data-stage-total="${STEP_KEYS.length}">
        <p class="overline">${escapeHTML(t("form.title"))}</p>
        <h2 id="application-step-title" tabindex="-1">${escapeHTML(t(`form.${STEP_KEYS[state.step]}`))}</h2>
        <p>${escapeHTML(t("form.intro"))}</p>
        ${recruiterHandoff()}
        ${renderStepTrack(stepLabels, state.step + 1)}
        <div class="application-progress" role="progressbar" aria-label="${escapeHTML(`${t("ui.formStep")} ${state.step + 1} ${t("ui.of")} ${STEP_KEYS.length}`)}" aria-valuemin="1" aria-valuemax="${STEP_KEYS.length}" aria-valuenow="${state.step + 1}">
          <span style="width:${percent}%"></span>
        </div>
        <small>${escapeHTML(t("ui.formStep"))} ${state.step + 1} ${escapeHTML(t("ui.of"))} ${STEP_KEYS.length}</small>
      </header>
      <form id="application-form" novalidate>
        <div class="application-error" id="application-error" tabindex="-1" role="alert" ${state.error ? "" : "hidden"}>${escapeHTML(state.error)}</div>
        <section class="application-step">${stepContent()}</section>
        <footer class="application-actions">
          <button class="button button-secondary" type="button" data-application-back ${state.step === 0 ? "disabled" : ""}>${escapeHTML(t("form.back"))}</button>
          ${state.step < STEP_KEYS.length - 1
            ? `<button class="button button-primary" type="submit">${escapeHTML(t("form.next"))} →</button>`
            : `<button class="button button-primary whatsapp-submit" type="submit">${escapeHTML(t("form.openWhatsapp"))} ↗</button>`}
        </footer>
      </form>
    `;
    container.querySelector("[name='jobId']")?.addEventListener("change", (event) => {
      state.jobId = event.target.value;
      state.values.jobId = event.target.value;
      if (state.values.matchedJobId !== event.target.value) delete state.values.matchedJobId;
    });
    container.querySelector("[name='currentCountry']")?.addEventListener("change", collectAndRender);
    container.querySelector("[name='citizenship']")?.addEventListener("change", collectAndRender);
    container.querySelector("[name='legalStatus']")?.addEventListener("change", collectAndRender);
    container.querySelector("[name='documentCountry']")?.addEventListener("change", collectAndRender);
    container.querySelector("[name='travellingWith']")?.addEventListener("change", collectAndRender);
    container.querySelector("[name='birthDate']")?.addEventListener("change", collectAndRender);
    container.querySelector("[data-application-back]")?.addEventListener("click", () => {
      collectValues();
      state.error = "";
      state.step = Math.max(0, state.step - 1);
      render(true);
    });
    container.querySelector("[data-copy-application-message]")?.addEventListener("click", copyApplicationMessage);
    container.querySelector("#application-form")?.addEventListener("submit", handleSubmit);
    if (focusStart) focusDialogStart();
  }

  function collectMatchValues() {
    const form = document.getElementById("matching-form");
    if (!form) return;
    const data = new FormData(form);
    for (const [key, value] of data.entries()) {
      state.values[key] = String(value).trim();
    }
  }

  function clearQualificationAnswersExcept(type) {
    const fieldGroups = {
      driver: ["driverLicense", "code95", "tachograph", "reeferExperience"],
      udt: ["udtLicense", "udtCategory"],
      leader: ["leadershipExperience"],
      mechanic: ["mechanicExperience"],
      agronomy: ["specialistEducation"]
    };
    Object.entries(fieldGroups).forEach(([group, names]) => {
      if (group !== type) names.forEach((name) => delete state.values[name]);
    });
  }

  function handleMatchChoiceChange(event) {
    collectMatchValues();
    const group = event.target.closest(".matcher-choice-grid");
    group?.querySelectorAll(".matcher-choice").forEach((choice) => {
      choice.classList.toggle("is-selected", choice.contains(event.target));
    });
    state.error = "";
    if (event.target.name !== "qualificationType") return;
    clearQualificationAnswersExcept(event.target.value);
    const selectedValue = event.target.value;
    renderMatcher();
    requestAnimationFrame(() => {
      [...document.querySelectorAll('[name="qualificationType"]')]
        .find((radio) => radio.value === selectedValue)
        ?.focus({ preventScroll: true });
    });
  }

  function validateMatchStep(step = state.matchStep) {
    state.error = "";
    const requiredByStep = [
      ["preferredDestination"],
      ["preferredArea"],
      ["experience"],
      ["qualificationType"]
    ];
    if ((requiredByStep[step] || []).some((name) => !state.values[name])) {
      state.error = t("form.missingRequired");
      return false;
    }
    if (step !== MATCH_STEP_COUNT - 1) return true;
    const qualificationRequired = state.values.qualificationType === "driver"
      ? ["driverLicense", "code95", "tachograph", "reeferExperience"]
      : state.values.qualificationType === "udt"
        ? ["udtLicense"]
        : state.values.qualificationType === "leader"
          ? ["leadershipExperience"]
          : state.values.qualificationType === "mechanic"
            ? ["mechanicExperience"]
            : state.values.qualificationType === "agronomy"
              ? ["specialistEducation"]
              : [];
    if (qualificationRequired.some((name) => !state.values[name])) {
      state.error = t("form.missingRequired");
    } else if (!validateLatin(state.values.udtCategory)) {
      state.error = t("form.latinError");
    }
    return !state.error;
  }

  function handleMatchSubmit(event) {
    event.preventDefault();
    collectMatchValues();
    if (!validateMatchStep()) {
      renderMatcher();
      document.getElementById("application-error")?.focus();
      return;
    }
    if (state.matchStep < MATCH_STEP_COUNT - 1) {
      state.matchStep += 1;
      state.error = "";
      renderMatcher(true);
      return;
    }
    state.recommendations = recommendJobs();
    state.matchStep = MATCH_RESULTS_STEP;
    state.error = "";
    renderMatcher(true);
  }

  function startApplicationFromMatch(jobId) {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;
    state.mode = "application";
    state.jobId = job.id;
    state.step = 0;
    state.error = "";
    state.values = {
      ...state.values,
      jobId: job.id,
      matchedJobId: job.id,
      preferredLanguage: i18n.locale,
      adult: false,
      consent: false,
      shiftReadiness: []
    };
    render(true);
  }

  function collectValues() {
    const form = document.getElementById("application-form");
    if (!form) return;
    const data = new FormData(form);
    for (const [key, value] of data.entries()) {
      if (key !== "shiftReadiness") state.values[key] = String(value).trim();
    }
    if (state.step === 0) state.values.adult = (calculateAge(state.values.birthDate) ?? -1) >= 18;
    if (state.step === 3) state.values.shiftReadiness = data.getAll("shiftReadiness").map(String);
    if (state.step === 5) state.values.consent = data.has("consent");
    if (state.values.jobId) state.jobId = state.values.jobId;
  }

  function collectAndRender() {
    collectValues();
    render();
  }

  function validateLatin(value, required = false) {
    if (!value) return !required;
    return LATIN_TEXT.test(value);
  }

  function validateStep() {
    state.error = "";
    if (state.step === 0) {
      const age = calculateAge(state.values.birthDate);
      if (!state.jobId || !state.values.preferredLanguage || !state.values.firstName || !state.values.lastName || !state.values.birthDate || !state.values.phone) {
        state.error = t("form.missingRequired");
      } else if (!LATIN_NAME.test(state.values.firstName) || !LATIN_NAME.test(state.values.lastName)) {
        state.error = t("form.latinError");
      } else if (!PHONE.test(state.values.phone.replace(/[\s()-]/g, ""))) {
        state.error = t("form.phoneError");
      } else if (state.values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.values.email)) {
        state.error = t("form.missingRequired");
      } else if (age == null || age < 18) {
        state.error = candidateEngineCopy().underage;
      }
    } else if (state.step === 1) {
      if (!state.values.citizenship || !state.values.currentCountry || !state.values.currentCity) {
        state.error = t("form.missingRequired");
      } else if (
        !validateLatin(state.values.currentCity, true)
        || (state.values.citizenship === "OTHER" && !validateLatin(state.values.otherCitizenship, true))
        || (state.values.currentCountry === "OTHER" && !validateLatin(state.values.otherCountry, true))
      ) {
        state.error = t("form.latinError");
      }
    } else if (state.step === 2) {
      if (
        !state.values.legalStatus
        || !state.values.workRight
      ) {
        state.error = t("form.missingRequired");
      }
    } else if (state.step === 3) {
      if (
        !state.values.readyDate
        || !state.values.housing
        || !state.values.travellingWith
        || !(state.values.shiftReadiness || []).length
        || (state.values.travellingWith !== "alone" && !state.values.partnerAlsoApplies)
      ) {
        state.error = t("form.missingRequired");
      } else if (state.values.readyDate < today()) {
        state.error = t("form.dateError");
      }
    } else if (state.step === 4) {
      const id = state.jobId;
      const qualificationRequired = id.startsWith("driver-ce")
        ? ["driverLicense", "code95", "tachograph", "reeferExperience"]
        : id === "forklift-udt"
          ? ["udtLicense"]
          : id === "team-leader"
            ? ["leadershipExperience"]
            : id === "truck-mechanic"
              ? ["mechanicExperience"]
              : ["greenhouse-agronomist", "plant-protection"].includes(id)
                ? ["specialistEducation"]
                : [];
      if (!state.values.experience || qualificationRequired.some((name) => !state.values[name])) {
        state.error = t("form.missingRequired");
      } else if (!validateLatin(state.values.udtCategory)) {
        state.error = t("form.latinError");
      }
    } else if (!state.values.consent) {
      state.error = t("form.consentError");
    }
    return !state.error;
  }

  function englishCountry(code, otherValue) {
    return code === "OTHER" ? otherValue : i18n.countryName(code, "en");
  }

  function englishOption(key) {
    const labels = {
      statusReady: "Work paperwork is ready",
      statusClarify: "Work paperwork needs clarification",
      statusNoDocuments: "Not ready yet",
      other: "Other",
      yes: "Yes",
      no: "No",
      unknown: "Needs verification",
      required: "Required",
      notRequired: "Not required",
      alone: "Alone",
      partner: "With partner",
      family: "With family",
      friends: "With friends",
      expNone: "No experience",
      expUnder6: "Under 6 months",
      exp6to12: "6–12 months",
      exp1to2: "1–2 years",
      exp2plus: "More than 2 years",
      shiftDay: "Day shifts",
      shiftNight: "Night shifts",
      shiftLong: "10–12 hour shifts",
      shiftWeekend: "Weekend work"
    };
    return labels[key] || key || "—";
  }

  function destination(job) {
    const code = destinationCode(job);
    if (code) return i18n.countryName(code, "en");
    return job?.format || "To be confirmed";
  }

  function candidateCheckFlags(job) {
    const flags = [];
    const jobText = [job?.id, job?.category, job?.title, job?.level].join(" ").toLowerCase();
    if (state.values.workRight !== "yes") flags.push("Check right to work at destination");
    if (state.values.legalStatus === "statusNoDocuments") flags.push("Work paperwork is not ready yet");
    if (state.values.legalStatus === "statusClarify") flags.push("Clarify work paperwork before proposing a departure date");
    if (state.values.experience === "expNone" && job?.level !== "Без опыта") flags.push("No experience for a role that may require experience");
    if (jobText.includes("driver") || jobText.includes("водител")) {
      if (state.values.driverLicense !== "yes") flags.push("Driver role: confirm C+E license");
      if (state.values.code95 !== "yes") flags.push("Driver role: confirm Code 95");
      if (state.values.tachograph !== "yes") flags.push("Driver role: confirm tachograph card");
    }
    if (jobText.includes("udt") && state.values.udtLicense !== "yes") flags.push("UDT role: confirm Polish UDT");
    if (state.values.partnerAlsoApplies === "yes") flags.push("Second person also applies: check two places and housing");
    if (!flags.length) flags.push("No obvious red flags from the questionnaire");
    return flags;
  }

  function buildMessage() {
    const job = effectiveJob();
    const localized = localizedJob();
    const personal = personalMessageCopy();
    const engine = candidateEngineCopy();
    const applicationId = state.values.applicationId || createApplicationId();
    state.values.applicationId = applicationId;
    const age = calculateAge(state.values.birthDate);
    const source = state.values.source || campaignSource();
    const conversationQueue = state.values.workRight !== "yes" || state.values.legalStatus !== "statusReady"
      ? "DOCUMENT / WORK-RIGHT CHECK"
      : state.values.readyDate
        ? "READY DATE SET — CHECK VACANCY"
        : "STANDARD MANUAL REVIEW";
    const checkFlags = candidateCheckFlags(job);
    const qualification = [
      state.values.driverLicense && `C+E license: ${englishOption(state.values.driverLicense)}`,
      state.values.code95 && `Code 95: ${englishOption(state.values.code95)}`,
      state.values.tachograph && `Tachograph card: ${englishOption(state.values.tachograph)}`,
      state.values.reeferExperience && `Reefer experience: ${englishOption(state.values.reeferExperience)}`,
      state.values.udtLicense && `Polish UDT: ${englishOption(state.values.udtLicense)}`,
      state.values.udtCategory && `UDT category: ${state.values.udtCategory}`,
      state.values.leadershipExperience && `Leadership experience: ${englishOption(state.values.leadershipExperience)}`,
      state.values.mechanicExperience && `Truck mechanic experience: ${englishOption(state.values.mechanicExperience)}`,
      state.values.specialistEducation && `Professional education: ${englishOption(state.values.specialistEducation)}`
    ].filter(Boolean);
    return [
      `${personal.greeting}, ${profile.name}!`,
      personal.source,
      `${personal.reference}: ${applicationId}`,
      `${engine.source}: ${source}`,
      "",
      `KIRIS JOBS · CANDIDATE QUESTIONNAIRE · ${applicationId}`,
      `Recruiter: ${profile.name}`,
      "",
      "RECRUITER SNAPSHOT · ADMINISTRATIVE ONLY",
      `Conversation queue: ${conversationQueue}`,
      `Calculated age: ${age ?? "—"}`,
      `Ready from: ${state.values.readyDate || "—"}`,
      `Housing: ${englishOption(state.values.housing)}`,
      `Paperwork: ${englishOption(state.values.legalStatus)} / work right: ${englishOption(state.values.workRight)}`,
      `Source: ${source}`,
      "This summary supports manual follow-up only. It is not a hiring decision.",
      "",
      `Vacancy: ${localized?.title || job?.title || "Not selected"}`,
      `Vacancy ID: ${job?.id || "—"}`,
      `Destination: ${destination(job)}`,
      `Gross rate shown: ${job?.salary?.confirmed ? "Yes" : "Needs confirmation"}`,
      `Salary note: ${localized?.salary?.note || job?.salary?.note || "—"}`,
      `Site language: ${i18n.languageName(state.values.preferredLanguage || i18n.locale)} (${state.values.preferredLanguage || i18n.locale})`,
      state.values.matchedJobId ? "Vacancy selected by the on-site matching questionnaire: Yes" : "",
      "",
      `Name (passport Latin): ${state.values.firstName} ${state.values.lastName}`,
      `Date of birth: ${state.values.birthDate}`,
      `Calculated age: ${age ?? "—"}`,
      `WhatsApp: ${state.values.phone.replace(/[\s()-]/g, "")}`,
      `Email: ${state.values.email || "—"}`,
      `Age 18+: Yes`,
      `Citizenship: ${englishCountry(state.values.citizenship, state.values.otherCitizenship)}`,
      `Current location: ${englishCountry(state.values.currentCountry, state.values.otherCountry)}, ${state.values.currentCity}`,
      "",
      `Work paperwork status: ${englishOption(state.values.legalStatus)}`,
      `Right to work at destination: ${englishOption(state.values.workRight)}`,
      "",
      `Ready from: ${state.values.readyDate}`,
      `Employer housing: ${englishOption(state.values.housing)}`,
      `Travelling: ${englishOption(state.values.travellingWith)}`,
      `Second person also applies: ${englishOption(state.values.partnerAlsoApplies)}`,
      `Shift readiness: ${(state.values.shiftReadiness || []).map(englishOption).join(", ")}`,
      `Relevant experience: ${englishOption(state.values.experience)}`,
      `Experience details: ${state.values.experienceDetails || "—"}`,
      ...qualification,
      `Question / notes: ${state.values.extraNotes || "—"}`,
      "",
      "CHECK BEFORE OFFER:",
      ...checkFlags.map((flag) => `- ${flag}`),
      "",
      "Candidate confirmed the data and chose to contact Oleksandr Kiris directly via WhatsApp.",
      `Source: Kiris Jobs · ${source} · ${content.site.baseUrl || window.location.href}`
    ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");
  }

  async function copyApplicationMessage(event) {
    const message = buildMessage();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const area = document.createElement("textarea");
        area.value = message;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.append(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      const button = event?.currentTarget;
      if (button) {
        const previous = button.textContent;
        button.textContent = `✓ ${t("form.messageCopied")}`;
        setTimeout(() => {
          if (button.isConnected) button.textContent = previous;
        }, 2200);
      }
    } catch {
      document.querySelector(".application-message-preview textarea")?.select();
    }
  }

  function openWhatsApp(message) {
    const base = profile.whatsapp || `https://wa.me/${String(profile.phone || "").replace(/\D/g, "")}`;
    const separator = base.includes("?") ? "&" : "?";
    const url = `${base}${separator}text=${encodeURIComponent(message)}`;
    if (window.PortalWhatsApp?.open) {
      window.PortalWhatsApp.open(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleSubmit(event) {
    event.preventDefault();
    collectValues();
    if (!validateStep()) {
      render();
      document.getElementById("application-error")?.focus();
      return;
    }
    if (state.step < STEP_KEYS.length - 1) {
      state.step += 1;
      render(true);
      return;
    }
    if (!navigator.onLine) {
      state.error = t("form.unavailableOffline");
      render();
      return;
    }
    openWhatsApp(buildMessage());
  }

  function open(jobId = "") {
    const hasSelectedJob = jobs.some((job) => job.id === jobId);
    state.mode = hasSelectedJob ? "application" : "match";
    state.matchStep = 0;
    state.recommendations = [];
    state.jobId = hasSelectedJob ? jobId : "";
    state.step = 0;
    state.error = "";
    state.values = {
      jobId: state.jobId,
      applicationId: createApplicationId(),
      source: campaignSource(),
      preferredLanguage: i18n.locale,
      adult: false,
      consent: false,
      shiftReadiness: []
    };
    render();
    const dialog = document.getElementById("application-dialog");
    if (dialog && !dialog.open) dialog.showModal();
    focusDialogStart();
  }

  function clarifyGeneral() {
    if (!navigator.onLine) {
      window.dispatchEvent(new CustomEvent("portal:toast", { detail: { message: t("ui.whatsappNeedsInternet") } }));
      return;
    }
    const personal = personalMessageCopy();
    const engine = candidateEngineCopy();
    const message = [
      `${personal.greeting}, ${profile.name}!`,
      personal.source,
      `${engine.source}: ${campaignSource()}`,
      "",
      t("ui.directQuestion"),
      t("form.matchNoResultsText"),
      `${t("ui.siteLanguage")}: ${i18n.languageName(i18n.locale)}`
    ].join("\n");
    openWhatsApp(message);
  }

  function clarify(jobId) {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;
    if (!navigator.onLine) {
      window.dispatchEvent(new CustomEvent("portal:toast", { detail: { message: t("ui.whatsappNeedsInternet") } }));
      return;
    }
    const localized = i18n.job(job);
    const personal = personalMessageCopy();
    const engine = candidateEngineCopy();
    const message = [
      `${personal.greeting}, ${profile.name}!`,
      personal.source,
      `${engine.source}: ${campaignSource()}`,
      "",
      `${t("ui.directQuestion")}:`,
      `${localized.title} (${job.id})`,
      `${t("ui.siteLanguage")}: ${i18n.languageName(i18n.locale)}`,
      "",
      t("ui.startNeedsConfirmation"),
      t("ui.bannerText")
    ].join("\n");
    openWhatsApp(message);
  }

  i18n.subscribe(() => {
    if (document.getElementById("application-dialog")?.open) {
      state.values.preferredLanguage = i18n.locale;
      render();
    }
  });

  window.PortalApplication = { open, clarify, clarifyGeneral, buildMessage };
})();
