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
| `web/` | React-Frontend (Vite, TypeScript) |
| `e2e/` | Systemtests (Playwright) |
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

## Frontend starten

```powershell
cd web
npm install
npm run dev
```

Der Vite-Dev-Server (standardmäßig `http://localhost:5173`) leitet `/api` an
`http://localhost:5172` weiter. Ein anderes Ziel lässt sich per Umgebungsvariable
`VITE_API_PROXY_TARGET` setzen. Die API muss für das Frontend laufen.

## Build und Tests

```powershell
dotnet build
dotnet test                                                     # Unit- und Integrationstests
dotnet test --filter "FullyQualifiedName~CoinAnlegenTests"      # Auswahl von Tests
```

Die Integrationstests starten per Testcontainers einen eigenen PostgreSQL-Container
(`postgres:17`); Docker muss laufen. Die lokale Datenbank aus `compose.yaml` wird dafür nicht benötigt.

Frontend (in `web/`):

```powershell
npm test         # Vitest
npm run lint     # oxlint
npm run build    # TypeScript-Prüfung und Produktions-Build
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
