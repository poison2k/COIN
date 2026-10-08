# ADR-0017: Audit-Log für Rollen und Status, unveränderlich in PostgreSQL

Status: Angenommen (umgesetzt; Aufbewahrung vom Auftraggeber am 2026-10-05 entschieden; Request-Protokoll am 2026-10-06 ergänzt durch ADR-0019) · Datum: 2026-10-05 · Feature: rollen-benutzerverwaltung

## Kontext
`docs/requirements.md` verlangt nachvollziehbare Änderungen (Audit-Log). Laut Vorgabe wird jede Änderung an Rollen und Status festgehalten: wer, wann, welcher Benutzer, alter und neuer Wert. Audit-Einträge sind unveränderlich, und nur Administratoren lesen sie. Die Einträge enthalten Personenbezug, weil sie auf Benutzer verweisen.

## Entscheidung
1. **Tabelle `benutzer_audit`** mit den Spalten `id` (GUID v7), `zeitpunkt` (`timestamptz`, UTC, Mikrosekunden), `akteur_id` (FK `benutzer`, nullable: `NULL` = System/Bootstrap), `benutzer_id` (FK `benutzer`), `art` (`Rolle` | `Status`), `alt` und `neu`.
   - Werte bei Rolle: `Administrator`, `Sachbearbeiter`, `Betrachter`, `keine`. Werte bei Status: `aktiv`, `deaktiviert`.
   - Ein Check-Constraint erzwingt gültige Kombinationen und `alt <> neu`.
   - Gespeichert werden nur Ids, keine Namen und keine E-Mails. Namen kommen beim Lesen per Join aus `benutzer`. Benutzer werden nie gelöscht, die FKs sind `ON DELETE RESTRICT`.
2. **Gleiche Transaktion**: Die Änderung an `benutzer` und der Audit-Eintrag werden in derselben Transaktion geschrieben. Ohne Eintrag gibt es keine Änderung. Eine Änderung ohne Wirkung (gleicher Wert) erzeugt keinen Eintrag.
3. **Bootstrap**: Vergibt der Bootstrap beim Anlegen die Rolle Administrator, entsteht im selben SQL-Statement ein Eintrag `Rolle: keine → Administrator` mit `akteur_id = NULL` (CTE um das bestehende Upsert, nur bei tatsächlicher Neuanlage). Damit ist auch der erste Administrator nachvollziehbar.
4. **Unveränderlich**:
   - Im Code: Das Repository bietet nur `INSERT` und `SELECT`. Es gibt keine EF-Entität mit Tracking für Updates und keinen API-Pfad zum Ändern oder Löschen.
   - In der DB: Der Trigger `trg_benutzer_audit_unveraenderlich` (`BEFORE UPDATE OR DELETE … FOR EACH ROW`) bricht mit einer Exception ab.
   - `TRUNCATE` wird bewusst nicht blockiert. Es braucht Tabelleneigentümer-Rechte und ist eine Betriebs- und Testoperation (Integrationstests leeren die DB mit `TRUNCATE … CASCADE`).
5. **Lesen** nur mit Berechtigung `audit.read` (ADR-0016), mit `Cache-Control: no-store`. Inhalte des Audits werden nicht geloggt.
   - Logs enthalten auch sonst keine Namen und E-Mails. Weil die Hosting-Diagnose (`Microsoft.AspNetCore.Hosting.Diagnostics`) jede Request-URL samt Query-String loggt (z. B. `GET /api/benutzer?suche=<Name oder E-Mail>`), wird diese Kategorie fest erst ab `Warning` und ohne Scope geschrieben (`src/Coin.Api/Http/Protokollierung.cs`). Seit Rev. 3 erzwingt das ein Wrapper um die `ILoggerFactory` unabhängig von jeder Konfiguration, zusammen mit drei weiteren Framework-Kategorien, die Request-Daten loggen (Liste und Begründung in ADR-0019 Punkt 5); Filterregeln je Empfänger sind die zweite Linie.
   - Methode, Route, Status und Dauer je Request protokolliert stattdessen die eigene Middleware `AnfrageProtokoll` mit fester Feldauswahl ohne Query, Pfadwerte, Header oder Body (ADR-0019).
   - Der Query-Parameter `suche` wird außerdem nicht über MVC-Argument-Logs ausgegeben (`BenutzerListeAnfrage.ToString()` ohne Werte).
6. **Aufbewahrung** (Entscheidung des Auftraggebers vom 2026-10-05): Audit-Einträge werden vorerst unbegrenzt aufbewahrt. Ein Löschkonzept folgt als eigenes späteres Feature. Es braucht dann einen privilegierten Betriebsweg am Trigger vorbei.

## Betrachtete Optionen
| Thema | Option | Bewertung |
|---|---|---|
| Speicherort | eigene Tabelle in PostgreSQL (gewählt) | transaktional mit der Änderung, einfach abzufragen |
| | Log-Datei / strukturiertes Logging | nicht transaktional, Personendaten in Logs, verworfen |
| | Event Sourcing für Benutzer | für zwei Änderungsarten zu groß |
| Unveränderlichkeit | nur im Code | eine Fehlbedienung per SQL bliebe unbemerkt |
| | Trigger (gewählt) | wirkt für jede Verbindung, auch für die Anwendung selbst |
| | eigene DB-Rolle ohne UPDATE/DELETE-Recht | stärker, setzt aber ein Betriebskonzept mit getrennten Rollen für Migration und Laufzeit voraus (Betrieb offen, `docs/requirements.md`); später ergänzbar |
| | Hash-Kette über Einträge | erkennt Manipulation durch DB-Admins, Aufwand ohne geklärte Schutzstufe nicht gerechtfertigt |
| Namen | Snapshot im Eintrag | dupliziert Personendaten, verworfen |

## Folgen
- Wer Eigentümerrechte an der DB hat, kann den Trigger entfernen. Das ist nur bei Betrieb mit getrennten DB-Rollen auszuschließen und als Betriebsthema vermerkt.
- Die Tabelle wächst unbegrenzt, bis das Löschkonzept umgesetzt ist. Bei zwei seltenen Änderungsarten ist das unkritisch.
- Spätere Audit-Arten bekommen eigene Werte für `art` per Migration oder eine eigene Tabelle. Ausgaben haben die eigene Tabelle `ausgabe_audit` mit demselben Muster erhalten ([ADR-0020](0020-exemplare-und-ausgaben-datenmodell.md)); `benutzer_audit` bleibt unverändert.
- Durch den Logfilter fehlen die Request-Start/Ende-Einträge der Hosting-Diagnose. Methode, Route, Status und Dauer liefert stattdessen das Request-Protokoll nach ADR-0019; `HttpLogging` wurde dafür geprüft und verworfen (Begründung dort).
