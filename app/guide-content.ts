export type GuideLanguage = "en" | "cz";
export type GuideRole = "priest" | "organist";

export type LocalizedText = Record<GuideLanguage, string>;

export type GuideSection = {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  bullets: LocalizedText[];
  roles?: Record<GuideRole, LocalizedText[]>;
};

export const GUIDE_LANGUAGE_STORAGE_KEY = "organy-guide-language";

export const guideUi = {
  title: { en: "Practical guide", cz: "Praktický průvodce" },
  intro: {
    en: "Use the same section names as the main menu. Shared steps are shown once; role-specific actions are shown separately for Priest and Organist.",
    cz: "Průvodce používá stejné názvy částí jako hlavní menu. Společné kroky jsou uvedeny jednou; odlišné pravomoci jsou zvlášť pro Priest a Organist.",
  },
  language: { en: "Language", cz: "Jazyk" },
  shared: { en: "Shared", cz: "Společné" },
  priest: { en: "Priest", cz: "Kněz" },
  organist: { en: "Organist", cz: "Varhaník" },
  currentRole: { en: "current role", cz: "aktuální role" },
} satisfies Record<string, LocalizedText>;

export const guideSections: GuideSection[] = [
  {
    id: "guide.about",
    title: { en: "About", cz: "About" },
    summary: {
      en: "Basic project information and external links.",
      cz: "Základní informace o projektu a externí odkazy.",
    },
    bullets: [
      {
        en: "Use About to open the public GitHub repository or the DrSoft portfolio.",
        cz: "V About lze otevřít veřejný GitHub repozitář nebo portfolio DrSoft.",
      },
      {
        en: "About does not change plans, catalog data or account settings.",
        cz: "About nemění plány, katalogová data ani nastavení účtu.",
      },
    ],
  },
  {
    id: "guide.planning",
    title: { en: "Planning", cz: "Planning" },
    summary: {
      en: "Create or open a service plan, set the service context and build the ordered music rows.",
      cz: "Vytvoření nebo otevření plánu bohoslužby, nastavení kontextu a sestavení pořadí hudebních řádků.",
    },
    bullets: [
      {
        en: "Set date, time, language, priest and organist. Antiphon, Topic and service note are optional context.",
        cz: "Nastavte datum, čas, jazyk, kněze a varhaníka. Antiphon, Topic a poznámka k bohoslužbě jsou volitelný kontext.",
      },
      {
        en: "In each row select a song through Song lookup, or enter a text note. Add, remove and reorder rows as needed.",
        cz: "V každém řádku vyberte píseň přes Song lookup, nebo zapište textovou poznámku. Řádky lze přidávat, mazat a měnit jejich pořadí.",
      },
      {
        en: "Candidate availability, language, melody collisions and other validation messages must be resolved before the corresponding save/finalize action becomes available.",
        cz: "Před příslušným uložením nebo finalizací je třeba vyřešit hlášení o dostupnosti kandidátů, jazyku, kolizích melodií a další validační chyby.",
      },
    ],
    roles: {
      priest: [
        {
          en: "Can create, edit, save and delete Working plans.",
          cz: "Může vytvářet, upravovat, ukládat a mazat Working plány.",
        },
        {
          en: "Can finalize a saved Working plan. A Final plan can then be stored as a completed service once its service date is not in the future.",
          cz: "Může finalizovat uložený Working plán. Final plán lze následně uložit jako dokončenou bohoslužbu, jakmile datum bohoslužby není v budoucnosti.",
        },
        {
          en: "Can delete a Final plan; completed History records remain read-only for Priest.",
          cz: "Může smazat Final plán; dokončené záznamy v History zůstávají pro roli Priest jen ke čtení.",
        },
      ],
      organist: [
        {
          en: "Can create, edit, save and delete Working plans.",
          cz: "Může vytvářet, upravovat, ukládat a mazat Working plány.",
        },
        {
          en: "Cannot finalize a Working plan or store/delete a Final plan; those lifecycle actions belong to Priest (or Admin).",
          cz: "Nemůže finalizovat Working plán ani uložit/smazat Final plán; tyto lifecycle akce patří roli Priest (nebo Admin).",
        },
      ],
    },
  },
  {
    id: "guide.plans",
    title: { en: "Plans", cz: "Plans" },
    summary: {
      en: "Lists active Working and Final plans.",
      cz: "Seznam aktivních Working a Final plánů.",
    },
    bullets: [
      {
        en: "Use Start new set to begin a new plan, or select an existing record to open it in Planning.",
        cz: "Pomocí Start new set začněte nový plán, nebo vyberte existující záznam a otevřete jej v Planning.",
      },
      {
        en: "Plans marked as requiring revision contain a conflict that should be resolved before normal completion.",
        cz: "Plány označené jako vyžadující revizi obsahují konflikt, který je třeba před běžným dokončením vyřešit.",
      },
    ],
    roles: {
      priest: [
        {
          en: "May continue Working plans and perform the Final-plan lifecycle actions available in Planning.",
          cz: "Může pokračovat v Working plánech a v Planning provést dostupné lifecycle akce Final plánu.",
        },
      ],
      organist: [
        {
          en: "May continue Working plans; Final plans can be opened for review but Final lifecycle actions are not available.",
          cz: "Může pokračovat v Working plánech; Final plány lze otevřít ke kontrole, ale lifecycle akce Final plánu nejsou dostupné.",
        },
      ],
    },
  },
  {
    id: "guide.history",
    title: { en: "History", cz: "History" },
    summary: {
      en: "Completed services stored for historical reference and conflict checks.",
      cz: "Dokončené bohoslužby uložené pro historický přehled a kontrolu konfliktů.",
    },
    bullets: [
      {
        en: "Select a completed service to open its saved context and rows.",
        cz: "Vyberte dokončenou bohoslužbu a otevřete její uložený kontext a řádky.",
      },
      {
        en: "Conflict highlighting indicates that a completed service conflicts with active plans.",
        cz: "Zvýraznění konfliktu znamená, že dokončená bohoslužba koliduje s aktivními plány.",
      },
    ],
    roles: {
      priest: [
        {
          en: "History is read-only; editing or deleting completed records is an Admin operation.",
          cz: "History je pouze ke čtení; úpravy nebo mazání dokončených záznamů jsou operace Admina.",
        },
      ],
      organist: [
        {
          en: "History is read-only; editing or deleting completed records is an Admin operation.",
          cz: "History je pouze ke čtení; úpravy nebo mazání dokončených záznamů jsou operace Admina.",
        },
      ],
    },
  },
  {
    id: "guide.catalog",
    title: { en: "Catalog", cz: "Catalog" },
    summary: {
      en: "Browse songs and melody classes in a chosen service context and maintain personal preference information.",
      cz: "Procházení písní a tříd melodií ve zvoleném kontextu bohoslužby a správa osobních preferencí.",
    },
    bullets: [
      {
        en: "Filter by organist, language, Antiphon and Topic; switch between Available/Unavailable and Songs/Melodies.",
        cz: "Filtrujte podle varhaníka, jazyka, Antiphon a Topic; přepínejte Available/Unavailable a Songs/Melodies.",
      },
      {
        en: "Open Detail to inspect the melody class, equivalent songs, availability and personal preference.",
        cz: "Otevřete Detail pro zobrazení třídy melodie, ekvivalentních písní, dostupnosti a osobní preference.",
      },
      {
        en: "A changed staff preference is saved when you leave the song Detail.",
        cz: "Změněná preference pracovníka se uloží při opuštění Detailu písně.",
      },
      {
        en: "People without a protected account vote from the Sign-in page via Congregation preferences: enter a nickname (no password/email), find a song and choose 0 or 1. The nickname is deliberately unverified and controls only that nickname profile.",
        cz: "Lidé bez protected account hlasují ze stránky Sign in přes Congregation preferences: zadají přezdívku (bez hesla/e-mailu), vyhledají píseň a zvolí 0 nebo 1. Přezdívka je záměrně neověřená a ovládá pouze svůj vlastní profil.",
      },
    ],
    roles: {
      priest: [
        {
          en: "Personal song preference uses values 0–3.",
          cz: "Osobní preference písně používá hodnoty 0–3.",
        },
        {
          en: "Priest does not add or remove an organist's repertoire membership.",
          cz: "Priest nepřidává ani neodebírá položky z repertoáru varhaníka.",
        },
      ],
      organist: [
        {
          en: "Personal song preference uses values 0–2.",
          cz: "Osobní preference písně používá hodnoty 0–2.",
        },
        {
          en: "For your own organist identity, you can add an unavailable song to your repertoire or remove the current repertoire pivot from an available melody class.",
          cz: "Pro vlastní identitu varhaníka můžete přidat nedostupnou píseň do svého repertoáru nebo odebrat aktuální repertoárový pivot z dostupné třídy melodie.",
        },
      ],
    },
  },
  {
    id: "guide.development",
    title: { en: "Development", cz: "Development" },
    summary: {
      en: "Runtime and diagnostic information; not required for ordinary service planning.",
      cz: "Informace o runtime a diagnostice; pro běžné plánování bohoslužby nejsou potřeba.",
    },
    bullets: [
      {
        en: "In Production, identity comes from the protected server session. If your account owns more than one role, switch the active role from the User menu.",
        cz: "V Production pochází identita z chráněné serverové session. Pokud váš účet vlastní více rolí, aktivní roli přepněte v User menu.",
      },
      {
        en: "Local DB verification and development controls are maintenance tools; normal Priest/Organist work does not require them.",
        cz: "Lokální DB verification a vývojové ovládací prvky jsou nástroje údržby; běžná práce Priest/Organist je nepotřebuje.",
      },
    ],
  },
  {
    id: "guide.guide",
    title: { en: "Guide", cz: "Guide" },
    summary: {
      en: "In-app help for normal work; opening or reading the Guide does not change application data.",
      cz: "Nápověda uvnitř aplikace pro běžnou práci; otevření ani čtení Guide nemění data aplikace.",
    },
    bullets: [
      {
        en: "Switch EN/CZ at the top of this page. The choice is remembered only in this browser.",
        cz: "Nahoře na této stránce přepínejte EN/CZ. Volba se pamatuje pouze v tomto prohlížeči.",
      },
      {
        en: "Role-specific blocks are intentionally shown in parallel so differences are visible without duplicating the whole manual.",
        cz: "Role-specific bloky jsou záměrně zobrazeny paralelně, aby byly rozdíly vidět bez duplikování celého manuálu.",
      },
    ],
  },
];
