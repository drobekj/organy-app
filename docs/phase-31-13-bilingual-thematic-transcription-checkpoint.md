# Phase 31.13 — bilingual thematic-section transcription checkpoint

## Status and authority

- Issue: `#130`
- Branch: `codex/phase-31-13-bilingual-thematic-sections`
- Source authority: user-provided `temata_cz.pdf` and `temata_pl.pdf`
- Checkpoint state: `HUMAN PENDING`

This file is a review artifact only. It does not yet freeze JSON, create a migration, synchronize a database or activate runtime behavior.

The source scans are not copied into the repository. Traceability records the source file, scan page and printed destination page shown by the table of contents.

## Proposed hierarchy

The scans contain three non-selectable parent headings in both languages:

| Shared parent key | Czech parent ID and title | Polish parent ID and title |
|---|---|---|
| `church-year` | `czech:church-year` — `Církevní rok` | `polish:church-year` — `Rok kościelny` |
| `worship` | `czech:worship` — `Bohoslužba` | `polish:worship` — `Nabożeństwo` |
| `faith-love-hope` | `czech:faith-love-hope` — `Víra, láska, naděje` | `polish:faith-love-hope` — `Wiara, miłość, nadzieja` |

Parent headings preserve source hierarchy and order but do not themselves resolve a song number.

## Czech transcription

| Order | Proposed stable ID | Proposed `themeKey` | Parent ID | Exact source title | Inclusive range | Printed page | Scan page |
|---:|---|---|---|---|---:|---:|---:|
| 1 | `czech:church-year:advent` | `church-year.advent` | `czech:church-year` | Advent | 1–29 | 25 | 1 |
| 2 | `czech:church-year:nativity` | `church-year.nativity` | `czech:church-year` | Narození Páně | 30–63 | 62 | 1 |
| 3 | `czech:church-year:old-new-year` | `church-year.old-new-year` | `czech:church-year` | Starý a nový rok | 64–77 | 103 | 1 |
| 4 | `czech:church-year:epiphany` | `church-year.epiphany` | `czech:church-year` | Zjevení Páně | 78–84 | 119 | 1 |
| 5 | `czech:church-year:passion` | `church-year.passion` | `czech:church-year` | Postní období | 85–129 | 127 | 1 |
| 6 | `czech:church-year:easter` | `church-year.easter` | `czech:church-year` | Velikonoce | 130–155 | 186 | 1 |
| 7 | `czech:church-year:ascension` | `church-year.ascension` | `czech:church-year` | Nanebevstoupení Páně | 156–162 | 214 | 1 |
| 8 | `czech:church-year:pentecost` | `church-year.pentecost` | `czech:church-year` | Seslání Ducha svatého | 163–184 | 222 | 1 |
| 9 | `czech:church-year:trinity` | `church-year.trinity` | `czech:church-year` | Trojice svatá | 185–193 | 247 | 1 |
| 10 | `czech:church-year:special-days` | `church-year.special-days` | `czech:church-year` | Památné dny | 194–199 | 256 | 1 |
| 11 | `czech:church-year:harvest-thanksgiving` | `church-year.harvest-thanksgiving` | `czech:church-year` | Díkůvzdání za úrodu | 200–206 | 264 | 1 |
| 12 | `czech:church-year:reformation` | `church-year.reformation` | `czech:church-year` | Svátek reformace | 207–212 | 271 | 1 |
| 13 | `czech:church-year:end` | `church-year.end` | `czech:church-year` | Závěr církevního roku | 213–229 | 277 | 1 |
| 14 | `czech:worship:beginning-end` | `worship.beginning-end` | `czech:worship` | Začátek a konec | 230–266 | 303 | 1 |
| 15 | `czech:worship:liturgical-songs` | `worship.liturgical-songs` | `czech:worship` | Liturgické zpěvy | 267–290 | 339 | 1 |
| 16 | `czech:worship:word-of-god` | `worship.word-of-god` | `czech:worship` | Slovo Boží | 291–305 | 365 | 1 |
| 17 | `czech:worship:baptism` | `worship.baptism` | `czech:worship` | Křest svatý | 306–313 | 384 | 1 |
| 18 | `czech:worship:eucharist` | `worship.eucharist` | `czech:worship` | Svatá Večeře Páně | 314–329 | 393 | 1 |
| 19 | `czech:worship:penitence-confession` | `worship.penitence-confession` | `czech:worship` | Pokání a zpověď | 330–362 | 414 | 1 |
| 20 | `czech:worship:confirmation` | `worship.confirmation` | `czech:worship` | Konfirmace | 363–372 | 447 | 1 |
| 21 | `czech:worship:marriage-family` | `worship.marriage-family` | `czech:worship` | Manželství a rodina | 373–388 | 458 | 1 |
| 22 | `czech:worship:morning` | `worship.morning` | `czech:worship` | Ráno | 389–413 | 476 | 1 |
| 23 | `czech:worship:table` | `worship.table` | `czech:worship` | Poděkování u stolu | 414–424 | 506 | 1 |
| 24 | `czech:worship:evening` | `worship.evening` | `czech:worship` | Večer | 425–447 | 515 | 1 |
| 25 | `czech:worship:sending` | `worship.sending` | `czech:worship` | Vyslání do služby | 448–467 | 540 | 1 |
| 26 | `czech:worship:church-ecumenism` | `worship.church-ecumenism` | `czech:worship` | Církev a ekumena | 468–487 | 568 | 1 |
| 27 | `czech:faith-love-hope:praise-prayer` | `faith-love-hope.praise-prayer` | `czech:faith-love-hope` | Oslava, díky, modlitba | 488–560 | 559 | 2 |
| 28 | `czech:faith-love-hope:justification-assurance` | `faith-love-hope.justification-assurance` | `czech:faith-love-hope` | Ospravedlnění z víry a jistota spásy | 561–585 | 687 | 2 |
| 29 | `czech:faith-love-hope:trust-in-hardship` | `faith-love-hope.trust-in-hardship` | `czech:faith-love-hope` | Důvěra v těžkostech | 586–623 | 716 | 2 |
| 30 | `czech:faith-love-hope:conversion-discipleship` | `faith-love-hope.conversion-discipleship` | `czech:faith-love-hope` | Obrácení a následování Krista | 624–653 | 766 | 2 |
| 31 | `czech:faith-love-hope:divine-love-protection` | `faith-love-hope.divine-love-protection` | `czech:faith-love-hope` | Pod ochranou Boží lásky | 654–691 | 805 | 2 |
| 32 | `czech:faith-love-hope:creation-peace-homeland` | `faith-love-hope.creation-peace-homeland` | `czech:faith-love-hope` | Péče o stvoření, mír a vlast | 692–708 | 850 | 2 |
| 33 | `czech:faith-love-hope:work-travel` | `faith-love-hope.work-travel` | `czech:faith-love-hope` | Práce a cesty | 709–727 | 872 | 2 |
| 34 | `czech:faith-love-hope:nature-seasons` | `faith-love-hope.nature-seasons` | `czech:faith-love-hope` | Příroda a roční období | 728–737 | 897 | 2 |
| 35 | `czech:faith-love-hope:death-resurrection-eternal-life` | `faith-love-hope.death-resurrection-eternal-life` | `czech:faith-love-hope` | Smrt, vzkříšení a život věčný | 738–799 | 909 | 2 |

### Czech structural observations

- 35 selectable sections.
- Complete contiguous coverage `1–799`.
- No overlaps and no gaps visible in the scan.
- Parent blocks: 13 + 13 + 9 selectable sections.

## Polish transcription

| Order | Proposed stable ID | Proposed `themeKey` | Parent ID | Exact source title | Inclusive range | Printed page | Scan page |
|---:|---|---|---|---|---:|---:|---:|
| 1 | `polish:church-year:advent` | `church-year.advent` | `polish:church-year` | Adwent | 1–30 | 22 | 1 |
| 2 | `polish:church-year:nativity` | `church-year.nativity` | `polish:church-year` | Boże Narodzenie | 31–90 | 64 | 1 |
| 3 | `polish:church-year:old-new-year` | `church-year.old-new-year` | `polish:church-year` | Stary i Nowy Rok | 91–104 | 138 | 1 |
| 4 | `polish:church-year:epiphany` | `church-year.epiphany` | `polish:church-year` | Objawienie Pańskie (Epifania) | 105–111 | 157 | 1 |
| 5 | `polish:church-year:passion` | `church-year.passion` | `polish:church-year` | Czas pasyjny | 112–169 | 168 | 1 |
| 6 | `polish:church-year:easter` | `church-year.easter` | `polish:church-year` | Wielkanoc | 170–203 | 248 | 1 |
| 7 | `polish:church-year:ascension` | `church-year.ascension` | `polish:church-year` | Wniebowstąpienie Pańskie | 204–212 | 296 | 1 |
| 8 | `polish:church-year:pentecost` | `church-year.pentecost` | `polish:church-year` | Zesłanie Ducha Świętego | 213–230 | 309 | 1 |
| 9 | `polish:church-year:trinity` | `church-year.trinity` | `polish:church-year` | Trójca Święta | 231–241 | 334 | 1 |
| 10 | `polish:church-year:special-days` | `church-year.special-days` | `polish:church-year` | Szczególne dni roku kościelnego | 242–246 | 347 | 1 |
| 11 | `polish:church-year:harvest-thanksgiving` | `church-year.harvest-thanksgiving` | `polish:church-year` | Dziękczynne Święto Żniw | 247–257 | 354 | 1 |
| 12 | `polish:church-year:reformation` | `church-year.reformation` | `polish:church-year` | Święto Reformacji | 258–266 | 368 | 1 |
| 13 | `polish:church-year:end` | `church-year.end` | `polish:church-year` | Koniec roku kościelnego | 267–283 | 382 | 1 |
| 14 | `polish:worship:beginning-end` | `worship.beginning-end` | `polish:worship` | Początek i koniec nabożeństwa | 284–324 | 410 | 1 |
| 15 | `polish:worship:liturgical-songs` | `worship.liturgical-songs` | `polish:worship` | Śpiewy liturgiczne | 325–373 | 454 | 1 |
| 16 | `polish:worship:word-of-god` | `worship.word-of-god` | `polish:worship` | Słowo Boże | 374–391 | 527 | 1 |
| 17 | `polish:worship:baptism` | `worship.baptism` | `polish:worship` | Sakrament Chrztu Świętego | 392–397 | 552 | 1 |
| 18 | `polish:worship:eucharist` | `worship.eucharist` | `polish:worship` | Sakrament Ołtarza (Eucharystia) | 398–413 | 559 | 1 |
| 19 | `polish:worship:penitence-confession` | `worship.penitence-confession` | `polish:worship` | Pokuta i spowiedź | 414–441 | 580 | 2 |
| 20 | `polish:worship:confirmation` | `worship.confirmation` | `polish:worship` | Konfirmacja | 442–448 | 616 | 2 |
| 21 | `polish:worship:marriage-family` | `worship.marriage-family` | `polish:worship` | Ślub, małżeństwo i rodzina | 449–471 | 626 | 2 |
| 22 | `polish:worship:morning` | `worship.morning` | `polish:worship` | Pieśni poranne | 472–492 | 653 | 2 |
| 23 | `polish:worship:table` | `worship.table` | `polish:worship` | Pieśni stołowe | 493–499 | 678 | 2 |
| 24 | `polish:worship:evening` | `worship.evening` | `polish:worship` | Pieśni wieczorne | 500–524 | 684 | 2 |
| 25 | `polish:worship:sending` | `worship.sending` | `polish:worship` | Posłanie do służby | 525–541 | 715 | 2 |
| 26 | `polish:worship:church-ecumenism` | `worship.church-ecumenism` | `polish:worship` | Kościół i Ekumenia | 542–575 | 739 | 2 |
| 27 | `polish:faith-love-hope:praise-prayer` | `faith-love-hope.praise-prayer` | `polish:faith-love-hope` | Chwała, dziękczynienie i modlitwa | 576–629 | 790 | 2 |
| 28 | `polish:faith-love-hope:justification-assurance` | `faith-love-hope.justification-assurance` | `polish:faith-love-hope` | Usprawiedliwienie i pewność zbawienia | 630–654 | 858 | 2 |
| 29 | `polish:faith-love-hope:trust-in-hardship` | `faith-love-hope.trust-in-hardship` | `polish:faith-love-hope` | Lęk i zaufanie | 655–714 | 895 | 2 |
| 30 | `polish:faith-love-hope:conversion-discipleship` | `faith-love-hope.conversion-discipleship` | `polish:faith-love-hope` | Nawrócenie i naśladowanie | 715–776 | 982 | 2 |
| 31 | `polish:faith-love-hope:divine-love-protection` | `faith-love-hope.divine-love-protection` | `polish:faith-love-hope` | Ukryci w Bożej miłości | 777–821 | 1061 | 2 |
| 32 | `polish:faith-love-hope:love-neighbor` | `faith-love-hope.love-neighbor` | `polish:faith-love-hope` | Miłość bliźniego | 822–836 | 1121 | 2 |
| 33 | `polish:faith-love-hope:creation-peace-homeland` | `faith-love-hope.creation-peace-homeland` | `polish:faith-love-hope` | Zachowanie stworzenia, pokój i ojczyzna | 837–865 | 1140 | 2 |
| 34 | `polish:faith-love-hope:work-travel` | `faith-love-hope.work-travel` | `polish:faith-love-hope` | Praca i podróż | 866–886 | 1174 | 2 |
| 35 | `polish:faith-love-hope:nature-seasons` | `faith-love-hope.nature-seasons` | `polish:faith-love-hope` | Przyroda i pory roku | 887–900 | 1200 | 2 |
| 36 | `polish:faith-love-hope:death-resurrection-eternal-life` | `faith-love-hope.death-resurrection-eternal-life` | `polish:faith-love-hope` | Śmierć, zmartwychwstanie i życie wieczne | 901–955 | 1217 | 2 |

### Polish structural observations

- 36 selectable sections.
- Complete contiguous coverage `1–955`.
- No overlaps and no gaps visible in the scan.
- Parent blocks: 13 + 13 + 10 selectable sections.

## Proposed bilingual pairing

The first 31 selectable concepts pair one-to-one by source order and meaning. The final block is non-isomorphic because the Polish source contains a separate `Miłość bliźniego` section with no separate Czech section.

| Shared `themeKey` | Czech section | Polish section | Proposed status |
|---|---|---|---|
| `church-year.advent` | Advent | Adwent | paired |
| `church-year.nativity` | Narození Páně | Boże Narodzenie | paired |
| `church-year.old-new-year` | Starý a nový rok | Stary i Nowy Rok | paired |
| `church-year.epiphany` | Zjevení Páně | Objawienie Pańskie (Epifania) | paired |
| `church-year.passion` | Postní období | Czas pasyjny | paired |
| `church-year.easter` | Velikonoce | Wielkanoc | paired |
| `church-year.ascension` | Nanebevstoupení Páně | Wniebowstąpienie Pańskie | paired |
| `church-year.pentecost` | Seslání Ducha svatého | Zesłanie Ducha Świętego | paired |
| `church-year.trinity` | Trojice svatá | Trójca Święta | paired |
| `church-year.special-days` | Památné dny | Szczególne dni roku kościelnego | paired |
| `church-year.harvest-thanksgiving` | Díkůvzdání za úrodu | Dziękczynne Święto Żniw | paired |
| `church-year.reformation` | Svátek reformace | Święto Reformacji | paired |
| `church-year.end` | Závěr církevního roku | Koniec roku kościelnego | paired |
| `worship.beginning-end` | Začátek a konec | Początek i koniec nabożeństwa | paired |
| `worship.liturgical-songs` | Liturgické zpěvy | Śpiewy liturgiczne | paired |
| `worship.word-of-god` | Slovo Boží | Słowo Boże | paired |
| `worship.baptism` | Křest svatý | Sakrament Chrztu Świętego | paired |
| `worship.eucharist` | Svatá Večeře Páně | Sakrament Ołtarza (Eucharystia) | paired |
| `worship.penitence-confession` | Pokání a zpověď | Pokuta i spowiedź | paired |
| `worship.confirmation` | Konfirmace | Konfirmacja | paired |
| `worship.marriage-family` | Manželství a rodina | Ślub, małżeństwo i rodzina | paired |
| `worship.morning` | Ráno | Pieśni poranne | paired |
| `worship.table` | Poděkování u stolu | Pieśni stołowe | paired |
| `worship.evening` | Večer | Pieśni wieczorne | paired |
| `worship.sending` | Vyslání do služby | Posłanie do służby | paired |
| `worship.church-ecumenism` | Církev a ekumena | Kościół i Ekumenia | paired |
| `faith-love-hope.praise-prayer` | Oslava, díky, modlitba | Chwała, dziękczynienie i modlitwa | paired |
| `faith-love-hope.justification-assurance` | Ospravedlnění z víry a jistota spásy | Usprawiedliwienie i pewność zbawienia | paired |
| `faith-love-hope.trust-in-hardship` | Důvěra v těžkostech | Lęk i zaufanie | paired by theme, titles are not literal equivalents |
| `faith-love-hope.conversion-discipleship` | Obrácení a následování Krista | Nawrócenie i naśladowanie | paired by theme; Polish title omits explicit `Krista` |
| `faith-love-hope.divine-love-protection` | Pod ochranou Boží lásky | Ukryci w Bożej miłości | paired by theme, titles are not literal equivalents |
| `faith-love-hope.love-neighbor` | — | Miłość bliźniego | Polish-only selectable concept |
| `faith-love-hope.creation-peace-homeland` | Péče o stvoření, mír a vlast | Zachowanie stworzenia, pokój i ojczyzna | paired by theme |
| `faith-love-hope.work-travel` | Práce a cesty | Praca i podróż | paired |
| `faith-love-hope.nature-seasons` | Příroda a roční období | Przyroda i pory roku | paired |
| `faith-love-hope.death-resurrection-eternal-life` | Smrt, vzkříšení a život věčný | Śmierć, zmartwychwstanie i życie wieczne | paired |

## Mixed-language consequence of the non-isomorphic section

The proposed model does not invent a Czech range for `faith-love-hope.love-neighbor`.

When that Polish-only concept is selected in a later UI phase:

- Polish candidates may receive the thematic signal from Polish range `822–836`;
- Czech candidates receive no thematic signal because no Czech section is paired to this `themeKey`;
- melody equivalence cannot transfer the signal.

All other shared concepts evaluate Czech and Polish candidates against their own language-specific ranges.

## Source fidelity checks completed before HUMAN review

- Every visible selectable row from both scans is transcribed.
- Czech ranges are contiguous from `1` through `799`.
- Polish ranges are contiguous from `1` through `955`.
- Printed destination pages are preserved separately from scan-page numbers.
- No range was inferred, merged or split beyond the source.
- The only proposed conceptual interpretation is the bilingual `themeKey` pairing table above.

## HUMAN checkpoint

The user must review:

1. titles and diacritics;
2. every inclusive range;
3. printed page references where useful for traceability;
4. stable-ID wording;
5. the proposed bilingual pairings;
6. especially the Polish-only `Miłość bliźniego` treatment.

After approval, the exact transcription, IDs and pairings become the frozen input for JSON, digests, persistence and runtime acceptance.

`HUMAN PENDING`
