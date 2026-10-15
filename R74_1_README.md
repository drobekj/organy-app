# R74.1 — oprava zobrazení auditního okna ve Windows

## Instalace

Rozbalit do `C:\Users\drobe\organy-app\` přes existující soubory. Nahrazuje jen `publish_fingering_pdfs.py` a test `r74_tests/test_publish_mirror.py`.

## Oprava

Původní WinForms TextBox zobrazil audit na jediném dlouhém řádku (LF vs. Windows multiline). Nové okno má samostatný pevný přehled počtů přidání/nahrazení/smazání, oddělený rolovatelný seznam všech názvů PDF (RichTextBox.Lines), automaticky nic neoznačuje a výchozí klávesa Enter stále znamená Zrušit.

Beze změny: výpočet auditu, Git commit/push, kontrola baseline, Deploy Hook, ověřování Vercel, pravidla smazání i úplná izolace od originálů Prstokladů. Zrušit = žádné změny.

## Ověření

`python -m unittest discover -s r74_tests -p 'test_*.py' -q`

18/18 PASS na izolovaných lokálních Git repozitářích; strukturální porovnání Python AST potvrzuje, že mimo funkci `confirm_changes` není změněná publikační logika. **Skutečné Windows GUI NOT RUN** v tomto prostředí. Ověřit na PC uživatele otevřením `python publish_fingering_pdfs.py --publish` a vizuální kontrolou přehledného auditu před potvrzením.
