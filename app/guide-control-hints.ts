import type { PlanningRole } from "../src/planning-lifecycle";
import {
  guideHintCopy,
  isGuideHintKey,
  type GuideHint,
  type GuideHintKey,
  type GuideLanguage,
} from "./guide-content";

const controlGuideHints = {
  "about.links": {
    sectionId: "guide.about",
    title: { en: "About links", cz: "Odkazy About" },
    copy: {
      en: "These links open public project information outside Organ Planner. They do not change application data.",
      cz: "Tyto odkazy otevírají veřejné informace o projektu mimo Organ Planner. Nemění data aplikace.",
    },
  },
  "about.github": {
    sectionId: "guide.about",
    title: { en: "GitHub repository", cz: "GitHub repozitář" },
    copy: {
      en: "Opens the public source repository for Organ Planner in a new browser tab.",
      cz: "Otevře veřejný zdrojový repozitář Organ Planneru v nové kartě prohlížeče.",
    },
  },
  "about.portfolio": {
    sectionId: "guide.about",
    title: { en: "DrSoft portfolio", cz: "Portfolio DrSoft" },
    copy: {
      en: "Opens the author's public portfolio in a new browser tab.",
      cz: "Otevře veřejné portfolio autora v nové kartě prohlížeče.",
    },
  },
  "planning.service.date": {
    sectionId: "guide.planning",
    title: { en: "Service date", cz: "Datum bohoslužby" },
    copy: {
      en: "Set the date of the service. It also participates in historical and melody-protection checks.",
      cz: "Nastavte datum bohoslužby. Používá se také při historických kontrolách a Melody Protection.",
    },
  },
  "planning.service.time": {
    sectionId: "guide.planning",
    title: { en: "Service time", cz: "Čas bohoslužby" },
    copy: {
      en: "Set the concrete service time. A complete service context is required for normal lifecycle actions.",
      cz: "Nastavte konkrétní čas bohoslužby. Úplný kontext je potřebný pro běžné lifecycle akce.",
    },
  },
  "planning.service.language": {
    sectionId: "guide.planning",
    title: { en: "Service language", cz: "Jazyk bohoslužby" },
    copy: {
      en: "Select Czech, Polish or Mixed. Candidate and reference lookups use this language context.",
      cz: "Zvolte Czech, Polish nebo Mixed. Tento jazykový kontext používají kandidáti a referenční vyhledávání.",
    },
  },
  "planning.service.priest": {
    sectionId: "guide.planning",
    title: { en: "Priest", cz: "Kněz" },
    copy: {
      en: "Select the priest for this service. Anonymous is allowed while a plan is still Working.",
      cz: "Vyberte kněze této bohoslužby. Ve stavu Working může zůstat Anonymous.",
    },
  },
  "planning.service.organist": {
    sectionId: "guide.planning",
    title: { en: "Organist", cz: "Varhaník" },
    copy: {
      en: "Select the organist. A concrete organist activates the corresponding repertoire filter for candidate selection.",
      cz: "Vyberte varhaníka. Konkrétní varhaník aktivuje při výběru kandidátů filtr jeho repertoáru.",
    },
  },
  "planning.service.antiphon": {
    sectionId: "guide.planning",
    title: { en: "Antiphon", cz: "Antiphon" },
    copy: {
      en: "Optionally select the service Antiphon. It can refine candidate selection and the reference-song recommendation.",
      cz: "Volitelně vyberte Antiphon bohoslužby. Může zpřesnit kandidáty a doporučení referenční písně.",
    },
  },
  "planning.service.topic": {
    sectionId: "guide.planning",
    title: { en: "Topic", cz: "Topic" },
    copy: {
      en: "Optionally select a Topic to refine the service context used by candidate selection.",
      cz: "Volitelně vyberte Topic pro zpřesnění kontextu používaného při výběru kandidátů.",
    },
  },
  "planning.service.note": {
    sectionId: "guide.planning",
    title: { en: "Service note", cz: "Poznámka k bohoslužbě" },
    copy: {
      en: "Store free planning information such as readings, links or coordination notes.",
      cz: "Uložte volný plánovací text, například čtení, odkazy nebo koordinační poznámky.",
    },
  },
  "planning.rows.song": {
    sectionId: "guide.planning",
    title: { en: "Song lookup", cz: "Song lookup" },
    copy: {
      en: "Search and select the song for this row. Candidate availability and melody-protection rules are applied to the result.",
      cz: "Vyhledejte a vyberte píseň pro tento řádek. Na výsledek se uplatní dostupnost kandidátů a Melody Protection.",
    },
  },
  "planning.rows.detail": {
    sectionId: "guide.planning",
    title: { en: "Song detail", cz: "Detail písně" },
    copy: {
      en: "Open the melody-class detail for the selected song and inspect equivalent songs and their availability.",
      cz: "Otevřete detail třídy melodie vybrané písně a prohlédněte ekvivalentní písně a jejich dostupnost.",
    },
  },
  "planning.rows.note": {
    sectionId: "guide.planning",
    title: { en: "Text note", cz: "Textová poznámka" },
    copy: {
      en: "Use a text note when the row should contain free text instead of a selected song.",
      cz: "Použijte textovou poznámku, pokud má řádek obsahovat volný text místo vybrané písně.",
    },
  },
  "planning.rows.add": {
    sectionId: "guide.planning",
    title: { en: "Add row", cz: "Přidat řádek" },
    copy: {
      en: "Adds a new empty row after the current service-order rows.",
      cz: "Přidá nový prázdný řádek za aktuální pořadí řádků bohoslužby.",
    },
  },
  "planning.rows.move": {
    sectionId: "guide.planning",
    title: { en: "Move row", cz: "Přesun řádku" },
    copy: {
      en: "Move the row one position up or down in the service order.",
      cz: "Posuňte řádek o jednu pozici nahoru nebo dolů v pořadí bohoslužby.",
    },
  },
  "planning.rows.clear": {
    sectionId: "guide.planning",
    title: { en: "Clear row", cz: "Vyčistit řádek" },
    copy: {
      en: "Clears the selected song, note and transient row detail without removing the row itself.",
      cz: "Vymaže vybranou píseň, poznámku a dočasný detail řádku, ale samotný řádek ponechá.",
    },
  },
  "planning.rows.remove": {
    sectionId: "guide.planning",
    title: { en: "Remove row", cz: "Odstranit řádek" },
    copy: {
      en: "Removes this row from the service order. At least one row remains.",
      cz: "Odstraní tento řádek z pořadí bohoslužby. Nejméně jeden řádek zůstává zachován.",
    },
  },
  "planning.lifecycle.save": {
    sectionId: "guide.planning",
    title: { en: "Save working plan", cz: "Uložit Working plán" },
    copy: { en: "Persists the current plan while keeping it Working.", cz: "Uloží aktuální plán a ponechá jej ve stavu Working." },
  },
  "planning.lifecycle.finalize": {
    sectionId: "guide.planning",
    title: { en: "Finalize plan", cz: "Finalizovat plán" },
    copy: { en: "Moves an eligible saved Working plan to Final.", cz: "Převede způsobilý uložený Working plán do stavu Final." },
    roles: {
      priest: { en: "Available to Priest when validation is satisfied.", cz: "Pro Priest je dostupné po splnění validací." },
      organist: { en: "Organist cannot finalize a plan.", cz: "Organist nemůže plán finalizovat." },
    },
  },
  "planning.lifecycle.delete": {
    sectionId: "guide.planning",
    title: { en: "Delete saved plan", cz: "Smazat uložený plán" },
    copy: { en: "Deletes the currently opened saved plan when your role permits it.", cz: "Smaže právě otevřený uložený plán, pokud to role dovoluje." },
  },
  "planning.lifecycle.store": {
    sectionId: "guide.planning",
    title: { en: "Store Service", cz: "Uložit bohoslužbu" },
    copy: { en: "Stores an eligible Final plan as a completed History record.", cz: "Uloží způsobilý Final plán jako dokončený záznam v History." },
  },
  "planning.lifecycle.edit-final": {
    sectionId: "guide.planning",
    title: { en: "Edit Final Plan", cz: "Upravit Final plán" },
    copy: { en: "Reopens a Final plan for an authorized corrective edit.", cz: "Znovu otevře Final plán pro oprávněnou korekční úpravu." },
  },
  "planning.lifecycle.save-completed": {
    sectionId: "guide.history",
    title: { en: "Save completed changes", cz: "Uložit změny dokončené bohoslužby" },
    copy: { en: "Admin-only correction of the opened completed History record.", cz: "Admin korekce právě otevřeného dokončeného záznamu History." },
  },
  "planning.lifecycle.delete-completed": {
    sectionId: "guide.history",
    title: { en: "Delete completed record", cz: "Smazat dokončený záznam" },
    copy: { en: "Admin-only deletion of the opened completed History record.", cz: "Admin smazání právě otevřeného dokončeného záznamu History." },
  },
  "plans.start": {
    sectionId: "guide.plans",
    title: { en: "Start new set", cz: "Začít nový plán" },
    copy: { en: "Starts a new empty Working plan and opens it in Planning.", cz: "Založí nový prázdný Working plán a otevře jej v Planning." },
  },
  "plans.open-working": {
    sectionId: "guide.plans",
    title: { en: "Open Working plan", cz: "Otevřít Working plán" },
    copy: { en: "Opens the selected Working plan in Planning for continued work.", cz: "Otevře vybraný Working plán v Planning pro další práci." },
  },
  "plans.open-final": {
    sectionId: "guide.plans",
    title: { en: "Open Final plan", cz: "Otevřít Final plán" },
    copy: { en: "Opens the selected Final plan in Planning for review and permitted lifecycle actions.", cz: "Otevře vybraný Final plán v Planning ke kontrole a povoleným lifecycle akcím." },
  },
  "history.open": {
    sectionId: "guide.history",
    title: { en: "Open completed service", cz: "Otevřít dokončenou bohoslužbu" },
    copy: { en: "Opens the stored historical service context and rows in Planning.", cz: "Otevře uložený historický kontext a řádky bohoslužby v Planning." },
  },
  "catalog.context.organist": {
    sectionId: "guide.catalog",
    title: { en: "Catalog organist", cz: "Varhaník Catalogu" },
    copy: { en: "Chooses whose repertoire availability is represented by the Catalog.", cz: "Určuje, čí repertoárovou dostupnost Catalog zobrazuje." },
  },
  "catalog.context.language": {
    sectionId: "guide.catalog",
    title: { en: "Catalog language", cz: "Jazyk Catalogu" },
    copy: { en: "Filters Catalog knowledge by Czech, Polish or Mixed service language.", cz: "Filtruje znalosti Catalogu podle Czech, Polish nebo Mixed jazyka bohoslužby." },
  },
  "catalog.context.antiphon": {
    sectionId: "guide.catalog",
    title: { en: "Catalog Antiphon", cz: "Antiphon Catalogu" },
    copy: { en: "Optionally narrows candidate context by Antiphon.", cz: "Volitelně zužuje kontext kandidátů podle Antiphon." },
  },
  "catalog.context.topic": {
    sectionId: "guide.catalog",
    title: { en: "Catalog Topic", cz: "Topic Catalogu" },
    copy: { en: "Optionally narrows candidate context by Topic.", cz: "Volitelně zužuje kontext kandidátů podle Topic." },
  },
  "catalog.candidates.availability": {
    sectionId: "guide.catalog",
    title: { en: "Available / Unavailable", cz: "Available / Unavailable" },
    copy: { en: "Switches between candidates currently available and songs outside the current repertoire availability.", cz: "Přepíná mezi aktuálně dostupnými kandidáty a písněmi mimo současnou repertoárovou dostupnost." },
  },
  "catalog.candidates.view": {
    sectionId: "guide.catalog",
    title: { en: "Songs / Melodies", cz: "Songs / Melodies" },
    copy: { en: "Switches between individual songs and melody-class grouping of the same musical knowledge.", cz: "Přepíná mezi jednotlivými písněmi a seskupením stejných znalostí podle tříd melodií." },
  },
  "catalog.candidates.detail": {
    sectionId: "guide.catalog",
    title: { en: "Candidate detail", cz: "Detail kandidáta" },
    copy: { en: "Opens melody-class detail, equivalent songs, availability and any applicable personal preference.", cz: "Otevře detail třídy melodie, ekvivalentní písně, dostupnost a případnou osobní preferenci." },
  },
  "catalog.candidates.repertoire": {
    sectionId: "guide.catalog",
    title: { en: "Repertoire membership", cz: "Členství v repertoáru" },
    copy: { en: "Adds or removes the permitted repertoire pivot for the selected melody class.", cz: "Přidá nebo odebere povolený repertoárový pivot vybrané třídy melodie." },
    roles: {
      organist: { en: "Organist can change only their own repertoire.", cz: "Varhaník může měnit pouze vlastní repertoár." },
    },
  },
  "catalog.candidates.score": {
    sectionId: "guide.catalog",
    title: { en: "Score", cz: "Noty" },
    copy: { en: "Opens the stored sheet-music link for this song in a new tab.", cz: "Otevře uložený odkaz na noty této písně v nové kartě." },
  },
  "catalog.melody-edges": {
    sectionId: "guide.catalog",
    title: { en: "Melody edges", cz: "Melody edges" },
    copy: { en: "Admin tool for explicitly joining or separating reference songs in the melody graph.", cz: "Admin nástroj pro explicitní spojování nebo oddělování referenčních písní v grafu melodií." },
  },
  "catalog.melody.language": {
    sectionId: "guide.catalog",
    title: { en: "Melody-edge language", cz: "Jazyk Melody Edges" },
    copy: { en: "Sets the language independently for each of the two song lookups.", cz: "Nastaví jazyk nezávisle pro každé ze dvou vyhledávání písní." },
  },
  "catalog.melody.song": {
    sectionId: "guide.catalog",
    title: { en: "Melody-edge song lookup", cz: "Vyhledání písně Melody Edges" },
    copy: { en: "Select the two reference songs whose explicit melody-edge relationship you want to inspect or change.", cz: "Vyberte dvě referenční písně, jejichž explicitní vazbu Melody Edge chcete zkontrolovat nebo změnit." },
  },
  "catalog.melody.add": {
    sectionId: "guide.catalog",
    title: { en: "Add melody edge", cz: "Přidat Melody Edge" },
    copy: { en: "Creates an explicit melody edge when the selected songs are currently in separate melody classes.", cz: "Vytvoří explicitní Melody Edge, pokud jsou vybrané písně nyní v oddělených třídách melodií." },
  },
  "catalog.melody.remove": {
    sectionId: "guide.catalog",
    title: { en: "Remove melody edge", cz: "Odebrat Melody Edge" },
    copy: { en: "Removes the selected explicit melody edge when that edge currently exists.", cz: "Odebere vybranou explicitní Melody Edge, pokud tato vazba aktuálně existuje." },
  },
} satisfies Record<string, GuideHint>;

export type ControlGuideHintKey = keyof typeof controlGuideHints;
export type AnyGuideHintKey = GuideHintKey | ControlGuideHintKey;

export const panelGuideHintGroups = {
  "about.links": ["about.links", "about.github", "about.portfolio"],
  "planning.service-context": [
    "planning.service-context",
    "planning.service.date",
    "planning.service.time",
    "planning.service.language",
    "planning.service.priest",
    "planning.service.organist",
    "planning.service.antiphon",
    "planning.service.topic",
    "planning.service.note",
  ],
  "planning.melody-protection": ["planning.melody-protection"],
  "planning.rows": [
    "planning.rows",
    "planning.rows.song",
    "planning.rows.detail",
    "planning.rows.note",
    "planning.rows.add",
    "planning.rows.move",
    "planning.rows.clear",
    "planning.rows.remove",
  ],
  "plans.records": ["plans.records", "plans.start", "plans.open-working", "plans.open-final"],
  "history.records": ["history.records", "history.open"],
  "catalog.context": [
    "catalog.context",
    "catalog.context.organist",
    "catalog.context.language",
    "catalog.context.antiphon",
    "catalog.context.topic",
  ],
  "catalog.candidates": [
    "catalog.candidates",
    "catalog.candidates.availability",
    "catalog.candidates.view",
    "catalog.candidates.detail",
    "catalog.candidates.repertoire",
    "catalog.preference",
    "catalog.candidates.score",
  ],
  "catalog.melody-edges": [
    "catalog.melody-edges",
    "catalog.melody.language",
    "catalog.melody.song",
    "catalog.melody.add",
    "catalog.melody.remove",
  ],
} satisfies Record<string, AnyGuideHintKey[]>;

export type GuidePanelScope = keyof typeof panelGuideHintGroups;

export function isAnyGuideHintKey(value: string): value is AnyGuideHintKey {
  return isGuideHintKey(value) || Object.prototype.hasOwnProperty.call(controlGuideHints, value);
}

export function guidePanelHintKeys(scope: string): AnyGuideHintKey[] {
  return Object.prototype.hasOwnProperty.call(panelGuideHintGroups, scope)
    ? panelGuideHintGroups[scope as GuidePanelScope]
    : isAnyGuideHintKey(scope)
      ? [scope]
      : [];
}

export function anyGuideHintCopy(
  key: AnyGuideHintKey,
  language: GuideLanguage,
  role: PlanningRole,
): { title: string; copy: string; roleCopy?: string } {
  if (isGuideHintKey(key)) return guideHintCopy(key, language, role);
  const hint: GuideHint = controlGuideHints[key];
  const guideRole = role === "priest" || role === "organist" ? role : undefined;
  return {
    title: hint.title[language],
    copy: hint.copy[language],
    ...(guideRole && hint.roles?.[guideRole] ? { roleCopy: hint.roles[guideRole]![language] } : {}),
  };
}
