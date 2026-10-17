# ADR-0029: Audit der Zertifikat-Downloads in eigener Tabelle `zertifikat_audit`

Status: Angenommen, umgesetzt (Entscheidungen des Auftraggebers vom 2026-10-16, F2 und F9 in `docs/features/zertifikat-erzeugen.md`; Details unter „Umsetzung“) · Datum: 2026-10-16 · Feature: [zertifikat-erzeugen](../features/zertifikat-erzeugen.md) · Ergänzt: [ADR-0017](0017-audit-log-fuer-rollen-und-status.md), [ADR-0020](0020-exemplare-und-ausgaben-datenmodell.md) Punkt 10, [ADR-0023](0023-zertifikatsvorlagen-in-postgresql-mit-versionen.md), [ADR-0027](0027-coin-kennung-und-zertifikatsnummer.md)

## Kontext
Jeder Download eines Zertifikats wird festgehalten: wer, wann, Zertifikatsnummer. Das Zertifikat enthält Personendaten. Nach ADR-0027 Punkt 5 trägt eine Neuausgabe nach Storno dieselbe Zertifikatsnummer wie die stornierte Ausgabe; die Nummer allein ordnet einen Download also nicht eindeutig zu. Bestehende Audits: `benutzer_audit` (Rollen/Status, Lese-Endpunkt `GET /api/audit`), `ausgabe_audit` (Erfasst/Storniert, `art varchar(10)`, kein Lese-Endpunkt, F7), `vorlage_audit` (kein Lese-Endpunkt). Alle unveränderlich per Trigger, ohne Empfängerdaten.

## Entscheidung
1. **Eigene Tabelle `zertifikat_audit`**: `id` (GUID v7), `zeitpunkt` (`timestamptz`), `akteur_id` (FK `benutzer`, `RESTRICT`), `ausgabe_id` (FK `ausgabe`, `RESTRICT`, **Pflicht**), `coin_id`, `zertifikatsnummer` (`varchar(32)`), `vorlage_version` (`int NULL`, `NULL` = Standardvorlage), `art` (`varchar(15)`, Check `art = 'Heruntergeladen'`). Index auf `ausgabe_id`.
2. **Zuordnung über `ausgabe_id`**: Jeder Eintrag führt neben der Nummer immer die `ausgabe_id`; nur sie unterscheidet Downloads der stornierten Ausgabe von denen der Neuausgabe desselben Exemplars (F2).
3. **Unveränderlich** per Trigger `trg_zertifikat_audit_unveraenderlich` (kein `UPDATE`, kein `DELETE`; `TRUNCATE` bleibt wie in ADR-0017).
4. **Nur erfolgreiche Downloads**: Der Eintrag entsteht nach erfolgreicher Erzeugung und vor dem Senden der Antwort, atomar mit der Storno-Prüfung (`INSERT … SELECT … FROM ausgabe WHERE id = @id AND storniert_am IS NULL`). Null eingefügte Zeilen → `409 ausgabe_storniert`, keine Datei. Abgelehnte Requests (`401`, `403`, `404`, `409`, `500`) schreiben nichts; sie stehen im Request-Protokoll (ADR-0019).
5. **Keine Empfängerdaten**, keine Dateiinhalte, keine Dateinamen (Datenminimierung wie ADR-0020 Punkt 10).
6. **Kein Lese-Endpunkt** (F9, wie F7 aus coin-ausgaben und zertifikatsvorlagen). Auswertung per SQL durch den Betrieb.
7. **Aufbewahrung** unbegrenzt bis zum Löschkonzept (wie ADR-0017, ADR-0020 Punkt 11).

## Betrachtete Optionen
| Option | Bewertung |
|---|---|
| `ausgabe_audit` erweitern (neue `art`, Spalten `zertifikatsnummer`, `vorlage_version`) | ändert Check und Spaltenbreite einer bestehenden Tabelle; Downloads sind Lesezugriffe, keine Änderungen der Ausgabe, und häufiger; vermischt zwei Zwecke, verworfen |
| `benutzer_audit` verallgemeinern | wie in ADR-0020 verworfen; `GET /api/audit` und Frontend müssten mitwachsen |
| **eigene Tabelle (gewählt)** | bestehende Tabellen bleiben unverändert, Muster (Trigger, FK, keine Personendaten) übernommen; offen für künftige Arten (z. B. Signieren) |
| nur Zertifikatsnummer ohne `ausgabe_id` | nach F2 nicht eindeutig, verworfen |
| nur Request-Protokoll | enthält weder Akteur noch Zertifikatsnummer (ADR-0019), verworfen |

## Folgen
- Ein Download, dessen Übertragung danach abbricht, steht trotzdem im Audit (protokolliert wird die ausgelieferte Erzeugung).
- Auswertungen „Downloads zu Nummer X“ liefern bei Neuausgaben Einträge mehrerer Ausgaben; getrennt wird über `ausgabe_id`.
- Das Löschkonzept muss auch diesen Trigger umgehen können.
- Integrationstests leeren die Tabelle per `TRUNCATE … CASCADE`; die Liste in der Testbasis wird ergänzt.

## Umsetzung
- Tabelle, Trigger `trg_zertifikat_audit_unveraenderlich` (Funktion `zertifikat_audit_unveraenderlich()`) und Index `ix_zertifikat_audit_ausgabe` entstehen in der Migration `20261017001806_Zertifikatsnummern`; dazu kommt der Fremdschlüssel-Index `ix_zertifikat_audit_akteur_id`.
- Der Insert (`ZertifikatRepository.AuditSchreibenAsync`) übernimmt `coin_id` und `zertifikatsnummer` aus der Zeile in `ausgabe` und verlangt `id`, `coin_id` und `storniert_am IS NULL` in derselben Anweisung; null Zeilen → `409 ausgabe_storniert`.
- Auswertung per SQL, z. B. `SELECT zeitpunkt, akteur_id, ausgabe_id, vorlage_version FROM zertifikat_audit WHERE zertifikatsnummer = 'C0042-0012' ORDER BY zeitpunkt;` – bei Neuausgaben nach `ausgabe_id` unterscheiden.
