# API

Basis-URL lokal: `http://localhost:5172` (siehe [README](../README.md)). JSON in camelCase.
In der Umgebung `Development` liefert `GET /openapi/v1.json` das OpenAPI-Dokument (ohne Anmeldung).

| Methode | Pfad | Zweck | Zugang |
|---|---|---|---|
| `GET` | `/api/coins` | Alle Coins auflisten | öffentlich |
| `GET` | `/api/coins/{id}` | Einen Coin abrufen | öffentlich |
| `GET` | `/api/coins/{id}/bild` | Motivbild abrufen | öffentlich |
| `POST` | `/api/coins` | Coin anlegen | `coins.write` |
| `PUT` | `/api/coins/{id}/bild` | Motivbild hochladen oder ersetzen | `coins.write` |
| `GET` | `/api/me` | Angemeldeten Benutzer abrufen | angemeldet |
| `GET` | `/api/benutzer` | Benutzer suchen und auflisten | `users.manage` |
| `PUT` | `/api/benutzer/{id}/rolle` | Rolle zuweisen oder entziehen | `users.manage` |
| `PUT` | `/api/benutzer/{id}/status` | Benutzer deaktivieren oder reaktivieren | `users.manage` |
| `GET` | `/api/audit` | Audit-Log der Rollen- und Statusänderungen | `audit.read` |

`{id}` ist eine GUID. Pfade mit einer `id`, die keine GUID ist, liefern `404`. Welche Rolle welche
Berechtigung hat, steht in [berechtigungen.md](berechtigungen.md).

## Authentifizierung und Autorisierung

Grundlage: [ADR-0012](adr/0012-anmeldung-keycloak-oidc.md), [ADR-0013](adr/0013-benutzer-und-rollen-in-eigener-datenbank.md),
[ADR-0014](adr/0014-coin-katalog-oeffentlich-lesbar.md), [ADR-0016](adr/0016-berechtigungen-im-code-und-deaktivierte-benutzer.md).

- Angemeldet wird per Access-Token des Keycloak im Header `Authorization: Bearer <token>`. Andere
  Wege (Query-Parameter `access_token`, Cookies) werden nicht ausgewertet.
- Geprüft werden: Signatur RS256 mit Schlüssel aus der JWKS der Authority, `iss` = `Oidc:Authority`
  (exakt), `aud` = `Oidc:Audience`, `exp`/`nbf` (Toleranz 30 s), Header-`typ` `JWT` oder `at+jwt`,
  `sub` vorhanden, `azp` = `Oidc:ClientId`.
- Standardmäßig verlangt jeder Endpunkt eine Anmeldung und einen **aktiven** Benutzer. Öffentlich
  sind nur die drei `GET`-Endpunkte des Katalogs (und `/openapi/v1.json` in Development). Ihre
  Antworten hängen nicht vom Token ab: Ein ungültiges oder abgelaufenes Token führt dort zu keinem
  `401`, das Token eines deaktivierten Benutzers zu keinem `403`.
- Endpunkte verlangen eine **Berechtigung** (`coins.write`, `users.manage`, `audit.read`), nie eine
  Rolle. `coins.read` ist definiert, wird aber nicht verlangt, solange der Katalog öffentlich ist.
- Rollen (`Administrator`, `Sachbearbeiter`, `Betrachter`) und den Status (aktiv/deaktiviert) führt
  C.O.I.N. in der eigenen Datenbank. Rollen-Claims im Token werden ignoriert. Neue Benutzer haben
  keine Rolle. Rollen vergeben Administratoren über `PUT /api/benutzer/{id}/rolle`; zusätzlich
  erhält ein Benutzer beim ersten Aufruf `Administrator`, wenn seine E-Mail in
  `Bootstrap:AdminEmails` steht (nur mit `email_verified=true`).
- Jeder Aufruf eines geschützten Endpunkts lädt den Benutzer aus der Datenbank, legt ihn bei Bedarf
  an bzw. übernimmt geänderte E-Mail und Namen aus dem Token. Rolle und Status werden dabei nie
  geändert. Rollen- und Statusänderungen wirken deshalb ab dem nächsten Request, ohne neues Token.
  Öffentliche Aufrufe gleichen nichts ab.

| Status | Wann | Body |
|---|---|---|
| `401 Unauthorized` | kein, ungültiges oder abgelaufenes Token auf einem geschützten Endpunkt | ProblemDetails, `title` „Nicht angemeldet“, `detail` „Für diese Aktion ist eine Anmeldung erforderlich.“; Header `WWW-Authenticate: Bearer` ohne Fehlerdetails |
| `403 Forbidden` | Benutzer deaktiviert (geht der Berechtigungsprüfung vor) | ProblemDetails, `title` „Kein Zugriff“, `detail` „Ihr Benutzerkonto ist deaktiviert.“, `code` `benutzer_deaktiviert` |
| `403 Forbidden` | Berechtigung fehlt | ProblemDetails, `title` „Kein Zugriff“, `code` `keine_berechtigung`, `detail` je Berechtigung (siehe unten) |

`detail` bei `keine_berechtigung`:

| Berechtigung | `detail` |
|---|---|
| `coins.write` | „Ihr Benutzerkonto ist nicht berechtigt, den Coin-Katalog zu ändern.“ |
| `users.manage` | „Ihr Benutzerkonto ist nicht berechtigt, Benutzer zu verwalten.“ |
| `audit.read` | „Ihr Benutzerkonto ist nicht berechtigt, das Audit-Log einzusehen.“ |

Clients werten `code` aus, nicht den Text.

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.4",
  "title": "Kein Zugriff",
  "status": 403,
  "detail": "Ihr Benutzerkonto ist deaktiviert.",
  "code": "benutzer_deaktiviert",
  "traceId": "00-..."
}
```

`401` und `403` werden vor jeder fachlichen Prüfung geliefert, also vor `400`, `404`, `409`, `413`
und `415`. Bei `401` und `403` wird nichts gespeichert und der Upload-Body nicht gelesen.

Pfade ohne Endpunkt liefern `404`, auch ohne Token.

Beispiel:

```powershell
curl.exe -H "Authorization: Bearer <access-token>" http://localhost:5172/api/me
```

### CORS

Zugelassen ist genau ein Origin aus `Frontend:Ursprung` (Development: `http://localhost:5173`),
Methoden `GET`, `POST`, `PUT`, Header `Authorization` und `Content-Type`, ohne
`Access-Control-Allow-Credentials`. Andere Origins erhalten keinen `Access-Control-Allow-Origin`.
Ist `Frontend:Ursprung` nicht gesetzt, sendet die API keine CORS-Header.

## GET /api/me

Liefert den angemeldeten Benutzer aus der eigenen Datenbank. Verlangt eine Anmeldung und einen
aktiven Benutzer, keine Berechtigung. Antwort-Header `Cache-Control: no-store`.

```json
{
  "id": "0199b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b",
  "name": "Test Administrator",
  "email": "admin@test.local",
  "rolle": "Administrator",
  "berechtigungen": ["audit.read", "coins.read", "coins.write", "users.manage"]
}
```

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | GUID | interne Benutzer-Id (nicht `sub` aus dem Token) |
| `name` | string | Anzeigename aus `name`, sonst `preferred_username`, sonst `email`, sonst „Unbekannt“; höchstens 200 Zeichen |
| `email` | string oder `null` | aus dem Claim `email`; `null`, wenn er fehlt oder länger als 320 Zeichen ist |
| `rolle` | string | `"Administrator"`, `"Sachbearbeiter"`, `"Betrachter"` oder `"keine"` |
| `berechtigungen` | string[] | Berechtigungen der Rolle laut [Rechtematrix](berechtigungen.md), ordinal sortiert; ohne Rolle `[]` |

Weitere Felder gibt es nicht. Das Frontend blendet Funktionen nur anhand von `berechtigungen` ein.

| Status | Wann | Body |
|---|---|---|
| `200 OK` | angemeldet und aktiv | Benutzer |
| `401 Unauthorized` | ohne gültiges Token | ProblemDetails „Nicht angemeldet“ |
| `403 Forbidden` | Benutzer deaktiviert | ProblemDetails „Kein Zugriff“, `code` `benutzer_deaktiviert` |

## Benutzerverwaltung

Grundlage: [ADR-0016](adr/0016-berechtigungen-im-code-und-deaktivierte-benutzer.md),
[ADR-0017](adr/0017-audit-log-fuer-rollen-und-status.md),
[ADR-0018](adr/0018-schutzregel-letzter-administrator-mit-sperre.md).

Antworten unter `/api/benutzer` und `/api/audit` tragen `Cache-Control: no-store`, weil sie
Personendaten enthalten. `issuer` und `subject` aus dem Token werden nie ausgegeben.

### Datenformat Benutzereintrag

```json
{
  "id": "0199b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b",
  "name": "Test Betrachter",
  "email": "betrachter@test.local",
  "rolle": "Betrachter",
  "aktiv": true,
  "erstelltAm": "2026-10-06T07:12:03.123456+00:00"
}
```

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | GUID | interne Benutzer-Id |
| `name` | string | Anzeigename |
| `email` | string oder `null` | E-Mail aus dem Token |
| `rolle` | string | `"Administrator"`, `"Sachbearbeiter"`, `"Betrachter"` oder `"keine"` |
| `aktiv` | bool | `false` = deaktiviert |
| `erstelltAm` | Zeitstempel (UTC) | erste Anmeldung in C.O.I.N. |

Benutzer entstehen nur bei ihrem ersten Aufruf mit Token. Anlegen oder Löschen per API gibt es nicht.

### Seiten

Listen werden seitenweise geliefert:

```json
{ "eintraege": [ ... ], "gesamt": 42, "seite": 1, "groesse": 25 }
```

| Query | Standard | Regel | Meldung bei Verstoß (`400`, Schlüssel = Parametername) |
|---|---|---|---|
| `seite` | 1 | ≥ 1 | „Die Seite muss mindestens 1 sein.“ |
| `groesse` | 25 | 1–100 | „Die Seitengröße muss zwischen 1 und 100 liegen.“ |

Ein Wert, der keine Zahl ist, liefert „Ungültiger Wert für dieses Feld.“ unter dem Parameternamen.
Eine Seite hinter dem Ende liefert `eintraege: []` mit korrektem `gesamt`.

### GET /api/benutzer

`GET /api/benutzer?suche=betrachter&seite=1&groesse=25`

- `suche` (optional, getrimmt, höchstens 100 Zeichen; leer = alle) findet Teilstrings in Anzeigename
  oder E-Mail ohne Beachtung der Groß-/Kleinschreibung. `%`, `_` und `\` gelten wörtlich.
- Sortierung: Anzeigename ohne Beachtung der Groß-/Kleinschreibung, dann `id`.

| Status | Wann | Body |
|---|---|---|
| `200 OK` | immer bei gültigen Parametern | Seite mit Benutzereinträgen |
| `400 Bad Request` | `seite`, `groesse` oder `suche` ungültig (`suche` länger als 100: „Der Suchbegriff darf höchstens 100 Zeichen lang sein.“) | ValidationProblemDetails |
| `401` / `403` | wie oben (`users.manage`) | ProblemDetails |

### PUT /api/benutzer/{id}/rolle

Weist eine Rolle zu oder entzieht sie. `Content-Type: application/json`.

```json
{ "rolle": "Betrachter" }
```

`rolle` ist genau `"Administrator"`, `"Sachbearbeiter"`, `"Betrachter"` oder `"keine"` (Groß-/Kleinschreibung zählt).
`"keine"` entzieht die Rolle.

```powershell
Invoke-RestMethod -Method Put -Uri http://localhost:5172/api/benutzer/<id>/rolle `
  -Headers @{ Authorization = "Bearer <access-token>" } -ContentType application/json -Body '{"rolle":"Betrachter"}'
```

### PUT /api/benutzer/{id}/status

Deaktiviert (`false`) oder reaktiviert (`true`) einen Benutzer. `Content-Type: application/json`.
Ein Deaktivieren entzieht keine Rolle; nach dem Reaktivieren gilt die bisherige Rolle wieder.

```json
{ "aktiv": false }
```

### Antworten beider PUT-Endpunkte

| Status | Wann | Body |
|---|---|---|
| `200 OK` | geändert, oder der Wert war schon gesetzt (dann ohne Schreiben und ohne Audit-Eintrag) | Benutzereintrag |
| `400 Bad Request` | `rolle` fehlt oder unbekannt: `errors.rolle` „Bitte eine gültige Rolle wählen.“; `aktiv` fehlt oder `null`: `errors.aktiv` „Bitte angeben, ob der Benutzer aktiv ist.“; falscher JSON-Typ: „Ungültiger Wert für dieses Feld.“; kein gültiges JSON: `errors.anfrage` | ValidationProblemDetails |
| `401` / `403` | wie oben (`users.manage`); `403 keine_berechtigung` auch, wenn der Akteur sein Recht zwischen Prüfung und Ausführung verloren hat, dann auch bei unbekannter Id und bei unverändertem Wert (ohne Zieldaten im Body) | ProblemDetails |
| `404 Not Found` | Benutzer unbekannt (nur für berechtigte Akteure) | ProblemDetails, `title` „Benutzer nicht gefunden“ |
| `409 Conflict` | eigenes Konto: Rolle Administrator entziehen oder sich selbst deaktivieren | ProblemDetails, `title` „Änderung nicht möglich“, `code` `eigenes_konto`, `detail` „Sie können sich nicht selbst die Administratorrolle entziehen oder Ihr eigenes Konto deaktivieren.“ |
| `409 Conflict` | letzter aktiver Administrator würde herabgestuft oder deaktiviert | ProblemDetails, `title` „Änderung nicht möglich“, `code` `letzter_administrator`, `detail` „Der letzte aktive Administrator kann weder herabgestuft noch deaktiviert werden.“ |
| `415 Unsupported Media Type` | Content-Type nicht `application/json` | ProblemDetails |

Prüfreihenfolge nach `401`/`403`/`415`/`400`: Akteur nicht (mehr) berechtigt (`403`) → Benutzer
unbekannt (`404`) → Wert unverändert (`200`) → eigenes Konto (`409`) → letzter Administrator (`409`).
Ein Akteur ohne `users.manage` erhält also immer `403`, nie `404`, und erfährt nicht, ob eine Id
existiert. Alle Änderungen laufen nacheinander unter einer Datenbanksperre; Akteur, Ziel und die Zahl
aktiver Administratoren werden erst darin gelesen. `letzter_administrator` ist über die API praktisch nicht
erreichbar, weil der Akteur selbst aktiver Administrator sein muss und die Selbstprüfung vorher
greift; die Regel sichert in der Tiefe ab (ADR-0018).

Jede wirksame Änderung schreibt in derselben Transaktion genau einen Audit-Eintrag. Bei Fehlern wird
nichts gespeichert.

### GET /api/audit

`GET /api/audit?benutzerId=<guid>&seite=1&groesse=25` (alle Parameter optional)

Liefert das Audit-Log der Rollen- und Statusänderungen, neueste zuerst (`zeitpunkt` absteigend, dann
`id` absteigend). `benutzerId` filtert auf den geänderten Benutzer; eine unbekannte Id liefert eine
leere Liste, eine ungültige GUID `400` (`errors.benutzerId`). Paging wie oben.

```json
{
  "eintraege": [
    {
      "id": "0199b3c5-0a1b-7c2d-8e3f-4a5b6c7d8e9f",
      "zeitpunkt": "2026-10-06T08:30:12.345678+00:00",
      "akteur": { "id": "0199b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b", "name": "Test Administrator" },
      "benutzer": { "id": "0199b3c4-9f00-7a1b-8c2d-3e4f5a6b7c8d", "name": "Test Betrachter" },
      "art": "Rolle",
      "alt": "keine",
      "neu": "Betrachter"
    }
  ],
  "gesamt": 1,
  "seite": 1,
  "groesse": 25
}
```

| Feld | Bedeutung |
|---|---|
| `zeitpunkt` | UTC, Genauigkeit Mikrosekunden |
| `akteur` | wer geändert hat (`id`, `name`); `null` = System (Bootstrap-Administrator beim ersten Aufruf) |
| `benutzer` | wessen Konto geändert wurde (`id`, `name`) |
| `art` | `"Rolle"` oder `"Status"` |
| `alt`, `neu` | bei `Rolle`: `"Administrator"`, `"Sachbearbeiter"`, `"Betrachter"`, `"keine"`; bei `Status`: `"aktiv"`, `"deaktiviert"` |

Namen kommen beim Lesen aus der Benutzertabelle (aktueller Anzeigename), E-Mails enthält das
Audit-Log nicht. Einträge sind unveränderlich; es gibt keinen Endpunkt zum Ändern oder Löschen.

| Status | Wann | Body |
|---|---|---|
| `200 OK` | gültige Parameter | Seite mit Audit-Einträgen |
| `400 Bad Request` | `benutzerId`, `seite` oder `groesse` ungültig | ValidationProblemDetails |
| `401` / `403` | wie oben (`audit.read`) | ProblemDetails |

## Datenformat Coin

```json
{
  "id": "0199b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b",
  "name": "Einsatzkontingent Beispiel 2025",
  "herausgeber": "Beispielbataillon 1",
  "auflage": 500,
  "beschreibung": "Optionaler Text",
  "erstelltAm": "2026-10-05T09:15:00.123456+00:00",
  "bildUrl": "/api/coins/0199b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b/bild?v=3f2a9c0d1e4b5a68"
}
```

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | GUID | serverseitig erzeugt |
| `name` | string | 1–200 Zeichen |
| `herausgeber` | string | 1–200 Zeichen |
| `auflage` | int oder `null` | `null` = unbekannt, sonst 1–1.000.000 |
| `beschreibung` | string oder `null` | max. 2000 Zeichen |
| `erstelltAm` | Zeitstempel (UTC) | serverseitig gesetzt, Genauigkeit Mikrosekunden |
| `bildUrl` | string oder `null` | `null` ohne Bild, sonst `/api/coins/{id}/bild?v={erste 16 Hex-Zeichen des SHA-256 des Bildes}` |

Der Parameter `v` ändert sich, wenn sich der Bildinhalt ändert, und dient nur dem Cache-Busting;
der Server wertet ihn nicht aus. Antworten enthalten nie Bilddaten.

Die Coin-Antwort enthält genau diese sieben Felder und keine Personendaten (z. B. keinen Ersteller),
weil sie öffentlich abrufbar ist.

## Fehlerformat

Fehler werden als ProblemDetails (RFC 9457, `application/problem+json`) geliefert, mit `type`,
`title`, `status`, ggf. `detail` und `traceId`. Interne Details (Ausnahmemeldungen, Stacktraces)
werden nie ausgegeben.

Eingabefehler (`400`) sind ValidationProblemDetails mit dem Titel „Eingaben ungültig“ und einem
Objekt `errors` (Schlüssel → Liste deutscher Meldungen). Mehrere ungültige Felder werden gemeinsam gemeldet.

| Schlüssel | Wann |
|---|---|
| `name`, `herausgeber`, `auflage`, `beschreibung` | Feldregel verletzt, oder der JSON-Wert dieses Felds ist nicht lesbar (z. B. falscher Typ) |
| `anfrage` | Body ist kein gültiges JSON und der Fehler lässt sich keinem Feld zuordnen (Meldung „Die Anfrage enthält kein gültiges JSON.“) |
| `datei` | Bild-Upload: Formular fehlerhaft, keine/mehrere Dateien, leere Datei |
| `rolle`, `aktiv` | Benutzerverwaltung: Body-Feld fehlt oder ungültig |
| `suche`, `seite`, `groesse`, `benutzerId` | Benutzerliste und Audit-Log: Query-Parameter ungültig |

ProblemDetails mit fachlichem Fehlergrund (`403`, `409` der Benutzerverwaltung) tragen zusätzlich
die Erweiterung `code` (z. B. `keine_berechtigung`, `letzter_administrator`).

Beispiel:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "Eingaben ungültig",
  "status": 400,
  "errors": {
    "name": ["Name ist erforderlich."],
    "auflage": ["Auflage muss zwischen 1 und 1000000 liegen."]
  },
  "traceId": "00-..."
}
```

Meldungen der Feldregeln:

| Schlüssel | Meldung |
|---|---|
| `name` | „Name ist erforderlich.“ / „Name darf höchstens 200 Zeichen lang sein.“ |
| `herausgeber` | „Herausgeber ist erforderlich.“ / „Herausgeber darf höchstens 200 Zeichen lang sein.“ |
| `auflage` | „Auflage muss zwischen 1 und 1000000 liegen.“ |
| `beschreibung` | „Beschreibung darf höchstens 2000 Zeichen lang sein.“ |
| Feld mit nicht lesbarem Wert (z. B. `"auflage": "viel"` oder `1.5`) | „Ungültiger Wert für dieses Feld.“ |

## POST /api/coins

Legt einen Coin an. Verlangt `coins.write` (Rollen Administrator und Sachbearbeiter). `Content-Type: application/json`.

```json
{
  "name": "Einsatzkontingent Beispiel 2025",
  "herausgeber": "Beispielbataillon 1",
  "auflage": null,
  "beschreibung": "Optionaler Text"
}
```

Regeln:
- `name` und `herausgeber` sind Pflicht; `auflage` und `beschreibung` optional (fehlend oder `null`).
- Führende und nachgestellte Leerzeichen in `name`, `herausgeber` und `beschreibung` werden entfernt;
  eine leere oder nur aus Leerzeichen bestehende `beschreibung` wird `null`.
- Ein Coin mit gleichem `name` und `herausgeber` (ohne Beachtung von Groß-/Kleinschreibung, nach dem
  Trimmen) ist ein Duplikat. Gleicher Name bei anderem Herausgeber ist erlaubt. Ein eindeutiger
  Datenbankindex sichert das auch bei gleichzeitigen Anfragen.
- Mitgesendete Felder `id`, `erstelltAm` und `bildUrl` werden ignoriert.

| Status | Wann | Body |
|---|---|---|
| `201 Created` | angelegt | Coin (`bildUrl: null`), Header `Location: /api/coins/{id}` |
| `400 Bad Request` | Regel verletzt, ungültiges JSON, falscher Typ | ValidationProblemDetails |
| `401 Unauthorized` | ohne gültiges Token | ProblemDetails „Nicht angemeldet“ |
| `403 Forbidden` | ohne `coins.write` (`keine_berechtigung`) oder deaktiviert (`benutzer_deaktiviert`) | ProblemDetails „Kein Zugriff“ mit `code` |
| `409 Conflict` | Duplikat | ProblemDetails, `title` „Coin existiert bereits“, `detail` „Ein Coin mit diesem Namen und Herausgeber existiert bereits.“ |
| `415 Unsupported Media Type` | Content-Type nicht `application/json` | ProblemDetails |

Bei `400`, `401`, `403`, `409` und `415` wird nichts gespeichert.

## GET /api/coins

Öffentlich. Liefert `200` mit einem Array aller Coins, sortiert nach `name` aufsteigend ohne
Beachtung von Groß-/Kleinschreibung. Ohne Coins: `[]`. Keine Paginierung.

## GET /api/coins/{id}

Öffentlich.

| Status | Wann | Body |
|---|---|---|
| `200 OK` | gefunden | Coin |
| `404 Not Found` | unbekannte ID | ProblemDetails, `title` „Coin nicht gefunden“ |

## PUT /api/coins/{id}/bild

Lädt das Motivbild hoch oder ersetzt ein vorhandenes. Verlangt `coins.write`.
`Content-Type: multipart/form-data` mit genau
einer Datei im Feld `datei`. Andere Formularfelder werden ignoriert. Dateiname und deklarierter
Content-Type der Datei werden weder ausgewertet noch gespeichert.

```powershell
curl.exe -X PUT -H "Authorization: Bearer <access-token>" -F "datei=@motiv.png" http://localhost:5172/api/coins/<id>/bild
```

Bildregeln:
- Zulässig sind JPEG, PNG und WebP. Das Format wird an den ersten Bytes des Inhalts erkannt
  (Magic Bytes): JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF` + `WEBP` (Bytes 8–11).
  Alles andere (u. a. SVG, GIF, BMP, HEIC, Text) wird abgelehnt.
- Die Datei darf höchstens 5 MiB (5.242.880 Bytes, inklusive) groß und nicht leer sein.
- Der Server decodiert das Bild nicht und verändert es nicht; Metadaten (z. B. EXIF) bleiben erhalten.

| Status | Wann | Body |
|---|---|---|
| `200 OK` | gespeichert oder ersetzt | Coin mit gesetzter `bildUrl` |
| `400 Bad Request` | Feld `datei` fehlt, mehr als eine Datei, leere Datei, mehr als 16 Formularabschnitte, Formular abgeschnitten oder fehlerhaft (z. B. ohne Boundary) | ValidationProblemDetails, Schlüssel `datei` |
| `401 Unauthorized` | ohne gültiges Token | ProblemDetails „Nicht angemeldet“ |
| `403 Forbidden` | ohne `coins.write` oder deaktiviert | ProblemDetails „Kein Zugriff“ mit `code` |
| `404 Not Found` | Coin unbekannt | ProblemDetails, `title` „Coin nicht gefunden“ |
| `413 Payload Too Large` | Datei größer als 5 MiB oder gelesener Request größer als 6 MiB (auch per `Content-Length` angekündigt oder bei chunked Upload) | ProblemDetails, `title` „Bild zu groß“, `detail` „Das Bild darf höchstens 5 MB groß sein.“ |
| `415 Unsupported Media Type` | Request nicht `multipart/form-data` | ProblemDetails |
| `415 Unsupported Media Type` | Inhalt kein JPEG, PNG oder WebP | ProblemDetails, `title` „Bildformat nicht unterstützt“, `detail` „Nur JPEG, PNG oder WebP erlaubt.“ |

Bei jedem Fehler wird nichts gespeichert; ein vorhandenes Bild bleibt unverändert.

Grenzen der Request-Größe: Der Server liest höchstens 6 MiB des Request-Bodys und antwortet bei
Überschreitung mit `413`. Den ungelesenen Rest verwirft er nach der Antwort bis zur harten Grenze
von 32 MiB. Bei Requests über 32 MiB kann der Client statt der `413`-Antwort einen
Verbindungsabbruch sehen. Hintergrund: [ADR-0006](adr/0006-bild-upload-als-eigener-endpunkt.md).

## GET /api/coins/{id}/bild

Öffentlich. Liefert die unveränderten Bytes des Motivbilds mit dem erkannten Content-Type
(`image/jpeg`, `image/png` oder `image/webp`). Der Query-Parameter `v` wird ignoriert. Das Frontend
lädt das Bild per `<img src>` ohne Token.

Antwort-Header bei `200`:

| Header | Wert |
|---|---|
| `Content-Type` | erkannter Typ |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Security-Policy` | `default-src 'none'; sandbox` |
| `Content-Disposition` | `inline; filename="coin-{id}.{jpg\|png\|webp}"` |
| `Cache-Control` | `private, max-age=31536000, immutable` |
| `ETag` | `"{SHA-256 des Inhalts, 64 Hex-Zeichen}"` (starker ETag) |

| Status | Wann | Body |
|---|---|---|
| `200 OK` | Bild vorhanden | Bilddaten |
| `304 Not Modified` | `If-None-Match` passt zum aktuellen ETag | leer |
| `404 Not Found` | Coin unbekannt oder ohne Bild | ProblemDetails, `title` „Bild nicht gefunden“ |

## Allgemein

Unerwartete Serverfehler liefern `500` als ProblemDetails ohne interne Details.

## Protokollierung

Jeder Request erzeugt genau einen Log-Eintrag ohne Personendaten
([ADR-0019](adr/0019-request-protokoll-ohne-personendaten.md)), Kategorie
`Coin.Api.Http.AnfrageProtokoll`, Level `Information`, EventId `4601` (`AnfrageBeendet`):

```text
HTTP PUT /api/benutzer/{id}/rolle antwortete 200 in 12 ms
```

| Feld | Inhalt |
|---|---|
| `Methode` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, sonst `ANDERE` |
| `Route` | Routen-Template mit führendem `/`, Parameter nur als Platzhalter (ohne Constraints und Defaults), nie Query oder Parameterwerte; ohne Endpunkt (`404`, `405`, Fehler vor dem Routing) `(keine Route)` |
| `Status` | gesendeter Status; bei Ausnahme nach Antwortbeginn der begonnene Status, bei Client-Abbruch vor Antwortbeginn `499`, sonst `500` |
| `DauerMs` | Dauer bis Ende der Antwort, ganze Millisekunden |

Erfasst werden alle Endpunkte, auch die öffentlichen. Zur Korrelation tragen Einträge `TraceId` und
`SpanId`. Query-String, roher Pfad, Header, Body, Tokens, Benutzer-Id, Namen, E-Mails und
IP-Adressen werden nie protokolliert.
