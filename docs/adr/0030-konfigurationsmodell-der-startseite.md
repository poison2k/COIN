# ADR-0030: Konfigurationsmodell der Startseite – eine typisierte Zeile, Speichern als Ganzes, Versionsprüfung, Audit je Änderung

Status: Angenommen (Entscheidungen des Auftraggebers vom 2026-10-26, S6–S8 in [startseite](../features/startseite.md) Abschnitt 12, wie empfohlen) · Datum: 2026-10-19 · Feature: [startseite](../features/startseite.md) · Ergänzt: [ADR-0005](0005-motivbild-in-postgresql.md), [ADR-0006](0006-bild-upload-als-eigener-endpunkt.md), [ADR-0017](0017-audit-log-fuer-rollen-und-status.md), [ADR-0023](0023-zertifikatsvorlagen-in-postgresql-mit-versionen.md)

## Kontext
Administratoren pflegen die Startseite in der Anwendung: fünf feste Blöcke (Kopfbereich, Infotext, Kennzahlen, Neueste Coins, Meistausgegebene Coins), je Block an oder aus, Reihenfolge, Texte, Anzahl und zwei Logos mit Pflicht-Alternativtext. Ohne gespeicherte Konfiguration gilt eine Standardstartseite. Vor dem Speichern zeigt eine Vorschau das Ergebnis. Jede Änderung kommt ins Audit (bei Texten nur „geändert“). Kein freier Layout-Editor, keine Entwürfe, keine Startseiten je Rolle. CORS erlaubt nur `GET`, `POST`, `PUT` (ADR-0023 Punkt 6).

## Entscheidung
1. **Eine Zeile mit typisierten Spalten** in `startseite_konfiguration` (`id = 1` per Check), keine JSON-Spalte und keine Blocktabelle. Jeder Block hat eigene Spalten (`*_aktiv`, Texte, Anzahl); die Reihenfolge steht in `reihenfolge varchar(20)[]` mit dem Check „genau die fünf Blockarten“. Grenzen (Längen, Anzahl 3–12 bzw. 3–10) prüft die Domain und zusätzlich die DB per Check.
2. **Standard aus dem Code.** Fehlt die Zeile, liefert die Domain die Standardkonfiguration (`StartseiteKonfiguration.Standard`); sie wird nicht in die DB geschrieben. Das erste Speichern legt die Zeile mit `version = 1` an.
3. **Logos in eigener Tabelle `startseite_logo`** (PK `platz` ∈ `bereitsteller`, `software`) als `bytea` wie das Motivbild (ADR-0005), mit Format, Größe, Breite, Höhe, SHA-256, Alternativtext, Zeitpunkt und Hochladendem. Keine Versionen: Ersetzen überschreibt, Entfernen löscht die Zeile. Originalname und deklarierter Content-Type werden nicht gespeichert. `hochgeladen_von` erscheint in keinem öffentlichen DTO (ADR-0032).
4. **Speichern als Ganzes in einem Request**: `PUT /api/startseite/konfiguration` als `multipart/form-data` mit dem Teil `konfiguration` (JSON, vollständige Konfiguration) und optional den Dateiteilen `logoBereitsteller` und `logoSoftware`. Konfiguration, Logos und Audit werden in **einer Transaktion** geschrieben. Ein Logo wird durch `null` in der Konfiguration ohne Dateiteil entfernt. Der Multipart-Leser aus ADR-0006 wird zu einem Formularleser mit festen Teilen und Grenzen je Teil verallgemeinert (Request höchstens 6 MiB, Logo höchstens 2 MiB, JSON-Teil höchstens 64 KiB).
5. **Versionsprüfung statt „letzter gewinnt“**: Die Konfiguration trägt `version`, der Request nennt die geladene Version. Weicht sie ab, antwortet die API `409 startseite_geaendert`. Die Prüfung läuft unter `SELECT … FOR UPDATE` (fehlt die Zeile, über den Primärschlüssel beim `INSERT`). Ein Speichern ohne Änderung erzeugt keine neue Version und kein Audit.
6. **Vorschau rein clientseitig**: Die Konfigurationsseite rendert dieselbe Komponente wie die Startseite mit dem Formularzustand. Neue Logos zeigt sie über Object-URLs der ausgewählten Dateien. Die Daten für Kennzahlen und Ranglisten liefert `GET /api/startseite/konfiguration` in Höchstanzahl (12 bzw. 10); die Vorschau kürzt sie auf die eingestellte Anzahl. Es gibt keinen serverseitigen Entwurf.
7. **Audit `startseite_audit`** (Muster `vorlage_audit`): je Änderung eine Zeile (`id`, `zeitpunkt`, `akteur_id`, `version`, `art`, `ziel`, `alt`, `neu`), in derselben Transaktion, unveränderlich per Trigger. Bei Texten und Alternativtexten wird nur die Art festgehalten (`TitelGeaendert`, `UntertitelGeaendert`, `InfotextGeaendert`, `AlternativtextGeaendert`), nie der Inhalt; bei Logos steht der SHA-256 in `alt`/`neu`. Die Änderungen ermittelt die Domain als Unterschied zwischen alter (oder Standard-) und neuer Konfiguration. Kein Lese-Endpunkt; Auswertung per SQL (wie F7/F9 früherer Features). Aufbewahrung unbegrenzt bis zum Löschkonzept.
8. **Kein Server-Cache** für Kennzahlen und Ranglisten. Die Abfragen aggregieren in der DB über kleine Mengen bzw. Indizes (Feature Abschnitt 6). Die Antworten tragen `Cache-Control: no-store`. So sehen Benutzer jede Änderung beim nächsten Laden, auch bei mehreren API-Instanzen. Das Caching der Logos regelt ADR-0032 Punkt 3.

## Betrachtete Optionen
| Thema | Option | Bewertung |
|---|---|---|
| Speicherform | JSON-Dokument (`jsonb`) mit Schemaversion | flexibel, aber jeder Block braucht ohnehin Code; Grenzen nicht per DB-Check, Schemaentwicklung im Code, Diff über Dokumentpfade, verworfen |
| | Blocktabelle (eine Zeile je Block) | Eindeutigkeit der Reihenfolge beim Tauschen schwierig, viele leere Spalten oder doch JSON, Speichern = mehrere Zeilen, verworfen |
| | **eine Zeile mit typisierten Spalten (gewählt)** | einfach, DB-Checks, ein `UPDATE`, Diff trivial; ein neuer Blocktyp braucht eine Migration (Code ist ohnehin nötig) |
| Logos | in der Konfigurationszeile | jedes Speichern schriebe bis 4 MiB, verworfen |
| | Versionen wie bei den Zertifikatsvorlagen | Wiederherstellen ist nicht verlangt; unbegrenztes Wachstum, verworfen |
| | **eigene Tabelle, eine Zeile je Platz (gewählt)** | klein, nichts verwaist |
| Speichern | Logos über eigene Endpunkte sofort wirksam, Konfiguration per JSON | Logo wäre vor „Speichern“ öffentlich, Vorschau vor dem Speichern unmöglich, Teilerfolge, verworfen |
| | Logos vorab als Entwurf hochladen, beim Speichern referenzieren | verwaiste Entwürfe, Aufräumregel nötig, verworfen |
| | **alles in einem Multipart-Request (gewählt)** | atomar, ein Audit-Vorgang, Vorschau ohne Serverzustand; Preis: Formularleser mit mehreren Teilen |
| Gleichzeitigkeit | letzter gewinnt (wie ADR-0025) | eine zweite Administratorin überschriebe unbemerkt Logos und Texte, verworfen |
| | **Versionsprüfung mit `409` (gewählt)** | billig, klare Meldung |
| Cache | `IMemoryCache` kurz, ungültig bei Änderungen an Coins, Ausgaben und Konfiguration | Eingriffe in mehrere Services, wirkt nur je Prozess; ohne Messbedarf, verworfen (hinter dem Repository nachrüstbar) |
| | **kein Cache, `no-store` (gewählt)** | immer aktuell |

## Folgen
- Neue Blöcke oder Einstellungen brauchen eine Migration und eine Erweiterung des Diffs; das ist gewollt (keine freien Layouts).
- Der Formularleser ist neuer, sicherheitsrelevanter Code mit eigenen Integrationstests (Teilgrenzen, unbekannte und doppelte Teile, abgeschnittene Formulare, chunked).
- Ein abgelehntes Logo verwirft das ganze Speichern; die Oberfläche behält alle Eingaben.
- Die DB wächst höchstens um zwei Logos (je 2 MiB). Das Audit wird unbegrenzt aufbewahrt bis zum Löschkonzept (wie ADR-0017).
- Wer Eigentümerrechte an der DB hat, kann den Audit-Trigger entfernen (wie ADR-0017).
