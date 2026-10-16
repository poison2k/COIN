# API

Basis-URL lokal: `http://localhost:5172` (siehe [README](../README.md)). JSON in camelCase.
In der Umgebung `Development` liefert `GET /openapi/v1.json` das OpenAPI-Dokument (ohne Anmeldung).

| Methode | Pfad | Zweck | Zugang |
|---|---|---|---|
| `GET` | `/api/coins` | Coins suchen und seitenweise auflisten | öffentlich |
| `GET` | `/api/coins/{id}` | Einen Coin abrufen | öffentlich |
| `GET` | `/api/coins/{id}/bild` | Motivbild abrufen | öffentlich |
| `POST` | `/api/coins` | Coin anlegen | `coins.write` |
| `PUT` | `/api/coins/{id}` | Stammdaten bearbeiten („Coin bearbeiten“) | `coins.write` |
| `PUT` | `/api/coins/{id}/bild` | Motivbild hochladen oder ersetzen | `coins.write` |
| `PUT` | `/api/coins/{id}/auflage` | Auflage ändern (Exemplare erzeugen oder löschen) | `coins.write` |
| `GET` | `/api/zertifikatsvorlagen/standard` | Standardvorlage (DOCX) herunterladen | `coins.write` |
| `GET` | `/api/coins/{id}/zertifikatsvorlage` | Vorlagenstatus mit allen Versionen | `coins.write` |
| `GET` | `/api/coins/{id}/zertifikatsvorlage/datei` | aktive Vorlage herunterladen (ohne eigene: Standardvorlage) | `coins.write` |
| `GET` | `/api/coins/{id}/zertifikatsvorlage/versionen/{version}/datei` | bestimmte Version herunterladen | `coins.write` |
| `POST` | `/api/coins/{id}/zertifikatsvorlage/versionen` | eigene Vorlage hochladen (neue aktive Version) | `coins.write` |
| `POST` | `/api/coins/{id}/zertifikatsvorlage/zuruecksetzen` | auf die Standardvorlage zurücksetzen | `coins.write` |
| `GET` | `/api/coins/{id}/exemplare` | Kennzahlen und Exemplare mit Status | `coins.read` |
| `GET` | `/api/coins/{id}/ausgaben` | Ausgabehistorie mit Empfängerdaten | `issues.read` |
| `POST` | `/api/coins/{id}/ausgaben` | Ausgabe erfassen | `issues.write` |
| `POST` | `/api/coins/{id}/ausgaben/{ausgabeId}/storno` | Ausgabe stornieren | `issues.write` |
| `GET` | `/api/me` | Angemeldeten Benutzer abrufen | angemeldet |
| `GET` | `/api/benutzer` | Benutzer suchen und auflisten | `users.manage` |
| `PUT` | `/api/benutzer/{id}/rolle` | Rolle zuweisen oder entziehen | `users.manage` |
| `PUT` | `/api/benutzer/{id}/status` | Benutzer deaktivieren oder reaktivieren | `users.manage` |
| `GET` | `/api/audit` | Audit-Log der Rollen- und Statusänderungen | `audit.read` |

`{id}` und `{ausgabeId}` sind GUIDs, `{version}` ist eine ganze Zahl. Pfade mit einer Id, die keine GUID
(bzw. keine Zahl) ist, liefern `404`. Welche Rolle welche
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
- Endpunkte verlangen eine **Berechtigung** (`coins.read`, `coins.write`, `issues.read`,
  `issues.write`, `users.manage`, `audit.read`), nie eine Rolle. `coins.read` wird nur für
  `GET /api/coins/{id}/exemplare` verlangt; die drei Katalog-GETs bleiben öffentlich (ADR-0021).
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
| `coins.read` | „Ihr Benutzerkonto ist nicht berechtigt, die Exemplare einzusehen.“ |
| `coins.write` | „Ihr Benutzerkonto ist nicht berechtigt, den Coin-Katalog zu ändern.“ |
| `issues.read` | „Ihr Benutzerkonto ist nicht berechtigt, Ausgaben einzusehen.“ |
| `issues.write` | „Ihr Benutzerkonto ist nicht berechtigt, Ausgaben zu erfassen oder zu stornieren.“ |
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
`Access-Control-Allow-Credentials`. Freigegeben ist der Antwort-Header `Content-Disposition`
(`Access-Control-Expose-Headers`), damit das Frontend den Dateinamen der Vorlagen-Downloads lesen kann.
Andere Origins erhalten keinen `Access-Control-Allow-Origin`.
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
  "berechtigungen": ["audit.read", "coins.read", "coins.write", "issues.read", "issues.write", "users.manage"]
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

Listen (`/api/benutzer`, `/api/audit`, `/api/coins`, `…/exemplare` und `…/ausgaben`) werden
seitenweise geliefert (`…/exemplare` zusätzlich mit `kennzahlen`):

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
| `name`, `herausgeber`, `auflage`, `beschreibung` | Coin anlegen oder bearbeiten: Feldregel verletzt, oder der JSON-Wert dieses Felds ist nicht lesbar (z. B. falscher Typ) |
| `anfrage` | alle Endpunkte mit JSON-Body: Body ist syntaktisch kein gültiges JSON (z. B. abgeschnitten) oder der Fehler lässt sich keinem Feld zuordnen. Dann gibt es nur diesen Schlüssel, Meldung „Die Anfrage enthält kein gültiges JSON.“ |
| `datei` | Bild- und Vorlagen-Upload: Formular fehlerhaft, keine/mehrere Dateien, leere Datei; beim Vorlagen-Upload zusätzlich alle Befunde der Inhaltsprüfung (siehe [Meldungen der Vorlagenprüfung](#meldungen-der-vorlagenprüfung)) |
| `rolle`, `aktiv` | Benutzerverwaltung: Body-Feld fehlt oder ungültig |
| `suche`, `seite`, `groesse` | Coin-Liste, Benutzerliste, Audit-Log (ohne `suche`), Exemplare und Ausgaben (ohne `suche`): Query-Parameter ungültig |
| `status` | Exemplare und Ausgaben: unbekannter Filterwert |
| `benutzerId` | Audit-Log: Query-Parameter ungültig |
| `exemplarNummer`, `empfaengerName`, `empfaengerDienstgrad`, `empfaengerDienststelle`, `datum`, `gelegenheit`, `begruendung`, `ausgebendeStelle` | Ausgabe erfassen |
| `grund` | Storno |

ProblemDetails mit fachlichem Fehlergrund (`403`, `409`) tragen zusätzlich die Erweiterung `code`
(z. B. `keine_berechtigung`, `letzter_administrator`, `exemplar_ausgegeben`, `coin_existiert`). Ausnahme:
`409` von `POST /api/coins` (Duplikat) trägt keinen `code`.

### Titel

Fachliche Titel (z. B. „Coin nicht gefunden“, „Ausgabe nicht möglich“, „Kein Zugriff“) setzt der
jeweilige Endpunkt. Fehlt ein fachlicher Titel oder ist es ein englischer Standardtitel von ASP.NET
Core (z. B. bei unbekannten Routen, falscher Methode, `415` oder unbehandelten Ausnahmen), ersetzt
`ProblemTitel.Setzen` (`src/Coin.Api/Http/ProblemTitel.cs`) ihn durch einen deutschen Titel:

| Status | Titel |
|---|---|
| `400` | „Ungültige Anfrage“ |
| `401` | „Nicht angemeldet“ |
| `403` | „Zugriff verweigert“ |
| `404` | „Nicht gefunden“ |
| `405` | „Methode nicht erlaubt“ |
| `406` | „Nicht akzeptables Antwortformat“ |
| `408` | „Zeitüberschreitung der Anfrage“ |
| `409` | „Konflikt“ |
| `410` | „Nicht mehr vorhanden“ |
| `411` | „Längenangabe erforderlich“ |
| `412` | „Vorbedingung nicht erfüllt“ |
| `413` | „Anfrage zu groß“ |
| `414` | „Adresse zu lang“ |
| `415` | „Nicht unterstützter Inhaltstyp“ |
| `422` | „Anfrage nicht verarbeitbar“ |
| `426` | „Protokollwechsel erforderlich“ |
| `428` | „Vorbedingung erforderlich“ |
| `429` | „Zu viele Anfragen“ |
| `431` | „Kopfzeilen zu groß“ |
| `500` | „Ein unerwarteter Fehler ist aufgetreten.“ |
| `501` | „Nicht umgesetzt“ |
| `502` | „Fehlerhafte Antwort eines vorgelagerten Dienstes“ |
| `503` | „Dienst nicht verfügbar“ |
| `504` | „Zeitüberschreitung eines vorgelagerten Dienstes“ |
| anderer 4xx | „Fehlerhafte Anfrage“ |
| anderer 5xx | „Ein unerwarteter Fehler ist aufgetreten.“ |

Eingabefehler der Endpunkte tragen immer „Eingaben ungültig“; „Ungültige Anfrage“ erscheint nur bei
einem `400` ohne fachlichen Titel. `403` trägt immer den fachlichen Titel „Kein Zugriff“.

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
- Mit `auflage: N` entstehen in derselben Transaktion die Exemplare 1 bis N (alle verfügbar), mit
  `auflage: null` keine. Bei großen Auflagen (bis 1.000.000) dauert das Anlegen spürbar länger.

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

`GET /api/coins?suche=bataillon&seite=1&groesse=25` (alle Parameter optional)

Öffentlich. Die Antwort hängt nicht vom Token ab (anonym, ungültiges Token und Token eines
deaktivierten Benutzers liefern dasselbe `200`); es gibt keinen Benutzerabgleich.

> **Breaking Change (katalog-seiten):** Bis dahin lieferte der Endpunkt ein Array aller Coins. Jetzt
> liefert er ein Seiten-Objekt; ein Array-Format gibt es nicht mehr.

- Format und Paging wie unter [Seiten](#seiten): `{ "eintraege": [Coin, …], "gesamt", "seite", "groesse" }`,
  Standard `seite=1`, `groesse=25`. Einträge im [Coin-Format](#datenformat-coin).
- `suche` (optional, getrimmt, höchstens 100 Zeichen; leer = alle) findet Teilstrings in `name`
  oder `herausgeber` ohne Beachtung der Groß-/Kleinschreibung. `%`, `_` und `\` gelten wörtlich,
  die Abfrage ist parametrisiert. Die Beschreibung wird nicht durchsucht.
- Sortierung: `name` ohne Beachtung der Groß-/Kleinschreibung, dann `id` (stabil über Seiten hinweg).
- Eine Seite hinter dem Ende liefert `eintraege: []` mit korrektem `gesamt`.
- Das Request-Protokoll enthält nur die Route `/api/coins`, nie `suche` oder die Query.

```json
{
  "eintraege": [
    {
      "id": "0199b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b",
      "name": "Einsatzkontingent Beispiel 2025",
      "herausgeber": "Beispielbataillon 1",
      "auflage": 500,
      "beschreibung": null,
      "erstelltAm": "2026-10-05T09:15:00.123456+00:00",
      "bildUrl": null
    }
  ],
  "gesamt": 1,
  "seite": 1,
  "groesse": 25
}
```

| Status | Wann | Body |
|---|---|---|
| `200 OK` | gültige Parameter | Seite mit Coins |
| `400 Bad Request` | `seite` < 1, `groesse` außerhalb 1–100, `suche` nach dem Trimmen länger als 100 Zeichen („Der Suchbegriff darf höchstens 100 Zeichen lang sein.“) oder ein Wert, der keine Zahl ist; übrige Meldungen wie unter [Seiten](#seiten). Regelverstöße mehrerer Parameter werden gemeinsam gemeldet. | ValidationProblemDetails, Schlüssel `suche`, `seite`, `groesse` |

Beispiel für `GET /api/coins?seite=0&groesse=101`:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "Eingaben ungültig",
  "status": 400,
  "errors": {
    "seite": ["Die Seite muss mindestens 1 sein."],
    "groesse": ["Die Seitengröße muss zwischen 1 und 100 liegen."]
  },
  "traceId": "00-..."
}
```

## GET /api/coins/{id}

Öffentlich.

| Status | Wann | Body |
|---|---|---|
| `200 OK` | gefunden | Coin |
| `404 Not Found` | unbekannte ID | ProblemDetails, `title` „Coin nicht gefunden“ |

## PUT /api/coins/{id}

Ersetzt die Stammdaten eines Coins (Seite „Coin bearbeiten“). Verlangt `coins.write`.
`Content-Type: application/json`, Antwort mit `Cache-Control: no-store`. Grundlage:
[ADR-0025](adr/0025-coin-stammdaten-bearbeiten.md).

```json
{
  "name": "Einsatzkontingent Beispiel 2025",
  "herausgeber": "Beispielbataillon 1",
  "auflage": 150,
  "beschreibung": null
}
```

- Feldregeln, Trimmen und Meldungen wie bei [POST /api/coins](#post-apicoins). Alle vier Felder werden
  ersetzt; ein fehlendes Feld gilt als `null`.
- `auflage: null` ist nur erlaubt, solange der Coin keine Auflage hat; sonst `400`, `errors.auflage`
  „Auflage ist erforderlich.“
- Eine geänderte Auflage folgt denselben Regeln wie [PUT /api/coins/{id}/auflage](#put-apicoinsidauflage):
  Erhöhung erzeugt Exemplare, Senkung löscht sie, höchstens bis zur höchsten **je** ausgegebenen Nummer.
- Gleicher Name und Herausgeber wie ein **anderer** Coin (ohne Groß-/Kleinschreibung, nach dem Trimmen)
  ergibt `409 coin_existiert`, auch bei gleichzeitigen Anfragen (eindeutiger Index, nie `500`).
- Unveränderte Werte: `200` ohne Schreiben. Mitgesendete Felder `id`, `erstelltAm` und `bildUrl` werden
  ignoriert.
- Alles läuft in einer Transaktion unter der Sperre der Coin-Zeile; bei einem Fehler wird nichts
  gespeichert. Gleichzeitige Bearbeitungen: Der letzte gewinnt, es gibt keine Versionsprüfung.
- Stammdatenänderungen schreiben keinen Audit-Eintrag.

| Status | Wann | Body |
|---|---|---|
| `200 OK` | geändert oder unverändert | Coin ([Coin-Format](#datenformat-coin)) |
| `400 Bad Request` | Feldregel verletzt, `auflage: null` bei gesetzter Auflage, falscher Typ, kein gültiges JSON (`errors.anfrage`) | ValidationProblemDetails |
| `401` / `403` | wie oben (`coins.write`) | ProblemDetails |
| `404 Not Found` | Coin unbekannt | ProblemDetails, `title` „Coin nicht gefunden“ |
| `409 Conflict` | Name und Herausgeber gehören zu einem anderen Coin | `title` „Coin existiert bereits“, `code` `coin_existiert`, `detail` „Ein Coin mit diesem Namen und Herausgeber existiert bereits.“ |
| `409 Conflict` | Senkung unter die höchste je ausgegebene Nummer {m} | `title` „Änderung nicht möglich“, `code` `auflage_zu_klein`, `detail` „Die Auflage kann nicht unter {m} gesenkt werden, weil Exemplar Nr. {m} ausgegeben wurde.“ |
| `415 Unsupported Media Type` | Content-Type nicht `application/json` | ProblemDetails |

Prüfreihenfolge: `401` → `403` → `415` → `400` (Feldregeln) → `404` → `400 auflage` (`null` bei
gesetzter Auflage) → `409 coin_existiert` → `409 auflage_zu_klein`.

```powershell
Invoke-RestMethod -Method Put -Uri http://localhost:5172/api/coins/<id> `
  -Headers @{ Authorization = "Bearer <access-token>" } -ContentType application/json `
  -Body '{"name":"Einsatzkontingent Beispiel 2025","herausgeber":"Beispielbataillon 1","auflage":150,"beschreibung":null}'
```

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

## Exemplare und Ausgaben

Grundlage: [ADR-0020](adr/0020-exemplare-und-ausgaben-datenmodell.md),
[ADR-0021](adr/0021-rechte-fuer-exemplare-und-ausgaben.md), Feature
[coin-ausgaben](features/coin-ausgaben.md).

- Ein **Exemplar** ist ein nummeriertes Stück eines Coins (Nr. 1 bis Auflage). Sein Status
  (`verfuegbar`/`ausgegeben`) wird aus der aktiven Ausgabe abgeleitet.
- Eine **Ausgabe** dokumentiert, welches Exemplar an wen, wann, wobei und wofür ausgegeben wurde.
  Sie wird nie geändert oder gelöscht, sondern höchstens einmal storniert. Danach ist das Exemplar
  wieder verfügbar; die stornierte Ausgabe bleibt in der Historie.
- Alle fünf Endpunkte tragen `Cache-Control: no-store`. `401`/`403` kommen vor allen fachlichen
  Prüfungen; ohne Berechtigung gibt es also auch für eine unbekannte Coin-Id `403`, nie `404`.
- Schreibende Endpunkte verlangen `Content-Type: application/json` (sonst `415`). Erfassen, Storno
  und Auflage ändern laufen je Coin nacheinander (Sperre der Coin-Zeile). Bei jedem Fehler wird
  nichts gespeichert.
- Personendaten (Empfänger, Gelegenheit, Begründung, ausgebende Stelle, Storno-Grund) gibt es nur
  über `GET …/ausgaben` und in den Antworten von `POST …/ausgaben` und `…/storno`. Fehlermeldungen
  nennen höchstens Exemplar-Nummern. `GET /api/coins` und `GET /api/coins/{id}` bleiben unverändert.
- Jedes Erfassen und jedes Storno schreibt in derselben Transaktion einen unveränderlichen
  Audit-Eintrag (Tabelle `ausgabe_audit`, ohne Empfängerdaten). Einen Lese-Endpunkt dafür gibt es nicht.

### GET /api/coins/{id}/exemplare

`GET /api/coins/{id}/exemplare?status=ausgegeben&seite=1&groesse=25` (alle Parameter optional).
Verlangt `coins.read` (Administrator, Sachbearbeiter, Betrachter).

- `status`: `verfuegbar` oder `ausgegeben`; fehlend = alle. Sortierung nach `nummer`.
- Paging wie unter [Seiten](#seiten). `gesamt` zählt die Exemplare im Filter, `kennzahlen` gelten
  immer für alle Exemplare des Coins.
- Coin ohne Auflage: `kennzahlen` `{ "auflage": null, "ausgegeben": 0, "verfuegbar": 0 }`, keine Einträge.
- Die Antwort enthält nur diese Felder, für jede Rolle gleich: keine Empfänger, keine Ausgabe-Ids, kein Datum.

```json
{
  "kennzahlen": { "auflage": 150, "ausgegeben": 3, "verfuegbar": 147 },
  "eintraege": [
    { "nummer": 1, "status": "ausgegeben" },
    { "nummer": 2, "status": "verfuegbar" }
  ],
  "gesamt": 150,
  "seite": 1,
  "groesse": 25
}
```

| Status | Wann | Body |
|---|---|---|
| `200 OK` | gültige Parameter | siehe oben |
| `400 Bad Request` | `status` unbekannt: `errors.status` „Bitte einen gültigen Status wählen.“; `seite`/`groesse` wie unter [Seiten](#seiten) | ValidationProblemDetails |
| `401` / `403` | wie oben (`coins.read`) | ProblemDetails |
| `404 Not Found` | Coin unbekannt | ProblemDetails, `title` „Coin nicht gefunden“ |

### GET /api/coins/{id}/ausgaben

`GET /api/coins/{id}/ausgaben?status=aktiv&seite=1&groesse=25` (alle Parameter optional).
Verlangt `issues.read` (Administrator, Sachbearbeiter). Betrachter erhalten `403`.

- `status`: `aktiv` oder `storniert`; fehlend = alle.
- Sortierung: neueste zuerst (`erfasstAm` absteigend, dann `id` absteigend). Paging wie unter [Seiten](#seiten).
- Einträge im [Ausgabe-Format](#datenformat-ausgabe).

| Status | Wann | Body |
|---|---|---|
| `200 OK` | gültige Parameter | Seite mit Ausgaben |
| `400 Bad Request` | `status` unbekannt („Bitte einen gültigen Status wählen.“), `seite`/`groesse` ungültig | ValidationProblemDetails |
| `401` / `403` | wie oben (`issues.read`) | ProblemDetails |
| `404 Not Found` | Coin unbekannt | ProblemDetails, `title` „Coin nicht gefunden“ |

### Datenformat Ausgabe

```json
{
  "id": "0199c1a2-3b4c-7d5e-8f60-718293a4b5c6",
  "exemplarNummer": 12,
  "empfaenger": { "name": "Max Beispiel", "dienstgrad": "Hauptmann", "dienststelle": "Beispielbataillon 1" },
  "datum": "2026-10-01",
  "gelegenheit": "Truppenbesuch",
  "begruendung": "Herausragende Leistung",
  "ausgebendeStelle": "Kommandeur Beispielbataillon 1",
  "erfasstAm": "2026-10-08T09:00:00.123456+00:00",
  "erfasstVon": { "id": "0199b3c4-9f00-7a1b-8c2d-3e4f5a6b7c8d", "name": "Test Sachbearbeiter" },
  "storno": null
}
```

| Feld | Bedeutung |
|---|---|
| `id` | GUID der Ausgabe (für das Storno) |
| `exemplarNummer` | Nummer des ausgegebenen Exemplars |
| `empfaenger` | `name` (Pflicht), `dienstgrad` und `dienststelle` (je `null`, wenn leer) |
| `datum` | Tag der Ausgabe, `JJJJ-MM-TT` ohne Uhrzeit |
| `gelegenheit`, `begruendung`, `ausgebendeStelle` | Freitext |
| `erfasstAm` | Serverzeit (UTC, Mikrosekunden) |
| `erfasstVon` | angemeldeter Benutzer beim Erfassen (`id`, aktueller Anzeigename) |
| `storno` | `null` oder `{ "am": "…", "von": { "id": "…", "name": "…" }, "grund": "…" }` |

### POST /api/coins/{id}/ausgaben

Erfasst eine Ausgabe. Verlangt `issues.write`. `Content-Type: application/json`.

```json
{
  "exemplarNummer": null,
  "empfaengerName": "Max Beispiel",
  "empfaengerDienstgrad": "Hauptmann",
  "empfaengerDienststelle": "Beispielbataillon 1",
  "datum": "2026-10-01",
  "gelegenheit": "Truppenbesuch",
  "begruendung": "Herausragende Leistung",
  "ausgebendeStelle": "Kommandeur Beispielbataillon 1"
}
```

- `exemplarNummer` fehlend oder `null`: die kleinste Nummer ohne aktive Ausgabe (auch eine nach
  einem Storno wieder frei gewordene).
- Texte werden getrimmt; leere optionale Texte werden `null`. Mitgesendete Felder `id`,
  `erfasstVon`, `erfasstAm` und `storno` werden ignoriert; Erfasser und Zeit setzt der Server.
- Ein Exemplar ist höchstens einmal aktiv ausgegeben. Das sichert ein eindeutiger Datenbankindex auch
  bei gleichzeitigen Anfragen; eine Verletzung ergibt `409 exemplar_ausgegeben`, nie `500`.

Feldregeln (`400`, Schlüssel = Feldname):

| Feld | Meldung |
|---|---|
| `empfaengerName` | „Name des Empfängers ist erforderlich.“ / „Name des Empfängers darf höchstens 200 Zeichen lang sein.“ |
| `empfaengerDienstgrad` | „Dienstgrad darf höchstens 100 Zeichen lang sein.“ |
| `empfaengerDienststelle` | „Dienststelle darf höchstens 200 Zeichen lang sein.“ |
| `datum` | „Datum ist erforderlich.“ / „Das Datum darf nicht in der Zukunft liegen.“ (heute nach Europe/Berlin) |
| `gelegenheit` | „Gelegenheit ist erforderlich.“ / „Gelegenheit darf höchstens 200 Zeichen lang sein.“ |
| `begruendung` | „Begründung ist erforderlich.“ / „Begründung darf höchstens 2000 Zeichen lang sein.“ |
| `ausgebendeStelle` | „Ausgebende Stelle ist erforderlich.“ / „Ausgebende Stelle darf höchstens 200 Zeichen lang sein.“ |
| `exemplarNummer` | „Exemplar-Nummer muss zwischen 1 und {Auflage} liegen.“ (erst nach Coin- und Auflageprüfung) |
| Feld mit nicht lesbarem Wert (z. B. `"datum": "gestern"`) | „Ungültiger Wert für dieses Feld.“ |

| Status | Wann | Body |
|---|---|---|
| `201 Created` | erfasst | Ausgabe (ohne `Location`, es gibt keinen Einzelabruf) |
| `400 Bad Request` | Feldregel verletzt, `exemplarNummer` außerhalb der Auflage, kein gültiges JSON (`errors.anfrage`) | ValidationProblemDetails |
| `401` / `403` | wie oben (`issues.write`) | ProblemDetails |
| `404 Not Found` | Coin unbekannt | ProblemDetails, `title` „Coin nicht gefunden“ |
| `409 Conflict` | Coin ohne Auflage | `title` „Ausgabe nicht möglich“, `code` `auflage_unbekannt`, `detail` „Für diesen Coin ist keine Auflage erfasst. Ausgaben sind erst nach dem Festlegen der Auflage möglich.“ |
| `409 Conflict` | gewähltes Exemplar ist aktiv ausgegeben | `title` „Ausgabe nicht möglich“, `code` `exemplar_ausgegeben`, `detail` „Exemplar Nr. {n} ist bereits ausgegeben.“ |
| `409 Conflict` | „nächstes freies“, aber alle ausgegeben | `title` „Ausgabe nicht möglich“, `code` `kein_exemplar_frei`, `detail` „Alle Exemplare dieses Coins sind ausgegeben.“ |
| `415 Unsupported Media Type` | Content-Type nicht `application/json` | ProblemDetails |

Prüfreihenfolge: `401` → `403` → `415` → `400` (Body) → `404` → `409 auflage_unbekannt` →
`400 exemplarNummer` → `409 exemplar_ausgegeben`/`kein_exemplar_frei`.

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:5172/api/coins/<id>/ausgaben `
  -Headers @{ Authorization = "Bearer <access-token>" } -ContentType application/json `
  -Body '{"empfaengerName":"Max Beispiel","datum":"2026-10-01","gelegenheit":"Truppenbesuch","begruendung":"Herausragende Leistung","ausgebendeStelle":"Kommandeur Beispielbataillon 1"}'
```

### POST /api/coins/{id}/ausgaben/{ausgabeId}/storno

Storniert eine aktive Ausgabe. Verlangt `issues.write`. `Content-Type: application/json`.

```json
{ "grund": "Falsches Exemplar erfasst" }
```

`grund` wird getrimmt und ist Pflicht (höchstens 500 Zeichen). Er steht auch im Audit; er soll keine
Personendaten enthalten.

| Status | Wann | Body |
|---|---|---|
| `200 OK` | storniert | Ausgabe mit gefülltem `storno` |
| `400 Bad Request` | `errors.grund`: „Bitte einen Grund für das Storno angeben.“ / „Der Grund darf höchstens 500 Zeichen lang sein.“; kein gültiges JSON: `errors.anfrage` | ValidationProblemDetails |
| `401` / `403` | wie oben (`issues.write`) | ProblemDetails |
| `404 Not Found` | Coin oder Ausgabe unbekannt, oder die Ausgabe gehört zu einem anderen Coin | ProblemDetails, `title` „Ausgabe nicht gefunden“ |
| `409 Conflict` | schon storniert | `title` „Storno nicht möglich“, `code` `bereits_storniert`, `detail` „Diese Ausgabe ist bereits storniert.“ |
| `415 Unsupported Media Type` | Content-Type nicht `application/json` | ProblemDetails |

Prüfreihenfolge nach `401`/`403`/`415`: `400` → `404` → `409`. Von zwei gleichzeitigen Stornos
derselben Ausgabe gelingt genau eines.

### PUT /api/coins/{id}/auflage

Ändert die Auflage. Verlangt `coins.write`. `Content-Type: application/json`.

```json
{ "auflage": 200 }
```

- Pflicht, 1–1.000.000. Zurück auf „unbekannt“ (`null`) geht nicht.
- Erhöhung erzeugt die Exemplare alt+1 bis N (bei bisher unbekannter Auflage 1 bis N).
- Senkung löscht die Exemplare N+1 bis alt. Sie ist nur bis zur höchsten Nummer möglich, die **je**
  ausgegeben wurde (aktiv oder storniert).
- Gleicher Wert: `200` ohne Änderung.

| Status | Wann | Body |
|---|---|---|
| `200 OK` | geändert oder unverändert | Coin ([Coin-Format](#datenformat-coin)) |
| `400 Bad Request` | `errors.auflage`: „Auflage ist erforderlich.“ / „Auflage muss zwischen 1 und 1000000 liegen.“ / „Ungültiger Wert für dieses Feld.“; kein gültiges JSON: `errors.anfrage` | ValidationProblemDetails |
| `401` / `403` | wie oben (`coins.write`) | ProblemDetails |
| `404 Not Found` | Coin unbekannt | ProblemDetails, `title` „Coin nicht gefunden“ |
| `409 Conflict` | Senkung unter die höchste je ausgegebene Nummer {m} | `title` „Änderung nicht möglich“, `code` `auflage_zu_klein`, `detail` „Die Auflage kann nicht unter {m} gesenkt werden, weil Exemplar Nr. {m} ausgegeben wurde.“ |
| `415 Unsupported Media Type` | Content-Type nicht `application/json` | ProblemDetails |

## Zertifikatsvorlagen

Grundlage: [ADR-0022](adr/0022-openxml-sdk-fuer-word-vorlagen.md),
[ADR-0023](adr/0023-zertifikatsvorlagen-in-postgresql-mit-versionen.md),
[ADR-0024](adr/0024-pruefung-hochgeladener-word-dateien.md),
[ADR-0026](adr/0026-namespace-positivliste-fuer-word-dateien.md), Feature
[zertifikatsvorlagen](features/zertifikatsvorlagen.md). Platzhalter: [platzhalter.md](platzhalter.md),
erlaubte Namespaces: [word-namespaces.md](word-namespaces.md).

- Je Coin gibt es eine Word-Vorlage (.docx) für das spätere Echtheitszertifikat. Ohne eigene Vorlage gilt
  die **Standardvorlage**: vom Server erzeugt, für alle Coins gleich, nie gespeichert.
- Hochgeladene Vorlagen werden geprüft, **bereinigt** und als neue Version (1, 2, …) gespeichert; die
  neue Version ist sofort aktiv. Frühere Versionen bleiben unverändert abrufbar, lassen sich aber nicht
  wieder aktivieren und nicht löschen. Versionen werden unbegrenzt aufbewahrt.
- Alle sechs Endpunkte verlangen `coins.write` (Administrator, Sachbearbeiter). `401`/`403` kommen vor
  allen anderen Prüfungen; der Upload-Body wird dann nicht gelesen.
- Alle Antworten der Endpunkte selbst (auch `400`, `404`, `413`) tragen `Cache-Control: no-store`.
- Jeder erfolgreiche Upload und jedes wirksame Zurücksetzen schreibt in derselben Transaktion einen
  unveränderlichen Eintrag in `vorlage_audit` (Art `Hochgeladen`, `Ersetzt` oder `Zurueckgesetzt`, ohne
  Dateiinhalt und Dateinamen). Einen Lese-Endpunkt dafür gibt es nicht.

### Datenformat Vorlagenstatus

```json
{
  "quelle": "eigene",
  "aktiveVersion": 2,
  "versionen": [
    {
      "version": 2,
      "groesseBytes": 48211,
      "hochgeladenAm": "2026-10-09T09:00:00.123456+00:00",
      "hochgeladenVon": { "id": "0199b3c4-9f00-7a1b-8c2d-3e4f5a6b7c8d", "name": "Test Sachbearbeiter" },
      "aktiv": true
    },
    {
      "version": 1,
      "groesseBytes": 47002,
      "hochgeladenAm": "2026-10-09T08:00:00.123456+00:00",
      "hochgeladenVon": { "id": "0199b3c4-9f00-7a1b-8c2d-3e4f5a6b7c8d", "name": "Test Sachbearbeiter" },
      "aktiv": false
    }
  ]
}
```

| Feld | Bedeutung |
|---|---|
| `quelle` | `"standard"` (keine eigene Vorlage aktiv) oder `"eigene"` |
| `aktiveVersion` | Nummer der aktiven Version, `null` bei Standardvorlage |
| `versionen` | alle Versionen, neueste zuerst; ohne Upload `[]` |
| `groesseBytes` | Größe der gespeicherten, bereinigten Fassung |
| `hochgeladenAm` | Serverzeit (UTC, Mikrosekunden) |
| `hochgeladenVon` | `id` und aktueller Anzeigename des Hochladenden |
| `aktiv` | `true` genau bei der Version, die `aktiveVersion` entspricht |

### Downloads

| Endpunkt | Inhalt | Dateiname |
|---|---|---|
| `GET /api/zertifikatsvorlagen/standard` | Standardvorlage | `zertifikatsvorlage-standard.docx` |
| `GET /api/coins/{id}/zertifikatsvorlage/datei` | aktive Version, byte-gleich zur gespeicherten Fassung | `zertifikatsvorlage-{id}-v{version}.docx` |
| | ohne eigene aktive Vorlage: Standardvorlage | `zertifikatsvorlage-{id}-standard.docx` |
| `GET /api/coins/{id}/zertifikatsvorlage/versionen/{version}/datei` | diese Version, byte-gleich zur gespeicherten Fassung | `zertifikatsvorlage-{id}-v{version}.docx` |

Antwort-Header bei `200`:

| Header | Wert |
|---|---|
| `Content-Type` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `Content-Disposition` | `attachment; filename="…"` (Name aus der Tabelle oben, nur ASCII, ohne Benutzereingaben) |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Security-Policy` | `default-src 'none'; sandbox` |
| `Cache-Control` | `no-store` |

Die Standardvorlage (A4 hochkant, Überschrift „Echtheitszertifikat“, alle 13 Platzhalter, am Ende der
Abschnitt „Erläuterung der Platzhalter“) erzeugt der Server mit dem OpenXML SDK; im Repository liegt keine
DOCX-Datei. Sie besteht die eigene Upload-Prüfung ohne Befund.

| Status | Wann | Body |
|---|---|---|
| `200 OK` | Datei vorhanden | DOCX |
| `401` / `403` | wie oben (`coins.write`) | ProblemDetails |
| `404 Not Found` | Coin unbekannt (geht vor) | ProblemDetails, `title` „Coin nicht gefunden“ |
| `404 Not Found` | Version unbekannt oder kleiner als 1 | ProblemDetails, `title` „Vorlage nicht gefunden“ |

### GET /api/coins/{id}/zertifikatsvorlage

Liefert den [Vorlagenstatus](#datenformat-vorlagenstatus).

| Status | Wann | Body |
|---|---|---|
| `200 OK` | Coin vorhanden | Vorlagenstatus |
| `401` / `403` | wie oben (`coins.write`) | ProblemDetails |
| `404 Not Found` | Coin unbekannt | ProblemDetails, `title` „Coin nicht gefunden“ |

### POST /api/coins/{id}/zertifikatsvorlage/versionen

Lädt eine eigene Vorlage hoch. `Content-Type: multipart/form-data` mit genau einer Datei im Feld `datei`
(Formularregeln wie beim [Motivbild](#put-apicoinsidbild): höchstens 16 Formularabschnitte, andere Felder
werden ignoriert, Request höchstens 6 MiB gelesen). Dateiname und deklarierter Content-Type der Datei
werden weder ausgewertet noch gespeichert noch geloggt.

```powershell
curl.exe -X POST -H "Authorization: Bearer <access-token>" -F "datei=@urkunde.docx" http://localhost:5172/api/coins/<id>/zertifikatsvorlage/versionen
```

Bei Erfolg `201 Created` mit dem neuen Vorlagenstatus, ohne `Location` (eine Version hat keinen eigenen
Lese-Endpunkt außer dem Download). Neue Version = bisher höchste Version + 1, auch nach einem
Zurücksetzen. Zwei gleichzeitige Uploads für denselben Coin erhalten verschiedene Nummern; aktiv ist die
höhere.

| Status | Wann | Body |
|---|---|---|
| `201 Created` | geprüft, bereinigt, gespeichert | Vorlagenstatus |
| `400 Bad Request` | Formular fehlerhaft oder Datei leer bzw. abgelehnt (Meldungen unten) | ValidationProblemDetails, Schlüssel `datei` |
| `401` / `403` | wie oben (`coins.write`) | ProblemDetails |
| `404 Not Found` | Coin unbekannt | ProblemDetails, `title` „Coin nicht gefunden“ |
| `413 Payload Too Large` | Datei größer als 5 MiB (5.242.880 Bytes; genau so viel ist erlaubt) oder Request größer als 6 MiB (auch per `Content-Length` angekündigt) | ProblemDetails, `title` „Vorlage zu groß“, `detail` „Die Vorlage darf höchstens 5 MB groß sein.“ |
| `415 Unsupported Media Type` | Request nicht `multipart/form-data` | ProblemDetails |

Prüfreihenfolge: `401` → `403` → `415` → Formular (`413`, `400 datei`) → `400 datei` „Die Datei ist
leer.“ → `404` → Inhaltsprüfung (`400 datei`) → Bereinigung und Nachprüfung (`400 datei`) → Speichern.
Bei jedem Fehler wird nichts gespeichert, die aktive Vorlage bleibt unverändert, es entsteht kein
Audit-Eintrag. Grenzen der Request-Größe wie beim Motivbild (ungelesener Rest bis 32 MiB wird verworfen).

Je API-Prozess laufen höchstens 2 Prüfungen gleichzeitig; weitere Uploads warten, ohne eigenen Statuscode.

#### Meldungen der Vorlagenprüfung

Alle Meldungen stehen wörtlich in `errors.datei`. Sie nennen nie Teilnamen, Namespaces oder
Dokumentinhalte außer den gefundenen Platzhaltertexten.

Formular:

| Meldung | Wann |
|---|---|
| „Die Anfrage ist kein gültiges multipart/form-data.“ | Content-Type ohne gültige Boundary |
| „Die Anfrage konnte nicht gelesen werden.“ | Formular abgeschnitten oder fehlerhaft |
| „Die Anfrage enthält zu viele Formularfelder.“ | mehr als 16 Abschnitte |
| „Bitte genau eine Datei im Feld „datei“ senden.“ | keine oder mehrere Dateien im Feld `datei` |
| „Die Datei ist leer.“ | Datei ohne Inhalt |

Inhalt: Die Stufen laufen in dieser Reihenfolge. Die erste Stufe mit Befund liefert ihre Meldungen, die
späteren Stufen laufen dann nicht mehr.

| Stufe | Meldung | Wann (Auswahl, vollständig in ADR-0024 und ADR-0026) |
|---|---|---|
| 1 | „Die Datei ist ein älteres Word-Dokument (.doc) oder mit einem Kennwort geschützt. Bitte als Word-Dokument (.docx) ohne Kennwort speichern.“ | OLE-Verbunddatei (.doc, kennwortgeschütztes DOCX) |
| 2 | „Die Datei ist kein Word-Dokument im Format .docx.“ | kein oder beschädigtes ZIP |
| 2 | „Die Datei ist entpackt zu groß oder enthält zu viele Bestandteile.“ | mehr als 1.000 Einträge, Eintrag über 20 MiB, zusammen über 50 MiB, Kompression über 100 : 1, XML-Teile zusammen über 10 MiB |
| 3 | „Die Datei enthält unzulässige Inhalte: Dokumenttypdefinitionen (DTD).“ | DOCTYPE in einem XML-Teil |
| 3 | „Die Datei ist zu tief verschachtelt. Bitte verschachtelte Tabellen, Textfelder oder Formen vereinfachen.“ | mehr als 256 Element-Ebenen in einem XML-Teil |
| 3 | „Die Datei ist entpackt zu groß oder enthält zu viele Bestandteile.“ | ein Element mit mehr als 1.000 Attributen |
| 3 | „Die Datei ist kein Word-Dokument im Format .docx.“ | XML-Teil nicht wohlgeformt |
| 4 | „Die Datei ist kein Word-Dokument im Format .docx.“ | Strukturfehler: kein `[Content_Types].xml`, Hauptteil fehlt oder hat einen anderen Typ (z. B. umbenannte PNG-, PDF-, XLSX- oder DOTX-Datei), Eintrag ohne Content-Type, doppelte oder ungültige Teilnamen, Teilname mit `:`, ungültiger `TargetMode`, internes Ziel mit Schema oder auf einen fehlenden Teil, Strict-OOXML an beliebiger Stelle, nicht deklariertes Präfix oder unbekanntes Attribut im `mc`-Namespace |
| 5 | „Die Datei enthält Makros. Bitte als Word-Dokument ohne Makros (.docx) speichern.“ | .docm oder VBA-Teile |
| 6 | „Die Vorlage enthält SVG-Grafiken. Bitte Bilder als PNG oder JPEG einfügen und erneut hochladen.“ | Teil `image/svg+xml` oder Namespace `svg`, `xlink`, `asvg` (auch mit PNG-Rückfall) |
| 6 | „Die Datei enthält nicht unterstützte Word-Erweiterungen, z. B. Diagramme, SmartArt, Freihandzeichnungen oder Add-ins. Bitte diese Inhalte entfernen und erneut hochladen.“ | Namespace außerhalb der [Positivliste](word-namespaces.md) (u. a. Diagramme, SmartArt, Freihand, 3D-Modelle, Add-ins, SharePoint-Metadaten, Vertraulichkeitsbezeichnungen), Element ohne Namespace, unqualifiziertes Attribut an einem WordprocessingML-Element, Freihand-Elemente (`w:contentPart`, `w14:contentPart`, `a14:contentPart`, `o:ink`), Personenlisten außerhalb des Personen-Teils, Signaturzeilen (`o:signatureline`) |
| 7 | „Die Datei enthält unzulässige Inhalte: {Arten}.“ | Arten kommagetrennt in fester Reihenfolge: „ActiveX-Steuerelemente“, „eingebettete Objekte“, „Verknüpfungen auf externe Inhalte“, „Hyperlinks mit unzulässigem Ziel“, „importierte Fremdinhalte“, „Serienbrief-Verknüpfungen“, „Felder mit externen Verknüpfungen oder DDE“, „Felder mit verschachtelten Feldanweisungen“, „Feldanweisungen in Alternativ- oder Fremdinhalten“, „Felder mit unzulässigem Feldnamen“ |
| 8 | „Die Vorlage enthält nachverfolgte Änderungen. Bitte alle Änderungen annehmen oder ablehnen und erneut hochladen.“ | Änderungsmarkierungen (`w:ins`, `w:del`, `w:rPrChange` …) oder Konfliktmarkierungen aus dem gemeinsamen Bearbeiten (`w14:conflictIns`, `w14:conflictDel`, `w14:customXmlConflict…`) in einem XML-Teil |
| 8 | „Die Vorlage enthält Kommentare. Bitte alle Kommentare löschen und erneut hochladen.“ | Kommentar-Teil mit Kommentar oder Kommentar-Verweise |
| 9 | „Es fehlen Pflichtplatzhalter: {{Coin.Name}}, {{Empfaenger.Name}}.“ | Pflichtplatzhalter fehlt (Katalogreihenfolge) |
| 9 | „Unbekannte Platzhalter: {{Empfaenger.Nam}}. Erlaubt sind nur die Platzhalter aus der Standardvorlage.“ | `{{…}}` nicht im Katalog; Schreibweise streng (`{{ Coin.Name }}` und `{{coin.name}}` sind unbekannt) |
| 9 | „Unvollständige Platzhalter: „{{Coin.Name“.“ | `{{` ohne `}}` im selben Absatz bzw. umgekehrt |
| 10 | „Die Datei konnte nicht verarbeitet werden. Bitte in Word erneut als Word-Dokument (.docx) speichern und erneut hochladen.“ | Bereinigung schlägt fehl, bereinigte Fassung größer als 5 MiB oder besteht die Nachprüfung nicht (nie `500`) |

Mehrere Meldungen derselben Stufe erscheinen gemeinsam als eigene Einträge: in Stufe 6 SVG zuerst, in
Stufe 8 Änderungen zuerst, in Stufe 9 in der Reihenfolge der Tabelle. Werte in Platzhaltermeldungen
werden auf 60 Zeichen gekürzt („…“), je Meldung höchstens 20, danach „ und {n} weitere“. Geprüft werden
Platzhalter im Hauptdokument, in Kopf- und Fußzeilen sowie Fuß- und Endnoten, auch wenn sie über mehrere
Runs verteilt sind; ein Platzhalter über mehrere Absätze gilt als unvollständig.

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "Eingaben ungültig",
  "status": 400,
  "errors": {
    "datei": [
      "Die Vorlage enthält SVG-Grafiken. Bitte Bilder als PNG oder JPEG einfügen und erneut hochladen.",
      "Die Datei enthält nicht unterstützte Word-Erweiterungen, z. B. Diagramme, SmartArt, Freihandzeichnungen oder Add-ins. Bitte diese Inhalte entfernen und erneut hochladen."
    ]
  },
  "traceId": "00-..."
}
```

Vorlagen aus einer SharePoint-Bibliothek tragen meist Metadaten in nicht erlaubten Namespaces und werden
mit der Erweiterungsmeldung abgelehnt; vor dem Hochladen lokal speichern.

#### Bereinigung

Nach bestandener Prüfung bereinigt der Server eine Kopie mit dem OpenXML SDK; gespeichert und ausgeliefert
wird nur die bereinigte Fassung (also nicht byte-gleich zum Upload):

- `docProps/core.xml`: alle Eigenschaften entfernt, danach nur `dc:creator` „C.O.I.N.“.
- `docProps/app.xml`: `Company`, `Manager`, `Template`, `HyperlinkBase`, `TitlesOfParts`, `HeadingPairs`
  entfernt; Statistikwerte bleiben.
- entfernt samt Beziehungen: `docProps/custom.xml`, alle `customXml`-Teile, der Personen-Teil
  (`word/people.xml`), verwaiste Teile; außerdem `w:docVars`, `w:dataBinding` und Bearbeitungsbereiche
  einzelner Personen (`w:permStart` mit `w:ed` samt `w:permEnd`, Text bleibt).
- Teilnamen und interne Beziehungsziele werden in eine einheitliche Schreibweise gebracht (z. B.
  `word/media/ä.png` → `word/media/%C3%A4.png`, Bildbytes unverändert).
- Unverändert bleiben Text, Formatierung, Bilder samt ihrer eingebetteten Metadaten (EXIF), Schriften,
  Stile und Dokument-Ids.

Die bereinigte Fassung durchläuft die vollständige Prüfung erneut. Schlägt das fehl, antwortet die API mit
Stufe 10 und schreibt eine Warnung mit fester Meldung (siehe [Protokollierung](#protokollierung)).

### POST /api/coins/{id}/zertifikatsvorlage/zuruecksetzen

Setzt den Coin auf die Standardvorlage zurück. Ohne Body und ohne Content-Type-Prüfung; ein mitgesendeter
Body wird nicht gelesen. Alle Versionen bleiben erhalten; ein späterer Upload erhält die nächste freie
Nummer.

| Status | Wann | Body |
|---|---|---|
| `200 OK` | zurückgesetzt, oder die Standardvorlage war schon aktiv (dann ohne Änderung und ohne Audit-Eintrag) | Vorlagenstatus mit `quelle` `"standard"` |
| `401` / `403` | wie oben (`coins.write`) | ProblemDetails |
| `404 Not Found` | Coin unbekannt | ProblemDetails, `title` „Coin nicht gefunden“ |

## Allgemein

Unerwartete Serverfehler liefern `500` als ProblemDetails ohne interne Details, Titel „Ein
unerwarteter Fehler ist aufgetreten.“

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

Zusätzlich schreibt der Vorlagen-Upload in zwei Fällen genau eine Warnung der Kategorie
`Coin.Api.Http.VorlagenProtokoll`, ohne Ausnahmeobjekt, Dateinamen, Befunde oder Dokumentinhalte:

| EventId | Name | Meldung |
|---|---|---|
| `2401` | `VorlageBereinigungFehlgeschlagen` | „Bereinigung einer Zertifikatsvorlage fehlgeschlagen.“ |
| `2402` | `VorlageNachpruefungFehlgeschlagen` | „Nachprüfung einer bereinigten Zertifikatsvorlage fehlgeschlagen.“ |

Abgelehnte Uploads (Stufen 1 bis 9) und abgelehnte Namespaces werden nicht geloggt.
