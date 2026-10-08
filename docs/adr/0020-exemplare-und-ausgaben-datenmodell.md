# ADR-0020: Exemplare und Ausgaben – Datenmodell, Nebenläufigkeit, Audit

Status: Angenommen, umgesetzt (Entscheidungen des Auftraggebers vom 2026-10-08, F4–F10 in `docs/features/coin-ausgaben.md`; Abweichungen unter „Umsetzung“) · Datum: 2026-10-08 · Feature: coin-ausgaben · Ergänzt: [ADR-0003](0003-persistenz-ef-core-postgresql.md), [ADR-0017](0017-audit-log-fuer-rollen-und-status.md)

## Kontext
Verwalter dokumentieren, welches Exemplar eines Coins an wen ausgegeben wurde. Vorgaben des Auftraggebers:
- Je Coin gibt es genau so viele nummerierte Exemplare wie die Auflage (1 bis N). Sie entstehen beim Anlegen, für bestehende Coins per Migration. Eine Erhöhung der Auflage erzeugt weitere Nummern, eine Senkung unter die ausgegebenen Exemplare ist verboten.
- Ein Exemplar ist höchstens einmal gleichzeitig ausgegeben, **auch bei gleichzeitigen Zugriffen, per Datenbank-Constraint**.
- Ausgaben werden nicht gelöscht, sondern mit Pflichtgrund storniert. Die stornierte Ausgabe bleibt sichtbar.
- Anlegen und Stornieren kommen ins Audit-Log (wer, wann, was). Empfängerdaten sind Personendaten und kommen nicht in Anwendungslogs.

Die Audit-Tabelle `benutzer_audit` (ADR-0017) ist auf Rollen- und Statusänderungen zugeschnitten: `benutzer_id` ist Pflicht-FK auf `benutzer`, ein Check-Constraint lässt nur `Rolle`/`Status` mit festen Werten zu.

## Entscheidung
1. **Tabelle `exemplar`** mit `coin_id` (FK `coin_typ`, `ON DELETE RESTRICT`) und `nummer` (`int`, Check `nummer >= 1`). Primärschlüssel ist `(coin_id, nummer)`, es gibt keine eigene Id. Der Status („verfügbar“/„ausgegeben“) wird **nicht gespeichert**, sondern aus der aktiven Ausgabe abgeleitet, damit es keine zweite Wahrheit gibt. Der Status „ungültig“ aus `requirements.md` ist nicht Teil dieses Features.
2. **Erzeugen per SQL**, nie über EF-Tracking: `INSERT INTO exemplar (coin_id, nummer) SELECT @id, generate_series(@von, @bis)`. Beim Anlegen eines Coins in derselben Transaktion wie `coin_typ`, beim Erhöhen der Auflage für die neuen Nummern. Ein Coin mit Auflage `NULL` („unbekannt“) hat keine Exemplare. Die Obergrenze der Auflage bleibt 1.000.000 (Entscheidung F9).
3. **Migration** `Exemplare`: legt `exemplar`, `ausgabe` und `ausgabe_audit` an und erzeugt für jeden bestehenden Coin mit Auflage die Nummern 1 bis Auflage (`INSERT … SELECT c.id, generate_series(1, c.auflage) FROM coin_typ c WHERE c.auflage IS NOT NULL`). `Down` entfernt die drei Tabellen samt Triggern.
4. **Tabelle `ausgabe`**:
   - `id` (GUID v7), `coin_id` + `exemplar_nummer` (zusammengesetzter FK auf `exemplar`, `RESTRICT`).
   - Empfänger als Freitext: `empfaenger_name` (≤ 200, Pflicht), `empfaenger_dienstgrad` (≤ 100), `empfaenger_dienststelle` (≤ 200). Keine Personenstammdaten (Vorgabe „Nicht dazu“).
   - `datum` (`date`, ohne Zeitzone; Pflicht, nicht in der Zukunft nach Europe/Berlin, Entscheidung F8), `gelegenheit` (≤ 200, Pflicht), `begruendung` (≤ 2000, Pflicht), `ausgebende_stelle` (≤ 200, Pflicht-Freitext, Entscheidung F5).
   - `erfasst_am` (`timestamptz`), `erfasst_von` (FK `benutzer`, Pflicht, automatisch der angemeldete Benutzer, Entscheidung F5).
   - `storniert_am`, `storniert_von` (FK `benutzer`), `storno_grund` (≤ 500). Check: alle drei `NULL` oder alle drei gesetzt.
5. **„Einmal gleichzeitig ausgegeben“ in der Datenbank**: partieller eindeutiger Index `ux_ausgabe_exemplar_aktiv ON ausgabe (coin_id, exemplar_nummer) WHERE storniert_am IS NULL`. Eine zweite aktive Ausgabe scheitert mit `23505`, unabhängig von der Anwendungslogik. Die Anwendung übersetzt das in `409`.
6. **Serialisierung je Coin**: Ausgabe erfassen, stornieren und Auflage ändern laufen in einer Transaktion, die zuerst die Coin-Zeile sperrt (`SELECT … FROM coin_typ WHERE id = @id FOR UPDATE`). Damit sind „nächste freie Nummer“, die Prüfung der Exemplar-Nummer gegen die Auflage und das Senken der Auflage gegenüber gleichzeitigen Ausgaben konsistent. Der Index aus Punkt 5 bleibt die harte Grenze, falls ein Pfad die Sperre nicht nimmt. Andere Coins werden nicht blockiert.
7. **Nächste freie Nummer**: kleinste Nummer des Coins ohne aktive Ausgabe (`NOT EXISTS` auf den partiellen Index), unter der Sperre aus Punkt 6. Frei gewordene Nummern nach einem Storno werden wiederverwendet.
8. **Auflage senken** (Entscheidung F4): Die neue Auflage muss mindestens so groß sein wie die höchste Nummer, die **jemals** ausgegeben war (aktiv oder storniert). Nummern darüber werden gelöscht. So bleibt die Historie vollständig, der FK (`RESTRICT`) sichert das zusätzlich ab. Eine gesetzte Auflage kann nicht wieder auf „unbekannt“ gesetzt werden.
9. **Storno statt Löschen, in der DB erzwungen**: Trigger `trg_ausgabe_nur_storno` (`BEFORE UPDATE OR DELETE`) bricht ab bei `DELETE` und bei jedem `UPDATE`, das nicht genau den Übergang „nicht storniert → storniert“ ist oder andere Spalten ändert. `TRUNCATE` bleibt wie in ADR-0017 möglich (Tests, Betrieb).
10. **Eigene Audit-Tabelle `ausgabe_audit`** statt Verallgemeinerung von `benutzer_audit`:
    - Spalten `id` (GUID v7), `zeitpunkt` (`timestamptz`), `akteur_id` (FK `benutzer`, Pflicht), `ausgabe_id` (FK `ausgabe`, `RESTRICT`), `coin_id`, `exemplar_nummer`, `art` (`Erfasst` | `Storniert`), `grund` (≤ 500).
    - Check: `art = 'Storniert'` genau dann, wenn `grund` gesetzt ist.
    - **Keine Empfängerdaten** im Audit (Datenminimierung, Entscheidung F6). Wer was an wen ausgegeben hat, ergibt sich über `ausgabe_id`; Ausgaben werden nie gelöscht (Punkt 9). Weil der Storno-Grund Freitext ist, weist die Oberfläche am Feld darauf hin, keine Personendaten einzutragen.
    - Unveränderlich per Trigger `trg_ausgabe_audit_unveraenderlich` wie in ADR-0017. Der Eintrag entsteht in derselben Transaktion wie die Ausgabe bzw. das Storno.
    - Ein Lese-Endpunkt für dieses Audit gibt es nicht (Entscheidung F7). Erfasser und Stornierer sind in der Ausgabehistorie sichtbar.
11. **Aufbewahrung** (Entscheidung F10): Ausgaben samt Empfängerdaten und Audit-Einträge werden vorerst unbegrenzt aufbewahrt. Ein Löschkonzept folgt als eigenes Feature.

## Umsetzung (Ergänzungen und Abweichungen)
- **Auflage ändern** liegt in `AusgabeService.AuflageAendernAsync` (Domain-Regel `AuflageAenderung` in `Coin.Domain.Katalog`), nicht wie im Entwurf in `CoinKatalogService`, weil es dieselbe Coin-Sperre und die höchste je ausgegebene Nummer braucht wie Erfassen und Storno.
- **Index `ix_ausgabe_exemplar`** `(coin_id, exemplar_nummer)` auf `ausgabe` (nach dem QA-Review nachgetragen, in derselben Migration `20261008100432_Exemplare`): stützt den FK auf `exemplar` beim Löschen von Exemplaren und die Suche nach der höchsten je ausgegebenen Nummer (auch stornierte, die der partielle Index nicht enthält).
- **Befehls-Timeout 120 s** für das Erzeugen (`generate_series`) und Löschen von Exemplaren, nur für diesen Befehl (`AusgabeRepository.ExemplarBefehlTimeout`). Bei Auflagen bis 1.000.000 reicht das Standard-Timeout von Npgsql (30 s) nicht sicher. Die Migration selbst setzt kein Timeout.
- **Kennzahlen aus einer Abfrage**: Auflage, Zahl der Exemplare und Zahl der aktiven Ausgaben werden in einem Statement gelesen, damit sie zueinander passen; `verfuegbar` = Exemplare − aktive Ausgaben.
- Der Konfigurationsschlüssel `Include Error Detail` (Npgsql) darf nicht gesetzt werden: Er brächte Parameterwerte, also Empfängerdaten, in Fehlermeldungen und Logs. Tests in `KonfigurationsdateienTests` prüfen Konfigurationsdateien und Backend-Code.

## Betrachtete Optionen
| Thema | Option | Bewertung |
|---|---|---|
| Exemplare | nur Zahl, Exemplare implizit aus der Auflage | kein FK-Ziel für Ausgaben und künftige Zertifikate, Vorgabe verlangt erzeugte Exemplare, verworfen |
| | Tabelle mit GUID-Id | zusätzliche Id ohne fachlichen Nutzen; Migration bräuchte UUIDs in SQL |
| | Tabelle mit PK `(coin_id, nummer)` (gewählt) | natürlicher Schlüssel, Massenerzeugung per `generate_series` |
| Status | Spalte `status` am Exemplar | zweite Wahrheit neben der Ausgabe, muss bei Storno mitgepflegt werden, verworfen |
| | abgeleitet aus aktiver Ausgabe (gewählt) | konsistent per Konstruktion |
| Doppelte Ausgabe | nur Anwendungsprüfung | ausdrücklich ausgeschlossen |
| | partieller Unique-Index (gewählt) | wirkt für jede Verbindung, auch ohne Sperre |
| | Spalte `aktive_ausgabe_id` am Exemplar mit Unique | Zustand an zwei Stellen, verworfen |
| Nebenläufigkeit | `SERIALIZABLE` + Retry | korrekt, aber Retry-Logik und schwer testbare Abbrüche |
| | Advisory Lock je Coin | gleichwertig, aber Sperre an Konvention gebunden |
| | `FOR UPDATE` auf die Coin-Zeile (gewählt) | einfach, je Coin, sichtbar im Datenmodell |
| Untergrenze Auflage | höchste aktiv ausgegebene Nummer | stornierte Ausgaben verlören ihr Exemplar, verworfen (F4) |
| | höchste je ausgegebene Nummer (gewählt) | Historie bleibt vollständig |
| Audit | `benutzer_audit` verallgemeinern (FK nullable, neue `art`) | ändert Constraint und Bedeutung einer bestehenden Tabelle, `GET /api/audit` und Frontend müssten mitwachsen |
| | eigene Tabelle (gewählt) | ADR-0017 bleibt unverändert, Muster (Trigger, gleiche Transaktion) wird übernommen |
| | Empfängerdaten als Snapshot im Audit | dupliziert Personendaten in einer unbegrenzt aufbewahrten Tabelle, verworfen (F6) |

## Folgen
- Große Auflagen erzeugen viele Zeilen (bis 1.000.000 je Coin). `generate_series` schreibt sie in einem Statement; das Anlegen eines solchen Coins dauert spürbar länger. Vorgelagerte Proxys mit kürzerem Timeout (z. B. nginx mit 60 s) können eine solche Anfrage abbrechen, bevor das Befehls-Timeout von 120 s greift. Die Migration erzeugt die Exemplare aller bestehenden Coins in einem Statement; dafür ist ein Migrations-Timeout von mindestens 120 s einzuplanen.
- Ausgabe, Storno und Auflage-Änderung desselben Coins laufen nacheinander. Bei der erwarteten Nutzung unkritisch.
- Ausgaben und Audit-Einträge wachsen unbegrenzt, bis ein Löschkonzept kommt. Das Löschkonzept braucht dann einen Betriebsweg an beiden Triggern vorbei.
- Wer Eigentümerrechte an der DB hat, kann Trigger entfernen (wie ADR-0017).
- Künftige Zertifikate können auf `exemplar (coin_id, nummer)` verweisen.
