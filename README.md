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
- Node.js mit npm
- Docker (lokale PostgreSQL-Datenbank, Integrationstests mit Testcontainers, Systemtests)

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

Systemtests (in `e2e/`):

```powershell
cd e2e
npm install
npm run install-browser          # einmalig: Chromium für Playwright
npx playwright test
```

Für die Systemtests müssen die lokale Datenbank laufen (`docker compose up -d`) und der
Connection-String gesetzt sein (User-Secret oder Umgebungsvariable). Abhängigkeiten in `web/`
müssen installiert sein. API (Port 5172) und Frontend (Port 5173) startet Playwright selbst; laufen
sie bereits, werden sie außerhalb von CI wiederverwendet. Die Tests legen Coins mit eindeutigen
Namen in der lokalen Datenbank an und löschen sie nicht.
