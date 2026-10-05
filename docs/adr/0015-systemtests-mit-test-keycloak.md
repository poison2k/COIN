# ADR-0015: Systemtests mit Wegwerf-Keycloak (Testcontainers, fester Port 5184)

Status: Angenommen (umgesetzt) · Datum: 2026-10-05 · Feature: anmeldung-keycloak · Erweitert: [ADR-0007](0007-systemtests-mit-wegwerf-datenbank.md)

## Kontext
Ein Playwright-Test muss die Anmeldung über den echten Test-Keycloak prüfen. Die Systemtests sind nach ADR-0007 unabhängig von Compose, `.env` und der Entwicklungsumgebung und starten pro Lauf frische Container über `scripts/start-api.mjs`. Das Frontend braucht die Authority schon beim Start von Vite (`VITE_OIDC_AUTHORITY`). Die Umgebung der `webServer` steht fest, bevor ein Container läuft.

## Betrachtete Optionen
| Option | Bewertung |
|---|---|
| A: Keycloak aus `compose.yaml` mitbenutzen | braucht `docker compose up` und `.env`, teilt den Zustand mit Dev; widerspricht ADR-0007 |
| B: Testcontainers mit zufälligem Port | die Authority wäre erst zur Laufzeit bekannt, Vite und Issuer brauchen sie vorher |
| C: Testcontainers mit festem Host-Port 5184 (gewählt) | frisch pro Lauf, dieselbe Realm-Datei, Werte vorab bekannt; ist der Port belegt, bricht der Lauf ab (wie bei 5182/5183) |

## Entscheidung
Option C.
- Container: `start-api.mjs` startet vor der API, parallel zum DB-Container, einen `GenericContainer` mit demselben exakten Image-Tag wie `compose.yaml` (`quay.io/keycloak/keycloak:26.8.0`); ein Node-Test prüft die Gleichheit. Scheitert der Start, bricht der Lauf mit „Systemtest-Keycloak konnte nicht gestartet werden. Läuft Docker, und ist Port 5184 frei?“ ab. Weitere Einstellungen:
  - `start-dev --import-realm`, Realm-Datei per Kopie,
  - Port `5184` → `8080`, `KC_HOSTNAME=http://localhost:5184`,
  - kein Bootstrap-Admin,
  - Wait auf `/realms/coin/.well-known/openid-configuration` = `200`.
- API-Umgebung:
  - gesetzt: `Oidc__Authority=http://localhost:5184/realms/coin`, `Oidc__Audience=coin-api`, `Oidc__ClientId=coin-web`, `Bootstrap__AdminEmails__0=admin@test.local`,
  - entfernt (aus der geerbten Umgebung): `Oidc__*`, `Bootstrap__*`, `Frontend__*` und `Authentication__*`, in jeder Schreibweise (`:` oder `__`, Groß-/Kleinschreibung) und auch mit Präfix `ASPNETCORE_` oder `DOTNET_`, weil `WebApplication` diese Präfixe ebenfalls als Konfiguration liest.
- Vite (5183): erhält `VITE_OIDC_AUTHORITY` und `VITE_OIDC_CLIENT_ID`. Die Realm-Datei enthält `http://localhost:5183/…` als Redirect-, Post-Logout- und Web-Origin.
- `global-setup.ts` und die Leer-Prüfung bleiben unverändert, weil `GET /api/coins` öffentlich ist (ADR-0014).
- Tests: Schreibende Tests melden sich über das Keycloak-Formular als `admin@test.local` an. Lesende Tests laufen auch anonym.
- Beim Beenden werden beide Container gestoppt, sonst räumt Ryuk auf.

## Folgen
- Ein Lauf dauert länger, weil Keycloak im Dev-Modus etwa 10–30 s zum Start braucht.
- Wie die e2e-DB ist der e2e-Keycloak während des Laufs auf allen Interfaces erreichbar (Testcontainers ohne `HostIp`). Das ist vertretbar, weil er nur synthetische Testbenutzer enthält und kurzlebig ist.
- Ports: 8180 für den Dev-Keycloak, 5182/5183/5184 für Systemtests.
- `testcontainers` (gleiche Hauptversion wie `@testcontainers/postgresql`) wird direkte devDependency in `e2e/package.json`.
