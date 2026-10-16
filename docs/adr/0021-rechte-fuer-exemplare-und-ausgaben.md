# ADR-0021: Rechte für Exemplare und Ausgaben, getrennte Endpunkte statt Feldfilter

Status: Angenommen, umgesetzt (Entscheidungen des Auftraggebers vom 2026-10-08, F1–F3 in `docs/features/coin-ausgaben.md`); Punkt 5 geändert durch [ADR-0025](0025-coin-stammdaten-bearbeiten.md) · Datum: 2026-10-08 · Feature: coin-ausgaben · Ändert: [ADR-0016](0016-berechtigungen-im-code-und-deaktivierte-benutzer.md) Punkt 1, 2 und 4 · Ergänzt: [ADR-0014](0014-coin-katalog-oeffentlich-lesbar.md)

## Kontext
Vorgabe: neue Berechtigungen `issues.read` und `issues.write`. Erfassen und Stornieren dürfen Administrator und Sachbearbeiter. Der Betrachter sieht nur Kennzahlen und den Status der Exemplare, aber keine Empfänger, Anlässe oder Begründungen, und „der Backend-Endpunkt liefert diese Felder für ihn gar nicht erst aus“.

Bisher: Der Katalog ist öffentlich (ADR-0014). `coins.read` ist definiert, aber nicht durchgesetzt (ADR-0016 Punkt 4). Jeder Endpunkt hat genau eine Berechtigung, `angemeldet` oder ist öffentlich (`docs/berechtigungen.md`). Für Verleihungen war `verleihungen.read` vorgemerkt (katalog-seiten, A6).

## Entscheidung
1. **Neue Berechtigungen** `issues.read` (Ausgaben samt Empfängerdaten lesen) und `issues.write` (Ausgaben erfassen und stornieren). Sie ersetzen die vorgemerkte `verleihungen.read`, die entfällt (Entscheidung F1: fachlich heißt es überall „Ausgabe“).

   | Berechtigung | Administrator | Sachbearbeiter | Betrachter | keine Rolle |
   |---|---|---|---|---|
   | `coins.read` | ja | ja | ja | nein |
   | `coins.write` | ja | ja | nein | nein |
   | `issues.read` | ja | ja | nein | nein |
   | `issues.write` | ja | ja | nein | nein |
   | `users.manage` | ja | nein | nein | nein |
   | `audit.read` | ja | nein | nein | nein |

   Deaktivierte Benutzer haben weiterhin keine Berechtigung.
2. **Getrennte Endpunkte statt Feldfilter je Rolle**:
   - `GET /api/coins/{id}/exemplare` (Kennzahlen, Nummer, Status) verlangt `coins.read`. Das DTO hat keine Felder für Personendaten, gleich welche Rolle fragt.
   - `GET /api/coins/{id}/ausgaben` (Historie mit Empfänger, Gelegenheit, Begründung) verlangt `issues.read`. Ein Betrachter erhält `403`, also keinerlei Ausgabedaten.
   - So bleibt die Regel „eine Berechtigung je Endpunkt“ erhalten, und die Inventartests prüfen den Schutz. Ein Feldfilter innerhalb eines Endpunkts wäre nur per Code-Review prüfbar und anfällig für Fehler bei Erweiterungen.
3. **`coins.read` wird durchgesetzt**, aber nur für den neuen Exemplar-Endpunkt (Entscheidung F2). Die drei bisherigen Katalog-Endpunkte bleiben öffentlich und tokenunabhängig (ADR-0014 unverändert). Anonyme Besucher, Benutzer ohne Rolle und deaktivierte Benutzer sehen Kennzahlen und Exemplar-Status nicht.
4. **Kein Personendatum im öffentlichen Coin-DTO**: `GET /api/coins` und `GET /api/coins/{id}` bekommen keine Kennzahlen und keine Ausgabedaten.
5. **Auflage ändern** (Entscheidung F3) ist ein eigener Endpunkt `PUT /api/coins/{id}/auflage` mit `coins.write`. Weiteres Bearbeiten von Coins gibt es nicht. *(Geändert durch ADR-0025: Stammdaten sind über `PUT /api/coins/{id}` bearbeitbar; `PUT …/auflage` bleibt.)*
6. Antworten aller neuen Endpunkte tragen `Cache-Control: no-store`, weil sie von der Anmeldung abhängen bzw. Personendaten enthalten.
7. 403-Texte (`code` `keine_berechtigung`):
   - `coins.read`: „Ihr Benutzerkonto ist nicht berechtigt, die Exemplare einzusehen.“
   - `issues.read`: „Ihr Benutzerkonto ist nicht berechtigt, Ausgaben einzusehen.“
   - `issues.write`: „Ihr Benutzerkonto ist nicht berechtigt, Ausgaben zu erfassen oder zu stornieren.“

## Betrachtete Optionen
| Option | Bewertung |
|---|---|
| A: ein Endpunkt, Felder je Berechtigung weglassen | erfüllt die Vorgabe, aber zwei Rechtsstufen an einem Endpunkt; Endpunkttabelle kann das nicht abbilden, Fehlerrisiko bei neuen Feldern |
| B: zwei Endpunkte mit je einer Berechtigung (gewählt) | Schutz pro Endpunkt, testbar über Inventar- und Rollentests, DTO ohne Personendaten für Betrachter per Konstruktion |
| C: Exemplar-Endpunkt öffentlich | Status und Zahl der Ausgaben wären für jeden sichtbar; widerspricht F5 aus katalog-seiten („keine Zahlen“ öffentlich), vom Auftraggeber verworfen (F2) |

## Umsetzung
- Die Endpunkte liegen in `ExemplareController` (`GET …/exemplare`, `PUT …/auflage`) und `AusgabenController`; beide rufen nur `AusgabeService` auf.
- `PUT …/auflage` verlangt wie geplant `coins.write`, die Logik liegt aber in `AusgabeService` statt `CoinKatalogService` (ADR-0020, Umsetzung).
- Die 403-Texte aus Punkt 7 stehen in `KeinZugriff` (`AutorisierungsErgebnisBehandlung.cs`).

## Folgen
- `coins.read` hat erstmals eine Wirkung. Ihre Bedeutung in `docs/berechtigungen.md` lautet jetzt „Exemplare und Kennzahlen lesen (Katalog selbst ist öffentlich)“.
- Sachbearbeiter erhalten erstmals Lesezugriff auf Personendaten Dritter (Empfänger), Betrachter nicht.
- Das Frontend blendet Abschnitte nur anhand von `berechtigungen` aus `/api/me` ein; geschützt wird im Backend.
