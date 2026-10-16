# R74.3 — transakční publikace Fingering PDF

R74.3 mění chování po potvrzení auditu tak, aby po neúspěšné publikaci nezůstal GitHub `main` s Fingering PDF, které nejsou ověřené v produkci.

## Invariant

Po dokončení běhu smí být stabilní stav pouze jeden z těchto:

1. nový Fingering stav je na GitHubu i na Vercel Production a je ověřen SHA-256 / 404–410, nebo
2. Fingering subtree je automaticky vrácen na poslední ověřený produkční stav a rollback je nasazen a ověřen.

Lokální `public/fingering/` zůstává zdrojem pravdy a rollback jej nemění.

## Průběh

`python publish_fingering_pdfs.py --publish`

1. audit a explicitní HUMAN OK,
2. případný jeden Fingering commit + push,
3. uložení transakčního stavu mimo repo,
4. Deploy Hook + úplné HTTP ověření,
5. při úspěchu potvrzení nového `last_confirmed_sha`,
6. při selhání automatický rollback pouze Git subtree `public/fingering/`, přičemž ostatní bezpečné publisher soubory zůstávají zachovány,
7. rollback Deploy Hook + ověření návratu produkce.

Pokud proces nebo počítač skončí uprostřed operace, další `--publish` nejprve převezme uloženou transakci. Neodeslaný lokální commit se vrátí a znovu audituje; již odeslaný kandidát se buď dokončí, nebo rollbackuje; rozpracovaný rollback se dokončí před jakoukoli novou publikací.

## Bezpečnostní hranice

Nadále platí tvrdý STOP pro neověřené změny aplikace, migrací a konfigurace mezi posledním produkčním SHA a GitHub `main`. Výjimku tvoří pouze přesně vyjmenované provozní soubory R74 publisheru a `public/fingering/*.pdf`.

Rollback nepoužívá force-push ani přepis historie. Vytvoří nový rollback commit, jehož PDF subtree odpovídá poslednímu ověřenému baseline. Lokální pracovní soubory PDF se při tom nemažou ani nepřepisují.

## Recovery staršího mezistavu

R74.3 umí převzít i starší situaci, kdy správná Fingering PDF už čekají na GitHub `main` a mezi produkčním baseline a `main` jsou pouze publisher-control soubory. V takovém případě nevytváří duplicitní PDF commit a pokračuje auditovaným deploymentem.

Jakákoli neočekávaná změna GitHub `main` během transakce blokuje automatický rollback, aby skript nikdy nepřepsal cizí práci.
