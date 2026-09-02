export type GuideLanguage = "en" | "cz";
export type GuideRole = "admin" | "priest" | "organist";
export type GuideExperience = "standard" | "demo";

export type LocalizedText = Record<GuideLanguage, string>;

export type GuideSection = {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  bullets: LocalizedText[];
  roles?: Partial<Record<GuideRole, LocalizedText[]>>;
  experience?: Partial<Record<GuideExperience, LocalizedText[]>>;
  standardOnly?: boolean;
};

export const GUIDE_LANGUAGE_STORAGE_KEY = "organy-guide-language";
export const GUIDE_HINTS_STORAGE_KEY = "organy-guide-hints";
export const GUIDE_HINTS_CHANGED_EVENT = "organy:guide-hints-changed";
export const GUIDE_LANGUAGE_CHANGED_EVENT = "organy:guide-language-changed";

export const guideUi = {
  title: { en: "Practical guide", cz: "Praktický průvodce" },
  intro: {
    en: "The Guide follows the main workspaces, explains Production/Demo differences and separates role-specific actions for Admin, Priest and Organist.",
    cz: "Guide navazuje na hlavní pracovní části, vysvětluje rozdíly Production/Demo a odděluje pravomoci rolí Admin, Priest a Organist.",
  },
  language: { en: "Language", cz: "Jazyk" },
  shared: { en: "Shared", cz: "Společné" },
  environment: { en: "This environment", cz: "Toto prostředí" },
  standard: { en: "Production", cz: "Production" },
  demo: { en: "Demo", cz: "Demo" },
  admin: { en: "Admin", cz: "Admin" },
  priest: { en: "Priest", cz: "Kněz" },
  organist: { en: "Organist", cz: "Varhaník" },
  currentRole: { en: "current role", cz: "aktuální role" },
} satisfies Record<string, LocalizedText>;

export const guideAccountContext = {
  title: { en: "User & Role", cz: "User & Role" },
  summary: {
    en: "The controls in the top-right corner identify the protected signed-in account and the currently active application role.",
    cz: "Ovládací prvky vpravo nahoře identifikují protected přihlášený účet a právě aktivní roli aplikace.",
  },
  bullets: [
    {
      en: "Open User … to choose Sign Role from assigned roles, switch Guide Hints, manage Phone Setting when a WhatsApp phone has been saved, change the password or sign out.",
      cz: "V User … lze z přiřazených rolí zvolit Sign Role, přepnout Guide Hints, spravovat Phone Setting po uložení WhatsApp telefonu, změnit heslo nebo se odhlásit.",
    },
    {
      en: "Role shows the active role. When Admin is active, Role Admin … opens Manage Accounts, Audit History and Verify DB; for other roles it remains a compact role label.",
      cz: "Role zobrazuje aktivní roli. Je-li aktivní Admin, Role Admin … zpřístupní Manage Accounts, Audit History a Verify DB; u ostatních rolí zůstává kompaktním označením role.",
    },
  ],
} satisfies { title: LocalizedText; summary: LocalizedText; bullets: LocalizedText[] };

export const guideEnvironmentCopy = {
  standard: {
    en: "Production uses a protected signed-in session and persistent application data. Changes are stored only when the active role is authorized to perform them.",
    cz: "Production používá chráněnou přihlášenou session a perzistentní data aplikace. Změny se ukládají pouze tehdy, když je aktivní role oprávněna danou akci provést.",
  },
  demo: {
    en: "Demo uses synthetic in-memory data only. Changes are temporary and are never saved. Preview role changes presentation only; it does not sign you in or grant real permissions. Reset Demo restores the original synthetic fixture.",
    cz: "Demo používá pouze syntetická data v paměti. Změny jsou dočasné a nikdy se neukládají. Preview role mění pouze prezentaci; nepřihlašuje uživatele ani neuděluje skutečná oprávnění. Reset Demo obnoví původní syntetická data.",
  },
} satisfies Record<GuideExperience, LocalizedText>;

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
      {
        en: "Melody Protection is part of the service context: its month window suppresses recently used melody classes from normal candidate selection and is used by repetition/conflict checks.",
        cz: "Melody Protection je součástí kontextu bohoslužby: období v měsících potlačuje nedávno použité třídy melodií z běžného výběru kandidátů a používá se při kontrolách opakování a konfliktů.",
      },
    ],
    experience: {
      demo: [
        {
          en: "Demo Planning uses synthetic data. Role capabilities can be previewed, but persistent lifecycle mutations remain disabled and Reset Demo discards local changes.",
          cz: "Demo Planning používá syntetická data. Pravomoci rolí lze prohlížet, ale perzistentní lifecycle změny zůstávají zakázané a Reset Demo zahodí lokální změny.",
        },
      ],
    },
    roles: {
      admin: [
        {
          en: "Has the Working/Final lifecycle capabilities and may also perform Admin operations on completed History records where those controls are available.",
          cz: "Má pravomoci pro Working/Final lifecycle a tam, kde jsou příslušné ovládací prvky dostupné, může provádět také Admin operace nad dokončenými záznamy History.",
        },
        {
          en: "For a selected Organist, Melody Protection is an unrestricted temporary 0–12 month session override. It does not overwrite the Organist's stored setting.",
          cz: "Pro zvoleného Organista je Melody Protection neomezený dočasný session override v rozsahu 0–12 měsíců. Nepřepisuje uložené nastavení Organista.",
        },
        {
          en: "After Finalize, the optional WhatsApp handoff can open a prepared message. A protected Admin account may save the phone for later use.",
          cz: "Po Finalize lze volitelně otevřít WhatsApp s připravenou zprávou. Protected Admin account může telefon uložit pro další použití.",
        },
      ],
      priest: [
        {
          en: "Can create, edit, save and delete Working plans.",
          cz: "Může vytvářet, upravovat, ukládat a mazat Working plány.",
        },
        {
          en: "Can finalize a saved Working plan, delete a Final plan and store an eligible Final plan as a completed service once its service date is not in the future.",
          cz: "Může finalizovat uložený Working plán, smazat Final plán a uložit způsobilý Final plán jako dokončenou bohoslužbu, jakmile datum bohoslužby není v budoucnosti.",
        },
        {
          en: "Melody Protection starts at the selected Organist's own minimum. Priest may increase it for the plan but cannot choose a lower value; lower options are disabled. Anonymous Organist has a 0-month minimum. This does not change the Organist's stored setting.",
          cz: "Melody Protection vychází z vlastního minima zvoleného Organista. Priest jej může pro daný plán zvýšit, ale nemůže zvolit nižší hodnotu; nižší možnosti jsou zakázané. Anonymous Organist má minimum 0 měsíců. Tím se nemění uložené nastavení Organista.",
        },
        {
          en: "After Finalize, the optional WhatsApp handoff can open a prepared message. Without a saved phone, enter one for this use only or save it to the protected account for next time.",
          cz: "Po Finalize lze volitelně otevřít WhatsApp s připravenou zprávou. Není-li telefon uložený, lze jej zadat jen pro toto použití nebo uložit do protected account pro příště.",
        },
      ],
      organist: [
        {
          en: "Can create, edit, save and delete Working plans.",
          cz: "Může vytvářet, upravovat, ukládat a mazat Working plány.",
        },
        {
          en: "Cannot finalize a Working plan or store/delete a Final plan; those lifecycle actions belong to Priest or Admin.",
          cz: "Nemůže finalizovat Working plán ani uložit/smazat Final plán; tyto lifecycle akce patří roli Priest nebo Admin.",
        },
        {
          en: "Owns the persistent Melody Protection setting for the Organist identity. It can be set from 0 to 12 months; when no stored value exists, the default is 2 months.",
          cz: "Vlastní perzistentní nastavení Melody Protection pro identitu Organista. Lze nastavit 0 až 12 měsíců; pokud ještě není uložena žádná hodnota, výchozí jsou 2 měsíce.",
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
      admin: [
        {
          en: "May continue Working plans and use the Final-plan lifecycle actions available to Admin in Planning.",
          cz: "Může pokračovat v Working plánech a v Planning použít lifecycle akce Final plánu dostupné Adminovi.",
        },
      ],
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
    experience: {
      demo: [
        {
          en: "Demo History contains synthetic records only. Admin preview may demonstrate editing semantics, but no completed-service change is persisted.",
          cz: "Demo History obsahuje pouze syntetické záznamy. Admin preview může demonstrovat editační chování, ale žádná změna dokončené bohoslužby se neukládá.",
        },
      ],
    },
    roles: {
      admin: [
        {
          en: "In Production, Admin may edit or delete completed records through the available Admin lifecycle controls.",
          cz: "V Production může Admin upravovat nebo mazat dokončené záznamy prostřednictvím dostupných Admin lifecycle ovládacích prvků.",
        },
      ],
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
      en: "Browse songs and melody classes in a chosen service context and inspect preference/repertoire information.",
      cz: "Procházení písní a tříd melodií ve zvoleném kontextu bohoslužby a kontrola preferencí a repertoáru.",
    },
    bullets: [
      {
        en: "Filter by organist, language, Antiphon and Topic; switch between Available/Unavailable and Songs/Melodies.",
        cz: "Filtrujte podle varhaníka, jazyka, Antiphon a Topic; přepínejte Available/Unavailable a Songs/Melodies.",
      },
      {
        en: "Open Detail to inspect the melody class, equivalent songs, availability and any personal preference information.",
        cz: "Otevřete Detail pro zobrazení třídy melodie, ekvivalentních písní, dostupnosti a případných informací o osobní preferenci.",
      },
    ],
    experience: {
      standard: [
        {
          en: "In Production, a changed staff preference is saved when you leave song Detail. People without a protected account can use Congregation preferences from Sign in with an unverified nickname and values 0 or 1.",
          cz: "V Production se změněná preference pracovníka uloží při opuštění Detailu písně. Lidé bez protected account mohou ze Sign in použít Congregation preferences s neověřenou přezdívkou a hodnotami 0 nebo 1.",
        },
      ],
      demo: [
        {
          en: "Demo Catalog is read-only and uses synthetic data. Filters and Detail can be explored, but preference, repertoire and Melody Edge mutations are not persisted.",
          cz: "Demo Catalog je pouze ke čtení a používá syntetická data. Filtry a Detail lze procházet, ale změny preferencí, repertoáru ani Melody Edges se neukládají.",
        },
      ],
    },
    roles: {
      admin: [
        {
          en: "In Production, Admin may maintain catalog-wide knowledge such as Melody Edges where the corresponding Admin controls are available.",
          cz: "V Production může Admin spravovat katalogové znalosti, například Melody Edges, pokud jsou příslušné Admin ovládací prvky dostupné.",
        },
      ],
      priest: [
        {
          en: "In Production, personal song preference uses values 0–3.",
          cz: "V Production používá osobní preference písně hodnoty 0–3.",
        },
        {
          en: "Priest does not add or remove an Organist's repertoire membership.",
          cz: "Priest nepřidává ani neodebírá položky z repertoáru Organista.",
        },
      ],
      organist: [
        {
          en: "In Production, personal song preference uses values 0–2.",
          cz: "V Production používá osobní preference písně hodnoty 0–2.",
        },
        {
          en: "In Production, for your own Organist identity you can add an unavailable song to your repertoire or remove the current repertoire pivot from an available melody class.",
          cz: "V Production můžete pro vlastní identitu Organista přidat nedostupnou píseň do svého repertoáru nebo odebrat aktuální repertoárový pivot z dostupné třídy melodie.",
        },
      ],
    },
  },
  {
    id: "guide.development",
    title: { en: "Development", cz: "Development" },
    summary: {
      en: "Production maintenance and diagnostic information; not part of the public Demo or ordinary service planning.",
      cz: "Údržba a diagnostika Production; není součástí veřejného Demo ani běžného plánování bohoslužby.",
    },
    standardOnly: true,
    bullets: [
      {
        en: "Production identity comes from the protected server session. Ordinary Priest/Organist work does not require Development or Admin maintenance controls.",
        cz: "V Production pochází identita z chráněné serverové session. Běžná práce Priest/Organist nevyžaduje Development ani Admin nástroje údržby.",
      },
    ],
    roles: {
      admin: [
        {
          en: "The protected Admin Role menu exposes Manage Accounts, Audit History and Verify DB. Verify DB creates a local offline copy for inspection; these are maintenance tools, not planning steps.",
          cz: "Protected Admin Role menu zpřístupňuje Manage Accounts, Audit History a Verify DB. Verify DB vytváří lokální offline kopii pro kontrolu; jde o nástroje údržby, nikoli o kroky plánování.",
        },
      ],
    },
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
        en: "Use panel i buttons for grouped contextual help. When Guide Hints are enabled, hovering or focusing supported controls shows control-specific help.",
        cz: "Pro souhrnnou kontextovou nápovědu použijte tlačítka i na panelech. Když jsou Guide Hints zapnuté, najetí myší nebo focus na podporovaném prvku zobrazí nápovědu k danému ovládacímu prvku.",
      },
      {
        en: "Role-specific blocks are shown in parallel so Admin, Priest and Organist differences remain visible without duplicating the whole manual.",
        cz: "Role-specific bloky jsou zobrazeny paralelně, aby byly rozdíly mezi Admin, Priest a Organist vidět bez duplikování celého manuálu.",
      },
    ],
  },
];

export type GuideHint = {
  sectionId: GuideSection["id"];
  title: LocalizedText;
  copy: LocalizedText;
  roles?: Partial<Record<GuideRole, LocalizedText>>;
};

export const guideHints = {
  "planning.service-context": {
    sectionId: "guide.planning",
    title: { en: "Service context", cz: "Kontext bohoslužby" },
    copy: {
      en: "Set the concrete service date, time, language, priest and organist here. Antiphon, Topic and the service note refine the context used for candidate selection.",
      cz: "Zde nastavte konkrétní datum, čas, jazyk, kněze a varhaníka. Antiphon, Topic a poznámka k bohoslužbě dále zpřesňují kontext pro výběr kandidátů.",
    },
  },
  "planning.rows": {
    sectionId: "guide.planning",
    title: { en: "Plan rows", cz: "Řádky plánu" },
    copy: {
      en: "Each row is either a selected song or a text note. Add, remove or reorder rows to match the real service order.",
      cz: "Každý řádek obsahuje buď vybranou píseň, nebo textovou poznámku. Řádky přidávejte, mažte a řaďte podle skutečného pořadí bohoslužby.",
    },
  },
  "planning.lifecycle": {
    sectionId: "guide.planning",
    title: { en: "Save and lifecycle actions", cz: "Uložení a lifecycle akce" },
    copy: {
      en: "Save keeps a Working plan. Finalize moves an eligible saved Working plan to Final. Store Service turns an eligible Final plan into History.",
      cz: "Save ponechá plán jako Working. Finalize převede způsobilý uložený Working plán na Final. Store Service uloží způsobilý Final plán do History.",
    },
    roles: {
      admin: {
        en: "Admin has the Final lifecycle capabilities and may also use completed-record Admin actions where available.",
        cz: "Admin má pravomoci Final lifecycle a tam, kde jsou dostupné, může používat také Admin akce nad dokončenými záznamy.",
      },
      priest: {
        en: "Priest can finalize and store eligible plans.",
        cz: "Priest může způsobilé plány finalizovat a ukládat jako dokončené.",
      },
      organist: {
        en: "Organist can work with Working plans but cannot finalize or store Final plans.",
        cz: "Organist může pracovat s Working plány, ale nemůže je finalizovat ani ukládat Final plány jako dokončené.",
      },
    },
  },
  "planning.melody-protection": {
    sectionId: "guide.planning",
    title: { en: "Melody Protection", cz: "Melody Protection" },
    copy: {
      en: "The month window suppresses recently used melody classes from normal candidate selection and is used by repetition/conflict checks.",
      cz: "Období v měsících potlačuje nedávno použité třídy melodií z běžného výběru kandidátů a používá se při kontrolách opakování a konfliktů.",
    },
    roles: {
      admin: {
        en: "Admin may set a temporary 0–12 month value for the selected Organist. The override is session-only and does not overwrite the Organist's stored setting.",
        cz: "Admin může pro zvoleného Organista nastavit dočasnou hodnotu 0–12 měsíců. Override platí jen pro session a nepřepisuje uložené nastavení Organista.",
      },
      priest: {
        en: "Priest starts at the selected Organist minimum and may only increase it for the plan. Lower options are disabled; Anonymous Organist has a 0-month minimum.",
        cz: "Priest vychází z minima zvoleného Organista a pro plán jej může pouze zvýšit. Nižší možnosti jsou zakázané; Anonymous Organist má minimum 0 měsíců.",
      },
      organist: {
        en: "Organist owns the persistent 0–12 month setting. If no value has been stored yet, the default is 2 months.",
        cz: "Organist vlastní perzistentní nastavení 0–12 měsíců. Pokud ještě žádná hodnota uložena není, výchozí jsou 2 měsíce.",
      },
    },
  },
  "planning.whatsapp": {
    sectionId: "guide.planning",
    title: { en: "WhatsApp handoff", cz: "Předání do WhatsApp" },
    copy: {
      en: "After a successful Finalize, Priest or Admin can optionally open WhatsApp with a prepared message. Without a saved phone, enter one for this use only or save it to the protected account.",
      cz: "Po úspěšném Finalize může Priest nebo Admin volitelně otevřít WhatsApp s připravenou zprávou. Není-li telefon uložený, lze jej zadat jen pro toto použití nebo uložit do protected account.",
    },
  },
  "plans.records": {
    sectionId: "guide.plans",
    title: { en: "Working and Final plans", cz: "Working a Final plány" },
    copy: {
      en: "Working plans are still editable. Final plans are locked for ordinary editing and wait for the remaining lifecycle action.",
      cz: "Working plány lze dále upravovat. Final plány jsou pro běžné úpravy uzamčené a čekají na zbývající lifecycle akci.",
    },
  },
  "history.records": {
    sectionId: "guide.history",
    title: { en: "Completed History", cz: "Dokončená History" },
    copy: {
      en: "History contains stored completed services and is the historical source used by conflict and repetition checks.",
      cz: "History obsahuje uložené dokončené bohoslužby a slouží jako historický zdroj pro kontroly konfliktů a opakování.",
    },
  },
  "catalog.context": {
    sectionId: "guide.catalog",
    title: { en: "Catalog context", cz: "Kontext Catalogu" },
    copy: {
      en: "These filters define whose repertoire and which service context the Catalog candidate list represents.",
      cz: "Tyto filtry určují, čí repertoár a jaký kontext bohoslužby seznam kandidátů v Catalogu představuje.",
    },
  },
  "catalog.candidates": {
    sectionId: "guide.catalog",
    title: { en: "Catalog candidates", cz: "Kandidáti v Catalogu" },
    copy: {
      en: "Available/Unavailable changes the availability set; Songs/Melodies changes how the same musical knowledge is grouped for inspection.",
      cz: "Available/Unavailable mění množinu podle dostupnosti; Songs/Melodies mění způsob seskupení stejných hudebních znalostí pro prohlížení.",
    },
  },
  "catalog.preference": {
    sectionId: "guide.catalog",
    title: { en: "Personal preference", cz: "Osobní preference" },
    copy: {
      en: "Shows the staff preference for the selected song. In Production, an authorized changed value is saved when you leave song Detail; Demo Catalog is read-only.",
      cz: "Zobrazuje preferenci pracovníka pro vybranou píseň. V Production se oprávněně změněná hodnota uloží při opuštění Detailu písně; Demo Catalog je pouze ke čtení.",
    },
    roles: {
      priest: { en: "Priest uses values 0–3 in Production.", cz: "Priest používá v Production hodnoty 0–3." },
      organist: { en: "Organist uses values 0–2 in Production.", cz: "Organist používá v Production hodnoty 0–2." },
    },
  },
  "development.runtime": {
    sectionId: "guide.development",
    title: { en: "Development", cz: "Development" },
    copy: {
      en: "Production maintenance area. Ordinary Priest/Organist work and the public Demo do not require or expose these controls.",
      cz: "Oblast údržby Production. Běžná práce Priest/Organist ani veřejné Demo tyto ovládací prvky nepotřebují ani nezpřístupňují.",
    },
  },
} satisfies Record<string, GuideHint>;

export type GuideHintKey = keyof typeof guideHints;

export function isGuideHintKey(value: string): value is GuideHintKey {
  return Object.prototype.hasOwnProperty.call(guideHints, value);
}

export function guideHintCopy(key: GuideHintKey, language: GuideLanguage, role: PlanningRoleLike): { title: string; copy: string; roleCopy?: string } {
  const hint: GuideHint = guideHints[key];
  const guideRole = role === "admin" || role === "priest" || role === "organist" ? role : undefined;
  return {
    title: hint.title[language],
    copy: hint.copy[language],
    ...(guideRole && hint.roles?.[guideRole] ? { roleCopy: hint.roles[guideRole]![language] } : {}),
  };
}

type PlanningRoleLike = GuideRole | "congregationMember";
