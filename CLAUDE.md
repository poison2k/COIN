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
- **Ausgabe**: Übergabe eines Exemplars an eine Person (wer, wann, Gelegenheit, Begründung, ausgebende
  Stelle); wird nie geändert oder gelöscht, nur mit Grund storniert. Früher „Verleihung“.
- **Zertifikat**: signierter Echtheitsnachweis für ein Exemplar, öffentlich prüfbar
- **Zertifikatsvorlage**: Word-Vorlage (.docx) je Coin mit Platzhaltern `{{Gruppe.Feld}}`
  (`docs/platzhalter.md`); ohne eigene gilt die vom Backend erzeugte Standardvorlage
- **Coin-Kennung**: `C` + laufende Nummer mit mindestens 4 Ziffern (`C0042`), unveränderlich,
  Teil der Zertifikatsnummer, nicht im öffentlichen DTO
- **Zertifikatsnummer**: `<Kennung>-<Exemplar, mind. 4-stellig>` (`C0042-0012`), je Ausgabe
  unveränderlich; eine Neuausgabe desselben Exemplars nach Storno erhält dieselbe Nummer
  (eindeutig nur unter aktiven Ausgaben)
- **Block**: einer der fünf festen Bausteine der Startseite (`kopf`, `infotext`, `kennzahlen`,
  `neueste`, `meistausgegeben`); ein- und ausschaltbar, Reihenfolge per Hoch/Runter
- **Logo-Platz**: `bereitsteller` oder `software` im Kopfbereich der Startseite, je mit Alternativtext

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
`{eintraege, gesamt, seite, groesse}`), Detailseite `/coins/{id}`, „Coin hinzufügen“ auf `/coins/neu` nur mit `coins.write`, Motivbild hochladen/abrufen;
Lesen öffentlich (ADR-0014), Schreiben nur mit `coins.write`.
Frontend-Grundgerüst mit App-Shell (Startseite `/`, Katalog `/coins`, Sidebar, Hell/Dunkel).
Anmeldung über Keycloak (ADR-0012–0015). Rollen- und Benutzerverwaltung
(`docs/features/rollen-benutzerverwaltung.md`, ADR-0016–0019): Administratoren vergeben Rollen und
deaktivieren/reaktivieren Benutzer unter `/benutzerverwaltung`; Berechtigungen `coins.read`/
`coins.write`/`users.manage`/`audit.read`/`issues.read`/`issues.write`/`startpage.manage` aus der festen Rechtematrix im Code
(`docs/berechtigungen.md`); Audit-Log für Rollen- und Statusänderungen (`benutzer_audit`,
unveränderlich per Trigger, unbegrenzt aufbewahrt). Der erste Administrator kommt per
`Bootstrap:AdminEmails`. Exemplare und Ausgaben (`docs/features/coin-ausgaben.md`, ADR-0020/0021):
Exemplare 1 bis Auflage, Kennzahlen/Status mit `coins.read`, Historie mit `issues.read`, Erfassen
und Stornieren mit `issues.write`, Auflage ändern mit `coins.write`; `ausgabe` und `ausgabe_audit`
unveränderlich per Trigger. Zertifikatsvorlagen und „Coin bearbeiten“
(`docs/features/zertifikatsvorlagen.md`, ADR-0022–0026): Stammdaten ändern auf
`/coins/{id}/bearbeiten` (`PUT /api/coins/{id}`), Standardvorlage herunterladen, eigene Vorlage
hochladen (Prüfung mit Namespace-Positivliste `docs/word-namespaces.md`, Bereinigung der
Metadaten), Versionen und Zurücksetzen, alles mit `coins.write` (OpenXML SDK in
`Coin.Infrastructure/Vorlagen`); `zertifikat_vorlage` und `vorlage_audit` unveränderlich per
Trigger. Zertifikat erzeugen (`docs/features/zertifikat-erzeugen.md`, ADR-0027–0029): Kennung
per Sequenz `coin_kennung_seq`, Zertifikatsnummer bei Erfassung der Ausgabe; Seite einer Ausgabe
`/coins/{id}/ausgaben/{ausgabeId}` mit `issues.read`; Download `Zertifikat_<Nummer>.docx` aus der
aktiven Vorlage (sonst Standardvorlage ohne Erläuterung) mit `issues.write`, Ersetzung nur im
Speicher, höchstens 200 Platzhalter; jeder Download in `zertifikat_audit` (unveränderlich per
Trigger, kein Lese-Endpunkt). Konfigurierbare Startseite (`docs/features/startseite.md`,
ADR-0030–0032): `/` mit bis zu fünf Blöcken (`GET /api/startseite` mit `coins.read`, Aggregation in
SQL, keine Personendaten), ohne Konfiguration Standardstartseite; Kopfbereich und Logos öffentlich
(`GET /api/startseite/kopf`, `GET /api/startseite/logos/{platz}`); Pflege auf
`/verwaltung/startseite` mit `startpage.manage` (nur Administrator, `PUT` multipart mit Version,
`409` bei Konflikt); Infotext als Markdown über `MarkdownText` (`react-markdown`, kein rohes HTML);
Logos nur PNG/JPEG/WebP; `startseite_audit` unveränderlich per Trigger, ohne Lese-Endpunkt und
ohne Textinhalte. Noch nicht vorhanden: Signatur, PDF, QR-Code/Prüfseite,
Löschkonzept für Audit, Empfängerdaten und Vorlagenversionen.
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
- Ausgaben enthalten Personendaten (Empfänger) und gelten als schutzbedürftig. Zugriff nur mit
  `issues.read`; Empfängerdaten nie in Logs, Audit oder Fehlermeldungen.
- Zertifikate werden mit einem privaten Schlüssel signiert, der nie im Repo liegt (Konfiguration/Secret Store).
- Die öffentliche Zertifikatsprüfung zeigt nur das Nötige und keine Personendaten.
- Alle Endpunkte sind standardmäßig geschützt (FallbackPolicy). Öffentlich nur ausdrücklich per
  `[AllowAnonymous]` mit Begründung im ADR; der Endpunkt-Inventartest muss mitgezogen werden.
  Öffentlich sind genau die drei Katalog-GETs (ADR-0014) sowie `GET /api/startseite/kopf` und
  `GET /api/startseite/logos/{platz}` (ADR-0032). Öffentliche DTOs enthalten keine Personendaten.
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
- Hochgeladene Word-Dateien sind nicht vertrauenswürdig. Die Namespace-Positivliste
  (`Coin.Domain.Vorlagen.WordNamespaces`) ist nicht konfigurierbar und wird nur über den
  Nachtragsprozess aus ADR-0026 erweitert; keine punktuellen Sperrregeln statt Listeneinträgen.
  Marker in `docs/platzhalter.md` und `docs/word-namespaces.md` nicht ändern (Doku-Tests).
- Erzeugte Zertifikate enthalten Personendaten: nur im Speicher erzeugen (kein Dateisystem,
  kein `System.IO.Packaging`, geprüft per Code-Test), nie loggen oder zwischenspeichern;
  Erzeugungsfehler selbst fangen und nur die feste Warnung 2501 schreiben.
- Startseite-Audit hält bei Texten nur „geändert“ fest, nie den Inhalt. Die Startseite zeigt nie
  Empfänger, Anlässe oder Namen.
- Audit-Einträge sind unveränderlich (nur INSERT/SELECT, DB-Trigger); Änderungen an Rolle oder Status
  nur über `BenutzerverwaltungService` (Sperre plus Audit in derselben Transaktion).
- Request-Logs schreibt nur `AnfrageProtokoll` (Methode, Routen-Template, Status, Dauer; ADR-0019).
  Framework-Kategorien mit Request-Daten (Hosting.Diagnostics, Routing-DfaMatcher,
  ControllerActionInvoker, Kestrel.BadRequests) haben feste Mindeststufen per `ILoggerFactory`-Wrapper
  in `src/Coin.Api/Http/Protokollierung.cs` – nicht per Konfiguration lockern und die `ILoggerFactory`
  (z. B. Serilog) nicht ersetzen, ohne diese Begrenzung nachzubauen.

## Datei-Uploads
- Hochgeladene Dateien sind nicht vertrauenswürdig. Typ nur am Inhalt (Magic Bytes, Struktur), nie an
  Endung oder deklariertem Content-Type; feste Positivliste der Formate, SVG nie.
- Größe beim Lesen begrenzen (`MultipartDateiLeser`/`MultipartFormularLeser`,
  `[FormularBindungDeaktivieren]`, `[RequestSizeLimit]` höher als die fachliche Grenze),
  Überschreitung `413` als ProblemDetails; Strukturgrenzen (Teile, Einträge, Tiefe, Pixel) prüfen.
- Verarbeitung nur im Speicher, nie im Dateisystem; Speicherung in PostgreSQL (`bytea`) ohne
  Originalnamen und deklarierten Typ (ADR-0005, ADR-0023, ADR-0030).
- Auslieferung mit erkanntem Content-Type, `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: default-src 'none'; sandbox`, generiertem ASCII-Dateinamen; Downloads
  mit Personendaten `no-store`, öffentliche Bilder mit versionierter URL und ETag (ADR-0014, ADR-0032).
- Dateinamen, Dateiinhalte, Metadaten und Parser-Ausnahmen nie loggen; Befunde als
  `400 errors.<feld>` mit deutscher Meldung ohne Dateiinhalt (ADR-0024, ADR-0026, ADR-0031).
- Im Frontend kein `dangerouslySetInnerHTML`; vom Benutzer formatierter Text nur über
  `MarkdownText` (ADR-0031, geprüft in `web/src/app/markdown-sicherheit.test.ts`).

## Definition of Done
1. Anforderung in `docs/requirements.md` abgedeckt
2. Unit- und Integrationstests vorhanden und grün, Systemtest für Nutzerfluss wo sinnvoll
3. `dotnet build` ohne Warnungen, `dotnet test` und Frontend-Tests grün
4. Review durch den Agenten `qa-reviewer` ohne offene Findings
5. Doku aktualisiert

## Branches (Gitflow)
Details und Abläufe in `docs/branching.md`.
- `main`: nur freigegebene Stände, jeder Stand ist ein Release mit Tag `vX.Y.Z` (SemVer).
- `develop`: Integrationsbranch, hier landen fertige Features.
- `feature/<name>`: von `develop`, Rückführung nach `develop` mit `git merge --no-ff`.
- `release/X.Y.Z`: von `develop`, nur Fehlerkorrekturen und Versionsnummer, dann nach `main` mit
  Tag und zurück nach `develop`. `hotfix/<name>`: von `main`, nach `main` mit Tag und zurück nach `develop`.
- Direkte Commits auf `main` und `develop` sind verboten (Pre-Commit-Hook, Merges ausgenommen).
- Release und Hotfix führt ausschließlich ein Mensch durch. Agenten arbeiten nur auf `feature/*`
  (Umbauten ohne Fachfunktion auf `chore/*`) und mergen nie selbst nach `develop` oder `main`.

## Arbeitsweise
Neue Features laufen über `/feature <Beschreibung>` (`.claude/commands/feature.md`):
Branch `feature/<name>` von `develop` → **architect** (Entwurf mit nummerierten Akzeptanzkriterien in
`docs/features/<name>.md`, offene Fragen an den Menschen) → **tester** (Tests zuerst, rot aus dem
richtigen Grund) → **developer** (bis alles grün) → **qa-reviewer** (bei kritisch/wichtig zurück
zum developer, max. 3 Runden) → **docs** → commit, nicht pushen, nicht selbst nach `develop` mergen
(fertigen Branch übergeben).
Rollen und Schreibrechte der Agenten stehen in `.claude/agents/`. Halte dich strikt an deine Rolle:
- architect: nur `docs/`; tester: nur `tests/`, `e2e/`, Testdateien in `web/`;
  developer: nur `src/`, `web/` (Tests nie anpassen); docs: nur `docs/`, `README.md`;
  qa-reviewer: ändert nichts.
- `git push` ist per `.claude/settings.json` gesperrt.
- Offene fachliche Fragen sind in `docs/requirements.md` mit [?] markiert – nicht still raten, nachfragen.
