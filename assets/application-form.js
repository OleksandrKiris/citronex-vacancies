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
    "stepDocuments",
    "stepLogistics",
    "stepWork",
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
  const DRAFT_VERSION = 3;
  const DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const DRAFT_PREFIX = "kiris-jobs-application:";
  const SENSITIVE_DRAFT_FIELDS = new Set([
    "pesel",
    "passportNumber",
    "passportExpiry",
    "emergencyContactName",
    "emergencyContactPhone"
  ]);
  const PHYSICAL_JOB_IDS = new Set([
    "greenhouse-tomatoes",
    "greenhouse-renewal",
    "tomato-sorting",
    "banana-warehouse-poland",
    "banana-warehouse-hungary",
    "banana-warehouse-belgium",
    "plant-protection",
    "site-cleaning",
    "forklift-udt"
  ]);
  const ARRIVALS_DEPARTMENT = {
    "greenhouse-tomatoes": "SZKLARNIA",
    "greenhouse-renewal": "SZKLARNIA",
    "plant-protection": "SZKLARNIA",
    "greenhouse-agronomist": "SZKLARNIA",
    "tomato-sorting": "MAGAZYN",
    "banana-warehouse-poland": "MAGAZYN",
    "banana-warehouse-hungary": "MAGAZYN",
    "banana-warehouse-belgium": "MAGAZYN",
    "forklift-udt": "MAGAZYN"
  };
  const JOB_LOCATIONS = {
    "greenhouse-tomatoes": ["Siechnice", "Ryczywół", "Bogatynia"],
    "greenhouse-renewal": ["Siechnice", "Ryczywół", "Bogatynia"],
    "tomato-sorting": ["Siechnice", "Ryczywół", "Bogatynia"],
    "banana-warehouse-poland": ["Pruszcz Gdański", "Zgorzelec"],
    "plant-protection": ["Siechnice", "Ryczywół", "Bogatynia"],
    "site-cleaning": ["Zgorzelec"],
    "forklift-udt": ["DO_CONFIRM"],
    "team-leader": ["Siechnice", "Ryczywół", "Bogatynia", "Magazyn"],
    "greenhouse-agronomist": ["Siechnice", "Ryczywół", "Bogatynia"],
    "truck-mechanic": ["Zgorzelec", "DO_CONFIRM"],
    "driver-ce-poland": ["Wrocław / Siechnice", "Zgorzelec", "Ryczywół", "Stok", "Pruszcz Gdański"],
    "driver-ce-relief": ["DO_CONFIRM"],
    "banana-warehouse-hungary": ["Okolice Budapesztu"],
    "banana-warehouse-belgium": ["DO_CONFIRM"]
  };
  const state = {
    mode: "application",
    matchStep: 0,
    jobId: "",
    step: 0,
    values: {},
    error: "",
    invalidFields: [],
    recommendations: [],
    hasDraft: false
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
  const canApply = (job) => job?.status === "open" || job?.status === "verify";
  const today = () => new Date().toISOString().slice(0, 10);
  const draftKey = (jobId) => `${DRAFT_PREFIX}${jobId}`;

  function initialApplicationValues(jobId) {
    const locations = JOB_LOCATIONS[jobId] || ["DO_CONFIRM"];
    return {
      jobId,
      applicationId: createApplicationId(),
      source: campaignSource(),
      preferredLanguage: i18n.locale,
      adult: false,
      consent: false,
      preferredLocation: locations.length === 1 ? locations[0] : "",
      shiftReadiness: []
    };
  }

  function readDraft(jobId) {
    if (!jobId) return null;
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey(jobId)) || "null");
      const isExpired = !draft?.updatedAt || Date.now() - Number(draft.updatedAt) > DRAFT_MAX_AGE;
      if (
        !draft
        || draft.version !== DRAFT_VERSION
        || draft.jobId !== jobId
        || !draft.values
        || typeof draft.values !== "object"
        || isExpired
      ) {
        localStorage.removeItem(draftKey(jobId));
        return null;
      }
      return {
        step: Math.max(0, Math.min(STEP_KEYS.length - 1, Number(draft.step) || 0)),
        values: draft.values
      };
    } catch {
      return null;
    }
  }

  function saveDraft() {
    if (state.mode !== "application" || !state.jobId) return;
    try {
      const draftValues = Object.fromEntries(
        Object.entries(state.values).filter(([key]) => !SENSITIVE_DRAFT_FIELDS.has(key))
      );
      localStorage.setItem(draftKey(state.jobId), JSON.stringify({
        version: DRAFT_VERSION,
        jobId: state.jobId,
        step: state.step,
        values: draftValues,
        updatedAt: Date.now()
      }));
      state.hasDraft = true;
    } catch {
      // The form still works when private browsing or storage restrictions block drafts.
    }
  }

  function isPhysicalJob(jobId = state.jobId) {
    return PHYSICAL_JOB_IDS.has(jobId);
  }

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
        greeting: "Magandang araw",
        source: "Ipinapadala ko ang aking aplikasyon sa pamamagitan ng inyong Kiris Jobs platform.",
        reference: "Numero ng aplikasyon"
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

  function isoWeekLabel(value) {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return "";
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${String(week).padStart(2, "0")}/${date.getUTCFullYear()}`;
  }

  function polishDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || "");
  }

  function arrivalsDepartment(jobId) {
    return ARRIVALS_DEPARTMENT[jobId] || "DO UZUPEŁNIENIA";
  }

  function validPesel(value) {
    if (!/^\d{11}$/.test(String(value || ""))) return false;
    const digits = String(value).split("").map(Number);
    const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
    const checksum = (10 - (weights.reduce((sum, weight, index) => sum + weight * digits[index], 0) % 10)) % 10;
    return checksum === digits[10];
  }

  function peselIdentity(value) {
    if (!validPesel(value)) return null;
    const digits = String(value).split("").map(Number);
    const shortYear = Number(String(value).slice(0, 2));
    const encodedMonth = Number(String(value).slice(2, 4));
    const day = Number(String(value).slice(4, 6));
    let century = 1900;
    let month = encodedMonth;
    if (encodedMonth >= 81 && encodedMonth <= 92) {
      century = 1800;
      month -= 80;
    } else if (encodedMonth >= 21 && encodedMonth <= 32) {
      century = 2000;
      month -= 20;
    } else if (encodedMonth >= 41 && encodedMonth <= 52) {
      century = 2100;
      month -= 40;
    } else if (encodedMonth >= 61 && encodedMonth <= 72) {
      century = 2200;
      month -= 60;
    }
    const year = century + shortYear;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day
    ) return null;
    return {
      birthDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      gender: digits[9] % 2 === 1 ? "M" : "K"
    };
  }

  function passportExpiresSoon(value) {
    const expiry = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(expiry.getTime())) return false;
    const warningDate = new Date();
    warningDate.setUTCHours(0, 0, 0, 0);
    warningDate.setUTCMonth(warningDate.getUTCMonth() + 6);
    return expiry <= warningDate;
  }

  function locationItems(jobId = state.jobId) {
    return (JOB_LOCATIONS[jobId] || ["DO_CONFIRM"]).map((value) => ({
      value,
      label: value === "DO_CONFIRM" ? t("options.locationToConfirm") : value
    }));
  }

  function polishLocation(value) {
    return value === "DO_CONFIRM" ? "DO USTALENIA" : value || "DO USTALENIA";
  }

  function createGroupCode() {
    const suffix = String(state.values.applicationId || createApplicationId()).split("-").pop();
    return `GR-${suffix}`;
  }

  function normalizeGroupCode(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "")
      .slice(0, 20);
  }

  function maskSensitive(value, visible = 4) {
    const text = String(value || "");
    if (!text) return "";
    if (text.length <= visible) return "••••";
    return `${"•".repeat(Math.min(8, text.length - visible))}${text.slice(-visible)}`;
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
    const invalid = state.invalidFields.includes(name);
    const error = state.invalidFields[0] === name ? state.error : "";
    if (input.includes('data-application-choice="true"')) {
      return `
        <fieldset class="application-field application-choice-field${invalid ? " is-invalid" : ""}">
          <legend>${escapeHTML(label)}</legend>
          ${input}
          ${hint ? `<small>${escapeHTML(hint)}</small>` : ""}
          ${error ? `<small class="application-field-error">${escapeHTML(error)}</small>` : ""}
        </fieldset>
      `;
    }
    return `
      <label class="application-field${invalid ? " is-invalid" : ""}" for="application-${escapeHTML(name)}">
        <span>${escapeHTML(label)}</span>
        ${input}
        ${hint ? `<small>${escapeHTML(hint)}</small>` : ""}
        ${error ? `<small class="application-field-error">${escapeHTML(error)}</small>` : ""}
      </label>
    `;
  }

  function input(name, type = "text", attributes = "") {
    const value = state.values[name] ?? "";
    return `<input id="application-${escapeHTML(name)}" name="${escapeHTML(name)}" type="${escapeHTML(type)}" value="${escapeHTML(value)}" ${attributes}>`;
  }

  function normalizePhoneInput(value, finalize = false) {
    const raw = String(value || "").trim();
    const usesInternationalPrefix = raw.startsWith("+") || raw.startsWith("00");
    let digits = raw.replace(/\D/g, "");
    if (raw.startsWith("00")) digits = digits.slice(2);
    const normalized = `${usesInternationalPrefix ? "+" : ""}${digits.slice(0, 15)}`;
    return finalize && normalized === "+" ? "" : normalized;
  }

  function normalizeApplicationInput(input, finalize = false) {
    const mode = input?.dataset?.normalize;
    if (!mode) return;
    const previous = input.value;
    const next = mode === "phone"
      ? normalizePhoneInput(previous, finalize)
      : mode === "digits"
        ? previous.replace(/\D/g, "").slice(0, Number(input.maxLength) || 11)
        : previous.toUpperCase().replace(/[^A-Z0-9 -]/g, "").slice(0, Number(input.maxLength) || 20);
    if (next !== previous) input.value = next;
  }

  function bindApplicationInputNormalization(form) {
    form?.querySelectorAll("[data-normalize]").forEach((input) => {
      input.addEventListener("input", () => normalizeApplicationInput(input));
      input.addEventListener("blur", () => {
        normalizeApplicationInput(input, true);
        collectValues();
      });
    });
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

  function choiceButtons(name, items) {
    const current = String(state.values[name] ?? "");
    return `
      <div class="application-choice-buttons" data-application-choice="true">
        ${items.map((item) => `
          <label class="application-choice-button">
            <input type="radio" name="${escapeHTML(name)}" value="${escapeHTML(item.value)}" ${current === item.value ? "checked" : ""} required>
            <span>${escapeHTML(item.label)}</span>
          </label>
        `).join("")}
      </div>
    `;
  }

  function yesNoUnknown(name) {
    return choiceButtons(name, [
      { value: "yes", label: t("options.yes") },
      { value: "no", label: t("options.no") },
      { value: "unknown", label: t("options.unknown") }
    ]);
  }

  function yesNo(name) {
    return choiceButtons(name, [
      { value: "yes", label: t("options.yes") },
      { value: "no", label: t("options.no") }
    ]);
  }

  function countryOptions(codes) {
    return codes.map((code) => ({ value: code, label: i18n.countryName(code) }));
  }

  function jobOptions() {
    return jobs
      .filter(canApply)
      .map((job) => ({ value: job.id, label: i18n.job(job).title }));
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
      if (!canApply(job)) return null;
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
    const selectedJob = localizedJob();
    const age = calculateAge(state.values.birthDate);
    const ageHint = age == null ? "" : `${engine.age}: ${age}`;
    return `
      ${selectedJob ? `
        <div class="application-selected-vacancy">
          <span>${escapeHTML(t("form.selectedVacancy"))}</span>
          <strong>${escapeHTML(selectedJob.title)}</strong>
          <small>${escapeHTML(selectedJob.format)} · ${escapeHTML(selectedJob.location)}</small>
          <input type="hidden" name="jobId" value="${escapeHTML(state.jobId)}">
        </div>
      ` : ""}
      <div class="application-grid">
        ${selectedJob ? "" : field("jobId", t("form.selectedVacancy"), select("jobId", jobOptions(), "required"))}
        ${field("preferredLanguage", t("form.preferredLanguage"), select(
          "preferredLanguage",
          i18n.supported.map((locale) => ({ value: locale, label: i18n.languageName(locale) })),
          "required"
        ))}
        ${field("firstName", t("form.firstName"), input("firstName", "text", 'autocomplete="given-name" inputmode="text" autocapitalize="characters" required'), t("form.latinHint"))}
        ${field("lastName", t("form.lastName"), input("lastName", "text", 'autocomplete="family-name" inputmode="text" autocapitalize="characters" required'))}
        ${field("birthDate", engine.birthDate, input("birthDate", "date", `autocomplete="bday" min="${yearsAgo(100)}" max="${yearsAgo(18)}" required`), ageHint)}
        ${field("gender", t("form.gender"), choiceButtons("gender", [
          { value: "M", label: t("options.genderMale") },
          { value: "K", label: t("options.genderFemale") }
        ]))}
        ${field("phone", t("form.whatsapp"), input("phone", "tel", 'autocomplete="tel" inputmode="tel" enterkeyhint="next" data-normalize="phone" maxlength="16" placeholder="+48500100200" required'), t("form.whatsappHint"))}
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
        ${citizenship === "OTHER" ? field("otherCitizenship", t("form.otherCountry"), input("otherCitizenship", "text", "required")) : ""}
        ${field("currentCountry", t("form.currentCountry"), select("currentCountry", countryOptions(COUNTRY_CODES), "required"))}
        ${currentCountry === "OTHER" ? field("otherCountry", t("form.otherCountry"), input("otherCountry", "text", "required")) : ""}
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
        ${state.values.legalStatus && state.values.legalStatus !== "statusNoDocuments"
          ? field("documentExpiry", t("form.documentExpiry"), input("documentExpiry", "date", `min="${today()}" required`))
          : ""}
        ${field("hasPesel", t("form.hasPesel"), yesNo("hasPesel"))}
        ${state.values.hasPesel === "yes"
          ? field("pesel", t("form.pesel"), input("pesel", "text", 'inputmode="numeric" enterkeyhint="next" autocomplete="off" data-normalize="digits" minlength="11" maxlength="11" required'))
          : ""}
        ${field("passportNumber", t("form.passportNumber"), input("passportNumber", "text", 'inputmode="text" enterkeyhint="next" autocomplete="off" autocapitalize="characters" spellcheck="false" data-normalize="passport" minlength="5" maxlength="20" required'))}
        ${field("passportExpiry", t("form.passportExpiry"), input("passportExpiry", "date", `min="${today()}" required`))}
        ${field("workRight", workRightLabel, choiceButtons("workRight", [
          { value: "yes", label: t("options.workRightYes") },
          { value: "no", label: t("options.workRightNo") },
          { value: "unknown", label: t("options.workRightUnknown") }
        ]))}
      </div>
      <p class="application-security">ⓘ ${escapeHTML(t("form.noDocumentNumbers"))}</p>
    `;
  }

  function renderLogisticsStep() {
    return `
      <div class="application-grid">
        ${field("preferredLocation", t("form.preferredLocation"), select("preferredLocation", locationItems(), "required"))}
        ${field("readyDate", t("form.readyDate"), input("readyDate", "date", `min="${today()}" required`))}
        ${field("housing", t("form.housing"), choiceButtons("housing", [
          { value: "required", label: t("options.housingRequired") },
          { value: "notRequired", label: t("options.housingNotRequired") }
        ]))}
        ${field("travellingWith", t("form.travellingWith"), select("travellingWith", [
          { value: "alone", label: t("options.alone") },
          { value: "partner", label: t("options.partner") },
          { value: "family", label: t("options.family") },
          { value: "friends", label: t("options.friends") }
        ], "required"))}
        ${state.values.travellingWith && state.values.travellingWith !== "alone"
          ? field("partnerAlsoApplies", t("form.partnerAlsoApplies"), yesNoUnknown("partnerAlsoApplies"))
          : ""}
        ${state.values.travellingWith && state.values.travellingWith !== "alone"
          ? field("groupCode", t("form.groupCode"), input("groupCode", "text", 'autocomplete="off" inputmode="text" maxlength="20" placeholder="GR-ABC123"'), state.values.groupCode ? "" : t("form.groupCodeHint"))
          : ""}
        ${field("emergencyContactName", t("form.emergencyContactName"), input("emergencyContactName", "text", 'autocomplete="off" inputmode="text" required'))}
        ${field("emergencyContactPhone", t("form.emergencyContactPhone"), input("emergencyContactPhone", "tel", 'autocomplete="off" inputmode="tel" enterkeyhint="next" data-normalize="phone" maxlength="16" placeholder="+48500100200" required'))}
      </div>
    `;
  }

  function renderWorkStep() {
    const shifts = ["shiftDay", "shiftNight", "shiftLong", "shiftWeekend"];
    const currentShifts = Array.isArray(state.values.shiftReadiness) ? state.values.shiftReadiness : [];
    const durationItems = ["durationUnder3", "duration3to6", "duration6to12", "durationLongTerm"]
      .map((key) => ({ value: key, label: t(`options.${key}`) }));
    const noticeItems = ["noticeImmediate", "notice1Week", "notice2Weeks", "notice1Month", "noticeOther"]
      .map((key) => ({ value: key, label: t(`options.${key}`) }));
    const liftItems = ["liftUpTo5", "liftUpTo10", "liftUpTo15", "liftUpTo20", "liftOver20"]
      .map((key) => ({ value: key, label: t(`options.${key}`) }));
    const polishItems = ["polishNone", "polishBasic", "polishCommunicative", "polishGood"]
      .map((key) => ({ value: key, label: t(`options.${key}`) }));
    return `
      <div class="application-grid">
        ${field("plannedDuration", t("form.plannedDuration"), select("plannedDuration", durationItems, "required"))}
        ${field("currentlyEmployed", t("form.currentlyEmployed"), yesNo("currentlyEmployed"))}
        ${state.values.currentlyEmployed === "yes"
          ? field("noticePeriod", t("form.noticePeriod"), select("noticePeriod", noticeItems, "required"))
          : ""}
        ${field("overtimeReady", t("form.overtimeReady"), yesNo("overtimeReady"))}
        ${isPhysicalJob()
          ? field("standingReady", t("form.standingReady"), yesNo("standingReady"))
          : ""}
        ${isPhysicalJob()
          ? field("liftCapacity", t("form.liftCapacity"), select("liftCapacity", liftItems, "required"))
          : ""}
        ${field("polishLevel", t("form.polishLevel"), select("polishLevel", polishItems, "required"))}
        ${field("workedInPoland", t("form.workedInPoland"), yesNo("workedInPoland"))}
        ${field("formerCitronexWorker", t("form.formerCitronexWorker"), yesNo("formerCitronexWorker"))}
      </div>
      <fieldset class="application-fieldset${state.invalidFields.includes("shiftReadiness") ? " is-invalid" : ""}">
        <legend>${escapeHTML(t("form.shiftReadiness"))}</legend>
        <div class="application-check-grid">
          ${shifts.map((key) => `
            <label class="application-check">
              <input name="shiftReadiness" type="checkbox" value="${key}" ${currentShifts.includes(key) ? "checked" : ""}>
              <span>${escapeHTML(t(`options.${key}`))}</span>
            </label>
          `).join("")}
        </div>
        ${state.invalidFields[0] === "shiftReadiness" ? `<small class="application-field-error">${escapeHTML(state.error)}</small>` : ""}
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
    const hasOptionalDetails = [
      state.values.experienceDetails,
      state.values.workLimitations,
      state.values.extraNotes
    ].some(Boolean);
    return `
      <div class="application-grid">
        ${field("experience", t("form.experience"), select("experience", experienceItems, "required"))}
        ${qualificationFields(effectiveJob())}
      </div>
      <details class="application-optional"${hasOptionalDetails ? " open" : ""}>
        <summary>${escapeHTML(t("form.experienceDetails"))}</summary>
        <div class="application-optional-fields">
          ${field("experienceDetails", t("form.experienceDetails"), `<textarea id="application-experienceDetails" name="experienceDetails" rows="3">${escapeHTML(state.values.experienceDetails || "")}</textarea>`)}
          ${field("workLimitations", t("form.workLimitations"), `<textarea id="application-workLimitations" name="workLimitations" rows="3">${escapeHTML(state.values.workLimitations || "")}</textarea>`, t("form.workLimitationsHint"))}
          ${field("extraNotes", t("form.extraNotes"), `<textarea id="application-extraNotes" name="extraNotes" rows="3">${escapeHTML(state.values.extraNotes || "")}</textarea>`)}
        </div>
      </details>
    `;
  }

  function reviewValue(label, value) {
    if (!value) return "";
    return `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`;
  }

  function reviewGroup(title, values, step = null) {
    const content = values.filter(Boolean).join("");
    if (!content) return "";
    return `
      <section class="application-review-group">
        <header>
          <h4>${escapeHTML(title)}</h4>
          ${step == null ? "" : `<button type="button" data-edit-application-step="${step}">${escapeHTML(t("form.editSection"))}</button>`}
        </header>
        <dl>${content}</dl>
      </section>
    `;
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
        <div class="application-review-heading">
          <h3>${escapeHTML(t("form.reviewTitle"))}</h3>
          <p>${escapeHTML(t("form.reviewHint"))}</p>
        </div>
        <div class="application-review-groups">
          ${reviewGroup(t("form.selectedVacancy"), [
            reviewValue(t("form.selectedVacancy"), job?.title)
          ])}
          ${reviewGroup(t("form.stepContact"), [
            reviewValue(`${t("form.firstName")} / ${t("form.lastName")}`, `${state.values.firstName || ""} ${state.values.lastName || ""}`.trim()),
            reviewValue(engine.birthDate, state.values.birthDate),
            reviewValue(engine.age, age == null ? "" : String(age)),
            reviewValue(t("form.gender"), state.values.gender ? t(`options.${state.values.gender === "M" ? "genderMale" : "genderFemale"}`) : ""),
            reviewValue(t("form.whatsapp"), state.values.phone),
            reviewValue(t("form.email"), state.values.email)
          ], 0)}
          ${reviewGroup(t("form.stepDocuments"), [
            reviewValue(t("form.citizenship"), localizedCountry(state.values.citizenship, state.values.otherCitizenship)),
            reviewValue(t("form.currentCountry"), localizedCountry(state.values.currentCountry, state.values.otherCountry)),
            reviewValue(t("form.currentCity"), state.values.currentCity),
            reviewValue(t("form.legalStatus"), optionLabel("legalStatus", state.values.legalStatus)),
            reviewValue(t("form.documentExpiry"), polishDate(state.values.documentExpiry)),
            reviewValue(t("form.pesel"), state.values.hasPesel === "yes" ? maskSensitive(state.values.pesel) : t("options.no")),
            reviewValue(t("form.passportNumber"), maskSensitive(state.values.passportNumber)),
            reviewValue(t("form.passportExpiry"), polishDate(state.values.passportExpiry)),
            reviewValue(t("form.workRight"), state.values.workRight ? t(`options.workRight${state.values.workRight[0].toUpperCase()}${state.values.workRight.slice(1)}`) : "")
          ], 1)}
          ${reviewGroup(t("form.stepLogistics"), [
            reviewValue(t("form.preferredLocation"), state.values.preferredLocation === "DO_CONFIRM" ? t("options.locationToConfirm") : state.values.preferredLocation),
            reviewValue(t("form.readyDate"), polishDate(state.values.readyDate)),
            reviewValue(t("form.housing"), state.values.housing === "required" ? t("options.housingRequired") : t("options.housingNotRequired")),
            reviewValue(t("form.travellingWith"), optionLabel("travellingWith", state.values.travellingWith)),
            reviewValue(t("form.partnerAlsoApplies"), optionLabel("partnerAlsoApplies", state.values.partnerAlsoApplies)),
            reviewValue(t("form.groupCode"), state.values.groupCode),
            reviewValue(t("form.emergencyContactName"), state.values.emergencyContactName),
            reviewValue(t("form.emergencyContactPhone"), state.values.emergencyContactPhone)
          ], 2)}
          ${reviewGroup(t("form.stepWork"), [
            reviewValue(t("form.plannedDuration"), optionLabel("plannedDuration", state.values.plannedDuration)),
            reviewValue(t("form.currentlyEmployed"), optionLabel("currentlyEmployed", state.values.currentlyEmployed)),
            reviewValue(t("form.noticePeriod"), optionLabel("noticePeriod", state.values.noticePeriod)),
            reviewValue(t("form.overtimeReady"), optionLabel("overtimeReady", state.values.overtimeReady)),
            reviewValue(t("form.standingReady"), optionLabel("standingReady", state.values.standingReady)),
            reviewValue(t("form.liftCapacity"), optionLabel("liftCapacity", state.values.liftCapacity)),
            reviewValue(t("form.shiftReadiness"), shiftValues)
          ], 3)}
          ${reviewGroup(t("form.stepQualification"), [
            reviewValue(t("form.experience"), state.values.experience ? t(`options.${state.values.experience}`) : ""),
            reviewValue(t("form.experienceDetails"), state.values.experienceDetails),
            reviewValue(t("form.polishLevel"), optionLabel("polishLevel", state.values.polishLevel)),
            reviewValue(t("form.workedInPoland"), optionLabel("workedInPoland", state.values.workedInPoland)),
            reviewValue(t("form.formerCitronexWorker"), optionLabel("formerCitronexWorker", state.values.formerCitronexWorker)),
            reviewValue(t("form.stepQualification"), qualificationValues),
            reviewValue(t("form.workLimitations"), state.values.workLimitations),
            reviewValue(t("form.extraNotes"), state.values.extraNotes)
          ], 3)}
        </div>
      </div>
      <aside class="application-safety-note">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>${escapeHTML(t("ui.recruiterEyebrow"))}: ${escapeHTML(profile.name)} · ${escapeHTML(profile.phone)}</strong>
          <p>${escapeHTML(t("ui.antiFraudWarning"))}</p>
        </div>
      </aside>
      <details class="application-message-preview">
        <summary>
          <span>
            <strong>${escapeHTML(t("form.messagePreview"))}</strong>
            <small>${escapeHTML(t("form.viewMessage"))}</small>
          </span>
          <span aria-hidden="true">⌄</span>
        </summary>
        <div class="application-message-preview-content">
          <p>${escapeHTML(t("form.messagePreviewHint"))}</p>
          <textarea readonly rows="12" aria-label="${escapeHTML(t("form.messagePreview"))}">${escapeHTML(buildMessage())}</textarea>
          <button class="button button-secondary" type="button" data-copy-application-message>⧉ ${escapeHTML(t("form.copyMessage"))}</button>
        </div>
      </details>
      <label class="application-check application-consent${state.invalidFields.includes("consent") ? " is-invalid" : ""}">
        <input name="consent" type="checkbox" ${state.values.consent ? "checked" : ""}>
        <span>${escapeHTML(t("form.consent"))}</span>
        ${state.invalidFields[0] === "consent" ? `<small class="application-field-error">${escapeHTML(state.error)}</small>` : ""}
      </label>
    `;
  }

  function stepContent() {
    if (state.step === 0) return renderContactStep();
    if (state.step === 1) return `
      <section class="application-form-group">
        <h3>${escapeHTML(t("form.stepLocation"))}</h3>
        ${renderLocationStep()}
      </section>
      <section class="application-form-group">
        <h3>${escapeHTML(t("form.stepDocuments"))}</h3>
        ${renderDocumentsStep()}
      </section>
    `;
    if (state.step === 2) return `
      <section class="application-form-group">
        <h3>${escapeHTML(t("form.sectionTravel"))}</h3>
        ${renderLogisticsStep()}
      </section>
    `;
    if (state.step === 3) return `
      <section class="application-form-group">
        <h3>${escapeHTML(t("form.sectionAvailability"))}</h3>
        ${renderWorkStep()}
      </section>
      <section class="application-form-group">
        <h3>${escapeHTML(t("form.sectionExperience"))}</h3>
        ${renderQualificationStep()}
      </section>
    `;
    return renderReviewStep();
  }

  function focusDialogStart() {
    requestAnimationFrame(() => {
      if (document.body.classList.contains("standalone-application-page")) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        document.getElementById("application-step-title")?.focus({ preventScroll: true });
        return;
      }
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

  function draftControl() {
    if (!state.hasDraft) return "";
    return `
      <div class="application-draft-control">
        <span>✓ ${escapeHTML(t("form.draftSaved"))}</span>
        <button class="application-clear-draft" type="button" data-clear-application-draft>
          ${escapeHTML(t("form.clearDraft"))}
        </button>
      </div>
    `;
  }

  function collectPrecheckValues() {
    const form = document.getElementById("application-precheck-form");
    if (!form) return;
    const data = new FormData(form);
    ["precheckAdult", "precheckWorkRight", "precheckConditions", "precheckPhysical"].forEach((name) => {
      if (data.has(name)) state.values[name] = String(data.get(name)).trim();
    });
    saveDraft();
  }

  function handlePrecheckSubmit(event) {
    event.preventDefault();
    collectPrecheckValues();
    const required = ["precheckAdult", "precheckWorkRight", "precheckConditions"];
    if (isPhysicalJob()) required.push("precheckPhysical");
    const missing = required.filter((name) => !state.values[name]);
    if (missing.length) {
      setValidationError(t("form.missingRequired"), missing);
    } else if (
      state.values.precheckAdult !== "yes"
      || state.values.precheckWorkRight === "no"
      || state.values.precheckConditions !== "yes"
      || (isPhysicalJob() && state.values.precheckPhysical !== "yes")
    ) {
      const unsuitable = [
        state.values.precheckAdult !== "yes" && "precheckAdult",
        state.values.precheckWorkRight === "no" && "precheckWorkRight",
        state.values.precheckConditions !== "yes" && "precheckConditions",
        isPhysicalJob() && state.values.precheckPhysical !== "yes" && "precheckPhysical"
      ].filter(Boolean);
      setValidationError(t("form.precheckNotSuitable"), unsuitable);
    } else {
      state.error = "";
      state.invalidFields = [];
      state.values.precheckComplete = "yes";
      state.values.adult = true;
      state.values.workRight = state.values.precheckWorkRight;
      if (isPhysicalJob()) state.values.standingReady = "yes";
      saveDraft();
      render(true);
      return;
    }
    renderPrecheck();
    document.getElementById("application-error")?.focus();
  }

  function renderPrecheck(focusStart = false) {
    const dialog = document.getElementById("application-dialog");
    const container = document.getElementById("application-dialog-content");
    const job = localizedJob();
    if (!dialog || !container || !job) return;
    const destination = destinationCode(baseJob());
    const workRightLabel = destination
      ? `${t("form.workRight")} — ${i18n.countryName(destination)}`
      : t("form.workRight");
    container.innerHTML = `
      <header class="application-header application-precheck-header">
        <p class="overline">${escapeHTML(t("form.title"))}</p>
        <h2 id="application-step-title" tabindex="-1">${escapeHTML(t("form.precheckTitle"))}</h2>
        <p>${escapeHTML(t("form.precheckIntro"))}</p>
        ${recruiterHandoff()}
        ${draftControl()}
      </header>
      <form id="application-precheck-form" novalidate>
        <div class="application-error" id="application-error" tabindex="-1" role="alert" ${state.error ? "" : "hidden"}>${escapeHTML(state.error)}</div>
        <section class="application-step application-precheck">
          <div class="application-selected-vacancy">
            <span>${escapeHTML(t("form.selectedVacancy"))}</span>
            <strong>${escapeHTML(job.title)}</strong>
            <small>${escapeHTML(job.format)} · ${escapeHTML(job.location)}</small>
          </div>
          <div class="application-grid">
            ${field("precheckAdult", t("form.adult"), yesNo("precheckAdult"))}
            ${field("precheckWorkRight", workRightLabel, yesNoUnknown("precheckWorkRight"))}
            ${field("precheckConditions", t("form.precheckConditions"), yesNo("precheckConditions"))}
            ${isPhysicalJob()
              ? field("precheckPhysical", t("form.standingReady"), yesNo("precheckPhysical"))
              : ""}
          </div>
        </section>
        <footer class="application-actions application-precheck-actions">
          <span>${escapeHTML(t("form.precheckIntro"))}</span>
          <button class="button button-primary" type="submit">${escapeHTML(t("form.next"))} →</button>
        </footer>
      </form>
    `;
    const form = container.querySelector("#application-precheck-form");
    form?.addEventListener("input", (event) => {
      collectPrecheckValues();
      clearInlineError(event.target.name, event.target);
    });
    form?.addEventListener("change", (event) => {
      collectPrecheckValues();
      clearInlineError(event.target.name, event.target);
    });
    form?.addEventListener("submit", handlePrecheckSubmit);
    container.querySelector("[data-clear-application-draft]")?.addEventListener("click", clearDraft);
    if (focusStart) focusDialogStart();
  }

  function render(focusStart = false) {
    if (state.mode === "match") {
      renderMatcher(focusStart);
      return;
    }
    if (!state.values.precheckComplete) {
      renderPrecheck(focusStart);
      return;
    }
    const dialog = document.getElementById("application-dialog");
    const container = document.getElementById("application-dialog-content");
    if (!dialog || !container) return;
    const percent = ((state.step + 1) / STEP_KEYS.length) * 100;
    const job = localizedJob();
    container.innerHTML = `
      <header class="application-header" data-stage="${state.step + 1}" data-stage-total="${STEP_KEYS.length}">
        <p class="overline">${escapeHTML(t("form.title"))}</p>
        <h2 id="application-step-title" tabindex="-1">${escapeHTML(t(`form.${STEP_KEYS[state.step]}`))}</h2>
        <p class="application-vacancy-context">${escapeHTML(job?.title || "")}</p>
        ${draftControl()}
        <div class="application-progress-meta">
          <span>${escapeHTML(t("ui.formStep"))} ${state.step + 1} ${escapeHTML(t("ui.of"))} ${STEP_KEYS.length}</span>
          <span>${Math.round(percent)}%</span>
        </div>
        <div class="application-progress" role="progressbar" aria-label="${escapeHTML(`${t("ui.formStep")} ${state.step + 1} ${t("ui.of")} ${STEP_KEYS.length}`)}" aria-valuemin="1" aria-valuemax="${STEP_KEYS.length}" aria-valuenow="${state.step + 1}">
          <span style="width:${percent}%"></span>
        </div>
      </header>
      <form id="application-form" novalidate>
        <div class="application-error" id="application-error" tabindex="-1" role="alert" ${state.error ? "" : "hidden"}>${escapeHTML(state.error)}</div>
        <section class="application-step">${stepContent()}</section>
        <footer class="application-actions">
          <button class="button button-secondary" type="button" data-application-back ${state.step === 0 ? "disabled" : ""}>${escapeHTML(t("form.back"))}</button>
          ${state.step < STEP_KEYS.length - 1
            ? `<button class="button button-primary" type="submit">${escapeHTML(t("form.next"))} →</button>`
            : `<button class="button button-primary whatsapp-submit" type="submit">${escapeHTML(t("form.copyMessage"))} · ${escapeHTML(t("form.openWhatsapp"))} ↗</button>`}
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
    container.querySelector("[name='hasPesel']")?.addEventListener("change", collectAndRender);
    container.querySelector("[name='travellingWith']")?.addEventListener("change", collectAndRender);
    container.querySelectorAll("[name='currentlyEmployed']").forEach((input) => {
      input.addEventListener("change", collectAndRender);
    });
    container.querySelector("[name='birthDate']")?.addEventListener("change", collectAndRender);
    container.querySelector("[data-application-back]")?.addEventListener("click", () => {
      collectValues();
      state.error = "";
      state.invalidFields = [];
      state.step = Math.max(0, state.step - 1);
      saveDraft();
      render(true);
    });
    container.querySelector("[data-copy-application-message]")?.addEventListener("click", copyApplicationMessage);
    container.querySelectorAll("[data-edit-application-step]").forEach((button) => {
      button.addEventListener("click", () => {
        collectValues();
        state.error = "";
        state.invalidFields = [];
        state.step = Number(button.dataset.editApplicationStep) || 0;
        saveDraft();
        render(true);
      });
    });
    container.querySelector("[data-clear-application-draft]")?.addEventListener("click", clearDraft);
    const form = container.querySelector("#application-form");
    bindApplicationInputNormalization(form);
    form?.addEventListener("input", (event) => {
      collectValues();
      clearInlineError(event.target.name, event.target);
    });
    form?.addEventListener("change", (event) => {
      collectValues();
      clearInlineError(event.target.name, event.target);
    });
    form?.addEventListener("submit", handleSubmit);
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
    if (!job || !canApply(job)) return;
    state.mode = "application";
    state.jobId = job.id;
    state.step = 0;
    state.error = "";
    state.invalidFields = [];
    state.values = {
      ...state.values,
      jobId: job.id,
      matchedJobId: job.id,
      preferredLanguage: i18n.locale,
      adult: false,
      consent: false,
      shiftReadiness: []
    };
    delete state.values.precheckComplete;
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
    if (state.step === 1 && state.values.hasPesel !== "yes") delete state.values.pesel;
    if (state.step === 2) {
      if (state.values.travellingWith === "alone") delete state.values.groupCode;
      else if (state.values.groupCode) state.values.groupCode = normalizeGroupCode(state.values.groupCode);
    }
    if (state.step === 3) state.values.shiftReadiness = data.getAll("shiftReadiness").map(String);
    if (state.step === 4) state.values.consent = data.has("consent");
    if (state.values.jobId) state.jobId = state.values.jobId;
    saveDraft();
  }

  function clearInlineError(name, target) {
    if (!name || !state.invalidFields.includes(name)) return;
    state.invalidFields = state.invalidFields.filter((fieldName) => fieldName !== name);
    const wrapper = target?.closest(".application-field, .application-fieldset, .application-consent");
    wrapper?.classList.remove("is-invalid");
    wrapper?.querySelector(".application-field-error")?.remove();
    if (!state.invalidFields.length) {
      state.error = "";
      const alert = document.getElementById("application-error");
      if (alert) alert.hidden = true;
    }
  }

  function collectAndRender(event) {
    collectValues();
    clearInlineError(event?.target?.name, event?.target);
    render();
  }

  function validateLatin(value, required = false) {
    if (!value) return !required;
    return LATIN_TEXT.test(value);
  }

  function setValidationError(message, fields = []) {
    state.error = message;
    state.invalidFields = fields.filter(Boolean);
  }

  function validateStep() {
    state.error = "";
    state.invalidFields = [];
    if (state.step === 0) {
      const age = calculateAge(state.values.birthDate);
      const required = ["jobId", "preferredLanguage", "firstName", "lastName", "birthDate", "gender", "phone"];
      const missing = required.filter((name) => !(name === "jobId" ? state.jobId : state.values[name]));
      const invalidNames = ["firstName", "lastName"].filter((name) => state.values[name] && !LATIN_NAME.test(state.values[name]));
      if (missing.length) {
        setValidationError(t("form.missingRequired"), missing);
      } else if (invalidNames.length) {
        setValidationError(t("form.latinError"), invalidNames);
      } else if (!PHONE.test(state.values.phone.replace(/[\s()-]/g, ""))) {
        setValidationError(t("form.phoneError"), ["phone"]);
      } else if (state.values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.values.email)) {
        setValidationError(t("form.missingRequired"), ["email"]);
      } else if (age == null || age < 18) {
        setValidationError(candidateEngineCopy().underage, ["birthDate"]);
      }
    } else if (state.step === 1) {
      const identity = state.values.hasPesel === "yes" ? peselIdentity(state.values.pesel) : null;
      const required = [
        "citizenship",
        "currentCountry",
        "currentCity",
        "legalStatus",
        "hasPesel",
        "passportNumber",
        "passportExpiry",
        "workRight"
      ];
      if (state.values.citizenship === "OTHER") required.push("otherCitizenship");
      if (state.values.currentCountry === "OTHER") required.push("otherCountry");
      if (state.values.legalStatus && state.values.legalStatus !== "statusNoDocuments") required.push("documentExpiry");
      if (state.values.hasPesel === "yes") required.push("pesel");
      const missing = required.filter((name) => !state.values[name]);
      const latinFields = ["currentCity"];
      if (state.values.citizenship === "OTHER") latinFields.push("otherCitizenship");
      if (state.values.currentCountry === "OTHER") latinFields.push("otherCountry");
      const invalidLatin = latinFields.filter((name) => state.values[name] && !validateLatin(state.values[name], true));
      if (missing.length) {
        setValidationError(t("form.missingRequired"), missing);
      } else if (invalidLatin.length) {
        setValidationError(t("form.latinError"), invalidLatin);
      } else if (
        state.values.passportExpiry < today()
        || (state.values.documentExpiry && state.values.documentExpiry < today())
      ) {
        setValidationError(
          t("form.dateError"),
          [state.values.passportExpiry < today() ? "passportExpiry" : "documentExpiry"]
        );
      } else if (state.values.hasPesel === "yes" && !identity) {
        setValidationError(t("form.peselError"), ["pesel"]);
      } else if (
        identity
        && (identity.birthDate !== state.values.birthDate || identity.gender !== state.values.gender)
      ) {
        setValidationError(t("form.peselDataMismatch"), ["pesel"]);
      } else if (!/^[A-Za-z\d -]{5,20}$/.test(state.values.passportNumber || "")) {
        setValidationError(t("form.passportError"), ["passportNumber"]);
      }
    } else if (state.step === 2) {
      const required = ["preferredLocation", "readyDate", "housing", "travellingWith", "emergencyContactName", "emergencyContactPhone"];
      if (state.values.travellingWith && state.values.travellingWith !== "alone") {
        required.push("partnerAlsoApplies");
        state.values.groupCode = normalizeGroupCode(state.values.groupCode) || createGroupCode();
      }
      const missing = required.filter((name) => !state.values[name]);
      if (missing.length) {
        setValidationError(t("form.missingRequired"), missing);
      } else if (state.values.readyDate < today()) {
        setValidationError(t("form.dateError"), ["readyDate"]);
      } else if (!LATIN_NAME.test(state.values.emergencyContactName || "")) {
        setValidationError(t("form.latinError"), ["emergencyContactName"]);
      } else if (!PHONE.test(String(state.values.emergencyContactPhone || "").replace(/[\s()-]/g, ""))) {
        setValidationError(t("form.phoneError"), ["emergencyContactPhone"]);
      } else if (
        state.values.travellingWith !== "alone"
        && !/^[A-Z0-9-]{4,20}$/.test(state.values.groupCode || "")
      ) {
        setValidationError(t("form.groupCodeError"), ["groupCode"]);
      }
    } else if (state.step === 3) {
      const required = ["plannedDuration", "currentlyEmployed", "overtimeReady", "polishLevel", "workedInPoland", "formerCitronexWorker", "experience"];
      if (state.values.currentlyEmployed === "yes") required.push("noticePeriod");
      if (isPhysicalJob()) required.push("standingReady", "liftCapacity");
      if (!(state.values.shiftReadiness || []).length) required.push("shiftReadiness");
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
      required.push(...qualificationRequired);
      const missing = required.filter((name) => !state.values[name]);
      if (missing.length) {
        setValidationError(t("form.missingRequired"), missing);
      } else if (!validateLatin(state.values.udtCategory)) {
        setValidationError(t("form.latinError"), ["udtCategory"]);
      }
    } else if (!state.values.consent) {
      setValidationError(t("form.consentError"), ["consent"]);
    }
    return !state.error;
  }

  function polishCountry(code, otherValue) {
    return code === "OTHER" ? otherValue : i18n.countryName(code, "pl");
  }

  function polishLanguageName(locale) {
    const labels = {
      ru: "rosyjski",
      uk: "ukrai\u0144ski",
      pl: "polski",
      en: "angielski",
      az: "azerski",
      ka: "gruzi\u0144ski",
      id: "indonezyjski",
      es: "hiszpa\u0144ski",
      fil: "filipi\u0144ski",
      ne: "nepalski",
      hy: "ormia\u0144ski"
    };
    return labels[locale] || locale || "\u2014";
  }

  function polishSource(source) {
    const labels = {
      direct: "bezpo\u015brednio",
      facebook: "Facebook",
      instagram: "Instagram",
      whatsapp: "WhatsApp"
    };
    return labels[String(source || "").toLowerCase()] || source || "bezpo\u015brednio";
  }

  function polishOption(key) {
    const labels = {
      statusReady: "Dokumenty są gotowe",
      statusClarify: "Dokumenty wymagają wyjaśnienia",
      statusNoDocuments: "Brak gotowych dokumentów",
      other: "Inne",
      yes: "Tak",
      no: "Nie",
      unknown: "Do sprawdzenia",
      required: "Potrzebne",
      notRequired: "Niepotrzebne",
      alone: "Samodzielnie",
      partner: "Z partnerem / partnerką",
      family: "Z rodziną",
      friends: "Ze znajomymi",
      expNone: "Brak doświadczenia",
      expUnder6: "Poniżej 6 miesięcy",
      exp6to12: "6–12 miesięcy",
      exp1to2: "1–2 lata",
      exp2plus: "Ponad 2 lata",
      durationUnder3: "Do 3 miesięcy",
      duration3to6: "3–6 miesięcy",
      duration6to12: "6–12 miesięcy",
      durationLongTerm: "Długoterminowo",
      noticeImmediate: "Mogę rozpocząć od razu",
      notice1Week: "1 tydzień",
      notice2Weeks: "2 tygodnie",
      notice1Month: "1 miesiąc",
      noticeOther: "Inny okres",
      polishNone: "Brak",
      polishBasic: "Podstawowy",
      polishCommunicative: "Komunikatywny",
      polishGood: "Dobry",
      liftUpTo5: "Do 5 kg",
      liftUpTo10: "Do 10 kg",
      liftUpTo15: "Do 15 kg",
      liftUpTo20: "Do 20 kg",
      liftOver20: "Powyżej 20 kg",
      shiftDay: "Zmiany dzienne",
      shiftNight: "Zmiany nocne",
      shiftLong: "Zmiany 10–12 godzin",
      shiftWeekend: "Praca w weekendy"
    };
    return labels[key] || key || "—";
  }

  function destination(job) {
    const code = destinationCode(job);
    if (code) return i18n.countryName(code, "pl");
    return job?.format || "Do potwierdzenia";
  }

  function candidateCheckFlags(job) {
    const flags = [];
    const jobText = [job?.id, job?.category, job?.title, job?.level].join(" ").toLowerCase();
    if (state.values.workRight !== "yes") flags.push("Sprawdzić prawo do pracy w kraju docelowym");
    if (state.values.legalStatus === "statusNoDocuments") flags.push("Dokumenty do pracy nie są gotowe");
    if (state.values.legalStatus === "statusClarify") flags.push("Wyjaśnić dokumenty przed ustaleniem daty wyjazdu");
    if (state.values.experience === "expNone" && job?.level !== "Без опыта") flags.push("Brak doświadczenia na stanowisku, które może go wymagać");
    if (jobText.includes("driver") || jobText.includes("водител")) {
      if (state.values.driverLicense !== "yes") flags.push("Kierowca: potwierdzić prawo jazdy C+E");
      if (state.values.code95 !== "yes") flags.push("Kierowca: potwierdzić Code 95");
      if (state.values.tachograph !== "yes") flags.push("Kierowca: potwierdzić kartę kierowcy");
    }
    if (jobText.includes("udt") && state.values.udtLicense !== "yes") flags.push("Stanowisko UDT: potwierdzić polskie uprawnienia UDT");
    if (job?.id === "team-leader" && state.values.leadershipExperience !== "yes") flags.push("Brygadzista: potwierdzić doświadczenie w zarządzaniu zespołem");
    if (job?.id === "truck-mechanic" && state.values.mechanicExperience !== "yes") flags.push("Mechanik: potwierdzić doświadczenie przy pojazdach ciężarowych");
    if (["greenhouse-agronomist", "plant-protection"].includes(job?.id) && state.values.specialistEducation !== "yes") {
      flags.push("Stanowisko specjalistyczne: potwierdzić wykształcenie lub certyfikat");
    }
    if (passportExpiresSoon(state.values.passportExpiry)) {
      flags.push(`Paszport traci ważność w ciągu 6 miesięcy (${polishDate(state.values.passportExpiry)})`);
    }
    if (state.values.preferredLocation === "DO_CONFIRM") flags.push("Potwierdzić dokładną lokalizację pracy");
    if (state.values.partnerAlsoApplies === "yes") flags.push("Druga osoba również aplikuje: sprawdzić dwa miejsca i zakwaterowanie");
    if (state.values.standingReady === "no") flags.push("Sprawdzić dopasowanie do fizycznych wymagań stanowiska");
    if (state.values.workLimitations) flags.push("Omówić ograniczenia wskazane przez kandydata");
    return flags;
  }

  function candidateDecision(job, flags) {
    const blockers = [];
    if (state.values.workRight === "no") blockers.push("brak potwierdzonego prawa do pracy");
    if (isPhysicalJob(job?.id) && state.values.standingReady === "no") blockers.push("brak gotowości do wymaganej pracy fizycznej");
    if (job?.id?.startsWith("driver-ce")) {
      if (state.values.driverLicense === "no") blockers.push("brak prawa jazdy C+E");
      if (state.values.code95 === "no") blockers.push("brak Code 95");
      if (state.values.tachograph === "no") blockers.push("brak karty kierowcy");
    }
    if (job?.id === "forklift-udt" && state.values.udtLicense === "no") blockers.push("brak wymaganych uprawnień UDT");
    if (job?.id === "team-leader" && state.values.leadershipExperience === "no") blockers.push("brak doświadczenia w zarządzaniu zespołem");
    if (job?.id === "truck-mechanic" && state.values.mechanicExperience === "no") blockers.push("brak doświadczenia mechanika");
    if (
      ["greenhouse-agronomist", "plant-protection"].includes(job?.id)
      && state.values.specialistEducation === "no"
    ) blockers.push("brak wymaganego wykształcenia lub certyfikatu");

    if (blockers.length) {
      return {
        status: "BRAK WARUNKÓW",
        reason: blockers.join("; "),
        next: "Nie wpisywać do planu przyjazdów bez ponownej decyzji rekrutera."
      };
    }
    if (flags.length) {
      return {
        status: "DO WERYFIKACJI",
        reason: flags.join("; "),
        next: "Wyjaśnić wskazane punkty przed potwierdzeniem przyjazdu."
      };
    }
    return {
      status: "GOTOWY",
      reason: "Brak oczywistych rozbieżności w ankiecie.",
      next: "Skontaktować się z kandydatem i potwierdzić termin oraz lokalizację."
    };
  }

  function qualificationSummary() {
    return [
      state.values.driverLicense && `Prawo jazdy C+E: ${polishOption(state.values.driverLicense)}`,
      state.values.code95 && `Code 95: ${polishOption(state.values.code95)}`,
      state.values.tachograph && `Karta kierowcy: ${polishOption(state.values.tachograph)}`,
      state.values.reeferExperience && `Chłodnia: ${polishOption(state.values.reeferExperience)}`,
      state.values.udtLicense && `UDT: ${polishOption(state.values.udtLicense)}`,
      state.values.udtCategory && `UDT ${state.values.udtCategory}`,
      state.values.leadershipExperience && `Doświadczenie brygadzisty: ${polishOption(state.values.leadershipExperience)}`,
      state.values.mechanicExperience && `Doświadczenie mechanika: ${polishOption(state.values.mechanicExperience)}`,
      state.values.specialistEducation && `Wykształcenie kierunkowe: ${polishOption(state.values.specialistEducation)}`
    ].filter(Boolean);
  }

  function buildApplicationRecord() {
    const job = effectiveJob();
    const localized = localizedJob();
    const applicationId = state.values.applicationId || createApplicationId();
    state.values.applicationId = applicationId;
    const submittedAt = state.values.submittedAt || new Date().toISOString();
    state.values.submittedAt = submittedAt;
    const age = calculateAge(state.values.birthDate);
    const source = state.values.source || campaignSource();
    const checkFlags = candidateCheckFlags(job);
    const decision = candidateDecision(job, checkFlags);
    const polishJob = window.PORTAL_TRANSLATIONS?.pl?.jobs?.[job?.id] || {};
    return {
      v: 1,
      id: applicationId,
      at: submittedAt,
      jid: job?.id || "",
      j: polishJob.title || localized?.title || job?.title || "",
      physical: isPhysicalJob(job?.id),
      d: destination(job),
      loc: polishLocation(state.values.preferredLocation),
      s: localized?.salary?.note || job?.salary?.note || "Needs confirmation",
      fn: state.values.firstName || "",
      ln: state.values.lastName || "",
      dob: polishDate(state.values.birthDate),
      a: age,
      gender: state.values.gender || "",
      p: String(state.values.phone || "").replace(/[\s()-]/g, ""),
      e: state.values.email || "",
      cit: polishCountry(state.values.citizenship, state.values.otherCitizenship),
      cc: polishCountry(state.values.currentCountry, state.values.otherCountry),
      city: state.values.currentCity || "",
      doc: polishOption(state.values.legalStatus),
      docexp: polishDate(state.values.documentExpiry),
      pesel: state.values.hasPesel === "yes" ? state.values.pesel || "" : "BRAK",
      passport: String(state.values.passportNumber || "").toUpperCase(),
      passportExpiry: polishDate(state.values.passportExpiry),
      wr: polishOption(state.values.workRight),
      ready: polishDate(state.values.readyDate),
      week: isoWeekLabel(state.values.readyDate),
      dept: arrivalsDepartment(job?.id),
      house: polishOption(state.values.housing),
      hotel: state.values.housing === "required" ? "TAK" : "NIE",
      travel: polishOption(state.values.travellingWith),
      second: polishOption(state.values.partnerAlsoApplies),
      group: state.values.travellingWith === "alone" ? "—" : normalizeGroupCode(state.values.groupCode),
      emergencyName: state.values.emergencyContactName || "",
      emergencyPhone: String(state.values.emergencyContactPhone || "").replace(/[\s()-]/g, ""),
      duration: polishOption(state.values.plannedDuration),
      employed: polishOption(state.values.currentlyEmployed),
      notice: state.values.currentlyEmployed === "yes" ? polishOption(state.values.noticePeriod) : "Nie dotyczy",
      overtime: polishOption(state.values.overtimeReady),
      standing: polishOption(state.values.standingReady),
      lift: polishOption(state.values.liftCapacity),
      sh: (state.values.shiftReadiness || []).map(polishOption),
      exp: polishOption(state.values.experience),
      expd: state.values.experienceDetails || "",
      polish: polishOption(state.values.polishLevel),
      workedpl: polishOption(state.values.workedInPoland),
      employeeStatus: state.values.formerCitronexWorker === "yes" ? "stary" : "nowy",
      q: qualificationSummary(),
      limits: state.values.workLimitations || "",
      n: state.values.extraNotes || "",
      check: checkFlags,
      decision,
      src: polishSource(source),
      recruiter: profile.name || "Oleksandr Kiris",
      lang: polishLanguageName(state.values.preferredLanguage || i18n.locale)
    };
  }

  function excelCell(value) {
    const clean = String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
    return /^[=+\-@]/.test(clean) ? `'${clean}` : clean;
  }

  function excelRow(values) {
    return values.map(excelCell).join("\t");
  }

  function arrivalsExcelRow(record) {
    return excelRow([
      `${record.fn} ${record.ln}`.trim(),
      record.week,
      record.ready,
      record.dept,
      record.p,
      record.employeeStatus,
      record.recruiter,
      record.src,
      record.cit,
      record.gender,
      record.hotel
    ]);
  }

  function questionnaireExcelRow(record) {
    return excelRow([
      record.fn,
      record.ln,
      record.dob,
      record.pesel,
      record.cit,
      record.passport,
      [record.cc, record.city].filter(Boolean).join(", "),
      "",
      record.p,
      record.e,
      record.emergencyName,
      record.emergencyPhone
    ]);
  }

  function buildMessage() {
    const record = buildApplicationRecord();
    const submittedAt = new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Warsaw"
    }).format(new Date(record.at));
    const currentLocation = [record.cc, record.city].filter(Boolean).join(", ") || "—";
    const decisionIcon = record.decision.status === "GOTOWY"
      ? "✅"
      : record.decision.status === "DO WERYFIKACJI"
        ? "⚠️"
        : "⛔";
    const line = (label, value, include = true) => (
      include && value && value !== "—" ? `*${label}:* ${value}` : ""
    );
    const section = (title, lines) => {
      const visible = lines.filter(Boolean);
      return visible.length ? [title, ...visible, ""] : [];
    };
    const groupApplication = record.group && record.group !== "—";
    const candidateName = `${record.fn} ${record.ln}`.trim();
    const recruiterHeadline = `${decisionIcon} *${record.decision.status} · ${candidateName} · ${record.j} · ${record.ready || "DATA DO USTALENIA"}*`;
    return [
      recruiterHeadline,
      "",
      "📋 *NOWA ANKIETA KANDYDATA*",
      `*Powód:* ${record.decision.reason}`,
      `*Następny krok:* ${record.decision.next}`,
      "",
      line("Nr zgłoszenia", record.id),
      line("Data", submittedAt),
      line("Źródło", record.src),
      line("Rekruter", record.recruiter),
      "",
      ...section("💼 *OFERTA PRACY*", [
        line("Stanowisko", record.j),
        line("ID oferty", record.jid),
        line("Kraj", record.d),
        line("Dział", record.dept),
        line("Lokalizacja", record.loc)
      ]),
      ...section("👤 *KANDYDAT I KONTAKT*", [
        line("Imię i nazwisko", `${record.fn} ${record.ln}`.trim()),
        line("Data urodzenia", record.dob),
        line("Wiek", record.a == null ? "" : record.a),
        line("Płeć", record.gender),
        line("Status", record.employeeStatus),
        line("WhatsApp", record.p),
        line("E-mail", record.e),
        line("Obywatelstwo", record.cit),
        line("Miejsce pobytu", currentLocation),
        line("Język kontaktu", record.lang)
      ]),
      ...section("📄 *DOKUMENTY*", [
        line("Status dokumentów", record.doc),
        line("Ważność dokumentu", record.docexp),
        line("PESEL", record.pesel || "BRAK"),
        line("Numer paszportu", record.passport),
        line("Paszport ważny do", record.passportExpiry),
        line("Prawo do pracy", record.wr)
      ]),
      ...section("📅 *PRZYJAZD I ZAKWATEROWANIE*", [
        line("Planowany przyjazd", record.ready),
        line("Tydzień", record.week),
        line("Planowany okres pracy", record.duration),
        line("Obecnie zatrudniony/a", record.employed),
        line("Okres wypowiedzenia", record.notice, record.notice !== "Nie dotyczy"),
        line("Zakwaterowanie", record.house),
        line("Wyjazd", record.travel),
        line("Druga osoba aplikuje", record.second, groupApplication),
        line("Kod grupy", record.group, groupApplication),
        line("Osoba do kontaktu", record.emergencyName),
        line("Telefon osoby kontaktowej", record.emergencyPhone)
      ]),
      ...section("🧰 *GOTOWOŚĆ I KWALIFIKACJE*", [
        line("Nadgodziny", record.overtime),
        line("Praca stojąca", record.standing, record.physical),
        line("Podnoszenie", record.lift, record.physical),
        line("Zmiany", record.sh.join(", ")),
        line("Doświadczenie", record.exp),
        line("Szczegóły doświadczenia", record.expd),
        line("Praca wcześniej w Polsce", record.workedpl),
        line("Język polski", record.polish),
        line("Kwalifikacje", record.q.join("; ")),
        line("Ograniczenia", record.limits),
        line("Komentarz", record.n)
      ]),
      "📊 *PRZYJAZDY — WIERSZ DO EXCEL*",
      "```",
      arrivalsExcelRow(record),
      "```",
      "",
      "🗂️ *KWESTIONARIUSZ — WIERSZ WSTĘPNY*",
      "```",
      questionnaireExcelRow(record),
      "```"
    ].filter((item, index, items) => item !== "" || items[index - 1] !== "").join("\n").trim();
  }

  async function writeMessageToClipboard(message) {
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
      return true;
    } catch {
      document.querySelector(".application-message-preview textarea")?.select();
      return false;
    }
  }

  async function copyApplicationMessage(event) {
    const copied = await writeMessageToClipboard(buildMessage());
    if (copied) {
      const button = event?.currentTarget;
      if (button) {
        const previous = button.textContent;
        button.textContent = `✓ ${t("form.messageCopied")}`;
        setTimeout(() => {
          if (button.isConnected) button.textContent = previous;
        }, 2200);
      }
    }
  }

  function openWhatsApp(message) {
    const base = profile.whatsapp || `https://wa.me/${String(profile.phone || "").replace(/\D/g, "")}`;
    const separator = base.includes("?") ? "&" : "?";
    const url = `${base}${separator}text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function clearDraft() {
    if (!state.jobId || !window.confirm(t("form.clearDraftConfirm"))) return;
    try {
      localStorage.removeItem(draftKey(state.jobId));
    } catch {
      // Clearing the visible form still works if storage access is blocked.
    }
    state.step = 0;
    state.error = "";
    state.invalidFields = [];
    state.hasDraft = false;
    state.values = initialApplicationValues(state.jobId);
    render(true);
    window.dispatchEvent(new CustomEvent("portal:toast", { detail: { message: t("form.draftCleared") } }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    collectValues();
    if (!validateStep()) {
      render();
      document.getElementById("application-error")?.focus();
      return;
    }
    if (state.step < STEP_KEYS.length - 1) {
      state.step += 1;
      saveDraft();
      render(true);
      return;
    }
    const message = buildMessage();
    if (!navigator.onLine) {
      state.error = t("form.unavailableOffline");
      render();
      return;
    }
    openWhatsApp(message);
  }

  function open(jobId = "", options = {}) {
    const selectedJob = jobs.find((job) => job.id === jobId);
    const hasSelectedJob = Boolean(selectedJob);
    if (hasSelectedJob && !canApply(selectedJob)) return;
    state.mode = hasSelectedJob ? "application" : "match";
    state.matchStep = 0;
    state.recommendations = [];
    state.jobId = hasSelectedJob ? jobId : "";
    state.error = "";
    state.invalidFields = [];
    const initialValues = initialApplicationValues(state.jobId);
    const draft = hasSelectedJob ? readDraft(state.jobId) : null;
    state.hasDraft = Boolean(draft);
    state.step = draft?.step || 0;
    state.values = draft
      ? {
          ...initialValues,
          ...draft.values,
          jobId: state.jobId,
          shiftReadiness: Array.isArray(draft.values.shiftReadiness) ? draft.values.shiftReadiness : []
        }
      : initialValues;
    render();
    const dialog = document.getElementById("application-dialog");
    if (dialog && !dialog.open) {
      if (options.standalone) dialog.show();
      else dialog.showModal();
    }
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
      collectValues();
      state.values.preferredLanguage = i18n.locale;
      saveDraft();
      render();
    }
  });

  window.PortalApplication = { open, clarify, clarifyGeneral, buildMessage };
})();
