# ADR-0023: Zertifikatsvorlagen in PostgreSQL, unveränderliche Versionen, Zeiger auf die aktive Version, eigenes Audit

Status: Angenommen, umgesetzt (Entscheidungen des Auftraggebers vom 2026-10-09, F6, F7, F10, F11 in `docs/features/zertifikatsvorlagen.md`) · Datum: 2026-10-09 · Feature: [zertifikatsvorlagen](../features/zertifikatsvorlagen.md) · Ergänzt: [ADR-0005](0005-motivbild-in-postgresql.md), [ADR-0017](0017-audit-log-fuer-rollen-und-status.md), [ADR-0020](0020-exemplare-und-ausgaben-datenmodell.md)

## Kontext
Pro Coin ist eine Vorlage aktiv. Frühere Versionen bleiben mit Version, Hochladendem und Zeitpunkt gespeichert. Coins ohne eigene Vorlage nutzen die Standardvorlage; Zurücksetzen auf die Standardvorlage muss möglich sein. Hochladen, Ersetzen und Zurücksetzen kommen ins Audit-Log. Dateien bis 5 MiB, nicht vertrauenswürdig; sie werden nie unter dem Originalnamen gespeichert. Personenbezogene Dokumenteigenschaften werden beim Upload entfernt (F10). Der Betriebsort ist offen (`docs/requirements.md`).

## Entscheidung
1. **Speicherort PostgreSQL (`bytea`)** wie beim Motivbild (ADR-0005), Tabelle `zertifikat_vorlage`: `id` (GUID v7), `coin_id` (FK `coin_typ`, `RESTRICT`), `version` (≥ 1, eindeutig je Coin), `inhalt`, `groesse_bytes` (1–5.242.880), `sha256`, `hochgeladen_am`, `hochgeladen_von` (FK `benutzer`, `RESTRICT`). Gespeichert wird **nur die bereinigte Fassung** (ADR-0024 Punkt 3); `groesse_bytes` und `sha256` beziehen sich auf sie. Die Originaldatei, ihr Name und ihr deklarierter Content-Type werden nicht gespeichert. Kein Dateisystem.
2. **Versionen sind unveränderlich**: Trigger `trg_zertifikat_vorlage_unveraenderlich` verhindert `UPDATE` und `DELETE` (Muster ADR-0017). `TRUNCATE` bleibt für Tests und Betrieb möglich.
3. **Aktive Version als Zeiger am Coin**: Spalte `coin_typ.aktive_vorlage_version` (`int NULL`) mit zusammengesetztem FK `(id, aktive_vorlage_version)` → `zertifikat_vorlage (coin_id, version)`. `NULL` bedeutet Standardvorlage (FK nach `MATCH SIMPLE` nicht geprüft). So zeigt ein Coin nie auf die Version eines anderen Coins.
4. **Upload** = neue Version `max(version) + 1` (ab 1) und Zeiger darauf, in einer Transaktion, die zuerst die Coin-Zeile sperrt (`FOR UPDATE`, wie ADR-0020 Punkt 6). Der eindeutige Index `(coin_id, version)` ist die harte Grenze. Prüfung, Bereinigung und Nachprüfung (ADR-0024) laufen vorher ohne Sperre.
5. **Zurücksetzen** setzt den Zeiger auf `NULL`; es entsteht keine Version. Nummern werden nie wiederverwendet. Ist schon die Standardvorlage aktiv, passiert nichts (kein Audit). Frühere Versionen lassen sich nur herunterladen, nicht wieder aktivieren (F6).
6. **Endpunkt `POST …/zertifikatsvorlage/zuruecksetzen` ohne Body**: Er hat kein `[Inhaltstyp]`, weil kein Inhalt erwartet wird; ein mitgesendeter Body wird nicht gelesen. `DELETE` wurde nicht gewählt, weil nichts gelöscht wird und CORS nur `GET`, `POST`, `PUT` erlaubt. Ein Zeiger-Endpunkt `PUT …/aktiv` mit `{ "version": … }` hätte das ausgeschlossene Reaktivieren (F6) nahegelegt.
7. **Eigene Audit-Tabelle `vorlage_audit`** (Muster `ausgabe_audit`, ADR-0020 Punkt 10): `id`, `zeitpunkt`, `akteur_id` (Pflicht), `coin_id`, `art` (`Hochgeladen` | `Ersetzt` | `Zurueckgesetzt`), `version`, `vorherige_version`; Check-Constraint für die gültigen Kombinationen; unveränderlich per Trigger; geschrieben in derselben Transaktion. „Ersetzt“ heißt: Beim Upload war bereits eine eigene Version aktiv. Kein Lese-Endpunkt (F7). Keine Dateiinhalte, Dateinamen, Metadaten oder Platzhaltertexte.
8. **Lesen**: Status- und Listenabfragen lesen nie `inhalt`; die Bytes liefern nur die Download-Endpunkte, immer die gespeicherte (bereinigte) Fassung. Das öffentliche Coin-DTO bleibt unverändert (keine Vorlageninformation öffentlich).
9. **Standardvorlage** wird nicht gespeichert, sondern bei Bedarf erzeugt (ADR-0022) und je Prozess im Speicher gehalten.
10. **Aufbewahrung**: Versionen und Audit vorerst unbegrenzt (F11), Löschkonzept als eigenes Feature.

## Betrachtete Optionen
| Thema | Option | Bewertung |
|---|---|---|
| Speicherort | **PostgreSQL `bytea` (gewählt)** | transaktional mit Version, Zeiger und Audit; keine Pfade aus Benutzereingaben; Backup inklusive; kein Betriebsort vorentschieden |
| | Dateisystem mit generiertem Namen | zweiter Speicher außerhalb der Transaktion, verwaiste Dateien, Rechte und Backup separat, Betriebsort offen |
| | Blob-Speicher (S3-kompatibel) | zusätzliche Infrastruktur; später hinter dem Repository möglich (wie ADR-0005) |
| Was gespeichert wird | Original und bereinigte Fassung | hielte die Personendaten, die F10 entfernen will, verworfen |
| | **nur bereinigte Fassung (gewählt)** | Datenminimierung; Download und spätere Zertifikate nutzen dieselbe Datei |
| Aktive Vorlage | **Zeiger am Coin (gewählt)** | eine Wahrheit, Versionen bleiben unveränderlich, FK verhindert fremde Versionen |
| | Spalte `aktiv` je Version mit partiellem Unique-Index | Versionen müssten änderbar sein (Trigger-Ausnahme), zwei Updates je Upload |
| | eigene Zuordnungstabelle | zusätzliche Tabelle ohne Mehrwert |
| Zurücksetzen | **Zeiger `NULL` (gewählt)** | keine Scheinversion, „Standard“ bleibt eindeutig |
| | neue Version mit Kopie der Standardvorlage | vermischt erzeugte und hochgeladene Dateien, Standard würde eingefroren |
| Audit | **eigene Tabelle (gewählt)** | bestehende Audits bleiben unverändert (wie ADR-0020) |
| | nur die Versionstabelle als Audit | Zurücksetzen und „Ersetzt“ wären nicht nachvollziehbar |

## Folgen
- Die DB wächst um bis zu 5 MiB je Version; bei unbegrenzter Aufbewahrung ist das ein Betriebsthema (Monitoring, Löschkonzept).
- Uploads desselben Coins laufen nacheinander und blockieren auch Erfassen/Storno/Auflage dieses Coins kurz (gleiche Sperre). Prüfung und Bereinigung liegen außerhalb der Sperre, die Sperrdauer bleibt kurz.
- Hochladende erhalten beim Download nicht ihre Originaldatei zurück, sondern die bereinigte Fassung; das steht in der Anwenderdoku.
- Wer Eigentümerrechte an der DB hat, kann die Trigger entfernen (wie ADR-0017).
- Das spätere Feature „Zertifikate erzeugen“ liest die aktive Version über den Zeiger und kann im Zertifikat die verwendete Version festhalten.
