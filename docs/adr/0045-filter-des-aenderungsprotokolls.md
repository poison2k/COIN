# ADR-0045: Filter des Änderungsprotokolls (Audit-Log) nach Zeitraum, Aktion und Benutzer

Status: Angenommen (Entscheidungen des Auftraggebers vom 2026-11-16, nacharbeiten-audit-filter F1, F2) · Datum: 2026-11-16 · Feature: [nacharbeiten-audit-filter](../features/nacharbeiten-audit-filter.md) · Ergänzt: [ADR-0017](0017-audit-log-fuer-rollen-und-status.md), [ADR-0042](0042-detailseiten-mit-reitern.md) (Reiter in der URL) · Ändert: startseite-listen-pruefung 4.4/AK-29 („Filter nicht in der URL“)

## Kontext
Das Audit-Log der Rollen- und Statusänderungen (`benutzer_audit`, ADR-0017) filtert bisher nur nach dem geänderten Benutzer (`benutzerId`). Ein Filter im Browser sähe nur die geladene Seite (25 Einträge) und wurde deshalb verworfen (startseite-listen-pruefung F5). Gefordert sind jetzt:
- ein serverseitiger Filter nach Zeitraum (ganze Tage, Europe/Berlin, auch an Tagen mit Zeitumstellung);
- ein Filter nach Aktion (Mehrfachauswahl aus den bestehenden Aktionstypen);
- der Benutzerfilter, kombinierbar mit beiden;
- die Filter in der Adresszeile.
In der Oberfläche heißt das Audit-Log künftig „Änderungsprotokoll“.

## Entscheidung
1. **Query-Parameter an `GET /api/audit`:** `von` und `bis` als Kalendertag `JJJJ-MM-TT` (2000–2999), `aktion` mehrfach (Name aus `AuditArt`, Groß-/Kleinschreibung zählt), dazu `benutzerId`. Alle sind optional. Verschiedene Filter gelten per UND, mehrere `aktion` per ODER. Ohne Filter bleibt das Verhalten unverändert.
2. **Tagesgrenzen in der Domain:** `von` wird zu „00:00 Europe/Berlin in UTC“ (inklusive), `bis` zu „00:00 des Folgetags in UTC“ (exklusiv). Das deckt 23- und 25-Stunden-Tage ab. Die Regeln prüft nur der Server und liefert `400` mit deutschen Meldungen, die keine Eingabewerte wiederholen:
   - gültiges Datum;
   - `von` ≤ `bis`;
   - höchstens 366 Tage, wenn beide angegeben sind;
   - bekannte Aktion.
   Die Prüfung liegt in der Domain wie `Seitenabfrage`, der Controller enthält keine Logik.
3. **Aktionsliste per API:** `GET /api/audit/aktionen` (Policy `audit.read`) liefert `[{ wert, bezeichnung }]` aus dem Enum. Das Frontend kodiert die Liste nicht selbst. Ein eigener Endpunkt bleibt bei einer festen Liste einfacher als ein Zusatzfeld im Seitenformat `{eintraege, gesamt, seite, groesse}`.
4. **Filter in der URL von `/benutzerverwaltung`:**
   - Parameter `reiter=aenderungsprotokoll`, `von`, `bis`, `aktion` (kommagetrennt), `benutzer` (GUID) und `seite`;
   - Filteränderungen und Blättern legen einen neuen Eintrag im Verlauf an (`push`), der Reiterwechsel nutzt `replace` (wie ADR-0042);
   - der Name des Benutzers steht nie in der URL, nur die GUID (Pseudonym, nur für Administratoren auflösbar; entschieden 2026-11-16, F1). Der Name im Chip kommt aus den geladenen Einträgen, ohne Treffer „Benutzer: unbekannt“;
   - Storage bleibt frei von Filtern (ADR-0044 Punkt 4).
5. **Abfrage nur parametrisiert:** Die Filter laufen als LINQ-Ausdrücke (`>=`, `<`, `Contains` auf einer Stringliste, `==` auf der GUID). Im Lesepfad gibt es kein `FromSql*`/`ExecuteSql*`, keinen Freitext und keine Suche in `alt`/`neu`. Die Endpunkte lesen nur.
6. **Index:** zunächst kein neuer Index. `ix_benutzer_audit_zeitpunkt (zeitpunkt DESC, id DESC)` trägt Zeitraum und Sortierung, `ix_benutzer_audit_benutzer` den Benutzerfilter. Ein Index auf `art` (zwei Werte) trennt kaum. Liegt der Median der Messung mit 6.000 Einträgen über 100 ms, folgt `ix_benutzer_audit_art_zeitpunkt (art, zeitpunkt DESC, id DESC)` per Migration. Die Messergebnisse werden hier nachgetragen.

## Betrachtete Alternativen
- **Filter im Browser über die geladene Seite:** Das Ergebnis wäre unvollständig. Verworfen (wie startseite-listen-pruefung F5).
- **`von`/`bis` als Zeitstempel mit Uhrzeit oder UTC-Tage:** Die Tagesgrenzen lägen dann je nach Zeitzone des Aufrufers falsch, und es gäbe Abweichungen an Umstellungstagen. Verworfen. Die Umrechnung gehört in die Domain.
- **`DateOnly`-Model-Binding:** Es liefert englische Standardmeldungen und ist beim Format nachsichtig. Verworfen.
- **Aktionsliste im Frontend fest kodiert:** Sie wäre doppelt gepflegt. Verworfen (Auftrag).
- **Benutzername in der URL:** Er wäre ein Personendatum in Verlauf, Lesezeichen und Proxy-Logs. Verworfen.
- **Benutzerfilter nur im Zustand:** Er ginge nach dem Neuladen verloren und widerspräche dem Auftrag. Verworfen (F1).
- **Index auf `art` sofort:** Ohne Messung nicht begründet. Zurückgestellt.

## Folgen
- `docs/berechtigungen.md` (Endpunkttabelle) und `docs/api.md` beschreiben den neuen Endpunkt und die Parameter.
- Weitere Filter (z. B. „Geändert von“) folgen demselben Muster: typisierte Parameter, Prüfung in der Domain, URL ohne Namen.
- Die 366-Tage-Grenze ist fachlich. Ohne Zeitraum bleibt das Protokoll vollständig seitenweise lesbar.

## Nachtrag (2026-11-16): Messung und Index
Messung mit `tests/Coin.IntegrationTests/Audit/AuditFilterMessungTests.cs`: eigene Datenbank, 20 Benutzer,
6.000 Einträge, über HTTP mit Administrator-Token, je Anfrage 3 Aufwärm- und 20 Messläufe.

| Abfrage | Median | p95 | `gesamt` |
|---|---|---|---|
| ohne Filter | 12,3 ms | 17,7 ms | 6001 |
| Zeitraum 30 Tage | 11,0 ms | 15,3 ms | 246 |
| Zeitraum 366 Tage | 11,3 ms | 15,9 ms | 3008 |
| `aktion=Status` | 11,4 ms | 16,2 ms | 3000 |
| 90 Tage + `aktion=Rolle` + `benutzerId` | 10,7 ms | 14,7 ms | 19 |

Der Plan der Kombination nutzt `ix_benutzer_audit_benutzer` (Bitmap Index Scan). Der Zeitraum über
366 Tage läuft als Seq Scan mit etwa 0,5 ms. Alle Mediane liegen weit unter der Schwelle von 100 ms.
**Ergebnis:** kein neuer Index, keine Migration; Punkt 6 bleibt ohne `ix_benutzer_audit_art_zeitpunkt`.
Die Messwerte gelten für die Testumgebung (Testcontainer) und sind keine Zusage für den Betrieb.

Umgesetzt liegen `Berlin` (mit `TagesbeginnUtc`) in `Coin.Domain.Gemeinsam` und `AuditFilter` sowie
`AuditFilterPruefung` in `Coin.Domain.Benutzer`.
