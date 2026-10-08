# Feature: Coin-Katalog (Pilot) – Coin anlegen und in einer Liste anzeigen

Status: umgesetzt (vom qa-reviewer freigegeben) · Branch: `feature/coin-katalog` · Anforderung: `docs/requirements.md`, Funktion 1 (Teil „anlegen“ und „Liste“) und Abschnitt „Erstes Feature (Pilot)“

Zugehörige ADRs: [0001](../adr/0001-controller-statt-minimal-api.md), [0002](../adr/0002-validierung-in-der-domain-und-problemdetails.md), [0003](../adr/0003-persistenz-ef-core-postgresql.md), [0004](../adr/0004-pilot-ohne-authentifizierung.md), [0005](../adr/0005-motivbild-in-postgresql.md), [0006](../adr/0006-bild-upload-als-eigener-endpunkt.md)

Entscheidungen des Auftraggebers (2026-10-05): Auflage optional · Duplikate verboten (409) · Pilot ohne Anmeldung · Motivbild-Upload gehört in den Pilot.

Fortgeschrieben durch [katalog-seiten](katalog-seiten.md): `GET /api/coins` liefert seitenweise mit Suche statt eines Arrays (AK-17 hier überholt), das Formular liegt auf der eigenen Seite `/coins/neu`, `/coins` heißt „Katalog“ und dient nur zum Ansehen (AK-28 hier teilweise überholt), dazu die Detailseite `/coins/{id}`.

## 1. Ziel
Ein Benutzer erfasst über die Weboberfläche einen Coin-Typ (Name, Herausgeber, optional Auflage, Beschreibung und Motivbild). Der Coin wird in PostgreSQL gespeichert und erscheint mit Vorschaubild in einer Katalogliste. Der Pilot legt den durchgehenden technischen Durchstich fest (Domain → EF Core → API → React → Tests).

## 2. Akzeptanzkriterien

### Domain und Validierung
- **AK-1** Ein Coin mit gültigem Name und Herausgeber lässt sich anlegen; Auflage, Beschreibung und Motivbild sind optional. Er bekommt eine serverseitig erzeugte `id` (GUID) und einen serverseitigen Zeitstempel `erstelltAm` (UTC).
- **AK-2** `name` ist erforderlich; nach dem Trimmen 1–200 Zeichen. Leer, nur Leerzeichen oder fehlend → Validierungsfehler für `name`.
- **AK-3** `herausgeber` ist erforderlich; nach dem Trimmen 1–200 Zeichen. Sonst Validierungsfehler für `herausgeber`.
- **AK-4** `auflage` ist optional. Fehlend oder `null` → gespeichert als `null` (unbekannt). Wenn angegeben, ganze Zahl von 1 bis 1.000.000; 0, negativ oder > 1.000.000 → Validierungsfehler für `auflage`.
- **AK-5** `beschreibung` ist optional, nach dem Trimmen höchstens 2000 Zeichen. Leer oder nur Leerzeichen → `null`. Mehr als 2000 Zeichen → Validierungsfehler für `beschreibung`.
- **AK-6** Führende und nachgestellte Leerzeichen in `name`, `herausgeber` und `beschreibung` werden vor Prüfung und Speicherung entfernt.
- **AK-7** Mehrere ungültige Felder werden in einer Antwort gemeinsam gemeldet.
- **AK-8** Ein Coin mit gleichem `name` und `herausgeber` (ohne Beachtung von Groß-/Kleinschreibung, nach Trimmen) wie ein vorhandener Coin wird abgelehnt. Gleicher Name bei anderem Herausgeber ist erlaubt.

### Motivbild (Regeln)
- **AK-9** Ein Coin hat höchstens ein Motivbild. Ohne Bild ist `bildUrl` in der API `null`.
- **AK-10** Zulässig sind nur JPEG, PNG und WebP. Das Format wird anhand der Magic Bytes des Dateiinhalts erkannt; deklarierter Content-Type und Dateiname sind unerheblich. Gespeichert und ausgeliefert wird der erkannte Content-Type (`image/jpeg`, `image/png`, `image/webp`). Alles andere (u. a. SVG, GIF, BMP, HEIC, Text mit `Content-Type: image/png`) ist unzulässig.
- **AK-11** Die Bilddatei ist höchstens 5 MiB groß (5.242.880 Bytes, Grenze inklusive). Eine leere Datei (0 Bytes) ist ungültig.

### API – Coins
- **AK-12** `POST /api/coins` mit gültigen Daten liefert `201 Created`, `Location: /api/coins/{id}` und den angelegten Coin (`bildUrl: null`).
- **AK-13** `POST /api/coins` mit ungültigen Daten liefert `400` als `application/problem+json` (ValidationProblemDetails), `errors`-Schlüssel sind camelCase-Feldnamen; nichts wird gespeichert.
- **AK-14** `POST /api/coins` mit syntaktisch ungültigem JSON oder falschem Typ (z. B. `"auflage": "viel"`) liefert `400` als ProblemDetails; nichts wird gespeichert.
- **AK-15** `POST /api/coins` für ein Duplikat (AK-8) liefert `409` als ProblemDetails, auch bei gleichzeitigen Anfragen (eindeutiger Index); nichts wird gespeichert.
- **AK-16** Vom Client mitgesendete Felder `id`, `erstelltAm` und `bildUrl` werden ignoriert.
- **AK-17** `GET /api/coins` liefert `200` mit einem JSON-Array aller Coins inkl. `bildUrl`, sortiert nach `name` aufsteigend ohne Beachtung von Groß-/Kleinschreibung. Ohne Coins: `[]`. Bilddaten selbst sind nicht enthalten.
- **AK-18** `GET /api/coins/{id}` liefert `200` mit dem Coin; unbekannte ID oder keine GUID → `404`.
- **AK-19** Unerwartete Serverfehler liefern `500` als ProblemDetails ohne Stacktrace oder interne Details.
- **AK-20** Angelegte Coins und ihre Bilder sind nach Neustart der API weiterhin vorhanden.

### API – Motivbild
- **AK-21** `PUT /api/coins/{id}/bild` (multipart/form-data, Feld `datei`) mit gültigem Bild liefert `200` mit dem aktualisierten Coin; `bildUrl` ist gesetzt. Ein vorhandenes Bild wird ersetzt; bei geändertem Inhalt ändert sich `bildUrl`.
- **AK-22** `PUT /api/coins/{id}/bild` für eine unbekannte Coin-ID → `404` als ProblemDetails.
- **AK-23** `PUT /api/coins/{id}/bild` ohne Feld `datei`, mit mehr als einer Datei oder mit leerer Datei → `400` (ValidationProblemDetails, Schlüssel `datei`). Request nicht `multipart/form-data` → `415`.
- **AK-24** Unzulässiges Format (AK-10) → `415` als ProblemDetails; nichts wird gespeichert, ein vorhandenes Bild bleibt unverändert.
- **AK-25** Datei > 5 MiB → `413` als ProblemDetails; nichts wird gespeichert. Das gilt auch für deutlich größere Requests (z. B. 20 MiB), die bereits vom Server-Limit abgewiesen werden – Antwort immer `413` als ProblemDetails, nicht `400` oder Verbindungsabbruch ohne Status.
- **AK-26** `GET /api/coins/{id}/bild` liefert `200` mit den unveränderten Bytes und dem erkannten Content-Type sowie den Headern `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename="coin-{id}.{jpg|png|webp}"`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: private, max-age=31536000, immutable` und `ETag` (SHA-256 des Inhalts). Mit passendem `If-None-Match` → `304` ohne Body.
- **AK-27** `GET /api/coins/{id}/bild` für unbekannten Coin oder Coin ohne Bild → `404`.

### Oberfläche
- **AK-28** Die Seite „Coin-Liste“ (`/coins`, seit [frontend-grundgeruest.md](frontend-grundgeruest.md); `/` ist eine eigene Startseite) zeigt die Katalogliste als Tabelle mit den Spalten Bild, Name, Herausgeber, Auflage, Erfasst am (deutsches Datumsformat). Bild: Vorschaubild max. 64×64 px (Seitenverhältnis erhalten, `loading="lazy"`, `alt="Motiv: {name}"`) oder Text „Kein Bild“. Auflage `null` → „unbekannt“. Leere Liste: „Noch keine Coins erfasst.“
- **AK-29** Während des Ladens wird ein Ladehinweis angezeigt; schlägt das Laden fehl, eine verständliche Fehlermeldung ohne technische Details.
- **AK-30** Das Formular „Coin anlegen“ hat beschriftete Felder (Label mit Feld verknüpft) für Name, Herausgeber, Auflage (optional), Beschreibung (optional), Motivbild (optional; Dateiauswahl mit `accept="image/jpeg,image/png,image/webp"`) und einen Button „Coin anlegen“. Ein ausgewähltes Bild wird vor dem Absenden als Vorschau angezeigt und kann wieder entfernt werden.
- **AK-31** Clientseitig wird wie in AK-2 bis AK-5 und AK-10/AK-11 geprüft (Bild: Dateityp laut Browser und Größe); bei Fehlern wird nicht gesendet und die Meldung steht am jeweiligen Feld. Leere Auflage ist gültig.
- **AK-32** Vom Server gemeldete Feldfehler (400) werden am jeweiligen Feld angezeigt; `409` als „Ein Coin mit diesem Namen und Herausgeber existiert bereits.“; `413`/`415` am Bildfeld („Bild ist zu groß (max. 5 MB).“ / „Nur JPEG, PNG oder WebP erlaubt.“). Eingaben bleiben erhalten.
- **AK-33** Erfolgsfall: Die Oberfläche legt den Coin an (POST) und lädt danach, falls gewählt, das Bild hoch (PUT). Anschließend wird das Formular geleert, eine Erfolgsmeldung angezeigt und der Coin erscheint ohne Neuladen der Seite in der Liste (mit Vorschaubild, falls hochgeladen).
- **AK-34** Teilerfolg: Ist der Coin angelegt, aber der Bild-Upload schlägt fehl, zeigt die Oberfläche „Coin wurde angelegt, das Bild konnte nicht gespeichert werden: {Grund}“, der Coin erscheint ohne Bild in der Liste, und ein Button „Bild erneut hochladen“ wiederholt den Upload für denselben Coin (kein zweiter POST).
- **AK-35** Während des Sendens (beide Schritte) ist der Button deaktiviert (kein Doppelversand).
- **AK-36** Alle Texte der Oberfläche sind deutsch.

## 3. Domänenmodell

Der Entitätsname `Coin` kollidiert mit dem Wurzel-Namespace `Coin` (`Coin.Domain`, `Coin.Api`, ...): In C# würde `Coin` dort als Namespace aufgelöst (CS0118). Die Entität heißt deshalb **`CoinTyp`** (entspricht „Coin = ein Coin-Typ im Katalog“). Fachlich und in API/UI bleibt es „Coin“.

`Coin.Domain/Katalog/CoinTyp.cs`

| Feld | C#-Typ | Pflicht | Regel |
|---|---|---|---|
| `Id` | `Guid` | ja | serverseitig, `Guid.CreateVersion7()` |
| `Name` | `string` | ja | getrimmt, 1–200 Zeichen |
| `Herausgeber` | `string` | ja | getrimmt, 1–200 Zeichen, Freitext |
| `Auflage` | `int?` | nein | `null` = unbekannt; sonst 1–1.000.000 |
| `Beschreibung` | `string?` | nein | getrimmt, max. 2000, leer → `null` |
| `ErstelltAm` | `DateTimeOffset` | ja | UTC, aus `TimeProvider` |
| `Bild` | `CoinBild?` | nein | siehe unten |

`Coin.Domain/Katalog/CoinBild.cs` (zum Coin gehörig, 1:0..1)

| Feld | C#-Typ | Regel |
|---|---|---|
| `Inhalt` | `byte[]` | 1 … 5.242.880 Bytes |
| `Format` | `BildFormat` (Enum `Jpeg`, `Png`, `Webp`) | aus Magic Bytes erkannt; liefert Content-Type und Dateiendung |
| `Sha256` | `string` (64 Hex, klein) | über `Inhalt`; dient als ETag und Version in `bildUrl` |
| `HochgeladenAm` | `DateTimeOffset` | UTC, aus `TimeProvider` |

- Formaterkennung als reine Funktion `BildFormatErkennung.Erkennen(ReadOnlySpan<byte>) → BildFormat?` in der Domain:
  - JPEG: `FF D8 FF`
  - PNG: `89 50 4E 47 0D 0A 1A 0A`
  - WebP: Bytes 0–3 `52 49 46 46` („RIFF“) und Bytes 8–11 `57 45 42 50` („WEBP“), Mindestlänge 12
- Erzeugung nur über Fabrikmethoden mit Ergebnisobjekt (ADR-0002):
  - `CoinTyp.Erstellen(string? name, string? herausgeber, int? auflage, string? beschreibung, DateTimeOffset jetzt)`
  - `CoinBild.Erstellen(byte[] inhalt, DateTimeOffset jetzt)` → Fehler `Leer`, `ZuGross`, `FormatNichtUnterstuetzt` (API bildet auf 400/413/415 ab).
  - `CoinTyp.BildSetzen(CoinBild)` ersetzt ein vorhandenes Bild.
- Grenzwerte als öffentliche Konstanten (`CoinTyp.NameMaxLaenge`, `CoinBild.MaxGroesseBytes` …).
- Use Cases in `Coin.Domain` (kein eigenes Application-Projekt im Pilot):
  - `ICoinKatalogRepository`: `ExistiertAsync(name, herausgeber, ct)`, `HinzufuegenAsync(coin, ct)`, `AlleAsync(ct)` (ohne Bildbytes; nur Bild-Hash), `FindenAsync(id, ct)` (ohne Bildbytes), `BildSpeichernAsync(id, bild, ct)`, `BildLadenAsync(id, ct)`.
  - `CoinKatalogService`: `AnlegenAsync` → `Angelegt | Ungueltig | Duplikat`; `BildHochladenAsync` → `Gespeichert | CoinNichtGefunden | Leer | ZuGross | FormatNichtUnterstuetzt`; `AuflistenAsync`, `FindenAsync`, `BildLadenAsync`.
  - Duplikatprüfung im Service plus eindeutiger DB-Index; das Repository übersetzt PostgreSQL `23505` in `Duplikat`.

## 4. Persistenz (ADR-0003, ADR-0005)
- Pakete: `Npgsql.EntityFrameworkCore.PostgreSQL`, `EFCore.NamingConventions` (Infrastructure); `Microsoft.EntityFrameworkCore.Design` (Api); Tool `dotnet-ef` im Tool-Manifest `.config/dotnet-tools.json`.
- `Coin.Infrastructure/Persistenz/CoinDbContext.cs`, snake_case, Mapping per `IEntityTypeConfiguration`:
  - Tabelle `coin_typ`: `id uuid pk`, `name varchar(200) not null`, `herausgeber varchar(200) not null`, `auflage integer null` mit Check `auflage is null or auflage between 1 and 1000000`, `beschreibung varchar(2000) null`, `erstellt_am timestamptz not null`.
  - Tabelle `coin_bild`: `coin_id uuid pk` + FK auf `coin_typ(id)` `on delete cascade`, `inhalt bytea not null`, `format varchar(10) not null`, `sha256 char(64) not null`, `groesse_bytes integer not null` mit Check `groesse_bytes between 1 and 5242880`, `hochgeladen_am timestamptz not null`.
  - Eindeutiger Index `ux_coin_typ_name_herausgeber` auf `(lower(name), lower(herausgeber))` per `migrationBuilder.Sql(...)`.
- Liste und Einzelabfrage projizieren nur `sha256` aus `coin_bild` (Left Join), **nie** `inhalt`. `inhalt` wird nur von `GET .../bild` gelesen. Sortierung: `OrderBy(c => c.Name.ToLower()).ThenBy(c => c.Id)`.
- Bild ersetzen = Upsert in `coin_bild` in einer Transaktion.
- Registrierung per `AddInfrastruktur(IConfiguration)`; Migration `InitialCoinKatalog` in `Coin.Infrastructure/Persistenz/Migrationen`.
- Migrationen automatisch beim Start nur in `Development` und im Testhost.
- Connection-String `ConnectionStrings:CoinDb` nur über User-Secrets oder Umgebungsvariable `ConnectionStrings__CoinDb`, nicht in `appsettings*.json`. Fehlt er, bricht der Start mit klarer Meldung ab.
- Lokale DB: `compose.yaml` (`postgres:17`), Passwort aus gitignorierter `.env`, `.env.example` ohne echte Werte.

## 5. API (ADR-0001, ADR-0002, ADR-0006)
Controller `Coin.Api/Controllers/CoinsController.cs`, `[ApiController]`, `[Route("api/coins")]`. Aktionen bilden nur DTO → Service → HTTP ab. JSON camelCase. `AddProblemDetails()`, `UseExceptionHandler()`, `UseStatusCodePages()`. WeatherForecast-Template entfernen; `public partial class Program;` für `WebApplicationFactory`.

DTOs (`Coin.Api/Contracts`):
- `CoinAnlegenRequest(string? Name, string? Herausgeber, int? Auflage, string? Beschreibung)`
- `CoinResponse(Guid Id, string Name, string Herausgeber, int? Auflage, string? Beschreibung, DateTimeOffset ErstelltAm, string? BildUrl)`
- `BildUrl` = `/api/coins/{id}/bild?v={sha256[0..16]}` oder `null` (Versions-Parameter macht lange Cache-Dauer sicher).

### POST /api/coins
```json
{ "name": "Einsatzkontingent Beispiel 2025", "herausgeber": "Beispielbataillon 1", "auflage": null, "beschreibung": "Optionaler Text" }
```
| Status | Wann | Body |
|---|---|---|
| 201 | angelegt | `CoinResponse`, Header `Location` |
| 400 | Validierung, kaputtes JSON, falscher Typ | ValidationProblemDetails |
| 409 | Duplikat | ProblemDetails, `title`: „Coin existiert bereits“ |
| 415 | kein JSON | ProblemDetails |

```json
{ "id": "0199a1b2-...", "name": "Einsatzkontingent Beispiel 2025", "herausgeber": "Beispielbataillon 1", "auflage": null,
  "beschreibung": "Optionaler Text", "erstelltAm": "2026-10-05T09:15:00+00:00", "bildUrl": null }
```
```json
{ "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1", "title": "Eingaben ungültig", "status": 400,
  "errors": { "name": ["Name ist erforderlich."], "auflage": ["Auflage muss zwischen 1 und 1000000 liegen."] } }
```

### GET /api/coins · GET /api/coins/{id:guid}
`200` mit `CoinResponse[]` bzw. `CoinResponse`; `404` ProblemDetails. Keine Paginierung im Pilot.

### PUT /api/coins/{id:guid}/bild
`multipart/form-data`, genau ein Dateifeld `datei`. Der Original-Dateiname wird weder gespeichert noch verwendet.

| Status | Wann |
|---|---|
| 200 | gespeichert/ersetzt, Body `CoinResponse` |
| 400 | Feld `datei` fehlt, mehrere Dateien, leere Datei (ValidationProblemDetails, Schlüssel `datei`) |
| 404 | Coin unbekannt |
| 413 | Datei > 5 MiB oder Request über Server-Limit |
| 415 | Request nicht multipart **oder** Dateiinhalt kein JPEG/PNG/WebP |

Umsetzung der Limits: eigener `MultipartDateiLeser` (6 MiB Lesegrenze, max. 16 Formularabschnitte), `[RequestSizeLimit(32 MiB)]` an der Aktion, Begründung in [ADR-0006](../adr/0006-bild-upload-als-eigener-endpunkt.md).

### GET /api/coins/{id:guid}/bild
`200` mit Bytes, Header laut AK-26; `If-None-Match` → `304`; `404` ProblemDetails. Der Query-Parameter `v` wird ignoriert (dient nur dem Cache-Busting).

Vollständige API-Beschreibung: [docs/api.md](../api.md).

## 6. Oberfläche (`web/`)
Router (TanStack Router), Struktur (Feature-Sliced Design) und UI-Bibliothek (shadcn/ui, Base UI, Tailwind) kommen aus dem Feature [frontend-grundgeruest.md](frontend-grundgeruest.md) (ADR-0008 bis ADR-0011). Das Verhalten nach AK-28 bis AK-36 gilt unverändert für die Seite `/coins`.

- Vite-Proxy: `/api` → `http://localhost:5172`, überschreibbar per `VITE_API_PROXY_TARGET`. Kein CORS.
- Bausteine (Pfade unter `web/src/`):
  - `entities/coin/model/types.ts` – `Coin`, `CoinAnlegen`; `ProblemDetails` in `shared/api/problem-details.ts`.
  - `entities/coin/api/coins.ts` – `ladeCoins()`, `legeCoinAn(daten)`, `ladeBildHoch(id, datei)` (`FormData`, Feld `datei`, kein manueller Content-Type-Header). Der generische Teil (Ergebnistyp `ApiErgebnis` mit `ok | validierung | konflikt | zuGross | formatUngueltig | nichtGefunden | fehler`, Statuscode-Abbildung) liegt in `shared/api/http.ts`.
  - `features/coin-anlegen/model/validiereCoin.ts` – reine Funktion für Felder und Bild (Typ `file.type` ∈ erlaubte Typen, `file.size` 1 … 5.242.880).
  - `features/coin-anlegen/ui/CoinFormular.tsx` – Formular inkl. Dateiauswahl und Vorschau (`URL.createObjectURL`, beim Entfernen/Unmount `revokeObjectURL`), Ablauf POST → PUT, Teilerfolg mit „Bild erneut hochladen“ (AK-34), `aria-invalid`/`aria-describedby`, Meldungen mit `role="status"`/`role="alert"`.
  - `entities/coin/ui/CoinListe.tsx` – Tabelle mit Vorschaubild (`<img src={bildUrl}>`, `object-fit: contain`, 64×64), Leerzustand; Auflage `null` → „unbekannt“; Datum via `Intl.DateTimeFormat('de-DE')`.
  - `pages/coin-liste/ui/CoinListeSeite.tsx` – lädt die Liste (Lade- und Fehlerzustand), rendert Formular und Liste, aktualisiert die Liste nach Anlegen/Upload.
- Kein State-Management-Framework.
- Vorschaubilder werden im Pilot vom Browser aus dem Originalbild skaliert (keine serverseitigen Thumbnails, siehe Abschnitt 9).

## 7. Teststrategie
| Ebene | Ort | Inhalt | Einrichtung |
|---|---|---|---|
| Unit (xUnit) | `tests/Coin.UnitTests` | `CoinTyp.Erstellen` AK-1..7 inkl. Grenzwerte (0/1/200/201 Zeichen; Auflage `null`/0/1/1.000.000/1.000.001). `BildFormatErkennung`: JPEG/PNG/WebP positiv; GIF, SVG-Text, „RIFF“ ohne „WEBP“, zu kurze Daten negativ. `CoinBild.Erstellen`: 0 Bytes, 5.242.880 ok, 5.242.881 zu groß, SHA-256 korrekt. `CoinKatalogService` mit Fake-Repository: Duplikat, Upload für unbekannten Coin, Zeit aus `FakeTimeProvider` | `Microsoft.Extensions.TimeProvider.Testing` |
| Integration (xUnit) | `tests/Coin.IntegrationTests` | HTTP gegen `WebApplicationFactory<Program>` + PostgreSQL (Testcontainers): AK-12..27, u. a. Unique-Index bei parallelen POSTs, Sortierung, Persistenz; Upload und Download byte-identisch mit Content-Type und Sicherheits-Headern; ETag/304; Ersetzen ändert `bildUrl`; SVG/GIF/Text-als-PNG → 415 und altes Bild bleibt; 5 MiB + 1 Byte und 20 MiB → 413 ProblemDetails; kein multipart → 415; fehlendes Feld/leere Datei → 400; Liste enthält keine Bildbytes | Collection-Fixture mit `PostgreSqlContainer`; `UseSetting("ConnectionStrings:CoinDb", ...)`; `TRUNCATE coin_typ CASCADE` vor jedem Test. Bilddaten synthetisch in den Tests erzeugt (gültige Signatur + Füllbytes; der Server decodiert nicht). Docker erforderlich |
| Frontend (Vitest) | `web/src/**/*.test.ts(x)` | `validiereCoin` (AK-31), `CoinFormular` (AK-30..35 mit gemocktem `fetch`, inkl. Teilerfolg und Wiederholung ohne zweiten POST), `CoinListe` (AK-28, 29: Vorschaubild/„Kein Bild“/„unbekannt“), `coins.ts` (Statuscode-Abbildung) | `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`; Skript `"test": "vitest run"`; Konfiguration in `vitest.config.ts`, Setup in `web/test/setup.ts`; `URL.createObjectURL` in jsdom mocken |
| System (Playwright) | `e2e/` | Coin mit Bild anlegen → erscheint mit Vorschaubild (Bild geladen, `naturalWidth > 0`); Coin ohne Auflage → „unbekannt“; Pflichtfeld leer → Feldfehler; Duplikat → Konfliktmeldung | eigenes `package.json` mit `@playwright/test`; `playwright.config.ts` mit `webServer` für API (`dotnet run --project src/Coin.Api --launch-profile http`) und `web`; DB per `compose.yaml`; synthetisches Testbild (selbst erzeugtes kleines PNG) unter `e2e/fixtures/`; Namen mit eindeutigem Suffix |

## 8. Sicherheit und Datenschutz (ADR-0004, ADR-0005)
- Coin-Typen enthalten keine Personendaten. Pilot ohne Anmeldung, nur lokal/Entwicklung (vom Auftraggeber bestätigt). Policies (`KatalogSchreiben` für POST/PUT, `KatalogLesen` für GET) lassen sich später ergänzen.
- Keine Secrets im Repo (Connection-String/DB-Passwort nur über User-Secrets, Umgebungsvariablen, `.env`).
- Bild-Upload:
  - Allowlist JPEG/PNG/WebP per Magic Bytes; **kein SVG** (enthält Skript) und kein GIF. Client-Angaben (Content-Type, Dateiname) werden nicht vertraut und nicht gespeichert.
  - Auslieferung nur mit erkanntem Content-Type, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` mit serverseitig gebildetem Dateinamen und `Content-Security-Policy: default-src 'none'; sandbox`. So werden auch Polyglot-Dateien beim direkten Aufruf nicht als HTML/Skript interpretiert.
  - Speicherung als Bytes in der DB, nie im Dateisystem oder unter `wwwroot`; es wird nichts ausgeführt und kein Pfad aus Benutzereingaben gebildet.
  - Größenlimits auf Request-, Formular- und Domain-Ebene (DoS-Schutz). Der Server decodiert Bilder nicht (keine Angriffsfläche durch Bildbibliotheken, keine Dekompressionsbomben serverseitig).
  - Bildinhalte werden nicht geloggt.
- Restrisiko Metadaten: Hochgeladene Fotos können EXIF-Daten enthalten (z. B. GPS, Kameradaten). Sie werden im Pilot nicht entfernt. Das Formular zeigt dazu den Hinweis „Bitte nur Bilder ohne personenbezogene Metadaten hochladen.“ Entfernen per Neukodierung ist ein Folgefeature (Abschnitt 9).
- CSRF: Im Pilot gibt es keine Cookies/Anmeldung, daher nicht relevant. Muss mit dem Auth-Feature betrachtet werden (multipart-Uploads sind CSRF-fähig).
- React: kein `dangerouslySetInnerHTML`. Fehlerantworten ohne interne Details.
- Kein Audit-Log im Pilot (ohne Anmeldung kein Akteur bekannt).

## 9. Nicht im Umfang
Bearbeiten der Coin-Felder, Löschen von Coins oder Bildern, Detailseite in der UI, Suche/Filter/Paginierung, serverseitige Thumbnails, Neukodierung und Entfernen von Metadaten, Begrenzung der Pixelmaße, mehrere Bilder pro Coin, Exemplare, Verleihungen, Zertifikate, Authentifizierung/Rollen, Audit-Log, Mehrsprachigkeit, Deployment/Produktionsmigrationen, Herausgeber als Stammdaten.

## 10. Annahmen
- `name` ist die textuelle Bezeichnung des Motivs; das Motivbild ist optional.
- `herausgeber` ist Freitext. Oberfläche nur Deutsch.
- Im Pilot wenige Coins; dass die Liste Originalbilder (bis 5 MiB) als Vorschau lädt, ist akzeptabel. Bei wachsendem Katalog folgen serverseitige Thumbnails.
- „5 MB“ wird als 5 MiB (5.242.880 Bytes) umgesetzt; die UI nennt „5 MB“.
- Docker ist auf Entwicklerrechnern verfügbar.

## 11. Offene Fragen
Keine. Alle Fragen sind beantwortet oder mit Defaults oben festgelegt.
