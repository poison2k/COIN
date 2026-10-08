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
- Frontend: React 19 + TypeScript (Vite) in `web/`, Tailwind CSS v4, shadcn/ui (Base UI),
  TanStack Router (code-basiert), Feature-Sliced Design (geprüft mit Steiger), ESLint + Prettier
- Anmeldung: Keycloak per OIDC (Code Flow + PKCE, öffentlicher Client `coin-web`), API prüft
  JWT-Bearer gegen `Oidc:Authority`; Frontend mit `oidc-client-ts` + `react-oidc-context`.
  Rollen führt C.O.I.N. in der eigenen Datenbank (Tabelle `benutzer`), nie aus dem Keycloak.
- Tests: xUnit (Unit, Integration mit Testcontainers), Vitest (Frontend), Playwright
  (UI-Tests mit gemockter API in `web/ui-tests`, Systemtests mit echter API in `e2e/`)

## Projektstruktur
- `src/Coin.Domain` – Fachlogik, Entitäten, keine Abhängigkeit nach außen
- `src/Coin.Infrastructure` – Datenzugriff (EF Core), Signatur, externe Dienste
- `src/Coin.Api` – HTTP-API, Authentifizierung, DTOs
- `tests/Coin.UnitTests`, `tests/Coin.IntegrationTests`
- `web/` – React-Frontend, `e2e/` – Systemtests, `docs/` – Dokumentation
- `infra/keycloak/` – Realm-Datei des lokalen Test-Keycloak (nur Testdaten, nie produktiv)
- Frontend nach FSD (ADR-0008): `web/src/{app,pages,widgets,features,entities,shared}`, Public API
  je Slice über `index.ts`, Alias `@/`; Importe nur nach unten, keine Querimporte zwischen Slices.
  shadcn-Komponenten liegen in `shared/ui` und sind nachbearbeitet (deutsche Texte, kein Cookie,
  `cn` aus `@/shared/lib/cn`) – nach `npx shadcn add` immer den Diff prüfen (ADR-0009).
  Testhilfen in `web/test/`.
- Abhängigkeiten zeigen immer nach innen zur Domain.
  Ist-Stand: Api → Domain + Infrastructure, Infrastructure → Domain, UnitTests → Domain,
  IntegrationTests → Api + Infrastructure (für `WebApplicationFactory`).
- Solution-Datei ist `Coin.slnx` (neues XML-Format).
- Die Katalog-Entität heißt `CoinTyp` (Namespace `Coin.Domain.Katalog`), weil `Coin` mit dem
  Wurzel-Namespace kollidiert (CS0118). In API und UI heißt sie „Coin“.

## Aktueller Stand
Umgesetzt: Coin-Katalog (`docs/features/coin-katalog.md`, `docs/features/katalog-seiten.md`) –
Katalog `/coins` mit Suche (Name/Herausgeber) und Blättern (`GET /api/coins` liefert Seiten
`{eintraege, gesamt, seite, groesse}`), Detailseite `/coins/{id}` (Platzhalter „Verleihungen“ ohne
Daten), „Coin hinzufügen“ auf `/coins/neu` nur mit `coins.write`, Motivbild hochladen/abrufen;
Lesen öffentlich (ADR-0014), Schreiben nur mit `coins.write`.
Frontend-Grundgerüst mit App-Shell (Startseite `/`, Katalog `/coins`, Sidebar, Hell/Dunkel).
Anmeldung über Keycloak (ADR-0012–0015). Rollen- und Benutzerverwaltung
(`docs/features/rollen-benutzerverwaltung.md`, ADR-0016–0019): Administratoren vergeben Rollen und
deaktivieren/reaktivieren Benutzer unter `/benutzerverwaltung`; Berechtigungen `coins.read`/
`coins.write`/`users.manage`/`audit.read` aus der festen Rechtematrix im Code
(`docs/berechtigungen.md`); Audit-Log für Rollen- und Statusänderungen (`benutzer_audit`,
unveränderlich per Trigger, unbegrenzt aufbewahrt). Der erste Administrator kommt per
`Bootstrap:AdminEmails`. Noch nicht vorhanden: Exemplare, Verleihungen, Zertifikate, Löschkonzept
für das Audit-Log.
Feature-Entwürfe liegen in `docs/features/`, Endpunkte in `docs/api.md`, Setup im `README.md`.
`dotnet build` ohne Warnungen ist Pflicht, `TreatWarningsAsErrors` ist aber (noch) nicht gesetzt.

## Befehle
- Lokale Umgebung: `.env` aus `.env.example` anlegen (`COIN_DB_PASSWORD` und
  `COIN_KEYCLOAK_ADMIN_PASSWORD` sind Pflicht), `docker compose up -d` (PostgreSQL 5432,
  Test-Keycloak 8180, Testbenutzer in `infra/keycloak/README.md`); Connection-String als
  User-Secret `ConnectionStrings:CoinDb` (`--project src/Coin.Api`). Nach Änderungen an der
  Realm-Datei: `docker compose up -d --force-recreate keycloak`
- Build: `dotnet build`; EF-Tools: `dotnet tool restore`, dann `dotnet ef ...`
- Tests Backend: `dotnet test`
  - Ein Projekt: `dotnet test tests/Coin.UnitTests`
  - Ein Test: `dotnet test --filter "FullyQualifiedName~<Klasse>.<Methode>"`
  - Integrationstests brauchen ein laufendes Docker (Testcontainers startet PostgreSQL).
- API lokal: `dotnet run --project src/Coin.Api` (http://localhost:5172, https://localhost:7176);
  Migrationen laufen nur in Development/Testing automatisch
- Frontend (in `web/`): `npm install` (aktiviert den Pre-Commit-Hook: lint + test bei jedem
  Commit), `npm run dev` (Proxy `/api` → 5172), `npm run build` (ESLint + `tsc -b` + Vite),
  `npm run lint` (ESLint + Steiger, 0 Warnungen), `npm run format`, `npm test` (Vitest,
  einzeln: `npx vitest run <datei> -t "<name>"`), `npm run test:ui` (Playwright, gemockte API,
  vorher einmalig `npm run install-browser`)
- Systemtests (in `e2e/`): `npm install`, einmalig `npm run install-browser`, `npx playwright test`
  (einzeln: `npx playwright test <datei> -g "<name>"`); braucht nur Docker und Node ≥ 22.18 –
  eigener Wegwerf-PostgreSQL- und Keycloak-Container pro Lauf (5184), API/Web auf 5182/5183,
  Dev-DB bleibt unberührt (ADR-0007, ADR-0015). Hilfsskript-Tests: `npm run test:skripte`
- Integrationstests nutzen selbst signierte Test-Tokens (`TestIdentitaetsanbieter`), kein Keycloak nötig

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
- Alle Endpunkte sind standardmäßig geschützt (FallbackPolicy). Öffentlich nur ausdrücklich per
  `[AllowAnonymous]` mit Begründung im ADR; der Endpunkt-Inventartest muss mitgezogen werden.
  Öffentliche DTOs enthalten keine Personendaten.
- Token-Prüfparameter (Issuer, Audience, Lebensdauer, Signatur, `azp`) stehen fest im Code und sind
  nicht per Konfiguration abschaltbar. Rollen-Claims aus Tokens werden nie ausgewertet.
- Tokens, Authorization-Header, E-Mail-Adressen und Namen werden nie geloggt.
- Schreibende Endpunkte prüfen den Content-Type per `[Inhaltstyp]` statt `[Consumes]`, damit 401/403
  vor 415 greifen.
- Endpunkte verlangen genau eine Berechtigung (`[Authorize(Policy = Berechtigungen.X)]`), „angemeldet“
  oder sind ausdrücklich öffentlich – nie eine Rolle (`Roles=` verboten). Neue Endpunkte in die
  Endpunkttabelle in `docs/berechtigungen.md` eintragen; `EndpunktTabelleTests` (Integration) und
  `BerechtigungsDokuTests` (Unit) gleichen Doku und Code ab. Marker und Tabellenformat dort nicht ändern.
- Deaktivierte Benutzer erhalten auf jedem Endpunkt mit Anmeldung `403` (`code=benutzer_deaktiviert`);
  öffentliche Endpunkte bleiben tokenunabhängig.
- Das Frontend leitet Sichtbarkeit nur aus `berechtigungen` von `/api/me` ab, nie aus Rollennamen
  (geprüft in `web/src/app/abhaengigkeiten.test.ts`).
- Audit-Einträge sind unveränderlich (nur INSERT/SELECT, DB-Trigger); Änderungen an Rolle oder Status
  nur über `BenutzerverwaltungService` (Sperre plus Audit in derselben Transaktion).
- Request-Logs schreibt nur `AnfrageProtokoll` (Methode, Routen-Template, Status, Dauer; ADR-0019).
  Framework-Kategorien mit Request-Daten (Hosting.Diagnostics, Routing-DfaMatcher,
  ControllerActionInvoker, Kestrel.BadRequests) haben feste Mindeststufen per `ILoggerFactory`-Wrapper
  in `src/Coin.Api/Http/Protokollierung.cs` – nicht per Konfiguration lockern und die `ILoggerFactory`
  (z. B. Serilog) nicht ersetzen, ohne diese Begrenzung nachzubauen.

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
