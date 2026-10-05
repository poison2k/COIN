# C.O.I.N. – Certified Official Issue Numbering

Webanwendung zur Verwaltung militärischer Gedenk-Coins der Bundeswehr. Umgesetzt ist bisher der
**Coin-Katalog (Pilot)**: Coins mit Name, Herausgeber, optionaler Auflage, Beschreibung und Motivbild
anlegen und in einer Liste anzeigen. Exemplare, Verleihungen, Zertifikate und Anmeldung folgen später.
Der Pilot hat keine Anmeldung und ist nur für den lokalen Entwicklungsbetrieb gedacht (ADR-0004).

- API: [docs/api.md](docs/api.md)
- Anleitung für Anwender: [docs/benutzer/coin-katalog.md](docs/benutzer/coin-katalog.md)
- Architekturentscheidungen: [docs/adr/](docs/adr/)
- Anforderungen: [docs/requirements.md](docs/requirements.md)

## Voraussetzungen

- .NET 10 SDK
- Node.js mit npm (für die Systemtests ≥ 22.18)
- Docker (lokale PostgreSQL-Datenbank, Integrations- und Systemtests mit Testcontainers)

## Projektstruktur

| Ordner | Inhalt |
|---|---|
| `src/Coin.Domain` | Fachlogik, Entitäten, Validierung |
| `src/Coin.Infrastructure` | EF Core, PostgreSQL, Migrationen (`Persistenz/Migrationen`) |
| `src/Coin.Api` | ASP.NET Core Web API (Controller, DTOs) |
| `tests/Coin.UnitTests`, `tests/Coin.IntegrationTests` | xUnit-Tests |
| `web/` | React-Frontend (Vite, TypeScript, Feature-Sliced Design), UI-Tests in `web/ui-tests` |
| `e2e/` | Systemtests (Playwright, echte API und Wegwerf-Datenbank) |
| `docs/` | Dokumentation |

## Lokale Datenbank

PostgreSQL 17 läuft per `compose.yaml` auf `127.0.0.1:5432` (Datenbank und Benutzer `coin`).
Das Passwort steht in der Datei `.env`, die nicht eingecheckt wird.

```powershell
Copy-Item .env.example .env      # danach in .env COIN_DB_PASSWORD=<eigenes Passwort> eintragen
docker compose up -d
```

Connection-String als User-Secret der API setzen (Passwort wie in `.env`):

```powershell
dotnet user-secrets set "ConnectionStrings:CoinDb" "Host=localhost;Port=5432;Database=coin;Username=coin;Password=<aus .env>" --project src/Coin.Api
```

Alternativ die Umgebungsvariable `ConnectionStrings__CoinDb` setzen. Fehlt der Connection-String,
bricht die API beim Start mit einer Meldung ab. Connection-Strings gehören nie in `appsettings*.json`.

## API starten

```powershell
dotnet tool restore              # stellt dotnet-ef aus .config/dotnet-tools.json bereit
dotnet run --project src/Coin.Api
```

Die API lauscht auf `http://localhost:5172` (Profil `http`, Standard) bzw. zusätzlich
`https://localhost:7176` (Profil `https`, `--launch-profile https`). Beide Profile laufen in der
Umgebung `Development`.

Migrationen werden nur in den Umgebungen `Development` und `Testing` beim Start automatisch
angewendet. In Development ist das OpenAPI-Dokument unter `/openapi/v1.json` abrufbar.

Neue Migration anlegen:

```powershell
dotnet ef migrations add <Name> --project src/Coin.Infrastructure --startup-project src/Coin.Api --output-dir Persistenz/Migrationen
```

## Frontend (`web/`)

Technik: React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui in der Base-UI-Variante
(`@base-ui/react`, Icons `lucide-react`) und TanStack Router mit code-basiertem Routenbaum
(ADR-0009, ADR-0010).

```powershell
cd web
npm install                      # richtet auch den Git-Hook ein (siehe unten)
npm run dev
```

Der Vite-Dev-Server läuft auf `http://localhost:5173` und leitet `/api` an
`http://localhost:5172` weiter. Ein anderes Ziel lässt sich per Umgebungsvariable
`VITE_API_PROXY_TARGET` setzen. Die API muss für das Frontend laufen.

Routen: `/` Startseite, `/coins` Coin-Liste (Formular und Katalog). Unbekannte Pfade zeigen
„Seite nicht gefunden.“

### Struktur (Feature-Sliced Design, ADR-0008)

`src/` enthält nur die Schichten `app`, `pages`, `widgets`, `features`, `entities` und `shared`.
Importe zeigen nur nach unten, nie nach oben und nie quer zwischen Slices derselben Schicht.

- Jeder Slice hat eine `index.ts` als Public API. Von außen wird nur über `@/<schicht>/<slice>`
  importiert, innerhalb eines Slices relativ.
- Einziger Alias ist `@/` → `src/` (in `tsconfig.json`, `tsconfig.app.json`, `vite.config.ts`).
- `shared/ui` enthält die shadcn-Komponenten, `shared/lib` u. a. `cn()` und das Farbschema,
  `shared/api` den generischen HTTP-Teil, `shared/config` die Routenpfade.
- Testhilfen (Fake-API, Setup) liegen außerhalb der Schichten in `web/test/`.
- Steiger prüft die Regeln (`npm run lint:fsd`, Konfiguration `steiger.config.ts`).

### Skripte (in `web/`)

| Skript | Zweck |
|---|---|
| `npm run dev` | Vite-Dev-Server (Port 5173) |
| `npm run build` | ESLint, TypeScript-Prüfung (`tsc -b`) und Produktions-Build nach `dist/` |
| `npm run lint` | ESLint und Steiger; keine Warnungen erlaubt, jeder Befund ist ein Fehler |
| `npm run lint:fix` | ESLint mit automatischer Korrektur |
| `npm run lint:fsd` | nur Steiger (FSD-Regeln für `src/`) |
| `npm run format` | Prettier formatiert alle `ts`, `tsx`, `js`, `jsx`, `json` und `css`-Dateien |
| `npm test` | Vitest, einmaliger Lauf (`src/**/*.test.ts(x)`, jsdom) |
| `npm run test:dev` | Vitest im Watch-Modus |
| `npm run test:ui` | Playwright-UI-Tests aus `ui-tests/` (Chromium, Port 5193) |
| `npm run tsc` | TypeScript-Prüfung aller Projekte (`tsc -b`: `src`, `test`, `ui-tests`, Konfigurationsdateien) |
| `npm run preview` | Vorschau des Produktions-Builds |
| `npm run prepare` | richtet Husky ein; läuft automatisch bei `npm install` |
| `npm run install-browser` | einmalig: Chromium für Playwright installieren |

### Pre-Commit-Hook (Husky)

`npm install` in `web/` setzt `git config core.hooksPath` auf `web/.husky/_`. Danach führt
`web/.husky/pre-commit` bei jedem Commit im gesamten Repo, auch bei reinen Backend-Änderungen,
in `web/` `npm run lint` und `npm test` aus. Schlägt einer davon fehl, wird der Commit abgelehnt.

Der Hook prüft den Arbeitsstand auf der Platte, nicht nur den Index (es gibt kein lint-staged).
Nicht gestagte Änderungen fließen also in das Ergebnis ein: Ein fehlerhafter, nicht gestagter
Stand blockiert auch einen sauberen Commit, und ein Fehler, der nur im Index steht, kann
unbemerkt bleiben, wenn der Arbeitsstand ihn schon behoben hat. Zuverlässig ist das Ergebnis
nur, wenn Index und Arbeitsstand übereinstimmen.

### Zwei Arten von Browser-Tests

| | `web/ui-tests` (`npm run test:ui`) | `e2e/` (`npx playwright test`) |
|---|---|---|
| Zweck | App-Shell: Laden, Routing, Seitenleiste, Farbschema, Darstellung der Liste | fachliche Abläufe über alle Schichten |
| API | gemockt per `page.route`; Proxy-Ziel absichtlich unerreichbar; jeder nicht gemockte `/api`-Aufruf lässt den Test scheitern | echte API (Release-Build) mit Wegwerf-PostgreSQL |
| Voraussetzungen | nur Node.js und Chromium | Docker, .NET 10 SDK, Node.js ≥ 22.18 |
| Port | 5193 | 5183 (Frontend), 5182 (API) |

Ports im Überblick: 5173 Dev-Server, 5183 Systemtests, 5193 UI-Tests. Die Server werden nie
wiederverwendet; ist ein Port belegt, bricht der Lauf ab. Die Browser-Installation teilen sich
beide Projekte.

### shadcn-Komponenten

Die Komponenten liegen in `src/shared/ui` (Konfiguration `components.json`) und wurden nach dem
Erzeugen angepasst (ADR-0009). Nach einem erneuten `npx shadcn add` immer den Diff prüfen:
Die CLI erzeugt `import { cn } from "cn"` statt `@/shared/lib/cn` und überschreibt Anpassungen,
u. a. das entfernte Sidebar-Cookie, die deutschen Texte, `inert` an der eingeklappten
Seitenleiste und die Ausnahme für Strg+B in Eingabefeldern. Danach `npm run format` und
`npm run lint` ausführen.

## Build und Tests

```powershell
dotnet build
dotnet test                                                     # Unit- und Integrationstests
dotnet test --filter "FullyQualifiedName~CoinAnlegenTests"      # Auswahl von Tests
```

Die Integrationstests starten per Testcontainers einen eigenen PostgreSQL-Container
(`postgres:17`); Docker muss laufen. Die lokale Datenbank aus `compose.yaml` wird dafür nicht benötigt.

Frontend (in `web/`, alle Skripte siehe Abschnitt „Frontend“):

```powershell
npm test         # Vitest
npm run lint     # ESLint und Steiger
npm run test:ui  # Playwright-UI-Tests mit gemockter API
npm run build    # ESLint, TypeScript-Prüfung und Produktions-Build
```

### Systemtests (in `e2e/`)

Voraussetzungen: Docker läuft, Node.js ≥ 22.18, .NET 10 SDK, `npm install` in `web/` und `e2e/`.
Compose-DB, `.env` und User-Secrets sind nicht nötig.

```powershell
cd e2e
npm install
npm run install-browser          # einmalig: Chromium für Playwright
npx playwright test
```

Ablauf pro Lauf (ADR-0007):

- `scripts/start-api.mjs` startet per Testcontainers einen eigenen Wegwerf-Container `postgres:17`
  (Datenbank `coin_e2e`, zufälliges Passwort) und danach die API als Release-Build in der Umgebung
  `Testing` ohne Launch-Profil auf `http://localhost:5182`. Die Migrationen laufen beim Start.
- Das Frontend läuft über Vite auf `http://localhost:5183` (Proxy `/api` → 5182).
- Laufende Server werden nie wiederverwendet. Ist Port 5182 oder 5183 belegt, bricht der Lauf ab.
- `global-setup.ts` prüft vor dem ersten Test, dass die Datenbank leer ist (`GET /api/coins` liefert
  `[]`), sonst bricht der Lauf ab.
- Die Entwicklungs-DB und die Dev-Server (5172/5173) bleiben unberührt und dürfen parallel laufen.
  In der Shell gesetzte `ConnectionStrings__CoinDb`, `ASPNETCORE_ENVIRONMENT` oder `ASPNETCORE_URLS`
  werden für die e2e-API überschrieben.
- Nach dem Lauf wird der Container gestoppt. Unter Windows wird der API-Prozessbaum per `taskkill`
  beendet; den Container räumt dann in der Praxis Ryuk nach etwa 25 s auf.
- Bei der ersten Migration erscheint einmalig ein Logeintrag `fail: …` zu `__ef_migrations_history`
  (die Tabelle existiert in der frischen Datenbank noch nicht). Das ist erwartet und kein Fehler.

Weitere Befehle (in `e2e/`):

```powershell
npm run test:skripte                         # node --test für die Hilfsskripte in scripts/
node scripts/abnahme-dev-db-unberuehrt.mjs   # Abnahme: Dev-DB vor und nach einem Lauf gleich
```

Das Abnahmeskript braucht die laufende Compose-DB (Container `coin-db-1`), liest dort nur die
Zeilenzahlen von `coin_typ` und `coin_bild` und startet dazwischen einen vollständigen
Playwright-Lauf (Option `--ci` setzt `CI=1`). Es prüft außerdem, dass danach kein
Systemtest-Container mehr läuft und die Ausgabe kein Passwort enthält.
