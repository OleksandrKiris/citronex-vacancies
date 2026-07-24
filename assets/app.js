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
    openJobId: "",
    quickFilter: "",
    instantMatch: {
      country: "any",
      experience: "any",
      area: "any"
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
        situationDriverText: "Проверьте водительские вакансии и готовность документов.",
        situationDocumentsTitle: "Нужно проверить документы",
        situationDocumentsText: "Анкета поможет передать гражданство, статус и право на работу без фото документов."
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
        situationDriverText: "Check driver roles and document readiness.",
        situationDocumentsTitle: "My documents need checking",
        situationDocumentsText: "The form sends citizenship, status and work-right details without document photos."
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
    return { ...copy.en, ...(copy[i18n.locale] || {}) };
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
    renderInstantMatcher();
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

  function instantChoiceButton(group, value, label) {
    const active = state.instantMatch[group] === value;
    return `<button class="instant-choice${active ? " active" : ""}" type="button" data-instant-choice="${escapeHTML(group)}:${escapeHTML(value)}" aria-pressed="${active}">${escapeHTML(label)}</button>`;
  }

  function instantMatchScore(job) {
    const { country, experience, area } = state.instantMatch;
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

  function instantChoiceLabel(group, value) {
    const copy = instantMatchCopy();
    const labels = {
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
      `${messageLabel(copy.country)}: ${instantChoiceLabel("country", state.instantMatch.country)}`,
      `${messageLabel(copy.experience)}: ${instantChoiceLabel("experience", state.instantMatch.experience)}`,
      `${messageLabel(copy.area)}: ${instantChoiceLabel("area", state.instantMatch.area)}`
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

  function openInstantMatchWhatsApp() {
    const fallbackPhone = String(profile.phone || "").replace(/\D/g, "");
    const whatsappUrl = profile.whatsapp || `https://wa.me/${fallbackPhone}`;
    const separator = whatsappUrl.includes("?") ? "&" : "?";
    openWhatsAppSafety(`${whatsappUrl}${separator}text=${encodeURIComponent(instantMatchMessage())}`);
  }

  function renderInstantMatcher() {
    const copy = instantMatchCopy();
    if (el("instant-match-kicker")) el("instant-match-kicker").textContent = copy.kicker;
    if (el("instant-match-heading")) el("instant-match-heading").textContent = copy.title;
    if (el("instant-match-intro")) el("instant-match-intro").textContent = copy.intro;
    if (!el("instant-match-panel")) return;
    const groups = [
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
      <div class="instant-result-grid">
        ${matches.map((job) => {
          const view = localizedJob(job);
          return `
            <article class="instant-result-card">
              <span>${escapeHTML(view.format)} · ${escapeHTML(view.level)}</span>
              <h3>${escapeHTML(view.title)}</h3>
              <p>${formatSalary(view.salary)}</p>
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

  function renderJobCard(job, context = "catalog") {
    const view = localizedJob(job);
    const visualType = jobVisualType(job.id);
    const titleId = `${context}-job-${job.id}-title`;
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
        <p class="job-card-availability">
          ${svgIcon("clock")}
          <span>${escapeHTML(t("ui.startNeedsConfirmation"))}</span>
        </p>
        <div class="job-card-actions job-card-actions-single">
          <button class="button button-primary button-block" type="button" data-job-open="${escapeHTML(job.id)}"><span>${escapeHTML(t("ui.details"))}</span>${svgIcon("arrow")}</button>
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
    if (type === "country" && value === "other") return job.format !== "Польша";
    if (type === "level" && value === "noExperience") return job.level === "Без опыта";
    if (type === "category" && value === "driver") return job.id.startsWith("driver-") || job.category === "Водители";
    return true;
  }

  function applyQuickFilter(filter) {
    state.quickFilter = state.quickFilter === filter ? "" : filter;
    el("job-filters").reset();
    renderAllJobs();
    showView("jobs");
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
      negative.push(i18n.locale === "ru" ? "Нужно отдельно подтвердить документы, ставку и место" : "Documents, rate and availability must be confirmed first");
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
      const jobShareButton = event.target.closest("[data-job-share]");
      if (jobShareButton) {
        const job = jobById(jobShareButton.dataset.jobShare);
        if (job) shareJob(job);
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
