# R74.2 — viditelná tlačítka potvrzení auditu

## Instalace

Rozbalit ZIP do `C:\Users\drobe\organy-app\` a přepsat existující soubory. Před tím zavřít případné již otevřené auditní okno. **Neinstalovat do `score-fingering-lab`.**

## Oprava

R74.1 měl ve WinForms panelu tlačítka `OK – Publikovat` a `Zrušit` s pevnými souřadnicemi a `Bottom,Right` kotvením. Při následném přepočtu rozměrů panelu a škálování Windows se tlačítka mohly ocitnout mimo viditelnou oblast.

R74.2 nahrazuje pouze tento spodní panel třísloupcovým `TableLayoutPanel`: první sloupec je pružná výplň, poslední dva jsou vyhrazené tlačítkům. Obě tlačítka jsou `Dock=Fill` v buňkách panelu, bez ručního umisťování a kotvení. Audit zůstává scrollovatelný; Enter i Esc stále znamenají bezpečné **Zrušit**, nikoli implicitní publikaci.

Publikační workflow, výpočet auditního diffu, Git commit/push, Deploy Hook, ověřování Vercel, pravidla mazání a izolace od originálů jsou **beze změny**.

## Ověření (izolované)

`python -m unittest discover -s r74_tests -p 'test_*.py' -q` — **18/18 PASS** (včetně rozšířeného testu konstrukce zápatí a izolovaných Git operací). Python `py_compile` PASS. Python AST mimo funkci `confirm_changes` beze změny proti R74.1. **Skutečné vykreslení WinForms v prostředí Windows NOT RUN**; ověří HUMAN.

## První HUMAN krok

Ve `C:\Users\drobe\organy-app` spustit `python publish_fingering_pdfs.py --publish` a zkontrolovat, že dole jsou viditelná **OK – Publikovat** a **Zrušit**. Pokud jsou položky auditu správné, HUMAN smí kliknout OK; jinak Zrušit. Bez OK žádný commit/push/deployment.
