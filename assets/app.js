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
    notes: "career-hub:notes:v1",
    passport: "career-hub:passport:v1",
    resourcesRead: "career-hub:resources-read:v1"
  };
  const validRoutes = ["home", "jobs", "resources", "saved", "profile"];
  const state = {
    favorites: readStringSet(STORAGE.favorites),
    compare: readStringSet(STORAGE.compare),
    notes: readObject(STORAGE.notes),
    passport: readObject(STORAGE.passport),
    resourcesRead: readStringSet(STORAGE.resourcesRead),
    resourceCategory: "__all__",
    installPrompt: null,
    toastTimer: null,
    jobReturnRoute: "jobs",
    openJobId: "",
    quickFilter: "",
    activePriority: "",
    instantMatch: {
      current: "any",
      country: "any",
      experience: "any",
      area: "any",
      people: "any",
      start: "any"
    }
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

  function persistPassport() {
    try {
      state.passport._savedAt = new Date().toISOString();
      localStorage.setItem(STORAGE.passport, JSON.stringify(state.passport));
    } catch {
      showToast(t("ui.noteHelp"));
    }
  }

  function clearPassport() {
    state.passport = {};
    try {
      localStorage.removeItem(STORAGE.passport);
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

  function quickStartCopy() {
    const copy = {
      ru: {
        kicker: "Быстрый вход",
        title: "Подберите направление",
        poland: "Польша",
        other: "Венгрия · Бельгия",
        noExperience: "Без опыта",
        driver: "Водитель",
        survey: "Анкета"
      },
      uk: {
        kicker: "Швидкий старт",
        title: "Оберіть напрям",
        poland: "Польща",
        other: "Угорщина · Бельгія",
        noExperience: "Без досвіду",
        driver: "Водій",
        survey: "Анкета"
      },
      pl: {
        kicker: "Szybki start",
        title: "Wybierz kierunek",
        poland: "Polska",
        other: "Węgry · Belgia",
        noExperience: "Bez doświadczenia",
        driver: "Kierowca",
        survey: "Ankieta"
      },
      en: {
        kicker: "Quick start",
        title: "Choose a direction",
        poland: "Poland",
        other: "Hungary · Belgium",
        noExperience: "No experience",
        driver: "Driver",
        survey: "Questionnaire"
      },
      az: {
        kicker: "Sürətli seçim",
        title: "İstiqamət seçin",
        poland: "Polşa",
        other: "Macarıstan · Belçika",
        noExperience: "Təcrübəsiz",
        driver: "Sürücü",
        survey: "Anket"
      },
      ka: {
        kicker: "სწრაფი არჩევა",
        title: "აირჩიეთ მიმართულება",
        poland: "პოლონეთი",
        other: "უნგრეთი · ბელგია",
        noExperience: "გამოცდილების გარეშე",
        driver: "მძღოლი",
        survey: "ანკეტა"
      },
      id: {
        kicker: "Mulai cepat",
        title: "Pilih arah kerja",
        poland: "Polandia",
        other: "Hungaria · Belgia",
        noExperience: "Tanpa pengalaman",
        driver: "Sopir",
        survey: "Formulir"
      },
      es: {
        kicker: "Inicio rápido",
        title: "Elige una dirección",
        poland: "Polonia",
        other: "Hungría · Bélgica",
        noExperience: "Sin experiencia",
        driver: "Conductor",
        survey: "Formulario"
      },
      fil: {
        kicker: "Mabilis na simula",
        title: "Pumili ng direksyon",
        poland: "Poland",
        other: "Hungary · Belgium",
        noExperience: "Walang karanasan",
        driver: "Driver",
        survey: "Form"
      },
      ne: {
        kicker: "छिटो सुरु",
        title: "दिशा छान्नुहोस्",
        poland: "पोल्याण्ड",
        other: "हंगेरी · बेल्जियम",
        noExperience: "अनुभव बिना",
        driver: "चालक",
        survey: "फारम"
      },
      hy: {
        kicker: "Արագ ընտրություն",
        title: "Ընտրեք ուղղությունը",
        poland: "Լեհաստան",
        other: "Հունգարիա · Բելգիա",
        noExperience: "Առանց փորձի",
        driver: "Վարորդ",
        survey: "Հարցաթերթիկ"
      }
    };
    const upgrade = {
      en: {
        title: "Answer 6 quick questions",
        intro: "The site will show suitable jobs and prepare a clear WhatsApp message for the recruiter.",
        current: "Where are you now?",
        currentEu: "Already in EU",
        currentUkraine: "Ukraine",
        currentOther: "Other country",
        people: "Who is going?",
        solo: "Only me",
        couple: "Couple",
        group: "Group / friends",
        start: "When can you start?",
        soon: "As soon as possible",
        month: "This month",
        later: "Later / checking",
        whatsapp: "Send my answers in WhatsApp"
      },
      ru: {
        title: "Ответьте на 6 быстрых вопросов",
        intro: "Сайт покажет подходящие вакансии и подготовит понятное сообщение рекрутеру в WhatsApp.",
        current: "Где вы сейчас?",
        currentEu: "Уже в ЕС",
        currentUkraine: "Украина",
        currentOther: "Другая страна",
        people: "Кто едет?",
        solo: "Только я",
        couple: "Пара",
        group: "Группа / друзья",
        start: "Когда готовы начать?",
        soon: "Как можно быстрее",
        month: "В этом месяце",
        later: "Позже / уточняю",
        whatsapp: "Отправить мои ответы в WhatsApp"
      },
      uk: {
        title: "Дайте 6 швидких відповідей",
        intro: "Сайт покаже відповідні вакансії і підготує зрозуміле повідомлення рекрутеру в WhatsApp.",
        current: "Де ви зараз?",
        currentEu: "Вже в ЄС",
        currentUkraine: "Україна",
        currentOther: "Інша країна",
        people: "Хто їде?",
        solo: "Тільки я",
        couple: "Пара",
        group: "Група / друзі",
        start: "Коли готові почати?",
        soon: "Якнайшвидше",
        month: "Цього місяця",
        later: "Пізніше / уточнюю",
        whatsapp: "Надіслати мої відповіді в WhatsApp"
      },
      pl: {
        title: "Odpowiedz na 6 szybkich pytań",
        intro: "Strona pokaże pasujące oferty i przygotuje jasną wiadomość do rekrutera w WhatsApp.",
        current: "Gdzie jesteś teraz?",
        currentEu: "Już w UE",
        currentUkraine: "Ukraina",
        currentOther: "Inny kraj",
        people: "Kto jedzie?",
        solo: "Tylko ja",
        couple: "Para",
        group: "Grupa / znajomi",
        start: "Kiedy możesz zacząć?",
        soon: "Jak najszybciej",
        month: "W tym miesiącu",
        later: "Później / sprawdzam",
        whatsapp: "Wyślij moje odpowiedzi w WhatsApp"
      }
    };
    return { ...copy.en, ...(copy[i18n.locale] || {}) };
  }

  function conversionCopy() {
    const copy = {
      ru: {
        situationsKicker: "Частые ситуации",
        situationsTitle: "Найдите себя",
        showJobs: "Показать вакансии",
        startSurvey: "Заполнить анкету",
        fitTitle: "Кому подходит",
        notFitTitle: "Может не подойти",
        grossTitle: "Быстрый расчёт брутто",
        grossNote: "Это брутто, не нетто и не гарантия часов. Точный график подтверждается перед поездкой.",
        relatedTitle: "Похожие вакансии",
        openRelated: "Открыть",
        situationPolandTitle: "Я сейчас в Польше",
        situationPolandText: "Сразу смотрите доступные вакансии в Польше и уточняйте дату старта.",
        situationNoExperienceTitle: "Я без опыта",
        situationNoExperienceText: "Начните с теплиц, сортировки или склада, где есть обучение.",
        situationCoupleTitle: "Хочу приехать парой",
        situationCoupleText: "В анкете укажите поездку с партнёром, чтобы проверить жильё и места.",
        situationDriverTitle: "У меня C+E",
        situationDriverText: "Проверьте водительские вакансии и что нужно уточнить перед стартом.",
        situationDocumentsTitle: "Нужно уточнить оформление",
        situationDocumentsText: "Анкета передаёт только общий статус и вопросы — без фото, номеров и личных кодов."
      },
      en: {
        situationsKicker: "Common situations",
        situationsTitle: "Find your path",
        showJobs: "Show jobs",
        startSurvey: "Start form",
        fitTitle: "Good fit",
        notFitTitle: "May not fit",
        grossTitle: "Quick gross estimate",
        grossNote: "Gross only, not net pay and not guaranteed hours. The schedule is confirmed before travel.",
        relatedTitle: "Similar jobs",
        openRelated: "Open",
        situationPolandTitle: "I am already in Poland",
        situationPolandText: "Start with jobs in Poland and confirm the nearest start date.",
        situationNoExperienceTitle: "I have no experience",
        situationNoExperienceText: "Start with greenhouse, sorting or warehouse work with training.",
        situationCoupleTitle: "I want to travel with a partner",
        situationCoupleText: "Use the form so housing and places can be checked together.",
        situationDriverTitle: "I have C+E",
        situationDriverText: "Check driver roles and what should be clarified before starting.",
        situationDocumentsTitle: "I need to clarify paperwork",
        situationDocumentsText: "The form sends only general status and questions — no photos, numbers or personal codes."
      }
    };
    return { ...copy.en, ...(copy[i18n.locale] || {}) };
  }

  function instantMatchCopy() {
    const copy = {
      ru: {
        kicker: "Подбор за 30 секунд",
        title: "Ответьте на 3 вопроса",
        intro: "Сайт сразу покажет вакансии, которые больше подходят под вашу ситуацию.",
        country: "Где хотите работать?",
        experience: "Ваш опыт",
        area: "Что ближе?",
        any: "Не важно",
        poland: "Польша",
        other: "Венгрия · Бельгия",
        noExperience: "Без опыта",
        experienced: "Есть опыт",
        greenhouse: "Теплица",
        warehouse: "Склад",
        transport: "Водитель",
        results: "Подходящие варианты",
        open: "Открыть",
        apply: "Анкета",
        whatsapp: "Написать по этим ответам",
        messageTitle: "БЫСТРЫЙ ПОДБОР · CITRONEX",
        messageIntro: "Здравствуйте! Хочу уточнить вакансии по моим быстрым ответам.",
        messageAnswers: "Мои ответы",
        messageJobs: "Подходящие вакансии",
        messageLanguage: "Язык сайта",
        messageLink: "Ссылка",
        previewTitle: "В WhatsApp отправится",
        previewLanguage: "Язык",
        previewJobs: "Вакансии",
        badgeBest: "Лучший старт",
        badgeHours: "Больше часов",
        badgeDriver: "Для водителя",
        badgeNoExperience: "Без опыта",
        badgeCountry: "Подходит по стране",
        badgeStable: "Стабильный вариант",
        whyTitle: "Почему подходит",
        whyCountry: "выбранная страна совпадает с вакансией",
        whyNoExperience: "можно рассматривать без опыта",
        whyExperience: "подходит для кандидата с опытом",
        whyGreenhouse: "вы выбрали теплицу",
        whyWarehouse: "вы выбрали склад",
        whyDriver: "вы выбрали направление водителя",
        whyFeatured: "часто подходит как стартовый вариант",
        note: "Подбор предварительный. Условия, документы и дату старта всё равно нужно подтвердить."
      },
      uk: {
        kicker: "Підбір за 30 секунд",
        title: "Дайте 3 відповіді",
        intro: "Сайт одразу покаже вакансії, які більше підходять під вашу ситуацію.",
        country: "Де хочете працювати?",
        experience: "Ваш досвід",
        area: "Що ближче?",
        any: "Неважливо",
        poland: "Польща",
        other: "Угорщина · Бельгія",
        noExperience: "Без досвіду",
        experienced: "Є досвід",
        greenhouse: "Теплиця",
        warehouse: "Склад",
        transport: "Водій",
        results: "Варіанти",
        open: "Відкрити",
        apply: "Анкета",
        whatsapp: "Написати за цими відповідями",
        messageTitle: "ШВИДКИЙ ПІДБІР · CITRONEX",
        messageIntro: "Вітаю! Хочу уточнити вакансії за моїми швидкими відповідями.",
        messageAnswers: "Мої відповіді",
        messageJobs: "Відповідні вакансії",
        messageLanguage: "Мова сайту",
        messageLink: "Посилання",
        previewTitle: "У WhatsApp буде відправлено",
        previewLanguage: "Мова",
        previewJobs: "Вакансії",
        badgeBest: "Найкращий старт",
        badgeHours: "Більше годин",
        badgeDriver: "Для водія",
        badgeNoExperience: "Без досвіду",
        badgeCountry: "Підходить за країною",
        badgeStable: "Стабільний варіант",
        whyTitle: "Чому підходить",
        whyCountry: "обрана країна збігається з вакансією",
        whyNoExperience: "можна розглядати без досвіду",
        whyExperience: "підходить кандидату з досвідом",
        whyGreenhouse: "ви обрали теплицю",
        whyWarehouse: "ви обрали склад",
        whyDriver: "ви обрали напрям водія",
        whyFeatured: "часто підходить як стартовий варіант",
        note: "Підбір попередній. Умови, документи і дату старту потрібно підтвердити."
      },
      pl: {
        kicker: "Dopasowanie w 30 sekund",
        title: "Odpowiedz na 3 pytania",
        intro: "Strona od razu pokaże oferty najlepiej pasujące do Twojej sytuacji.",
        country: "Gdzie chcesz pracować?",
        experience: "Doświadczenie",
        area: "Co wybierasz?",
        any: "Bez różnicy",
        poland: "Polska",
        other: "Węgry · Belgia",
        noExperience: "Bez doświadczenia",
        experienced: "Mam doświadczenie",
        greenhouse: "Szklarnia",
        warehouse: "Magazyn",
        transport: "Kierowca",
        results: "Dopasowane oferty",
        open: "Otwórz",
        apply: "Ankieta",
        whatsapp: "Napisz z tymi odpowiedziami",
        messageTitle: "SZYBKIE DOPASOWANIE · CITRONEX",
        messageIntro: "Dzień dobry! Chcę dopytać o oferty według moich szybkich odpowiedzi.",
        messageAnswers: "Moje odpowiedzi",
        messageJobs: "Pasujące oferty",
        messageLanguage: "Język strony",
        messageLink: "Link",
        previewTitle: "Do WhatsApp trafi",
        previewLanguage: "Język",
        previewJobs: "Oferty",
        badgeBest: "Najlepszy start",
        badgeHours: "Więcej godzin",
        badgeDriver: "Dla kierowcy",
        badgeNoExperience: "Bez doświadczenia",
        badgeCountry: "Pasuje do kraju",
        badgeStable: "Stabilna opcja",
        whyTitle: "Dlaczego pasuje",
        whyCountry: "wybrany kraj pasuje do oferty",
        whyNoExperience: "można rozważyć bez doświadczenia",
        whyExperience: "pasuje do kandydata z doświadczeniem",
        whyGreenhouse: "wybrano szklarnię",
        whyWarehouse: "wybrano magazyn",
        whyDriver: "wybrano kierowcę",
        whyFeatured: "często dobra opcja na start",
        note: "To wstępne dopasowanie. Warunki, dokumenty i start trzeba potwierdzić."
      },
      en: {
        kicker: "Match in 30 seconds",
        title: "Answer 3 questions",
        intro: "The site will immediately show jobs that fit your situation better.",
        country: "Where do you want to work?",
        experience: "Your experience",
        area: "Preferred work",
        any: "Any",
        poland: "Poland",
        other: "Hungary · Belgium",
        noExperience: "No experience",
        experienced: "Experienced",
        greenhouse: "Greenhouse",
        warehouse: "Warehouse",
        transport: "Driver",
        results: "Suitable jobs",
        open: "Open",
        apply: "Form",
        whatsapp: "Message with these answers",
        messageTitle: "QUICK MATCH · CITRONEX",
        messageIntro: "Hello! I want to confirm jobs based on my quick answers.",
        messageAnswers: "My answers",
        messageJobs: "Suitable jobs",
        messageLanguage: "Site language",
        messageLink: "Link",
        previewTitle: "WhatsApp will receive",
        previewLanguage: "Language",
        previewJobs: "Jobs",
        badgeBest: "Best start",
        badgeHours: "More hours",
        badgeDriver: "For drivers",
        badgeNoExperience: "No experience",
        badgeCountry: "Country match",
        badgeStable: "Stable option",
        whyTitle: "Why it fits",
        whyCountry: "selected country matches this job",
        whyNoExperience: "can be considered without experience",
        whyExperience: "fits candidates with experience",
        whyGreenhouse: "you selected greenhouse work",
        whyWarehouse: "you selected warehouse work",
        whyDriver: "you selected driver work",
        whyFeatured: "often works well as a starting option",
        note: "This is a preliminary match. Conditions, documents and start date still need confirmation."
      },
      az: {
        kicker: "30 saniyəyə uyğun seçim",
        title: "3 suala cavab verin",
        intro: "Sayt vəziyyətinizə daha uyğun vakansiyaları dərhal göstərəcək.",
        country: "Harada işləmək istəyirsiniz?",
        experience: "Təcrübəniz",
        area: "Hansı iş daha uyğundur?",
        any: "Fərqi yoxdur",
        poland: "Polşa",
        other: "Macarıstan · Belçika",
        noExperience: "Təcrübəsiz",
        experienced: "Təcrübəm var",
        greenhouse: "İstixana",
        warehouse: "Anbar",
        transport: "Sürücü",
        results: "Uyğun vakansiyalar",
        open: "Aç",
        apply: "Anket",
        whatsapp: "Bu cavablarla yazın",
        messageTitle: "SÜRƏTLİ SEÇİM · CITRONEX",
        messageIntro: "Salam! Sürətli cavablarıma əsasən vakansiyaları dəqiqləşdirmək istəyirəm.",
        messageAnswers: "Cavablarım",
        messageJobs: "Uyğun vakansiyalar",
        messageLanguage: "Sayt dili",
        messageLink: "Link",
        note: "Bu ilkin seçimdir. Şərtlər, sənədlər və başlama tarixi təsdiqlənməlidir."
      },
      id: {
        kicker: "Cocokkan dalam 30 detik",
        title: "Jawab 3 pertanyaan",
        intro: "Situs akan langsung menampilkan lowongan yang lebih sesuai dengan situasi Anda.",
        country: "Di mana Anda ingin bekerja?",
        experience: "Pengalaman Anda",
        area: "Pekerjaan pilihan",
        any: "Apa saja",
        poland: "Polandia",
        other: "Hungaria · Belgia",
        noExperience: "Tanpa pengalaman",
        experienced: "Berpengalaman",
        greenhouse: "Rumah kaca",
        warehouse: "Gudang",
        transport: "Sopir",
        results: "Lowongan yang cocok",
        open: "Buka",
        apply: "Formulir",
        whatsapp: "Kirim jawaban ini",
        messageTitle: "PENCOCOKAN CEPAT · CITRONEX",
        messageIntro: "Halo! Saya ingin mengonfirmasi lowongan berdasarkan jawaban cepat saya.",
        messageAnswers: "Jawaban saya",
        messageJobs: "Lowongan yang cocok",
        messageLanguage: "Bahasa situs",
        messageLink: "Tautan",
        note: "Ini pencocokan awal. Syarat, dokumen, dan tanggal mulai tetap perlu dikonfirmasi."
      },
      es: {
        kicker: "Selección en 30 segundos",
        title: "Responde 3 preguntas",
        intro: "El sitio mostrará de inmediato las vacantes que mejor encajan con tu situación.",
        country: "¿Dónde quieres trabajar?",
        experience: "Tu experiencia",
        area: "Trabajo preferido",
        any: "Cualquiera",
        poland: "Polonia",
        other: "Hungría · Bélgica",
        noExperience: "Sin experiencia",
        experienced: "Con experiencia",
        greenhouse: "Invernadero",
        warehouse: "Almacén",
        transport: "Conductor",
        results: "Vacantes adecuadas",
        open: "Abrir",
        apply: "Formulario",
        whatsapp: "Enviar estas respuestas",
        messageTitle: "SELECCIÓN RÁPIDA · CITRONEX",
        messageIntro: "Hola. Quiero confirmar vacantes según mis respuestas rápidas.",
        messageAnswers: "Mis respuestas",
        messageJobs: "Vacantes adecuadas",
        messageLanguage: "Idioma del sitio",
        messageLink: "Enlace",
        note: "Es una selección preliminar. Las condiciones, documentos y fecha de inicio deben confirmarse."
      },
      fil: {
        kicker: "Match sa 30 segundo",
        title: "Sagutin ang 3 tanong",
        intro: "Agad na ipapakita ng site ang mga trabahong mas bagay sa iyong sitwasyon.",
        country: "Saan mo gustong magtrabaho?",
        experience: "Iyong karanasan",
        area: "Piniling trabaho",
        any: "Kahit ano",
        poland: "Poland",
        other: "Hungary · Belgium",
        noExperience: "Walang karanasan",
        experienced: "May karanasan",
        greenhouse: "Greenhouse",
        warehouse: "Warehouse",
        transport: "Driver",
        results: "Bagay na trabaho",
        open: "Buksan",
        apply: "Form",
        whatsapp: "Ipadala ang sagot",
        messageTitle: "MABILIS NA MATCH · CITRONEX",
        messageIntro: "Hello! Gusto kong kumpirmahin ang mga trabaho batay sa mabilis kong sagot.",
        messageAnswers: "Mga sagot ko",
        messageJobs: "Bagay na trabaho",
        messageLanguage: "Wika ng site",
        messageLink: "Link",
        note: "Paunang match ito. Kailangang kumpirmahin ang kondisyon, dokumento at petsa ng simula."
      },
      hy: {
        kicker: "Ընտրություն 30 վայրկյանում",
        title: "Պատասխանեք 3 հարցի",
        intro: "Կայքը անմիջապես ցույց կտա ձեր իրավիճակին ավելի համապատասխան աշխատանքները։",
        country: "Որտե՞ղ եք ուզում աշխատել",
        experience: "Ձեր փորձը",
        area: "Ո՞ր աշխատանքն է մոտ",
        any: "Կարևոր չէ",
        poland: "Լեհաստան",
        other: "Հունգարիա · Բելգիա",
        noExperience: "Առանց փորձի",
        experienced: "Փորձ ունեմ",
        greenhouse: "Ջերմոց",
        warehouse: "Պահեստ",
        transport: "Վարորդ",
        results: "Հարմար տարբերակներ",
        open: "Բացել",
        apply: "Անկետա",
        whatsapp: "Գրել այս պատասխաններով",
        messageTitle: "ԱՐԱԳ ԸՆՏՐՈՒԹՅՈՒՆ · CITRONEX",
        messageIntro: "Բարև։ Ուզում եմ ճշտել աշխատանքները իմ արագ պատասխանների հիման վրա։",
        messageAnswers: "Իմ պատասխանները",
        messageJobs: "Հարմար աշխատանքներ",
        messageLanguage: "Կայքի լեզուն",
        messageLink: "Հղում",
        note: "Սա նախնական ընտրություն է։ Պայմանները, փաստաթղթերը և սկսելու օրը պետք է հաստատել։"
      },
      ka: {
        kicker: "შერჩევა 30 წამში",
        title: "უპასუხეთ 3 კითხვას",
        intro: "საიტი მაშინვე გაჩვენებთ უფრო შესაფერის ვაკანსიებს.",
        country: "სად გსურთ მუშაობა?",
        experience: "გამოცდილება",
        area: "რა გირჩევნიათ?",
        any: "ნებისმიერი",
        poland: "პოლონეთი",
        other: "უნგრეთი · ბელგია",
        noExperience: "გამოცდილების გარეშე",
        experienced: "გამოცდილებით",
        greenhouse: "სათბური",
        warehouse: "საწყობი",
        transport: "მძღოლი",
        results: "შესაფერისი ვარიანტები",
        open: "გახსნა",
        apply: "ანკეტა",
        whatsapp: "მოწერა ამ პასუხებით",
        messageTitle: "სწრაფი შერჩევა · CITRONEX",
        messageIntro: "გამარჯობა! მინდა ვაკანსიების დაზუსტება ჩემი სწრაფი პასუხების მიხედვით.",
        messageAnswers: "ჩემი პასუხები",
        messageJobs: "შესაფერისი ვაკანსიები",
        messageLanguage: "საიტის ენა",
        messageLink: "ბმული",
        note: "ეს წინასწარი შერჩევაა. პირობები, დოკუმენტები და დაწყების თარიღი უნდა დადასტურდეს."
      },
      ne: {
        kicker: "३० सेकेन्डमा मिलान",
        title: "३ प्रश्नको उत्तर दिनुहोस्",
        intro: "साइटले तपाईंको अवस्थासँग मिल्ने कामहरू तुरुन्त देखाउँछ।",
        country: "कहाँ काम गर्न चाहनुहुन्छ?",
        experience: "अनुभव",
        area: "कामको प्रकार",
        any: "जे भए पनि",
        poland: "पोल्याण्ड",
        other: "हंगेरी · बेल्जियम",
        noExperience: "अनुभव छैन",
        experienced: "अनुभव छ",
        greenhouse: "ग्रीनहाउस",
        warehouse: "गोदाम",
        transport: "चालक",
        results: "उपयुक्त कामहरू",
        open: "खोल्नुहोस्",
        apply: "फारम",
        whatsapp: "यी उत्तरसहित लेख्नुहोस्",
        messageTitle: "छिटो मिलान · CITRONEX",
        messageIntro: "नमस्ते! मेरा छिटो उत्तरका आधारमा कामहरू पुष्टि गर्न चाहन्छु।",
        messageAnswers: "मेरा उत्तरहरू",
        messageJobs: "उपयुक्त कामहरू",
        messageLanguage: "साइट भाषा",
        messageLink: "लिङ्क",
        note: "यो प्रारम्भिक मिलान हो। सर्त, कागजात र सुरु मिति पुष्टि गर्नुपर्छ।"
      }
    };
    const upgrade = {
      en: {
        title: "Answer 6 quick questions",
        intro: "The site will show suitable jobs and prepare a clear WhatsApp message for the recruiter.",
        current: "Where are you now?",
        currentEu: "Already in EU",
        currentUkraine: "Ukraine",
        currentOther: "Other country",
        people: "Who is going?",
        solo: "Only me",
        couple: "Couple",
        group: "Group / friends",
        start: "When can you start?",
        soon: "As soon as possible",
        month: "This month",
        later: "Later / checking",
        whatsapp: "Send my answers in WhatsApp"
      },
      ru: {
        title: "Ответьте на 6 быстрых вопросов",
        intro: "Сайт покажет подходящие вакансии и подготовит понятное сообщение рекрутеру в WhatsApp.",
        current: "Где вы сейчас?",
        currentEu: "Уже в ЕС",
        currentUkraine: "Украина",
        currentOther: "Другая страна",
        people: "Кто едет?",
        solo: "Только я",
        couple: "Пара",
        group: "Группа / друзья",
        start: "Когда готовы начать?",
        soon: "Как можно быстрее",
        month: "В этом месяце",
        later: "Позже / уточняю",
        whatsapp: "Отправить мои ответы в WhatsApp"
      },
      uk: {
        title: "Дайте 6 швидких відповідей",
        intro: "Сайт покаже відповідні вакансії і підготує зрозуміле повідомлення рекрутеру в WhatsApp.",
        current: "Де ви зараз?",
        currentEu: "Вже в ЄС",
        currentUkraine: "Україна",
        currentOther: "Інша країна",
        people: "Хто їде?",
        solo: "Тільки я",
        couple: "Пара",
        group: "Група / друзі",
        start: "Коли готові почати?",
        soon: "Якнайшвидше",
        month: "Цього місяця",
        later: "Пізніше / уточнюю",
        whatsapp: "Надіслати мої відповіді в WhatsApp"
      },
      pl: {
        title: "Odpowiedz na 6 szybkich pytań",
        intro: "Strona pokaże pasujące oferty i przygotuje jasną wiadomość do rekrutera w WhatsApp.",
        current: "Gdzie jesteś teraz?",
        currentEu: "Już w UE",
        currentUkraine: "Ukraina",
        currentOther: "Inny kraj",
        people: "Kto jedzie?",
        solo: "Tylko ja",
        couple: "Para",
        group: "Grupa / znajomi",
        start: "Kiedy możesz zacząć?",
        soon: "Jak najszybciej",
        month: "W tym miesiącu",
        later: "Później / sprawdzam",
        whatsapp: "Wyślij moje odpowiedzi w WhatsApp"
      }
    };
    return { ...copy.en, ...(copy[i18n.locale] || {}), ...(upgrade[i18n.locale] || upgrade.en) };
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
      <div class="whatsapp-trust-check">
        ${whatsappTrustCheckCopy().map(([title, text]) => `
          <article>
            <span aria-hidden="true">✓</span>
            <strong>${escapeHTML(title)}</strong>
            <small>${escapeHTML(text)}</small>
          </article>
        `).join("")}
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

  function whatsappTrustCheckCopy() {
    const copy = {
      en: [
        ["Verified contact", "The chat opens only with the recruiter number shown on this site."],
        ["No payment first", "A job or housing place is not reserved by sending money to strangers."],
        ["Conditions first", "City, start date, housing, schedule and gross rate are clarified before travel."]
      ],
      ru: [
        ["Проверенный контакт", "Чат откроется только с номером рекрутера, указанным на этом сайте."],
        ["Без оплаты заранее", "Вакансия или жильё не бронируются переводом денег незнакомым людям."],
        ["Сначала условия", "Город, старт, жильё, график и ставка брутто уточняются до поездки."]
      ],
      uk: [
        ["Перевірений контакт", "Чат відкриється тільки з номером рекрутера, вказаним на цьому сайті."],
        ["Без оплати наперед", "Вакансія або житло не бронюються переказом грошей незнайомим людям."],
        ["Спочатку умови", "Місто, старт, житло, графік і ставка брутто уточнюються до поїздки."]
      ],
      pl: [
        ["Sprawdzony kontakt", "Czat otworzy się tylko z numerem rekrutera pokazanym na tej stronie."],
        ["Bez wpłat z góry", "Pracy ani mieszkania nie rezerwuje się przelewem do obcych osób."],
        ["Najpierw warunki", "Miasto, start, mieszkanie, grafik i stawka brutto są wyjaśniane przed wyjazdem."]
      ]
    };
    return copy[i18n.locale] || copy.en;
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
      ["profile-bio", t("ui.profileBio")],
      ["hero-promise", `«${t("ui.bannerText")}»`],
      ["hero-response-time", profile.workHours || t("ui.workHours")],
      ["hero-work-hours", `${profile.workHours || t("ui.workHours")} · ${profile.timezone}`],
      ["contact-response", profile.workHours || t("ui.workHours")],
      ["contact-timezone", profile.timezone]
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
    if (el("home-process")) el("home-process").innerHTML = processMarkup;
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
    if (el("home-faq-list")) {
      el("home-faq-list").innerHTML = localizedFaq.slice(0, 4).map((item) => `
        <details>
          <summary>${escapeHTML(item.question)}</summary>
          <p>${escapeHTML(item.answer)}</p>
        </details>
      `).join("");
    }

    renderQuickStart();
    renderCountryExplorer();
    renderQuickShareLinks();
    renderCountryComparison();
    renderHonestFit();
    renderAntiScam();
    renderInstantMatcher();
    renderPriorityPicker();
    renderDecisionPath();
    renderWhatsAppScripts();
    renderCandidatePrep();
    renderCandidatePassport();
    renderAfterWhatsApp();
    renderCandidateSituations();

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
      jobTitle: recruiterRole,
      description: t("ui.profileBio"),
      email: `mailto:${profile.email}`,
      telephone: profile.phone,
      url: site.baseUrl,
      sameAs: [profile.github, profile.linkedin].filter(Boolean),
      knowsLanguage: ["Ukrainian", "Russian", "Polish", "English", "Georgian"],
      knowsAbout: [
        "Recruitment",
        "Candidate onboarding",
        "International workforce coordination",
        "Greenhouse work",
        "Python",
        "Django"
      ],
      alumniOf: {
        "@type": "EducationalOrganization",
        name: "Coders Lab"
      }
    };
    document.getElementById("person-schema")?.remove();
    const schemaNode = document.createElement("script");
    schemaNode.type = "application/ld+json";
    schemaNode.id = "person-schema";
    schemaNode.textContent = JSON.stringify(personSchema);
    document.head.append(schemaNode);
  }

  function renderQuickStart() {
    const copy = quickStartCopy();
    if (el("quick-start-kicker")) el("quick-start-kicker").textContent = copy.kicker;
    if (el("quick-start-heading")) el("quick-start-heading").textContent = copy.title;
    const labels = {
      "country:poland": copy.poland,
      "country:other": copy.other,
      "level:noExperience": copy.noExperience,
      "category:driver": copy.driver
    };
    els("[data-quick-filter]").forEach((button) => {
      button.textContent = labels[button.dataset.quickFilter] || button.textContent;
      button.classList.toggle("active", state.quickFilter === button.dataset.quickFilter);
      button.setAttribute("aria-pressed", String(state.quickFilter === button.dataset.quickFilter));
    });
    const surveyButton = document.querySelector(".quick-start [data-application-general]");
    if (surveyButton) surveyButton.textContent = copy.survey;
  }

  function priorityPickerCopy() {
    const copy = {
      en: {
        kicker: "What matters most?",
        title: "Choose a priority — the site starts closer to your situation",
        intro: "This does not replace the recruiter conversation, but it helps you start from the right direction.",
        action: "Show matching jobs",
        applied: "Priority added to your application and job list.",
        cards: {
          fast: ["Fast start", "Show jobs where the start is usually easier to clarify.", "Start"],
          noExperience: ["No experience", "Focus on directions with training and simpler entry.", "Training"],
          housing: ["Need housing", "Prepare the application so housing is checked early.", "Housing"],
          couple: ["Going as a couple", "Mark that two places and housing should be checked together.", "Couple"],
          driver: ["Driver work", "Move toward transport roles and driver-related questions.", "Driver"],
          unsure: ["Need advice", "Use this when country, city or date is not clear yet.", "Advice"]
        }
      },
      ru: {
        kicker: "Что важнее?",
        title: "Выберите приоритет — сайт покажет ближе к вашей ситуации",
        intro: "Это не заменяет разговор с рекрутером, но помогает быстрее начать с правильного направления.",
        action: "Показать подходящее",
        applied: "Приоритет добавлен в заявку и список вакансий.",
        cards: {
          fast: ["Быстрый старт", "Показать вакансии, где старт обычно проще уточнить.", "Старт"],
          noExperience: ["Без опыта", "Сфокусироваться на направлениях с обучением и простым входом.", "Обучение"],
          housing: ["Нужно жильё", "Подготовить заявку так, чтобы жильё проверили раньше.", "Жильё"],
          couple: ["Едем парой", "Отметить, что нужно проверить два места и жильё вместе.", "Пара"],
          driver: ["Работа водителем", "Перейти к транспортным вакансиям и вопросам по водителю.", "Водитель"],
          unsure: ["Нужен совет", "Если страна, город или дата пока непонятны.", "Совет"]
        }
      },
      uk: {
        kicker: "Що важливіше?",
        title: "Оберіть пріоритет — сайт покаже ближче до вашої ситуації",
        intro: "Це не замінює розмову з рекрутером, але допомагає швидше почати з правильного напрямку.",
        action: "Показати відповідне",
        applied: "Пріоритет додано в заявку й список вакансій.",
        cards: {
          fast: ["Швидкий старт", "Показати вакансії, де старт зазвичай простіше уточнити.", "Старт"],
          noExperience: ["Без досвіду", "Сфокусуватися на напрямках із навчанням і простим входом.", "Навчання"],
          housing: ["Потрібне житло", "Підготувати заявку так, щоб житло перевірили раніше.", "Житло"],
          couple: ["Їдемо парою", "Позначити, що треба перевірити два місця й житло разом.", "Пара"],
          driver: ["Робота водієм", "Перейти до транспортних вакансій і питань щодо водія.", "Водій"],
          unsure: ["Потрібна порада", "Якщо країна, місто або дата ще незрозумілі.", "Порада"]
        }
      },
      pl: {
        kicker: "Co jest najważniejsze?",
        title: "Wybierz priorytet — strona zacznie bliżej Twojej sytuacji",
        intro: "To nie zastępuje rozmowy z rekruterem, ale pomaga szybciej zacząć od właściwego kierunku.",
        action: "Pokaż pasujące",
        applied: "Priorytet dodany do zgłoszenia i listy ofert.",
        cards: {
          fast: ["Szybki start", "Pokaż oferty, gdzie start zwykle łatwiej doprecyzować.", "Start"],
          noExperience: ["Bez doświadczenia", "Skup się na kierunkach ze szkoleniem i prostym wejściem.", "Szkolenie"],
          housing: ["Potrzebne mieszkanie", "Przygotuj zgłoszenie tak, aby mieszkanie sprawdzić wcześniej.", "Mieszkanie"],
          couple: ["Jedziemy parą", "Zaznacz, że trzeba sprawdzić dwa miejsca i mieszkanie razem.", "Para"],
          driver: ["Praca kierowcy", "Przejdź do ofert transportowych i pytań dla kierowcy.", "Kierowca"],
          unsure: ["Potrzebna rada", "Gdy kraj, miasto lub data nie są jeszcze jasne.", "Rada"]
        }
      }
    };
    return copy[i18n.locale] || copy.en;
  }

  function renderPriorityPicker() {
    const container = el("priority-picker-grid");
    if (!container) return;
    const copy = priorityPickerCopy();
    if (el("priority-picker-kicker")) el("priority-picker-kicker").textContent = copy.kicker;
    if (el("priority-picker-heading")) el("priority-picker-heading").textContent = copy.title;
    if (el("priority-picker-intro")) el("priority-picker-intro").textContent = copy.intro;
    const order = ["fast", "noExperience", "housing", "couple", "driver", "unsure"];
    container.innerHTML = order.map((id) => {
      const [title, text, badge] = copy.cards[id];
      const active = state.activePriority === id;
      return `
        <article class="priority-picker-card${active ? " is-active" : ""}">
          <span>${escapeHTML(badge)}</span>
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(text)}</p>
          <button class="button ${active ? "button-primary" : "button-secondary"}" type="button" data-priority-pick="${escapeHTML(id)}" aria-pressed="${String(active)}">${escapeHTML(copy.action)}</button>
        </article>
      `;
    }).join("");
  }

  function applyPriorityPick(priority) {
    const copy = priorityPickerCopy();
    state.activePriority = priority;
    if (!passportValue("language")) state.passport.language = passportOptionValue("language", 0);
    if (priority === "fast") {
      state.instantMatch.start = "soon";
      state.quickFilter = "country:poland";
      state.passport.readyDate = state.passport.readyDate || (i18n.locale === "ru" ? "как можно быстрее" : "as soon as possible");
    }
    if (priority === "noExperience") {
      state.instantMatch.experience = "none";
      state.quickFilter = "level:noExperience";
      state.passport.experience = passportOptionValue("experience", 0);
      state.passport.job = state.passport.job || decisionPathCopy().hints.noExperience;
    }
    if (priority === "housing") {
      state.instantMatch.start = state.instantMatch.start === "any" ? "month" : state.instantMatch.start;
      state.passport.job = state.passport.job || (i18n.locale === "ru" ? "вакансия с жильём" : "job with housing");
    }
    if (priority === "couple") {
      state.instantMatch.people = "couple";
      state.passport.people = passportOptionValue("people", 1);
      state.passport.job = state.passport.job || decisionPathCopy().hints.couple;
    }
    if (priority === "driver") {
      state.instantMatch.area = "transport";
      state.quickFilter = "category:driver";
      state.passport.experience = passportOptionValue("experience", 2);
      state.passport.job = state.passport.job || decisionPathCopy().hints.driver;
    }
    if (priority === "unsure") {
      state.instantMatch.country = "any";
      state.instantMatch.start = "later";
      state.passport.destination = passportOptionValue("destination", 3);
      state.passport.readyDate = state.passport.readyDate || decisionPathCopy().hints.unsure;
      state.passport.job = state.passport.job || decisionPathCopy().hints.unsure;
    }
    if (!passportValue("workDocs")) state.passport.workDocs = passportOptionValue("workDocs", 2);
    ensurePassportId();
    persistPassport();
    renderPriorityPicker();
    renderInstantMatcher();
    renderCandidatePassport();
    refreshJobLists();
    showToast(copy.applied);
    showView("jobs");
  }

  function decisionPathCopy() {
    const copy = {
      en: {
        kicker: "Quick start",
        title: "Choose your situation — the site prepares your application",
        intro: "One tap fills safe application details: no document numbers, no photos and no bank information.",
        action: "Prepare my application",
        prepared: "Application prepared. Check the fields and send it in WhatsApp.",
        hints: {
          noExperience: "greenhouse / warehouse",
          couple: "work for couple",
          driver: "driver",
          unsure: "need advice"
        },
        cards: {
          noExperience: {
            title: "I have no experience",
            text: "Start with greenhouse, sorting or warehouse work with training.",
            badge: "Training"
          },
          couple: {
            title: "We travel as a couple",
            text: "The recruiter will see that two places and housing should be checked together.",
            badge: "2 people"
          },
          driver: {
            title: "I am a driver",
            text: "The application will point the conversation toward transport roles.",
            badge: "C+E"
          },
          unsure: {
            title: "I am not sure yet",
            text: "Use this when the country, city or start date still needs advice.",
            badge: "Need advice"
          }
        }
      },
      ru: {
        kicker: "Быстрый старт",
        title: "Выберите ситуацию — сайт подготовит заявку",
        intro: "Один тап заполнит часть анкеты безопасными данными: без номеров документов, фото и банковской информации.",
        action: "Подготовить заявку",
        prepared: "Заявка подготовлена. Проверьте поля и отправьте её в WhatsApp.",
        hints: {
          noExperience: "теплица / склад",
          couple: "работа для пары",
          driver: "водитель",
          unsure: "нужен совет"
        },
        cards: {
          noExperience: {
            title: "Я без опыта",
            text: "Подойдёт старт с теплиц, сортировки или склада, где есть обучение.",
            badge: "Обучение"
          },
          couple: {
            title: "Едем парой",
            text: "Рекрутер сразу увидит, что нужно проверить два места и жильё вместе.",
            badge: "2 человека"
          },
          driver: {
            title: "Я водитель",
            text: "Заявка направит разговор к транспортным вакансиям.",
            badge: "C+E"
          },
          unsure: {
            title: "Пока не знаю",
            text: "Если страна, город или дата старта ещё требуют совета.",
            badge: "Нужен совет"
          }
        }
      },
      uk: {
        kicker: "Швидкий старт",
        title: "Оберіть ситуацію — сайт підготує заявку",
        intro: "Один тап заповнить частину анкети безпечними даними: без номерів документів, фото й банківської інформації.",
        action: "Підготувати заявку",
        prepared: "Заявку підготовлено. Перевірте поля й надішліть її у WhatsApp.",
        hints: {
          noExperience: "теплиця / склад",
          couple: "робота для пари",
          driver: "водій",
          unsure: "потрібна порада"
        },
        cards: {
          noExperience: {
            title: "Я без досвіду",
            text: "Підійде старт із теплиць, сортування або складу, де є навчання.",
            badge: "Навчання"
          },
          couple: {
            title: "Їдемо парою",
            text: "Рекрутер одразу побачить, що треба перевірити два місця й житло разом.",
            badge: "2 людини"
          },
          driver: {
            title: "Я водій",
            text: "Заявка направить розмову до транспортних вакансій.",
            badge: "C+E"
          },
          unsure: {
            title: "Поки не знаю",
            text: "Якщо країна, місто або дата старту ще потребують поради.",
            badge: "Потрібна порада"
          }
        }
      },
      pl: {
        kicker: "Szybki start",
        title: "Wybierz sytuację — strona przygotuje zgłoszenie",
        intro: "Jedno kliknięcie uzupełni bezpieczne dane: bez numerów dokumentów, zdjęć i danych bankowych.",
        action: "Przygotuj zgłoszenie",
        prepared: "Zgłoszenie przygotowane. Sprawdź pola i wyślij je w WhatsApp.",
        hints: {
          noExperience: "szklarnia / magazyn",
          couple: "praca dla pary",
          driver: "kierowca",
          unsure: "potrzebna rada"
        },
        cards: {
          noExperience: {
            title: "Nie mam doświadczenia",
            text: "Dobry start to szklarnie, sortowanie lub magazyn z przyuczeniem.",
            badge: "Szkolenie"
          },
          couple: {
            title: "Jedziemy parą",
            text: "Rekruter od razu zobaczy, że trzeba sprawdzić dwa miejsca i mieszkanie.",
            badge: "2 osoby"
          },
          driver: {
            title: "Jestem kierowcą",
            text: "Zgłoszenie skieruje rozmowę na oferty transportowe.",
            badge: "C+E"
          },
          unsure: {
            title: "Jeszcze nie wiem",
            text: "Gdy kraj, miasto lub data startu wymagają porady.",
            badge: "Potrzebna rada"
          }
        }
      }
    };
    return copy[i18n.locale] || copy.en;
  }

  function renderDecisionPath() {
    const container = el("decision-path-grid");
    if (!container) return;
    const copy = decisionPathCopy();
    if (el("decision-path-kicker")) el("decision-path-kicker").textContent = copy.kicker;
    if (el("decision-path-heading")) el("decision-path-heading").textContent = copy.title;
    if (el("decision-path-intro")) el("decision-path-intro").textContent = copy.intro;
    const cards = [
      ["noExperience", copy.cards.noExperience],
      ["couple", copy.cards.couple],
      ["driver", copy.cards.driver],
      ["unsure", copy.cards.unsure]
    ];
    container.innerHTML = cards.map(([id, card]) => `
      <article class="decision-path-card">
        <span>${escapeHTML(card.badge)}</span>
        <h3>${escapeHTML(card.title)}</h3>
        <p>${escapeHTML(card.text)}</p>
        <button class="button button-secondary" type="button" data-decision-path="${escapeHTML(id)}">${escapeHTML(copy.action)}</button>
      </article>
    `).join("");
  }

  function applyDecisionPath(path) {
    const copy = decisionPathCopy();
    const language = passportOptionValue("language", 0);
    if (!passportValue("language")) state.passport.language = language;
    if (path === "noExperience") {
      state.instantMatch.experience = "none";
      state.instantMatch.area = "greenhouse";
      state.passport.experience = passportOptionValue("experience", 0);
      state.passport.job = state.passport.job || copy.hints.noExperience;
    }
    if (path === "couple") {
      state.instantMatch.people = "couple";
      state.passport.people = passportOptionValue("people", 1);
      state.passport.job = state.passport.job || copy.hints.couple;
    }
    if (path === "driver") {
      state.instantMatch.experience = "experienced";
      state.instantMatch.area = "transport";
      state.passport.experience = passportOptionValue("experience", 2);
      state.passport.job = state.passport.job || copy.hints.driver;
    }
    if (path === "unsure") {
      state.instantMatch.country = "any";
      state.instantMatch.start = "later";
      state.passport.destination = passportOptionValue("destination", 3);
      state.passport.readyDate = state.passport.readyDate || copy.hints.unsure;
      state.passport.job = state.passport.job || copy.hints.unsure;
    }
    if (!passportValue("workDocs")) state.passport.workDocs = passportOptionValue("workDocs", 2);
    ensurePassportId();
    persistPassport();
    renderInstantMatcher();
    renderCandidatePassport();
    refreshJobLists();
    el("candidate-passport-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(copy.prepared);
  }

  function afterWhatsAppCopy() {
    const copy = {
      en: {
        kicker: "After WhatsApp",
        title: "You will know the next step",
        intro: "The application does not disappear into a void: the recruiter receives a clear card and checks conditions for your situation.",
        send: "Send application",
        jobs: "View jobs",
        steps: [
          ["1", "I receive your card", "Name, language, country, experience, start date and general paperwork status."],
          ["2", "I check real options", "Vacancy, city, schedule, housing and gross rate are verified before promises."],
          ["3", "We clarify questions", "If something is missing, I ask only what is needed — no document numbers on the site."],
          ["4", "You decide calmly", "You get the next step only after conditions are clear enough."]
        ]
      },
      ru: {
        kicker: "После WhatsApp",
        title: "Вы будете понимать следующий шаг",
        intro: "Заявка не исчезает в пустоту: рекрутер получает понятную карточку и проверяет условия по вашей ситуации.",
        send: "Отправить заявку",
        jobs: "Смотреть вакансии",
        steps: [
          ["1", "Я получаю вашу карточку", "Имя, язык, страна, опыт, дата старта и общий статус оформления."],
          ["2", "Проверяю реальные варианты", "Вакансия, город, график, жильё и ставка брутто проверяются до обещаний."],
          ["3", "Уточняем вопросы", "Если чего-то не хватает, спрашиваю только нужное — без номеров документов на сайте."],
          ["4", "Вы решаете спокойно", "Следующий шаг появляется только когда условия достаточно понятны."]
        ]
      },
      uk: {
        kicker: "Після WhatsApp",
        title: "Ви будете розуміти наступний крок",
        intro: "Заявка не зникає в порожнечу: рекрутер отримує зрозумілу картку й перевіряє умови під вашу ситуацію.",
        send: "Надіслати заявку",
        jobs: "Дивитися вакансії",
        steps: [
          ["1", "Я отримую вашу картку", "Ім’я, мова, країна, досвід, дата старту й загальний статус оформлення."],
          ["2", "Перевіряю реальні варіанти", "Вакансія, місто, графік, житло й ставка брутто перевіряються до обіцянок."],
          ["3", "Уточнюємо питання", "Якщо чогось бракує, питаю тільки потрібне — без номерів документів на сайті."],
          ["4", "Ви вирішуєте спокійно", "Наступний крок з’являється тільки коли умови достатньо зрозумілі."]
        ]
      },
      pl: {
        kicker: "Po WhatsApp",
        title: "Będziesz znać następny krok",
        intro: "Zgłoszenie nie znika w próżni: rekruter dostaje jasną kartę i sprawdza warunki pod Twoją sytuację.",
        send: "Wyślij zgłoszenie",
        jobs: "Zobacz oferty",
        steps: [
          ["1", "Otrzymuję Twoją kartę", "Imię, język, kraj, doświadczenie, data startu i ogólny status formalności."],
          ["2", "Sprawdzam realne opcje", "Oferta, miasto, grafik, mieszkanie i stawka brutto są weryfikowane przed obietnicami."],
          ["3", "Doprecyzowujemy pytania", "Jeśli czegoś brakuje, pytam tylko o potrzebne rzeczy — bez numerów dokumentów na stronie."],
          ["4", "Decydujesz spokojnie", "Następny krok pojawia się dopiero, gdy warunki są wystarczająco jasne."]
        ]
      }
    };
    return copy[i18n.locale] || copy.en;
  }

  function renderAfterWhatsApp() {
    const container = el("after-whatsapp-grid");
    if (!container) return;
    const copy = afterWhatsAppCopy();
    if (el("after-whatsapp-kicker")) el("after-whatsapp-kicker").textContent = copy.kicker;
    if (el("after-whatsapp-heading")) el("after-whatsapp-heading").textContent = copy.title;
    if (el("after-whatsapp-intro")) el("after-whatsapp-intro").textContent = copy.intro;
    if (el("after-whatsapp-send")) el("after-whatsapp-send").textContent = copy.send;
    if (el("after-whatsapp-jobs")) el("after-whatsapp-jobs").textContent = copy.jobs;
    container.innerHTML = copy.steps.map(([number, title, text]) => `
      <article class="after-whatsapp-card">
        <span>${escapeHTML(number)}</span>
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(text)}</p>
      </article>
    `).join("");
  }

  function countryExplorerCopy() {
    const copy = {
      ru: {
        kicker: "Вакансии по странам",
        title: "Сначала выберите страну",
        intro: "Так быстрее понять ставку, жильё, документы и ближайший подходящий вариант.",
        jobs: "вакансий",
        from: "от",
        gross: "брутто",
        housing: "Жильё уточняем перед стартом",
        poland: "Самый широкий выбор: теплицы, склад, производство и водители.",
        hungary: "Варианты для кандидатов, которым важна страна и оформление.",
        belgium: "Отдельные условия, документы и старт всегда уточняются лично.",
        noExperience: "без опыта",
        pairs: "пары",
        drivers: "водители",
        specialists: "специалисты",
        open: "Показать вакансии"
      },
      uk: {
        kicker: "Вакансії за країнами",
        title: "Спочатку оберіть країну",
        intro: "Так швидше зрозуміти ставку, житло, документи і найближчий варіант.",
        jobs: "вакансій",
        from: "від",
        gross: "брутто",
        housing: "Житло уточнюємо перед стартом",
        poland: "Найширший вибір: теплиці, склад, виробництво і водії.",
        hungary: "Варіанти для кандидатів, яким важлива країна та оформлення.",
        belgium: "Окремі умови, документи і старт завжди уточнюються особисто.",
        noExperience: "без досвіду",
        pairs: "пари",
        drivers: "водії",
        specialists: "спеціалісти",
        open: "Показати вакансії"
      },
      pl: {
        kicker: "Oferty według kraju",
        title: "Najpierw wybierz kraj",
        intro: "Szybciej sprawdzisz stawkę, zakwaterowanie, dokumenty i najlepszą opcję.",
        jobs: "ofert",
        from: "od",
        gross: "brutto",
        housing: "Zakwaterowanie potwierdzamy przed startem",
        poland: "Najszerszy wybór: szklarnie, magazyn, produkcja i kierowcy.",
        hungary: "Opcje dla kandydatów, dla których ważny jest kraj i formalności.",
        belgium: "Warunki, dokumenty i start zawsze potwierdzamy indywidualnie.",
        noExperience: "bez doświadczenia",
        pairs: "pary",
        drivers: "kierowcy",
        specialists: "specjaliści",
        open: "Pokaż oferty"
      },
      en: {
        kicker: "Jobs by country",
        title: "Choose the country first",
        intro: "It helps candidates quickly understand pay, housing, documents and the best next option.",
        jobs: "jobs",
        from: "from",
        gross: "gross",
        housing: "Housing is confirmed before start",
        poland: "The widest choice: greenhouse, warehouse, production and drivers.",
        hungary: "Options for candidates who care about the country and paperwork.",
        belgium: "Conditions, documents and start date are always confirmed personally.",
        noExperience: "no experience",
        pairs: "couples",
        drivers: "drivers",
        specialists: "specialists",
        open: "Show jobs"
      },
      az: {
        kicker: "Ölkələr üzrə vakansiyalar",
        title: "Əvvəlcə ölkəni seçin",
        intro: "Maaşı, yaşayışı, sənədləri və uyğun variantı daha tez anlamağa kömək edir.",
        jobs: "vakansiya",
        from: "başlayır",
        gross: "brutto",
        housing: "Yaşayış startdan əvvəl təsdiqlənir",
        poland: "Ən geniş seçim: istixana, anbar, istehsal və sürücülər.",
        hungary: "Ölkə və rəsmiləşdirmə vacib olan namizədlər üçün seçimlər.",
        belgium: "Şərtlər, sənədlər və start tarixi fərdi təsdiqlənir.",
        noExperience: "təcrübəsiz",
        pairs: "cütlüklər",
        drivers: "sürücülər",
        specialists: "mütəxəssislər",
        open: "Vakansiyaları göstər"
      },
      ka: {
        kicker: "ვაკანსიები ქვეყნების მიხედვით",
        title: "ჯერ ქვეყანა აირჩიეთ",
        intro: "ასე სწრაფად გაიგებთ ანაზღაურებას, საცხოვრებელს, დოკუმენტებს და საუკეთესო ვარიანტს.",
        jobs: "ვაკანსია",
        from: "დან",
        gross: "ბრუტო",
        housing: "საცხოვრებელი დასაწყისამდე ზუსტდება",
        poland: "ყველაზე ფართო არჩევანი: სათბური, საწყობი, წარმოება და მძღოლები.",
        hungary: "ვარიანტები მათთვის, ვისთვისაც ქვეყანა და გაფორმება მნიშვნელოვანია.",
        belgium: "პირობები, დოკუმენტები და დაწყება პირადად ზუსტდება.",
        noExperience: "გამოცდილების გარეშე",
        pairs: "წყვილები",
        drivers: "მძღოლები",
        specialists: "სპეციალისტები",
        open: "ვაკანსიების ჩვენება"
      },
      id: {
        kicker: "Lowongan per negara",
        title: "Pilih negara dulu",
        intro: "Ini membantu memahami gaji, tempat tinggal, dokumen, dan opsi terbaik lebih cepat.",
        jobs: "lowongan",
        from: "mulai",
        gross: "gross",
        housing: "Akomodasi dikonfirmasi sebelum mulai",
        poland: "Pilihan terluas: greenhouse, gudang, produksi, dan sopir.",
        hungary: "Opsi untuk kandidat yang fokus pada negara dan dokumen.",
        belgium: "Syarat, dokumen, dan tanggal mulai selalu dikonfirmasi pribadi.",
        noExperience: "tanpa pengalaman",
        pairs: "pasangan",
        drivers: "sopir",
        specialists: "spesialis",
        open: "Tampilkan lowongan"
      },
      es: {
        kicker: "Vacantes por país",
        title: "Primero elige el país",
        intro: "Así es más fácil entender salario, alojamiento, documentos y la mejor opción.",
        jobs: "vacantes",
        from: "desde",
        gross: "bruto",
        housing: "El alojamiento se confirma antes del inicio",
        poland: "La opción más amplia: invernadero, almacén, producción y conductores.",
        hungary: "Opciones para candidatos que priorizan país y documentos.",
        belgium: "Condiciones, documentos e inicio se confirman personalmente.",
        noExperience: "sin experiencia",
        pairs: "parejas",
        drivers: "conductores",
        specialists: "especialistas",
        open: "Mostrar vacantes"
      },
      fil: {
        kicker: "Trabaho ayon sa bansa",
        title: "Pumili muna ng bansa",
        intro: "Mas mabilis makita ang sahod, tirahan, dokumento, at bagay na opsyon.",
        jobs: "trabaho",
        from: "mula",
        gross: "gross",
        housing: "Kinukumpirma ang tirahan bago magsimula",
        poland: "Pinakamalawak na pagpipilian: greenhouse, warehouse, production at driver.",
        hungary: "Opsyon para sa kandidato na mahalaga ang bansa at papeles.",
        belgium: "Kondisyon, dokumento at start date ay kinukumpirma nang personal.",
        noExperience: "walang experience",
        pairs: "couples",
        drivers: "drivers",
        specialists: "specialists",
        open: "Ipakita ang trabaho"
      },
      ne: {
        kicker: "देश अनुसार काम",
        title: "पहिले देश छान्नुहोस्",
        intro: "यसले तलब, बसाइ, कागजात र राम्रो विकल्प छिटो बुझ्न मद्दत गर्छ।",
        jobs: "काम",
        from: "देखि",
        gross: "gross",
        housing: "बसाइ सुरु अघि पुष्टि हुन्छ",
        poland: "सबैभन्दा धेरै विकल्प: ग्रीनहाउस, गोदाम, उत्पादन र चालक।",
        hungary: "देश र कागजात महत्त्वपूर्ण हुने उम्मेदवारका लागि विकल्प।",
        belgium: "सर्त, कागजात र सुरु मिति व्यक्तिगत रूपमा पुष्टि हुन्छ।",
        noExperience: "अनुभव छैन",
        pairs: "जोडी",
        drivers: "चालक",
        specialists: "विशेषज्ञ",
        open: "काम देखाउनुहोस्"
      },
      hy: {
        kicker: "Աշխատանք ըստ երկրների",
        title: "Նախ ընտրեք երկիրը",
        intro: "Այսպես ավելի արագ պարզ է դառնում վճարը, բնակարանը, փաստաթղթերը և լավագույն տարբերակը։",
        jobs: "աշխատանք",
        from: "սկսած",
        gross: "բրուտտո",
        housing: "Բնակարանը հաստատվում է մեկնարկից առաջ",
        poland: "Ամենալայն ընտրությունը՝ ջերմոց, պահեստ, արտադրություն և վարորդներ։",
        hungary: "Տարբերակներ նրանց համար, ում կարևոր է երկիրը և ձևակերպումը։",
        belgium: "Պայմանները, փաստաթղթերը և մեկնարկը հաստատվում են անձամբ։",
        noExperience: "առանց փորձի",
        pairs: "զույգեր",
        drivers: "վարորդներ",
        specialists: "մասնագետներ",
        open: "Ցույց տալ աշխատանքները"
      }
    };
    return { ...copy.en, ...(copy[i18n.locale] || {}) };
  }

  function honestFitCopy() {
    const copy = {
      ru: {
        kicker: "Честно перед откликом",
        title: "Кому это подходит — и кому лучше уточнить сразу",
        intro: "Так кандидат быстрее понимает ожидания, а в WhatsApp приходит более осознанный запрос.",
        goodTitle: "Подходит, если",
        carefulTitle: "Лучше уточнить сразу, если",
        good: [
          "готовы к физической работе и темпу на объекте",
          "понимаете, что ставки указаны брутто",
          "готовы уточнить оформление перед выездом",
          "хотите официальное оформление и понятный процесс"
        ],
        careful: [
          "нужна гарантия 250–280 часов без проверки объекта",
          "хотите точное нетто без расчёта по договору и условиям",
          "не готовы уточнять дату старта и жильё перед поездкой",
          "ожидаете отправку личных данных в случайный чат без проверки"
        ],
        cta: "Уточнить свою ситуацию"
      },
      uk: {
        kicker: "Чесно перед відгуком",
        title: "Кому це підходить — і що краще уточнити одразу",
        intro: "Кандидат швидше розуміє очікування, а в WhatsApp приходить більш свідомий запит.",
        goodTitle: "Підходить, якщо",
        carefulTitle: "Краще уточнити одразу, якщо",
        good: [
          "готові до фізичної роботи і темпу на об’єкті",
          "розумієте, що ставки вказані брутто",
          "готові уточнити оформлення перед виїздом",
          "хочете офіційне оформлення і зрозумілий процес"
        ],
        careful: [
          "потрібна гарантія 250–280 годин без перевірки об’єкта",
          "хочете точне нетто без розрахунку за договором і умовами",
          "не готові уточнювати дату старту і житло перед поїздкою",
          "очікуєте відправку особистих даних у випадковий чат без перевірки"
        ],
        cta: "Уточнити свою ситуацію"
      },
      pl: {
        kicker: "Uczciwie przed kontaktem",
        title: "Dla kogo to pasuje — i co warto od razu doprecyzować",
        intro: "Kandydat szybciej rozumie oczekiwania, a wiadomość w WhatsApp jest konkretniejsza.",
        goodTitle: "Pasuje, jeśli",
        carefulTitle: "Doprecyzuj od razu, jeśli",
        good: [
          "jesteś gotowy/a na pracę fizyczną i tempo na obiekcie",
          "rozumiesz, że stawki są podane brutto",
          "możesz doprecyzować formalności przed wyjazdem",
          "chcesz legalny proces i jasne kolejne kroki"
        ],
        careful: [
          "potrzebujesz gwarancji 250–280 godzin bez potwierdzenia obiektu",
          "chcesz dokładne netto bez kalkulacji umowy i warunków",
          "nie chcesz potwierdzać startu i zakwaterowania przed wyjazdem",
          "oczekujesz wysyłki danych osobowych do przypadkowego czatu"
        ],
        cta: "Dopytaj o swoją sytuację"
      },
      en: {
        kicker: "Honest before applying",
        title: "Who this fits — and what should be clarified first",
        intro: "Candidates understand expectations faster, and the WhatsApp request becomes more concrete.",
        goodTitle: "Good fit if",
        carefulTitle: "Clarify first if",
        good: [
          "you are ready for physical work and workplace pace",
          "you understand that rates are shown gross",
          "you can clarify paperwork before travelling",
          "you want legal work and a clear process"
        ],
        careful: [
          "you need a guaranteed 250–280 hours before the workplace is confirmed",
          "you need exact net pay without contract and condition calculation",
          "you do not want to confirm start date and housing before travel",
          "you expect to send personal data to a random chat without verification"
        ],
        cta: "Clarify my situation"
      }
    };
    return { ...copy.en, ...(copy[i18n.locale] || {}) };
  }

  function antiScamCopy() {
    const copy = {
      ru: {
        kicker: "Безопасность кандидата",
        title: "Перед личными данными проверьте контакт",
        intro: "Сайт помогает выбрать вакансию, но чувствительные данные и условия подтверждаются только в прямом контакте.",
        items: [
          { title: "Не переводите деньги", text: "Не отправляйте оплату неизвестным людям за “бронь” вакансии или жилья." },
          { title: "Не отправляйте банковские коды", text: "CVV, SMS-коды и пароли от банка никогда не нужны для трудоустройства." },
          { title: "Сверяйте номер", text: "Пишите через кнопки на этом сайте — так меньше риск попасть в чужой чат." },
          { title: "Условия подтверждаются", text: "Локация, дата старта, жильё, часы и оформление уточняются до поездки." }
        ],
        cta: "Проверить через WhatsApp"
      },
      uk: {
        kicker: "Безпека кандидата",
        title: "Перед особистими даними перевірте контакт",
        intro: "Сайт допомагає обрати вакансію, але чутливі дані й умови підтверджуються тільки в прямому контакті.",
        items: [
          { title: "Не переказуйте гроші", text: "Не надсилайте оплату невідомим людям за “бронь” вакансії або житла." },
          { title: "Не надсилайте банківські коди", text: "CVV, SMS-коди і паролі від банку ніколи не потрібні для працевлаштування." },
          { title: "Звіряйте номер", text: "Пишіть через кнопки на цьому сайті — так менший ризик потрапити в чужий чат." },
          { title: "Умови підтверджуються", text: "Локація, дата старту, житло, години й оформлення уточнюються до поїздки." }
        ],
        cta: "Перевірити через WhatsApp"
      },
      pl: {
        kicker: "Bezpieczeństwo kandydata",
        title: "Przed danymi osobowymi sprawdź kontakt",
        intro: "Strona pomaga wybrać ofertę, ale wrażliwe dane i warunki potwierdzamy tylko w bezpośrednim kontakcie.",
        items: [
          { title: "Nie przelewaj pieniędzy", text: "Nie płać obcym osobom za “rezerwację” pracy lub zakwaterowania." },
          { title: "Nie wysyłaj kodów bankowych", text: "CVV, kody SMS i hasła bankowe nigdy nie są potrzebne do zatrudnienia." },
          { title: "Sprawdź numer", text: "Pisz przez przyciski na tej stronie — zmniejsza to ryzyko fałszywego czatu." },
          { title: "Warunki są potwierdzane", text: "Lokalizacja, start, mieszkanie, godziny i formalności są sprawdzane przed wyjazdem." }
        ],
        cta: "Sprawdź przez WhatsApp"
      },
      en: {
        kicker: "Candidate safety",
        title: "Check the contact before personal data",
        intro: "The site helps you choose a job, but sensitive data and conditions are confirmed only in direct contact.",
        items: [
          { title: "Do not send money", text: "Do not pay unknown people for a job or housing “reservation”." },
          { title: "Do not send bank codes", text: "CVV, SMS codes and bank passwords are never needed for employment." },
          { title: "Check the number", text: "Use the buttons on this site to reduce the risk of a fake chat." },
          { title: "Conditions are confirmed", text: "Location, start date, housing, hours and paperwork are checked before travel." }
        ],
        cta: "Verify via WhatsApp"
      }
    };
    return { ...copy.en, ...(copy[i18n.locale] || {}) };
  }

  function renderAntiScam() {
    const container = el("anti-scam-grid");
    if (!container) return;
    const copy = antiScamCopy();
    if (el("anti-scam-kicker")) el("anti-scam-kicker").textContent = copy.kicker;
    if (el("anti-scam-heading")) el("anti-scam-heading").textContent = copy.title;
    if (el("anti-scam-intro")) el("anti-scam-intro").textContent = copy.intro;
    container.innerHTML = copy.items.map((item, index) => `
      <article class="anti-scam-card">
        <span aria-hidden="true">${index + 1}</span>
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.text)}</p>
      </article>
    `).join("") + `
      <a class="button button-whatsapp anti-scam-cta" href="${escapeHTML(profile.whatsapp || "#")}" target="_blank" rel="noopener noreferrer">
        ${escapeHTML(copy.cta)}
      </a>
    `;
  }

  function renderHonestFit() {
    const container = el("honest-fit-grid");
    if (!container) return;
    const copy = honestFitCopy();
    if (el("honest-fit-kicker")) el("honest-fit-kicker").textContent = copy.kicker;
    if (el("honest-fit-heading")) el("honest-fit-heading").textContent = copy.title;
    if (el("honest-fit-intro")) el("honest-fit-intro").textContent = copy.intro;
    const columns = [
      { type: "good", title: copy.goodTitle, items: copy.good },
      { type: "careful", title: copy.carefulTitle, items: copy.careful }
    ];
    container.innerHTML = columns.map((column) => `
      <article class="honest-fit-card honest-fit-${escapeHTML(column.type)}">
        <span class="honest-fit-icon" aria-hidden="true">${column.type === "good" ? "✓" : "!"}</span>
        <h3>${escapeHTML(column.title)}</h3>
        <ul>${column.items.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
      </article>
    `).join("") + `
      <button class="button button-primary honest-fit-cta" type="button" data-application-general>${escapeHTML(copy.cta)}</button>
    `;
  }

  function countryFilterValue(country) {
    if (country === "Польша") return "country:poland";
    if (country === "Венгрия") return "country:hungary";
    if (country === "Бельгия") return "country:belgium";
    return "country:other";
  }

  function countryCode(country) {
    if (country === "Польша") return "PL";
    if (country === "Венгрия") return "HU";
    if (country === "Бельгия") return "BE";
    return "";
  }

  function minSalaryLabel(countryJobs) {
    const salaries = countryJobs
      .map((job) => job.salary?.min)
      .filter((value) => Number.isFinite(Number(value)))
      .map(Number);
    if (!salaries.length) return "";
    const min = Math.min(...salaries);
    const currency = countryJobs.find((job) => Number(job.salary?.min) === min)?.salary?.currency || "";
    return `${min.toLocaleString(i18n.localeTag(), { minimumFractionDigits: min % 1 ? 1 : 0, maximumFractionDigits: 2 })} ${currency}`;
  }

  function renderCountryExplorer() {
    const container = el("country-explorer-grid");
    if (!container) return;
    const copy = countryExplorerCopy();
    if (el("country-explorer-kicker")) el("country-explorer-kicker").textContent = copy.kicker;
    if (el("country-explorer-heading")) el("country-explorer-heading").textContent = copy.title;
    if (el("country-explorer-intro")) el("country-explorer-intro").textContent = copy.intro;
    const countryNotes = {
      "Польша": copy.poland,
      "Венгрия": copy.hungary,
      "Бельгия": copy.belgium
    };
    const countryOrder = ["Польша", "Венгрия", "Бельгия"];
    container.innerHTML = countryOrder.map((country) => {
      const countryJobs = jobs.filter((job) => job.format === country);
      const code = countryCode(country);
      const roles = [];
      if (countryJobs.some((job) => job.level === "Без опыта")) roles.push(copy.noExperience);
      if (countryJobs.some((job) => (job.candidates || []).some((candidate) => candidate.toLowerCase().includes("пар")))) roles.push(copy.pairs);
      if (countryJobs.some((job) => job.id.startsWith("driver-") || job.category === "Транспорт")) roles.push(copy.drivers);
      if (roles.length < 3 && countryJobs.some((job) => job.level !== "Без опыта")) roles.push(copy.specialists);
      const filter = countryFilterValue(country);
      const active = state.quickFilter === filter;
      return `
        <article class="country-card${active ? " active" : ""}" data-country-card="${escapeHTML(code)}">
          <div class="country-card-top">
            <span class="country-code">${escapeHTML(code)}</span>
            <span class="country-count">${countryJobs.length} ${escapeHTML(copy.jobs)}</span>
          </div>
          <h3>${escapeHTML(i18n.countryName(code) || country)}</h3>
          <p>${escapeHTML(countryNotes[country])}</p>
          <div class="country-card-meta">
            <span>${escapeHTML(copy.from)} <strong>${escapeHTML(minSalaryLabel(countryJobs))}</strong> ${escapeHTML(copy.gross)}</span>
            <span>${escapeHTML(copy.housing)}</span>
          </div>
          <div class="country-card-tags">
            ${roles.slice(0, 3).map((role) => `<span>${escapeHTML(role)}</span>`).join("")}
          </div>
          <button class="button button-secondary country-card-action" type="button" data-quick-filter="${escapeHTML(filter)}">
            ${escapeHTML(copy.open)}
          </button>
        </article>
      `;
    }).join("");
  }

  function quickShareCopy() {
    const copy = {
      ru: {
        kicker: "Готовые ссылки",
        title: "Отправляйте сразу нужный сценарий",
        intro: "Это короткие ссылки для кандидатов из разных стран: человек открывает уже нужный язык, страну или тип вакансии.",
        open: "Открыть",
        copy: "Скопировать",
        copied: "Ссылка скопирована",
        forWhom: "Кому отправлять",
        links: [
          ["Украина → Польша", "Кандидатам из Украины, которым проще читать на украинском и нужен быстрый старт в Польше.", { lang: "uk", country: "poland" }],
          ["Без опыта", "Людям, которые впервые едут на работу и боятся сложных требований.", { lang: "ru", filter: "noExperience" }],
          ["Водители", "Кандидатам с правами и опытом вождения, которым важны транспортные вакансии.", { lang: "ru", filter: "driver" }],
          ["Теплицы", "Тем, кто готов к работе с растениями, сбором, уходом и сменами в теплицах.", { lang: "ru", filter: "greenhouse" }],
          ["Склады", "Кандидатам, которые ищут склад, упаковку, комплектацию или похожую физическую работу.", { lang: "ru", filter: "warehouse" }],
          ["Польский язык", "Кандидатам, которые живут в Польше или читают по-польски.", { lang: "pl", country: "poland" }],
          ["English", "Кандидатам из стран, где удобнее начать на английском языке.", { lang: "en", country: "poland" }]
        ]
      },
      uk: {
        kicker: "Готові посилання",
        title: "Надсилайте одразу потрібний сценарій",
        intro: "Короткі посилання відкривають потрібну мову, країну або тип вакансії.",
        open: "Відкрити",
        copy: "Скопіювати",
        copied: "Посилання скопійовано",
        forWhom: "Кому надсилати",
        links: [
          ["Україна → Польща", "Кандидатам з України, яким зручніше читати українською.", { lang: "uk", country: "poland" }],
          ["Без досвіду", "Людям, які їдуть вперше і хочуть простий старт.", { lang: "uk", filter: "noExperience" }],
          ["Водії", "Кандидатам з правами та досвідом водіння.", { lang: "uk", filter: "driver" }],
          ["Теплиці", "Для роботи з рослинами, збором і доглядом.", { lang: "uk", filter: "greenhouse" }],
          ["Склади", "Для складу, пакування та комплектації.", { lang: "uk", filter: "warehouse" }],
          ["Polski", "Кандидатам, яким зручна польська мова.", { lang: "pl", country: "poland" }],
          ["English", "Кандидатам, яким зручніше почати англійською.", { lang: "en", country: "poland" }]
        ]
      },
      pl: {
        kicker: "Gotowe linki",
        title: "Wyślij od razu właściwy scenariusz",
        intro: "Krótkie linki otwierają właściwy język, kraj albo typ pracy.",
        open: "Otwórz",
        copy: "Kopiuj",
        copied: "Link skopiowany",
        forWhom: "Dla kogo",
        links: [
          ["Ukraina → Polska", "Dla kandydatów z Ukrainy, którzy wolą język ukraiński.", { lang: "uk", country: "poland" }],
          ["Bez doświadczenia", "Dla osób, które zaczynają pierwszy raz.", { lang: "pl", filter: "noExperience" }],
          ["Kierowcy", "Dla kandydatów z prawem jazdy i doświadczeniem.", { lang: "pl", filter: "driver" }],
          ["Szklarnie", "Dla osób zainteresowanych pracą przy roślinach.", { lang: "pl", filter: "greenhouse" }],
          ["Magazyny", "Dla kandydatów na pakowanie, kompletację i magazyn.", { lang: "pl", filter: "warehouse" }],
          ["Polska", "Dla kandydatów, którzy chcą zobaczyć oferty w Polsce.", { lang: "pl", country: "poland" }],
          ["English", "Dla kandydatów, którym łatwiej zacząć po angielsku.", { lang: "en", country: "poland" }]
        ]
      },
      en: {
        kicker: "Ready links",
        title: "Send the right scenario immediately",
        intro: "Short links open the right language, country, or vacancy type for the candidate.",
        open: "Open",
        copy: "Copy",
        copied: "Link copied",
        forWhom: "Best for",
        links: [
          ["Ukraine → Poland", "For Ukrainian candidates who prefer Ukrainian language.", { lang: "uk", country: "poland" }],
          ["No experience", "For candidates starting their first job abroad.", { lang: "en", filter: "noExperience" }],
          ["Drivers", "For candidates with driving experience.", { lang: "en", filter: "driver" }],
          ["Greenhouses", "For candidates ready for plant and greenhouse work.", { lang: "en", filter: "greenhouse" }],
          ["Warehouses", "For packing, picking and warehouse work.", { lang: "en", filter: "warehouse" }],
          ["Polish language", "For candidates who live in Poland or read Polish.", { lang: "pl", country: "poland" }],
          ["English", "For international candidates who prefer English.", { lang: "en", country: "poland" }]
        ]
      }
    };
    return copy[i18n.locale] || copy.en;
  }

  function shareUrl(params = {}) {
    const base = new URL(site.baseUrl || window.location.href, window.location.href);
    base.search = "";
    base.hash = "";
    Object.entries(params).forEach(([key, value]) => {
      if (value) base.searchParams.set(key, value);
    });
    return base.toString();
  }

  function renderQuickShareLinks() {
    const container = el("quick-share-grid");
    if (!container) return;
    const copy = quickShareCopy();
    if (el("quick-share-kicker")) el("quick-share-kicker").textContent = copy.kicker;
    if (el("quick-share-heading")) el("quick-share-heading").textContent = copy.title;
    if (el("quick-share-intro")) el("quick-share-intro").textContent = copy.intro;
    container.innerHTML = copy.links.map(([title, text, params]) => {
      const url = shareUrl(params);
      const shortUrl = url.replace(/^https?:\/\//, "");
      return `
        <article class="quick-share-card">
          <div>
            <span class="quick-share-label">${escapeHTML(copy.forWhom)}</span>
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(text)}</p>
          </div>
          <code>${escapeHTML(shortUrl)}</code>
          <div class="quick-share-actions">
            <a class="button button-primary" href="${escapeHTML(url)}">${escapeHTML(copy.open)}</a>
            <button class="button button-secondary" type="button" data-copy-link="${escapeHTML(url)}">${escapeHTML(copy.copy)}</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function countryComparisonCopy() {
    const copy = {
      ru: {
        kicker: "Сравнение стран",
        title: "Польша, Венгрия или Бельгия?",
        intro: "Кандидату легче доверять, когда он сразу понимает разницу: где больше вакансий, где проще старт и что нужно уточнить лично.",
        jobs: "вакансий",
        bestFor: "Лучше подходит",
        start: "Старт",
        documents: "Оформление",
        ask: "Что уточнить",
        open: "Смотреть вакансии",
        items: {
          poland: ["Самый широкий выбор", "Много вариантов без опыта", "Чаще всего понятный процесс", "Город, смены, жильё и дату выезда"],
          hungary: ["Тем, кому важна конкретная страна", "Условия проверяем перед отправкой", "Оформление уточняется отдельно", "Оформление, жильё и актуальный старт"],
          belgium: ["Кандидатам под отдельные условия", "Нужна личная проверка деталей", "Процесс отличается от Польши", "Требования, ставка и доступные места"]
        }
      },
      uk: {
        kicker: "Порівняння країн",
        title: "Польща, Угорщина чи Бельгія?",
        intro: "Кандидату легше довіряти, коли різниця між напрямками зрозуміла одразу.",
        jobs: "вакансій",
        bestFor: "Краще підходить",
        start: "Старт",
        documents: "Оформлення",
        ask: "Що уточнити",
        open: "Дивитися вакансії",
        items: {
          poland: ["Найширший вибір", "Багато варіантів без досвіду", "Зазвичай зрозумілий процес", "Місто, зміни, житло і дату виїзду"],
          hungary: ["Тим, кому важлива конкретна країна", "Умови перевіряємо перед відправкою", "Оформлення уточнюється окремо", "Оформлення, житло і актуальний старт"],
          belgium: ["Кандидатам під окремі умови", "Потрібна особиста перевірка деталей", "Процес відрізняється від Польщі", "Вимоги, ставка і доступні місця"]
        }
      },
      pl: {
        kicker: "Porównanie krajów",
        title: "Polska, Węgry czy Belgia?",
        intro: "Kandydat szybciej ufa stronie, gdy od razu widzi różnicę między kierunkami.",
        jobs: "ofert",
        bestFor: "Najlepsze dla",
        start: "Start",
        documents: "Formalności",
        ask: "Co potwierdzić",
        open: "Zobacz oferty",
        items: {
          poland: ["Największy wybór", "Dużo opcji bez doświadczenia", "Najczęściej prosty proces", "Miasto, zmiany, zakwaterowanie i datę wyjazdu"],
          hungary: ["Dla osób z konkretnym kierunkiem", "Warunki potwierdzamy przed wysłaniem", "Formalności osobno do sprawdzenia", "Formalności, mieszkanie i aktualny start"],
          belgium: ["Dla kandydatów pod osobne warunki", "Wymaga osobistego sprawdzenia", "Proces inny niż w Polsce", "Wymagania, stawkę i dostępne miejsca"]
        }
      },
      en: {
        kicker: "Country comparison",
        title: "Poland, Hungary or Belgium?",
        intro: "Candidates trust the offer faster when they immediately understand the difference between directions.",
        jobs: "jobs",
        bestFor: "Best for",
        start: "Start",
        documents: "Paperwork",
        ask: "What to confirm",
        open: "View jobs",
        items: {
          poland: ["Widest choice", "Many no-experience options", "Usually the clearest process", "City, shifts, housing and departure date"],
          hungary: ["People focused on this country", "Conditions are checked before sending", "Paperwork is confirmed separately", "Paperwork, housing and current start"],
          belgium: ["Candidates for special conditions", "Details need personal verification", "Process differs from Poland", "Requirements, rate and available places"]
        }
      }
    };
    return copy[i18n.locale] || copy.en;
  }

  function renderCountryComparison() {
    const container = el("country-compare-grid");
    if (!container) return;
    const copy = countryComparisonCopy();
    if (el("country-compare-kicker")) el("country-compare-kicker").textContent = copy.kicker;
    if (el("country-compare-heading")) el("country-compare-heading").textContent = copy.title;
    if (el("country-compare-intro")) el("country-compare-intro").textContent = copy.intro;
    const items = [
      ["poland", "PL", "Польша"],
      ["hungary", "HU", "Венгрия"],
      ["belgium", "BE", "Бельгия"]
    ];
    container.innerHTML = items.map(([key, code, format]) => {
      const countryJobs = jobs.filter((job) => job.format === format);
      const details = copy.items[key];
      const filter = countryFilterValue(format);
      return `
        <article class="country-compare-card">
          <div class="country-compare-title">
            <span class="country-code">${escapeHTML(code)}</span>
            <div>
              <h3>${escapeHTML(i18n.countryName(code) || format)}</h3>
              <p>${countryJobs.length} ${escapeHTML(copy.jobs)}</p>
            </div>
          </div>
          <dl>
            <div><dt>${escapeHTML(copy.bestFor)}</dt><dd>${escapeHTML(details[0])}</dd></div>
            <div><dt>${escapeHTML(copy.start)}</dt><dd>${escapeHTML(details[1])}</dd></div>
            <div><dt>${escapeHTML(copy.documents)}</dt><dd>${escapeHTML(details[2])}</dd></div>
            <div><dt>${escapeHTML(copy.ask)}</dt><dd>${escapeHTML(details[3])}</dd></div>
          </dl>
          <button class="button button-secondary country-compare-action" type="button" data-quick-filter="${escapeHTML(filter)}">
            ${escapeHTML(copy.open)}
          </button>
        </article>
      `;
    }).join("");
  }

  function instantChoiceButton(group, value, label) {
    const active = state.instantMatch[group] === value;
    return `<button class="instant-choice${active ? " active" : ""}" type="button" data-instant-choice="${escapeHTML(group)}:${escapeHTML(value)}" aria-pressed="${active}">${escapeHTML(label)}</button>`;
  }

  function instantMatchScore(job) {
    const { current, country, experience, area, people, start } = state.instantMatch;
    let score = 0;
    if (country === "any") score += 1;
    else if (country === "poland" && job.format === "Польша") score += 8;
    else if (country === "other" && job.format !== "Польша") score += 8;
    else score -= 4;

    if (experience === "any") score += 1;
    else if (experience === "none" && job.level === "Без опыта") score += 7;
    else if (experience === "experienced" && job.level !== "Без опыта") score += 7;
    else if (experience === "experienced") score += 2;

    if (area === "any") score += 1;
    else if (area === "greenhouse" && job.category === "Теплицы") score += 7;
    else if (area === "warehouse" && job.category === "Склад") score += 7;
    else if (area === "transport" && (job.id.startsWith("driver-") || job.category === "Водители")) score += 9;
    else score -= 2;

    if (people === "couple" && (job.candidates || []).some((candidate) => candidate.toLowerCase().includes("пар"))) score += 4;
    if (people === "group" && job.places && job.places >= 3) score += 2;
    if (start === "soon" && job.featured) score += 2;
    if (start === "later") score += 1;
    if (current === "eu" && job.format === "Польша") score += 1;
    if (current === "ukraine" && job.format === "Польша") score += 1;

    if (["open", "verify"].includes(job.status)) score += 2;
    if (job.featured) score += 1;
    return score;
  }

  function instantMatches() {
    return jobs
      .map((job) => ({ job, score: instantMatchScore(job) }))
      .sort((a, b) => b.score - a.score || new Date(b.job.updatedAt) - new Date(a.job.updatedAt))
      .slice(0, 3)
      .map((item) => item.job);
  }

  function instantJobBadge(job, index) {
    const copy = instantMatchCopy();
    if (state.instantMatch.area === "transport" || job.id.startsWith("driver-") || job.category === "Транспорт") return copy.badgeDriver;
    if (state.instantMatch.experience === "none" || job.level === "Без опыта") return copy.badgeNoExperience;
    if ((state.instantMatch.country === "poland" && job.format === "Польша") || (state.instantMatch.country === "other" && job.format !== "Польша")) return copy.badgeCountry;
    if (index === 0) return copy.badgeBest;
    if (job.featured) return copy.badgeStable;
    return copy.badgeHours;
  }

  function instantJobReasons(job) {
    const copy = instantMatchCopy();
    const reasons = [];
    if ((state.instantMatch.country === "poland" && job.format === "Польша") || (state.instantMatch.country === "other" && job.format !== "Польша")) {
      reasons.push(copy.whyCountry);
    }
    if (state.instantMatch.experience === "none" || job.level === "Без опыта") reasons.push(copy.whyNoExperience);
    if (state.instantMatch.experience === "experienced" && job.level !== "Без опыта") reasons.push(copy.whyExperience);
    if (state.instantMatch.area === "greenhouse" && job.category === "Теплицы") reasons.push(copy.whyGreenhouse);
    if (state.instantMatch.area === "warehouse" && job.category === "Склад") reasons.push(copy.whyWarehouse);
    if (state.instantMatch.area === "transport" && (job.id.startsWith("driver-") || job.category === "Транспорт")) reasons.push(copy.whyDriver);
    if (!reasons.length && job.featured) reasons.push(copy.whyFeatured);
    if (!reasons.length) reasons.push(copy.badgeStable);
    return reasons.slice(0, 2);
  }

  function instantChoiceLabel(group, value) {
    const copy = instantMatchCopy();
    const labels = {
      current: {
        any: copy.any,
        eu: copy.currentEu,
        ukraine: copy.currentUkraine,
        other: copy.currentOther
      },
      country: {
        any: copy.any,
        poland: copy.poland,
        other: copy.other
      },
      experience: {
        any: copy.any,
        none: copy.noExperience,
        experienced: copy.experienced
      },
      area: {
        any: copy.any,
        greenhouse: copy.greenhouse,
        warehouse: copy.warehouse,
        transport: copy.transport
      },
      people: {
        any: copy.any,
        solo: copy.solo,
        couple: copy.couple,
        group: copy.group
      },
      start: {
        any: copy.any,
        soon: copy.soon,
        month: copy.month,
        later: copy.later
      }
    };
    return labels[group]?.[value] || value;
  }

  function cleanText(value) {
    const container = document.createElement("span");
    container.innerHTML = String(value || "");
    return container.textContent.replace(/\s+/g, " ").trim();
  }

  function messageLabel(value) {
    return String(value || "").replace(/[?:؟¿]+$/u, "").trim();
  }

  function instantMatchMessage() {
    const copy = instantMatchCopy();
    const matches = instantMatches();
    const currentUrl = new URL(window.location.href);
    currentUrl.hash = "";
    const answers = [
      `${messageLabel(copy.current)}: ${instantChoiceLabel("current", state.instantMatch.current)}`,
      `${messageLabel(copy.country)}: ${instantChoiceLabel("country", state.instantMatch.country)}`,
      `${messageLabel(copy.experience)}: ${instantChoiceLabel("experience", state.instantMatch.experience)}`,
      `${messageLabel(copy.area)}: ${instantChoiceLabel("area", state.instantMatch.area)}`,
      `${messageLabel(copy.people)}: ${instantChoiceLabel("people", state.instantMatch.people)}`,
      `${messageLabel(copy.start)}: ${instantChoiceLabel("start", state.instantMatch.start)}`
    ];
    const suggestedJobs = matches.map((job, index) => {
      const view = localizedJob(job);
      const salary = cleanText(formatSalary(view.salary));
      return `${index + 1}. ${view.title} (${job.id}) · ${view.format} · ${salary}`;
    });
    return [
      copy.messageTitle,
      copy.messageIntro,
      "",
      `${copy.messageAnswers}:`,
      ...answers,
      "",
      `${copy.messageJobs}:`,
      ...suggestedJobs,
      "",
      `${copy.messageLanguage}: ${i18n.languageName(i18n.locale)} (${i18n.locale})`,
      `${copy.messageLink}: ${currentUrl.toString()}`,
      "",
      copy.note
    ].join("\n");
  }

  function instantMatchPreview(matches) {
    const copy = instantMatchCopy();
    const answers = [
      [messageLabel(copy.current), instantChoiceLabel("current", state.instantMatch.current)],
      [messageLabel(copy.country), instantChoiceLabel("country", state.instantMatch.country)],
      [messageLabel(copy.experience), instantChoiceLabel("experience", state.instantMatch.experience)],
      [messageLabel(copy.area), instantChoiceLabel("area", state.instantMatch.area)],
      [messageLabel(copy.people), instantChoiceLabel("people", state.instantMatch.people)],
      [messageLabel(copy.start), instantChoiceLabel("start", state.instantMatch.start)]
    ];
    const jobTitles = matches.slice(0, 2).map((job) => localizedJob(job).title);
    return `
      <aside class="instant-whatsapp-preview" aria-label="${escapeHTML(copy.previewTitle)}">
        <div>
          <strong>${escapeHTML(copy.previewTitle)}</strong>
          <span>${escapeHTML(copy.previewLanguage)}: ${escapeHTML(i18n.languageName(i18n.locale))}</span>
        </div>
        <dl>
          ${answers.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("")}
          <div><dt>${escapeHTML(copy.previewJobs)}</dt><dd>${matches.length} · ${jobTitles.map(escapeHTML).join(" / ")}</dd></div>
        </dl>
      </aside>
    `;
  }

  function openInstantMatchWhatsApp() {
    const fallbackPhone = String(profile.phone || "").replace(/\D/g, "");
    const whatsappUrl = profile.whatsapp || `https://wa.me/${fallbackPhone}`;
    const separator = whatsappUrl.includes("?") ? "&" : "?";
    openWhatsAppSafety(`${whatsappUrl}${separator}text=${encodeURIComponent(instantMatchMessage())}`);
  }

  function whatsappScriptCopy() {
    const copy = {
      en: {
        kicker: "Fast WhatsApp",
        title: "Not sure what to write?",
        intro: "Choose a ready message — WhatsApp opens with clear details for the recruiter.",
        action: "Open WhatsApp",
        items: [
          ["ukraine-poland", "I am from Ukraine", "I want work in Poland and need help choosing the right job.", "Hello! I am from Ukraine. I want to work in Poland. Please help me choose a suitable job. I can write my name, age and when I can travel."],
          ["no-experience", "I have no experience", "For candidates who need a simple start and training.", "Hello! I am looking for a job without experience. Please send me options where training is possible. I can provide my age, country and start date."],
          ["couple", "We are a couple", "Useful when housing and two places must be checked together.", "Hello! We are a couple and want to work together. Please check jobs with housing and two places. We can send our age and possible start date."],
          ["driver", "I am a driver", "For candidates with a driving licence or transport experience.", "Hello! I am interested in driver jobs. I can send my licence categories, experience and when I am ready to start."],
          ["housing", "I need housing details", "For candidates who first want to understand accommodation.", "Hello! I want to clarify housing before choosing a job. Please tell me what options are available and what should be checked before departure."],
          ["start", "Nearest start date", "For candidates ready to move quickly.", "Hello! I am ready to start soon. Please tell me which jobs have the nearest available start date and what should be clarified before departure."]
        ]
      },
      ru: {
        kicker: "Быстрый WhatsApp",
        title: "Не знаете, что написать?",
        intro: "Выберите готовый вариант — WhatsApp откроется с понятным сообщением для рекрутера.",
        action: "Открыть WhatsApp",
        items: [
          ["ukraine-poland", "Я из Украины", "Хочу работу в Польше и помощь с выбором вакансии.", "Здравствуйте! Я из Украины. Хочу работать в Польше. Помогите, пожалуйста, подобрать подходящую вакансию. Могу написать имя, возраст и когда готов(а) выехать."],
          ["no-experience", "Я без опыта", "Для кандидатов, которым нужен простой старт и обучение.", "Здравствуйте! Я ищу работу без опыта. Подскажите, пожалуйста, варианты, где можно начать с обучением. Могу написать возраст, страну и дату старта."],
          ["couple", "Мы пара", "Когда нужно сразу проверить жильё и два места.", "Здравствуйте! Мы пара и хотим работать вместе. Проверьте, пожалуйста, вакансии с жильём и двумя местами. Можем отправить возраст и когда готовы начать."],
          ["driver", "Я водитель", "Для кандидатов с правами или опытом вождения.", "Здравствуйте! Меня интересуют вакансии для водителей. Могу отправить категории прав, опыт и когда готов(а) начать."],
          ["housing", "Хочу уточнить жильё", "Когда сначала важно понять условия проживания.", "Здравствуйте! Хочу уточнить жильё перед выбором вакансии. Расскажите, пожалуйста, какие есть варианты и что нужно проверить до выезда."],
          ["start", "Ближайший старт", "Для кандидатов, которые готовы выехать быстро.", "Здравствуйте! Я готов(а) начать в ближайшее время. Подскажите, пожалуйста, какие вакансии сейчас имеют ближайший старт и что нужно уточнить до выезда."]
        ]
      },
      uk: {
        kicker: "Швидкий WhatsApp",
        title: "Не знаєте, що написати?",
        intro: "Оберіть готовий варіант — WhatsApp відкриється зі зрозумілим повідомленням.",
        action: "Відкрити WhatsApp",
        items: [
          ["ukraine-poland", "Я з України", "Хочу роботу в Польщі та допомогу з вибором вакансії.", "Вітаю! Я з України. Хочу працювати в Польщі. Допоможіть, будь ласка, підібрати відповідну вакансію. Можу написати ім’я, вік і коли готовий/готова виїхати."],
          ["no-experience", "Я без досвіду", "Для кандидатів, яким потрібен простий старт.", "Вітаю! Я шукаю роботу без досвіду. Підкажіть, будь ласка, варіанти, де можна почати з навчанням. Можу написати вік, країну і дату старту."],
          ["couple", "Ми пара", "Коли треба перевірити житло і два місця.", "Вітаю! Ми пара і хочемо працювати разом. Перевірте, будь ласка, вакансії з житлом і двома місцями. Можемо надіслати вік і коли готові почати."],
          ["driver", "Я водій", "Для кандидатів з правами або досвідом водіння.", "Вітаю! Мене цікавлять вакансії для водіїв. Можу надіслати категорії прав, досвід і коли готовий/готова почати."],
          ["housing", "Хочу уточнити житло", "Коли спочатку важливо зрозуміти проживання.", "Вітаю! Хочу уточнити житло перед вибором вакансії. Розкажіть, будь ласка, які є варіанти і що треба перевірити до виїзду."],
          ["start", "Найближчий старт", "Для кандидатів, які готові швидко виїхати.", "Вітаю! Я готовий/готова почати найближчим часом. Підкажіть, будь ласка, які вакансії зараз мають найближчий старт і що треба уточнити до виїзду."]
        ]
      },
      pl: {
        kicker: "Szybki WhatsApp",
        title: "Nie wiesz, co napisać?",
        intro: "Wybierz gotową wiadomość — WhatsApp otworzy się z jasnym tekstem do rekrutera.",
        action: "Otwórz WhatsApp",
        items: [
          ["ukraine-poland", "Jestem z Ukrainy", "Chcę pracować w Polsce i potrzebuję pomocy w wyborze.", "Dzień dobry! Jestem z Ukrainy. Chcę pracować w Polsce. Proszę pomóc mi wybrać odpowiednią ofertę. Mogę podać imię, wiek i termin wyjazdu."],
          ["no-experience", "Bez doświadczenia", "Dla osób, które chcą zacząć z przyuczeniem.", "Dzień dobry! Szukam pracy bez doświadczenia. Proszę o opcje, gdzie możliwe jest przyuczenie. Mogę podać wiek, kraj i termin startu."],
          ["couple", "Jedziemy jako para", "Gdy trzeba sprawdzić dwa miejsca i zakwaterowanie.", "Dzień dobry! Jesteśmy parą i chcemy pracować razem. Proszę sprawdzić oferty z zakwaterowaniem i dwoma miejscami. Możemy wysłać wiek i termin startu."],
          ["driver", "Jestem kierowcą", "Dla kandydatów z prawem jazdy lub doświadczeniem.", "Dzień dobry! Interesują mnie oferty dla kierowców. Mogę podać kategorie prawa jazdy, doświadczenie i termin startu."],
          ["housing", "Chcę zapytać o mieszkanie", "Gdy najpierw trzeba zrozumieć zakwaterowanie.", "Dzień dobry! Chcę wyjaśnić zakwaterowanie przed wyborem pracy. Proszę powiedzieć, jakie są opcje i co trzeba sprawdzić przed wyjazdem."],
          ["start", "Najbliższy start", "Dla osób gotowych zacząć szybko.", "Dzień dobry! Mogę zacząć w najbliższym czasie. Proszę powiedzieć, które oferty mają teraz najbliższy start i co trzeba wyjaśnić przed wyjazdem."]
        ]
      }
    };
    return copy[i18n.locale] || copy.en;
  }

  function openScenarioWhatsApp(message) {
    const fallbackPhone = String(profile.phone || "").replace(/\D/g, "");
    const whatsappUrl = profile.whatsapp || `https://wa.me/${fallbackPhone}`;
    const separator = whatsappUrl.includes("?") ? "&" : "?";
    openWhatsAppSafety(`${whatsappUrl}${separator}text=${encodeURIComponent(message)}`);
  }

  function renderWhatsAppScripts() {
    const container = el("whatsapp-scripts-grid");
    if (!container) return;
    const copy = whatsappScriptCopy();
    if (el("whatsapp-scripts-kicker")) el("whatsapp-scripts-kicker").textContent = copy.kicker;
    if (el("whatsapp-scripts-heading")) el("whatsapp-scripts-heading").textContent = copy.title;
    if (el("whatsapp-scripts-intro")) el("whatsapp-scripts-intro").textContent = copy.intro;
    container.innerHTML = copy.items.map(([id, title, text, message]) => `
      <article class="whatsapp-script-card">
        <span class="whatsapp-script-icon">${svgIcon(id === "driver" ? "truck" : id === "housing" ? "home" : "whatsapp")}</span>
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(text)}</p>
        <button class="button button-whatsapp" type="button" data-scenario-whatsapp="${escapeHTML(id)}">${escapeHTML(copy.action)}</button>
      </article>
    `).join("");
    container.dataset.messages = JSON.stringify(Object.fromEntries(copy.items.map(([id, , , message]) => [id, message])));
  }

  function candidatePrepCopy() {
    const copy = {
      en: {
        kicker: "Before messaging",
        title: "What the candidate should prepare",
        intro: "This makes WhatsApp faster and safer: enough context for the recruiter, no sensitive document photos in the first message.",
        cards: [
          ["Write in Latin letters", ["Full name", "Country and city now", "Preferred language", "Phone number with country code"]],
          ["Tell the work situation", ["Wanted country", "Experience or no experience", "Driver licence categories if relevant", "Alone, couple or group"]],
          ["Confirm timing", ["When ready to leave or start", "Whether housing is needed", "Whether work paperwork needs clarification", "Which job looks interesting"]],
          ["Do not send first", ["Passport photos", "Bank card details", "Personal codes", "Payments or deposits before conditions are confirmed"]]
        ]
      },
      ru: {
        kicker: "Перед сообщением",
        title: "Что подготовить кандидату",
        intro: "Так WhatsApp будет быстрее и безопаснее: рекрутер получает контекст, а документы не уходят в первом сообщении.",
        cards: [
          ["Писать латиницей", ["Имя и фамилия", "Страна и город сейчас", "Удобный язык общения", "Телефон с кодом страны"]],
          ["Описать ситуацию", ["Желаемая страна", "Есть опыт или нет", "Категории прав, если водитель", "Один / пара / группа"]],
          ["Уточнить сроки", ["Когда готовы выехать или начать", "Нужно ли жильё", "Нужно ли уточнить оформление", "Какая вакансия интересна"]],
          ["Не отправлять сразу", ["Фото паспорта", "Данные банковской карты", "Личные коды", "Оплаты или залоги до подтверждения условий"]]
        ]
      },
      uk: {
        kicker: "Перед повідомленням",
        title: "Що підготувати кандидату",
        intro: "Так WhatsApp буде швидшим і безпечнішим: рекрутер отримує контекст, а документи не надсилаються у першому повідомленні.",
        cards: [
          ["Писати латиницею", ["Ім’я та прізвище", "Країна і місто зараз", "Зручна мова спілкування", "Телефон з кодом країни"]],
          ["Описати ситуацію", ["Бажана країна", "Є досвід чи немає", "Категорії прав, якщо водій", "Один / пара / група"]],
          ["Уточнити строки", ["Коли готові виїхати або почати", "Чи потрібне житло", "Чи треба уточнити оформлення", "Яка вакансія цікава"]],
          ["Не надсилати одразу", ["Фото паспорта", "Дані банківської картки", "Особисті коди", "Оплати або завдатки до підтвердження умов"]]
        ]
      },
      pl: {
        kicker: "Przed wiadomością",
        title: "Co kandydat powinien przygotować",
        intro: "Dzięki temu WhatsApp jest szybszy i bezpieczniejszy: rekruter ma kontekst, a dokumenty nie trafiają w pierwszej wiadomości.",
        cards: [
          ["Pisz alfabetem łacińskim", ["Imię i nazwisko", "Kraj i miasto teraz", "Wygodny język kontaktu", "Telefon z kodem kraju"]],
          ["Opisz sytuację", ["Preferowany kraj", "Doświadczenie lub jego brak", "Kategorie prawa jazdy, jeśli dotyczy", "Sam / para / grupa"]],
          ["Potwierdź termin", ["Kiedy możesz wyjechać lub zacząć", "Czy potrzebne jest mieszkanie", "Czy formalności trzeba wyjaśnić", "Która oferta jest interesująca"]],
          ["Nie wysyłaj od razu", ["Zdjęć paszportu", "Danych karty bankowej", "Kodów osobistych", "Opłat ani zaliczek przed potwierdzeniem warunków"]]
        ]
      }
    };
    return copy[i18n.locale] || copy.en;
  }

  function renderCandidatePrep() {
    const container = el("candidate-prep-grid");
    if (!container) return;
    const copy = candidatePrepCopy();
    if (el("candidate-prep-kicker")) el("candidate-prep-kicker").textContent = copy.kicker;
    if (el("candidate-prep-heading")) el("candidate-prep-heading").textContent = copy.title;
    if (el("candidate-prep-intro")) el("candidate-prep-intro").textContent = copy.intro;
    container.innerHTML = copy.cards.map(([title, items], index) => `
      <article class="candidate-prep-card${index === copy.cards.length - 1 ? " candidate-prep-warning" : ""}">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHTML(title)}</h3>
        <ul>${items.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
      </article>
    `).join("");
  }

  function candidatePassportCopy() {
    const copy = {
      en: {
        kicker: "Candidate Passport",
        title: "Create an application without registration",
        intro: "Fill in a short card. It stays only on this device and is sent to the recruiter only when you press WhatsApp.",
        fieldsTitle: "Candidate details",
        previewTitle: "Recruiter will receive",
        scoreTitle: "Start readiness",
        scoreText: "The more complete the card, the faster the recruiter can check suitable jobs.",
        privacy: "Safe application: no document numbers, no document photos, no bank details. The form stays on this device until you press WhatsApp.",
        send: "Send application in WhatsApp",
        copy: "Copy application",
        clear: "Clear",
        copied: "Candidate application copied",
        fillFromMatch: "Use quick answers",
        missing: "To improve readiness",
        ready: "Ready for recruiter review",
        completionTitle: "Application readiness",
        completionPercent: "complete",
        nextStep: "Next best step",
        focusNext: "Add this",
        coachHintReady: "The recruiter receives a clear short message and can quickly check the right vacancy.",
        coachHints: {
          name: "Use Latin letters so your name is easy to copy into the work discussion.",
          birthDate: "This lets the site calculate age locally and send a cleaner WhatsApp message.",
          current: "Current country or city helps check realistic routes and start timing.",
          citizenship: "Citizenship helps the recruiter understand which work path to clarify first.",
          language: "Preferred language helps the recruiter answer in the most comfortable language.",
          destination: "Wanted country makes vacancy suggestions more accurate.",
          people: "This helps check whether the start is for one person, a couple or a group.",
          experience: "Experience helps separate first-start roles from specialist or driver roles.",
          workDocs: "Only a general status is needed here — no document numbers or photos.",
          readyDate: "Start date is often the fastest way to find a suitable current vacancy.",
          job: "A direction like greenhouse, warehouse or driver makes matching much sharper."
        },
        readyText: "You can send the application in WhatsApp now.",
        stickyTitle: "Application",
        stickyNext: "Next",
        stickySend: "WhatsApp",
        matchTitle: "Suitable jobs from your card",
        matchEmpty: "Choose a country, experience or job direction to see personal suggestions.",
        matchOpen: "Open job",
        matchWhy: "Fits because",
        matchCheck: "Clarify",
        smartTitle: "Smart check",
        latinOk: "Name is easy to copy",
        latinNeed: "Write name in Latin letters",
        latinAction: "Make Latin",
        latinPreview: "Suggested",
        ageOk: "Age will be calculated for recruiter",
        ageNeed: "Add date of birth",
        ageHelperTitle: "Local age check",
        ageHelperEmpty: "Add date of birth and the site will calculate the age locally before WhatsApp opens.",
        ageHelperReady: "Calculated age",
        ageHelperPrivacy: "Only the prepared message is sent after you press WhatsApp.",
        directionOk: "Job direction is clear",
        directionNeed: "Add job direction",
        safeOk: "Only safe fields are used",
        briefTitle: "Short recruiter summary",
        briefEmpty: "Fill a few fields and the site will build a clean summary.",
        briefAge: "Age",
        briefCountry: "Country",
        briefDirection: "Direction",
        briefStart: "Start",
        saveTitle: "Saved on this phone",
        saveEmpty: "Will be saved locally while you fill the form.",
        saveOnlyAfterWhatsApp: "Not sent until WhatsApp is pressed",
        afterTitle: "After WhatsApp",
        afterSteps: [
          ["Send", "Your prepared message opens in WhatsApp."],
          ["Clarify", "Recruiter checks start date, city and suitable jobs."],
          ["Confirm", "You receive exact conditions before any travel decision."]
        ],
        sendReadyTitle: "Message strength",
        sendReadyWeak: "Can send, but one more detail will help.",
        sendReadyGood: "Good enough to send.",
        sendReadyStrong: "Strong application — ready to send.",
        sendReadyNext: "Add next",
        sendChecklistTitle: "Before sending",
        sendChecklistReady: "Ready",
        sendChecklistMissing: "Useful to add",
        sendChecklistSafe: "Safe fields only",
        sendChecklistAge: "Age is calculated locally",
        sendChecklistMatches: "Suitable jobs are prepared",
        refTitle: "Application reference",
        refEmpty: "Appears after the first answer.",
        refText: "Use this code if you continue the chat later.",
        refCopy: "Copy reference",
        refCopied: "Application reference copied",
        currentQuickTitle: "Where are you now?",
        currentQuickOptions: ["Poland", "Ukraine", "Georgia", "Armenia", "Nepal", "Other country"],
        citizenshipQuickTitle: "Citizenship",
        citizenshipQuickOptions: ["Ukraine", "Georgia", "Armenia", "Nepal", "Azerbaijan", "Other"],
        languageQuickTitle: "Preferred language",
        destinationQuickTitle: "Wanted country",
        peopleQuickTitle: "Who is going",
        experienceQuickTitle: "Experience / direction",
        experienceCoachTitle: "What this means",
        experienceCoachDefault: "Choose the closest experience option and the site will make job suggestions clearer.",
        experienceCoachNoExperience: "Good path for a first start: greenhouse, warehouse and simple production roles are usually easier to discuss first.",
        experienceCoachExperienced: "Add the exact direction in the next field so the recruiter can compare you with better-paid or more specific roles.",
        experienceCoachDriver: "Driver direction selected. The WhatsApp message will help the recruiter ask about category, route type and start date.",
        experienceCoachWarehouse: "Warehouse direction selected. The site will prioritize practical roles and questions about shifts, city and start date.",
        experienceCoachGreenhouse: "Greenhouse direction selected. This is a clear route for candidates from different countries, including first starts.",
        startQuickTitle: "Quick start date",
        startQuickOptions: ["As soon as possible", "This week", "This month", "Need to clarify"],
        quickTitle: "Quick start",
        quickIntro: "Choose the closest path and correct details if needed.",
        quickStarts: [
          { id: "greenhouse", title: "Greenhouse", text: "Poland · no experience", job: "greenhouse" },
          { id: "warehouse", title: "Warehouse", text: "Poland · simple start", job: "warehouse" },
          { id: "driver", title: "Driver", text: "Transport direction", job: "driver" },
          { id: "couple", title: "For a couple", text: "Start together", job: "greenhouse" }
        ],
        labels: {
          name: "Full name in Latin letters",
          birthDate: "Date of birth",
          current: "Country / city now",
          citizenship: "Citizenship",
          language: "Preferred language",
          destination: "Wanted country",
          people: "Who is going",
          experience: "Experience",
          workDocs: "Are work documents ready?",
          readyDate: "Ready date",
          job: "Interesting job or direction"
        },
        placeholders: {
          name: "Example: Oleksandr Kiris",
          birthDate: "Example: 1995-08-15",
          current: "Example: Poland, Wroclaw",
          citizenship: "Example: Ukraine",
          readyDate: "Example: next week / 15 August",
          job: "Example: greenhouse / warehouse / driver"
        },
        options: {
          language: ["English", "Ukrainian", "Polish", "Russian", "Spanish", "Other"],
          destination: ["Poland", "Hungary", "Belgium", "Not sure"],
          people: ["Only me", "Couple", "Group / friends"],
          experience: ["No experience", "Have experience", "Driver", "Warehouse", "Greenhouse"],
          workDocs: ["Ready", "Not ready", "Need to clarify"]
        },
        messageTitle: "CITRONEX CANDIDATE PASSPORT",
        nextQuestions: "Suggested next questions",
        safetyCards: [
          ["No document numbers", "The site asks only for a general paperwork status."],
          ["Only on this phone", "Answers stay in the browser until WhatsApp is pressed."],
          ["Human check", "The recruiter confirms conditions personally before travel."]
        ],
        questions: ["Is work paperwork ready — without sending photos or numbers?", "Which city and start date are available?", "Is housing needed?"]
      },
      ru: {
        kicker: "Candidate Passport",
        title: "Создайте заявку без регистрации",
        intro: "Заполните короткую карточку. Она хранится только на этом устройстве и отправляется рекрутеру только после нажатия WhatsApp.",
        fieldsTitle: "Данные кандидата",
        previewTitle: "Рекрутер получит",
        scoreTitle: "Готовность к старту",
        scoreText: "Чем полнее карточка, тем быстрее рекрутер проверит подходящие вакансии.",
        privacy: "Безопасная заявка: без номеров документов, без фото документов, без банковских данных. Форма хранится на этом устройстве до нажатия WhatsApp.",
        send: "Отправить заявку в WhatsApp",
        copy: "Скопировать заявку",
        clear: "Очистить",
        copied: "Заявка кандидата скопирована",
        fillFromMatch: "Заполнить из подбора",
        missing: "Чтобы улучшить готовность",
        ready: "Готово для проверки рекрутером",
        completionTitle: "Готовность заявки",
        completionPercent: "заполнено",
        nextStep: "Следующий лучший шаг",
        focusNext: "Добавить это",
        coachHintReady: "Рекрутер получит короткое понятное сообщение и быстрее проверит подходящую вакансию.",
        coachHints: {
          name: "Пишите латиницей, чтобы имя было легко скопировать в рабочее обсуждение.",
          birthDate: "Так сайт локально посчитает возраст и отправит более чистое сообщение в WhatsApp.",
          current: "Страна или город сейчас помогают понять реальный маршрут и сроки старта.",
          citizenship: "Гражданство помогает понять, какой путь оформления нужно уточнить первым.",
          language: "Удобный язык помогает рекрутеру ответить человеку понятнее.",
          destination: "Желаемая страна делает подбор вакансий точнее.",
          people: "Так видно, едет человек один, парой или группой.",
          experience: "Опыт отделяет простой первый старт от специальных и водительских вакансий.",
          workDocs: "Здесь нужен только общий статус — без номеров и фото документов.",
          readyDate: "Дата старта часто быстрее всего помогает найти актуальную вакансию.",
          job: "Направление вроде теплицы, склада или водителя делает подбор намного точнее."
        },
        readyText: "Теперь можно отправить заявку в WhatsApp.",
        stickyTitle: "Заявка",
        stickyNext: "Дальше",
        stickySend: "WhatsApp",
        matchTitle: "Подходящие вакансии по вашей заявке",
        matchEmpty: "Выберите страну, опыт или направление — и здесь появятся личные варианты.",
        matchOpen: "Открыть вакансию",
        matchWhy: "Подходит потому что",
        matchCheck: "Уточнить",
        smartTitle: "Умная проверка",
        latinOk: "Имя удобно скопировать",
        latinNeed: "Напишите имя латиницей",
        latinAction: "Сделать латиницей",
        latinPreview: "Вариант",
        ageOk: "Возраст посчитается для рекрутера",
        ageNeed: "Добавьте дату рождения",
        ageHelperTitle: "Локальный расчёт возраста",
        ageHelperEmpty: "Добавьте дату рождения — сайт сам посчитает возраст до открытия WhatsApp.",
        ageHelperReady: "Посчитанный возраст",
        ageHelperPrivacy: "Отправка происходит только после нажатия WhatsApp.",
        directionOk: "Направление работы понятно",
        directionNeed: "Добавьте направление работы",
        safeOk: "Используются только безопасные поля",
        briefTitle: "Короткое резюме для рекрутера",
        briefEmpty: "Заполните несколько полей — сайт соберёт чистое резюме.",
        briefAge: "Возраст",
        briefCountry: "Страна",
        briefDirection: "Направление",
        briefStart: "Старт",
        saveTitle: "Сохранено на этом телефоне",
        saveEmpty: "Будет сохраняться локально во время заполнения.",
        saveOnlyAfterWhatsApp: "Не отправляется до нажатия WhatsApp",
        afterTitle: "Что будет после WhatsApp",
        afterSteps: [
          ["Отправка", "Откроется готовое сообщение в WhatsApp."],
          ["Уточнение", "Рекрутер проверит дату старта, город и подходящие вакансии."],
          ["Подтверждение", "Вы получите конкретные условия до решения о поездке."]
        ],
        sendReadyTitle: "Сила сообщения",
        sendReadyWeak: "Можно отправить, но ещё одна деталь поможет.",
        sendReadyGood: "Уже достаточно хорошо для отправки.",
        sendReadyStrong: "Сильная заявка — можно отправлять.",
        sendReadyNext: "Добавить",
        sendChecklistTitle: "Перед отправкой",
        sendChecklistReady: "Готово",
        sendChecklistMissing: "Полезно добавить",
        sendChecklistSafe: "Только безопасные поля",
        sendChecklistAge: "Возраст посчитан локально",
        sendChecklistMatches: "Подходящие вакансии подготовлены",
        refTitle: "Номер заявки",
        refEmpty: "Появится после первого ответа.",
        refText: "Используйте этот код, если продолжите переписку позже.",
        refCopy: "Скопировать номер",
        refCopied: "Номер заявки скопирован",
        currentQuickTitle: "Где вы сейчас?",
        currentQuickOptions: ["Польша", "Украина", "Грузия", "Армения", "Непал", "Другая страна"],
        citizenshipQuickTitle: "Гражданство",
        citizenshipQuickOptions: ["Украина", "Грузия", "Армения", "Непал", "Азербайджан", "Другое"],
        languageQuickTitle: "Быстрый выбор языка",
        destinationQuickTitle: "Быстрый выбор страны",
        peopleQuickTitle: "Быстрый выбор состава",
        experienceQuickTitle: "Опыт / направление",
        experienceCoachTitle: "Что это значит",
        experienceCoachDefault: "Выберите ближайший вариант опыта — сайт понятнее подберёт вакансии и следующий вопрос.",
        experienceCoachNoExperience: "Хороший путь для первого старта: теплица, склад и простое производство обычно проще обсудить сначала.",
        experienceCoachExperienced: "Добавьте точное направление в следующем поле, чтобы рекрутер мог сравнить вас с более подходящими вакансиями.",
        experienceCoachDriver: "Выбрано направление водителя. Сообщение в WhatsApp поможет уточнить категорию, тип маршрута и дату старта.",
        experienceCoachWarehouse: "Выбран склад. Сайт будет лучше подбирать практичные роли и вопросы по сменам, городу и старту.",
        experienceCoachGreenhouse: "Выбрана теплица. Это понятный маршрут для кандидатов из разных стран, в том числе для первого выезда.",
        startQuickTitle: "Быстрая дата старта",
        startQuickOptions: ["Как можно скорее", "На этой неделе", "В этом месяце", "Нужно уточнить"],
        quickTitle: "Быстрый старт",
        quickIntro: "Выберите ближайший вариант и поправьте детали, если нужно.",
        quickStarts: [
          { id: "greenhouse", title: "Теплица", text: "Польша · можно без опыта", job: "теплица" },
          { id: "warehouse", title: "Склад", text: "Польша · простой старт", job: "склад" },
          { id: "driver", title: "Водитель", text: "Направление транспорта", job: "водитель" },
          { id: "couple", title: "Для пары", text: "Старт вместе", job: "теплица" }
        ],
        labels: {
          name: "Имя и фамилия латиницей",
          birthDate: "Дата рождения",
          current: "Страна / город сейчас",
          citizenship: "Гражданство",
          language: "Удобный язык",
          destination: "Желаемая страна",
          people: "Кто едет",
          experience: "Опыт",
          workDocs: "Оформление для работы готово?",
          readyDate: "Когда готовы",
          job: "Интересная вакансия или направление"
        },
        placeholders: {
          name: "Например: Oleksandr Kiris",
          birthDate: "Например: 1995-08-15",
          current: "Например: Poland, Wroclaw",
          citizenship: "Например: Ukraine",
          readyDate: "Например: на следующей неделе / 15 августа",
          job: "Например: теплица / склад / водитель"
        },
        options: {
          language: ["Русский", "Украинский", "Польский", "Английский", "Испанский", "Другой"],
          destination: ["Польша", "Венгрия", "Бельгия", "Пока не знаю"],
          people: ["Только я", "Пара", "Группа / друзья"],
          experience: ["Без опыта", "Есть опыт", "Водитель", "Склад", "Теплица"],
          workDocs: ["Готовы", "Не готовы", "Нужно уточнить"]
        },
        messageTitle: "CITRONEX CANDIDATE PASSPORT",
        nextQuestions: "Подсказка рекрутеру: следующий вопрос",
        safetyCards: [
          ["Без номеров документов", "Сайт спрашивает только общий статус оформления."],
          ["Только на телефоне", "Ответы остаются в браузере до нажатия WhatsApp."],
          ["Проверка человеком", "Рекрутер лично подтверждает условия перед поездкой."]
        ],
        questions: ["Оформление для работы готово — без фото и номеров?", "Какой город и дата старта подходят?", "Нужно ли жильё?"]
      },
      uk: {
        kicker: "Candidate Passport",
        title: "Створіть заявку без реєстрації",
        intro: "Заповніть коротку картку. Вона зберігається тільки на цьому пристрої і надсилається рекрутеру лише після натискання WhatsApp.",
        fieldsTitle: "Дані кандидата",
        previewTitle: "Рекрутер отримає",
        scoreTitle: "Готовність до старту",
        scoreText: "Чим повніша картка, тим швидше рекрутер перевірить відповідні вакансії.",
        privacy: "Безпечна заявка: без номерів документів, без фото документів, без банківських даних. Форма зберігається на цьому пристрої до натискання WhatsApp.",
        send: "Надіслати заявку у WhatsApp",
        copy: "Скопіювати заявку",
        clear: "Очистити",
        copied: "Заявку кандидата скопійовано",
        fillFromMatch: "Заповнити з підбору",
        missing: "Щоб покращити готовність",
        ready: "Готово для перевірки рекрутером",
        completionTitle: "Готовність заявки",
        completionPercent: "заповнено",
        nextStep: "Наступний найкращий крок",
        focusNext: "Додати це",
        coachHintReady: "Рекрутер отримає коротке зрозуміле повідомлення і швидше перевірить відповідну вакансію.",
        coachHints: {
          name: "Пишіть латиницею, щоб ім'я було легко скопіювати в робоче обговорення.",
          birthDate: "Так сайт локально порахує вік і підготує чистіше повідомлення в WhatsApp.",
          current: "Країна або місто зараз допомагають зрозуміти реальний маршрут і строки старту.",
          citizenship: "Громадянство допомагає зрозуміти, який шлях оформлення уточнити першим.",
          language: "Зручна мова допомагає рекрутеру відповісти зрозуміліше.",
          destination: "Бажана країна робить підбір вакансій точнішим.",
          people: "Так видно, їде людина сама, парою чи групою.",
          experience: "Досвід відділяє простий перший старт від спеціальних і водійських вакансій.",
          workDocs: "Тут потрібен тільки загальний статус — без номерів і фото документів.",
          readyDate: "Дата старту часто найшвидше допомагає знайти актуальну вакансію.",
          job: "Напрям на кшталт теплиці, складу або водія робить підбір набагато точнішим."
        },
        readyText: "Тепер можна надіслати заявку у WhatsApp.",
        stickyTitle: "Заявка",
        stickyNext: "Далі",
        stickySend: "WhatsApp",
        matchTitle: "Відповідні вакансії за вашою заявкою",
        matchEmpty: "Оберіть країну, досвід або напрям — і тут з’являться особисті варіанти.",
        matchOpen: "Відкрити вакансію",
        matchWhy: "Підходить тому що",
        matchCheck: "Уточнити",
        smartTitle: "Розумна перевірка",
        latinOk: "Ім’я зручно скопіювати",
        latinNeed: "Напишіть ім’я латиницею",
        latinAction: "Зробити латиницею",
        latinPreview: "Варіант",
        ageOk: "Вік порахується для рекрутера",
        ageNeed: "Додайте дату народження",
        ageHelperTitle: "Локальний розрахунок віку",
        ageHelperEmpty: "Додайте дату народження — сайт сам порахує вік до відкриття WhatsApp.",
        ageHelperReady: "Порахований вік",
        ageHelperPrivacy: "Відправлення відбувається тільки після натискання WhatsApp.",
        directionOk: "Напрям роботи зрозумілий",
        directionNeed: "Додайте напрям роботи",
        safeOk: "Використовуються тільки безпечні поля",
        briefTitle: "Коротке резюме для рекрутера",
        briefEmpty: "Заповніть кілька полів — сайт збере чисте резюме.",
        briefAge: "Вік",
        briefCountry: "Країна",
        briefDirection: "Напрям",
        briefStart: "Старт",
        saveTitle: "Збережено на цьому телефоні",
        saveEmpty: "Буде зберігатися локально під час заповнення.",
        saveOnlyAfterWhatsApp: "Не надсилається до натискання WhatsApp",
        afterTitle: "Що буде після WhatsApp",
        afterSteps: [
          ["Надсилання", "Відкриється готове повідомлення у WhatsApp."],
          ["Уточнення", "Рекрутер перевірить дату старту, місто і відповідні вакансії."],
          ["Підтвердження", "Ви отримаєте конкретні умови до рішення про поїздку."]
        ],
        sendReadyTitle: "Сила повідомлення",
        sendReadyWeak: "Можна надіслати, але ще одна деталь допоможе.",
        sendReadyGood: "Уже достатньо добре для надсилання.",
        sendReadyStrong: "Сильна заявка — можна надсилати.",
        sendReadyNext: "Додати",
        sendChecklistTitle: "Перед відправленням",
        sendChecklistReady: "Готово",
        sendChecklistMissing: "Корисно додати",
        sendChecklistSafe: "Тільки безпечні поля",
        sendChecklistAge: "Вік пораховано локально",
        sendChecklistMatches: "Відповідні вакансії підготовлено",
        refTitle: "Номер заявки",
        refEmpty: "З’явиться після першої відповіді.",
        refText: "Використовуйте цей код, якщо продовжите чат пізніше.",
        refCopy: "Скопіювати номер",
        refCopied: "Номер заявки скопійовано",
        currentQuickTitle: "Де ви зараз?",
        currentQuickOptions: ["Польща", "Україна", "Грузія", "Вірменія", "Непал", "Інша країна"],
        citizenshipQuickTitle: "Громадянство",
        citizenshipQuickOptions: ["Україна", "Грузія", "Вірменія", "Непал", "Азербайджан", "Інше"],
        languageQuickTitle: "Швидкий вибір мови",
        destinationQuickTitle: "Швидкий вибір країни",
        peopleQuickTitle: "Швидкий вибір складу",
        experienceQuickTitle: "Досвід / напрям",
        experienceCoachTitle: "Що це означає",
        experienceCoachDefault: "Оберіть найближчий варіант досвіду — сайт точніше покаже вакансії та наступне питання.",
        experienceCoachNoExperience: "Добрий шлях для першого старту: теплиця, склад і просте виробництво зазвичай легше обговорити спочатку.",
        experienceCoachExperienced: "Додайте точний напрям у наступному полі, щоб рекрутер міг порівняти вас із кращими варіантами.",
        experienceCoachDriver: "Обрано напрям водія. Повідомлення в WhatsApp допоможе уточнити категорію, тип маршруту та дату старту.",
        experienceCoachWarehouse: "Обрано склад. Сайт краще підбиратиме практичні ролі та питання щодо змін, міста й старту.",
        experienceCoachGreenhouse: "Обрано теплицю. Це зрозумілий маршрут для кандидатів із різних країн, зокрема для першого виїзду.",
        startQuickTitle: "Швидка дата старту",
        startQuickOptions: ["Якнайшвидше", "Цього тижня", "Цього місяця", "Потрібно уточнити"],
        quickTitle: "Швидкий старт",
        quickIntro: "Оберіть найближчий варіант і виправте деталі, якщо потрібно.",
        quickStarts: [
          { id: "greenhouse", title: "Теплиця", text: "Польща · можна без досвіду", job: "теплиця" },
          { id: "warehouse", title: "Склад", text: "Польща · простий старт", job: "склад" },
          { id: "driver", title: "Водій", text: "Напрям транспорту", job: "водій" },
          { id: "couple", title: "Для пари", text: "Старт разом", job: "теплиця" }
        ],
        labels: {
          name: "Ім’я та прізвище латиницею",
          birthDate: "Дата народження",
          current: "Країна / місто зараз",
          citizenship: "Громадянство",
          language: "Зручна мова",
          destination: "Бажана країна",
          people: "Хто їде",
          experience: "Досвід",
          workDocs: "Оформлення для роботи готове?",
          readyDate: "Коли готові",
          job: "Цікава вакансія або напрям"
        },
        placeholders: {
          name: "Наприклад: Oleksandr Kiris",
          birthDate: "Наприклад: 1995-08-15",
          current: "Наприклад: Poland, Wroclaw",
          citizenship: "Наприклад: Ukraine",
          readyDate: "Наприклад: наступного тижня / 15 серпня",
          job: "Наприклад: теплиця / склад / водій"
        },
        options: {
          language: ["Українська", "Польська", "Англійська", "Російська", "Іспанська", "Інша"],
          destination: ["Польща", "Угорщина", "Бельгія", "Поки не знаю"],
          people: ["Тільки я", "Пара", "Група / друзі"],
          experience: ["Без досвіду", "Є досвід", "Водій", "Склад", "Теплиця"],
          workDocs: ["Готові", "Не готові", "Потрібно уточнити"]
        },
        messageTitle: "CITRONEX CANDIDATE PASSPORT",
        nextQuestions: "Підказка рекрутеру: наступне питання",
        safetyCards: [
          ["Без номерів документів", "Сайт питає тільки загальний статус оформлення."],
          ["Тільки на телефоні", "Відповіді залишаються в браузері до натискання WhatsApp."],
          ["Перевірка людиною", "Рекрутер особисто підтверджує умови перед поїздкою."]
        ],
        questions: ["Оформлення для роботи готове — без фото і номерів?", "Яке місто і дата старту підходять?", "Чи потрібне житло?"]
      },
      pl: {
        kicker: "Candidate Passport",
        title: "Utwórz zgłoszenie bez rejestracji",
        intro: "Wypełnij krótką kartę. Zostaje tylko na tym urządzeniu i trafia do rekrutera dopiero po naciśnięciu WhatsApp.",
        fieldsTitle: "Dane kandydata",
        previewTitle: "Rekruter otrzyma",
        scoreTitle: "Gotowość do startu",
        scoreText: "Im pełniejsza karta, tym szybciej rekruter sprawdzi pasujące oferty.",
        privacy: "Bezpieczne zgłoszenie: bez numerów dokumentów, bez zdjęć dokumentów, bez danych bankowych. Formularz zostaje na tym urządzeniu do naciśnięcia WhatsApp.",
        send: "Wyślij zgłoszenie w WhatsApp",
        copy: "Kopiuj zgłoszenie",
        clear: "Wyczyść",
        copied: "Zgłoszenie kandydata skopiowane",
        fillFromMatch: "Użyj szybkich odpowiedzi",
        missing: "Aby poprawić gotowość",
        ready: "Gotowe do sprawdzenia przez rekrutera",
        completionTitle: "Gotowość zgłoszenia",
        completionPercent: "uzupełnione",
        nextStep: "Najlepszy następny krok",
        focusNext: "Dodaj to",
        coachHintReady: "Rekruter dostanie krótką, czytelną wiadomość i szybciej sprawdzi właściwą ofertę.",
        coachHints: {
          name: "Użyj liter łacińskich, aby imię i nazwisko było łatwe do skopiowania.",
          birthDate: "Strona lokalnie obliczy wiek i przygotuje czystszą wiadomość WhatsApp.",
          current: "Obecny kraj lub miasto pomaga sprawdzić realną trasę i termin startu.",
          citizenship: "Obywatelstwo pomaga ustalić, jaką ścieżkę pracy wyjaśnić najpierw.",
          language: "Preferowany język pomaga rekruterowi odpowiedzieć zrozumiale.",
          destination: "Wybrany kraj poprawia dopasowanie ofert.",
          people: "Widać, czy start dotyczy jednej osoby, pary czy grupy.",
          experience: "Doświadczenie oddziela pierwszy start od ofert specjalistycznych i kierowców.",
          workDocs: "Wystarczy ogólny status — bez numerów i zdjęć dokumentów.",
          readyDate: "Data startu często najszybciej pomaga znaleźć aktualną ofertę.",
          job: "Kierunek jak szklarnia, magazyn lub kierowca wyraźnie poprawia dopasowanie."
        },
        readyText: "Możesz teraz wysłać zgłoszenie w WhatsApp.",
        stickyTitle: "Zgłoszenie",
        stickyNext: "Dalej",
        stickySend: "WhatsApp",
        matchTitle: "Pasujące oferty z Twojego zgłoszenia",
        matchEmpty: "Wybierz kraj, doświadczenie albo kierunek — tutaj pojawią się osobiste propozycje.",
        matchOpen: "Otwórz ofertę",
        matchWhy: "Pasuje, bo",
        matchCheck: "Wyjaśnij",
        smartTitle: "Szybkie sprawdzenie",
        latinOk: "Imię łatwo skopiować",
        latinNeed: "Wpisz imię alfabetem łacińskim",
        latinAction: "Zmień na łacińskie",
        latinPreview: "Propozycja",
        ageOk: "Wiek zostanie obliczony dla rekrutera",
        ageNeed: "Dodaj datę urodzenia",
        ageHelperTitle: "Lokalne liczenie wieku",
        ageHelperEmpty: "Dodaj datę urodzenia — strona obliczy wiek lokalnie przed otwarciem WhatsApp.",
        ageHelperReady: "Obliczony wiek",
        ageHelperPrivacy: "Wysyłka następuje dopiero po naciśnięciu WhatsApp.",
        directionOk: "Kierunek pracy jest jasny",
        directionNeed: "Dodaj kierunek pracy",
        safeOk: "Używane są tylko bezpieczne pola",
        briefTitle: "Krótkie podsumowanie dla rekrutera",
        briefEmpty: "Uzupełnij kilka pól, a strona złoży czyste podsumowanie.",
        briefAge: "Wiek",
        briefCountry: "Kraj",
        briefDirection: "Kierunek",
        briefStart: "Start",
        saveTitle: "Zapisane na tym telefonie",
        saveEmpty: "Będzie zapisywane lokalnie podczas wypełniania.",
        saveOnlyAfterWhatsApp: "Nie wysyła się przed naciśnięciem WhatsApp",
        afterTitle: "Co będzie po WhatsApp",
        afterSteps: [
          ["Wysyłka", "Otworzy się gotowa wiadomość w WhatsApp."],
          ["Ustalenie", "Rekruter sprawdzi termin startu, miasto i pasujące oferty."],
          ["Potwierdzenie", "Otrzymasz konkretne warunki przed decyzją o wyjeździe."]
        ],
        sendReadyTitle: "Siła wiadomości",
        sendReadyWeak: "Możesz wysłać, ale jeden szczegół pomoże.",
        sendReadyGood: "Wystarczająco dobrze do wysłania.",
        sendReadyStrong: "Mocne zgłoszenie — gotowe do wysłania.",
        sendReadyNext: "Dodaj",
        sendChecklistTitle: "Przed wysłaniem",
        sendChecklistReady: "Gotowe",
        sendChecklistMissing: "Warto dodać",
        sendChecklistSafe: "Tylko bezpieczne pola",
        sendChecklistAge: "Wiek liczony lokalnie",
        sendChecklistMatches: "Dopasowane oferty przygotowane",
        refTitle: "Numer zgłoszenia",
        refEmpty: "Pojawi się po pierwszej odpowiedzi.",
        refText: "Użyj tego kodu, jeśli wrócisz do rozmowy później.",
        refCopy: "Kopiuj numer",
        refCopied: "Numer zgłoszenia skopiowany",
        currentQuickTitle: "Gdzie jesteś teraz?",
        currentQuickOptions: ["Polska", "Ukraina", "Gruzja", "Armenia", "Nepal", "Inny kraj"],
        citizenshipQuickTitle: "Obywatelstwo",
        citizenshipQuickOptions: ["Ukraina", "Gruzja", "Armenia", "Nepal", "Azerbejdżan", "Inne"],
        languageQuickTitle: "Szybki wybór języka",
        destinationQuickTitle: "Szybki wybór kraju",
        peopleQuickTitle: "Szybki wybór składu",
        experienceQuickTitle: "Doświadczenie / kierunek",
        experienceCoachTitle: "Co to oznacza",
        experienceCoachDefault: "Wybierz najbliższą opcję doświadczenia — strona lepiej pokaże oferty i następne pytanie.",
        experienceCoachNoExperience: "Dobry kierunek na pierwszy start: szklarnia, magazyn i prosta produkcja są zwykle łatwiejsze do omówienia.",
        experienceCoachExperienced: "Dodaj dokładny kierunek w następnym polu, aby rekruter mógł porównać Cię z lepszymi ofertami.",
        experienceCoachDriver: "Wybrano kierowcę. Wiadomość WhatsApp pomoże ustalić kategorię, typ trasy i datę startu.",
        experienceCoachWarehouse: "Wybrano magazyn. Strona lepiej dobierze praktyczne role oraz pytania o zmiany, miasto i start.",
        experienceCoachGreenhouse: "Wybrano szklarnię. To jasna ścieżka dla kandydatów z różnych krajów, także na pierwszy wyjazd.",
        startQuickTitle: "Szybka data startu",
        startQuickOptions: ["Jak najszybciej", "W tym tygodniu", "W tym miesiącu", "Do wyjaśnienia"],
        quickTitle: "Szybki start",
        quickIntro: "Wybierz najbliższy wariant i popraw szczegóły, jeśli trzeba.",
        quickStarts: [
          { id: "greenhouse", title: "Szklarnia", text: "Polska · można bez doświadczenia", job: "szklarnia" },
          { id: "warehouse", title: "Magazyn", text: "Polska · prosty start", job: "magazyn" },
          { id: "driver", title: "Kierowca", text: "Kierunek transportu", job: "kierowca" },
          { id: "couple", title: "Dla pary", text: "Start razem", job: "szklarnia" }
        ],
        labels: {
          name: "Imię i nazwisko alfabetem łacińskim",
          birthDate: "Data urodzenia",
          current: "Kraj / miasto teraz",
          citizenship: "Obywatelstwo",
          language: "Wygodny język",
          destination: "Preferowany kraj",
          people: "Kto jedzie",
          experience: "Doświadczenie",
          workDocs: "Czy formalności do pracy są gotowe?",
          readyDate: "Kiedy możesz zacząć",
          job: "Interesująca oferta lub kierunek"
        },
        placeholders: {
          name: "Np. Oleksandr Kiris",
          birthDate: "Np. 1995-08-15",
          current: "Np. Poland, Wroclaw",
          citizenship: "Np. Ukraine",
          readyDate: "Np. w przyszłym tygodniu / 15 sierpnia",
          job: "Np. szklarnia / magazyn / kierowca"
        },
        options: {
          language: ["Polski", "Ukraiński", "Angielski", "Rosyjski", "Hiszpański", "Inny"],
          destination: ["Polska", "Węgry", "Belgia", "Nie wiem"],
          people: ["Tylko ja", "Para", "Grupa / znajomi"],
          experience: ["Bez doświadczenia", "Mam doświadczenie", "Kierowca", "Magazyn", "Szklarnia"],
          workDocs: ["Gotowe", "Nie gotowe", "Do wyjaśnienia"]
        },
        messageTitle: "CITRONEX CANDIDATE PASSPORT",
        nextQuestions: "Podpowiedź dla rekrutera: następne pytanie",
        safetyCards: [
          ["Bez numerów dokumentów", "Strona pyta tylko o ogólny status formalności."],
          ["Tylko na telefonie", "Odpowiedzi zostają w przeglądarce do naciśnięcia WhatsApp."],
          ["Sprawdza człowiek", "Rekruter osobiście potwierdza warunki przed wyjazdem."]
        ],
        questions: ["Czy formalności do pracy są gotowe — bez zdjęć i numerów?", "Jakie miasto i data startu pasują?", "Czy potrzebne jest mieszkanie?"]
      }
    };
    return copy[i18n.locale] || copy.en;
  }

  function passportValue(key) {
    return String(state.passport?.[key] || "").trim();
  }

  function normalizePassportText(value) {
    return String(value || "").toLowerCase();
  }

  function passportTargetCountry() {
    const destination = normalizePassportText(passportValue("destination"));
    if (destination.includes("pol") || destination.includes("поль") || destination.includes("польщ") || destination.includes("polska")) return "poland";
    if (destination.includes("hung") || destination.includes("węg") || destination.includes("венг") || destination.includes("угор")) return "hungary";
    if (destination.includes("bel") || destination.includes("бель") || destination.includes("belg")) return "belgium";
    return "";
  }

  function ensurePassportId() {
    const currentId = passportValue("id");
    if (currentId && !currentId.startsWith("CIT-INT-")) return currentId;
    const citizenship = passportValue("citizenship").slice(0, 3).replace(/[^a-zа-яіїєґ]/gi, "").toUpperCase() || "INT";
    if (currentId && citizenship === "INT") return currentId;
    const random = currentId.split("-")[2] || Math.random().toString(16).slice(2, 6).toUpperCase();
    state.passport.id = `CIT-${citizenship}-${random}`;
    persistPassport();
    return state.passport.id;
  }

  function hasPassportVisibleInput() {
    return ["name", "birthDate", "current", "citizenship", "language", "destination", "people", "experience", "workDocs", "readyDate", "job"]
      .some((key) => passportValue(key));
  }

  function candidatePassportReferenceHTML() {
    const copy = candidatePassportCopy();
    const id = hasPassportVisibleInput() ? ensurePassportId() : "";
    return `
      <section class="candidate-passport-reference${id ? " is-active" : ""}" aria-label="${escapeHTML(copy.refTitle)}">
        <div>
          <small>${escapeHTML(copy.refTitle)}</small>
          <strong>${escapeHTML(id || "CIT-••••")}</strong>
        </div>
        <p>${escapeHTML(id ? copy.refText : copy.refEmpty)}</p>
        ${id ? `<button class="candidate-passport-reference-copy" type="button" data-passport-copy-reference="${escapeHTML(id)}">${escapeHTML(copy.refCopy)}</button>` : ""}
      </section>
    `;
  }

  function passportTags() {
    const tags = ["#citronex", "#candidate_passport"];
    const target = passportTargetCountry();
    if (target) tags.push(`#target_${target}`);
    const people = normalizePassportText(passportValue("people"));
    const experience = normalizePassportText(passportValue("experience"));
    const job = normalizePassportText(passportValue("job"));
    if (people.includes("пар") || people.includes("couple") || people.includes("para")) tags.push("#couple");
    if (people.includes("group") || people.includes("груп") || people.includes("друз") || people.includes("znaj")) tags.push("#group");
    if (experience.includes("без") || experience.includes("no experience") || experience.includes("bez do") || experience.includes("без дос")) tags.push("#no_experience");
    if (experience.includes("driver") || experience.includes("вод") || experience.includes("kierow")) tags.push("#driver");
    if (job.includes("green") || job.includes("тепл") || job.includes("szkl")) tags.push("#greenhouse");
    if (job.includes("warehouse") || job.includes("склад") || job.includes("magaz")) tags.push("#warehouse");
    const workDocs = normalizePassportText(passportValue("workDocs"));
    if (workDocs.includes("ready") || workDocs.includes("готов") || workDocs.includes("gotow")) tags.push("#work_docs_ready");
    if (workDocs.includes("clar") || workDocs.includes("уточ") || workDocs.includes("wyja")) tags.push("#work_docs_clarify");
    if (passportValue("readyDate")) tags.push("#ready_date_set");
    return [...new Set(tags)];
  }

  function passportScore() {
    const required = ["name", "birthDate", "current", "citizenship", "language", "destination", "people", "experience", "workDocs", "readyDate", "job"];
    const filled = required.filter((key) => passportValue(key)).length;
    return {
      score: Math.round((filled / required.length) * 100),
      missing: required.filter((key) => !passportValue(key))
    };
  }

  function calculateAge(birthDateValue) {
    if (!birthDateValue) return "";
    const birthDate = new Date(`${birthDateValue}T00:00:00`);
    if (Number.isNaN(birthDate.getTime())) return "";
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
    return age >= 0 && age < 100 ? String(age) : "";
  }

  function topPassportMatches(limit = 3) {
    return jobs
      .map((job) => ({ job, fit: jobPassportFit(job) }))
      .sort((a, b) => b.fit.score - a.fit.score || new Date(b.job.updatedAt) - new Date(a.job.updatedAt))
      .slice(0, limit);
  }

  function candidatePublicPassportPreview() {
    const copy = candidatePassportCopy();
    const labels = copy.labels;
    const line = (key) => `${labels[key]}: ${passportValue(key) || "—"}`;
    const id = passportValue("id");
    return [
      copy.messageTitle,
      ...(id ? [`${copy.refTitle}: ${id}`] : []),
      "",
      line("name"),
      line("birthDate"),
      line("current"),
      line("citizenship"),
      line("language"),
      line("destination"),
      line("people"),
      line("experience"),
      line("workDocs"),
      line("readyDate"),
      line("job")
    ].join("\n");
  }

  function candidatePassportMessage() {
    const copy = candidatePassportCopy();
    const labels = copy.labels;
    const { score, missing } = passportScore();
    const line = (key) => `${labels[key]}: ${passportValue(key) || "—"}`;
    const id = ensurePassportId();
    const tags = passportTags();
    const age = calculateAge(passportValue("birthDate"));
    const matches = topPassportMatches(3);
    const currentUrl = new URL(window.location.href);
    currentUrl.hash = "";
    return [
      copy.messageTitle,
      `Candidate-ID: ${id}`,
      "",
      line("name"),
      line("birthDate"),
      line("current"),
      line("citizenship"),
      line("language"),
      line("destination"),
      line("people"),
      line("experience"),
      line("workDocs"),
      line("readyDate"),
      line("job"),
      "",
      "INTERNAL ANALYSIS FOR RECRUITER",
      `Calculated age: ${age || "not provided"}`,
      `Readiness: ${score}%`,
      `Tags: ${tags.join(" ")}`,
      `Missing: ${missing.length ? missing.map((key) => labels[key]).join(", ") : "nothing critical"}`,
      "Safety rule: do not request document photos, document numbers, personal codes or bank data in first contact.",
      "",
      "Best vacancy matches:",
      ...matches.map(({ job, fit }, index) => {
        const view = localizedJob(job);
        const reasons = fit.reasons.length ? fit.reasons.join(", ") : "needs manual check";
        const checks = fit.checks.length ? ` | check: ${fit.checks.join(", ")}` : "";
        return `${index + 1}. ${view.title} (${job.id}) — ${fit.score}% | ${reasons}${checks}`;
      }),
      "",
      `${copy.nextQuestions}:`,
      ...copy.questions.map((question, index) => `${index + 1}. ${question}`),
      "",
      `Site: ${currentUrl.toString()}`
    ].join("\n");
  }

  function passportFieldHTML(key, type = "text") {
    const copy = candidatePassportCopy();
    return `
      <label class="candidate-passport-field">
        <span>${escapeHTML(copy.labels[key])}</span>
        <input type="${escapeHTML(type)}" data-passport-field="${escapeHTML(key)}" value="${escapeHTML(passportValue(key))}" placeholder="${escapeHTML(copy.placeholders[key] || "")}" autocomplete="off">
      </label>
    `;
  }

  function passportAgeHelperHTML() {
    const copy = candidatePassportCopy();
    const age = calculateAge(passportValue("birthDate"));
    return `
      <div class="candidate-passport-age-helper${age ? " is-ready" : ""}" role="status">
        <span aria-hidden="true">${age ? age : "?"}</span>
        <div>
          <strong>${escapeHTML(age ? `${copy.ageHelperReady}: ${age}` : copy.ageHelperTitle)}</strong>
          <p>${escapeHTML(age ? copy.ageHelperPrivacy : copy.ageHelperEmpty)}</p>
        </div>
      </div>
    `;
  }

  function passportSelectHTML(key) {
    const copy = candidatePassportCopy();
    const value = passportValue(key);
    return `
      <label class="candidate-passport-field">
        <span>${escapeHTML(copy.labels[key])}</span>
        <select data-passport-field="${escapeHTML(key)}">
          <option value="">—</option>
          ${(copy.options[key] || []).map((option) => `<option value="${escapeHTML(option)}"${option === value ? " selected" : ""}>${escapeHTML(option)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  function passportStartQuickHTML() {
    const copy = candidatePassportCopy();
    const current = passportValue("readyDate");
    return `
      <div class="candidate-passport-start-quick" aria-label="${escapeHTML(copy.startQuickTitle)}">
        <span>${escapeHTML(copy.startQuickTitle)}</span>
        <div>
          ${(copy.startQuickOptions || []).map((option) => `
            <button class="${option === current ? "is-active" : ""}" type="button" data-passport-start-date="${escapeHTML(option)}">${escapeHTML(option)}</button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function passportCurrentQuickHTML() {
    const copy = candidatePassportCopy();
    const current = passportValue("current");
    return `
      <div class="candidate-passport-current-quick" aria-label="${escapeHTML(copy.currentQuickTitle)}">
        <span>${escapeHTML(copy.currentQuickTitle)}</span>
        <div>
          ${(copy.currentQuickOptions || []).map((option) => `
            <button class="${option === current ? "is-active" : ""}" type="button" data-passport-current-place="${escapeHTML(option)}">${escapeHTML(option)}</button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function passportCitizenshipQuickHTML() {
    const copy = candidatePassportCopy();
    const current = passportValue("citizenship");
    return `
      <div class="candidate-passport-citizenship-quick" aria-label="${escapeHTML(copy.citizenshipQuickTitle)}">
        <span>${escapeHTML(copy.citizenshipQuickTitle)}</span>
        <div>
          ${(copy.citizenshipQuickOptions || []).map((option) => `
            <button class="${option === current ? "is-active" : ""}" type="button" data-passport-citizenship="${escapeHTML(option)}">${escapeHTML(option)}</button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function passportLanguageQuickHTML() {
    const copy = candidatePassportCopy();
    const current = passportValue("language");
    const options = copy.options.language || [];
    return `
      <div class="candidate-passport-language-quick" aria-label="${escapeHTML(copy.languageQuickTitle)}">
        <span>${escapeHTML(copy.languageQuickTitle)}</span>
        <div>
          ${options.map((option) => `
            <button class="${option === current ? "is-active" : ""}" type="button" data-passport-language="${escapeHTML(option)}">${escapeHTML(option)}</button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function passportDestinationQuickHTML() {
    const copy = candidatePassportCopy();
    const current = passportValue("destination");
    const options = copy.options.destination || [];
    return `
      <div class="candidate-passport-destination-quick" aria-label="${escapeHTML(copy.destinationQuickTitle)}">
        <span>${escapeHTML(copy.destinationQuickTitle)}</span>
        <div>
          ${options.map((option) => `
            <button class="${option === current ? "is-active" : ""}" type="button" data-passport-destination="${escapeHTML(option)}">${escapeHTML(option)}</button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function passportPeopleQuickHTML() {
    const copy = candidatePassportCopy();
    const current = passportValue("people");
    const options = copy.options.people || [];
    return `
      <div class="candidate-passport-people-quick" aria-label="${escapeHTML(copy.peopleQuickTitle)}">
        <span>${escapeHTML(copy.peopleQuickTitle)}</span>
        <div>
          ${options.map((option) => `
            <button class="${option === current ? "is-active" : ""}" type="button" data-passport-people="${escapeHTML(option)}">${escapeHTML(option)}</button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function passportExperienceQuickHTML() {
    const copy = candidatePassportCopy();
    const current = passportValue("experience");
    const options = copy.options.experience || [];
    return `
      <div class="candidate-passport-experience-quick" aria-label="${escapeHTML(copy.experienceQuickTitle)}">
        <span>${escapeHTML(copy.experienceQuickTitle)}</span>
        <div>
          ${options.map((option) => `
            <button class="${option === current ? "is-active" : ""}" type="button" data-passport-experience="${escapeHTML(option)}">${escapeHTML(option)}</button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function passportExperienceCoachHTML() {
    const copy = candidatePassportCopy();
    const value = passportValue("experience");
    const options = copy.options.experience || [];
    const index = options.indexOf(value);
    const map = [
      copy.experienceCoachNoExperience,
      copy.experienceCoachExperienced,
      copy.experienceCoachDriver,
      copy.experienceCoachWarehouse,
      copy.experienceCoachGreenhouse
    ];
    const text = map[index] || copy.experienceCoachDefault;
    return `
      <div class="candidate-passport-experience-coach${value ? " is-active" : ""}">
        <span aria-hidden="true">${value ? "✓" : "i"}</span>
        <div>
          <strong>${escapeHTML(copy.experienceCoachTitle)}</strong>
          <p>${escapeHTML(text)}</p>
        </div>
      </div>
    `;
  }

  function passportOptionValue(key, index) {
    const options = candidatePassportCopy().options[key] || [];
    return options[index] || "";
  }

  function fillPassportFromInstantMatch() {
    const match = state.instantMatch;
    if (!passportValue("language")) state.passport.language = passportOptionValue("language", 0);
    if (match.current === "eu" && !passportValue("current")) state.passport.current = "EU";
    if (match.current === "ukraine" && !passportValue("current")) state.passport.current = "Ukraine";
    if (match.current === "other" && !passportValue("current")) state.passport.current = "Other country";
    if (match.country === "poland") state.passport.destination = passportOptionValue("destination", 0);
    if (match.country === "other") state.passport.destination = passportOptionValue("destination", 3) || passportOptionValue("destination", 1);
    if (match.people === "solo") state.passport.people = passportOptionValue("people", 0);
    if (match.people === "couple") state.passport.people = passportOptionValue("people", 1);
    if (match.people === "group") state.passport.people = passportOptionValue("people", 2);
    if (match.experience === "none") state.passport.experience = passportOptionValue("experience", 0);
    if (match.experience === "experienced") state.passport.experience = passportOptionValue("experience", 1);
    if (match.area === "transport") {
      state.passport.experience = passportOptionValue("experience", 2);
      state.passport.job = state.passport.job || "driver";
    }
    if (match.area === "warehouse") state.passport.job = state.passport.job || "warehouse";
    if (match.area === "greenhouse") state.passport.job = state.passport.job || "greenhouse";
    if (match.start === "soon") state.passport.readyDate = state.passport.readyDate || "as soon as possible";
    if (match.start === "month") state.passport.readyDate = state.passport.readyDate || "this month";
    if (match.start === "later") state.passport.readyDate = state.passport.readyDate || "later / checking";
    ensurePassportId();
    persistPassport();
    renderCandidatePassport();
  }

  function candidatePassportQuickStartHTML() {
    const copy = candidatePassportCopy();
    return `
      <section class="candidate-passport-quick" aria-label="${escapeHTML(copy.quickTitle)}">
        <div>
          <strong>${escapeHTML(copy.quickTitle)}</strong>
          <small>${escapeHTML(copy.quickIntro)}</small>
        </div>
        <div class="candidate-passport-quick-grid">
          ${(copy.quickStarts || []).map((item) => `
            <button class="candidate-passport-quick-card" type="button" data-passport-quick-start="${escapeHTML(item.id)}">
              <b>${escapeHTML(item.title)}</b>
              <span>${escapeHTML(item.text)}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  }

  function applyPassportQuickStart(id) {
    const copy = candidatePassportCopy();
    const quick = (copy.quickStarts || []).find((item) => item.id === id);
    if (!quick) return;
    if (!passportValue("language")) state.passport.language = passportOptionValue("language", 0);
    state.passport.destination = passportOptionValue("destination", 0);
    state.passport.job = quick.job;
    if (id === "driver") {
      state.passport.experience = passportOptionValue("experience", 2);
      state.passport.people = passportValue("people") || passportOptionValue("people", 0);
    } else {
      state.passport.experience = passportOptionValue("experience", 0);
      state.passport.people = id === "couple" ? passportOptionValue("people", 1) : (passportValue("people") || passportOptionValue("people", 0));
    }
    if (!passportValue("workDocs")) state.passport.workDocs = passportOptionValue("workDocs", 2);
    persistPassport();
    renderCandidatePassport();
    refreshJobLists();
  }

  function applyPassportStartDate(value) {
    state.passport.readyDate = value;
    persistPassport();
    renderCandidatePassport();
    refreshJobLists();
  }

  function applyPassportCurrentPlace(value) {
    state.passport.current = value;
    persistPassport();
    renderCandidatePassport();
    refreshJobLists();
  }

  function applyPassportCitizenship(value) {
    state.passport.citizenship = value;
    persistPassport();
    renderCandidatePassport();
    refreshJobLists();
  }

  function applyPassportLanguage(value) {
    state.passport.language = value;
    persistPassport();
    renderCandidatePassport();
    refreshJobLists();
  }

  function applyPassportDestination(value) {
    state.passport.destination = value;
    persistPassport();
    renderCandidatePassport();
    refreshJobLists();
  }

  function applyPassportPeople(value) {
    state.passport.people = value;
    persistPassport();
    renderCandidatePassport();
    refreshJobLists();
  }

  function applyPassportExperience(value) {
    state.passport.experience = value;
    const options = candidatePassportCopy().options.experience || [];
    const normalized = normalizePassportText(value);
    if (
      value === options[2]
      || value === options[3]
      || value === options[4]
      || normalized.includes("driver")
      || normalized.includes("kierow")
      || normalized.includes("warehouse")
      || normalized.includes("magaz")
      || normalized.includes("greenhouse")
      || normalized.includes("szkl")
    ) {
      state.passport.job = value;
    }
    persistPassport();
    renderCandidatePassport();
    refreshJobLists();
  }

  function focusPassportField(key) {
    const field = document.querySelector(`[data-passport-field="${CSS.escape(key)}"]`);
    if (!field) return;
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => field.focus({ preventScroll: true }), 240);
  }

  function passportFitCopy() {
    const copy = {
      en: {
        label: "Passport fit",
        empty: "Fill candidate application",
        why: "Why",
        check: "Check",
        country: "country matches",
        noExperience: "can start without experience",
        driver: "driver direction matches",
        warehouse: "warehouse direction matches",
        greenhouse: "greenhouse direction matches",
        couple: "may fit a couple",
        askCountry: "country",
        askDocs: "paperwork",
        askStart: "start date"
      },
      ru: {
        label: "Совпадение",
        empty: "Заполните заявку",
        why: "Почему",
        check: "Уточнить",
        country: "страна совпадает",
        noExperience: "можно без опыта",
        driver: "совпадает направление водителя",
        warehouse: "совпадает склад",
        greenhouse: "совпадает теплица",
        couple: "может подойти паре",
        askCountry: "страну",
        askDocs: "оформление",
        askStart: "дату старта"
      },
      uk: {
        label: "Збіг",
        empty: "Заповніть заявку",
        why: "Чому",
        check: "Уточнити",
        country: "країна збігається",
        noExperience: "можна без досвіду",
        driver: "збігається напрям водія",
        warehouse: "збігається склад",
        greenhouse: "збігається теплиця",
        couple: "може підійти парі",
        askCountry: "країну",
        askDocs: "оформлення",
        askStart: "дату старту"
      },
      pl: {
        label: "Dopasowanie",
        empty: "Wypełnij zgłoszenie",
        why: "Dlaczego",
        check: "Sprawdź",
        country: "kraj pasuje",
        noExperience: "można bez doświadczenia",
        driver: "pasuje kierowca",
        warehouse: "pasuje magazyn",
        greenhouse: "pasuje szklarnia",
        couple: "może pasować dla pary",
        askCountry: "kraj",
        askDocs: "formalności",
        askStart: "datę startu"
      }
    };
    return copy[i18n.locale] || copy.en;
  }

  function jobPassportFit(job) {
    const copy = passportFitCopy();
    const target = passportTargetCountry();
    const experience = normalizePassportText(passportValue("experience"));
    const people = normalizePassportText(passportValue("people"));
    const desiredJob = normalizePassportText(passportValue("job"));
    const hasPassportData = ["destination", "experience", "people", "job", "readyDate"].some((key) => passportValue(key));
    if (!hasPassportData) return { score: 0, reasons: [copy.empty], checks: [] };
    let score = 12;
    const reasons = [];
    const checks = [];
    if (target) {
      const countryMatch = (target === "poland" && job.format === "Польша") || (target === "hungary" && job.format === "Венгрия") || (target === "belgium" && job.format === "Бельгия");
      if (countryMatch) {
        score += 28;
        reasons.push(copy.country);
      } else {
        checks.push(copy.askCountry);
      }
    }
    if (experience.includes("без") || experience.includes("no experience") || experience.includes("bez do") || experience.includes("без дос")) {
      if (job.level === "Без опыта") {
        score += 22;
        reasons.push(copy.noExperience);
      }
    }
    if ((experience.includes("driver") || experience.includes("вод") || experience.includes("kierow") || desiredJob.includes("driver") || desiredJob.includes("вод")) && (job.id.startsWith("driver-") || job.category === "Транспорт")) {
      score += 24;
      reasons.push(copy.driver);
    }
    if ((desiredJob.includes("warehouse") || desiredJob.includes("склад") || desiredJob.includes("magaz")) && job.category === "Склад") {
      score += 20;
      reasons.push(copy.warehouse);
    }
    if ((desiredJob.includes("green") || desiredJob.includes("тепл") || desiredJob.includes("szkl")) && job.category === "Теплицы") {
      score += 20;
      reasons.push(copy.greenhouse);
    }
    if ((people.includes("пар") || people.includes("couple") || people.includes("para")) && (job.candidates || []).some((candidate) => normalizePassportText(candidate).includes("пар"))) {
      score += 14;
      reasons.push(copy.couple);
    }
    if (!passportValue("workDocs")) checks.push(copy.askDocs);
    if (!passportValue("readyDate")) checks.push(copy.askStart);
    if (!reasons.length) score = Math.min(score, 35);
    return {
      score: Math.min(100, Math.max(0, score)),
      reasons: reasons.slice(0, 2),
      checks: [...new Set(checks)].slice(0, 2)
    };
  }

  function renderPassportFit(job) {
    const copy = passportFitCopy();
    const fit = jobPassportFit(job);
    return `
      <div class="passport-fit${fit.score >= 70 ? " is-strong" : fit.score <= 25 ? " is-empty" : ""}">
        <div class="passport-fit-top">
          <span>${escapeHTML(copy.label)}</span>
          <strong>${fit.score}%</strong>
        </div>
        <div class="passport-fit-bar"><span style="width:${fit.score}%"></span></div>
        <p>
          ${fit.reasons.length ? `<b>${escapeHTML(copy.why)}:</b> ${escapeHTML(fit.reasons.join(", "))}` : escapeHTML(copy.empty)}
          ${fit.checks.length ? `<br><b>${escapeHTML(copy.check)}:</b> ${escapeHTML(fit.checks.join(", "))}` : ""}
        </p>
      </div>
    `;
  }

  function passportNameLooksLatin() {
    const name = passportValue("name");
    if (!name) return false;
    return !/[А-Яа-яІіЇїЄєҐґԱ-ֆა-ჰऀ-ॿ]/.test(name);
  }

  function transliterateToLatin(value) {
    const transliterateDevanagari = (text) => {
      const consonants = {
        क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "ng", च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "ny",
        ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n", त: "t", थ: "th", द: "d", ध: "dh", न: "n",
        प: "p", फ: "ph", ब: "b", भ: "bh", म: "m", य: "y", र: "r", ल: "l", व: "w",
        श: "sh", ष: "sh", स: "s", ह: "h", क्ष: "ksh", त्र: "tr", ज्ञ: "gy"
      };
      const vowels = { अ: "a", आ: "aa", इ: "i", ई: "i", उ: "u", ऊ: "u", ए: "e", ऐ: "ai", ओ: "o", औ: "au", ऋ: "ri" };
      const signs = { "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri", "ं": "n", "ँ": "n", "ः": "h" };
      let result = "";
      for (let index = 0; index < text.length; index += 1) {
        const pair = text.slice(index, index + 2);
        const char = text[index];
        const base = consonants[pair] || consonants[char];
        if (base) {
          if (consonants[pair]) index += 1;
          const next = text[index + 1];
          if (next === "्") {
            result += base;
            index += 1;
          } else if (signs[next]) {
            result += base + signs[next];
            index += 1;
          } else {
            result += `${base}a`;
          }
        } else {
          result += vowels[char] || signs[char] || (char === "्" ? "" : char);
        }
      }
      return result;
    };
    const map = {
      А: "A", а: "a", Б: "B", б: "b", В: "V", в: "v", Г: "H", г: "h", Ґ: "G", ґ: "g",
      Д: "D", д: "d", Е: "E", е: "e", Є: "Ye", є: "ie", Ж: "Zh", ж: "zh", З: "Z", з: "z",
      И: "Y", и: "y", І: "I", і: "i", Ї: "Yi", ї: "i", Й: "Y", й: "i", К: "K", к: "k",
      Л: "L", л: "l", М: "M", м: "m", Н: "N", н: "n", О: "O", о: "o", П: "P", п: "p",
      Р: "R", р: "r", С: "S", с: "s", Т: "T", т: "t", У: "U", у: "u", Ф: "F", ф: "f",
      Х: "Kh", х: "kh", Ц: "Ts", ц: "ts", Ч: "Ch", ч: "ch", Ш: "Sh", ш: "sh", Щ: "Shch", щ: "shch",
      Ю: "Yu", ю: "iu", Я: "Ya", я: "ia", Ы: "Y", ы: "y", Э: "E", э: "e", Ё: "Yo", ё: "io",
      Ь: "", ь: "", Ъ: "", ъ: "",
      ა: "a", ბ: "b", გ: "g", დ: "d", ე: "e", ვ: "v", ზ: "z", თ: "t", ი: "i", კ: "k",
      ლ: "l", მ: "m", ნ: "n", ო: "o", პ: "p", ჟ: "zh", რ: "r", ს: "s", ტ: "t", უ: "u",
      ფ: "p", ქ: "k", ღ: "gh", ყ: "q", შ: "sh", ჩ: "ch", ც: "ts", ძ: "dz", წ: "ts", ჭ: "ch",
      ხ: "kh", ჯ: "j", ჰ: "h",
      Ա: "A", ա: "a", Բ: "B", բ: "b", Գ: "G", գ: "g", Դ: "D", դ: "d", Ե: "Ye", ե: "e",
      Զ: "Z", զ: "z", Է: "E", է: "e", Ը: "Y", ը: "y", Թ: "T", թ: "t", Ժ: "Zh", ժ: "zh",
      Ի: "I", ի: "i", Լ: "L", լ: "l", Խ: "Kh", խ: "kh", Ծ: "Ts", ծ: "ts", Կ: "K", կ: "k",
      Հ: "H", հ: "h", Ձ: "Dz", ձ: "dz", Ղ: "Gh", ղ: "gh", Ճ: "Ch", ճ: "ch", Մ: "M", մ: "m",
      Յ: "Y", յ: "y", Ն: "N", ն: "n", Շ: "Sh", շ: "sh", Ո: "Vo", ո: "o", Չ: "Ch", չ: "ch",
      Պ: "P", պ: "p", Ջ: "J", ջ: "j", Ռ: "R", ռ: "r", Ս: "S", ս: "s", Վ: "V", վ: "v",
      Տ: "T", տ: "t", Ր: "R", ր: "r", Ց: "Ts", ց: "ts", Ւ: "V", ւ: "v", Փ: "P", փ: "p",
      Ք: "K", ք: "k", Օ: "O", օ: "o", Ֆ: "F", ֆ: "f", և: "ev"
    };
    const source = String(value || "");
    const normalizedSource = /[\u0900-\u097F]/.test(source) ? transliterateDevanagari(source) : source;
    return normalizedSource
      .split("")
      .map((char) => map[char] ?? char)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }

  function applyPassportLatinName() {
    const latinName = transliterateToLatin(passportValue("name"));
    if (!latinName || latinName === passportValue("name")) return;
    state.passport.name = latinName;
    persistPassport();
    renderCandidatePassport();
    focusPassportField("name");
  }

  function candidatePassportSmartCheckHTML() {
    const copy = candidatePassportCopy();
    const age = calculateAge(passportValue("birthDate"));
    const latinSuggestion = transliterateToLatin(passportValue("name"));
    const needsLatinAction = Boolean(passportValue("name")) && !passportNameLooksLatin() && latinSuggestion && latinSuggestion !== passportValue("name");
    const checks = [
      { ok: passportNameLooksLatin(), text: passportNameLooksLatin() ? copy.latinOk : copy.latinNeed },
      { ok: Boolean(age), text: age ? `${copy.ageOk}: ${age}` : copy.ageNeed },
      { ok: Boolean(passportValue("job") || passportValue("experience")), text: passportValue("job") || passportValue("experience") ? copy.directionOk : copy.directionNeed },
      { ok: true, text: copy.safeOk }
    ];
    return `
      <section class="candidate-passport-smart" aria-label="${escapeHTML(copy.smartTitle)}">
        <strong>${escapeHTML(copy.smartTitle)}</strong>
        <div>
          ${checks.map((item) => `
            <span class="${item.ok ? "is-ok" : "is-waiting"}">
              <i aria-hidden="true">${item.ok ? "✓" : "!"}</i>
              ${escapeHTML(item.text)}
            </span>
          `).join("")}
        </div>
        ${needsLatinAction ? `
          <div class="candidate-passport-latin-suggestion">
            <small>${escapeHTML(copy.latinPreview)}</small>
            <b>${escapeHTML(latinSuggestion)}</b>
            <button class="candidate-passport-latin-action" type="button" data-passport-latin-name>${escapeHTML(copy.latinAction)}</button>
          </div>
        ` : ""}
      </section>
    `;
  }

  function candidatePassportBriefHTML() {
    const copy = candidatePassportCopy();
    const age = calculateAge(passportValue("birthDate"));
    const chips = [
      [copy.briefAge, age],
      [copy.briefCountry, passportValue("destination")],
      [copy.briefDirection, passportValue("job") || passportValue("experience")],
      [copy.briefStart, passportValue("readyDate")]
    ].filter(([, value]) => value);
    return `
      <section class="candidate-passport-brief" aria-label="${escapeHTML(copy.briefTitle)}">
        <div class="candidate-passport-brief-head">
          <strong>${escapeHTML(copy.briefTitle)}</strong>
          <span>${chips.length}/4</span>
        </div>
        ${chips.length ? `
          <div class="candidate-passport-brief-chips">
            ${chips.map(([label, value]) => `
              <span>
                <small>${escapeHTML(label)}</small>
                <b>${escapeHTML(value)}</b>
              </span>
            `).join("")}
          </div>
        ` : `<p>${escapeHTML(copy.briefEmpty)}</p>`}
      </section>
    `;
  }

  function passportSavedAtText() {
    const value = state.passport?._savedAt;
    if (!value) return "";
    const savedAt = new Date(value);
    if (Number.isNaN(savedAt.getTime())) return "";
    try {
      return new Intl.DateTimeFormat(i18n.localeTag(), { hour: "2-digit", minute: "2-digit" }).format(savedAt);
    } catch {
      return savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  }

  function candidatePassportSaveStatusHTML() {
    const copy = candidatePassportCopy();
    const savedAt = passportSavedAtText();
    return `
      <div class="candidate-passport-save-status${savedAt ? " is-saved" : ""}" role="status">
        <span aria-hidden="true"></span>
        <div>
          <strong>${escapeHTML(savedAt ? `${copy.saveTitle} · ${savedAt}` : copy.saveTitle)}</strong>
          <small>${escapeHTML(savedAt ? copy.saveOnlyAfterWhatsApp : copy.saveEmpty)}</small>
        </div>
      </div>
    `;
  }

  function candidatePassportAfterHTML() {
    const copy = candidatePassportCopy();
    return `
      <section class="candidate-passport-after" aria-label="${escapeHTML(copy.afterTitle)}">
        <strong>${escapeHTML(copy.afterTitle)}</strong>
        <ol>
          ${(copy.afterSteps || []).map(([title, text]) => `
            <li>
              <span aria-hidden="true"></span>
              <div>
                <b>${escapeHTML(title)}</b>
                <small>${escapeHTML(text)}</small>
              </div>
            </li>
          `).join("")}
        </ol>
      </section>
    `;
  }

  function candidatePassportSendReadinessHTML(score, missing) {
    const copy = candidatePassportCopy();
    const level = score >= 82 ? "strong" : score >= 55 ? "good" : "weak";
    const text = level === "strong" ? copy.sendReadyStrong : level === "good" ? copy.sendReadyGood : copy.sendReadyWeak;
    const nextKey = missing[0];
    const checklist = [
      { ok: true, text: copy.sendChecklistSafe },
      { ok: Boolean(calculateAge(passportValue("birthDate"))), text: copy.sendChecklistAge },
      { ok: hasPassportMatchInput(), text: copy.sendChecklistMatches },
      ...missing.slice(0, 3).map((key) => ({ ok: false, text: `${copy.sendChecklistMissing}: ${copy.labels[key]}` }))
    ];
    return `
      <section class="candidate-passport-send-ready is-${level}" aria-label="${escapeHTML(copy.sendReadyTitle)}">
        <div>
          <strong>${escapeHTML(copy.sendReadyTitle)}</strong>
          <span>${score}%</span>
        </div>
        <div class="candidate-passport-send-meter" aria-hidden="true"><i style="width:${score}%"></i></div>
        <p>${escapeHTML(text)}</p>
        <div class="candidate-passport-send-checklist" aria-label="${escapeHTML(copy.sendChecklistTitle)}">
          <small>${escapeHTML(copy.sendChecklistTitle)}</small>
          <ul>
            ${checklist.slice(0, 6).map((item) => `
              <li class="${item.ok ? "is-ok" : "is-missing"}">
                <i aria-hidden="true">${item.ok ? "✓" : "+"}</i>
                <span>${escapeHTML(item.ok ? `${copy.sendChecklistReady}: ${item.text}` : item.text)}</span>
              </li>
            `).join("")}
          </ul>
        </div>
        ${nextKey ? `<button class="text-link" type="button" data-passport-focus-missing="${escapeHTML(nextKey)}">${escapeHTML(copy.sendReadyNext)}: ${escapeHTML(copy.labels[nextKey])} →</button>` : ""}
      </section>
    `;
  }

  function hasPassportMatchInput() {
    return ["destination", "experience", "people", "job", "readyDate"].some((key) => passportValue(key));
  }

  function candidatePassportMatchesHTML() {
    const copy = candidatePassportCopy();
    const fitCopy = passportFitCopy();
    if (!hasPassportMatchInput()) {
      return `
        <section class="candidate-passport-matches is-empty" aria-label="${escapeHTML(copy.matchTitle)}">
          <div class="candidate-passport-matches-head">
            <strong>${escapeHTML(copy.matchTitle)}</strong>
            <span>0%</span>
          </div>
          <p>${escapeHTML(copy.matchEmpty)}</p>
        </section>
      `;
    }
    const matches = topPassportMatches(3);
    return `
      <section class="candidate-passport-matches" aria-label="${escapeHTML(copy.matchTitle)}">
        <div class="candidate-passport-matches-head">
          <strong>${escapeHTML(copy.matchTitle)}</strong>
          <span>${escapeHTML(fitCopy.label)}</span>
        </div>
        <div class="candidate-passport-match-grid">
          ${matches.map(({ job, fit }, index) => {
            const view = localizedJob(job);
            const reasons = fit.reasons.filter((reason) => reason !== fitCopy.empty);
            return `
              <article class="candidate-passport-match-card">
                <div>
                  <b>${String(index + 1).padStart(2, "0")}</b>
                  <strong>${fit.score}%</strong>
                </div>
                <h4>${escapeHTML(view.title)}</h4>
                <p>${escapeHTML(view.format)} · ${formatSalary(view.salary)}</p>
                <small>
                  ${reasons.length ? `<span>${escapeHTML(copy.matchWhy)}:</span> ${escapeHTML(reasons.join(", "))}` : escapeHTML(fitCopy.empty)}
                  ${fit.checks.length ? `<br><span>${escapeHTML(copy.matchCheck)}:</span> ${escapeHTML(fit.checks.join(", "))}` : ""}
                </small>
                <button class="text-link" type="button" data-job-open="${escapeHTML(job.id)}">${escapeHTML(copy.matchOpen)} →</button>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function candidatePassportCoachHTML(score, missing) {
    const copy = candidatePassportCopy();
    const nextKey = missing[0];
    const hint = nextKey ? copy.coachHints?.[nextKey] : copy.coachHintReady;
    return `
      <div class="candidate-passport-coach${missing.length ? "" : " is-ready"}">
        <div class="candidate-passport-coach-top">
          <span>${escapeHTML(copy.completionTitle)}</span>
          <strong>${score}%</strong>
        </div>
        <div class="candidate-passport-coach-meter" aria-hidden="true"><span style="width:${score}%"></span></div>
        <p>
          <b>${escapeHTML(missing.length ? copy.nextStep : copy.ready)}:</b>
          ${escapeHTML(missing.length ? copy.labels[nextKey] : copy.readyText)}
        </p>
        ${hint ? `<small class="candidate-passport-coach-hint">${escapeHTML(hint)}</small>` : ""}
        ${missing.length ? `<button class="button button-secondary" type="button" data-passport-focus-missing="${escapeHTML(nextKey)}">${escapeHTML(copy.focusNext)}</button>` : ""}
      </div>
    `;
  }

  function renderPassportSticky() {
    const container = el("passport-sticky");
    if (!container) return;
    const copy = candidatePassportCopy();
    const { score, missing } = passportScore();
    const nextKey = missing[0];
    const statusText = missing.length ? copy.labels[nextKey] : copy.readyText;
    container.innerHTML = `
      <div class="passport-sticky-meter" aria-hidden="true"><span style="width:${score}%"></span></div>
      <div class="passport-sticky-copy">
        <strong>${escapeHTML(copy.stickyTitle)} · ${score}%</strong>
        <small>${escapeHTML(statusText)}</small>
      </div>
      <div class="passport-sticky-actions">
        ${missing.length ? `<button class="button button-secondary" type="button" data-passport-focus-missing="${escapeHTML(nextKey)}">${escapeHTML(copy.stickyNext)}</button>` : ""}
        <button class="button button-whatsapp" type="button" data-passport-whatsapp>${escapeHTML(copy.stickySend)}</button>
      </div>
    `;
    container.hidden = false;
  }

  function renderCandidatePassport() {
    const layout = el("candidate-passport-layout");
    if (!layout) return;
    const copy = candidatePassportCopy();
    const { score, missing } = passportScore();
    if (el("candidate-passport-kicker")) el("candidate-passport-kicker").textContent = copy.kicker;
    if (el("candidate-passport-heading")) el("candidate-passport-heading").textContent = copy.title;
    if (el("candidate-passport-intro")) el("candidate-passport-intro").textContent = copy.intro;
    layout.innerHTML = `
      <form class="candidate-passport-form" id="candidate-passport-form">
        <h3>${escapeHTML(copy.fieldsTitle)}</h3>
        <div class="candidate-passport-safe-grid" aria-label="Candidate application safety">
          ${(copy.safetyCards || []).map(([title, text]) => `
            <article>
              <span aria-hidden="true">✓</span>
              <strong>${escapeHTML(title)}</strong>
              <small>${escapeHTML(text)}</small>
            </article>
          `).join("")}
        </div>
        ${candidatePassportQuickStartHTML()}
        <div class="candidate-passport-fields">
          ${passportFieldHTML("name")}
          ${passportFieldHTML("birthDate", "date")}
          ${passportAgeHelperHTML()}
          ${passportFieldHTML("current")}
          ${passportCurrentQuickHTML()}
          ${passportFieldHTML("citizenship")}
          ${passportCitizenshipQuickHTML()}
          ${passportSelectHTML("language")}
          ${passportLanguageQuickHTML()}
          ${passportSelectHTML("destination")}
          ${passportDestinationQuickHTML()}
          ${passportSelectHTML("people")}
          ${passportPeopleQuickHTML()}
          ${passportSelectHTML("experience")}
          ${passportExperienceQuickHTML()}
          ${passportExperienceCoachHTML()}
          ${passportSelectHTML("workDocs")}
          ${passportFieldHTML("readyDate")}
          ${passportStartQuickHTML()}
          ${passportFieldHTML("job")}
        </div>
        <p class="candidate-passport-privacy">${escapeHTML(copy.privacy)}</p>
        ${candidatePassportSaveStatusHTML()}
      </form>
      <aside class="candidate-passport-preview">
        ${candidatePassportCoachHTML(score, missing)}
        ${candidatePassportReferenceHTML()}
        ${candidatePassportSmartCheckHTML()}
        ${candidatePassportBriefHTML()}
        ${candidatePassportMatchesHTML()}
        <div class="candidate-passport-message">
          <strong>${escapeHTML(copy.previewTitle)}</strong>
          <pre>${escapeHTML(candidatePublicPassportPreview())}</pre>
        </div>
        <div class="candidate-passport-missing">
          <strong>${escapeHTML(missing.length ? copy.missing : copy.ready)}</strong>
          ${missing.length ? `<ul>${missing.slice(0, 4).map((key) => `
            <li>
              <button type="button" data-passport-focus-missing="${escapeHTML(key)}">${escapeHTML(copy.labels[key])}</button>
            </li>
          `).join("")}</ul>` : ""}
        </div>
        <div class="candidate-passport-actions">
          <button class="button button-whatsapp" type="button" data-passport-whatsapp>${escapeHTML(copy.send)}</button>
          <button class="button button-primary" type="button" data-passport-fill-match>${escapeHTML(copy.fillFromMatch)}</button>
          <button class="button button-secondary" type="button" data-passport-copy>${escapeHTML(copy.copy)}</button>
          <button class="button button-quiet" type="button" data-passport-clear>${escapeHTML(copy.clear)}</button>
        </div>
        ${candidatePassportSendReadinessHTML(score, missing)}
        ${candidatePassportAfterHTML()}
      </aside>
    `;
    renderPassportSticky();
  }

  function renderInstantMatcher() {
    const copy = instantMatchCopy();
    if (el("instant-match-kicker")) el("instant-match-kicker").textContent = copy.kicker;
    if (el("instant-match-heading")) el("instant-match-heading").textContent = copy.title;
    if (el("instant-match-intro")) el("instant-match-intro").textContent = copy.intro;
    if (!el("instant-match-panel")) return;
    const groups = [
      {
        id: "current",
        title: copy.current,
        choices: [["any", copy.any], ["eu", copy.currentEu], ["ukraine", copy.currentUkraine], ["other", copy.currentOther]]
      },
      {
        id: "country",
        title: copy.country,
        choices: [["any", copy.any], ["poland", copy.poland], ["other", copy.other]]
      },
      {
        id: "experience",
        title: copy.experience,
        choices: [["any", copy.any], ["none", copy.noExperience], ["experienced", copy.experienced]]
      },
      {
        id: "area",
        title: copy.area,
        choices: [["any", copy.any], ["greenhouse", copy.greenhouse], ["warehouse", copy.warehouse], ["transport", copy.transport]]
      },
      {
        id: "people",
        title: copy.people,
        choices: [["any", copy.any], ["solo", copy.solo], ["couple", copy.couple], ["group", copy.group]]
      },
      {
        id: "start",
        title: copy.start,
        choices: [["any", copy.any], ["soon", copy.soon], ["month", copy.month], ["later", copy.later]]
      }
    ];
    const matches = instantMatches();
    el("instant-match-panel").innerHTML = `
      <div class="instant-choice-grid">
        ${groups.map((group) => `
          <fieldset class="instant-choice-group">
            <legend>${escapeHTML(group.title)}</legend>
            <div>${group.choices.map(([value, label]) => instantChoiceButton(group.id, value, label)).join("")}</div>
          </fieldset>
        `).join("")}
      </div>
      <div class="instant-result-head">
        <strong>${escapeHTML(copy.results)}</strong>
        <small>${escapeHTML(copy.note)}</small>
        <button class="button button-whatsapp instant-whatsapp" type="button" data-instant-whatsapp>${escapeHTML(copy.whatsapp)}</button>
      </div>
      ${instantMatchPreview(matches)}
      <div class="instant-result-grid">
        ${matches.map((job) => {
          const view = localizedJob(job);
          const reasons = instantJobReasons(job);
          return `
            <article class="instant-result-card">
              <strong class="instant-result-badge">${escapeHTML(instantJobBadge(job, matches.indexOf(job)))}</strong>
              <span>${escapeHTML(view.format)} · ${escapeHTML(view.level)}</span>
              <h3>${escapeHTML(view.title)}</h3>
              <p>${formatSalary(view.salary)}</p>
              <div class="instant-reasons">
                <small>${escapeHTML(copy.whyTitle)}</small>
                <ul>${reasons.map((reason) => `<li>${escapeHTML(reason)}</li>`).join("")}</ul>
              </div>
              <div>
                <button class="button button-primary" type="button" data-job-open="${escapeHTML(job.id)}">${escapeHTML(copy.open)}</button>
                <button class="button button-secondary" type="button" data-job-survey="${escapeHTML(job.id)}">${escapeHTML(copy.apply)}</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderCandidateSituations() {
    const copy = conversionCopy();
    if (el("candidate-situations-kicker")) el("candidate-situations-kicker").textContent = copy.situationsKicker;
    if (el("candidate-situations-heading")) el("candidate-situations-heading").textContent = copy.situationsTitle;
    if (!el("candidate-situation-grid")) return;
    const situations = [
      { id: "poland", title: copy.situationPolandTitle, text: copy.situationPolandText, action: copy.showJobs, filter: "country:poland" },
      { id: "no-exp", title: copy.situationNoExperienceTitle, text: copy.situationNoExperienceText, action: copy.showJobs, filter: "level:noExperience" },
      { id: "couple", title: copy.situationCoupleTitle, text: copy.situationCoupleText, action: copy.startSurvey, survey: true },
      { id: "driver", title: copy.situationDriverTitle, text: copy.situationDriverText, action: copy.showJobs, filter: "category:driver" },
      { id: "documents", title: copy.situationDocumentsTitle, text: copy.situationDocumentsText, action: copy.startSurvey, survey: true }
    ];
    el("candidate-situation-grid").innerHTML = situations.map((item) => `
      <article class="candidate-situation-card">
        <span aria-hidden="true">${svgIcon(item.survey ? "shield" : item.id === "driver" ? "truck" : "check")}</span>
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.text)}</p>
        <button class="text-link" type="button" ${item.survey ? "data-application-general" : `data-quick-filter="${escapeHTML(item.filter)}"`}>${escapeHTML(item.action)} →</button>
      </article>
    `).join("");
  }

  function jobScoreCopy() {
    const copy = {
      ru: {
        start: "Старт",
        experience: "Опыт",
        load: "Нагрузка",
        docs: "Оформление",
        couples: "Пары",
        startCheck: "проверка",
        startEasy: "проще",
        expNone: "не нужен",
        expUseful: "желателен",
        expRequired: "обязателен",
        loadMedium: "средняя",
        loadHigh: "высокая",
        loadResponsible: "ответственная",
        docsStandard: "стандартно",
        docsCheck: "проверить",
        couplesYes: "возможно",
        couplesClarify: "уточнить"
      },
      uk: {
        start: "Старт",
        experience: "Досвід",
        load: "Навантаження",
        docs: "Оформлення",
        couples: "Пари",
        startCheck: "перевірка",
        startEasy: "простіше",
        expNone: "не потрібен",
        expUseful: "бажаний",
        expRequired: "обов’язковий",
        loadMedium: "середнє",
        loadHigh: "високе",
        loadResponsible: "відповідальна",
        docsStandard: "стандартно",
        docsCheck: "перевірити",
        couplesYes: "можливо",
        couplesClarify: "уточнити"
      },
      pl: {
        start: "Start",
        experience: "Doświadczenie",
        load: "Obciążenie",
        docs: "Formalności",
        couples: "Pary",
        startCheck: "sprawdzenie",
        startEasy: "łatwiej",
        expNone: "nie trzeba",
        expUseful: "mile widziane",
        expRequired: "wymagane",
        loadMedium: "średnie",
        loadHigh: "wysokie",
        loadResponsible: "odpowiedzialna",
        docsStandard: "standardowo",
        docsCheck: "sprawdzić",
        couplesYes: "możliwe",
        couplesClarify: "dopytać"
      },
      en: {
        start: "Start",
        experience: "Experience",
        load: "Workload",
        docs: "Paperwork",
        couples: "Couples",
        startCheck: "check",
        startEasy: "easier",
        expNone: "not needed",
        expUseful: "useful",
        expRequired: "required",
        loadMedium: "medium",
        loadHigh: "high",
        loadResponsible: "responsible",
        docsStandard: "standard",
        docsCheck: "check",
        couplesYes: "possible",
        couplesClarify: "clarify"
      }
    };
    return { ...copy.en, ...(copy[i18n.locale] || {}) };
  }

  function jobScoreItems(job, view) {
    const copy = jobScoreCopy();
    const searchable = [job.id, job.category, job.level, view.title, view.level, ...(view.required || [])].join(" ").toLowerCase();
    const isDriver = job.id.startsWith("driver-") || job.category === "Транспорт";
    const isWarehouse = job.category === "Склад";
    const isGreenhouse = job.category === "Теплицы";
    const needsDocsCheck = isDriver || searchable.includes("udt") || searchable.includes("c+e") || searchable.includes("code 95") || job.level !== "Без опыта";
    const couplesPossible = (view.candidates || []).some((candidate) => candidate.toLowerCase().includes("пар"));
    const experienceValue = job.level === "Без опыта"
      ? copy.expNone
      : job.level.includes("желател")
        ? copy.expUseful
        : copy.expRequired;
    const loadValue = isDriver
      ? copy.loadResponsible
      : (isWarehouse || isGreenhouse || job.category === "Производство")
        ? copy.loadHigh
        : copy.loadMedium;
    return [
      { label: copy.start, value: job.status === "open" ? copy.startEasy : copy.startCheck, tone: job.status === "open" ? "good" : "check" },
      { label: copy.experience, value: experienceValue, tone: job.level === "Без опыта" ? "good" : "check" },
      { label: copy.load, value: loadValue, tone: loadValue === copy.loadHigh ? "warm" : "check" },
      { label: copy.docs, value: needsDocsCheck ? copy.docsCheck : copy.docsStandard, tone: needsDocsCheck ? "check" : "good" },
      { label: copy.couples, value: couplesPossible ? copy.couplesYes : copy.couplesClarify, tone: couplesPossible ? "good" : "check" }
    ];
  }

  function renderJobCard(job, context = "catalog") {
    const view = localizedJob(job);
    const visualType = jobVisualType(job.id);
    const titleId = `${context}-job-${job.id}-title`;
    const startLabel = i18n.locale === "ru"
      ? "Уточнить старт"
      : i18n.locale === "uk"
        ? "Уточнити старт"
        : i18n.locale === "pl"
          ? "Dopytaj o start"
          : "Ask start date";
    return `
      <article class="job-card" data-status="${escapeHTML(job.status)}" data-visual="${visualType}" data-salary-confirmed="${Boolean(job.salary?.confirmed)}" aria-labelledby="${escapeHTML(titleId)}">
        <div class="job-card-top">
          <div class="job-card-tags">
            <span class="tag tag-country">${escapeHTML(view.format)}</span>
            <span class="tag">${escapeHTML(view.level)}</span>
          </div>
        </div>
        <div class="job-card-identity">
          <span class="job-card-visual" aria-hidden="true">${svgIcon(jobVisualIconName(visualType), "job-visual-icon")}</span>
          <div>
            <h3 id="${escapeHTML(titleId)}">${escapeHTML(view.title)}</h3>
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
        <div class="job-score" aria-label="Job score">
          ${jobScoreItems(job, view).map((item) => `
            <span class="job-score-pill is-${escapeHTML(item.tone)}">
              <small>${escapeHTML(item.label)}</small>
              <strong>${escapeHTML(item.value)}</strong>
            </span>
          `).join("")}
        </div>
        <p class="job-card-availability">
          ${svgIcon("clock")}
          <span>${escapeHTML(t("ui.startNeedsConfirmation"))}</span>
        </p>
        <div class="job-card-actions job-card-actions-single">
          <button class="button button-primary button-block" type="button" data-job-open="${escapeHTML(job.id)}"><span>${escapeHTML(t("ui.details"))}</span>${svgIcon("arrow")}</button>
          <button class="button button-whatsapp job-card-start" type="button" data-job-chat="${escapeHTML(job.id)}">${svgIcon("whatsapp")}<span>${escapeHTML(startLabel)}</span></button>
          <button class="button button-secondary button-icon" type="button" data-job-share="${escapeHTML(job.id)}" aria-label="${escapeHTML(t("ui.share"))}">${svgIcon("share")}</button>
        </div>
      </article>
    `;
  }

  function renderFeaturedJobs() {
    const preferredIds = ["greenhouse-tomatoes", "banana-warehouse-poland", "driver-ce-poland"];
    const availableJobs = jobs.filter((job) => ["open", "verify"].includes(job.status));
    const pool = availableJobs.length ? availableJobs : jobs;
    const featured = preferredIds.map((id) => pool.find((job) => job.id === id)).filter(Boolean);
    const selectedIds = new Set(featured.map((job) => job.id));
    const selectedCategories = new Set(featured.map((job) => job.category));

    pool.forEach((job) => {
      if (featured.length >= 3 || selectedIds.has(job.id) || selectedCategories.has(job.category)) return;
      featured.push(job);
      selectedIds.add(job.id);
      selectedCategories.add(job.category);
    });

    pool.forEach((job) => {
      if (featured.length >= 3 || selectedIds.has(job.id)) return;
      featured.push(job);
      selectedIds.add(job.id);
    });

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
        && (!level || view.level === level)
        && matchesQuickFilter(job);
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
    renderQuickStart();
    renderCountryExplorer();
  }

  function resetFilters() {
    state.quickFilter = "";
    el("job-filters").reset();
    renderAllJobs();
  }

  function matchesQuickFilter(job) {
    if (!state.quickFilter) return true;
    const [type, value] = state.quickFilter.split(":");
    if (type === "country" && value === "poland") return job.format === "Польша";
    if (type === "country" && value === "hungary") return job.format === "Венгрия";
    if (type === "country" && value === "belgium") return job.format === "Бельгия";
    if (type === "country" && value === "other") return job.format !== "Польша";
    if (type === "level" && value === "noExperience") return job.level === "Без опыта";
    if (type === "category" && value === "driver") return job.id.startsWith("driver-") || job.category === "Водители";
    if (type === "category" && value === "greenhouse") return job.category === "Теплицы";
    if (type === "category" && value === "warehouse") return job.category === "Склад";
    return true;
  }

  function applyQuickFilter(filter) {
    state.quickFilter = state.quickFilter === filter ? "" : filter;
    el("job-filters").reset();
    renderAllJobs();
    showView("jobs");
  }

  function urlQuickFilter() {
    const params = new URL(window.location.href).searchParams;
    const country = String(params.get("country") || "").toLowerCase();
    const filter = String(params.get("filter") || params.get("direction") || "").toLowerCase();
    const countryMap = {
      pl: "country:poland",
      poland: "country:poland",
      polska: "country:poland",
      hu: "country:hungary",
      hungary: "country:hungary",
      wegry: "country:hungary",
      węgry: "country:hungary",
      be: "country:belgium",
      belgium: "country:belgium",
      belgia: "country:belgium"
    };
    const filterMap = {
      driver: "category:driver",
      drivers: "category:driver",
      transport: "category:driver",
      ce: "category:driver",
      noexperience: "level:noExperience",
      "no-experience": "level:noExperience",
      beginner: "level:noExperience",
      greenhouse: "category:greenhouse",
      glasshouse: "category:greenhouse",
      warehouse: "category:warehouse",
      sklad: "category:warehouse",
      "skład": "category:warehouse"
    };
    return countryMap[country] || filterMap[filter] || "";
  }

  function applyUrlIntent() {
    const quickFilter = urlQuickFilter();
    if (!quickFilter) return "";
    state.quickFilter = quickFilter;
    const [, value] = quickFilter.split(":");
    if (quickFilter === "country:poland") state.instantMatch.country = "poland";
    if (quickFilter === "country:hungary" || quickFilter === "country:belgium") state.instantMatch.country = "other";
    if (quickFilter === "category:driver") state.instantMatch.area = "transport";
    if (quickFilter === "category:greenhouse") state.instantMatch.area = "greenhouse";
    if (quickFilter === "category:warehouse") state.instantMatch.area = "warehouse";
    if (quickFilter === "level:noExperience") state.instantMatch.experience = "none";
    return value ? "jobs" : "";
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

  function jobFitItems(job, view) {
    const positive = [...(view.candidates || []).slice(0, 3)];
    const negative = [];
    const searchable = [job.id, job.category, view.title, view.level, ...(view.required || [])].join(" ").toLowerCase();
    if (view.level === "Без опыта") {
      positive.push(i18n.locale === "ru" ? "Можно начать после обучения на объекте" : "Training is provided on site");
    } else {
      positive.push(i18n.locale === "ru" ? "Подходит кандидатам с подтверждённым опытом" : "Best for candidates with proven experience");
    }
    if (searchable.includes("driver") || searchable.includes("водител")) {
      negative.push(i18n.locale === "ru" ? "Не подойдёт без C+E, Code 95 или карты тахографа" : "Not suitable without C+E, Code 95 or tachograph card");
    }
    if (searchable.includes("udt")) {
      negative.push(i18n.locale === "ru" ? "Не подойдёт без польского UDT или проверки допуска" : "Not suitable without Polish UDT or eligibility check");
    }
    if (job.category === "Теплицы" || job.category === "Склад") {
      negative.push(i18n.locale === "ru" ? "Может быть тяжело, если не готовы работать стоя и в темпе" : "May be hard if standing work and pace are a problem");
    }
    if (view.statusNote) {
      negative.push(i18n.locale === "ru" ? "Не подходит, если нужна гарантированная дата старта без проверки мест" : "Not suitable if you need a guaranteed start date before availability is checked");
    }
    if (!negative.length) {
      negative.push(i18n.locale === "ru" ? "Нужно отдельно подтвердить оформление, ставку и место" : "Paperwork, rate and availability must be confirmed first");
    }
    return { positive: [...new Set(positive)].slice(0, 4), negative: [...new Set(negative)].slice(0, 4) };
  }

  function grossEstimateMarkup(job, view) {
    if (!job.salary?.min || !job.salary?.confirmed || job.salary.period !== "час") return "";
    const copy = conversionCopy();
    const formatter = new Intl.NumberFormat(i18n.localeTag(), {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0
    });
    const rows = [200, 250, 280].map((hours) => {
      const amount = formatter.format(Math.round(job.salary.min * hours));
      return `<div><dt>${hours} h</dt><dd>${amount} ${escapeHTML(job.salary.currency)}</dd></div>`;
    }).join("");
    return `
      <section class="gross-estimate">
        <div class="detail-section-heading">
          <p class="overline">${escapeHTML(t("ui.grossSalary"))}</p>
          <h3>${escapeHTML(copy.grossTitle)}</h3>
        </div>
        <dl>${rows}</dl>
        <p>${escapeHTML(copy.grossNote)}</p>
      </section>
    `;
  }

  function relatedJobs(job) {
    const scored = jobs
      .filter((candidate) => candidate.id !== job.id)
      .map((candidate) => {
        let score = 0;
        if (candidate.category === job.category) score += 5;
        if (candidate.format === job.format) score += 3;
        if (candidate.level === job.level) score += 2;
        if (job.id.startsWith("driver-") && candidate.id.startsWith("driver-")) score += 6;
        if (job.id.includes("warehouse") && candidate.id.includes("warehouse")) score += 4;
        if (job.id.startsWith("greenhouse-") && candidate.id.startsWith("greenhouse-")) score += 4;
        if (["open", "verify"].includes(candidate.status)) score += 1;
        return { job: candidate, score };
      })
      .sort((a, b) => b.score - a.score || new Date(b.job.updatedAt) - new Date(a.job.updatedAt));
    return scored.slice(0, 3).map((item) => item.job);
  }

  function relatedJobsMarkup(job) {
    const copy = conversionCopy();
    const related = relatedJobs(job);
    if (!related.length) return "";
    return `
      <section class="related-jobs">
        <div class="detail-section-heading">
          <p class="overline">${escapeHTML(t("ui.navJobs"))}</p>
          <h3>${escapeHTML(copy.relatedTitle)}</h3>
        </div>
        <div class="related-job-grid">
          ${related.map((item) => {
            const view = localizedJob(item);
            return `
              <article>
                <h4>${escapeHTML(view.title)}</h4>
                <p>${escapeHTML(view.format)} · ${formatSalary(view.salary)}</p>
                <button class="text-link" type="button" data-job-open="${escapeHTML(item.id)}">${escapeHTML(copy.openRelated)} →</button>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
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
    const fit = jobFitItems(job, view);
    const copy = conversionCopy();
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
      <section class="job-fit-grid" aria-label="${escapeHTML(copy.fitTitle)}">
        <article class="job-fit-card job-fit-positive">
          <h3>${escapeHTML(copy.fitTitle)}</h3>
          ${listMarkup(fit.positive)}
        </article>
        <article class="job-fit-card job-fit-negative">
          <h3>${escapeHTML(copy.notFitTitle)}</h3>
          ${listMarkup(fit.negative)}
        </article>
      </section>
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
      ${grossEstimateMarkup(job, view)}
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
      ${relatedJobsMarkup(job)}
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
    const isRead = state.resourcesRead.has(resource.id);
    return `
      <article class="resource-card${isRead ? " is-read" : ""}" data-resource-visual="${iconName}">
        <div class="resource-card-header">
          <span class="resource-card-icon" aria-hidden="true">${svgIcon(iconName, "resource-visual-icon")}</span>
          <span class="offline-chip">${svgIcon("check")}<span>${escapeHTML(t("ui.offlineChip"))}</span></span>
          <span class="resource-read-state" aria-hidden="true">${isRead ? "✓" : ""}</span>
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
    const readCount = visibleResources.filter((resource) => state.resourcesRead.has(resource.id)).length;
    const readyChip = document.querySelector("#view-resources .offline-ready");
    if (readyChip) {
      readyChip.dataset.progress = `${readCount}/${visibleResources.length}`;
      readyChip.classList.toggle("has-reading-progress", readCount > 0);
    }
    if (el("featured-resources")) {
      el("featured-resources").innerHTML = visibleResources.slice(0, 3).map(renderResourceCard).join("");
    }
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
    state.resourcesRead.add(id);
    persistSet(STORAGE.resourcesRead, state.resourcesRead);
    renderResources();
    const resourceIndex = localizedResources().findIndex((item) => item.id === id) + 1;
    const iconName = resourceIconName(resource.id);
    el("resource-dialog-content").innerHTML = `
      <header class="modal-heading resource-detail-header">
        <div class="resource-detail-identity">
          <span class="resource-detail-icon" aria-hidden="true">${svgIcon(iconName, "resource-visual-icon")}</span>
          <div>
            <p class="overline">${escapeHTML(resource.category)}</p>
            <span class="resource-detail-number" aria-hidden="true">${String(resourceIndex).padStart(2, "0")}</span>
          </div>
        </div>
        <h2 id="resource-dialog-title">${escapeHTML(resource.title)}</h2>
        <div class="resource-detail-meta">
          <span>${escapeHTML(resource.readTime)}</span>
          <span>${escapeHTML(t("ui.updated"))} ${escapeHTML(formatDate(resource.updatedAt))}</span>
          <span>${svgIcon("check")}<span>${escapeHTML(t("ui.offlineChip"))}</span></span>
          <span class="resource-detail-count" aria-hidden="true">${String(resource.sections.length).padStart(2, "0")}</span>
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
    state.resourcesRead.clear();
    state.notes = {};
    state.passport = {};
    renderResources();
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
      const jobShareButton = event.target.closest("[data-job-share]");
      if (jobShareButton) {
        const job = jobById(jobShareButton.dataset.jobShare);
        if (job) shareJob(job);
        return;
      }
      const copyLinkButton = event.target.closest("[data-copy-link]");
      if (copyLinkButton) {
        copyText(copyLinkButton.dataset.copyLink, quickShareCopy().copied);
        return;
      }
      const quickFilterButton = event.target.closest("[data-quick-filter]");
      if (quickFilterButton) {
        applyQuickFilter(quickFilterButton.dataset.quickFilter);
        return;
      }
      const instantChoice = event.target.closest("[data-instant-choice]");
      if (instantChoice) {
        const [group, value] = instantChoice.dataset.instantChoice.split(":");
        if (group && value && Object.hasOwn(state.instantMatch, group)) {
          state.instantMatch[group] = value;
          renderInstantMatcher();
        }
        return;
      }
      const instantWhatsAppButton = event.target.closest("[data-instant-whatsapp]");
      if (instantWhatsAppButton) {
        openInstantMatchWhatsApp();
        return;
      }
      const priorityPickButton = event.target.closest("[data-priority-pick]");
      if (priorityPickButton) {
        applyPriorityPick(priorityPickButton.dataset.priorityPick);
        return;
      }
      const decisionPathButton = event.target.closest("[data-decision-path]");
      if (decisionPathButton) {
        applyDecisionPath(decisionPathButton.dataset.decisionPath);
        return;
      }
      const scenarioWhatsAppButton = event.target.closest("[data-scenario-whatsapp]");
      if (scenarioWhatsAppButton) {
        const messages = JSON.parse(el("whatsapp-scripts-grid")?.dataset.messages || "{}");
        const message = messages[scenarioWhatsAppButton.dataset.scenarioWhatsapp];
        if (message) openScenarioWhatsApp(message);
        return;
      }
      const passportWhatsAppButton = event.target.closest("[data-passport-whatsapp]");
      if (passportWhatsAppButton) {
        openScenarioWhatsApp(candidatePassportMessage());
        return;
      }
      const passportFillButton = event.target.closest("[data-passport-fill-match]");
      if (passportFillButton) {
        fillPassportFromInstantMatch();
        refreshJobLists();
        return;
      }
      const passportQuickStartButton = event.target.closest("[data-passport-quick-start]");
      if (passportQuickStartButton) {
        applyPassportQuickStart(passportQuickStartButton.dataset.passportQuickStart);
        return;
      }
      const passportLatinButton = event.target.closest("[data-passport-latin-name]");
      if (passportLatinButton) {
        applyPassportLatinName();
        return;
      }
      const passportStartDateButton = event.target.closest("[data-passport-start-date]");
      if (passportStartDateButton) {
        applyPassportStartDate(passportStartDateButton.dataset.passportStartDate);
        return;
      }
      const passportCurrentPlaceButton = event.target.closest("[data-passport-current-place]");
      if (passportCurrentPlaceButton) {
        applyPassportCurrentPlace(passportCurrentPlaceButton.dataset.passportCurrentPlace);
        return;
      }
      const passportCitizenshipButton = event.target.closest("[data-passport-citizenship]");
      if (passportCitizenshipButton) {
        applyPassportCitizenship(passportCitizenshipButton.dataset.passportCitizenship);
        return;
      }
      const passportLanguageButton = event.target.closest("[data-passport-language]");
      if (passportLanguageButton) {
        applyPassportLanguage(passportLanguageButton.dataset.passportLanguage);
        return;
      }
      const passportDestinationButton = event.target.closest("[data-passport-destination]");
      if (passportDestinationButton) {
        applyPassportDestination(passportDestinationButton.dataset.passportDestination);
        return;
      }
      const passportPeopleButton = event.target.closest("[data-passport-people]");
      if (passportPeopleButton) {
        applyPassportPeople(passportPeopleButton.dataset.passportPeople);
        return;
      }
      const passportExperienceButton = event.target.closest("[data-passport-experience]");
      if (passportExperienceButton) {
        applyPassportExperience(passportExperienceButton.dataset.passportExperience);
        return;
      }
      const passportFocusButton = event.target.closest("[data-passport-focus-missing]");
      if (passportFocusButton) {
        focusPassportField(passportFocusButton.dataset.passportFocusMissing);
        return;
      }
      const passportCopyButton = event.target.closest("[data-passport-copy]");
      if (passportCopyButton) {
        copyText(candidatePublicPassportPreview(), candidatePassportCopy().copied);
        return;
      }
      const passportReferenceCopyButton = event.target.closest("[data-passport-copy-reference]");
      if (passportReferenceCopyButton) {
        copyText(passportReferenceCopyButton.dataset.passportCopyReference, candidatePassportCopy().refCopied);
        return;
      }
      const passportClearButton = event.target.closest("[data-passport-clear]");
      if (passportClearButton) {
        clearPassport();
        renderCandidatePassport();
        refreshJobLists();
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
      if (event.target.matches("[data-passport-field]")) {
        state.passport[event.target.dataset.passportField] = event.target.value;
        persistPassport();
        renderCandidatePassport();
        refreshJobLists();
      }
    });

    document.addEventListener("input", (event) => {
      if (event.target.matches("[data-passport-field]")) {
        state.passport[event.target.dataset.passportField] = event.target.value;
        persistPassport();
        renderCandidatePassport();
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
    const urlIntentRoute = applyUrlIntent();
    renderProfileContent();
    populateFilters();
    renderResources();
    refreshJobLists();
    setupEvents();
    setupInstallFlow();
    updateConnectionStatus();
    registerServiceWorker();
    if (urlIntentRoute && !location.hash) showView(urlIntentRoute, false, false);
    else handleHashRoute();
  }

  init();
})();
