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
| `coins.read` | Katalog lesen (zurzeit öffentlich, nicht durchgesetzt) | ✓ | ✓ | ✓ | – |
| `coins.write` | Coins anlegen, Motivbild hochladen | ✓ | ✓ | – | – |
| `users.manage` | Benutzer auflisten, Rolle und Status ändern | ✓ | – | – | – |
| `audit.read` | Audit-Log lesen | ✓ | – | – | – |
<!-- rechtematrix:ende -->

Deaktivierte Benutzer haben unabhängig von ihrer Rolle keine Berechtigung, lesen aber wie alle
anderen die öffentlichen Endpunkte. Anonyme Besucher lesen nur die öffentlichen Endpunkte.

`coins.read` ist definiert, wird aber nicht durchgesetzt, solange der Katalog öffentlich lesbar ist
(ADR-0014).

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
| `POST /api/coins`, `PUT /api/coins/{id}/bild` | `coins.write` |
| `GET /api/me` | angemeldet |
| `GET /api/benutzer`, `PUT /api/benutzer/{id}/rolle`, `PUT /api/benutzer/{id}/status` | `users.manage` |
| `GET /api/audit` | `audit.read` |
<!-- endpunkte:ende -->

Routenparameter stehen ohne Constraint in der Tabelle (`{id}` statt `{id:guid}`). Das
OpenAPI-Dokument (`/openapi/v1.json`) wird nur in der Umgebung `Development` bereitgestellt und ist
dort öffentlich; es zählt nicht zu den fachlichen Endpunkten.

Neue Endpunkte werden hier eingetragen. Sie verlangen genau eine Berechtigung, `angemeldet` oder sind
ausdrücklich öffentlich; mehrere Policies an einem Endpunkt sind nicht vorgesehen.
