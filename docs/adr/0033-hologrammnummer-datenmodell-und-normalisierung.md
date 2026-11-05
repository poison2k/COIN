# ADR-0033: Hologrammnummer – eigene Tabelle je Ausgabe, Normalisierung, Eindeutigkeit und Reservierung

Status: Angenommen, umgesetzt (Migration `Hologrammnummern`; Entscheidungen des Auftraggebers vom 2026-11-03, H1–H5 und H10 in [hologrammnummer](../features/hologrammnummer.md) Abschnitt 1.2; Rev. 2) · Datum: 2026-11-03 · Feature: [hologrammnummer](../features/hologrammnummer.md) · Ergänzt: [ADR-0020](0020-exemplare-und-ausgaben-datenmodell.md) Punkt 6, 9, 10, [ADR-0027](0027-coin-kennung-und-zertifikatsnummer.md), [ADR-0028](0028-zertifikat-erzeugen-im-speicher.md)

## Kontext
Jedes gedruckte Zertifikat trägt einen Hologramm-Sticker mit eindeutiger Nummer. Vorgaben des Auftraggebers:
- Die Ausgabe erhält eine optionale **Hologrammnummer** (Freitext, höchstens 40 Zeichen), eindeutig **über alle Coins**.
- Vergleich und Speichern **normalisiert** (Leerzeichen und Bindestriche entfernen, Großbuchstaben): „ab 12-34“ = „AB1234“. Die Eindeutigkeit sichert ein **Datenbank-Constraint auf dem normalisierten Wert**, auch bei parallelen Anfragen.
- Die Nummer wird beim Erfassen angegeben oder auf der Seite der Ausgabe **nachträglich ergänzt oder korrigiert** (Korrektur mit Grund, `issues.write`).
- **Stornierte Ausgaben behalten ihre Nummer**; sie wird nicht wieder frei, weil der Sticker physisch weiter existiert.
- Setzen und Ändern kommen ins Audit (alt, neu, Grund, wer, wann).

Entscheidungen vom 2026-11-03: Eine Korrektur gibt die alte Nummer frei (H1); erlaubt sind nur A–Z und 0–9 mit Leerzeichen und Bindestrichen als Trenner (H2); angezeigt wird die bereinigte Form in Großbuchstaben (H3); nach einem Storno ist die Nummer nicht mehr änderbar (H4); Entfernen gibt es nicht (H5); kein Lese-Endpunkt für das Audit, unbegrenzte Aufbewahrung (H10).

Ist-Stand: `ausgabe` ist per Trigger `trg_ausgabe_nur_storno` bis auf das einmalige Storno unveränderlich (ADR-0020 Punkt 9, ADR-0027 Punkt 5). Eine Spalte an `ausgabe`, die nachträglich gesetzt und geändert wird, bricht diese Garantie.

## Entscheidung
1. **Eigene Tabelle `ausgabe_hologramm`** statt Spalte an `ausgabe`. Jede Zuordnung „Nummer → Ausgabe“ ist eine Zeile; eine Korrektur löst die bisherige Zeile ab (`abgeloest_am` gesetzt) und fügt eine neue ein. `ausgabe` und `trg_ausgabe_nur_storno` bleiben **unverändert**.
   - `id` (GUID v7), `ausgabe_id` (FK `ausgabe`, `RESTRICT`), `nummer` (`varchar(40)`, Anzeigeform), `nummer_normalisiert` (`varchar(40)`, **generierte Spalte** `GENERATED ALWAYS AS (upper(translate(nummer, ' -', ''))) STORED`), `gesetzt_am` (`timestamptz`), `gesetzt_von` (FK `benutzer`), `abgeloest_am` (`timestamptz NULL`).
   - Checks: `nummer ~ '^[A-Z0-9 -]{1,40}$' AND nummer = btrim(nummer) AND position('  ' IN nummer) = 0`; `nummer_normalisiert ~ '^[A-Z0-9]{1,40}$'`.
   - **Eine aktuelle Nummer je Ausgabe:** `ux_ausgabe_hologramm_aktuell ON (ausgabe_id) WHERE abgeloest_am IS NULL`.
   - **Eindeutigkeit über alle Coins und alle Ausgaben, auch stornierte, aber nur über nicht abgelöste Zeilen** (H1): `ux_ausgabe_hologramm_nummer ON (nummer_normalisiert) WHERE abgeloest_am IS NULL`. Eine abgelöste Zeile sperrt ihre Nummer nicht mehr; sie bleibt als Historie stehen.
   - Weil die normalisierte Spalte von der Datenbank selbst berechnet wird, kann keine Anwendung einen abweichenden Vergleichswert speichern.
2. **Unveränderlich bis auf das Ablösen:** Trigger `trg_ausgabe_hologramm_nur_abloesen` (`BEFORE UPDATE OR DELETE`) bricht bei `DELETE` ab und bei jedem `UPDATE`, das nicht genau `abgeloest_am NULL → gesetzt` ist oder andere Spalten ändert. `TRUNCATE` bleibt (Tests, Betrieb) wie in ADR-0017.
3. **Storno reserviert dauerhaft:** Ein Storno ändert `ausgabe_hologramm` nicht. Die Zeile bleibt aktuell (`abgeloest_am IS NULL`) und damit im eindeutigen Index. Weil die Anwendung jede Änderung der Nummer einer stornierten Ausgabe ablehnt (`409 ausgabe_storniert`, H4) und es kein Entfernen gibt (H5), wird diese Zeile nie abgelöst: Die Nummer einer stornierten Ausgabe ist **für immer gesperrt**.
4. **Normalisierung in der Domain** (`Coin.Domain.Ausgaben.Hologrammnummer.Pruefen`), im Frontend gespiegelt (gleiche Testvektoren). Schritte:
   1. `null` oder nur Leerraum → keine Nummer. Mehr als 200 Zeichen roh → Längenfehler ohne weitere Verarbeitung.
   2. Unicode-Normalform **NFKC** (Vollbreite `ＡＢ１` → `AB1`, geschütztes Leerzeichen → Leerzeichen).
   3. Jedes Leerraumzeichen (`char.IsWhiteSpace`, u. a. Tab, Zeilenumbruch, U+00A0, U+202F, U+3000) → Leerzeichen; jedes Zeichen der Kategorie **Pd** (Bindestrich, U+2010–U+2015, U+2E3A, U+FE58, U+FE63, U+FF0D, …) und **U+2212** (Minus) → `-`; Zeichen der Kategorie **Cf** (U+00AD, U+200B–U+200F, U+2060, U+FEFF, …) entfallen.
   4. Trimmen, Folgen von Leerzeichen zu einem zusammenfassen, **Großbuchstaben** (`ToUpperInvariant`). Ergebnis = **Anzeigeform** (H3).
   5. Zeichensatz der Anzeigeform `^[A-Z0-9 -]+$` (H2), sonst Fehler; Länge höchstens 40, sonst Fehler.
   6. **Normalform** = Anzeigeform ohne Leerzeichen und `-`; leer → Fehler („mindestens ein Buchstabe oder eine Ziffer“).
   Gespeichert wird die Anzeigeform (`nummer`), die Datenbank leitet daraus die Normalform ab; Anwendung und Datenbank müssen zum selben Ergebnis kommen (Test). Angezeigt und ins Zertifikat eingesetzt wird die Anzeigeform. Verglichen wird immer die Normalform.
5. **Nebenläufigkeit:** Erfassen, Ergänzen und Korrigieren laufen in einer Transaktion unter der Sperre der Coin-Zeile (ADR-0020 Punkt 6). Diese serialisiert nur Ausgaben **desselben** Coins; zwischen verschiedenen Coins ist der eindeutige Index die harte Grenze. `23505` auf `ux_ausgabe_hologramm_nummer` übersetzt die Anwendung in `409 hologrammnummer_vergeben`; beim Erfassen rollt dann die ganze Ausgabe zurück. Eine Vorabprüfung unter der Sperre liefert im Normalfall dieselbe Meldung, ersetzt den Index aber nicht. Bei einer Korrektur wird zuerst die bisherige Zeile abgelöst und dann die neue eingefügt (in derselben Transaktion). Verlorene Aktualisierungen verhindert das Feld `bisherige` der Änderungsanfrage (Nummer, die der Benutzer gesehen hat; Abweichung der Normalform → `409 hologrammnummer_geaendert`).
6. **Audit in eigener Tabelle `hologramm_audit`** (Muster ADR-0020 Punkt 10, ADR-0029): `id`, `zeitpunkt`, `akteur_id` (FK `benutzer`), `ausgabe_id` (FK `ausgabe`), `coin_id`, `art` (`Gesetzt` | `Geaendert`), `nummer_alt` (`varchar(40) NULL`, Normalform), `nummer_neu` (`varchar(40)`, Normalform), `grund` (`varchar(500) NULL`). Check: `Gesetzt` ⇔ `nummer_alt IS NULL AND grund IS NULL`; `Geaendert` ⇔ beide gesetzt. Unveränderlich per Trigger `trg_hologramm_audit_unveraenderlich`. Keine Empfängerdaten. Eintrag in derselben Transaktion wie die Änderung. **Kein Lese-Endpunkt** (H10), Auswertung per SQL. Aufbewahrung unbegrenzt bis zum Löschkonzept.
7. **Zertifikatsnummer unberührt:** `ausgabe.zertifikatsnummer` (ADR-0027) bleibt, wie sie ist. Die Zertifikatsnummer bezeichnet das Exemplar und wiederholt sich nach Storno; die Hologrammnummer bezeichnet den physischen Sticker eines Ausdrucks und ist unter allen aktuellen Zuordnungen eindeutig. Sie löst damit das Restrisiko aus ADR-0027 „Folgen“ für angemeldete Prüfungen.
8. **Kein Personendatum:** Hologrammnummern sind keine Personendaten. Sie stehen trotzdem nicht in Anwendungslogs (Request-DTOs mit wertfreiem `ToString`, Prüfung per POST-Body statt URL), weil sie zusammen mit einer Ausgabe einen Empfänger bezeichnen. `Include Error Detail` bleibt verboten (ADR-0020 „Umsetzung“), damit `23505`-Details mit der Nummer nicht in Ausnahmen landen.

## Betrachtete Optionen
| Thema | Option | Bewertung |
|---|---|---|
| Speicherort | Spalte `ausgabe.hologrammnummer`, Ausnahme im Trigger für genau diese Spalte | einfach, aber die zentrale Unveränderlichkeit von `ausgabe` bekommt eine Lücke; Historie nur im Audit, verworfen |
| | Spalte einmalig `NULL → Wert`, Korrektur nur per Storno + Neuausgabe | erfüllt „nachträglich korrigieren“ nicht, verworfen |
| | **eigene Tabelle mit Ablösung (gewählt)** | `ausgabe` bleibt unverändert, Historie im Datenmodell |
| Alte Nummer bei Korrektur | gesperrt lassen (Index ohne `WHERE`) | ein Tippfehler blockiert die Nummer eines echten anderen Stickers dauerhaft, ohne Freigabeweg; vom Auftraggeber verworfen (H1) |
| | gesperrt mit Freigabe durch Administratoren | zusätzlicher Endpunkt und Ablauf, verworfen (H1) |
| | **freigeben (gewählt, H1)** | Korrektur behebt meist einen Tippfehler; Historie bleibt in Tabelle und Audit |
| Normalform | in der Anwendung berechnen und speichern | DB-Constraint prüft dann nur, was die Anwendung liefert; verworfen |
| | Ausdrucksindex `upper(translate(…))` ohne Spalte | gleichwertig, aber Suche muss den Ausdruck exakt wiederholen |
| | **generierte Spalte + eindeutiger Index (gewählt)** | Vergleichswert gehört der Datenbank, Suche über eine Spalte |
| Unicode | nur ASCII-Leerzeichen und `-` entfernen | „AB–1234“ (Halbgeviertstrich aus Word) und „ＡＢ1234“ wären andere Nummern als „AB1234“, verworfen |
| | **NFKC + Kategorien Pd/Cf/Leerraum (gewählt)** | erkennt die üblichen Eingabevarianten, Ergebnis ASCII |
| Zeichensatz | zusätzlich `/` und `.` als Trenner; Umlaute | vom Auftraggeber verworfen (H2) |
| Anzeige | nur Normalform speichern und zeigen; Eingabe unverändert | vom Auftraggeber verworfen (H3) |
| | **bereinigte Anzeigeform in Großbuchstaben, Normalform abgeleitet (gewählt)** | nah am Sticker, Vergleich trotzdem eindeutig |
| Audit | in `ausgabe_audit` aufnehmen | ändert Check und Bedeutung einer bestehenden Tabelle (wie ADR-0029 verworfen) |
| | **eigene Tabelle (gewählt)** | bestehende Tabellen bleiben unverändert |

## Folgen
- Nach einer Korrektur ist die alte Nummer wieder vergebbar. Wird sie geprüft, lautet das Ergebnis „nicht gefunden“, solange sie keiner anderen Ausgabe zugeordnet ist; danach gehört sie zur neuen Ausgabe. Wer eine falsch eingetragene Nummer korrigiert, gibt damit bewusst frei – das steht im Audit.
- Hologrammnummern stornierter Ausgaben sind dauerhaft vergeben. Für eine Neuausgabe desselben Exemplars braucht es einen neuen Sticker. Ein Tippfehler, der erst nach dem Storno auffällt, bleibt bestehen (H4).
- Die Sperre je Coin schützt nicht gegen dieselbe Nummer an zwei Coins gleichzeitig; das leistet allein der Index. Integrationstests prüfen genau diesen Fall parallel.
- Das Löschkonzept muss auch `ausgabe_hologramm` und `hologramm_audit` an den Triggern vorbei behandeln.
- Die generierte Spalte setzt PostgreSQL ≥ 12 voraus (vorhanden).
