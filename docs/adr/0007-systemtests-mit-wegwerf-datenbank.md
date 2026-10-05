# ADR-0007: Systemtests mit Wegwerf-Datenbank (Testcontainers) und eigenen Ports

Status: Angenommen · Datum: 2026-10-05 · Feature: e2e-testdatenbank

## Kontext
Die Playwright-Systemtests (`e2e/`) starten die API mit dem Launch-Profil `http` (Development, Port 5172) und Vite auf 5173, beide mit `reuseExistingServer: !CI`. Die API liest den Connection-String aus den User-Secrets, also die Entwicklungs-DB `coin`. Jeder Lauf hinterlässt dort „Systemtest …“-Coins. Läuft bereits eine Dev-API auf 5172, wird sie wiederverwendet, und die Tests schreiben auch dann in die Dev-DB.

Playwright startet die `webServer` **vor** `globalSetup`. Ein in `globalSetup` erzeugter Connection-String würde die API also nicht mehr erreichen.

## Betrachtete Optionen
| Option | Vorteile | Nachteile |
|---|---|---|
| A: zweite DB `coin_e2e` im Compose-Container | schnell, kein neues Paket | `docker compose up` und `.env`-Passwort sind Voraussetzung. Leeren per `psql`/`pg` mit eigener Logik. Der Dev-Container wird mitbenutzt. In CI ist eigener Aufbau nötig. |
| B: eigener Compose-Service (z. B. Port 5433) | gute Isolation | zweite Passwort-/Volume-Verwaltung, manuelles Leeren, Dienst muss laufen |
| C: Testcontainers, gestartet von einem Node-Startskript, das selbst `webServer`-Kommando der API ist | immer frisch und leer (neuer Container pro Lauf). Kein Passwort aus `.env` (zufällig, nur im Prozess). Keine Abhängigkeit zur Dev-DB. CI-tauglich, nur Docker nötig. Gleiches Prinzip wie bei den Integrationstests (ADR-0003). | ca. 2–5 s Containerstart pro Lauf. npm-Abhängigkeit `@testcontainers/postgresql`. |

## Entscheidung
Option C.
- Das `webServer`-Kommando der API ist `node scripts/start-api.mjs`. Das Skript startet `postgres:17` per Testcontainers und danach `dotnet run --project ../src/Coin.Api --no-launch-profile -c Release`. Dabei setzt es diese Umgebungsvariablen:
  - `ASPNETCORE_ENVIRONMENT=Testing`
  - `ASPNETCORE_URLS=http://localhost:5182`
  - `ConnectionStrings__CoinDb=<Container>`

  Andere Quellen für Umgebung, Adresse und Connection-String (`POSTGRESQLCONNSTR_CoinDb`, `CUSTOMCONNSTR_CoinDb`, auch in Doppelpunkt-Schreibweise) entfernt es aus der geerbten Umgebung. Das Passwort ist zufällig (192 Bit) und wird nie ausgegeben.

  Es leitet Signale und den Exit-Code weiter, beendet die API (unter Windows den Prozessbaum per `taskkill`) und stoppt den Container. Bei einem harten Abbruch räumt Ryuk auf, in der Praxis nach etwa 25 s.
- Die Umgebung ist `Testing`. Dort laufen die Migrationen automatisch (Program.cs, ADR-0003). **User-Secrets werden nur in `Development` geladen.** Der Dev-Connection-String ist für die e2e-API deshalb gar nicht erreichbar. Fehlt die Variable, bricht die API ab.
- `--no-launch-profile` ist Pflicht, sonst würde das Profil `http` die Umgebung (`Development`) und den Port (5172) überschreiben.
- `-c Release` nutzt ein eigenes Build-Ausgabeverzeichnis. Unter Windows sperrt eine laufende Dev-API sonst die DLLs in `bin/Debug`.
- Eigene Ports: API 5182, Web 5183 (`--strictPort`, `VITE_API_PROXY_TARGET=http://localhost:5182`). `reuseExistingServer: false` für beide. Ist ein Port belegt, bricht Playwright ab. Ein bereits laufender Server, egal ob Dev-API oder alter e2e-Lauf, wird also nie wiederverwendet.
- `globalSetup` prüft über die ganze Kette (Web 5183 → Proxy → API) mit `GET /api/coins`, dass die DB leer ist (`[]`). Sonst bricht der Lauf vor dem ersten Test ab.

## Folgen
- Die Entwicklungs-DB und `compose.yaml` werden für Systemtests nicht mehr benötigt und nie berührt.
- Jeder Lauf baut und startet die API neu (keine Wiederverwendung). Das ist etwas langsamer, dafür deterministisch.
- Docker ist weiterhin Voraussetzung (wie in ADR-0003).
- Dev-Umgebung (5172/5173) und Systemtests können gleichzeitig laufen.
- Keine Produktivcode-Änderung nötig. Ein Reset-Endpunkt oder eine Lösch-Logik in der API entfällt.
- Testcontainers (Node, Version 12) veröffentlicht den Datenbank-Port ohne `HostIp`, also auf allen Interfaces (`0.0.0.0`/`::`). Für die Dauer eines Laufs ist die Systemtest-DB damit aus dem LAN erreichbar, soweit die Firewall das zulässt. Eine Bindung an `127.0.0.1` ginge nur über Interna von Testcontainers und wird bewusst nicht umgesetzt. Das Risiko ist vertretbar: 192-Bit-Zufallspasswort, ausschließlich synthetische Daten, kurze Lebensdauer des Containers.
- Bei der ersten Migration protokolliert EF Core einmalig einen erwarteten `fail`-Eintrag zu `__ef_migrations_history`.
