# API

Basis-URL lokal: `http://localhost:5172` (siehe [README](../README.md)). JSON in camelCase.
In der Umgebung `Development` liefert `GET /openapi/v1.json` das OpenAPI-Dokument (ohne Anmeldung).

| Methode | Pfad | Zweck | Zugang |
|---|---|---|---|
| `GET` | `/api/coins` | Alle Coins auflisten | öffentlich |
| `GET` | `/api/coins/{id}` | Einen Coin abrufen | öffentlich |
| `GET` | `/api/coins/{id}/bild` | Motivbild abrufen | öffentlich |
| `POST` | `/api/coins` | Coin anlegen | Rolle Administrator oder Sachbearbeiter |
| `PUT` | `/api/coins/{id}/bild` | Motivbild hochladen oder ersetzen | Rolle Administrator oder Sachbearbeiter |
| `GET` | `/api/me` | Angemeldeten Benutzer abrufen | angemeldet, Rolle egal |

`{id}` ist eine GUID. Pfade mit einer `id`, die keine GUID ist, liefern `404`.

## Authentifizierung

Grundlage: [ADR-0012](adr/0012-anmeldung-keycloak-oidc.md), [ADR-0013](adr/0013-benutzer-und-rollen-in-eigener-datenbank.md),
[ADR-0014](adr/0014-coin-katalog-oeffentlich-lesbar.md).

- Angemeldet wird per Access-Token des Keycloak im Header `Authorization: Bearer <token>`. Andere
  Wege (Query-Parameter `access_token`, Cookies) werden nicht ausgewertet.
- Geprüft werden: Signatur RS256 mit Schlüssel aus der JWKS der Authority, `iss` = `Oidc:Authority`
  (exakt), `aud` = `Oidc:Audience`, `exp`/`nbf` (Toleranz 30 s), Header-`typ` `JWT` oder `at+jwt`,
  `sub` vorhanden, `azp` = `Oidc:ClientId`.
- Standardmäßig verlangt jeder Endpunkt eine Anmeldung. Öffentlich sind nur die drei `GET`-Endpunkte
  des Katalogs (und `/openapi/v1.json` in Development). Ihre Antworten hängen nicht vom Token ab:
  Auch ein ungültiges oder abgelaufenes Token führt dort zu keinem `401`.
- Rollen (`Administrator`, `Sachbearbeiter`, `Betrachter`) führt C.O.I.N. in der eigenen Datenbank.
  Rollen-Claims im Token werden ignoriert. Neue Benutzer haben keine Rolle. Vergeben wird bisher nur
  `Administrator` über `Bootstrap:AdminEmails` beim ersten Aufruf (nur mit `email_verified=true`).
- Der Aufruf von `GET /api/me` oder eines schreibenden Endpunkts legt den Benutzer bei Bedarf an
  bzw. übernimmt geänderte E-Mail und Namen aus dem Token. Öffentliche Aufrufe tun das nicht.

| Status | Wann | Body |
|---|---|---|
| `401 Unauthorized` | kein, ungültiges oder abgelaufenes Token auf einem geschützten Endpunkt | ProblemDetails, `title` „Nicht angemeldet“, `detail` „Für diese Aktion ist eine Anmeldung erforderlich.“; Header `WWW-Authenticate: Bearer` ohne Fehlerdetails |
| `403 Forbidden` | angemeldet, aber ohne Rolle Administrator oder Sachbearbeiter (schreibende Endpunkte) | ProblemDetails, `title` „Kein Zugriff“, `detail` „Ihr Benutzerkonto ist nicht berechtigt, den Coin-Katalog zu ändern.“ |

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

Liefert den angemeldeten Benutzer aus der eigenen Datenbank. Verlangt nur eine Anmeldung, keine Rolle.
Antwort-Header `Cache-Control: no-store`.

```json
{
  "id": "0199b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b",
  "name": "Test Administrator",
  "email": "admin@test.local",
  "rolle": "Administrator"
}
```

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | GUID | interne Benutzer-Id (nicht `sub` aus dem Token) |
| `name` | string | Anzeigename aus `name`, sonst `preferred_username`, sonst `email`, sonst „Unbekannt“; höchstens 200 Zeichen |
| `email` | string oder `null` | aus dem Claim `email`; `null`, wenn er fehlt oder länger als 320 Zeichen ist |
| `rolle` | string | `"Administrator"`, `"Sachbearbeiter"`, `"Betrachter"` oder `"keine"` |

| Status | Wann | Body |
|---|---|---|
| `200 OK` | angemeldet | Benutzer |
| `401 Unauthorized` | ohne gültiges Token | ProblemDetails „Nicht angemeldet“ |

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

Legt einen Coin an. Nur für die Rollen Administrator und Sachbearbeiter. `Content-Type: application/json`.

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
| `403 Forbidden` | Rolle Betrachter oder keine Rolle | ProblemDetails „Kein Zugriff“ |
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

Lädt das Motivbild hoch oder ersetzt ein vorhandenes. Nur für die Rollen Administrator und
Sachbearbeiter. `Content-Type: multipart/form-data` mit genau
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
| `403 Forbidden` | Rolle Betrachter oder keine Rolle | ProblemDetails „Kein Zugriff“ |
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
