# ADR-0025: Coin-Stammdaten bearbeiten über `PUT /api/coins/{id}`

Status: Angenommen, umgesetzt (Entscheidungen des Auftraggebers vom 2026-10-09, F1–F5 in `docs/features/zertifikatsvorlagen.md`) · Datum: 2026-10-09 · Feature: [zertifikatsvorlagen](../features/zertifikatsvorlagen.md) · Ändert: [ADR-0021](0021-rechte-fuer-exemplare-und-ausgaben.md) Punkt 5 („Weiteres Bearbeiten von Coins gibt es nicht“) und Entscheidung F3 aus coin-ausgaben

## Kontext
Bisher ist nach dem Anlegen nur die Auflage änderbar (`PUT /api/coins/{id}/auflage`, Dialog auf der Detailseite, F3). Der neue Auftrag verlangt eine Seite „Coin bearbeiten“ für die Stammdaten mit den bestehenden Regeln (Auflage nicht unter die ausgegebenen Exemplare), erreichbar von der Detailseite, nur mit `coins.write`. Auf derselben Seite werden Motivbild und Zertifikatsvorlagen verwaltet.

## Entscheidung
1. **Neuer Endpunkt `PUT /api/coins/{id}`** (`coins.write`, `application/json`) ersetzt Name, Herausgeber, Auflage und Beschreibung vollständig. Feldregeln und Meldungen wie beim Anlegen.
2. **Auflage im selben Aufruf** mit der bestehenden Regel `AuflageAenderung` und derselben Coin-Sperre (`FOR UPDATE`, ADR-0020 Punkt 6), damit Stammdaten und Exemplare atomar geändert werden. Die Untergrenze bleibt die höchste **je** ausgegebene Nummer (F1, wie F4 aus coin-ausgaben). Eine gesetzte Auflage kann nicht wieder `null` werden.
3. **Duplikate** (gleicher Name und Herausgeber wie ein anderer Coin) → `409` mit `code` `coin_existiert`; der bestehende eindeutige Index sichert das auch bei gleichzeitigen Anfragen.
4. **`PUT …/auflage` und der Dialog „Auflage ändern“ bleiben** (F2).
5. **Kein Audit** für Stammdatenänderungen (F3) und **keine Konkurrenzprüfung**, der letzte Speichervorgang gewinnt (F4).
6. **Motivbild** wird auf der Seite über den bestehenden Endpunkt `PUT /api/coins/{id}/bild` ersetzt (F5, ADR-0006); Löschen gibt es nicht.
7. Das öffentliche Coin-DTO bleibt unverändert (sieben Felder).

## Betrachtete Optionen
| Option | Bewertung |
|---|---|
| **ein `PUT /api/coins/{id}` inkl. Auflage (gewählt)** | atomar, eine Antwort, Regeln an einer Stelle |
| `PUT /api/coins/{id}` ohne Auflage, Seite ruft zusätzlich `PUT …/auflage` | zwei Aufrufe, Teilerfolge möglich, verworfen |
| `PATCH` mit Teilfeldern | CORS erlaubt kein `PATCH`, unklare Semantik für `null`, verworfen |

## Folgen
- `coins.write` umfasst jetzt auch das Bearbeiten von Stammdaten; die Bedeutung in `docs/berechtigungen.md` wird angepasst.
- katalog-seiten AK-20 („keine Bearbeiten-Bedienelemente“) ist abgelöst; die Detailseite zeigt mit `coins.write` den Link „Bearbeiten“.
- Zwei Wege, die Auflage zu ändern (Dialog und Seite), nutzen dieselbe Domänenregel.
