# C.O.I.N. – Certified Official Issue Numbering

Webanwendung zur Verwaltung militärischer Gedenk-Coins der Bundeswehr. Umgesetzt sind bisher:

- **Coin-Katalog**: Coins mit Name, Herausgeber, optionaler Auflage, Beschreibung und Motivbild
  anlegen und in einer Liste anzeigen. Lesen ist ohne Anmeldung möglich (ADR-0014).
- **Anmeldung über Keycloak (OIDC)**: Anmeldung mit E-Mail und Passwort am Keycloak. Benutzer und
  Rollen führt C.O.I.N. in der eigenen Datenbank (ADR-0012, ADR-0013). Coins erfassen dürfen nur
  Administratoren und Sachbearbeiter. Vergeben wird bisher nur die Rolle Administrator, und zwar per
  `Bootstrap:AdminEmails`. Alle anderen Benutzer haben vorerst keine Rolle.

Exemplare, Verleihungen und Zertifikate folgen später.

- API: [docs/api.md](docs/api.md)
- Anleitung für Anwender: [docs/benutzer/anmeldung.md](docs/benutzer/anmeldung.md),
  [docs/benutzer/coin-katalog.md](docs/benutzer/coin-katalog.md)
- Architekturentscheidungen: [docs/adr/](docs/adr/)
- Anforderungen: [docs/requirements.md](docs/requirements.md)
- Test-Keycloak: [infra/keycloak/README.md](infra/keycloak/README.md)

## Voraussetzungen

- .NET 10 SDK
- Node.js mit npm (für die Systemtests ≥ 22.18)
- Docker (lokale PostgreSQL-Datenbank und Test-Keycloak, Integrations- und Systemtests mit Testcontainers)

## Projektstruktur

| Ordner | Inhalt |
|---|---|
| `src/Coin.Domain` | Fachlogik, Entitäten, Validierung (u. a. `Katalog/`, `Benutzer/`) |
| `src/Coin.Infrastructure` | EF Core, PostgreSQL, Migrationen (`Persistenz/Migrationen`) |
| `src/Coin.Api` | ASP.NET Core Web API (Controller, DTOs, `Authentifizierung/`) |
| `tests/Coin.UnitTests`, `tests/Coin.IntegrationTests` | xUnit-Tests |
| `web/` | React-Frontend (Vite, TypeScript, Feature-Sliced Design), UI-Tests in `web/ui-tests` |
| `e2e/` | Systemtests (Playwright, echte API, Wegwerf-Datenbank und Wegwerf-Keycloak) |
| `infra/keycloak/` | Realm-Datei des Test-Keycloak (nur Testdaten) |
| `docs/` | Dokumentation |

## Lokale Umgebung (Datenbank und Test-Keycloak)

`compose.yaml` startet zwei Dienste:

| Dienst | Adresse | Zweck |
|---|---|---|
| `db` | `127.0.0.1:5432` | PostgreSQL 17, Datenbank und Benutzer `coin` |
| `keycloak` | `http://localhost:8180` | Test-Keycloak `quay.io/keycloak/keycloak:26.8.0`, Realm `coin` aus `infra/keycloak/coin-realm.json` |

Beide Passwörter stehen in der Datei `.env`, die nicht eingecheckt wird. **Beide** Werte sind
Pflicht. Fehlt einer, bricht jedes `docker compose up` mit einer Meldung ab, auch wenn nur ein
Dienst gestartet werden soll.

```powershell
Copy-Item .env.example .env      # danach in .env beide Passwörter eintragen:
                                 #   COIN_DB_PASSWORD=<eigenes Passwort>
                                 #   COIN_KEYCLOAK_ADMIN_PASSWORD=<eigenes Passwort>
docker compose up -d
```

Test-Keycloak:

- Realm `coin`, öffentlicher Client `coin-web` (PKCE, ohne Secret), Audience `coin-api`.
- Testbenutzer (`admin@test.local`, `sachbearbeiter@test.local`, `betrachter@test.local`,
  `neu@test.local`) und ihr Testpasswort stehen in [infra/keycloak/README.md](infra/keycloak/README.md).
  Keycloak vergibt keine Rollen.
- Admin-Konsole: `http://localhost:8180/admin`, Benutzer `admin`, Passwort
  `COIN_KEYCLOAK_ADMIN_PASSWORD` aus `.env`. Dieses Konto hat nichts mit `admin@test.local` zu tun.
- `--import-realm` überspringt einen vorhandenen Realm. Nach Änderungen an der Realm-Datei:
  `docker compose up -d --force-recreate keycloak`.
- Der Start dauert etwa 10–30 s. Bereit ist der Keycloak, wenn
  `http://localhost:8180/realms/coin/.well-known/openid-configuration` antwortet.

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

### Konfiguration der Anmeldung

| Schlüssel | Development (`appsettings.Development.json`) | Bedeutung |
|---|---|---|
| `Oidc:Authority` | `http://localhost:8180/realms/coin` | Issuer des Keycloak; Tokens müssen genau diesen `iss` haben |
| `Oidc:Audience` | `coin-api` | erwartete `aud` im Access-Token |
| `Oidc:ClientId` | `coin-web` | erwarteter `azp` (Client des Frontends) |
| `Frontend:Ursprung` | `http://localhost:5173` | einziger für CORS zugelassener Origin; ohne Wert keine CORS-Header |
| `Bootstrap:AdminEmails` | `["admin@test.local"]` | E-Mails, die beim ersten Aufruf die Rolle Administrator erhalten |

- `appsettings.json` enthält für `Oidc:*` keine Werte und eine leere `Bootstrap:AdminEmails`.
- Fehlt ein `Oidc:*`-Wert, ist die Authority keine absolute Adresse oder ist sie `http` mit einem
  anderen Host als `localhost`, `127.0.0.1` oder `::1`, bricht die API beim Start mit einer
  deutschen Meldung ab, die den Schlüssel nennt. Ebenso bei einem ungültigen `Frontend:Ursprung`
  (`*`, mit Pfad oder abschließendem `/`).
- Die Prüfparameter der Tokens (Issuer, Audience, RS256, Lebensdauer, `sub`, `azp`) stehen fest im
  Code. Einstellungen unter `Authentication:Schemes:Bearer` wirken nicht.
- Bootstrap: Nur beim **ersten** Aufruf eines Benutzers, nur bei `email_verified=true` und nur wenn
  die E-Mail (ohne Groß-/Kleinschreibung) in der Liste steht. Eine spätere Änderung der Liste
  vergibt oder entzieht keine Rollen. Rollen aus dem Token werden nie ausgewertet.
- Produktion: Kein Realm aus dem Repository. Konfiguriert wird nur die Adresse des echten Keycloak
  (`https`) sowie Audience und ClientId, z. B. per Umgebungsvariablen `Oidc__Authority`,
  `Oidc__Audience`, `Oidc__ClientId`, `Frontend__Ursprung`, `Bootstrap__AdminEmails__0`. Der
  Betreiber richtet am Keycloak den Client (exakte URIs, PKCE) und den Audience-Mapper ein und
  aktiviert am AD-Provider „Trust Email“, damit Tokens `email_verified=true` tragen. Sonst greift
  der Bootstrap nicht.

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

Anmeldung: `oidc-client-ts` mit `react-oidc-context` (Authorization Code Flow mit PKCE). Die
Konfiguration steht eingecheckt in `web/.env.development`:

| Variable | Wert lokal |
|---|---|
| `VITE_OIDC_AUTHORITY` | `http://localhost:8180/realms/coin` |
| `VITE_OIDC_CLIENT_ID` | `coin-web` |

Fehlt ein Wert, bleibt der Katalog lesbar. Statt „Anmelden“ steht dann „Anmeldung ist nicht
konfiguriert.“ Die Werte werden beim Build eingebettet, ein anderes Ziel braucht also einen eigenen
Build. Tokens liegen nur im `sessionStorage` des Tabs. Ein Bearer-Token geht nur an Pfade unter
`/api/` derselben Origin.

Routen:

| Pfad | Zugang | Inhalt |
|---|---|---|
| `/` | öffentlich | Startseite |
| `/coins` | öffentlich | Katalog; Formular nur für Administrator und Sachbearbeiter |
| `/anmeldung/rueckruf` | öffentlich | Rückkehr vom Keycloak (ohne App-Shell) |
| `/abgemeldet` | öffentlich | Bestätigung nach dem Abmelden |
| `/kein-zugriff` | nur angemeldet | Hinweis für Benutzer ohne Rolle; Benutzer mit Rolle werden nach `/` geleitet |

Unbekannte Pfade zeigen „Seite nicht gefunden.“ Die Guards `erfordertAnmeldung` und
`erfordertRolle` liegen in `src/app/router/schutz.ts`.

### Anmeldung lokal ausprobieren

1. `docker compose up -d`, API und `npm run dev` starten.
2. `http://localhost:5173/coins` öffnen: Der Katalog ist ohne Anmeldung sichtbar, das Formular nicht.
3. „Anmelden“ → Keycloak-Formular → `admin@test.local` mit dem Testpasswort aus
   [infra/keycloak/README.md](infra/keycloak/README.md). Per Bootstrap wird dieser Benutzer
   Administrator und sieht das Formular.
4. `neu@test.local` (ebenso `sachbearbeiter@test.local` und `betrachter@test.local`) hat in der
   App keine Rolle und landet nach der Anmeldung auf „Kein Zugriff“.

Rollen stehen in der Tabelle `benutzer` der Entwicklungs-DB. Eine Oberfläche zur Rollenvergabe gibt
es noch nicht.

### Struktur (Feature-Sliced Design, ADR-0008)

`src/` enthält nur die Schichten `app`, `pages`, `widgets`, `features`, `entities` und `shared`.
Importe zeigen nur nach unten, nie nach oben und nie quer zwischen Slices derselben Schicht.

- Jeder Slice hat eine `index.ts` als Public API. Von außen wird nur über `@/<schicht>/<slice>`
  importiert, innerhalb eines Slices relativ.
- Einziger Alias ist `@/` → `src/` (in `tsconfig.json`, `tsconfig.app.json`, `vite.config.ts`).
- `shared/ui` enthält die shadcn-Komponenten, `shared/lib` u. a. `cn()`, das Farbschema und die
  Anmeldung (`shared/lib/anmeldung`: UserManager, Provider, `useAnmeldung`, `sicheresZiel`),
  `shared/api` den generischen HTTP-Teil (inkl. Bearer-Header), `shared/config` die Routenpfade und
  die OIDC-Konfiguration.
- Anmeldung im Überblick: `entities/benutzer` (`GET /api/me`, Rolle), `features/anmeldung`
  (Buttons „Anmelden“/„Abmelden“), `pages/kein-zugriff`, `pages/abgemeldet`,
  `pages/anmeldung-rueckruf`. `app` lädt `/api/me` einmal pro Anmeldung und reicht Benutzer und
  Anmeldezustand als Props an Widgets und Seiten weiter.
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
| Anmeldung | Identitätsanbieter gemockt (`VITE_OIDC_AUTHORITY=http://127.0.0.1:9/realms/coin`) | echter Wegwerf-Keycloak |
| Voraussetzungen | nur Node.js und Chromium | Docker, .NET 10 SDK, Node.js ≥ 22.18 |
| Port | 5193 | 5183 (Frontend), 5182 (API), 5184 (Keycloak) |

Ports im Überblick: 5172 API, 5173 Dev-Server, 8180 Dev-Keycloak, 5182/5183/5184 Systemtests,
5193 UI-Tests. Die Server werden nie wiederverwendet; ist ein Port belegt, bricht der Lauf ab. Die
Browser-Installation teilen sich beide Projekte.

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
(`postgres:17`); Docker muss laufen. Die lokale Umgebung aus `compose.yaml` wird dafür nicht benötigt.
Einen Keycloak brauchen sie nicht: Ein Test-Identitätsanbieter im Testhost signiert eigene
Test-Tokens (RSA-Schlüssel pro Lauf) und liefert Discovery und JWKS. Ersetzt wird dafür nur der
`BackchannelHttpHandler`, die Prüfparameter bleiben die des Produktionscodes.

Frontend (in `web/`, alle Skripte siehe Abschnitt „Frontend“):

```powershell
npm test         # Vitest
npm run lint     # ESLint und Steiger
npm run test:ui  # Playwright-UI-Tests mit gemockter API
npm run build    # ESLint, TypeScript-Prüfung und Produktions-Build
```

### Systemtests (in `e2e/`)

Voraussetzungen: Docker läuft, Node.js ≥ 22.18, .NET 10 SDK, `npm install` in `web/` und `e2e/`.
Compose-Umgebung (DB, Keycloak), `.env` und User-Secrets sind nicht nötig.

```powershell
cd e2e
npm install
npm run install-browser          # einmalig: Chromium für Playwright
npx playwright test
```

Ablauf pro Lauf (ADR-0007, ADR-0015):

- `scripts/start-api.mjs` startet per Testcontainers zwei Wegwerf-Container:
  - `postgres:17` (Datenbank `coin_e2e`, zufälliges Passwort),
  - Keycloak mit demselben Image-Tag wie `compose.yaml` und der Realm-Datei
    `infra/keycloak/coin-realm.json` auf dem festen Port `5184` (`http://localhost:5184/realms/coin`,
    ohne Admin-Konsolen-Konto).
- Danach startet die API als Release-Build in der Umgebung `Testing` ohne Launch-Profil auf
  `http://localhost:5182`, mit `Oidc:*` des Systemtest-Keycloaks und
  `Bootstrap:AdminEmails` = `admin@test.local`. Die Migrationen laufen beim Start.
- Das Frontend läuft über Vite auf `http://localhost:5183` (Proxy `/api` → 5182,
  `VITE_OIDC_AUTHORITY` → 5184).
- Schreibende Tests melden sich über das echte Keycloak-Formular als `admin@test.local` an.
- Laufende Server werden nie wiederverwendet. Ist Port 5182, 5183 oder 5184 belegt, bricht der Lauf ab.
- `global-setup.ts` prüft vor dem ersten Test, dass die Datenbank leer ist (`GET /api/coins` liefert
  `[]`), sonst bricht der Lauf ab.
- Die Entwicklungsumgebung (DB, Keycloak 8180) und die Dev-Server (5172/5173) bleiben unberührt und
  dürfen parallel laufen. In der Shell gesetzte `ConnectionStrings__CoinDb`, `ASPNETCORE_ENVIRONMENT`
  oder `ASPNETCORE_URLS` werden für die e2e-API überschrieben. Geerbte Variablen der Sektionen
  `Oidc`, `Bootstrap`, `Frontend` und `Authentication` werden in jeder Schreibweise entfernt, auch
  mit Präfix `ASPNETCORE_` oder `DOTNET_`.
- Keycloak braucht im Dev-Modus etwa 10–30 s zum Start, der Lauf dauert entsprechend länger.
- Nach dem Lauf werden die Container gestoppt. Unter Windows wird der API-Prozessbaum per `taskkill`
  beendet; den Container räumt dann in der Praxis Ryuk nach etwa 25 s auf.
- Bei der ersten Migration erscheint einmalig ein Logeintrag `fail: …` zu `__ef_migrations_history`
  (die Tabelle existiert in der frischen Datenbank noch nicht). Das ist erwartet und kein Fehler.

Weitere Befehle (in `e2e/`):

```powershell
npm run test:skripte                         # node --test für die Hilfsskripte in scripts/ und die Keycloak-Dateien (compose.yaml, Realm)
node scripts/abnahme-dev-db-unberuehrt.mjs   # Abnahme: Dev-DB vor und nach einem Lauf gleich
```

Das Abnahmeskript braucht die laufende Compose-DB (Container `coin-db-1`), liest dort nur die
Zeilenzahlen von `coin_typ` und `coin_bild` und startet dazwischen einen vollständigen
Playwright-Lauf (Option `--ci` setzt `CI=1`). Es prüft außerdem, dass danach kein
Systemtest-Container mehr läuft und die Ausgabe kein Passwort enthält.
