# R74 — Organy Fingering PDF Mirror + audit

## Kontrakt a hranice

**Jediný zdroj pravdy pro veřejná Fingering PDF:**
`C:\Users\drobe\organy-app\public\fingering\`

Tento skript je **samostatný nástroj projektu `organy-app`**. Neimportuje kód Prstokladů, nemá žádný argument `--lab`, nepřistupuje k SQLite ani k `score-fingering-lab/data/samples`, originálům či archivu. Neposkytuje však izolaci na úrovni Windows ACL; jde o **oddělení v kódu a v určení pracovních cest**. Schvalování a export z editoru Prstoklady do lokálního `public/fingering` zůstávají beze změny.

Publikuje pouze plochou sadu souborů `EK<ID><X>-<NNN>_fingering.pdf` s PDF signaturou. V tomto adresáři nejsou povoleny podsložky, symlinky ani jiné soubory (STOP). Odpovědnost za obsah publikačního adresáře má HUMAN; skript již nekontroluje databázové schválení.

## Jednorázová instalace R74

**Rozbal obsah ZIPu do `C:\Users\drobe\organy-app\`** (NIKOLI do `score-fingering-lab`). V rootu musí být `publish_fingering_pdfs.py` a `PUBLIKOVAT_PRSTOKLADY.cmd`.

- R74 nahrazuje R73 při publikování. Starý `PUBLIKOVAT_PRSTOKLADY.cmd` v `score-fingering-lab` **nadále nepoužívej**; zůstává starou verzí bez zrcadlení smazaných PDF.
- Již vytvořený tajný Deploy Hook se **přebírá** z `%LOCALAPPDATA%\Prstoklady\vercel_deploy_hook.url`; nic znovu nenastavuj a URL nikomu neposílej.
- Stav posledního ověřeného deploymentu R73/R74 se přebírá z `%LOCALAPPDATA%\Prstoklady\fingering_deployment_state.json`.
- Netřeba nic instalovat (pouze Python, běžný Git a Windows PowerShell). Používá se původní Vercel Deploy Hook pro `main`.

## Běžné použití

1. Případně ručně vyřaď chybné PDF **jen** z `organy-app/public/fingering`. Opravené schválené PDF dodá editor jako nový sample. Prstokladové originály a samply nemaž.
2. Dvojklik na **`C:\Users\drobe\organy-app\PUBLIKOVAT_PRSTOKLADY.cmd`**. Alternativa v rootu organy-app: `python publish_fingering_pdfs.py --publish`.
3. V jediném **scrollovatelném auditním okně** uvidíš všechny `PŘIDAT / NAHRADIT / SMAZAT`, včetně dříve odeslaných změn čekajících na Vercelu. Tlačítko **Zrušit je výchozí**. Kliknutím **OK – Publikovat** schválíš tyto konkrétní změny.
4. Skript provede Git commit/push **výhradně** v `public/fingering`, spustí Deploy Hook a čeká max. 5 minut na ověření. Očekávané soubory musí online odpovídat SHA-256, odstraněné URL musejí vracet HTTP 404/410. `VERCEL: HOTOVO` znamená úspěch této kontroly. Následně lze web vizuálně zkontrolovat v detailu kandidáta.

Čistě read-only audit do terminálu: `python publish_fingering_pdfs.py` (bez síťové synchronizace s GitHubem; `--publish` před akcí ověřuje remote HEAD).

## Záruky a STOP podmínky

- **Před OK se neposílá žádný Git commit, push ani Vercel Deploy Hook.** Odmítnutí nedělá změny. Ani pozdější smazání nepřepíše originaly editoru, pouze kopie z veřejného repozitáře.
- Git `main` a `origin/main` musí být totožné; index nesmí mít předem staged změny. Bez zásahů mimo `public/fingering`; jakýkoli dosud nenasazený commit s kódem aplikace nebo DB změnou způsobí STOP.
- Pokud se lokální PDF po auditním okně změní, skript zastaví operaci. Pokud push uspěje, ale Vercel selže, další spuštění může pokračovat **bez druhého commitu**.
- Vercel hook používá pohyblivou větev `main`. Kontroluje se remote SHA před spuštěním i při ověřování; bez přístupu k Vercel deployment API nelze nezávisle potvrdit Git SHA samotného buildu. Kontrola přesto ověřuje skutečné veřejné PDF (obsah a absence); **neověřuje index neznámých souborů mimo Git kontrakt**.
- Manifest odkazů v Organy se při `next build` regeneruje z `public/fingering` (`prebuild`), takže odstraněné názvy mají zmizet i z detailu kandidáta.

## Automatické testy (izolované)

`python -m unittest discover -s r74_tests -p 'test_*.py' -q`

**18/18 PASS** v izolovaných dočasných Git repozitářích/bare remotes; žádné produkční push ani reálné volání Vercel hooku. Skutečné Windows auditní okno a produkční publish: **NOT RUN**, dokud neproběhne HUMAN test na počítači uživatele.

## Přehled nejbližšího testu

Bezpečně: zatím žádný soubor nemaž, stačí nainstalovat patch a spustit **jen náhled** (`python publish_fingering_pdfs.py` v `organy-app`), poslat výsledek. Po kontrole auditu provedeme ostrý pokus s cílenou opravou/odstraněním chybných PDF.
