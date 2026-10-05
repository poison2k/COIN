# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# C.O.I.N. – Certified Official Issue Numbering

Webanwendung zur Verwaltung militärischer Gedenk-Coins der Bundeswehr: Katalog der Coins,
Echtheitszertifikate mit eindeutiger Nummer, Nachweis wer welchen Coin wofür erhalten hat.
Dies ist ein Experiment: Die Anwendung wird vollständig von KI-Agenten entwickelt.
Ein Mensch gibt Anforderungen vor und nimmt Ergebnisse ab.

## Fachbegriffe
- **Coin**: ein Coin-Typ im Katalog (Motiv, Herausgeber, Auflage, Beschreibung)
- **Exemplar**: ein einzelner, nummerierter Coin eines Typs (Seriennummer)
- **Verleihung**: Übergabe eines Exemplars an eine Person (wer, wann, wofür, durch wen)
- **Zertifikat**: signierter Echtheitsnachweis für ein Exemplar, öffentlich prüfbar

## Technik
- Backend: C# / .NET 10, ASP.NET Core Web API, EF Core, PostgreSQL
- Frontend: React + TypeScript (Vite) in `web/`
- Tests: xUnit (Unit, Integration mit Testcontainers), Vitest (Frontend), Playwright (System, `e2e/`)

## Projektstruktur
- `src/Coin.Domain` – Fachlogik, Entitäten, keine Abhängigkeit nach außen
- `src/Coin.Infrastructure` – Datenzugriff (EF Core), Signatur, externe Dienste
- `src/Coin.Api` – HTTP-API, Authentifizierung, DTOs
- `tests/Coin.UnitTests`, `tests/Coin.IntegrationTests`
- `web/` – React-Frontend, `e2e/` – Systemtests, `docs/` – Dokumentation
- Abhängigkeiten zeigen immer nach innen zur Domain.
  Ist-Stand: Api → Domain + Infrastructure, Infrastructure → Domain, UnitTests → Domain,
  IntegrationTests → Api + Infrastructure (für `WebApplicationFactory`).
- Solution-Datei ist `Coin.slnx` (neues XML-Format).
- Die Katalog-Entität heißt `CoinTyp` (Namespace `Coin.Domain.Katalog`), weil `Coin` mit dem
  Wurzel-Namespace kollidiert (CS0118). In API und UI heißt sie „Coin“.

## Aktueller Stand
Umgesetzt: Coin-Katalog-Pilot (`docs/features/coin-katalog.md`) – Coin anlegen/auflisten,
Motivbild hochladen/abrufen, ohne Anmeldung (ADR-0004). Noch nicht vorhanden: Exemplare,
Verleihungen, Zertifikate, Authentifizierung/Rollen, Audit-Log.
Feature-Entwürfe liegen in `docs/features/`, Endpunkte in `docs/api.md`, Setup im `README.md`.
`dotnet build` ohne Warnungen ist Pflicht, `TreatWarningsAsErrors` ist aber (noch) nicht gesetzt.

## Befehle
- Lokale DB: `.env` aus `.env.example` anlegen (`COIN_DB_PASSWORD`), `docker compose up -d`,
  Connection-String als User-Secret `ConnectionStrings:CoinDb` (`--project src/Coin.Api`)
- Build: `dotnet build`; EF-Tools: `dotnet tool restore`, dann `dotnet ef ...`
- Tests Backend: `dotnet test`
  - Ein Projekt: `dotnet test tests/Coin.UnitTests`
  - Ein Test: `dotnet test --filter "FullyQualifiedName~<Klasse>.<Methode>"`
  - Integrationstests brauchen ein laufendes Docker (Testcontainers startet PostgreSQL).
- API lokal: `dotnet run --project src/Coin.Api` (http://localhost:5172, https://localhost:7176);
  Migrationen laufen nur in Development/Testing automatisch
- Frontend (in `web/`): `npm install`, `npm run dev` (Proxy `/api` → 5172), `npm run build`
  (inkl. `tsc -b`), `npm run lint` (oxlint), `npm test` (Vitest)
- Systemtests (in `e2e/`): `npm install`, einmalig `npm run install-browser`, `npx playwright test`
  (einzeln: `npx playwright test <datei> -g "<name>"`); braucht nur Docker und Node ≥ 22.18 –
  eigener Wegwerf-PostgreSQL-Container pro Lauf, API/Web auf 5182/5183, Dev-DB bleibt unberührt
  (ADR-0007). Hilfsskript-Tests: `npm run test:skripte`

## Konventionen
- C#: nullable aktiviert, `async` mit CancellationToken, keine Logik in Controllern
- Öffentliche API-Änderungen werden in `docs/api.md` festgehalten
- Architekturentscheidungen als ADR in `docs/adr/` (eine Datei pro Entscheidung)
- Kleine, fokussierte Commits mit aussagekräftiger Nachricht, ein Branch pro Feature
- Keine Secrets, Schlüssel oder echten Personendaten im Repository

## Sicherheit und Datenschutz
- Verleihungen enthalten Personendaten und gelten als schutzbedürftig. Zugriff nur nach Rolle.
- Zertifikate werden mit einem privaten Schlüssel signiert, der nie im Repo liegt (Konfiguration/Secret Store).
- Die öffentliche Zertifikatsprüfung zeigt nur das Nötige und keine Personendaten.

## Definition of Done
1. Anforderung in `docs/requirements.md` abgedeckt
2. Unit- und Integrationstests vorhanden und grün, Systemtest für Nutzerfluss wo sinnvoll
3. `dotnet build` ohne Warnungen, `dotnet test` und Frontend-Tests grün
4. Review durch den Agenten `qa-reviewer` ohne offene Findings
5. Doku aktualisiert

## Arbeitsweise
Neue Features laufen über `/feature <Beschreibung>` (`.claude/commands/feature.md`):
Branch `feature/<name>` → **architect** (Entwurf mit nummerierten Akzeptanzkriterien in
`docs/features/<name>.md`, offene Fragen an den Menschen) → **tester** (Tests zuerst, rot aus dem
richtigen Grund) → **developer** (bis alles grün) → **qa-reviewer** (bei kritisch/wichtig zurück
zum developer, max. 3 Runden) → **docs** → commit, nicht pushen.
Rollen und Schreibrechte der Agenten stehen in `.claude/agents/`. Halte dich strikt an deine Rolle:
- architect: nur `docs/`; tester: nur `tests/`, `e2e/`, Testdateien in `web/`;
  developer: nur `src/`, `web/` (Tests nie anpassen); docs: nur `docs/`, `README.md`;
  qa-reviewer: ändert nichts.
- Hauptbranch ist lokal `master` (kein `main` vorhanden); `git push` ist per `.claude/settings.json` gesperrt.
- Offene fachliche Fragen sind in `docs/requirements.md` mit [?] markiert – nicht still raten, nachfragen.
