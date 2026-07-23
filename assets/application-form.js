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
  const LATIN_NAME = /^[\p{Script=Latin}\p{Mark}\s'-]+$/u;
  const LATIN_TEXT = /^[\p{Script=Latin}\p{Mark}\d\s.,'()/:+&\-]*$/u;
  const PHONE = /^\+[1-9]\d{7,14}$/;
  const state = {
    jobId: "",
    step: 0,
    values: {},
    error: ""
  };

  const escapeHTML = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const t = (path, variables) => i18n.t(path, variables);
  const baseJob = () => jobs.find((job) => job.id === state.jobId);
  const localizedJob = () => {
    const job = baseJob();
    return job ? i18n.job(job) : null;
  };
  const today = () => new Date().toISOString().slice(0, 10);

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

  function renderContactStep() {
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
        ${field("phone", t("form.whatsapp"), input("phone", "tel", 'autocomplete="tel" inputmode="tel" placeholder="+48500100200" required'), t("form.whatsappHint"))}
        ${field("email", t("form.email"), input("email", "email", 'autocomplete="email" inputmode="email"'))}
      </div>
      <label class="application-check">
        <input name="adult" type="checkbox" ${state.values.adult ? "checked" : ""}>
        <span>${escapeHTML(t("form.adult"))}</span>
      </label>
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
      "statusEuCitizen", "statusVisaFree", "statusWorkVisa", "statusTemporaryResidence",
      "statusPermanentResidence", "statusPeselUkr", "statusProtection", "statusNoDocuments", "other"
    ].map((key) => ({ value: key, label: t(`options.${key}`) }));
    const hasStayDocument = state.values.legalStatus !== "statusNoDocuments";
    const targetCode = destinationCode(baseJob());
    const workRightLabel = targetCode
      ? `${t("form.workRight")} — ${i18n.countryName(targetCode)}`
      : t("form.workRight");
    return `
      <div class="application-grid">
        ${field("legalStatus", t("form.legalStatus"), select("legalStatus", legalStatuses, "required"))}
        ${state.values.legalStatus === "other"
          ? field("otherLegalStatus", `${t("form.legalStatus")} — ${t("options.other")}`, input("otherLegalStatus", "text", "required"), t("form.latinHint"))
          : ""}
        ${hasStayDocument ? field("documentCountry", t("form.documentCountry"), select("documentCountry", countryOptions(COUNTRY_CODES), "required")) : ""}
        ${hasStayDocument && state.values.documentCountry === "OTHER" ? field("otherDocumentCountry", t("form.otherCountry"), input("otherDocumentCountry", "text", "required"), t("form.latinHint")) : ""}
        ${hasStayDocument ? field("documentExpiry", t("form.documentExpiry"), input("documentExpiry", "date")) : ""}
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
    const fields = [];
    const id = job?.id || "";
    if (id.startsWith("driver-ce")) {
      fields.push(
        field("driverLicense", t("form.driverLicense"), yesNoUnknown("driverLicense")),
        field("code95", t("form.code95"), yesNoUnknown("code95")),
        field("tachograph", t("form.tachograph"), yesNoUnknown("tachograph")),
        field("reeferExperience", t("form.reeferExperience"), yesNoUnknown("reeferExperience"))
      );
    } else if (id === "forklift-udt") {
      fields.push(
        field("udtLicense", t("form.udtLicense"), yesNoUnknown("udtLicense")),
        field("udtCategory", t("form.udtCategory"), input("udtCategory"))
      );
    } else if (id === "team-leader") {
      fields.push(field("leadershipExperience", t("form.leadershipExperience"), yesNoUnknown("leadershipExperience")));
    } else if (id === "truck-mechanic") {
      fields.push(field("mechanicExperience", t("form.mechanicExperience"), yesNoUnknown("mechanicExperience")));
    } else if (["greenhouse-agronomist", "plant-protection"].includes(id)) {
      fields.push(field("specialistEducation", t("form.specialistEducation"), yesNoUnknown("specialistEducation")));
    }
    return fields.join("");
  }

  function renderQualificationStep() {
    const experienceItems = ["expNone", "expUnder6", "exp6to12", "exp1to2", "exp2plus"]
      .map((key) => ({ value: key, label: t(`options.${key}`) }));
    return `
      <div class="application-grid">
        ${field("experience", t("form.experience"), select("experience", experienceItems, "required"))}
        ${qualificationFields(baseJob())}
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
    const destinations = {
      "Польша": "PL",
      "Венгрия": "HU",
      "Бельгия": "BE"
    };
    return destinations[job?.format] || "";
  }

  function renderReviewStep() {
    const job = localizedJob();
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
          ${reviewValue(t("form.whatsapp"), state.values.phone)}
          ${reviewValue(t("form.citizenship"), localizedCountry(state.values.citizenship, state.values.otherCitizenship))}
          ${reviewValue(t("form.currentCountry"), localizedCountry(state.values.currentCountry, state.values.otherCountry))}
          ${reviewValue(t("form.currentCity"), state.values.currentCity)}
          ${reviewValue(t("form.legalStatus"), optionLabel("legalStatus", state.values.legalStatus))}
          ${reviewValue(
            `${t("form.legalStatus")} — ${t("options.other")}`,
            state.values.legalStatus === "other" ? state.values.otherLegalStatus : ""
          )}
          ${reviewValue(
            t("form.documentCountry"),
            state.values.legalStatus === "statusNoDocuments"
              ? ""
              : localizedCountry(state.values.documentCountry, state.values.otherDocumentCountry)
          )}
          ${reviewValue(
            t("form.documentExpiry"),
            state.values.legalStatus === "statusNoDocuments" ? "" : state.values.documentExpiry
          )}
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

  function render() {
    const dialog = document.getElementById("application-dialog");
    const container = document.getElementById("application-dialog-content");
    if (!dialog || !container) return;
    const percent = ((state.step + 1) / STEP_KEYS.length) * 100;
    container.innerHTML = `
      <header class="application-header">
        <p class="overline">${escapeHTML(t("form.title"))}</p>
        <h2>${escapeHTML(t(`form.${STEP_KEYS[state.step]}`))}</h2>
        <p>${escapeHTML(t("form.intro"))}</p>
        <div class="application-progress" aria-label="${escapeHTML(`${t("ui.formStep")} ${state.step + 1} ${t("ui.of")} ${STEP_KEYS.length}`)}">
          <span style="width:${percent}%"></span>
        </div>
        <small>${escapeHTML(t("ui.formStep"))} ${state.step + 1} ${escapeHTML(t("ui.of"))} ${STEP_KEYS.length}</small>
      </header>
      <form id="application-form" novalidate>
        <div class="application-error" id="application-error" role="alert" ${state.error ? "" : "hidden"}>${escapeHTML(state.error)}</div>
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
    });
    container.querySelector("[name='currentCountry']")?.addEventListener("change", collectAndRender);
    container.querySelector("[name='citizenship']")?.addEventListener("change", collectAndRender);
    container.querySelector("[name='legalStatus']")?.addEventListener("change", collectAndRender);
    container.querySelector("[name='documentCountry']")?.addEventListener("change", collectAndRender);
    container.querySelector("[name='travellingWith']")?.addEventListener("change", collectAndRender);
    container.querySelector("[data-application-back]")?.addEventListener("click", () => {
      collectValues();
      state.error = "";
      state.step = Math.max(0, state.step - 1);
      render();
    });
    container.querySelector("#application-form")?.addEventListener("submit", handleSubmit);
  }

  function collectValues() {
    const form = document.getElementById("application-form");
    if (!form) return;
    const data = new FormData(form);
    for (const [key, value] of data.entries()) {
      if (key !== "shiftReadiness") state.values[key] = String(value).trim();
    }
    if (state.step === 0) state.values.adult = data.has("adult");
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
      if (!state.jobId || !state.values.preferredLanguage || !state.values.firstName || !state.values.lastName || !state.values.phone) {
        state.error = t("form.missingRequired");
      } else if (!LATIN_NAME.test(state.values.firstName) || !LATIN_NAME.test(state.values.lastName)) {
        state.error = t("form.latinError");
      } else if (!PHONE.test(state.values.phone.replace(/[\s()-]/g, ""))) {
        state.error = t("form.phoneError");
      } else if (state.values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.values.email)) {
        state.error = t("form.missingRequired");
      } else if (!state.values.adult) {
        state.error = t("form.adultError");
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
      const needsDocumentCountry = state.values.legalStatus !== "statusNoDocuments";
      if (
        !state.values.legalStatus
        || !state.values.workRight
        || (needsDocumentCountry && !state.values.documentCountry)
        || (state.values.legalStatus === "other" && !state.values.otherLegalStatus)
      ) {
        state.error = t("form.missingRequired");
      } else if (
        (state.values.legalStatus === "other" && !validateLatin(state.values.otherLegalStatus, true))
        || (needsDocumentCountry && state.values.documentCountry === "OTHER" && !validateLatin(state.values.otherDocumentCountry, true))
      ) {
        state.error = t("form.latinError");
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
      } else if (
        !validateLatin(state.values.experienceDetails)
        || !validateLatin(state.values.extraNotes)
        || !validateLatin(state.values.udtCategory)
      ) {
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
      statusEuCitizen: "EU / EEA / Swiss citizen",
      statusVisaFree: "Visa-free stay / biometric passport",
      statusWorkVisa: "Work visa",
      statusTemporaryResidence: "Temporary residence permit",
      statusPermanentResidence: "Permanent residence permit",
      statusPeselUkr: "PESEL UKR / temporary protection",
      statusProtection: "Asylum / international protection",
      statusNoDocuments: "No work documents yet",
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

  function buildMessage() {
    const job = baseJob();
    const localized = localizedJob();
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
      "CANDIDATE QUESTIONNAIRE · CITRONEX",
      `Vacancy: ${localized?.title || job?.title || "Not selected"}`,
      `Vacancy ID: ${job?.id || "—"}`,
      `Destination: ${destination(job)}`,
      `Site language: ${i18n.languageName(state.values.preferredLanguage || i18n.locale)} (${state.values.preferredLanguage || i18n.locale})`,
      "",
      `Name (passport Latin): ${state.values.firstName} ${state.values.lastName}`,
      `WhatsApp: ${state.values.phone.replace(/[\s()-]/g, "")}`,
      `Email: ${state.values.email || "—"}`,
      `Age 18+: Yes`,
      `Citizenship: ${englishCountry(state.values.citizenship, state.values.otherCitizenship)}`,
      `Current location: ${englishCountry(state.values.currentCountry, state.values.otherCountry)}, ${state.values.currentCity}`,
      "",
      `Legal status: ${englishOption(state.values.legalStatus)}`,
      `Legal status details: ${state.values.legalStatus === "other" ? state.values.otherLegalStatus : "—"}`,
      `Document issued by: ${state.values.legalStatus === "statusNoDocuments" ? "No document yet" : englishCountry(state.values.documentCountry, state.values.otherDocumentCountry)}`,
      `Document valid until: ${state.values.legalStatus === "statusNoDocuments" ? "Not applicable" : state.values.documentExpiry || "Not provided"}`,
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
      "Candidate confirmed the data and chose to contact the recruiter via WhatsApp."
    ].join("\n");
  }

  function openWhatsApp(message) {
    const base = profile.whatsapp || `https://wa.me/${String(profile.phone || "").replace(/\D/g, "")}`;
    const separator = base.includes("?") ? "&" : "?";
    const url = `${base}${separator}text=${encodeURIComponent(message)}`;
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
      render();
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
    state.jobId = jobs.some((job) => job.id === jobId) ? jobId : "";
    state.step = 0;
    state.error = "";
    state.values = {
      jobId: state.jobId,
      preferredLanguage: i18n.locale,
      adult: false,
      consent: false,
      shiftReadiness: []
    };
    render();
    const dialog = document.getElementById("application-dialog");
    if (dialog && !dialog.open) dialog.showModal();
  }

  function clarify(jobId) {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;
    if (!navigator.onLine) {
      window.dispatchEvent(new CustomEvent("portal:toast", { detail: { message: t("ui.whatsappNeedsInternet") } }));
      return;
    }
    const localized = i18n.job(job);
    const message = [
      `${t("ui.directQuestion")}:`,
      `${localized.title} (${job.id})`,
      `${t("ui.siteLanguage")}: ${i18n.languageName(i18n.locale)}`,
      "",
      "Please confirm the current location, start date, schedule, housing and document requirements."
    ].join("\n");
    openWhatsApp(message);
  }

  i18n.subscribe(() => {
    if (document.getElementById("application-dialog")?.open) {
      state.values.preferredLanguage = i18n.locale;
      render();
    }
  });

  window.PortalApplication = { open, clarify, buildMessage };
})();
