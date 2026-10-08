# Feature: Eigene Test-Datenbank für die Playwright-Systemtests

Status: umgesetzt · Branch: `feature/e2e-testdatenbank` (basiert auf `feature/coin-katalog`) · Art: Test-Infrastruktur, keine fachliche Anforderung aus `docs/requirements.md`

Zugehörige ADRs: [0003](../adr/0003-persistenz-ef-core-postgresql.md), [0007](../adr/0007-systemtests-mit-wegwerf-datenbank.md)

## 1. Ziel und Problem
Die Systemtests (`e2e/`) schreiben bisher in die lokale Entwicklungs-DB `coin`. Ursache sind das Launch-Profil `http` mit den User-Secrets und `reuseExistingServer`. Künftig läuft jeder Systemtestlauf gegen eine eigene, beim Start leere Datenbank. Die Entwicklungs-DB bleibt unberührt, auch wenn parallel eine Dev-API (5172) und Vite (5173) laufen.

## 2. Kernentscheidungen (Begründung in ADR-0007)
1. **Wegwerf-DB per Testcontainers.** Jeder Lauf bekommt einen neuen `postgres:17`-Container mit zufälligem Passwort. „Frisch/leer“ entsteht durch einen neuen Container. Es gibt kein TRUNCATE, kein Drop/Create und keine Logik in der API.
2. **Startskript statt globalSetup.** Playwright startet `webServer` vor `globalSetup`. Deshalb ist ein Node-Skript selbst das `webServer`-Kommando der API. Es startet zuerst den Container und dann die API mit dem passenden Connection-String.
3. **Umgebung `Testing`, ohne Launch-Profil.** In `Testing` laufen die Migrationen automatisch (Program.cs). User-Secrets werden dort nicht geladen, die Dev-DB ist also gar nicht erreichbar. `--no-launch-profile` verhindert, dass das Profil `http` die Umgebung `Development` und Port 5172 erzwingt.
4. **Eigene Ports, nie wiederverwenden.** API 5182, Web 5183, `reuseExistingServer: false`, Vite mit `--strictPort`. Ist ein Port belegt, bricht Playwright ab.
5. **Leer-Prüfung in `globalSetup`.** `GET http://localhost:5183/api/coins` (Kette Web → Proxy → API → DB) muss `200` mit `[]` liefern, sonst bricht der Lauf vor dem ersten Test ab.

## 3. Akzeptanzkriterien
- **AK-1** `npx playwright test` (in `e2e/`) startet für jeden Lauf einen neuen PostgreSQL-Container. Zu Beginn der Tests enthält dessen DB das migrierte Schema und keine Coins.
- **AK-2** Nach einem vollständigen Lauf ist die Zeilenzahl von `coin_typ` und `coin_bild` in der Dev-DB `coin` unverändert. Das gilt auch, wenn während des Laufs eine Dev-API auf 5172 und Vite auf 5173 laufen.
- **AK-3** Die e2e-API lauscht auf `http://localhost:5182` in der Umgebung `Testing`, ohne Launch-Profil. Das e2e-Frontend läuft auf `http://localhost:5183` mit Proxy `/api` → 5182. `baseURL` der Tests ist 5183.
- **AK-4** Ist Port 5182 oder 5183 belegt, bricht der Lauf mit einer Fehlermeldung ab. Kein Test wird ausgeführt, der Exit-Code ist ≠ 0.
- **AK-5** Liefert `GET /api/coins` über 5183 in `globalSetup` nicht `200` mit leerem Array (seit [katalog-seiten](katalog-seiten.md): leere Seite, `gesamt` 0 und `eintraege` leer), bricht der Lauf ab. Die Meldung lautet sinngemäß „Systemtest-Datenbank ist nicht leer bzw. nicht erreichbar – Abbruch, um keine fremde Datenbank zu verändern“. Kein Test wird ausgeführt.
- **AK-6** Ein in der Shell gesetztes `ConnectionStrings__CoinDb` (z. B. auf die Dev-DB) und ein gesetztes User-Secret haben keinen Einfluss. Das Startskript überschreibt die Variable immer mit dem Container-Connection-String. Prüfung: Variable auf die Dev-DB setzen, Lauf ausführen, dann muss AK-2 erfüllt sein.
- **AK-7** Ein in der Shell gesetztes `ASPNETCORE_ENVIRONMENT=Development` oder `ASPNETCORE_URLS` wird vom Startskript ebenfalls überschrieben (`Testing`, 5182).
- **AK-8** Läuft Docker nicht, bricht der Lauf mit einer verständlichen Meldung ab (Hinweis „Docker starten“). Kein Test wird ausgeführt, der Exit-Code ist ≠ 0.
- **AK-9** Nach dem Lauf läuft kein Systemtest-PostgreSQL-Container mehr. Das gilt für erfolgreiche Läufe, für fehlgeschlagene Tests und für einen Abbruch mit Strg+C, spätestens nach 30 s (Ryuk). Prüfung: `docker ps --filter "label=org.testcontainers=true" --filter "ancestor=postgres:17"` ist leer.
- **AK-10** Die Systemtests laufen grün, wenn die Compose-DB gestoppt ist (`docker compose stop`). `.env` und User-Secrets sind für Systemtests nicht nötig.
- **AK-11** Die bestehenden 5 Systemtests aus `coin-katalog.spec.ts` laufen grün, auch zweimal hintereinander und mit `CI=1`.
- **AK-12** Es gibt keine Secrets im Repo. Das DB-Passwort entsteht zur Laufzeit. Startskript und Playwright geben weder Connection-String noch Passwort aus (auch nicht im HTML-Report oder in der webServer-Ausgabe).
- **AK-13** Am Produktivcode (`src/`) ändert sich nichts. `dotnet build` bleibt ohne Warnungen, `dotnet test` bleibt grün.

### Prüfung
- AK-1 und AK-5 prüft `globalSetup` bei jedem Lauf automatisch.
- AK-2, AK-4, AK-6 bis AK-10 sind Abnahmeprüfungen des Testers mit Befehlen, zum Beispiel:
  - Zeilenzahl: `docker compose exec db psql -U coin -d coin -tAc "select count(*) from coin_typ"` vor und nach dem Lauf.
  - Port belegen: `npx http-server -p 5182` oder `python -m http.server 5182`, danach `npx playwright test`.
- Automatisiert: `node scripts/abnahme-dev-db-unberuehrt.mjs [--ci]` (in `e2e/`) prüft AK-2, AK-6, AK-7, AK-9 und die Lauf-Ausgabe für AK-12. Voraussetzung ist die laufende Compose-DB (`coin-db-1`); die Dev-DB wird nur gelesen.
- Die Hilfsfunktionen (`scripts/e2e-umgebung.mjs`, `scripts/leer-pruefung.mjs`) und die Konfiguration prüft `npm run test:skripte` (`node --test scripts/*.test.mjs`), u. a. dass `ASPNETCORE_ENVIRONMENT`, `ASPNETCORE_URLS` und `ConnectionStrings__CoinDb` immer überschrieben werden (AK-6, AK-7).
- xUnit-Integrationstests sind nicht betroffen.

## 4. Umsetzung (Dateien)
| Datei | Änderung |
|---|---|
| `e2e/package.json` | devDependency `@testcontainers/postgresql` (^12). Script `test:skripte` (`node --test scripts/*.test.mjs`). `engines`: Node ≥ 22.18. |
| `e2e/scripts/e2e-umgebung.mjs` (neu) | Reine Hilfsfunktionen: Npgsql-Connection-String (Key-Value-Format), API-Umgebung (entfernt `ASPNETCORE_ENVIRONMENT`, `ASPNETCORE_URLS`, `ConnectionStrings__CoinDb`, `POSTGRESQLCONNSTR_CoinDb`, `CUSTOMCONNSTR_CoinDb` aus der Basisumgebung, auch in Doppelpunkt-Schreibweise, und setzt die e2e-Werte), `dotnet`-Argumente, Log-Zeile ohne Passwort, Docker-Fehlermeldung. |
| `e2e/scripts/start-api.mjs` (neu) | 1. `PostgreSqlContainer('postgres:17')` mit DB `coin_e2e` und 192-Bit-Zufallspasswort starten. Fehlt Docker, mit klarer Meldung und Exit-Code 1 beenden. 2. `dotnet run --project src/Coin.Api --no-launch-profile -c Release` per `spawn` mit der überschriebenen Umgebung starten (Testing, 5182, Container-Connection-String; EF-SQL-Log auf `Warning`). 3. Bei SIGINT/SIGTERM/SIGHUP/SIGBREAK oder Ende der API: API beenden (unter Windows Prozessbaum per `taskkill /T /F`), Container stoppen, Exit-Code weitergeben. 4. Connection-String und Passwort werden nie ausgegeben. |
| `e2e/scripts/leer-pruefung.mjs` (neu) | `GET http://localhost:5183/api/coins`; bei Fehler, Status ≠ 200 oder Antwort ≠ `[]` Abbruch mit der Meldung aus AK-5. |
| `e2e/global-setup.ts` (neu) | Ruft die Leer-Prüfung auf. |
| `e2e/scripts/*.test.mjs` (neu) | `node --test` für Hilfsfunktionen, Leer-Prüfung, globalSetup und Playwright-Konfiguration. |
| `e2e/scripts/abnahme-dev-db-unberuehrt.mjs` (neu) | Manuelle Abnahme (siehe Prüfung). |
| `e2e/playwright.config.ts` | Konstanten `API_URL=http://localhost:5182`, `WEB_URL=http://localhost:5183`, `globalSetup: './global-setup.ts'`. API-webServer: `command: 'node scripts/start-api.mjs'`, `url: ${API_URL}/api/coins`, `reuseExistingServer: false`, `timeout: 180_000`. Web-webServer: `npm run dev -- --port 5183 --strictPort`, `env: { VITE_API_PROXY_TARGET: API_URL }`, `reuseExistingServer: false`. Kopfkommentar aktualisieren. |
| `e2e/tests/coin-katalog.spec.ts` | Nur den Kommentar „da die Datenbank nicht geleert wird“ anpassen. Die eindeutigen Suffixe bleiben, weil sich die Tests innerhalb eines Laufs die DB teilen. |
| `README.md` | Abschnitt „Systemtests“: Voraussetzung Docker und Node ≥ 22.18, weder Compose-DB noch User-Secret nötig. Ports 5182/5183, keine Wiederverwendung, Dev-DB bleibt unberührt. |
| `docs/adr/0007-…` | neu |

`CLAUDE.md`: Der Befehl `cd e2e; npx playwright test` bleibt gleich; der Hinweis, dass Systemtests eine laufende DB und das User-Secret brauchen, ist überholt. `docs/api.md`: keine Änderung.

## 5. Abgrenzung
- Kein Zurücksetzen der DB zwischen einzelnen Tests oder Test-Dateien (nur pro Lauf).
- Kein Reset- oder Test-Endpunkt in der API und keine Testlogik in `src/`.
- Keine Änderung an den xUnit-Integrationstests oder an `compose.yaml`.
- Keine CI-Pipeline-Definition (es gibt noch keine). Das Konzept ist nur CI-tauglich ausgelegt.
- Kein Seeding von Testdaten.

## 6. Sicherheit und Datenschutz
- Das Passwort vergibt Testcontainers zufällig. Es existiert nur im Prozess und in der Kind-Umgebung und erscheint nicht in Logs oder Reports (AK-12).
- Testcontainers (Node, Version 12) veröffentlicht den Container-Port auf einem zufälligen Host-Port ohne `HostIp`, also auf allen Interfaces (`0.0.0.0`/`::`). Während des Laufs ist die Datenbank damit auch aus dem LAN erreichbar, soweit die Firewall das zulässt. Eine Bindung an `127.0.0.1` ist in der öffentlichen API von Testcontainers nicht vorgesehen; auf einen Eingriff in Interna wird bewusst verzichtet. Abgesichert ist das durch das 192-Bit-Zufallspasswort, ausschließlich synthetische Daten und die kurze Lebensdauer des Containers.
- Es gibt drei Schutzschichten gegen das Schreiben in die Dev-DB:
  1. Umgebung `Testing` ohne User-Secrets mit erzwungenem Connection-String.
  2. Eigene Ports ohne Wiederverwendung.
  3. Die Leer-Prüfung in `globalSetup`.
- Testdaten bleiben synthetisch, ohne echte Personendaten.

## 7. Annahmen
- Node-Version: Node ≥ 22.18 (`engines` in `e2e/package.json`; Type-Stripping für `global-setup.ts`). Das Startskript ist `.mjs`, damit kein TS-Loader nötig ist.
- `container.getConnectionUri()` liefert eine `postgres://`-URI. Npgsql erwartet das Key-Value-Format, deshalb baut das Skript den String aus Host, Port, DB, Benutzer und Passwort zusammen.
- Unter Windows beendet das Startskript die API samt Prozessbaum per `taskkill`. Wird das Startskript selbst hart beendet, entfernt Ryuk den Container; in der Praxis nach etwa 25 s (AK-9: spätestens 30 s).
- Bei der ersten Migration in der frischen Datenbank protokolliert EF Core einmalig einen `fail`-Eintrag zu `__ef_migrations_history` (Tabelle existiert noch nicht). Das ist erwartet.

## 8. Entscheidungen zu den offenen Fragen (vom Auftraggeber bestätigt)
1. **Keine Opt-in-Wiederverwendung** (kein `E2E_REUSE`). Die Leer-Prüfung in AK-5 würde beim zweiten Lauf ohnehin scheitern. Bei Bedarf als eigenes Feature.
2. **Release-Build für die e2e-API** (`-c Release`): eigenes Build-Verzeichnis, damit eine laufende Dev-API unter Windows die DLLs in `bin/Debug` nicht sperrt. Der erste Build dauert dafür länger.
