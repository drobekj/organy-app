# R74.4 — bezpečná obnova produkčního baseline

R74.4 opravuje chybu R74.3, kdy chybějící lokální soubor
`%LOCALAPPDATA%\Prstoklady\fingering_deployment_state.json` vedl k tichému použití
historického konstantního baseline `d0d88c0...`. Po dalších úspěšných publikacích pak
preview vykazoval desítky už dávno publikovaných PDF jako nové.

## Nový invariant

Chybějící state se už nikdy nenahrazuje pevným historickým SHA.

Skript místo toho:

1. vyžádá shodu lokální `main` s GitHub `main`,
2. projde pouze historické commity vytvořené Fingering publisherem,
3. pro kandidáta vypočítá SHA-256 všech jeho PDF,
4. proti veřejnému `https://organy-app.vercel.app/fingering/...` ověří byte-exact obsah
   i nepřítomnost historicky známých smazaných PDF,
5. první přesně odpovídající kandidát zapíše jako nový `last_confirmed_sha`,
6. teprve potom sestaví publikační audit.

Pokud přesný produkční stav nelze bezpečně prokázat, skript skončí STOP a nic nepublikuje.

Tato recovery nemění GitHub, Vercel ani lokální `public/fingering/`; pouze obnoví
ztracený lokální deployment state po byte-exact ověření skutečné produkce.
