# Berechtigungen

C.O.I.N. prüft an Endpunkten immer eine **Berechtigung**, nie eine Rolle. Welche Rolle welche
Berechtigungen hat, legt die feste Rechtematrix im Code fest (`Coin.Domain.Benutzer.Rechtematrix`,
ADR-0016). Rollen führt C.O.I.N. in der eigenen Datenbank; Rollen-Claims aus dem Token werden nicht
ausgewertet.

Beide Tabellen werden automatisch geprüft und müssen bei jeder Änderung mitgezogen werden:
- Rechtematrix gegen `Rechtematrix` im Code: `tests/Coin.UnitTests/Benutzer/BerechtigungsDokuTests.cs`
- Endpunkttabelle gegen alle Endpunkte und Policies der API:
  `tests/Coin.IntegrationTests/Berechtigungen/EndpunktTabelleTests.cs`

Die Marker-Kommentare und das Tabellenformat (Spaltenreihenfolge, `✓`/`–`, Werte in Backticks)
nicht verändern.

## Rechtematrix

<!-- rechtematrix:start -->
| Berechtigung | Bedeutung | Administrator | Sachbearbeiter | Betrachter | keine Rolle |
|---|---|---|---|---|---|
| `coins.read` | Exemplare und Kennzahlen lesen (Katalog selbst ist öffentlich) | ✓ | ✓ | ✓ | – |
| `coins.write` | Coins anlegen und bearbeiten, Motivbild hochladen, Auflage ändern, Zertifikatsvorlagen herunterladen, hochladen und zurücksetzen | ✓ | ✓ | – | – |
| `issues.read` | Ausgaben mit Empfängerdaten lesen (Liste und Einzelansicht) | ✓ | ✓ | – | – |
| `issues.write` | Ausgaben erfassen und stornieren, Zertifikate herunterladen | ✓ | ✓ | – | – |
| `users.manage` | Benutzer auflisten, Rolle und Status ändern | ✓ | – | – | – |
| `audit.read` | Audit-Log lesen | ✓ | – | – | – |
<!-- rechtematrix:ende -->

Deaktivierte Benutzer haben unabhängig von ihrer Rolle keine Berechtigung, lesen aber wie alle
anderen die öffentlichen Endpunkte. Anonyme Besucher lesen nur die öffentlichen Endpunkte.

`coins.read` gilt für `GET /api/coins/{id}/exemplare` und wird damit erstmals durchgesetzt; die
übrigen Katalog-Endpunkte bleiben öffentlich (ADR-0014, ADR-0021).

Exemplare und Ausgaben haben getrennte Lese-Endpunkte (ADR-0021): `GET …/exemplare` (`coins.read`)
liefert nur Nummer, Status und Kennzahlen, Empfängerdaten gibt es nur über `GET …/ausgaben` und
`GET …/ausgaben/{ausgabeId}` (`issues.read`) und in den Antworten der schreibenden
Ausgabe-Endpunkte (`issues.write`). Der Betrachter erhält deshalb nie Empfängerdaten.

Das Zertifikat einer Ausgabe (`GET …/ausgaben/{ausgabeId}/zertifikat`) enthält Empfängerdaten und
verlangt `issues.write`, nicht `issues.read` (Feature zertifikat-erzeugen, ADR-0029).

## Endpunkte

Zugriff ist einer von drei Werten:
- **öffentlich**: ohne Anmeldung (`[AllowAnonymous]`, Begründung im ADR)
- **angemeldet**: gültiges Token und aktiver Benutzer, keine bestimmte Berechtigung
- **eine Berechtigung**: Policy gleichen Namens, z. B. `[Authorize(Policy = Berechtigungen.CoinsWrite)]`

Endpunkte ohne eigene Angabe fallen unter die Fallback-Policy (angemeldet und aktiv).

<!-- endpunkte:start -->
| Endpunkt | Zugriff |
|---|---|
| `GET /api/coins`, `GET /api/coins/{id}`, `GET /api/coins/{id}/bild` | öffentlich |
| `POST /api/coins`, `PUT /api/coins/{id}`, `PUT /api/coins/{id}/bild`, `PUT /api/coins/{id}/auflage` | `coins.write` |
| `GET /api/zertifikatsvorlagen/standard`, `GET /api/coins/{id}/zertifikatsvorlage`, `GET /api/coins/{id}/zertifikatsvorlage/datei`, `GET /api/coins/{id}/zertifikatsvorlage/versionen/{version}/datei`, `POST /api/coins/{id}/zertifikatsvorlage/versionen`, `POST /api/coins/{id}/zertifikatsvorlage/zuruecksetzen` | `coins.write` |
| `GET /api/coins/{id}/exemplare` | `coins.read` |
| `GET /api/coins/{id}/ausgaben`, `GET /api/coins/{id}/ausgaben/{ausgabeId}` | `issues.read` |
| `POST /api/coins/{id}/ausgaben`, `POST /api/coins/{id}/ausgaben/{ausgabeId}/storno`, `GET /api/coins/{id}/ausgaben/{ausgabeId}/zertifikat` | `issues.write` |
| `GET /api/me` | angemeldet |
| `GET /api/benutzer`, `PUT /api/benutzer/{id}/rolle`, `PUT /api/benutzer/{id}/status` | `users.manage` |
| `GET /api/audit` | `audit.read` |
<!-- endpunkte:ende -->

Routenparameter stehen ohne Constraint in der Tabelle (`{id}` statt `{id:guid}`). Das
OpenAPI-Dokument (`/openapi/v1.json`) wird nur in der Umgebung `Development` bereitgestellt und ist
dort öffentlich; es zählt nicht zu den fachlichen Endpunkten.

Neue Endpunkte werden hier eingetragen. Sie verlangen genau eine Berechtigung, `angemeldet` oder sind
ausdrücklich öffentlich; mehrere Policies an einem Endpunkt sind nicht vorgesehen.
