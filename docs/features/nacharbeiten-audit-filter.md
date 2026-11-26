# Feature: Nacharbeiten Design und Filter im Änderungsprotokoll

Status: Umgesetzt (2026-11-16; Entscheidungen des Auftraggebers in Abschnitt 12, Abweichungen und Messung in Abschnitt 14) · Datum: 2026-11-16 · Branch: `feature/nacharbeiten-audit-filter` · ADRs: [0045](../adr/0045-filter-des-aenderungsprotokolls.md) (neu, Filter nach Zeitraum, Aktion und Benutzer, Filter in der URL), [0046](../adr/0046-katalogtabelle-als-datentabelle.md) (neu, Katalogtabelle auf `DatenTabelle`, ändert ADR-0041 Punkt 8), [0047](../adr/0047-aktionsmeldungen-und-fokus-nach-erneut-versuchen.md) (neu, Aktionsmeldungen und Fokus nach „Erneut versuchen“). Grundlage: [startseite-listen-pruefung](startseite-listen-pruefung.md) Abschnitt 14, [rollen-benutzerverwaltung](rollen-benutzerverwaltung.md), [design-fundament](design-fundament.md), [formulare-detailseiten](formulare-detailseiten.md)

## 1. Ziel
Dieser Lauf arbeitet die offenen Punkte aus der Umgestaltung ab (startseite-listen-pruefung Abschnitt 14). Das Audit-Log heißt in der Oberfläche künftig „Änderungsprotokoll“. Es lässt sich nach Zeitraum, Aktion und Benutzer filtern. Dafür bekommt `GET /api/audit` optionale Filter, dazu kommt ein Endpunkt für die Liste der Aktionen. Sonst ändert sich fachlich nichts.

**Nicht dazu:** neue Fachfunktionen, Export, Volltextsuche, Filter „Geändert von“ (Ausführender), Änderungen an Berechtigungen oder Rechtematrix, weitere Gestaltungsänderungen. Auffälligkeiten nennt der Bericht nur.

**Begriff:** In der Oberfläche und in der Fachdoku heißt es „Änderungsprotokoll“. Im Code (Typen, Dateien, Routen, Policies `audit.read`, Tabelle `benutzer_audit`) und in den ADRs bleibt „Audit-Log“ bzw. „Audit“.

## 2. Ist-Stand (geprüft im Code)
| Bereich | Ist | Folge |
|---|---|---|
| API `AuditController` | `GET /api/audit?benutzerId&seite&groesse`, Policy `audit.read`, `[KeinCache]`. `BenutzerverwaltungService.AuditLesenAsync` prüft nur Seite und Größe | Filter `von`, `bis`, `aktion` ergänzen (4.1) |
| Repository | `BenutzerverwaltungRepository.AuditSeiteAsync`: LINQ, `Where(BenutzerId)`, `CountAsync`, `OrderByDescending(Zeitpunkt).ThenByDescending(Id)`, `Skip/Take`, Namen per Join | Filter als LINQ-Ausdrücke (parametrisiert) |
| Tabelle `benutzer_audit` | Spalten `id`, `zeitpunkt` (timestamptz), `akteur_id`, `benutzer_id`, `art` (varchar 10), `alt`, `neu`; Check-Constraint; UPDATE/DELETE per Trigger gesperrt | keine Schemaänderung |
| Aktionstypen | Enum `AuditArt` = `Rolle`, `Status` (Domain), im DTO Feld `art` | Liste per API (4.2) |
| Indizes | `ix_benutzer_audit_zeitpunkt (zeitpunkt DESC, id DESC)`, `ix_benutzer_audit_benutzer (benutzer_id, zeitpunkt DESC)` | reichen voraussichtlich; Messung entscheidet (4.3) |
| Zeitzone Backend | `Coin.Domain.Ausgaben.Berlin` mit `FindSystemTimeZoneById("Europe/Berlin")` | wiederverwenden |
| Frontend Audit | `widgets/audit-log/AuditLog` (Zustand im Widget, nur Benutzerfilter, nicht in der URL), `features/audit-filtern/BenutzerFilter`, `entities/audit` (`ladeAuditLog`, `AuditTabelle` mit Caption „Audit-Log“, `SYSTEM_ANZEIGE = 'System (Bootstrap)'`) | Filter erweitern, in die URL |
| Benutzerverwaltung | Reiter „Benutzer“/„Audit-Log“ ohne URL (`defaultValue`), Panel-h2 „Änderungsprotokoll“; kein Menüeintrag, keine Brotkrumen, kein `document.title` | Reiter `reiter` in der URL, Name „Änderungsprotokoll“ |
| `Filterleiste` | Chips, „Alle Filter entfernen“ erst ab zwei Chips, nur auf der Bausteinseite genutzt | optionaler Text und Schwelle (4.4) |
| Katalog | `entities/coin/CoinListe` mit eigener shadcn-`Table`; `CoinKarten` mit Bildfeld `aspect-square` | `DatenTabelle` (4.10), Bildfeld (4.5) |
| Kopfbereich | Logos `max-h-24`, Spalten 1:3:1, schrumpfen mit der Spalte (bei 768 px etwa 54 px) | Mindesthöhen (4.6) |
| Ergebniskarte | Ton `neutral` = `bg-muted` + Kreis `bg-card`; im Dunkelmodus `--muted` = `--card` = `#1e293b` | Fläche hebt sich nicht ab (4.11) |
| Aktionsmeldungen | `<p role="alert">`/`<p role="status">` in `features/*`, `widgets/*`, `pages/*` und `shared/ui/bestaetigungsdialog.tsx` (Liste in 4.8) | Baustein `Aktionsmeldung` auf `Alert` |
| „Erneut versuchen“ | `Fehlerzustand` an 14 Stellen; nach dem Klick verschwindet der Button, der Fokus fällt auf `body` | Fokusziel im Inhaltsbereich (4.9) |
| Hilfetexte „z. B.“ | `AusgabeFormular.tsx:39` „z. B. Truppenbesuch, Verabschiedung“, `VorlageHochladen.tsx:17` „…, z. B. {{Zertifikat.Nummer}}. …“; beide mit normalem Leerzeichen, gleiche Schreibweise | bleiben unverändert (4.7, F4) |

## 3. Annahmen und Entscheidungen des Architekten
- **A1 Aktionen:** „Aktion“ meint die bestehenden Aktionstypen `AuditArt` (`Rolle`, `Status`). Es entstehen keine neuen Typen. Feinere Arten wie „deaktiviert“ wären eine neue Fachfunktion.
- **A2 Benutzerfilter:** Er gilt weiter für den geänderten Benutzer (`benutzerId`, startseite-listen-pruefung A6).
- **A3 Zeitraum einseitig:** `von` allein heißt „ab diesem Tag“, `bis` allein „bis einschließlich diesem Tag“. Die 366-Tage-Grenze gilt nur, wenn beide angegeben sind. Begründung: Ohne Filter liefert die API ohnehin alles seitenweise. Die Grenze ist eine fachliche Plausibilitätsregel, keine Lastbegrenzung.
- **A4 Prüfung nur im Server:** Die Regeln für `von` > `bis`, 366 Tage und unbekannte Aktion prüft nur die API. Das Frontend zeigt deren `400`-Meldungen am Feld. Das Datumsformat sichert das native Datumsfeld. So gibt es eine Quelle für die Regeln.
- **A5 Datumsfeld:** Es ist natives `<input type="date">` über `Input` aus `shared/ui`. Ein shadcn-Date-Picker bräuchte `react-day-picker`, also eine neue Bibliothek mit ADR, und brächte keinen Vorteil für die Barrierefreiheit.
- **A6 Aktion als Checkboxen:** Die Mehrfachauswahl besteht aus einer `FieldSet`-Gruppe „Aktion“ mit je einer `Checkbox` (`shared/ui`) pro Aktion aus der API. Bei zwei Werten ist das einfacher und zugänglicher als eine Mehrfach-Combobox. Die Benutzer-Combobox bleibt die einzige Combobox im Panel.
- **A7 Sofort anwenden:** Jede Änderung eines Filters lädt sofort (wie die Wahl in der Benutzer-Combobox), ohne Button „Anwenden“. Ein Datumsfeld meldet eine Änderung erst bei vollständigem Datum.
- **A8 Bezeichnungen:** Filtergruppe „Aktion“ (Feature-Text), Checkbox-Texte = `bezeichnung` aus der API („Rolle“, „Status“). Die Tabellenspalte heißt weiter „Änderung“ (nicht im Umfang, Auffälligkeit).
- **A9 Leerzustand:** Titel „Keine Einträge für diese Filter.“ (mit Punkt wie „Noch keine Einträge.“) und Button „Filter zurücksetzen“. Er ersetzt „Keine Einträge für diesen Benutzer.“ und „Filter entfernen“.
- **A10 Bildschirmhöhe:** „Zwei Karten pro Bildschirmhöhe“ wird bei 360 × 800 px gemessen (Viewport der bestehenden Systemtests).

## 4. Entwurf

### 4.1 `GET /api/audit` mit Filtern (ADR-0045)
`GET /api/audit?von=2026-10-01&bis=2026-10-31&aktion=Rolle&aktion=Status&benutzerId=<guid>&seite=1&groesse=25`. Alle Parameter sind optional und werden per UND kombiniert, mehrere `aktion` per ODER. Ohne Filter verhält sich die API wie bisher.

| Parameter | Format | Regel | Fehler (`400`, Schlüssel) |
|---|---|---|---|
| `von` | `JJJJ-MM-TT` (genau dieses Format, invariant) | gültiger Kalendertag 2000-01-01 bis 2999-12-31. Leerer Wert = nicht angegeben. Mehrfach angegeben = ungültig | `von`: „Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.“ |
| `bis` | wie `von` | wie `von` | `bis`: dieselbe Meldung |
| `von` + `bis` | – | `von` ≤ `bis` | `bis`: „Das Datum „bis“ darf nicht vor dem Datum „von“ liegen.“ |
| `von` + `bis` | – | Tage einschließlich (`bis` − `von` + 1) ≤ 366 | `bis`: „Der Zeitraum darf höchstens 366 Tage umfassen.“ |
| `aktion` (mehrfach) | Name aus `AuditArt`, Groß-/Kleinschreibung zählt | jeder Wert bekannt. Doppelte zählen einfach, leere Werte gelten als nicht angegeben | `aktion`: „Unbekannte Aktion. Erlaubt sind: Rolle, Status.“ (Liste aus dem Enum) |
| `benutzerId`, `seite`, `groesse` | Bestand | Bestand | Bestand |

- **Tagesgrenzen (Europe/Berlin):** `von` → Beginn des Tages 00:00 Berlin, in UTC umgerechnet (inklusive). `bis` → Beginn des Folgetags 00:00 Berlin in UTC (exklusiv). Die Abfrage lautet `zeitpunkt >= vonUtc AND zeitpunkt < bisFolgetagUtc`. Damit hat der 29.03. 23 Stunden und der 25.10. 25 Stunden (Testfälle 10.2). Die Umrechnung macht die Domain (`Berlin`, neue Methode `TagesbeginnUtc(DateOnly)`; der Typ darf dafür nach `Coin.Domain.Gemeinsam` wandern). Mitternacht ist in Europe/Berlin nie ungültig oder doppelt. Die Methode behandelt diese Fälle trotzdem: ungültig = nächster gültiger Zeitpunkt, doppelt = früherer.
- **Prüfreihenfolge:** `401` → `403` (`audit.read`, deaktiviert) → `400` (alle Feldfehler gesammelt, wie bisher) → `200`. Ein Benutzer ohne `audit.read` erhält auch bei ungültigen Parametern `403`, nie `400`.
- **Prüfung in der Domain:** `BenutzerverwaltungService.AuditLesenAsync` bekommt die Rohwerte (`string?`/`string[]`) und liefert Feldfehler wie `Seitenabfrage`. Neuer Typ `AuditFilter(DateTimeOffset? AbUtc, DateTimeOffset? VorUtc, IReadOnlySet<AuditArt> Arten, Guid? BenutzerId)`. Der Controller bleibt ohne Logik. Er bindet `von`, `bis` und `aktion` als Zeichenketten (kein `DateOnly`-Model-Binding, damit die Meldung deutsch ist und das Format exakt geprüft wird).
- **Abfrage:** nur LINQ mit Parametern: `Where(a => a.Zeitpunkt >= ab)`, `Where(a => a.Zeitpunkt < vor)`, `Where(a => arten.Contains(a.Art))` (Stringliste → `= ANY(@p)`), `Where(a => a.BenutzerId == id)`. Kein `FromSqlRaw`/`FromSqlInterpolated`/`ExecuteSql*` in diesem Pfad. `gesamt` zählt die gefilterte Menge. Sortierung und Blättern wie bisher.
- **Antwort:** unverändert (`SeiteResponse<AuditEintragResponse>`). Das Lesen schreibt nichts.

### 4.2 `GET /api/audit/aktionen` (neu, ADR-0045 Punkt 3)
- Policy `audit.read`, `[KeinCache]` (vom Controller), gleicher Controller `AuditController`.
- Antwort `200`: `[{ "wert": "Rolle", "bezeichnung": "Rolle" }, { "wert": "Status", "bezeichnung": "Status" }]` in Enum-Reihenfolge. `wert` ist der API-Wert für `aktion` und das Feld `art`, `bezeichnung` der deutsche Anzeigetext (Domain, z. B. `AuditArtText.Bezeichnung`).
- Fehler: `401`/`403` wie `GET /api/audit`. Keine Parameter.
- Eintrag in die Endpunkttabelle `docs/berechtigungen.md` (in diesem Entwurf schon erledigt; `EndpunktTabelleTests` bleibt rot, bis der Endpunkt existiert).

### 4.3 Effizienz, Index und Messung
- **Analyse:** Zeitraumfilter und Sortierung nutzen `ix_benutzer_audit_zeitpunkt` (Bereichsscan in Sortierreihenfolge). Benutzerfilter mit Zeitraum nutzt `ix_benutzer_audit_benutzer`. `art` hat zwei Werte: Ein Index darauf trennt kaum (etwa 50 % je Wert), der Planer nähme ihn selten. Rollen- und Statusänderungen sind selten, und die 366-Tage-Grenze begrenzt die gezählte Menge.
- **Entscheidung:** keine neue Migration, sofern die Messung die Schwelle einhält. Liegt der Median einer Messreihe über 100 ms, ergänzt der Developer per Migration `ix_benutzer_audit_art_zeitpunkt (art, zeitpunkt DESC, id DESC)` und misst erneut. Beide Ergebnisse stehen im Bericht und als Nachtrag in ADR-0045.
- **Messung (Integrationstest, kein Browser):** `tests/Coin.IntegrationTests/Audit/AuditFilterMessungTests.cs`.
  - Eigene Datenbank per `CREATE DATABASE` im vorhandenen Testcontainer, Muster `StartseiteMigrationTests`. Audit-Zeilen lassen sich nicht löschen, die übrigen Tests bleiben deshalb unberührt.
  - Eigene xUnit-Collection ohne Parallelisierung (wenig Arbeitsspeicher).
  - Testdaten: 20 Benutzer und 6.000 Audit-Zeilen per einzelnem `INSERT … SELECT generate_series` (gültige `alt`/`neu`-Werte, Arten abwechselnd, Zeitpunkte gleichmäßig 2025-01-01 bis 2026-12-31).
  - Gemessen wird über HTTP (`CoinApiFactory`, Admin-Token) für fünf Anfragen: ohne Filter, Zeitraum 30 Tage, Zeitraum 366 Tage, `aktion=Status`, Kombination Zeitraum 90 Tage + `aktion=Rolle` + `benutzerId`. Je Anfrage 3 Aufwärmläufe und 20 Messläufe.
  - Ausgabe per `ITestOutputHelper`: Median, p95 und `gesamt` je Anfrage, dazu `EXPLAIN (ANALYZE, BUFFERS)` der beiden Kombinationsabfragen (SQL über `ToQueryString()` bzw. EF-Log im Test).
  - **Schwelle im Test:** grob, damit der Test auf schwacher Hardware nicht flackert: Median ≤ 500 ms je Anfrage und `gesamt` gleich der erwarteten Zahl. Die Index-Schwelle 100 ms prüft der Developer anhand der Ausgabe, nicht der Test.
  - Die Zahlen (Median/p95 je Anfrage, Plan, Index ja/nein) stehen im Bericht.

### 4.4 Frontend: Filter im Änderungsprotokoll (ADR-0045 Punkt 4)
**URL (`/benutzerverwaltung`), `validateSearch: benutzerverwaltungSuche` in `app/router/suchparameter.ts`:**

| Parameter | Werte | Wenn ungültig |
|---|---|---|
| `reiter` | `aenderungsprotokoll` (sonst Standard „Benutzer“, nicht in der URL) | Standard |
| `von`, `bis` | `JJJJ-MM-TT` (Regex `^\d{4}-\d{2}-\d{2}$`) | entfällt |
| `aktion` | kommagetrennt, z. B. `Rolle,Status`; nur `^[A-Za-z]+$`, Doppelte entfernt | einzelne Werte entfallen |
| `benutzer` | GUID des geänderten Benutzers, nie der Name (entschieden 2026-11-16, F1) | entfällt |
| `seite` | ganze Zahl > 1 (wie Katalog) | Seite 1 |

- Ob ein Datum gültig ist (z. B. 2026-02-30), ob `von` ≤ `bis` gilt, ob der Zeitraum höchstens 366 Tage umfasst und ob eine Aktion bekannt ist, prüft die API (A4). Die Meldungen erscheinen am Feld.
- **Verlauf:** Jede Filteränderung, „Filter zurücksetzen“ und das Blättern legen einen neuen Eintrag im Verlauf an (`push`). Die Zurück-Schaltfläche stellt so den vorigen Filter wieder her. Der Reiterwechsel nutzt `replace` (wie ADR-0042). Filterwerte bleiben beim Reiterwechsel in der URL und gelten, sobald der Reiter „Änderungsprotokoll“ aktiv ist.
- **Router-frei:** `BenutzerverwaltungSeite` und `AuditLog` bleiben frei von Router-Hooks. Die Route (`app/router/routen-komponenten.tsx`) übergibt `reiter`, `auditAbfrage` und Callbacks als Props. Ohne diese Props arbeiten beide Komponenten wie bisher mit eigenem Zustand (Bestandstests).

**Filterleiste (im Panel „Änderungsprotokoll“, über der Tabelle), Reihenfolge im DOM:**
1. `FieldSet` „Zeitraum“ mit Hilfetext „Ganze Tage nach deutscher Zeit, höchstens 366 Tage.“. Darin zwei `Formularfeld`: „Von“ und „Bis“ (`Input type="date"`, `min="2000-01-01"`, `max="2999-12-31"`, Höhe ≥ 40 px). Fehler aus `errors.von`/`errors.bis` am jeweiligen Feld.
2. `FieldSet` „Aktion“ mit je einer `Checkbox` und `Label` pro Eintrag aus `GET /api/audit/aktionen` (Klickfläche ≥ 40 px). Fehler aus `errors.aktion` an der Gruppe. Lädt die Liste nicht, steht in der Gruppe der Text „Aktionen konnten nicht geladen werden.“ (ohne `role="alert"`). Die übrigen Filter funktionieren dann weiter. Aktionen aus der URL erscheinen als Chips.
3. Combobox „Benutzer“ (Bestand, `BenutzerFilter`).
- **Chips** in „Aktive Filter“, Reihenfolge Von, Bis, Aktion (API-Reihenfolge), Benutzer: „Von: 01.10.2026“, „Bis: 31.10.2026“, „Aktion: Rolle“, „Aktion: Status“, „Benutzer: {Name}“. Datum über `formatiereDatum` (`shared/lib/format`), bei nicht lesbarem Wert der Rohwert. Entfernen setzt nur diesen Filter zurück, Seite 1.
- **Name im Chip „Benutzer“ (entschieden 2026-11-16, F1):** aus der Wahl in der Combobox (Zustand). Nach Neuladen oder bei geteilten Links kommt er aus `benutzer.name` des ersten geladenen Eintrags, denn alle Einträge gehören dann zu diesem Benutzer. Ohne Einträge lautet der Chip „Benutzer: unbekannt“. Die Combobox zeigt denselben Namen bzw. bleibt leer.
- **„Filter zurücksetzen“:** Die `Filterleiste` bekommt die optionalen Props `alleEntfernenText` (Standard „Alle Filter entfernen“) und `alleEntfernenAb` (Standard 2). Das Änderungsprotokoll nutzt „Filter zurücksetzen“ ab einem Chip. Der Button entfernt alle Filter (Zeitraum, Aktionen, Benutzer), setzt Seite 1 und behält den Reiter. Danach liegt der Fokus auf „Von“ (bestehende Regel der `Filterleiste`).
- **Zustände:**
  - Laden: Bestand, Text „Änderungsprotokoll wird geladen …“.
  - Fehler: `Fehlerzustand` „Änderungsprotokoll konnte nicht geladen werden. Bitte später erneut versuchen.“ mit „Erneut versuchen“ (4.9).
  - `400` mit `errors.von|bis|aktion|benutzerId`: Feldfehler an den Filtern, keine Tabelle, kein `Fehlerzustand`, kein Blättern.
  - Leer ohne Filter: „Noch keine Einträge.“ (Bestand).
  - Leer mit Filter: `Leerzustand` (h3) „Keine Einträge für diese Filter.“ mit Button „Filter zurücksetzen“ (gleiche Wirkung, Fokus danach auf „Von“).
- **Requests:** `GET /api/audit` mit `seite`, `groesse=25` und nur den gesetzten Filtern (`von`, `bis`, je Aktion ein `aktion`, `benutzerId`). `GET /api/audit/aktionen` einmal je Anzeige des Panels.

### 4.5 Katalog: Kartenansicht (Bildfeld)
Ab 640 px hat das Bildfeld das Seitenverhältnis 4:3 (`aspect-4/3`) statt 1:1, Bild `object-contain` (nie beschnitten). Unter 640 px vergleicht der Developer zwei Varianten per Screenshot. Er wählt eine, begründet sie kurz im Bericht und entfernt die andere vollständig:
- **Variante A:** 4:3 mit begrenzter Höhe (`max-h-40`, 160 px), Bild zentriert auf `bg-muted`.
- **Variante B (kompakt):** Bild `size-20` (80 px) links neben dem Text (Name, Herausgeber, `dl`), Fläche mit Icon und „Kein Bild“ in gleicher Größe.
Für beide gilt AK-21: Bei 360 × 800 px passen zwei Karten vollständig übereinander in den Bereich unter der Kopfzeile. Name als h3-Link, „Kein Bild“, Chip „Auflage unbekannt“, Klick in die Karte und ein Tab-Stopp je Karte bleiben wie bisher (katalog-ansicht.spec.ts).

### 4.6 Logos im Kopfbereich der Startseite
- **Höhe fest je Breite, Breite automatisch:**
  - unter 768 px `h-12` (48 px);
  - ab 768 px `md:h-18` (72 px);
  - ab 1024 px `lg:h-24` (96 px).
- **Darstellung:** `width`/`height` aus der API bleiben am `img`. Dazu `w-auto object-contain` und `max-w-full`. Nie verzerrt, nie beschnitten. Höchstens 96 px bleibt (startseite AK-20).
- **Anordnung (Variante A, entschieden 2026-11-16, F3):**
  - < 640 px: untereinander wie bisher (Bereitsteller, Titel, Software);
  - 640–1023 px: beide Logos in einer Zeile über dem Titel (Bereitsteller links, Software rechts), darunter Titel und Untertitel über die volle Breite, zentriert. DOM-Reihenfolge bleibt; die Anordnung entsteht über `grid-template-areas`;
  - ab 1024 px: Logo | Titel | Logo in einer Zeile (Spalten `auto minmax(0,1fr) auto`).
- **Ausnahme:** Die Mindesthöhen gelten für Logos bis zum Seitenverhältnis 2,5 : 1 (Breite : Höhe). Breitere Logos werden auf die verfügbare Breite verkleinert, auch unter die Mindesthöhe, aber nie beschnitten (Hinweis im Bericht).

### 4.7 Einheitliche Texte
| Alt | Neu | Fundstellen (Code) |
|---|---|---|
| Reiter „Audit-Log“ | „Änderungsprotokoll“ | `pages/benutzerverwaltung/ui/BenutzerverwaltungSeite.tsx:27` |
| Caption/Kartenliste „Audit-Log“ | „Änderungsprotokoll“ | `entities/audit/ui/AuditTabelle.tsx:43` |
| „Audit-Log wird geladen …“ | „Änderungsprotokoll wird geladen …“ | `widgets/audit-log/ui/AuditLog.tsx:12` |
| „Audit-Log konnte nicht geladen werden. Bitte später erneut versuchen.“ | „Änderungsprotokoll konnte nicht geladen werden. Bitte später erneut versuchen.“ | `AuditLog.tsx:84` |
| „System (Bootstrap)“ | „System (Ersteinrichtung)“ | `entities/audit/model/types.ts:30` |
| API-Meldung 403 „… das Audit-Log einzusehen.“ | „Ihr Benutzerkonto ist nicht berechtigt, das Änderungsprotokoll einzusehen.“ | `src/Coin.Api/Authentifizierung/AutorisierungsErgebnisBehandlung.cs:75` |

- Die h2 „Änderungsprotokoll“ und die Beschreibung des Panels bleiben. Reiter, Panel-Name, h2 und Caption heißen jetzt gleich. Das ist gewollt (ein Begriff).
- Menü, Seitentitel und Brotkrumen mit „Audit-Log“ gibt es nicht (kein Eintrag in der Seitenleiste, kein `document.title`, keine Brotkrumen auf `/benutzerverwaltung`). Dort ist nichts zu tun.
- **Doku (Docs-Agent):** „Änderungsprotokoll“ in `docs/requirements.md`, `docs/api.md` (Fließtext; Pfad `/api/audit` bleibt), Spalte „Bedeutung“ der Rechtematrix in `docs/berechtigungen.md` („Änderungsprotokoll lesen“; die Spalte prüft kein Test, Marker und Format bleiben) und `README.md`. ADRs bleiben unverändert. Den Fachbegriff in `CLAUDE.md` pflegt der Mensch.
- **„z. B.“ (entschieden 2026-11-16, F4):** Beide Hilfetexte schreiben „z. B.“ gleich, mit normalem Leerzeichen. Eine echte Uneinheitlichkeit gibt es nicht, deshalb bleiben beide unverändert. Der Bericht vermerkt das.
- Code-Bezeichner, Kommentare, Dateinamen, Testnamen und ADRs behalten „Audit-Log“.

### 4.8 Aktionsmeldungen (ADR-0047 Punkt 1)
Neuer Baustein `shared/ui/aktionsmeldung.tsx` auf Basis von `Alert` (Hinweisbanner):
```tsx
<Aktionsmeldung meldung={null | { art: 'fehler' | 'warnung' | 'erfolg' | 'hinweis'; text: ReactNode; titel?: ReactNode }}
                aktion? ref? fokussierbar? className? />
```
- `fehler`/`warnung` erscheinen als `Alert` `destructive`/`warning` mit `role="alert"` und werden beim Erscheinen eingefügt.
- `erfolg`/`hinweis` erscheinen als `Alert` `success`/`info` in einem dauerhaft vorhandenen Container mit `role="status"` (leer `empty:sr-only`, ohne Abstand). Das Banner darin hat `role="none"`, damit es keine zweite Live-Region gibt.
- `ref`/`fokussierbar` gelten für das sichtbare Banner (`tabIndex=-1`, Fokusring wie `Fehlerzustand`), für Stellen, die den Fokus heute auf die Meldung setzen.
- `aktion` nimmt weitere Bedienelemente auf (z. B. „Neu laden“).
- Texte bleiben wortgleich, Icons kommen aus `Alert`.

Umzustellen sind alle Meldungen nach einer Aktion:

| Datei | Zeile(n) heute |
|---|---|
| `features/motivbild-hochladen/ui/MotivbildHochladen.tsx` | 127 (alert, fokussiert), 162 (status) |
| `features/vorlage-hochladen/ui/VorlageHochladen.tsx` | 122 (alert mit Befundliste, fokussiert) |
| `features/coin-anlegen/ui/CoinFormular.tsx` | 270, 274 (status) |
| `features/coin-bearbeiten/ui/CoinBearbeitenFormular.tsx` | 143 (status) |
| `features/auflage-aendern/ui/AuflageAendern.tsx` | 139 (alert) |
| `features/hologrammnummer-aendern/ui/HologrammnummerAendern.tsx` | 167 (status), 171, 234 (alert) |
| `features/standardvorlage-herunterladen/ui/StandardvorlageHerunterladen.tsx` | 41 (alert) |
| `features/zertifikat-herunterladen/ui/ZertifikatHerunterladen.tsx` | 114 (alert) |
| `features/startseite-konfigurieren/ui/StartseiteFormular.tsx` | 530 (status, fokussiert), 539 (alert mit „Neu laden“ als `aktion`), 554 (alert) |
| `widgets/benutzer-tabelle/ui/BenutzerTabelle.tsx` | 221 (status), 226 (alert) |
| `widgets/zertifikatsvorlage/ui/ZertifikatsvorlageVerwalten.tsx` | 164 (status, fokussiert), 186 (alert) |
| `widgets/ausgaben-historie/ui/AusgabenHistorie.tsx` | 156–163: Meldung → `Aktionsmeldung`, Ladetext bleibt eigene Statuszeile |
| `pages/coin-detail/ui/CoinDetailSeite.tsx` | 319 (status) |
| `pages/ausgabe-detail/ui/AusgabeDetailSeite.tsx` | 190–197 (status, fokussiert) |
| `pages/kein-zugriff/ui/KeinZugriffSeite.tsx` | 102 (status), 106 (alert) |
| `shared/ui/bestaetigungsdialog.tsx` | 95 (alert im Dialog) |

- **Nicht umgestellt** werden reine Statuszeilen, die keine Meldung nach einer Aktion sind:
  - Laden und Treffer: `AuditLog.tsx:76`, `CoinKatalog.tsx:150`, `BenutzerTabelle.tsx:206`, `CoinExemplare.tsx:116`, `StartseiteFormular.tsx:548`;
  - Ansage beim Verschieben: `StartseiteFormular.tsx:458`;
  - Fortschritt: `bestaetigungsdialog.tsx:101`;
  - Feldfehler (`field.tsx`), `Fehlerzusammenfassung`, `PruefFormular` (nutzt schon `Alert`), Bausteinseite.
- `widgets/app-shell/ui/Kopfzeile.tsx:55` ist kein Formular und bleibt (Auffälligkeit).
- Die Liste dieser Statuszeilen steht als Positivliste im Code-Test (AK-27).

### 4.9 Fokus nach „Erneut versuchen“ (ADR-0047 Punkt 2)
`Fehlerzustand` übernimmt die Fokusführung selbst, damit sie überall gilt:
1. Beim Klick auf „Erneut versuchen“ bestimmt er zuerst das Ziel, dann ruft er `onErneutVersuchen` auf:
   - die neue optionale Prop `fokusZiel` (Ref), sonst
   - der nächste Vorfahre mit `data-inhaltsbereich`, sonst
   - `main#inhalt`.
2. Im Ziel wird die erste Überschrift (`h1`–`h4`, nicht im Fehlerzustand selbst) fokussiert, sonst das Ziel selbst. Fehlt `tabIndex`, setzt der Baustein `tabIndex=-1`. Der Fokusring ist sichtbar (`outline-none focus-visible:ring-3 focus-visible:ring-ring rounded-md`).
3. Das Ziel muss in den Zuständen Laden, Fehler und Inhalt eingehängt bleiben. Die Widgets markieren dazu ihren stabilen Wurzelbereich mit `data-inhaltsbereich`:
   - `AuditLog`, `BenutzerTabelle`, `CoinKatalog`, `CoinExemplare`, `AusgabenHistorie` und `ZertifikatsvorlageVerwalten`: die Wurzel des Widgets bzw. die vorhandene `section` mit h2;
   - Seiten (`StartSeite`, `CoinDetailSeite`, `CoinBearbeitenSeite`, `AusgabeErfassenSeite`, `AusgabeDetailSeite`, `StartseiteVerwaltungSeite`): Rückfall auf `main#inhalt` mit seiner h1.
4. Scheitert das erneute Laden, bleibt der Fokus auf dem Ziel. Der neue Alarm wird über `role="alert"` angesagt.
5. `useFokusBeiLadefehler` (Fokus beim Blättern) bleibt unverändert.

### 4.10 Katalogtabelle auf `DatenTabelle` (ADR-0046)
`entities/coin/ui/CoinListe.tsx` rendert nur noch `DatenTabelle` mit:
- `beschriftung="Coins"`;
- Spalten:
  - `bild` „Bild“: `schmal`, Karte `feld`, `img` 64 px wie bisher bzw. „Kein Bild“;
  - `name` „Name“: `mittel`, Karte `titel`, Link mit `useZeilenklick` wie bisher;
  - `herausgeber` „Herausgeber“: `breit`, `feld`;
  - `auflage` „Auflage“: `schmal`, `rechts`, `feld`, Badge „unbekannt“;
  - `erstelltAm` „Erfasst am“: `mittel`, `feld`;
- `sortierung={{ spalte: 'name', richtung: 'aufsteigend' }}` (feste Serversortierung, nur `aria-sort`, keine Sortier-Buttons);
- `zeilenklick`, `kartenUnter="md"`, `leer="Noch keine Coins erfasst."`.
- Eigenes `Table`-Markup in `entities/coin` entfällt (Code-Test AK-29).
- Braucht der Link `linkGeklickt` aus derselben `useZeilenklick`-Instanz wie die Zeile, erweitert der Developer `DatenTabelle` abwärtskompatibel (z. B. Zellfunktion mit zweitem Argument). Das ist kein zweiter Tabellencode.
- Unter 768 px zeigt die Ansicht „Tabelle“ damit Karten (`<ul aria-label="Coins">`) statt einer horizontal scrollenden Tabelle. Die Ansicht „Karten“ (`CoinKarten`) bleibt daneben bestehen.

### 4.11 Prüfergebnis „nicht gefunden“ im Dunkelmodus
- Nur der Ton `neutral` der `Ergebniskarte` ändert sich, und nur im Dunkelmodus. Es kommen keine neuen Tokens dazu, nur `dark:`-Varianten vorhandener Tokens:
  - Kopffläche `dark:bg-accent` (`#334155`, hebt sich von `--card` `#1e293b` ab);
  - Titel `dark:text-foreground` (`#f1f5f9` auf `#334155`, etwa 10 : 1);
  - Icon-Kreis `bg-card` mit Icon `text-muted-foreground` (etwa 5,7 : 1);
  - Rahmen `border-muted-foreground` (Bestand, etwa 5,7 : 1 zu `--card`).
- Der helle Modus bleibt unverändert.
- Text und Icon unterscheiden die vier Ergebnisse weiter ohne Farbe (startseite-listen-pruefung AK-23).
- Der Developer vergleicht alle vier Ergebnisse im Dunkelmodus vor und nach der Änderung per Screenshot. Reicht das nicht, schlägt er im Bericht ein Token vor (dann ADR-0035-Nachtrag), statt es still einzuführen.

### 4.12 FSD-Zuordnung (Importe nur nach unten)
- `app/router`:
  - `suchparameter.ts` neu `benutzerverwaltungSuche` und Typ `BenutzerverwaltungSuche`;
  - `router.tsx` setzt `validateSearch` an `benutzerverwaltungRoute`;
  - `routen-komponenten.tsx`: `BenutzerverwaltungRoute` übersetzt URL ↔ Props (`useSearch`/`useNavigate`, `push` für Filter und Seite, `replace` für den Reiter).
- `pages/benutzerverwaltung`: `BenutzerverwaltungSeite` mit den optionalen Props `reiter`, `onReiter`, `auditAbfrage`, `onAuditAbfrage` und dem Reitertext „Änderungsprotokoll“. Public API unverändert, ergänzt um Typen.
- `widgets/audit-log`: `AuditLog` mit den optionalen Props `abfrage` (`AuditAbfrage`: `{ von?, bis?, aktionen: string[], benutzerId?, seite }`) und `onAbfrage(neu)`. Ohne die Props arbeitet `AuditLog` mit eigenem Zustand. Das Widget lädt Aktionen und Einträge, bildet die Chips, zeigt die Zustände und setzt `data-inhaltsbereich`.
- `features/audit-filtern`:
  - neu `ZeitraumFilter` (Von/Bis, Feldfehler) und `AktionFilter` (Checkboxen aus Prop `aktionen`, Fehler, Hinweis bei Ladefehler);
  - `BenutzerFilter` (Bestand);
  - Modell `model/abfrage.ts` mit `chipsFuer(...)` und `abfrageAusSuche`/`sucheAusAbfrage` (kommagetrennte Aktionen);
  - Public API `index.ts` ergänzt. Importiert `entities/audit` (Typ `AuditAktion`) und `entities/benutzer` (Bestand).
- `entities/audit`:
  - `ladeAuditLog` mit `von`, `bis` und `aktionen`, neu `ladeAuditAktionen()`;
  - Typ `AuditAktion { wert: string; bezeichnung: string }`;
  - `SYSTEM_ANZEIGE` = „System (Ersteinrichtung)“, Caption „Änderungsprotokoll“.
- `entities/coin`: `CoinListe` auf `DatenTabelle`, `CoinKarten` mit Bildfeld 4.5.
- `entities/startseite`: `Kopfbereich` (4.6).
- `shared/ui`:
  - neu `aktionsmeldung.tsx`;
  - geändert `filterleiste.tsx` (`alleEntfernenText`, `alleEntfernenAb`), `zustaende.tsx` (`Fehlerzustand` mit `fokusZiel` und Fokusführung), `ergebniskarte.tsx` (Ton `neutral` dunkel), `bestaetigungsdialog.tsx` (Meldung über `Aktionsmeldung`), ggf. `daten-tabelle.tsx` (4.10);
  - die Bausteinseite bekommt den Abschnitt (h2) „Aktionsmeldung“ mit allen vier Arten.
- Neue Bibliotheken: keine.

## 5. Datenmodell und API
- **Datenbank:** keine Schemaänderung. Ein Index nur nach der Messregel aus 4.3 (Migration `AuditFilterIndex`).
- **API:** `GET /api/audit` mit `von`, `bis` und `aktion` (4.1), neu `GET /api/audit/aktionen` (4.2). Das DTO des Eintrags ist unverändert. Die 403-Meldung von `audit.read` ist umformuliert (4.7).
- **Doku:** `docs/berechtigungen.md`, Endpunkttabelle: `GET /api/audit/aktionen` unter `audit.read` (erledigt). `docs/api.md` (Docs-Agent): Parameter, Meldungen, Tagesgrenzen, neuer Endpunkt, Schlüssel `von`, `bis`, `aktion` in der Fehlertabelle, „System (Ersteinrichtung)“ in der Feldtabelle.

## 6. Sicherheit und Datenschutz
- **Rechte:** Beide Endpunkte verlangen genau `audit.read` (nur Administrator, Rechtematrix unverändert). Betrachter, Sachbearbeiter und Benutzer ohne Rolle erhalten `403`, auch mit gültigen oder ungültigen Filterparametern (Autorisierung vor Validierung). Deaktivierte erhalten `403 benutzer_deaktiviert`. Die Seite bleibt `users.manage`, Sichtbarkeit nur aus `berechtigungen` von `/api/me`.
- **Parameter statt zusammengesetzter Abfragen:** Die Filter laufen nur über LINQ mit Parametern (4.1), die Werte sind vorher typisiert (Datum, Enum, GUID). Kein Freitext, keine Suche in `alt`/`neu`, Namen oder sonstigem Text. Unbekannte Werte ergeben `400`, sie werden nicht ignoriert.
- **Nur lesen:** `GET` ändert nichts. Integrationstest: Anzahl und Inhalt der Zeilen in `benutzer_audit` sind nach den Filterabfragen gleich. Trigger und Rechte der Tabelle bleiben unverändert.
- **Keine Empfängerdaten:** Das Änderungsprotokoll enthält keine Empfängerdaten, die Filter berühren keine Ausgaben-Tabellen. `gesamt` bezieht sich nur auf `benutzer_audit`.
- **Fehlermeldungen** enthalten keine Eingabewerte, nur die feste Liste der erlaubten Aktionen.
- **Logs:** `AnfrageProtokoll` schreibt nur das Routen-Template. Query-Werte (`von`, `bis`, `aktion`, `benutzerId`) erscheinen nicht im Log (LogTests-Muster).
- **URL:** In der Adresszeile stehen Datum, Aktionen, Seite, Reiter und die GUID des geänderten Benutzers, nie Name oder E-Mail (F1). Die GUID ist ein Pseudonym und nur für Administratoren auflösbar. Nichts davon kommt in `localStorage`/`sessionStorage` (ADR-0044 Punkt 4 bleibt).
- **Aktionsmeldungen** zeigen dieselben Texte wie bisher, ohne Dateiinhalte und Personendaten (Bestand).

## 7. Akzeptanzkriterien

### API und Datenbank
- **AK-1** Ohne `von`, `bis` und `aktion` liefert `GET /api/audit` dieselben Einträge, dieselbe Reihenfolge und dasselbe `gesamt` wie bisher (Bestandstests grün).
- **AK-2** Zeitraum (Testdaten 10.2): `von`/`bis` schließen ganze Tage in Europe/Berlin ein. Je Stichtag (Winter 15.01.2026, Sommer 01.07.2026, Umstellung 29.03.2026 und 25.10.2026) liefert `von=bis=Stichtag` genau die Einträge von 00:00 bis vor 00:00 des Folgetags (Berliner Zeit), einschließlich des ersten und letzten Mikrosekunden-Eintrags. Die Einträge eine Mikrosekunde davor bzw. am Folgetag 00:00 sind nicht dabei. `gesamt` = Anzahl dieser Einträge.
- **AK-3** Nur `von`: alle Einträge ab Tagesbeginn. Nur `bis`: alle bis Tagesende. Beides gilt einschließlich der Randtage.
- **AK-4** `aktion=Rolle` liefert nur Einträge mit `art = "Rolle"`, `aktion=Status` nur `Status`, `aktion=Rolle&aktion=Status` beide. Doppelte Werte ändern das Ergebnis nicht. `gesamt` passt jeweils.
- **AK-5** Kombinationen: Zeitraum + Aktion, Zeitraum + `benutzerId`, Aktion + `benutzerId` und alle drei liefern genau die Schnittmenge. Sortierung `zeitpunkt` absteigend, dann `id` absteigend. Blättern mit `seite`/`groesse` über die gefilterte Menge. Eine Seite hinter dem Ende liefert `eintraege: []` mit richtigem `gesamt`.
- **AK-6** Jeweils `400` ValidationProblemDetails mit genau der Meldung aus 4.1:
  - `von` bzw. `bis` ungültig (`2026-13-01`, `2026-02-30`, `01.10.2026`, `2026-1-5`, `abc`, `1999-12-31`, `3000-01-01`, doppelt angegeben);
  - `von` > `bis` (Schlüssel `bis`);
  - 367 Tage (`2026-01-01` bis `2027-01-02`, Schlüssel `bis`), dagegen sind 366 Tage (`2026-01-01` bis `2027-01-01`) gültig;
  - `aktion=rolle`, `aktion=Unbekannt` (Schlüssel `aktion`).
  Mehrere Fehler kommen gemeinsam. Leere Werte (`von=`, `aktion=`) gelten als nicht angegeben (`200`).
- **AK-7** `GET /api/audit/aktionen` liefert für den Administrator `200` mit genau `[{"wert":"Rolle","bezeichnung":"Rolle"},{"wert":"Status","bezeichnung":"Status"}]` und `Cache-Control: no-store`.
- **AK-8** Rechte: Für Betrachter, Sachbearbeiter und Benutzer ohne Rolle liefern `GET /api/audit` (ohne Filter, mit gültigen Filtern, mit ungültigen Filtern) und `GET /api/audit/aktionen` `403`. Anonym gilt `401`, deaktiviert `403 benutzer_deaktiviert`. Die 403-Meldung lautet „Ihr Benutzerkonto ist nicht berechtigt, das Änderungsprotokoll einzusehen.“. Die Endpunkttabelle in `docs/berechtigungen.md` stimmt mit dem Code überein (`EndpunktTabelleTests`).
- **AK-9** Nur lesen: Nach allen Abfragen aus AK-2 bis AK-6 sind Zahl und Inhalt der Zeilen in `benutzer_audit` unverändert. Das Request-Log enthält nur `/api/audit` bzw. `/api/audit/aktionen` als Template, keine Query-Werte, Namen oder GUIDs.
- **AK-10** Code-Prüfung (Review): Im Lesepfad des Audits gibt es kein `FromSql*` und kein `ExecuteSql*`. Die Domain-Prüfung hat Unit-Tests für alle Fälle aus AK-6 und für `TagesbeginnUtc` an den Umstellungstagen.
- **AK-11** Messung (4.3): Der Test läuft mit 6.000 Einträgen in eigener Datenbank. Je Anfrage gilt Median ≤ 500 ms, und `gesamt` stimmt. Median, p95 und Plan stehen im Bericht. Eine Migration für einen Index gibt es nur nach der Regel aus 4.3.

### Frontend: Änderungsprotokoll
- **AK-12** Reiter: Die Seite `/benutzerverwaltung` hat die Reiter „Benutzer“ und „Änderungsprotokoll“. Der Wechsel setzt bzw. entfernt `reiter=aenderungsprotokoll` per `replace`. Nach dem Neuladen mit `?reiter=aenderungsprotokoll` ist der Reiter aktiv.
- **AK-13** Bedienelemente im Panel „Änderungsprotokoll“:
  - Gruppe „Zeitraum“ mit den Feldern „Von“ und „Bis“ (Datumsfelder, beschriftet, Hilfetext in der Beschreibung);
  - Gruppe „Aktion“ mit je einer Checkbox pro Eintrag aus `GET /api/audit/aktionen` (Texte aus `bezeichnung`, keine fest kodierte Liste im Frontend; Code-Test sucht `'Rolle'`/`'Status'` als Literale in `features/audit-filtern` und `widgets/audit-log`: 0 Treffer);
  - Combobox „Benutzer“ (Bestand, weiterhin genau eine Combobox).
  Alles ist per Tab in dieser Reihenfolge erreichbar, Checkboxen schalten mit Leertaste, Klickflächen sind ≥ 40 × 40 px.
- **AK-14** Wirkung: Jede Änderung lädt genau einmal `GET /api/audit` mit `seite=1`, `groesse=25` und genau den gesetzten Filtern (`von`, `bis`, je Aktion ein `aktion`, `benutzerId`). Die URL enthält danach `von`, `bis`, `aktion` (kommagetrennt), `benutzer` (GUID) und `reiter` als neuen Verlaufseintrag. Name und E-Mail stehen nie in URL oder Storage.
- **AK-15** Chips: Für jeden aktiven Filter gibt es einen Chip mit genau dem Text aus 4.4 („Von: 01.10.2026“, „Aktion: Rolle“ …). Das Entfernen eines Chips entfernt nur diesen Filter, lädt ab Seite 1 und fokussiert nach der Regel der `Filterleiste`. Ab einem Chip gibt es den Button „Filter zurücksetzen“. Er entfernt alle Filter, behält den Reiter, lädt ohne Filter ab Seite 1, und danach liegt der Fokus auf „Von“.
- **AK-16** URL wiederherstellen: Ein Aufruf von `/benutzerverwaltung?reiter=aenderungsprotokoll&von=2026-10-01&bis=2026-10-31&aktion=Status` zeigt den Reiter, die Feldwerte, die Checkbox „Status“ gesetzt, die passenden Chips und lädt genau mit diesen Parametern. Die Zurück-Schaltfläche stellt den vorigen Filterstand samt Request wieder her. Mit `benutzer=<guid>` heißt der Chip „Benutzer: {Name des ersten Eintrags}“, ohne Einträge „Benutzer: unbekannt“.
- **AK-17** Serverfehler `400`: Die Meldung aus `errors.von`/`errors.bis` steht am Feld (`aria-invalid`, in der Beschreibung), `errors.aktion` an der Gruppe „Aktion“. Dann gibt es keine Tabelle, keinen `Fehlerzustand` und kein Blättern. Lädt die Aktionsliste nicht, steht in der Gruppe „Aktionen konnten nicht geladen werden.“, und die übrigen Filter funktionieren.
- **AK-18** Leerzustand mit Filter: h3 „Keine Einträge für diese Filter.“ mit Button „Filter zurücksetzen“ (Wirkung wie AK-15). Leer ohne Filter: h3 „Noch keine Einträge.“ (Bestand).
- **AK-19** Playwright (gemockte API, `web/ui-tests/aenderungsprotokoll-filter.spec.ts`, Kernfall): Der Administrator öffnet das Änderungsprotokoll, setzt Von und Bis und wählt „Status“. Er sieht die Chips „Von: …“, „Bis: …“ und „Aktion: Status“ und nur passende Einträge. Nach dem Neuladen sind Reiter, Felder, Checkbox, Chips und Einträge unverändert. „Filter zurücksetzen“ zeigt wieder alle Einträge, und die URL hat keine Filterparameter mehr. Dazu ein Systemtest mit echter API (8).

### Gestaltung
- **AK-20** Kopfbereich (gemockte API, Testlogos 160 × 96 und 192 × 96): Jedes Logo ist bei 360 px ≥ 48 px, bei 768 px ≥ 72 px und bei 1280 px ≥ 96 und ≤ 96 px hoch. Das Seitenverhältnis der Box weicht ≤ 1 % von `breite/hoehe` ab, und das Bild liegt vollständig im Kopfbereich (`naturalWidth`/Box geprüft, kein Überlauf). Anordnung nach Variante A (F3): Bei 768 px liegen beide Logos über dem Titel und nebeneinander (Bereitsteller links), bei 1280 px neben dem Titel, bei 360 px untereinander. Kein horizontales Scrollen.
- **AK-21** Katalogkarten: Ab 640 px hat das Bildfeld das Verhältnis 4:3 (± 1 px). Bei 360 × 800 px ist Höhe(Karte 1) + Abstand + Höhe(Karte 2) ≤ 800 − Unterkante der Kopfzeile. Der Bericht nennt die gewählte Variante (A oder B) mit Begründung, die andere ist nicht im Code. Die Bestandstests der Kartenansicht bleiben grün.
- **AK-22** Prüfergebnis „nicht gefunden“ dunkel: Kopffläche ≠ `--card`, Titel ≥ 4,5 : 1 zur Kopffläche, Icon ≥ 3 : 1 zu seinem Kreis, Kreis ≠ Kopffläche, Rahmen ≥ 3 : 1 zu `--card` (Playwright misst die berechneten Farben). Der helle Modus ist unverändert (gleiche berechnete Farben wie vorher). Die Screenshots aller vier Ergebnisse im Dunkelmodus (vorher/nachher) hat der Developer angesehen, Befunde stehen im Bericht.

### Texte
- **AK-23** In sichtbarem Text, `aria-label`, `title`, `alt`, `placeholder` und Caption kommt „Audit-Log“ auf keiner Seite vor (UI-Test über `/benutzerverwaltung` beide Reiter, Zustände leer, Fehler und mit Filter; Code-Test: kein Zeichenketten-Literal `Audit-Log` in `web/src` außerhalb von Kommentaren und Tests). Reiter, Panel, Caption bzw. Kartenliste, Lade- und Fehlertext heißen „Änderungsprotokoll …“ wie in 4.7.
- **AK-24** „Geändert von“ zeigt für `akteur = null` „System (Ersteinrichtung)“. „System (Bootstrap)“ steht nirgends mehr in `web/src`.
- **AK-25** Die Hilfetexte „z. B. Truppenbesuch, Verabschiedung“ und „…, z. B. {{Zertifikat.Nummer}}. …“ sind unverändert (F4).

### Aktionsmeldungen und Fokus
- **AK-26** `Aktionsmeldung`: `fehler`/`warnung` mit `role="alert"` und Variante `destructive`/`warning`, `erfolg`/`hinweis` als Banner `success`/`info` in einem dauerhaft vorhandenen `role="status"`-Container. Das Icon ist `aria-hidden`, die Bedeutung trägt der Text. `ref`/`fokussierbar` fokussieren das Banner sichtbar (Vitest).
- **AK-27** Alle Stellen aus 4.8 nutzen `Aktionsmeldung` mit unverändertem Text. In `web/src/{features,widgets,pages}` gibt es kein `role="alert"` mehr, außer den begründeten Ausnahmen aus 4.8: `PruefFormular` (nutzt schon `Alert`) und `Kopfzeile` (kein Formular). `role="status"` steht dort nur an den Statuszeilen der Positivliste aus 4.8 und an der Live-Region von `PruefFormular` (Code-Test, Bausteinseite ausgenommen). Fokusziele nach Aktionen bleiben, wo sie heute sind (Bestandstests).
- **AK-28** Fokus nach „Erneut versuchen“: Nach Klick oder Enter liegt der Fokus nicht auf `body`, sondern auf der Überschrift bzw. dem Element aus 4.9 im Inhaltsbereich, auch nach erfolgreichem Laden. Bei erneutem Fehler bleibt er dort, und der Alarm ist sichtbar.
  - Vitest für `Fehlerzustand` (mit `fokusZiel`, mit `data-inhaltsbereich`, Rückfall `main`) und für `AuditLog`, `CoinKatalog`, `StartSeite`;
  - Playwright auf `/coins` und im Änderungsprotokoll, per Tastatur (Enter auf „Erneut versuchen“), mit Prüfung von `document.activeElement` und sichtbarem Fokusring.

### Katalogtabelle
- **AK-29** `CoinListe` rendert `DatenTabelle`. In `web/src/entities/coin` und `web/src/widgets/coin-katalog` gibt es keinen Import aus `@/shared/ui/table` und kein `<table>`/`TableRow` (Code-Test).
- **AK-30** Ab 768 px: Tabelle „Coins“ mit Spalten Bild, Name, Herausgeber, Auflage, Erfasst am; `aria-sort="ascending"` am Spaltenkopf „Name“ ohne Sortier-Button. Zeilenklick, ein Link je Zeile (einziger Tab-Stopp), Enter auf dem Link, Badge „unbekannt“, „Kein Bild“ und das Datum bleiben (Bestandstests `CoinListe.test.tsx`, `katalog-ansicht.spec.ts`, `katalog-seiten.spec.ts` grün). Blättern bleibt `Blaettern`.
- **AK-31** Unter 768 px in der Ansicht „Tabelle“: Liste „Coins“ mit je einer Karte (h3 mit Link, `dl` mit Bild, Herausgeber, Auflage, Erfasst am), keine `table`. Kein horizontales Scrollen. Klickflächen ≥ 40 px.

### Qualität
- **AK-32** axe meldet 0 Verstöße `serious`/`critical`, hell und dunkel, bei 360 und 1280 px für:
  - das Änderungsprotokoll mit allen Filtern aktiv, leer mit Filter, `400`-Feldfehler und Ladefehler;
  - den Katalog in beiden Ansichten (360 px mit `DatenTabelle`-Karten);
  - den Startseiten-Kopf;
  - die Prüfmaske mit allen vier Ergebnissen.
  Die Fälle stehen in `barrierefreiheit.spec.ts`.
- **AK-33** Kein horizontales Scrollen bei 360, 768 und 1280 px in denselben Zuständen (`responsiv.spec.ts`).
- **AK-34** Screenshots (Agent, nur lokal): `web/ui-tests/screenshots-nacharbeiten.spec.ts`, nur mit `COIN_SCREENSHOTS=1`, nach `web/test-results/screenshots-nacharbeiten/<ansicht>_<breite>_<hell|dunkel>.png` (nicht eingecheckt).
  - Ansichten: Katalog Tabelle und Karten (beide Varianten aus 4.5 für den Vergleich), Startseiten-Kopf, Prüfmaske mit den vier Ergebnissen (vorher/nachher im Dunkelmodus) und Änderungsprotokoll mit Filtern; jeweils 360, 768 und 1280 px, hell und dunkel.
  - Der Developer sieht alle Bilder an, und der Bericht nennt Befunde und Behebung.
- **AK-35** Keine neue Laufzeit- oder Entwicklungsabhängigkeit. `localStorage` enthält weiter nur `coin-theme` und `coin-katalog-ansicht`.
- **AK-36** Alle bisherigen Tests sind grün. Angepasst sind nur die Stellen aus Abschnitt 9 mit der dort genannten Regel (T = inhaltlich, Feature-Text Punkt 3; K = nur Locator, Bezugsstelle, Testhilfe; E = geänderte Erwartung; K und E freigegeben 2026-11-16, F2). Jede geänderte Testzeile steht mit Begründung im Commit und im Bericht.
- **AK-37** Doku: dieser Entwurf, ADR-0045 bis ADR-0047, `docs/api.md`, `docs/requirements.md` (Funktion 11), Begriff „Änderungsprotokoll“ in der Fachdoku (4.7) und Abschnitt 14 von `startseite-listen-pruefung.md` (erledigte Punkte als erledigt, offene mit Begründung).

## 8. Tests (Zuordnung)
| Ebene | Datei (neu, falls nicht anders vermerkt) | AK |
|---|---|---|
| Unit (xUnit) | `tests/Coin.UnitTests/Benutzer/AuditFilterTests.cs` (Format, Bereich 2000–2999, `von` > `bis`, 366/367 Tage, Schaltjahr, unbekannte/leere/doppelte Aktion, Meldungen wörtlich), `tests/Coin.UnitTests/Gemeinsam/BerlinTests.cs` (`TagesbeginnUtc` für 15.01., 29.03., 30.03., 01.07., 25.10., 26.10.2026) | 6, 10 |
| Integration | `tests/Coin.IntegrationTests/Audit/AuditFilterTests.cs` (Testdaten 10.2, Zeitraum inkl. Randtage und Zeitumstellung, Aktion, Benutzer, Kombinationen, `gesamt`, Blättern, alle `400`, nur lesen, Log ohne Query-Werte) | 1–6, 9 |
| Integration | `tests/Coin.IntegrationTests/Audit/AuditAktionenTests.cs`, Ergänzung in `Berechtigungen/RollenEndpunktMatrixTests.cs` (neuer Endpunkt, gefilterte Variante, Meldung neu) und `EndpunktTabelleTests` (Bestand) | 7, 8 |
| Integration | `tests/Coin.IntegrationTests/Audit/AuditFilterMessungTests.cs` (4.3) | 11 |
| Vitest | `web/src/app/router/suchparameter.test.ts` (ergänzt: `benutzerverwaltungSuche`), `web/src/features/audit-filtern/model/abfrage.test.ts`, `ui/ZeitraumFilter.test.tsx`, `ui/AktionFilter.test.tsx` | 13–17 |
| Vitest | `web/src/widgets/audit-log/ui/AuditLog.zeitraum-aktion.test.tsx` (Requests, Chips, Zurücksetzen, 400, Leer, Aktionsliste fehlt), `web/src/entities/audit/api/audit.test.ts` (ergänzt) | 13–18 |
| Vitest | `web/src/shared/ui/filterleiste.test.tsx` (ergänzt: `alleEntfernenText`, `alleEntfernenAb`), `aktionsmeldung.test.tsx`, `zustaende.test.tsx` (ergänzt: Fokus nach „Erneut versuchen“) | 15, 26, 28 |
| Vitest | `web/src/app/konsistenz.test.ts` (ergänzt: AK-23-Literalprüfung, AK-27, AK-29), Fokus-Tests in `AuditLog`, `CoinKatalog`, `StartSeite` | 23, 27–29 |
| Vitest | `web/src/entities/coin/ui/CoinListe.datentabelle.test.tsx` (`aria-sort`, Karten bei gestubbter Media-Query) | 30, 31 |
| UI-Test (gemockt) | `web/ui-tests/aenderungsprotokoll-filter.spec.ts` (Kernfall AK-19, URL, Zurück, Tastatur, Fokus nach Zurücksetzen, 400, „Audit-Log“ nirgends sichtbar) | 12–19, 23 |
| UI-Test | `web/ui-tests/nacharbeiten-gestaltung.spec.ts` (Logos 360/768/1280, Kartenhöhe 360 × 800, 4:3, Ergebniskarte dunkel, Katalog 360 Karten, Fokus nach „Erneut versuchen“ auf `/coins` und im Protokoll) | 20–22, 28, 31 |
| UI-Test | `barrierefreiheit.spec.ts`, `responsiv.spec.ts` (ergänzt um die Zustände aus AK-32/33) | 32, 33 |
| UI-Test | `web/ui-tests/screenshots-nacharbeiten.spec.ts` (nur mit `COIN_SCREENSHOTS=1`) | 34 |
| Systemtest (echte API) | `e2e/tests/aenderungsprotokoll-filter.spec.ts`: Der Administrator weist `betrachter@test.local` eine Rolle zu und deaktiviert/reaktiviert einen Testbenutzer (Rolle- und Status-Einträge). Er filtert nach heute (Von = Bis = heute in Europe/Berlin) und „Status“, sieht nur Status-Einträge und die Chips, lädt neu (Filter bleibt) und setzt zurück (alle Einträge). Filter auf gestern zeigt „Keine Einträge für diese Filter.“. Ein Betrachter erhält für `GET /api/audit?aktion=Status` per `request` 403. Dazu axe und 360 px ohne Überlauf, hell und dunkel | 8, 14–19, 32, 33 |

Die Lastmessung läuft nur als Integrationstest. Es gibt keinen parallelen Browserlauf. Gemeinsame Mocks (`/api/audit/aktionen`, Filterauswertung von `/api/audit`) kommen nach `web/test/fakeApi.ts` und `web/ui-tests/hilfen/` (Tester).

## 9. Änderungen an bestehenden Tests (K-Liste)
Regel: **T** = Feature-Text Punkt 3, Erwartung darf sich inhaltlich auf den neuen Text ändern (freigegeben durch den Auftrag). **K** = alte Regel, nur Locator, Bezugsstelle oder Testhilfe, Prüfinhalt bleibt. **E** = Die Erwartung ändert sich, weil der Feature-Text das Verhalten ändert. **K1–K3 und E1–E9 sind am 2026-11-16 freigegeben (F2).** Testnamen und Kommentare mit „Audit-Log“ darf der Tester mitziehen, sie zählen nicht als Erwartung. Wird eine weitere Stelle nur durch Anpassung grün, stoppt der Developer und meldet.

**T1 „Audit-Log“ → „Änderungsprotokoll“** (Locator-Namen von `tab`, `tabpanel`, `table`, `list` und Texte „… wird geladen …“/„… konnte nicht geladen werden.“):
- `web/ui-tests/barrierefreiheit.spec.ts:365`
- `web/ui-tests/benutzerverwaltung.spec.ts:553, 556, 566, 573, 643, 665, 685, 731, 737, 781, 782, 792`
- `web/ui-tests/rechte-unveraendert.spec.ts:304`
- `web/ui-tests/responsiv.spec.ts:359`
- `web/ui-tests/hilfen/uebersicht.ts:627, 628`
- `web/ui-tests/hilfen/rechte.ts:103, 106`
- `web/ui-tests/verwaltung.spec.ts:38, 51, 67, 272, 277, 301`
- `web/ui-tests/tabellen.spec.ts:40, 44`
- `web/ui-tests/screenshots-uebersicht.spec.ts:80, 210, 235`
- `web/src/app/App.startseite-listen-pruefung.test.tsx:160, 161`
- `web/src/app/App.benutzerverwaltung.test.tsx:454, 455`
- `web/src/entities/audit/ui/AuditTabelle.test.tsx:9, 22`
- `web/src/entities/audit/ui/AuditTabelle.zeit.test.tsx:29, 59`
- `web/src/entities/audit/ui/AuditTabelle.sortierung.test.tsx:32`
- `web/src/widgets/audit-log/ui/AuditLog.test.tsx:20, 21, 75, 95, 110, 117, 124, 131, 185`
- `web/src/widgets/audit-log/ui/AuditLog.filter.test.tsx:69, 180, 182, 269, 281`
- `web/src/pages/benutzerverwaltung/ui/BenutzerverwaltungSeite.aufbau.test.tsx:56, 72, 74, 93`
- `web/src/pages/benutzerverwaltung/ui/BenutzerverwaltungSeite.test.tsx:56, 63, 82, 84, 85, 91, 93, 98, 99, 102, 113, 122, 127`
- `e2e/tests/benutzerverwaltung.spec.ts:66, 67`

**T2 „System (Bootstrap)“ → „System (Ersteinrichtung)“:** `web/ui-tests/benutzerverwaltung.spec.ts:558`, `web/src/widgets/audit-log/ui/AuditLog.test.tsx:118, 134`, `web/src/entities/audit/ui/AuditTabelle.test.tsx:65`.

**T3 403-Meldung `audit.read`:** `tests/Coin.IntegrationTests/Berechtigungen/RollenEndpunktMatrixTests.cs:28`.

**T4 „z. B.“:** keine Änderung (F4).

| # | Datei:Zeile | Warum rot | Lösung |
|---|---|---|---|
| K1 | Testhilfen mit Catch-all bzw. Fake-API: `web/test/fakeApi.ts:488` (Audit-Mock der Fake-API), `web/ui-tests/hilfen/api.ts:322` (Audit-Mock von `richteApiEin`; maßgeblich auch für `richteFormularApiEin` in `hilfen/formulare.ts`, das keinen eigenen Audit-Mock hat), `web/ui-tests/hilfen/uebersicht.ts:566`, `web/ui-tests/benutzerverwaltung.spec.ts:218` | neuer Abruf `GET /api/audit/aktionen` ist nicht gemockt (`api.ungemockt` nicht leer) | Mock für `/api/audit/aktionen` ergänzen (Liste aus AK-7). Die Audit-Mocks werten `von`/`bis`/`aktion` aus (nur Testhilfe) |
| K2 | Tests, die Aktionsmeldungen als `p[role=alert]`/`p[role=status]` oder über Klassen wie `text-destructive`/`text-success` finden (betrifft die Dateien aus 4.8 und ihre Tests, z. B. `MotivbildHochladen*.test.tsx`, `VorlageHochladen*.test.tsx`, `StartseiteFormular*.test.tsx`, `BenutzerTabelle*.test.tsx`) | Meldung steht jetzt im `Alert` (div) mit Icon | nur falls rot: Locator auf `getByRole('alert'\|'status')` bzw. Text. Text und Rolle bleiben |
| K3 | Tests, die nach „Erneut versuchen“ `document.body` bzw. keinen Fokus erwarten (falls vorhanden) | Fokus liegt jetzt im Inhaltsbereich | nur falls rot: Bezugsstelle anpassen. Neues Verhalten prüft AK-28 |
| E1 | `web/src/widgets/audit-log/ui/AuditLog.filter.test.tsx:251–260` „bietet keine Bedienelemente für Zeitraum oder Aktion“ | Zeitraum und Aktion gibt es jetzt (Feature-Text 1e) | Test entfernen. AK-13 ersetzt ihn |
| E2 | `web/ui-tests/verwaltung.spec.ts:233–241` „bietet keinen Filter nach Zeitraum oder Aktion“ | wie E1 | Test entfernen, ersetzt durch `aenderungsprotokoll-filter.spec.ts` |
| E3 | `web/ui-tests/verwaltung.spec.ts:205–216` „setzt weder Namen noch Id des Benutzers in die URL“ | Die GUID steht jetzt in der URL (F1) | Erwartung: Name nicht in der URL, `benutzer=<GUID>` in der URL (Zeile 215 umkehren, 214 bleibt). `AuditLog.filter.test.tsx:200–211` bleibt grün (Widget ohne Router-Props schreibt keine URL) |
| E4 | `web/src/widgets/audit-log/ui/AuditLog.filter.test.tsx:304, 312, 314, 317, 322, 324` und `web/ui-tests/verwaltung.spec.ts:287, 298, 300` | Leerzustand heißt jetzt „Keine Einträge für diese Filter.“, Button „Filter zurücksetzen“ (A9) | Texte ersetzen. Wirkung (ohne `benutzerId`, Seite 1, Tabelle wieder da) bleibt |
| E5 | `web/ui-tests/responsiv.spec.ts:133` (`'katalog'` in der Schleife „lässt Tabellen … bei 360 px in ihrem Container scrollen“) | Katalog zeigt unter 768 px Karten, keine `table` (`expect(tabellen.length).toBeGreaterThan(0)` scheitert) | `'katalog'` aus der Schleife nehmen. Ersatz ist AK-31 in `nacharbeiten-gestaltung.spec.ts`. `'bausteine'` bleibt |
| E6 | `web/ui-tests/katalog-ansicht.spec.ts:106–113` (Standard „Tabelle“ bei 360 und 1280 px, `tabelle(page)` sichtbar) | bei 360 px Liste „Coins“ statt `table` | bei 360 px `aria-pressed` wie bisher, statt `tabelle(page)` die Liste „Coins“ mit `DatenTabelle`-Karten erwarten. 1280 px unverändert |
| E7 | `web/src/app/konsistenz.test.ts:28–35` (`AUSNAHMEN_ALARM`) mit Test Z. 85–91 „hält die Liste der Ausnahmen aktuell“ | Die drei Ausnahmen gibt es nach 4.8 nicht mehr | Liste leeren (Test wird strenger). Die neue Regel AK-27 kommt dazu |
| E8 | `web/ui-tests/rechte-unveraendert.spec.ts:306` (`endpunkte` von „Administrator /benutzerverwaltung“) | zusätzlich `GET /api/audit/aktionen` | Eintrag ergänzen. Neue Bedienelemente sind keine Buttons (Datumsfelder, Checkboxen), `NEU`/`NEU_ERLAUBT` (Z. 335–344) nur falls nötig um „Filter zurücksetzen“ ergänzen |
| E9 | `web/ui-tests/startseite-raster.spec.ts:159–174` (Schleife `[1280, 768]`, Logos in derselben Zeile wie der Titel) | Variante A (F3): bei 768 px stehen die Logos über dem Titel | 768 aus der Schleife nehmen, bei 768 px „beide Logos oberhalb des Titels, Bereitsteller links von Software“ erwarten. 1280 px unverändert |

**Weitere Testanpassungen bei der Umsetzung** (außerhalb des Wortlauts oben, gleiche Regel T bzw. K, Prüfinhalt unverändert):
- T1: `web/src/pages/benutzerverwaltung/ui/BenutzerverwaltungSeite.aufbau.test.tsx:92` (Text „Änderungsprotokoll“).
- K: `tests/Coin.UnitTests/Benutzer/BenutzerverwaltungServiceTests.cs:463` (Signatur des Fake-Repositorys auf `AuditFilter`).
- K: `tests/Coin.IntegrationTests/Berechtigungen/EndpunktTabelleTests.cs` (Wächter erwartet zwei Audit-Endpunkte).
- K: `web/test/hilfen.ts`, neue Testhilfe `statusBannerMit` (findet das Banner im `role="status"`-Container).
- K2 (Locator auf das Banner der `Aktionsmeldung`):
  - Vitest: `AusgabeDetailSeite.verlauf`, `AusgabenHistorie`, `ZertifikatsvorlageVerwalten`, `StartseiteVerwaltungSeite` (drei Stellen);
  - Playwright (gemockt): `web/ui-tests/bestaetigungen.spec.ts:214`, `coin-ausgaben.spec.ts:508`, `zertifikatsvorlagen.spec.ts:504`;
  - Systemtest: `e2e/tests/formulare-detailseiten.spec.ts:153`.
- K: Der Test der Tab-Reihenfolge (AK-13) fasst die Tab-Stopps des nativen Datumsfelds (Tag, Monat, Jahr je nach Browser) zu einem Feld zusammen.

Unverändert grün bleiben voraussichtlich `AuditLog.filter.test.tsx:79–85` (genau eine Combobox), `:239–249` und `verwaltung.spec.ts:154–160`, `:188–203` (keine weiteren Parameter ohne gesetzte Filter), `startseite.spec.ts:733–748` (höchstens 96 px), `CoinListe.test.tsx` (Desktop-Media-Query, `leer` bleibt „Noch keine Coins erfasst.“) und `e2e/tests/coin-katalog.spec.ts:113`, `katalog-seiten.spec.ts:131` (1280 px, Badge „unbekannt“).

## 10. Testdaten
### 10.1 Rollen
anonym, ohne Rolle, Betrachter, Sachbearbeiter, Administrator, deaktivierter Administrator.

### 10.2 Zeitpunkte für Zeitraumtests (UTC, direkt per INSERT im Integrationstest)
| Stichtag (Berlin) | letzter Eintrag davor | erster Eintrag des Tages | letzter Eintrag des Tages | erster Eintrag danach |
|---|---|---|---|---|
| 15.01.2026 (Winter) | 2026-01-14T22:59:59.999999Z | 2026-01-14T23:00:00Z | 2026-01-15T22:59:59.999999Z | 2026-01-15T23:00:00Z |
| 29.03.2026 (23 h) | 2026-03-28T22:59:59.999999Z | 2026-03-28T23:00:00Z | 2026-03-29T21:59:59.999999Z | 2026-03-29T22:00:00Z |
| 01.07.2026 (Sommer) | 2026-06-30T21:59:59.999999Z | 2026-06-30T22:00:00Z | 2026-07-01T21:59:59.999999Z | 2026-07-01T22:00:00Z |
| 25.10.2026 (25 h) | 2026-10-24T21:59:59.999999Z | 2026-10-24T22:00:00Z | 2026-10-25T22:59:59.999999Z | 2026-10-25T23:00:00Z |

Je Zeitpunkt gibt es einen Eintrag `Rolle` und einen `Status`, verteilt auf zwei Benutzer. Daraus ergeben sich die Kombinationsfälle für AK-4 und AK-5.

## 11. Bezug zu startseite-listen-pruefung Abschnitt 14
Nach der Umsetzung markiert der Docs-Agent dort:
- **erledigt:**
  - Filter nach Zeitraum und Aktion;
  - „z. B.“-Texte (geprüft, keine echte Uneinheitlichkeit, unverändert);
  - „System (Bootstrap)“;
  - Reiter/Tabelle „Audit-Log“ neben „Änderungsprotokoll“;
  - Aktionsmeldungen `<p role="alert">`;
  - `CoinListe` auf `DatenTabelle` (inkl. unerreichbarem Leertext als `<p>`);
  - Fokus nach „Erneut versuchen“;
  - Logos bei 768 px;
  - Katalogkarte bei 360 px;
  - „nicht gefunden“ im Dunkelmodus.
- **offen mit Begründung:**
  - Filter „Geändert von“ (Ausführender): nicht beauftragt;
  - weitere Katalogfilter und Verfügbarkeits-Chips: API-Erweiterung, nicht beauftragt;
  - Ansichtsumschalter bei 768 px in eigener Zeile: nicht beauftragt;
  - Gruppe „Ausgabe“ der Ergebniskarte mit freiem Platz: nicht beauftragt;
  - `Rangliste` mit getrennten sr-only-Spans: nicht beauftragt;
  - Seitenleisten-Artefakt in Ganzseiten-Screenshots: kein Fehler.

## 12. Entscheidungen des Auftraggebers (2026-11-16)
Der Auftraggeber hat alle vier Empfehlungen angenommen.
- **F1 Benutzer in der URL:** Nur die GUID kommt in die URL (`benutzer=<guid>`), nie der Name. Der Chip zeigt den Namen aus den geladenen Einträgen, ohne Treffer „Benutzer: unbekannt“. Das löst startseite-listen-pruefung AK-29 („weder Name noch Id in der URL“) für die Id ab (ADR-0045 Punkt 4).
- **F2 Testanpassungen:** K1–K3 und E1–E9 (Abschnitt 9) sind freigegeben.
- **F3 Logos bei 768 px:** Variante A. Von 640 bis 1023 px stehen beide Logos in einer Zeile über dem Titel (4.6). Die Mindesthöhen gelten bis zum Seitenverhältnis 2,5 : 1, E9 gilt.
- **F4 „z. B.“:** Beide Hilfetexte bleiben unverändert, weil es keine echte Uneinheitlichkeit gibt. Der Bericht vermerkt das.

## 13. Auffälligkeiten des Architekten (nicht im Umfang)
- Spalte „Änderung“ der Tabelle neben der Filtergruppe „Aktion“: zwei Wörter für dieselbe Sache (R3).
- `widgets/app-shell/ui/Kopfzeile.tsx` zeigt einen Fehler als eigenes `div role="alert"`, kein Formular und daher nicht in 4.8 (bewusst, Ausnahme im Code-Test).
- Der Fachbegriff „Änderungsprotokoll“ fehlt in `CLAUDE.md` (Fachbegriffe). Nur der Mensch darf `CLAUDE.md` ändern.

## 14. Umsetzung: Abweichungen, Messung und verbleibende Auffälligkeiten

### 14.1 Abweichungen vom Entwurf
1. **Katalogkarten (4.5): Variante B.** Unter 640 px kompakte Karte mit Bild `size-20` (80 px) links neben dem Text, ab 640 px Bildfeld 4:3 mit `object-contain`. Begründung: Bei 360 × 800 px ist eine Karte etwa 155 statt 315 px hoch, es passen über vier statt gut zwei Karten auf einen Bildschirm. Variante A ist nicht im Code.
2. **Baustein `Inhaltsbereich`** (`shared/ui/zustaende.tsx`, neu, 4.9): stabiler Wrapper mit `data-inhaltsbereich`, `tabIndex=-1` und Fokusring. Er umschließt Coin-Detail, Coin-Bearbeiten, Ausgabe erfassen und Ausgabe-Detail. Statt des Rückfalls auf `main#inhalt` (4.9 Punkt 3) ist dort der Inhaltsbereich das Ziel.
3. **`Fehlerzustand` mit `fokusUeberschrift`** (Standard `true`): Mit `false` erhält das Ziel selbst den Fokus statt seiner ersten Überschrift. Genutzt auf den vier Seiten aus Punkt 2 und auf der Startseite (mit eigenem `fokusZiel`), weil dort das h1 beim Neuladen ausgehängt wird.
4. **sr-only h2 „Ergebnisse“** vor der Katalogliste (`CoinKatalog`): behebt den axe-Befund `heading-order` bei 360 px (h3 der Karten direkt nach der h1).
5. **Checkboxen als Button:** Die `Checkbox` im `AktionFilter` wird als `<button type="button">` gerendert (`nativeButton`); die umgebende `label` mit `htmlFor` bildet die Klickfläche ≥ 40 px.
6. **`BenutzerFilter` mit Prop `fehler`:** zeigt `errors.benutzerId` der API am Feld (4.4 nannte nur `von`, `bis`, `aktion`).
7. **Datumsfelder:** `ZeitraumFilter` übernimmt nur leere Felder und vollständige Daten im Bereich 2000-01-01 bis 2999-12-31. Zwischenwerte beim Tippen bleiben lokal im Feld und lösen weder Request noch Verlaufseintrag aus.
8. **Seite hinter dem Ende:** Liefert eine Seite > 1 keine Einträge, zeigt das Änderungsprotokoll „Auf dieser Seite gibt es keine Einträge.“ mit Blättern.
9. **Kopfbereich (4.6):** Die Anordnung entsteht über Rasterplätze (`col-start`/`row-start`) statt `grid-template-areas`; DOM-Reihenfolge und Ergebnis wie entworfen.
10. **`Aktionsmeldung`:** Ein fokussierbares Erfolgs- oder Hinweisbanner hat keine eigene Rolle statt `role="none"` (axe `presentation-role-conflict`). Eingesetzt in 16 Dateien, dazu die Bausteinseite.

### 14.2 Messung und Index (4.3, AK-11)
`AuditFilterMessungTests`, 6.000 Zeilen, je 3 Aufwärm- und 20 Messläufe:

| Abfrage | Median | p95 | `gesamt` |
|---|---|---|---|
| ohne Filter | 12,3 ms | 17,7 ms | 6001 |
| Zeitraum 30 Tage | 11,0 ms | 15,3 ms | 246 |
| Zeitraum 366 Tage | 11,3 ms | 15,9 ms | 3008 |
| `aktion=Status` | 11,4 ms | 16,2 ms | 3000 |
| 90 Tage + `aktion=Rolle` + Benutzer | 10,7 ms | 14,7 ms | 19 |

Der Plan der Kombination nutzt `ix_benutzer_audit_benutzer` (Bitmap Index Scan), 366 Tage laufen als Seq Scan mit etwa 0,5 ms. Alle Mediane liegen unter der Schwelle von 100 ms: **kein neuer Index, keine Migration** (Nachtrag in ADR-0045).

### 14.3 Verbleibende Auffälligkeiten
- Ein vollständig getipptes Datum außerhalb 2000–2999 wird im Frontend stillschweigend ignoriert, ohne Meldung (vorher kam `400` von der API).
- Das Überschreiben von Tag oder Monat eines gefüllten Datums kann bis zu zwei Requests bzw. Verlaufseinträge erzeugen.
- `Fehlerzustand` setzt `tabindex` und Fokusring-Klassen am Ziel per DOM und nimmt sie beim `blur` zurück.
- Die Kartenansicht des Katalogs ist bei 768 px einspaltig mit großem Bild.
- Sehr breite Logos (über 2,5 : 1) werden in der festen Box unter die Mindesthöhe verkleinert (4.6, Ausnahme).
- `Kopfzeile.tsx` behält ein eigenes `role="alert"` (bewusst, Abschnitt 13).
- Spalte „Änderung“ neben dem Filter „Aktion“: zwei Wörter für dieselbe Sache (R3).
- Der Bestandstest `BenutzerTabelle.test.tsx` ist unter Last instabil (Zeitüberschreitungen).
- In vollen Läufen sind einzelne UI- und Systemtests unter Speicherlast instabil, einzeln aber grün.
- „z. B.“-Texte bleiben unverändert (F4).
