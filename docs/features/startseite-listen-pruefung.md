# Feature: Startseite, Listen und Prüfmaske neu gestalten

Status: Umgesetzt (Entscheidungen des Auftraggebers vom 2026-11-15 in Abschnitt 12, Konsistenz-Durchgang in Abschnitt 13, Abweichungen und offene Punkte in Abschnitt 14) · Datum: 2026-11-15 · Branch: `feature/startseite-listen-pruefung` · ADRs: [0043](../adr/0043-uebersichtsmuster-startseitenraster-katalog-pruefmaske.md) (neu, Raster der Startseite, Katalogansichten, Prüfmaske), [0044](../adr/0044-ansichtswahl-lokal-speichern.md) (neu, Ansichtswahl im `localStorage`). Grundlage: [design-fundament](design-fundament.md) (ADR-0035 bis 0038), [formulare-detailseiten](formulare-detailseiten.md) (ADR-0039 bis 0042), [startseite](startseite.md), [katalog-seiten](katalog-seiten.md), [hologrammnummer](hologrammnummer.md), [rollen-benutzerverwaltung](rollen-benutzerverwaltung.md)

## 1. Ziel
Der erste Eindruck und die häufigsten Arbeitsschritte (Suchen, Prüfen, Überblick) sollen klar strukturiert sein. Fachlich ändert sich nichts. Dieser Lauf erledigt die Vormerkung „Listen der Übersicht, Startseite, Prüfmaske“ aus formulare-detailseiten Abschnitt 14 (F6).

**Nicht dazu:** neue Auswertungen oder Diagramme, neue Fachfunktionen, Änderungen an API und Datenbank, Filter des Audit-Logs nach Zeitraum und Aktion (eigener Lauf, F5), Brotkrumen auf bestehenden Seiten, Toast statt Statusmeldung.

**Datenmodell und API:** keine Änderung. `docs/api.md` und `docs/berechtigungen.md` bleiben unverändert. Was die API nicht liefert, zeigt die Oberfläche nicht an.

## 2. Ist-Stand (geprüft im Code)
| Bereich | Ist | Folge |
|---|---|---|
| Startseite `widgets/startseite/StartseiteBloecke` | ein Raster `lg:grid-cols-3`. Kopf und Infotext belegen 3 Spalten, Kennzahlen, Neueste und Meistausgegebene je 1 Spalte. Bei 2 aktiven Kleinblöcken oder getrennter Reihenfolge (z. B. Kennzahlen, Infotext, Neueste) bleiben 1–2 leere Zellen je Zeile. | Raster in Zeilen (4.1, ADR-0043) |
| Kopfbereich `entities/startseite/Kopfbereich` | flex, Titel `text-2xl`, Logos bis 96 px auf `bg-logo-surface`, ohne Fläche | Kopf als hervorgehobene Fläche |
| Kennzahlen `KennzahlenBlock` | `dl` mit 4 Zeilen „Begriff – Zahl“ in einer Blockkarte | 4 `KennzahlKarte` in einer `dl` |
| Neueste / Meistausgegebene | `ul` mit 48-px-Bild bzw. `ol list-decimal` mit „{n} ausgegeben“; Leertexte als `<p>` | Kacheln bzw. Rangliste mit Rangzahl |
| Startseite Fehler | `Fehlerzustand` ohne „Erneut versuchen“ | Button ergänzen (Konsistenz) |
| Katalog `widgets/coin-katalog`, `entities/coin/CoinListe` | Suchformular (`role="search"`, Feld 256 px, Button „Suchen“), Statuszeile, Fehler als `<p role="alert">`, Leertexte als `<p>`, shadcn-Tabelle (Bild, Name, Herausgeber, Auflage, Erfasst am), Blättern. Suche und Seite in der URL (`suche`, `seite`). | Filterleiste, Ansichtsumschalter, Karten, Leerzustand |
| Katalog-API | `GET /api/coins` kennt nur `suche`, `seite`, `groesse`; feste Sortierung nach Name. Das Coin-DTO enthält kein Verfügbarkeitsfeld. | Filter nur „Suche“, Chip nur „Auflage unbekannt“ (F2, F3) |
| Prüfmaske `features/zertifikat-pruefen` | Formular `max-w-xl`: Coin (Combobox) über Hologrammnummer (Pflicht, `*` + sr-only „(Pflichtfeld)“), Button „Prüfen“. Ergebnis in dauerhafter Live-Region (`role="status"`, `aria-live="polite"`) als `h2` mit Icon und linkem Farbbalken, darunter „Geprüfte Nummer: …“ und eine `dl`. Nach Enter bleibt der Fokus im Feld. Nach Klick auf „Prüfen“ liegt er auf dem Button. | Ergebniskarte, Gruppen, Fokus nach jeder Prüfung |
| Benutzerverwaltung | Seitenkopf, Reiter „Benutzer“/„Audit-Log“, je Panel eine Karte ohne Überschrift. Karten der `DatenTabelle` haben h3 → Sprung h1 → h3. | einheitlicher Aufbau (4.4) |
| Audit-Log `widgets/audit-log` | `GET /api/audit?seite&groesse`, 25 je Seite, ohne Filter im UI. Zeitpunkt über `Intl` `dateStyle: medium` in **lokaler** Zeitzone (sonst überall Europe/Berlin). Die API filtert nur nach `benutzerId` (geänderter Benutzer), nicht nach Zeitraum oder Art. | Benutzerfilter in diesem Lauf, Zeitraum/Aktion später mit API (F5) |
| Startseite verwalten | Seitenkopf mit „Zuletzt gespeichert …“ (eigene Formatfunktion mit „Uhr“), Reiter „Bearbeiten“/„Vorschau“ | auf gemeinsame Formatfunktion, Aufbau wie Benutzerverwaltung |
| Bausteine | `KennzahlRaster` fest `sm:grid-cols-3`, `KennzahlKarte` Wert `text-2xl`; `Filterleiste`, `DatenTabelle` (Prop `ansicht`), `Leerzustand`, `Fehlerzustand`, `Seitenkopf` vorhanden | kleine Erweiterungen, neue Bausteine `Ansichtsumschalter`, `Rangliste`, `Ergebniskarte` (4.6) |

## 3. Annahmen
- A1: Bestehende Überschriften, Feld-, Link- und Buttonnamen, Status-, Leer- und Fehlertexte bleiben wortgleich. Sie sind Prüfinhalt (z. B. „Noch keine Coins im Katalog.“, „1.234 ausgegeben“, Ergebnis-Überschriften der Prüfung). Neue Texte kommen hinzu.
- A2: „Kleiner Bildschirm“ heißt < 768 px, „breit“ heißt ≥ 1024 px (`lg`), wie bisher (design-fundament A4, Abweichung 2).
- A3: Die Startseite hat höchstens einen Block je Art (ADR-0030). Die Reihenfolge bestimmt die Konfiguration, das Raster ändert sie nie.
- A4: Die Prüfmaske bleibt auf `/pruefung` mit `coins.read`. Requests, Endpunktwahl (`…/mit-empfaenger` nur mit `issues.read`), Mindestdauer und Ratenbegrenzung bleiben unverändert. Das Design ändert nur die Darstellung derselben Antwortfelder.
- A5: „Ansprache“ heißt Sie-Form oder neutraler Infinitiv („Bitte später erneut versuchen.“). Du-Form und englische Texte gibt es nicht.
- A6: Der Benutzerfilter im Audit-Log gilt für den **geänderten** Benutzer (API-Parameter `benutzerId`), nicht für den Ausführenden (entschieden, Abschnitt 12).

## 4. Entwurf

### 4.1 Startseite `/` (ADR-0043 Punkt 1)
**Raster ohne Lücken.** `StartseiteBloecke` teilt die aktiven Blöcke in Reihenfolge in Zeilen:
- `kopf`, `infotext` und `kennzahlen` belegen immer eine eigene, volle Zeile.
- `neueste` und `meistausgegeben` teilen sich ab 1024 px eine Zeile mit zwei gleich breiten Spalten, **wenn sie in der Reihenfolge direkt aufeinander folgen**. Sonst belegt jeder eine volle Zeile.
- Unter 1024 px steht jeder Block in einer eigenen Zeile.
- Zwischen allen Zeilen und Spalten liegt derselbe Abstand `gap-6` (24 px). Blöcke einer Zeile sind gleich hoch (`items-stretch`).
- Deaktivierte Blöcke sind nicht im DOM (wie bisher). Ein leerer Block (Liste ohne Einträge) bleibt als Karte mit seinem Leertext sichtbar und füllt seine Zelle.
- Ohne Kopfbereich steht die Begrüßung „Willkommen bei C.O.I.N.“ als eigene volle Zeile oben (wie bisher).
- Umsetzung: Je Zeile ein `div` mit `grid` (`lg:grid-cols-2` nur bei Paarzeilen). Es gibt keine Spalten mit fester Anzahl, in denen Zellen leer bleiben könnten.

**Kopfbereich (prominent).**
- Fläche `bg-card`, Rahmen, `rounded-xl`, Innenabstand `p-6 md:p-8`.
- Reihenfolge Logo Bereitsteller, Titel/Untertitel, Logo Software (unverändert). Ab 640 px drei Spalten im Verhältnis 1:3:1 (Logo | Titel | Logo), Titel mittig; die Logos schrumpfen mit ihrer Spalte. Ohne Logos nur der Titel. Unter 640 px untereinander, Logos linksbündig.
- Titel `text-2xl lg:text-3xl font-semibold` (erst ab 1024 px größer, damit der Titel bei 768 px ohne Silbentrennung steht; AK-4 gilt bei 1280 px), Untertitel `text-lg text-muted-foreground`.
- Logos bleiben höchstens 96 px hoch (startseite AK-20), auf `bg-logo-surface`.
- Ohne `coins.read` gilt dieselbe Darstellung (Kopf bzw. Begrüßung mit Einleitung in derselben Fläche).

**Kennzahlen.**
- `<section aria-labelledby>` mit h2 „Kennzahlen“, **ohne** äußere Blockkarte. Darin `KennzahlRaster` mit 4 `KennzahlKarte`: „Coins“, „Exemplare gesamt“, „Ausgegeben“, „Verfügbar“.
- Die `dd` enthält nur die Zahl (de-DE). Wert in Größe `gross` (`text-3xl`), Begriff `text-sm text-muted-foreground`.
- Spalten: 1 unter 640 px, 2 ab 640 px, 4 ab 1024 px.
- Kein Fortschrittsbalken (neue Auswertung, nicht dazu).

**Neueste Coins.**
- Blockkarte (`BlockAbschnitt`, h2) mit `ul` aus Kacheln. Je Kachel: Motivbild 48 px dekorativ (`alt=""`) bzw. Platzhalterfläche, Name als Link (Klickfläche ≥ 40 px, ganze Kachel nicht klickbar), Herausgeber darunter.
- Kachelspalten nach Breite der Blockkarte (Container-Query, Tailwind `@container`): 1 Spalte unter 24rem, 2 ab 24rem (`@sm`), 3 ab 48rem (`@3xl`). 24rem statt 28rem, damit die Kacheln in der Paarzeile ab 1024 px zweispaltig und die Paarzeile ausgewogen bleibt.
- Leer: `Leerzustand` (Titelebene 3) mit Titel „Noch keine Coins im Katalog.“ (Text unverändert), ohne Aktion.

**Meistausgegebene Coins.**
- Blockkarte mit Baustein `Rangliste` (4.6): `<ol>` ohne Browser-Nummerierung. Je Eintrag links eine Rangzahl in einem Kreis (`size-10`, `bg-muted`, `tabular-nums`), sichtbar „1“, für Screenreader „Platz 1“ (sr-only-Präfix „Platz “). Daneben der Name als Link und rechtsbündig „{n} ausgegeben“ (Text unverändert, eigenes Element).
- Zeilen durch `Separator` getrennt, kompakt (`py-2`).
- Leer: `Leerzustand` (Titelebene 3) „Noch keine Coins ausgegeben.“.

**Infotext:** Blockkarte `<section aria-label="Information">` ohne Überschrift (unverändert), Text in `max-w-reading`.

**Weiteres:** „Zum Katalog“ bleibt am Ende. Der Seitenfehler (mit `coins.read`) bekommt „Erneut versuchen“ (lädt `GET /api/startseite` genau einmal neu). Die Vorschau auf `/verwaltung/startseite` nutzt dasselbe Widget (Ebene 2) und zeigt dieselben Zeilen.

### 4.2 Katalog `/coins` (ADR-0043 Punkt 2, ADR-0044)
**Aufbau** (von oben):
1. `Seitenkopf` „Katalog“ mit Beschreibung „Alle Gedenk-Coins mit Motiv, Herausgeber und Auflage.“ und Aktion „Coin hinzufügen“ (nur `coins.write`, unverändert).
2. Karte mit der **Filterleiste**:
   - Suchformular `role="search"`, Feld „Coins suchen“ (Label unverändert) in voller Breite der Leiste (ab 768 px `flex-1`, höchstens `max-w-reading`), Höhe 48 px (`h-12 text-base`), Lupe als Präfix (`InputGroup`, `aria-hidden`), Button „Suchen“ (Größe `lg`).
   - Rechts in derselben Leiste der `Ansichtsumschalter` „Ansicht“ mit „Tabelle“ und „Karten“.
   - Darunter die Chips: bei aktivem Suchbegriff genau ein Chip „Suche: {Begriff}“. Entfernen setzt `suche` leer und `seite` 1 (Fokus nach Filterleiste-Regel).
   - Weitere Filter gibt es nicht, weil die API keine weiteren Parameter hat (F2).
3. Statuszeile `role="status"` („Coins werden geladen …“, „{n} Coins gefunden“, unverändert).
4. Inhalt: Tabelle oder Karten, darunter `Blaettern`.

**Suche und Paging:** unverändert serverseitig. Absenden schreibt `suche` in die URL und setzt `seite` auf 1. Die Ansicht wechselt nie die Seite und löst keinen Request aus. Es gibt keine Live-Suche und kein clientseitiges Filtern innerhalb einer Seite.

**Tabellenansicht** (`CoinListe`, Bestand, auf `DatenTabelle` mit `ansicht="tabelle"`):
- Caption „Coins“, Spalten Bild, Name, Herausgeber, Auflage, Erfasst am (unverändert), Zeilenklick wie bisher.
- „Auflage“: `tabular-nums`, rechtsbündig. Ohne Auflage zeigt die Zelle den Chip `Badge warning` mit dem Text „unbekannt“ (ein Element, Text unverändert).
- Unter 768 px scrollt die Tabelle in ihrem Container wie bisher (design-fundament AK-15 gilt für den Katalog weiter, ADR-0041 Punkt 8).

**Kartenansicht** (neu `entities/coin/ui/CoinKarten.tsx`):
- `<ul aria-label="Coins">` mit je einer `Card` (`li`).
- Inhalt je Karte: Motivbild oben (Seitenverhältnis 1:1, `object-contain`, `alt="Motiv: {Name}"` wie in der Tabelle, `loading="lazy"`) oder Fläche mit Icon (`aria-hidden`) und Text „Kein Bild“; Name als h3 mit Link auf die Detailseite; Herausgeber; `dl` mit „Auflage“ und „Erfasst am“; Chip „Auflage unbekannt“ (`warning`), wenn `auflage = null`.
- Ein Klick irgendwo in die Karte öffnet die Detailseite (`useZeilenklick`). Tab-Stopp ist nur der Link.
- Spalten: 1 unter 640 px, 2 ab 640 px, 3 ab 1024 px, 4 ab 1280 px Inhaltsbreite (Container-Query).

**Ansichtswahl (ADR-0044):**
- `Ansichtsumschalter` (`shared/ui/ansichtsumschalter.tsx`): umgesetzt mit dem freigegebenen Ersatz, zwei `Button` mit `aria-pressed` in einer `role="group"` mit `aria-label="Ansicht"` (ADR-0043, Nachtrag). Elemente „Tabelle“ (`TableIcon`) und „Karten“ (`LayoutGridIcon`), Icons `aria-hidden`, Text sichtbar, je ≥ 40 × 40 px. Ein Klick auf das gewählte Element ändert nichts.
- Standard ist „Tabelle“ auf allen Breiten (F1).
- Die Wahl steht in `localStorage` unter `coin-katalog-ansicht` mit den Werten `tabelle` oder `karten`. Ungültige oder fehlende Werte heißen „Tabelle“. Ist der Speicher nicht verfügbar, gilt die Wahl nur bis zum Verlassen der Seite (kein Fehler).
- Die Wahl steht nicht in der URL (F7).

**Zustände:**
- Laden ohne vorherige Daten: `Ladeanzeige form="tabelle"` bzw. `"karte"` (Statustext bleibt in der Statuszeile).
- Fehler: `Fehlerzustand` mit dem bisherigen Text „Coins konnten nicht geladen werden. Bitte später erneut versuchen.“ und „Erneut versuchen“ (gleiche Suche und Seite neu). Fokusführung wie bisher (`useFokusBeiLadefehler`).
- Leer ohne Suchbegriff: `Leerzustand` (h2) „Noch keine Coins erfasst.“, ohne Aktion. Der Link „Coin hinzufügen“ steht schon im Seitenkopf, ein zweiter Link gleichen Namens entfällt.
- Leer mit Suchbegriff: `Leerzustand` (h2) „Keine Coins gefunden.“ mit Beschreibung „Prüfen Sie die Schreibweise oder suchen Sie nach einem anderen Begriff.“ und Button „Suche zurücksetzen“ (wie Chip entfernen).
- Seite hinter dem Ende: „Auf dieser Seite gibt es keine Coins.“ (unverändert) als `Leerzustand` (h2).

### 4.3 Prüfmaske `/pruefung` (ADR-0043 Punkt 3)
**Seitenaufbau („zentrale, ruhige Arbeitsseite“):**
- Seitenkopf und Inhalt stehen in einer Spalte `max-w-reading` (45rem), die innerhalb der Shell horizontal zentriert ist (`mx-auto w-full`). Seitenkopf unverändert (h1 „Zertifikat prüfen“, Beschreibung). Keine Aktionen, kein weiterer Inhalt.
- Karte 1 „Eingabe“ (ohne sichtbare Überschrift, keine zusätzliche h2): Formular. Karte 2 (nur nach einer Prüfung gefüllt): Ergebnis.
- Die Live-Region (`role="status"`, `aria-live="polite"`) bleibt ein dauerhaft vorhandenes Element. Die Ergebniskarte rendert in ihr.

**Formular:**
- Ab 768 px zwei Spalten in DOM- und Sichtreihenfolge: links „Coin (optional)“ (Combobox, Bestand), rechts „Hologrammnummer“, darunter rechtsbündig „Prüfen“. Unter 768 px untereinander. Die Reihenfolge Coin → Nummer → Prüfen bleibt: Der Coin wird einmal gewählt, dann werden nacheinander Nummern geprüft.
- „Hologrammnummer“ ist das große Feld: `h-12`, `text-lg`, `font-mono`, `tracking-wide`. Pflicht über `Formularfeld pflicht` (sichtbar „(Pflicht)“, im Namen „(Pflichtfeld)“, Muster ADR-0039). Hilfetext: „Leerzeichen und Bindestriche sind erlaubt. Groß- und Kleinschreibung spielt keine Rolle.“ Fehler am Feld (bestehende Meldungen).
- „Prüfen“: `Button size="lg"` mit `laedt` während der Anfrage (statt nur `disabled`), nach `429` gesperrt wie bisher (`aria-disabled`).

**Fokus nach der Prüfung (Kern):**
- Nach jeder abgeschlossenen Prüfung (Ergebnis, Feldfehler, Alarm) liegt der Fokus im Feld „Hologrammnummer“, unabhängig davon, ob per Enter oder per Klick auf „Prüfen“ geprüft wurde.
- Nach einem Ergebnis ist der Feldinhalt vollständig markiert (`select()`). Tippen ersetzt die alte Nummer, Enter prüft die neue (F4). Das Tippen blendet das alte Ergebnis aus (Bestand, hologrammnummer AK-30).
- Der gewählte Coin bleibt erhalten.
- Der Fokus springt nie auf die Ergebniskarte. Die Ansage übernimmt die Live-Region.

**Ergebniskarte:**
- `Card` mit Rahmen in der Statusfarbe (`border-2`) und Kopfbereich auf der zugehörigen `*-subtle`-Fläche:

| Ergebnis | h2 (unverändert) | Icon (lucide, `aria-hidden`, `size-8` im Kreis) | Farbe |
|---|---|---|---|
| gültig | „Zertifikat gültig“ | `CircleCheckIcon` | `success` / `success-subtle` |
| storniert | „Ausgabe storniert, Zertifikat ungültig“ | `BanIcon` | `destructive` / `destructive-subtle` |
| falscher Coin | „Die Nummer gehört nicht zu diesem Coin.“ | `TriangleAlertIcon` | `warning` / `warning-subtle` |
| nicht gefunden | „Nummer nicht gefunden. Das Zertifikat kann nicht bestätigt werden.“ | `SearchXIcon` | `muted-foreground` / `muted` |

- Die h2 hat `text-xl md:text-2xl font-semibold` in der Statusfarbe (Kontrast ≥ 4,5:1 auf der Fläche, im Kontrasttest der Tokens schon geprüft). Darunter „Geprüfte Nummer: {Anzeigeform}“ (unverändert, `text-foreground`).
- Unterscheidung ohne Farbe: Text der h2 und Icon. Beide sind je Ergebnis verschieden.
- **Datensatz** (nur bei gültig/storniert) unter dem Kopf in Gruppen. Je Gruppe eine h3 und eine eigene `dl`. Begriffe, Werte und Reihenfolge sind unverändert:

| Gruppe (h3) | Begriffe | sichtbar |
|---|---|---|
| „Coin und Exemplar“ | Coin (Link), Exemplar | immer |
| „Zertifikat“ | Zertifikatsnummer, Hologrammnummer | immer |
| „Ausgabe“ | Ausgabedatum, Status | immer |
| „Empfängerdaten“ | Empfänger (Name, Dienstgrad, Dienststelle), Gelegenheit, Begründung, Ausgebende Stelle | nur wenn die Prüfung über `…/mit-empfaenger` lief **und** die Antwort die Felder enthält (wie bisher) |

  Ab 768 px stehen die Gruppen zweispaltig (`sm:grid-cols-2`), Empfängerdaten über die volle Breite. „Zur Ausgabe“ (nur mit Empfängerdaten, unverändert) steht unter den Gruppen als sekundärer Button-Link.
- Es gibt keine weiteren Felder, Zähler, Zeitstempel oder Hinweise aus der Antwort. Der Storno-Grund erscheint nie (die Antwort enthält ihn nicht, das Frontend liest kein solches Feld). Kein Gruppen- oder Begriffstext enthält „Grund“.
- Alarme (`429`, kein Zugriff, Fehler) bleiben `role="alert"` mit unveränderten Texten, jetzt als `Hinweisbanner destructive` bzw. `warning` (`429`) oberhalb der Ergebniskarte.

### 4.4 Verwaltung: Benutzerverwaltung, Audit-Log, Startseite verwalten
**Einheitlicher Seitenaufbau** (beide Seiten gleich):
- `Seitenkopf` mit h1 (unverändert) und einer Beschreibung:
  - Benutzerverwaltung: „Rollen vergeben, Benutzer deaktivieren und Änderungen nachvollziehen.“
  - Startseite verwalten: bestehende Zeile „Zuletzt gespeichert am …“, sonst „Blöcke der Startseite ein- und ausschalten, ordnen und mit Inhalt füllen.“
- Darunter die Reiter (Bestand, Namen unverändert). Je Panel eine `Card` mit `CardTitle ebene={2}` und optional `CardDescription`:
  - „Benutzer“: h2 „Benutzer“, Beschreibung „Rollen und Status aller Benutzer, die sich schon einmal angemeldet haben.“
  - „Audit-Log“: h2 „Änderungsprotokoll“, Beschreibung „Rollen- und Statusänderungen, neueste zuerst. Einträge lassen sich nicht ändern oder löschen.“ (eigener Name, damit `tabpanel`/`table` „Audit-Log“ eindeutig bleiben).
  - „Bearbeiten“/„Vorschau“: Formular bzw. Vorschau wie bisher. Das Formular hat schon Block-Karten mit h2. Die Vorschau bekommt keine zusätzliche h2 (ihre Blöcke beginnen mit h2).
- Damit gibt es keinen Sprung h1 → h3 mehr.

**Audit-Log:**
- Filterleiste über der Tabelle mit genau einem Filter (F5, Variante A):
  - **Benutzer** (= geänderter Benutzer): Combobox „Benutzer“ mit Hilfetext „Zeigt Änderungen an diesem Benutzerkonto.“ Die Suche läuft über `GET /api/benutzer?suche=…&groesse=20`, 300 ms verzögert, Einträge nur mit Namen, nie mit E-Mail. Die Wahl lädt `GET /api/audit?benutzerId=…&seite=1`. Chip „Benutzer: {Name}“.
  - Es gibt **keinen** Filter nach Zeitraum oder Aktion, auch nicht clientseitig. Ein Filter im Browser sähe nur die geladene Seite (25 Einträge) und zeigte ein unvollständiges Ergebnis als vollständig. Das Laden aller Seiten ist unbegrenzt (Audit unbegrenzt aufbewahrt). Beide Filter kommen in einem eigenen Lauf mit API-Erweiterung und eigenem ADR (Abschnitt 14).
  - Filterwerte stehen nur im Zustand des Widgets, nicht in der URL (Namen sind Personendaten).
- **Zeitpunkte:** `formatiereZeitpunkt` aus `shared/lib/format` (Europe/Berlin) mit Zusatz „Uhr“: „05.10.2026, 14:34 Uhr“. `<time dateTime>` behält den ISO-Wert, `title` enthält zusätzlich die Sekunden („05.10.2026, 14:34:56 Uhr“). Die Funktion `zeitpunktAnzeige` in `entities/audit` entfällt. „Startseite verwalten“ nutzt dieselbe Funktion statt der eigenen.
- **Zustände:** Laden `Ladeanzeige form="tabelle"` (Text „Audit-Log wird geladen …“ unverändert), Fehler `Fehlerzustand` mit bisherigem Text und „Erneut versuchen“, leer ohne Filter `Leerzustand` (h3) „Noch keine Einträge.“, leer mit Filter `Leerzustand` (h3) „Keine Einträge für diesen Benutzer.“ mit Button „Filter entfernen“.

**Benutzer-Tabelle:** Filterleiste und Chips bestehen schon (formulare-detailseiten). Zustände wie Audit-Log: Laden, Fehler mit „Erneut versuchen“, Leerzustand bei leerem Suchergebnis mit Button „Suche zurücksetzen“. Bestehende Texte bleiben.

### 4.5 Konsistenz-Durchgang (alle Seiten)
Regeln, die der Developer auf allen Seiten anwendet (`/`, `/coins`, `/coins/neu`, `/coins/{id}` je Reiter, `/coins/{id}/bearbeiten`, `/coins/{id}/ausgaben/neu`, `/coins/{id}/ausgaben/{aid}`, `/pruefung`, `/benutzerverwaltung`, `/verwaltung/startseite`, `/kein-zugriff`, `/abgemeldet`, `/anmeldung/rueckruf`, 404, Router-Fehler):

| # | Regel | Prüfbar durch |
|---|---|---|
| R1 | Abstände: Seitenwurzel `grid gap-6`, in Karten `gap-4`, in Feldgruppen `gap-2`. Keine anderen Abstandsstufen auf Seitenebene | Review, Screenshots |
| R2 | Überschriften: genau ein h1, keine Sprünge (h1 → h2 → h3), Karten mit Titel nutzen `CardTitle ebene` | Vitest je Seite (AK-33), axe `heading-order` |
| R3 | Beschriftungen: gleiche Begriffe für gleiche Dinge (Fachbegriffe aus CLAUDE.md: „Coin“, „Exemplar“, „Ausgabe“, „Zertifikat“, „Hologrammnummer“), Buttons als Verb + Objekt, keine Abkürzungen außer „Nr.“ | Review, Liste im Bericht |
| R4 | Icons: nur `lucide-react`, gleiche Bedeutung = gleiches Icon (Suchen `SearchIcon`, Hinzufügen `PlusIcon`, Bearbeiten `PencilIcon`, Herunterladen `DownloadIcon`, Erneut versuchen `RotateCcwIcon`, Entfernen `XIcon`), immer `aria-hidden` und mit sichtbarem Text, außer bei Icon-Buttons mit `aria-label` | Vitest-Textprüfung, Review |
| R5 | Leerzustände nur über `Leerzustand`, Ladezustände über `Ladeanzeige`, Fehler über `Fehlerzustand` mit „Erneut versuchen“, wo ein erneuter Abruf möglich ist. Kein `<p role="alert">` für Ladefehler mehr | Code-Test (AK-35) |
| R6 | Texte: Deutsch, Sie-Form oder neutraler Infinitiv, keine Du-Form, keine englischen Wörter in sichtbarem Text, `aria-label`, `title`, `alt`, `placeholder` | Vitest/Playwright-Textprüfung (AK-36) |
| R7 | Zeitangaben: Datum `TT.MM.JJJJ`, Zeitpunkt `TT.MM.JJJJ, HH:MM Uhr`, immer Europe/Berlin, nur über `shared/lib/format` | Code-Test (AK-37) |

- Texte, die Prüfinhalt bestehender Tests sind, ändert der Developer **nicht**, auch wenn sie gegen R3/R6 verstoßen (entschieden, Abschnitt 12). Er führt sie in der Liste der verbleibenden Auffälligkeiten (Abschnitt 14) mit Vorschlag. Eine Änderung braucht einen eigenen Lauf mit Freigabe.
- **Dokumentation:** Der Developer führt im Bericht eine Tabelle „Konsistenz-Durchgang“ mit Seite, Datei, Regel (R1–R7), vorher, nachher. Der Docs-Agent überträgt sie nach Abschnitt 13 dieses Entwurfs, die verbleibenden Auffälligkeiten nach Abschnitt 14.

### 4.6 Neue und geänderte Bausteine
| Baustein | Datei | Quelle | Props (Kern) | Bausteinseite (h2) |
|---|---|---|---|---|
| Ansichtsumschalter | `shared/ui/ansichtsumschalter.tsx` | zwei `button` mit `aria-pressed` (Ersatz, `toggle-group` nicht verwendet) | `wert: 'tabelle' \| 'karten'`, `onWert`, `beschriftung` (Standard „Ansicht“) | „Ansichtsumschalter“ |
| Rangliste | `shared/ui/rangliste.tsx` | eigene Komposition (`ol`, `separator`) | `beschriftung?`, `eintraege: { id, rang, inhalt: ReactNode, wert: ReactNode }[]` | „Rangliste“ |
| Kennzahlkarte | `shared/ui/kennzahl-karte.tsx` | Bestand, ergänzt | `KennzahlRaster` neu `spalten?: 3 \| 4` (Standard 3 = Bestand), `KennzahlKarte` neu `groesse?: 'normal' \| 'gross'` | Bestand, um 4 Spalten/groß ergänzt |
| Ergebniskarte | `shared/ui/ergebniskarte.tsx` | Komposition aus `card` | `ton: 'erfolg' \| 'gefahr' \| 'warnung' \| 'neutral'`, `icon`, `titel`, `titelEbene?: 2 \| 3`, `children` | „Ergebniskarte“ (alle vier Töne) |
| Eingabe mit Präfix | `shared/ui/input-group.tsx` | Bestand | – | Bestand |
| Leerzustand / Ladeanzeige / Fehlerzustand | `shared/ui/zustaende.tsx` | Bestand, ergänzt | `Leerzustand` `titelEbene` bis 4, `Fehlerzustand` `ref` und `fokussierbar`, `Ladeanzeige` `ansage` (`false`, wenn eine eigene Statuszeile den Ladetext ansagt) | Bestand |
| Speicherhilfe | `shared/lib/hooks/use-lokale-wahl.ts` | eigen | `useLokaleWahl<T extends string>(schluessel, erlaubt: T[], standard: T)` → `[wert, setze]` | – |

- `toggle-group` wurde nicht eingebunden; der Ansichtsumschalter nutzt den freigegebenen Ersatz (Nachtrag in ADR-0043).
- Container-Queries sind Tailwind-v4-Standard (`@container`, `@md:`), keine neue Abhängigkeit.

### 4.7 FSD-Zuordnung (Importe nur nach unten)
- `app/router`: keine neue Route. `CoinListeRoute` unverändert (`suche`, `seite`). `PruefungRoute` unverändert.
- `pages`:
  - `start`: Fehler mit „Erneut versuchen“, Flächen für Begrüßung ohne Recht.
  - `coin-liste`: Seitenkopf mit Beschreibung.
  - `pruefung`: zentrierte Spalte.
  - `benutzerverwaltung`, `startseite-verwaltung`: Seitenaufbau 4.4.
  - `entwicklung-bausteine`: neue Abschnitte.
- `widgets`:
  - `startseite`: `StartseiteBloecke` mit Zeilenbildung (exportiert zusätzlich `bildeZeilen(bloecke)` für Vitest).
  - `coin-katalog`: Filterleiste, Ansicht, Zustände; liest die Ansicht über `useLokaleWahl`.
  - `audit-log`: Benutzerfilter, Zustände.
  - `benutzer-tabelle`: Zustände.
- `features`:
  - `zertifikat-pruefen`: `PruefFormular` (Layout, Fokus, `Formularfeld`), `PruefErgebnisAnzeige` (Ergebniskarte, Gruppen).
  - Neu `audit-filtern`: `BenutzerFilter` (Combobox). Importiert `entities/benutzer` (`ladeBenutzer`), wird vom Widget `audit-log` eingebunden.
- `entities`:
  - `startseite`: `Kopfbereich`, `KennzahlenBlock`, `NeuesteCoinsBlock`, `MeistausgegebeneBlock` (nutzt `Rangliste`), `BlockAbschnitt`.
  - `coin`: neu `CoinKarten`, `CoinListe` auf `DatenTabelle`. Public API `index.ts` um `CoinKarten` ergänzt.
  - `audit`: `AuditTabelle` mit `formatiereZeitpunkt`, `zeitpunktAnzeige` entfällt aus der Public API.
- `shared`: Abschnitt 4.6. `shared/config` bekommt die Konstante `SPEICHER_KATALOG_ANSICHT = 'coin-katalog-ansicht'`.

## 5. Datenmodell und API
Keine Änderung: kein Endpunkt, kein DTO, keine Migration, keine Berechtigung. Neu im Frontend genutzt werden der vorhandene Parameter `benutzerId` von `GET /api/audit` sowie `GET /api/benutzer?suche` im Audit-Filter. Beide liegen auf der Seite `/benutzerverwaltung`, die per `users.manage` geschützt ist; `GET /api/audit` verlangt `audit.read`. Zeitraum- und Aktionsfilter brauchen eine API-Erweiterung und folgen in einem eigenen Lauf (F5).

## 6. Sicherheit und Datenschutz
- **Prüfmaske:**
  - gleiche Requests wie bisher: ein `POST` je Prüfung, Endpunkt nur nach `issues.read`, Nummer nur im Body, nie in URL, Storage oder Titel. Der Fokus-/Markier-Mechanismus speichert nichts.
  - Die Ergebniskarte zeigt exakt die Felder, die bisher sichtbar waren. Gruppe „Empfängerdaten“ nur mit `…/mit-empfaenger`-Antwort. Kein Storno-Grund. „Falscher Coin“ und „nicht gefunden“ unterscheiden sich nur in Text, Icon und Farbe, nicht in Dauer oder weiteren Inhalten (gleiche Kartenstruktur ohne Datensatz).
  - Keine Animation, deren Dauer vom Ergebnis abhängt.
- **Ansichtswahl:** `localStorage` enthält neu nur `coin-katalog-ansicht` (`tabelle`/`karten`), keine Personendaten, keine Suchbegriffe (ADR-0044). Der Hinweis in design-fundament Abschnitt 12 („nur `coin-theme`“) wird ergänzt.
- **Audit-Filter:** Benutzernamen nur im React-Zustand, nicht in URL oder Storage. Die Combobox zeigt keine E-Mail-Adressen. Sie fragt `GET /api/benutzer` nur, wenn der Reiter „Audit-Log“ offen ist und getippt wird.
- Sichtbarkeit weiter nur aus `berechtigungen` von `/api/me` (`abhaengigkeiten.test.ts`). Das Design ändert keine Berechtigungslogik: Welche Blöcke, Aktionen, Reiter und Daten erscheinen, ist vor und nach dem Umbau gleich (AK-39).
- Startseite: keine Personendaten (unverändert). Kein `dangerouslySetInnerHTML`.
- Screenshots nur mit gemockten, synthetischen Daten („Testperson A“). Eingecheckt werden nur die Startseiten-Vergleichsbilder (F6); sie enthalten keine Personendaten.

## 7. Akzeptanzkriterien

### Startseite
- **AK-1** Zeilenbildung (`bildeZeilen`, Vitest): Für jede Reihenfolge und jede Teilmenge der fünf Blöcke entstehen Zeilen nach 4.1. `kopf`, `infotext` und `kennzahlen` stehen allein. `neueste` und `meistausgegeben` stehen nur dann gemeinsam in einer Zeile, wenn sie direkt aufeinander folgen. Die Reihenfolge der Blöcke über alle Zeilen ist die übergebene. Geprüft für alle 325 nicht leeren geordneten Teilmengen und die leere Menge (keine Zeile).
- **AK-2** Keine Lücken (Playwright, gemockte API, 1280 und 360 px, hell): Für die Fälle aus 11.2 gilt je Zeile: Der linke Rand des ersten Blocks = linker Rand des Rasters und der rechte Rand des letzten Blocks = rechter Rand des Rasters (je ± 1 px). Die Blöcke einer Zeile sind gleich hoch (± 1 px). Der senkrechte Abstand zwischen aufeinanderfolgenden Zeilen ist überall gleich (24 ± 1 px).
- **AK-3** Deaktivierte Blöcke sind nicht im DOM. Ein leerer Block (Neueste bzw. Meistausgegebene ohne Einträge) zeigt seinen Leertext (unverändert) als Überschrift der Ebene 3 im `Leerzustand` und erfüllt AK-2.
- **AK-4** Kopfbereich: Titel, Untertitel und Logos wie startseite AK-20 (Reihenfolge, Alternativtexte, `width`/`height`, höchstens 96 px hoch). Ab 640 px liegen die Logos in derselben Zeile wie der Titel (Logo Bereitsteller links vom Titel, Logo Software rechts), darunter untereinander. Der Titel ist bei 1280 px mindestens `text-3xl` groß (berechnete Schriftgröße ≥ 30 px).
- **AK-5** Kennzahlen: Region „Kennzahlen“ mit genau vier Karten in einer `dl`, Begriffe in der Reihenfolge „Coins“, „Exemplare gesamt“, „Ausgegeben“, „Verfügbar“. Jede `dd` enthält nur die Zahl in de-DE. Bei 1280 px stehen die vier Karten in einer Zeile, bei 768 px in zwei, bei 360 px in vier Zeilen. Die Zahl ist mindestens 30 px groß.
- **AK-6** Neueste Coins: Liste mit je Eintrag Motivbild (`alt=""`) oder Platzhalter, Name als Link auf `/coins/{id}` (Klickfläche ≥ 40 × 40 px) und Herausgeber. Reihenfolge wie die API. Als volle Zeile bei 1280 px mindestens 2 Kacheln nebeneinander.
- **AK-7** Meistausgegebene Coins: `<ol>` mit je Eintrag sichtbarer Rangzahl (1, 2, …) mit zugänglichem Text „Platz {n}“, Name als Link (Name = Coin-Name, ohne Rang) und „{n} ausgegeben“ als eigenes Element. Es gibt keine doppelte Nummerierung (`list-style-type: none`).
- **AK-8** Überschriften und Abrufe wie startseite AK-20 bis AK-22 (unverändert). Bei einem Ladefehler mit `coins.read` gibt es „Erneut versuchen“: genau ein weiterer `GET /api/startseite`, bei Erfolg erscheinen die Blöcke.
- **AK-9** Vorschau auf `/verwaltung/startseite` zeigt dieselbe Zeilenbildung (Ebene 2, startseite AK-29 unverändert).

### Katalog
- **AK-10** Filterleiste: Suchfeld „Coins suchen“ mit Höhe ≥ 48 px, bei 1280 px mindestens 320 px breit, Lupen-Icon `aria-hidden`, Button „Suchen“. Ansichtsumschalter in derselben Karte. Bei 360 px brechen die Elemente um, ohne horizontales Scrollen.
- **AK-11** Suche wie katalog-seiten AK-14/AK-16: Absenden setzt `suche` in der URL und `seite=1`, genau ein `GET /api/coins`. Bei aktivem Suchbegriff erscheint genau ein Chip „Suche: {Begriff}“ in „Aktive Filter“. Sein Entfernen-Button setzt die Suche zurück (URL ohne `suche`, Seite 1, ein Request) und fokussiert danach das Suchfeld. Ohne Suchbegriff gibt es keine Chip-Liste.
- **AK-12** Ansichtsumschalter: Gruppe mit Namen „Ansicht“, zwei Elemente „Tabelle“ und „Karten“ (sichtbarer Text = zugänglicher Name), `aria-pressed` passend, per Tab erreichbar, Wechsel mit Enter/Leertaste, je ≥ 40 × 40 px. Ohne gespeicherte Wahl ist „Tabelle“ aktiv. Gilt gleich für `toggle-group` und den Ersatz aus zwei Buttons.
- **AK-13** Der Wechsel der Ansicht löst keinen Request aus und ändert die URL nicht. Die Wahl steht danach in `localStorage['coin-katalog-ansicht']` (`tabelle`/`karten`). Nach Neuladen und nach Navigation weg und zurück ist sie wieder aktiv. Ein ungültiger Wert im Speicher ergibt „Tabelle“ ohne Fehler. Ist `localStorage` nicht verfügbar (Zugriff wirft), funktioniert der Umschalter weiter, ohne Fehler.
- **AK-14** Tabellenansicht: Caption „Coins“, Spalten und Zellen wie katalog-seiten AK-15 („Kein Bild“, „unbekannt“, Datum de-DE), Zeilenklick und Link je Zeile unverändert. „unbekannt“ erscheint als Badge mit genau diesem Text. Bei 360 px scrollt die Tabelle in ihrem Container (design-fundament AK-15).
- **AK-15** Kartenansicht: Liste „Coins“ mit einer Karte je Coin der Seite in API-Reihenfolge. Je Karte h3 mit Link (Name, `href` `/coins/{id}`), Herausgeber, „Auflage“ und „Erfasst am“ als `dl`, Bild mit `alt="Motiv: {Name}"` oder „Kein Bild“. Bei `auflage = null` steht der Chip „Auflage unbekannt“. Ein Mausklick in die Karte außerhalb von Bedienelementen öffnet die Detailseite. Tab-Stopp je Karte ist nur der Link. Spalten: 1 bei 360 px, mindestens 3 bei 1280 px.
- **AK-16** Blättern in beiden Ansichten wie bisher. Die Ansicht bleibt beim Blättern erhalten.
- **AK-17** Leerzustände: ohne Coins `Leerzustand` mit h2 „Noch keine Coins erfasst.“. Mit Suchbegriff ohne Treffer h2 „Keine Coins gefunden.“, die Beschreibung aus 4.2 und der Button „Suche zurücksetzen“ (Wirkung wie AK-11). Hinter dem Ende h2 „Auf dieser Seite gibt es keine Coins.“ mit Blättern. Auf der Seite gibt es immer höchstens einen Link „Coin hinzufügen“.
- **AK-18** Ladefehler: `role="alert"` mit „Coins konnten nicht geladen werden. Bitte später erneut versuchen.“ und Button „Erneut versuchen“ (genau ein neuer Request mit gleicher Suche und Seite). Fokusführung beim Blättern wie bisher.

### Prüfmaske
- **AK-19** Aufbau: genau ein h1 „Zertifikat prüfen“. Bei 1280 px ist die Inhaltsspalte höchstens 45rem breit und horizontal im Inhaltsbereich zentriert (Abstand links = rechts ± 1 px). Vor einer Prüfung gibt es keine h2.
- **AK-20** Formular: Ab 768 px stehen „Coin (optional)“ und „Hologrammnummer“ nebeneinander (gleiche `y`-Position, Coin links), bei 360 px untereinander. DOM- und Tab-Reihenfolge: Coin, (ggf. „Auswahl entfernen“), Hologrammnummer, Prüfen. Das Nummernfeld ist ≥ 48 px hoch und hat „(Pflichtfeld)“ im zugänglichen Namen und den Hilfetext aus 4.3 in seiner Beschreibung.
- **AK-21** Fokus nach Prüfung (Playwright, Kernkriterium): Betrachter wählt einen Coin, gibt eine Nummer ein und prüft per Enter. Danach ist das Nummernfeld fokussiert und sein Inhalt vollständig markiert (`selectionStart = 0`, `selectionEnd = Länge`). Ohne weiteren Klick tippt der Test die nächste Nummer und drückt Enter: Es gibt genau zwei Prüf-Requests, der zweite mit der neuen Nummer und derselben `coinId`, und das zweite Ergebnis wird angezeigt. Dasselbe gilt, wenn die erste Prüfung per Mausklick auf „Prüfen“ ausgelöst wurde.
- **AK-22** Nach einem Feldfehler (leere oder ungültige Nummer) und nach einem Alarm (`429`, Fehler) liegt der Fokus im Nummernfeld. Bei `429` bleibt „Prüfen“ gesperrt wie bisher (hologrammnummer AK-32).
- **AK-23** Vier Ergebnisse ohne Farbwahrnehmung unterscheidbar (Vitest und Playwright, Test auf Inhalt): Je Ergebnis enthält die Live-Region genau eine h2 mit dem Text aus 4.3 und genau ein Icon mit der Klasse aus 4.3 (`aria-hidden="true"`). Die vier Texte und die vier Icons sind paarweise verschieden. Der Test prüft Text und Icon, nicht die Farbe.
- **AK-24** Ergebniskarte: h2 mit berechneter Schriftgröße ≥ 20 px. Kontrast der h2 zu ihrer Fläche ≥ 4,5:1 in hell und dunkel (bestehender Kontrasttest der Prüfseite, auf die neue Fläche bezogen). Rahmen der Karte in der Statusfarbe. „Geprüfte Nummer: {Anzeigeform}“ unverändert.
- **AK-25** Datensatz (gültig/storniert): Gruppen als h3 „Coin und Exemplar“, „Zertifikat“, „Ausgabe“ und nur mit Empfängerdaten „Empfängerdaten“. Je Gruppe eine `dl`. Begriffe und Werte wie hologrammnummer AK-31 (Coin als Link, „Nr. 12“, Zertifikatsnummer, Hologrammnummer, Ausgabedatum, Status „Aktiv“/„Storniert am …“). Bei falscher Coin/nicht gefunden gibt es keine `dl` und keine h3.
- **AK-26** Nicht mehr als bisher: Ohne `issues.read` enthält die Seite nach jeder Prüfung weder die Gruppe „Empfängerdaten“ noch die Begriffe „Empfänger“, „Gelegenheit“, „Begründung“, „Ausgebende Stelle“ noch „Zur Ausgabe“. Kein Text der Seite enthält „Grund“ (auch nicht, wenn die Antwort ein Feld `stornoGrund` enthält). Die Menge der angezeigten Begriffe je Ergebnis und Recht ist gleich der Menge vor dem Umbau (Vitest vergleicht mit einer festen Liste).
- **AK-27** Requests unverändert: je Prüfung genau ein `POST` auf `/api/pruefung` bzw. mit `issues.read` auf `/api/pruefung/mit-empfaenger`, Body `{ hologrammnummer, coinId }`. Die Nummer steht in keiner URL, keinem Seitentitel und keinem Storage (`localStorage`/`sessionStorage` nach der Prüfung unverändert).

### Verwaltung
- **AK-28** Benutzerverwaltung und Startseite verwalten: Seitenkopf mit h1 (unverändert) und Beschreibung aus 4.4, Reiter darunter (Namen unverändert). Das Panel „Benutzer“ hat h2 „Benutzer“, das Panel „Audit-Log“ h2 „Änderungsprotokoll“. Auf keiner der beiden Seiten folgt eine h3 direkt auf die h1.
- **AK-29** Audit-Log Benutzerfilter (geänderter Benutzer): Combobox „Benutzer“ mit Hilfetext „Zeigt Änderungen an diesem Benutzerkonto.“ in der Beschreibung. Eingabe sucht nach 300 ms über `GET /api/benutzer?suche=…`, Treffer zeigen nur Namen. Die Wahl lädt `GET /api/audit` mit `benutzerId` und `seite=1` und zeigt den Chip „Benutzer: {Name}“. Entfernen lädt ohne `benutzerId` ab Seite 1. Weder Name noch Id stehen in der URL.
- **AK-30** Zeitpunkte im Audit-Log als „TT.MM.JJJJ, HH:MM Uhr“ in Europe/Berlin (auch bei anderer Zeitzone des Browsers; Vitest mit `TZ=America/New_York` bzw. gestubbter Zeitzone), `<time dateTime>` = ISO-Wert, `title` mit Sekunden. „Zuletzt gespeichert am …“ auf „Startseite verwalten“ ist gleich formatiert.
- **AK-31** Zustände Audit-Log und Benutzer: Laden über `Ladeanzeige` (Texte unverändert), Fehler über `Fehlerzustand` mit „Erneut versuchen“ (ein neuer Request), leer über `Leerzustand` (Texte aus 4.4).
- **AK-32** Kein Zeitraum- und kein Aktionsfilter in diesem Lauf (F5): Das Audit-Log hat genau einen Filter („Benutzer“). `GET /api/audit` wird nur mit `benutzerId`, `seite` und `groesse` aufgerufen. In `widgets/audit-log` und `features/audit-filtern` gibt es keinen Filter auf `art` oder `zeitpunkt` (Vitest prüft die Query-Parameter, Review den Code).

### Konsistenz, Bausteine, Qualität
- **AK-33** Überschriften: Auf jeder Seite aus 4.5 gibt es nach dem Laden genau ein h1, und keine Überschrift springt mehr als eine Ebene tiefer als die vorherige (Vitest-Hilfe `pruefeUeberschriften` je Seite, axe `heading-order` ohne Befund).
- **AK-34** Icons: Jedes `svg` in `main` ist `aria-hidden="true"` oder liegt in einem Element mit deutschem zugänglichem Namen. Gleiche Aktionen haben gleiche Icons nach R4 (Review).
- **AK-35** Zustände: In `web/src/widgets` und `web/src/pages` gibt es kein `<p role="alert">` für Ladefehler und keinen Leertext als bloßes `<p>` mehr (Code-Test über die Muster `role="alert"` außerhalb von `shared/ui` und Formularmeldungen; Ausnahmen mit Begründung im Test).
- **AK-36** Texte: Auf allen Seiten aus 4.5 (mit gemockter API, alle Rollen) enthalten sichtbarer Text, `aria-label`, `title`, `alt` und `placeholder` keine englischen Wörter aus der bestehenden Liste `ENGLISCH` und keine Du-Form (`\b(du|dein|deine|dich|dir)\b`, Groß/Klein). Ausgenommen sind nur Texte, die als verbleibende Auffälligkeit in Abschnitt 14 stehen.
- **AK-37** Zeitformat: Außer `shared/lib/format.ts` erzeugt keine Datei in `web/src` eigene `Intl.DateTimeFormat`-Instanzen (Code-Test). `entities/coin/ui/format.ts` nutzt die gemeinsamen Funktionen.
- **AK-38** Bausteine aus 4.6 liegen in den genannten Dateien. Die Bausteinseite zeigt je neuem Baustein einen Abschnitt (h2) mit allen Varianten (Ergebniskarte: vier Töne; Rangliste: mit und ohne Einträge; Ansichtsumschalter: beide Werte; Kennzahlkarte: 4 Spalten, groß). Keine API-Aufrufe, deutsche Texte. Ist `toggle-group` vorhanden, ist es nachbearbeitet (`cn` aus `@/shared/lib/cn`).
- **AK-39** Berechtigungen unverändert: Für anonym, ohne Rolle, Betrachter, Sachbearbeiter und Administrator sind auf `/`, `/coins`, `/pruefung`, `/benutzerverwaltung` und `/verwaltung/startseite` dieselben Blöcke, Links, Buttons, Reiter und Requests vorhanden wie vor dem Umbau. Ausnahme sind nur die neuen Bedienelemente aus diesem Entwurf, jeweils unter derselben Berechtigung wie ihre Seite (UI-Test je Rolle, Liste der erwarteten Namen).
- **AK-40** axe meldet 0 Verstöße `serious`/`critical` auf allen Seiten aus 4.5, hell und dunkel, bei 360 und 1280 px. Zusätzlich: Startseite in allen Fällen aus 11.2, Katalog in beiden Ansichten sowie leer und im Fehlerzustand, Prüfmaske mit jedem der vier Ergebnisse, Audit-Log mit aktivem Filter und leer.
- **AK-41** Bei 360, 768 und 1280 px scrollt keine Seite dieses Laufs horizontal (`scrollWidth ≤ innerWidth`), auch nicht in den Zuständen aus AK-40. Klickflächen ≥ 40 × 40 px wie formulare-detailseiten AK-38, jetzt einschließlich Ansichtsumschalter, Kartenlinks, Ranglisten-Links und Startseiten-Links (design-fundament D9 entfällt für die Startseite).
- **AK-42** Gestaltungsregeln (design-fundament AK-3 bis AK-5): keine Farben und beliebigen Abstände außerhalb der Tokens. Container-Query-Größen nur aus der Tailwind-Standardskala.
- **AK-43** Alle bisherigen Tests (Vitest, `web/ui-tests`, `e2e`) sind grün. Angepasst werden nur die freigegebenen Stellen K1, K3, K4, K6–K9 und K11 (Abschnitt 10) und dort nur Locator bzw. Bezugsstelle, nicht der Prüfinhalt. Zusätzlich K12 (freigegeben 2026-11-15): dort ändert sich die Erwartung an die Anordnung der Startseite, weil das Zeilenraster aus 4.1 sie vorgibt. Jede Anpassung steht mit Begründung im Commit und im QA-Bericht.
- **AK-44** Keine neue Laufzeit- oder Entwicklungsabhängigkeit außer den Base-UI-Komponenten, die `npx shadcn add toggle-group` als Quelltext erzeugt (Base UI ist schon Abhängigkeit). `localStorage` enthält nur `coin-theme` und `coin-katalog-ansicht`.
- **AK-45** Screenshots (Prüfung durch den Agenten):
  - `web/ui-tests/screenshots-uebersicht.spec.ts` läuft nur mit `COIN_SCREENSHOTS=1` und schreibt nach `web/test-results/screenshots-uebersicht/<ansicht>_<breite>_<hell|dunkel>.png` (nicht eingecheckt).
  - Ansichten: jede Seite aus 4.5 im Normalzustand; zusätzlich Startseite leer und Fehler, Katalog Tabelle, Karten, leer, kein Treffer und Fehler, Prüfmaske leer und mit jedem der vier Ergebnisse (Betrachter und Sachbearbeiter), Audit-Log mit Filter, leer und Fehler. Jeweils 360, 768 und 1280 px, hell und dunkel.
  - **Startseiten-Vergleich (F6, eingecheckt):** je 12 Bilder „vorher“ und „nachher“, also die 6 Fälle aus 11.2 bei 1280 und 360 px, hell, in `docs/design/vergleich-startseite/`: `vorher_<fall>_<breite>.png` (vom Developer vor dem Umbau auf dem Stand von `develop` mit derselben Spec erzeugt) und `nachher_<fall>_<breite>.png`. Insgesamt genau 24 Dateien, nur synthetische Daten.
  - Der Developer sieht alle Bilder an, bessert nach und listet die Befunde (Ansicht, Breite, Theme, Befund, Behebung) im Bericht, dazu die verbleibenden Auffälligkeiten.
- **AK-46** Doku: dieser Entwurf (Abschnitte 13 und 14 nach Umsetzung), ADR-0043, ADR-0044, `docs/requirements.md` (Funktion 10), Ergänzung in design-fundament Abschnitt 12 (`localStorage`) und in startseite AK-20 („Raster“), katalog-seiten AK-15 („Badge unbekannt“), hologrammnummer AK-30/31 (Ergebniskarte, Gruppen) durch den Docs-Agenten.

## 8. Seiten und Komponenten (Übersicht)
| Seite | Geändert | Komponenten |
|---|---|---|
| `/` | Raster, Kopf, Kennzahlen, Neueste, Rangliste, Fehler mit „Erneut versuchen“ | `pages/start`, `widgets/startseite`, `entities/startseite/*`, `shared/ui/kennzahl-karte`, `rangliste`, `zustaende` |
| `/coins` | Filterleiste, Ansichten, Zustände | `pages/coin-liste`, `widgets/coin-katalog`, `entities/coin/CoinListe`, `CoinKarten`, `shared/ui/filterleiste`, `ansichtsumschalter`, `input-group`, `daten-tabelle`, `shared/lib/hooks/use-lokale-wahl` |
| `/pruefung` | Spalte, Formular, Fokus, Ergebniskarte, Gruppen | `pages/pruefung`, `features/zertifikat-pruefen/*`, `shared/ui/ergebniskarte`, `formularfeld`, `alert` |
| `/benutzerverwaltung` | Aufbau, Audit-Benutzerfilter, Zeitformat, Zustände | `pages/benutzerverwaltung`, `widgets/audit-log`, `widgets/benutzer-tabelle`, `features/audit-filtern`, `entities/audit` |
| `/verwaltung/startseite` | Aufbau, Zeitformat, Vorschau-Raster | `pages/startseite-verwaltung`, `widgets/startseite` |
| alle übrigen | Konsistenz R1–R7 | je Seite, Liste im Bericht |
| `/entwicklung/bausteine` | neue Abschnitte | `pages/entwicklung-bausteine` |

## 9. Tests (Zuordnung)
| Ebene | Datei (neu, falls nicht anders vermerkt) | AK |
|---|---|---|
| Vitest | `web/src/widgets/startseite/model/bildeZeilen.test.ts` (alle Teilmengen und Reihenfolgen) | 1 |
| Vitest | `web/src/widgets/startseite/ui/StartseiteBloecke.raster.test.tsx` (Zeilen-DOM, Leerzustände h3, Rangliste mit „Platz n“, Kennzahlkarten) | 3, 5–7, 9 |
| Vitest | `web/src/pages/start/ui/StartSeite.erneut.test.tsx` | 8 |
| Vitest | `web/src/widgets/coin-katalog/ui/CoinKatalog.ansicht.test.tsx` (Umschalter, `localStorage` inkl. ungültig und werfend, kein Request beim Wechsel, Chip Suche, Leer-/Fehlerzustände), `web/src/entities/coin/ui/CoinKarten.test.tsx`, `web/src/shared/lib/hooks/use-lokale-wahl.test.ts` | 11–18 |
| Vitest | `web/src/pages/pruefung/ui/PruefungSeite.fokus.test.tsx` (Fokus und Markierung nach Enter, Klick, Feldfehler, Alarm), `PruefungSeite.gruppen.test.tsx` (Gruppen, Begriffslisten je Ergebnis und Recht als feste Liste, kein „Grund“) | 21–23, 25–27 |
| Vitest | `web/src/widgets/audit-log/ui/AuditLog.filter.test.tsx` (Benutzerfilter, Chip, Requests nur mit `benutzerId`/`seite`/`groesse`, keine URL), `web/src/entities/audit/ui/AuditTabelle.zeit.test.tsx` (Europe/Berlin, `title`) | 29–32 |
| Vitest | `web/src/shared/ui/ansichtsumschalter.test.tsx`, `rangliste.test.tsx`, `ergebniskarte.test.tsx`; `kennzahl-karte.test.tsx` (ergänzt: `spalten`, `groesse`) | 5, 7, 12, 23, 38 |
| Vitest | `web/src/app/konsistenz.test.ts` (Code-Tests: kein `<p role="alert">` für Ladefehler in `widgets`/`pages`, keine eigenen `Intl.DateTimeFormat` außerhalb `shared/lib/format.ts`, Du-Form-Muster in Quelltexten), `web/test/ueberschriften.ts` (Hilfe für AK-33) und je Seitentest ein Aufruf | 33, 35–37 |
| Vitest | `BausteineSeite.test.tsx` (Bestand, `ABSCHNITTE` ergänzt), `gestaltungsregeln.test.ts` (Bestand) | 38, 42 |
| UI-Test (gemockte API) | `web/ui-tests/startseite-raster.spec.ts` (Fälle 11.2, Bounding-Box-Prüfung bei 1280/360, Kopf, Kennzahlen-Spalten bei 360/768/1280) | 2, 4–6 |
| UI-Test | `web/ui-tests/katalog-ansicht.spec.ts` (Umschalten per Tastatur, Speicherung über Neuladen, Kartenklick, Chip, Leerzustand, 360/1280) | 10–17 |
| UI-Test | `web/ui-tests/pruefmaske.spec.ts`: **Kernfall AK-21** (Enter- und Klick-Variante, zwei Prüfungen ohne Mausklick dazwischen), vier Ergebnisse auf Text und Icon, Zentrierung, Feldanordnung | 19–24 |
| UI-Test | `web/ui-tests/verwaltung.spec.ts` (Aufbau, Audit-Benutzerfilter, Zeitformat) | 28–31 |
| UI-Test | `web/ui-tests/rechte-unveraendert.spec.ts` (je Rolle die Liste der Bedienelemente und Requests auf den fünf Seiten) | 39 |
| UI-Test | `barrierefreiheit.spec.ts`, `responsiv.spec.ts` (Bestand, um die Zustände aus AK-40/41 ergänzt) | 40, 41 |
| UI-Test | `web/ui-tests/screenshots-uebersicht.spec.ts` (nur mit `COIN_SCREENSHOTS=1`) | 45 |
| Systemtest (echte API) | `e2e/tests/startseite-listen-pruefung.spec.ts`: Administrator legt zwei Coins an, erfasst zwei Ausgaben mit Hologrammnummern, schaltet auf `/verwaltung/startseite` „Kennzahlen“ und „Infotext“ aus und speichert; `/` zeigt keine Lücke (Bounding-Box wie AK-2). Katalog: Ansicht „Karten“ wählen, neu laden, Ansicht bleibt. Betrachter prüft auf `/pruefung` beide Nummern direkt hintereinander nur per Tastatur (AK-21) und sieht „Zertifikat gültig“ ohne Empfängerdaten. axe und 360-px-Overflow auf allen drei Seiten, hell und dunkel | 2, 13, 21, 23, 26, 40, 41 |

Gemeinsame Mocks gehören nach `web/ui-tests/hilfen/` (Tester). Bestehende Specs bleiben unverändert, soweit Abschnitt 10 nichts anderes sagt.

## 10. Erwartete Kollisionen mit bestehenden Tests (K-Liste)
Der Prüfinhalt (Daten, Texte, Rechte, Requests) bleibt. Es ändern sich nur Orte und Strukturen. **Freigegeben (2026-11-15): K1, K3, K4, K6–K9 und K11**, jeweils nur Locator bzw. Bezugsstelle, je begründet im Commit und im QA-Bericht. K2, K5 und K10 brauchen keinen Eingriff. **K12** kam während der Umsetzung hinzu und wurde am 2026-11-15 gesondert freigegeben (Antwort des Auftraggebers: „Test anpassen (K12)“); dort ändert sich die erwartete Anordnung.

| # | Datei und Test | Warum rot | Lösung |
|---|---|---|---|
| K1 | `web/src/widgets/startseite/ui/StartseiteBloecke.test.tsx` „zeigt die Blöcke in der Reihenfolge der API“ (Z. 34 ff.: `within(r).queryByRole('heading')`) | Leere Blöcke haben jetzt eine zweite Überschrift (h3 im `Leerzustand`). Der Test nutzt nicht-leere Blöcke, kann aber über `queryByRole` bei mehreren Überschriften scheitern, falls Testdaten leer sind | nur falls rot: Locator auf `getAllByRole('heading')[0]` bzw. `aria-labelledby`, Erwartung bleibt (freigegeben) |
| K2 | `StartseiteBloecke.test.tsx` „zeigt ohne Einträge „Noch keine Coins …““ (Z. 230, 254, `findByText`) | bleibt grün, Text unverändert (h3) | kein Eingriff |
| K3 | `web/ui-tests/hologrammnummer.spec.ts` Kontrasttest der Ergebnis-Überschriften (Z. 537–558, Hilfsfunktion `kontrast`) | Die h2 steht jetzt auf einer `*-subtle`-Fläche statt auf `card`. Falls `kontrast` den Hintergrund nicht vom nächsten nicht transparenten Vorfahren liest, misst er gegen die falsche Fläche | nur falls rot: Hilfsfunktion liest den Hintergrund des nächsten Vorfahren mit Hintergrundfarbe. Grenzwert 4,5 bleibt (freigegeben) |
| K4 | `web/src/pages/pruefung/ui/PruefungSeite.test.tsx` und `PruefungSeite.ergebnis.test.tsx`, Prüfungen der Pflichtkennzeichnung bzw. von `disabled` am Button „Prüfen“ während der Anfrage (falls vorhanden) | `Formularfeld` zeigt „(Pflicht)“ statt „*“, „Prüfen“ nutzt `laedt` (`aria-disabled`) | Erwartung `aria-disabled="true"` statt `toBeDisabled()`. Name mit „(Pflichtfeld)“ bleibt (freigegeben) |
| K5 | `web/ui-tests/responsiv.spec.ts:183` und `:99–114` (Katalog, Seitenkopf und Aktion) | bleiben grün (Seitenkopf unverändert) | kein Eingriff |
| K6 | `web/src/widgets/coin-katalog/ui/CoinKatalog.test.tsx` und `web/src/app/App.katalog-seiten.test.tsx`: Fälle, die den Ladefehler als `p[role=alert]` mit `tabIndex=-1` oder den Fokus auf genau diesem Element prüfen | Fehler kommt jetzt aus `Fehlerzustand` (Alert mit Button) | Fokusziel bleibt das Alert-Element (`alarmRef` auf die Alert-Wurzel). Nur falls rot: Locator von `p` auf `getByRole('alert')` (freigegeben) |
| K7 | `web/src/widgets/audit-log/ui/AuditLog.test.tsx`, `BenutzerTabelle*.test.tsx`: Ladefehler-/Leerfälle mit `getByText` auf `<p>` bzw. `p[role=alert]` | wie K6 | wie K6. Texte bleiben (freigegeben) |
| K8 | `web/src/entities/audit/ui/AuditTabelle.test.tsx:38–44` (Zeitpunkt) | Regex `0?5\.10\.(20)?26` und `\d{1,2}:\d{2}` bleiben erfüllt; es kommt „Uhr“ hinzu. Rot nur, falls der Test die lokale Zeitzone voraussetzt | nur falls rot: Testzeit in Europe/Berlin auslegen, Prüfinhalt „deutsches Datum mit Uhrzeit“ bleibt (freigegeben) |
| K9 | Tests, die auf `/benutzerverwaltung` oder `/verwaltung/startseite` die Anzahl oder den Text von Überschriften der Ebene 2 prüfen oder `getByText('Benutzer')` ohne `exact`/Rolle nutzen | neue h2 „Benutzer“ und „Änderungsprotokoll“ | nur falls rot: Locator auf Rolle (`tab`, `columnheader`) einschränken (freigegeben) |
| K10 | Risiko: `e2e/tests/coin-katalog.spec.ts:113` `zeile.getByText('unbekannt')`, `e2e/tests/katalog-seiten.spec.ts:131` | bleiben grün: Badge enthält genau „unbekannt“, die Tabelle bleibt Standard | kein Eingriff |
| K11 | `web/src/app/App.startseite*.test.tsx`, `web/ui-tests/startseite.spec.ts`, `e2e/tests/startseite.spec.ts`: Prüfungen auf `list-decimal`, die Kennzahlen-`dl` als einzige `dl` auf `/` oder `getAllByRole('listitem')` über die ganze Seite | Kennzahlkarten (eine `dl` bleibt), Rangliste mit sr-only „Platz n“ | nur falls rot: Locator auf die Region des Blocks einschränken (freigegeben) |
| K12 | `web/ui-tests/startseite.spec.ts:360` (Betrachter, breiter Bildschirm 1280 px) | Vorher erwartet: Kennzahlen, Neueste und Meistausgegebene stehen in einer Zeile nebeneinander. Das Zeilenraster aus 4.1 (ADR-0043 Punkt 1) gibt den Kennzahlen eine eigene, volle Zeile | **Freigegeben 2026-11-15:** Erwartung geändert. Nachher: Kennzahlen allein in einer Zeile, „Neueste Coins“ und „Meistausgegebene Coins“ darunter nebeneinander (Testname „auf breitem Bildschirm Kennzahlen in eigener Zeile, Neueste und Meistausgegebene darunter nebeneinander“) |

Wird an einer weiteren Stelle ein Test nur durch eine Anpassung grün, stoppt der Developer und meldet (wie formulare-detailseiten F9).

## 11. Testdaten und Fälle
### 11.1 Rollen
anonym, ohne Rolle, Betrachter (`coins.read`), Sachbearbeiter (`issues.read`/`issues.write`), Administrator.

### 11.2 Fälle für das Startseiten-Raster (AK-2, Screenshot-Vergleich)
1. alle fünf Blöcke in Standardreihenfolge (kopf, infotext, kennzahlen, neueste, meistausgegeben);
2. ohne Kennzahlen und Infotext (kopf, neueste, meistausgegeben);
3. getrennte Paarblöcke (kopf, neueste, kennzahlen, meistausgegeben);
4. nur Kennzahlen und Meistausgegebene, ohne Kopf (Begrüßung, kennzahlen, meistausgegeben);
5. nur Neueste, leer (Begrüßung, neueste ohne Einträge);
6. anonym mit aktivem Kopf.

## 12. Entscheidungen des Auftraggebers (2026-11-15)
Der Auftraggeber hat alle Vorschläge übernommen. Zu F5 hat er Variante A gewählt.
- **F1 Standardansicht Katalog:** „Tabelle“ auf allen Breiten, wie heute. Die Wahl wird gemerkt.
- **F2 Filter im Katalog:** nur „Suche“ (Chip „Suche: …“). Die API hat keine weiteren Filter, clientseitiges Filtern einer Seite gibt es nicht.
- **F3 Status-Chips im Katalog:** nur „Auflage unbekannt“ aus `auflage = null` (in der Tabelle als Badge „unbekannt“). Verfügbarkeits-Chips kommen erst mit einer API-Erweiterung.
- **F4 Nach der Prüfung:** Der Feldinhalt wird markiert, nicht geleert.
- **F5 Audit-Filter (Variante A):** In diesem Lauf gibt es nur den Benutzerfilter über den vorhandenen Parameter `benutzerId`. Zeitraum und Aktion kommen in einem eigenen Lauf mit API-Erweiterung und eigenem ADR (offener Punkt, Abschnitt 14).
- **Benutzerfilter:** gilt für den geänderten Benutzer (API-Stand), nicht für den Ausführenden.
- **F6 Startseiten-Vergleich:** Je 12 Vorher- und Nachher-Bilder (6 Fälle × 1280/360 px, hell) kommen nach `docs/design/vergleich-startseite/` und werden eingecheckt. Alle übrigen Screenshots bleiben lokal.
- **F7 Speicherort der Ansicht:** `localStorage` (ADR-0044), nicht die URL.
- **K-Liste:** freigegeben für K1, K3, K4, K6–K9 und K11, nur Locator und Bezugsstellen.
- **K12 (2026-11-15, während der Umsetzung):** `web/ui-tests/startseite.spec.ts:360` wird angepasst („Test anpassen (K12)“). Alte Erwartung: Kennzahlen, Neueste und Meistausgegebene auf breitem Bildschirm in einer Zeile nebeneinander. Neue Erwartung: Kennzahlen allein in einer Zeile, Neueste und Meistausgegebene darunter nebeneinander. Grund: Das Zeilenraster (4.1, ADR-0043 Punkt 1) sieht Kennzahlen als volle Zeile vor.
- **Texte mit Prüfinhalt:** Regelwidrige Texte, die Prüfinhalt bestehender Tests sind, werden im Konsistenz-Durchgang nur gesammelt (Abschnitt 14), nicht geändert.
- **Ersatz für `toggle-group`:** Ist die Komponente für Base UI nicht per CLI verfügbar, besteht der Ansichtsumschalter aus zwei Buttons mit `aria-pressed` (ADR-0043 Punkt 2). Umgesetzt mit diesem Ersatz.

## 13. Konsistenz-Durchgang
Geänderte Stellen, nach Regel gruppiert. Pfade relativ zu `web/src`.

**R5 Fehlerzustände:** `<p role="alert">` bzw. `Fehlerzustand` ohne Button wurde zu `Fehlerzustand` mit „Erneut versuchen“ (Texte unverändert):

| Seite | Datei | nachher |
|---|---|---|
| `/coins` | `widgets/coin-katalog/ui/CoinKatalog.tsx` | `Fehlerzustand` mit `ref`/`fokussierbar` (Fokusziel von `useFokusBeiLadefehler`), gleiche Suche und Seite neu |
| `/benutzerverwaltung` | `widgets/audit-log/ui/AuditLog.tsx`, `widgets/benutzer-tabelle/ui/BenutzerTabelle.tsx` | `Fehlerzustand` mit `ref`/`fokussierbar`, ein neuer Request |
| `/coins/{id}` | `widgets/ausgaben-historie/ui/AusgabenHistorie.tsx` | `Fehlerzustand` mit `ref`/`fokussierbar` |
| `/coins/{id}` | `widgets/coin-exemplare/ui/CoinExemplare.tsx` | `Fehlerzustand` mit `ref`/`fokussierbar`; neue Prop `onErneutVersuchen` für den kontrollierten Einsatz auf der Detailseite, sonst lädt das Widget selbst neu |
| `/coins/{id}?reiter=vorlage` | `widgets/zertifikatsvorlage/ui/ZertifikatsvorlageVerwalten.tsx` | `Fehlerzustand` mit „Erneut versuchen“ |
| `/verwaltung/startseite` | `pages/startseite-verwaltung/ui/StartseiteVerwaltungSeite.tsx` | beide Ladefehler (erstes Laden, Neuladen) als `Fehlerzustand` mit „Erneut versuchen“ |
| `/` | `pages/start/ui/StartSeite.tsx` | `Fehlerzustand` mit „Erneut versuchen“ (lädt `GET /api/startseite` einmal neu, AK-8) |

**R5 Leer- und Ladezustände:** Leertexte als bloßes `<p>` wurden zu `Leerzustand`, Ladeabsätze zu `Ladeanzeige` (Texte unverändert):

| Datei | `Leerzustand` (Titel) | `Ladeanzeige` |
|---|---|---|
| `widgets/coin-katalog/ui/CoinKatalog.tsx` | „Noch keine Coins erfasst.“, „Keine Coins gefunden.“ (mit Beschreibung und „Suche zurücksetzen“), „Auf dieser Seite gibt es keine Coins.“ | `form` je Ansicht `tabelle`/`karte`, `ansage={false}` (Statuszeile sagt an) |
| `widgets/audit-log/ui/AuditLog.tsx` | „Noch keine Einträge.“, „Keine Einträge für diesen Benutzer.“ (mit „Filter entfernen“), h3 | `form="tabelle"` |
| `widgets/benutzer-tabelle/ui/BenutzerTabelle.tsx` | „Noch keine Benutzer.“ bzw. „Keine Benutzer gefunden.“ (mit „Suche zurücksetzen“), h3 | `form="tabelle"`, `ansage={false}` |
| `widgets/coin-exemplare/ui/CoinExemplare.tsx` | „Für diesen Coin ist keine Auflage erfasst. …“, „Keine Exemplare mit diesem Status.“, „Auf dieser Seite gibt es keine Exemplare.“, h3 | – |
| `widgets/ausgaben-historie/ui/AusgabenHistorie.tsx` | „Für diesen Coin wurden noch keine Ausgaben erfasst.“ bzw. „Keine Ausgaben mit diesem Status.“, „Auf dieser Seite gibt es keine Ausgaben.“, h3 | – |
| `widgets/zertifikatsvorlage/ui/ZertifikatsvorlageVerwalten.tsx` | „Es wurde noch keine eigene Vorlage hochgeladen.“, h3 | „Zertifikatsvorlage wird geladen …“ |
| `entities/startseite/ui/NeuesteCoinsBlock.tsx`, `MeistausgegebeneBlock.tsx` | „Noch keine Coins im Katalog.“, „Noch keine Coins ausgegeben.“, h3 (in der Vorschau h4) | – |

**R7 Zeitformat:** Eigene `Intl.DateTimeFormat` entfernt in `entities/audit/model/types.ts` (`zeitpunktAnzeige`, lokale Zeitzone), `entities/zertifikatsvorlage/model/types.ts`, `pages/startseite-verwaltung` („Zuletzt gespeichert am …“) und `entities/coin/ui/format.ts`. Alle nutzen `shared/lib/format.ts` (Europe/Berlin, Zeitpunkt mit „Uhr“). Neu dort ist `formatiereZeitpunktMitSekunden` (für `title`, z. B. im Audit-Log). `shared/lib/format.ts` ist die einzige Datei mit `Intl.DateTimeFormat` (AK-37).

**R2 Überschriften:** `pages/benutzerverwaltung/ui/BenutzerverwaltungSeite.tsx`: je Panel eine `Card` mit h2 „Benutzer“ bzw. „Änderungsprotokoll“ und Beschreibung (vorher Karte ohne Überschrift, Sprung h1 → h3).

**R1 Abstände:** Seitenwurzeln und Startseitenraster auf `gap-6` (`pages/start`, `pages/startseite-verwaltung`, `pages/benutzerverwaltung`, `pages/coin-liste`, `pages/pruefung`, `features/zertifikat-pruefen/ui/PruefFormular.tsx`, `widgets/startseite`); Blockkarten und Ergebniskarte mit `p-4 md:p-6` (`entities/startseite/ui/BlockAbschnitt.tsx`, `InfotextBlock.tsx`, `shared/ui/ergebniskarte.tsx`).

**Bausteine (`shared`):**
- neu: `shared/ui/ansichtsumschalter.tsx`, `shared/ui/rangliste.tsx`, `shared/ui/ergebniskarte.tsx`, Hook `shared/lib/hooks/use-lokale-wahl.ts`, Konstante `SPEICHER_KATALOG_ANSICHT` in `shared/config/speicher.ts`;
- erweitert: `KennzahlRaster` (`spalten?: 3 | 4`), `KennzahlKarte` (`groesse?: 'normal' | 'gross'`), `Leerzustand` (`titelEbene` bis 4), `Fehlerzustand` (`ref`, `fokussierbar`), `Ladeanzeige` (`ansage`);
- `shared/ui/combobox.tsx`: Trigger ohne eigenen Tab-Stopp (ADR-0043, Nachtrag).

**Farbsuche:** 0 Treffer für hartkodierte Farben außerhalb der Tokens (Gestaltungsregeln-Test).

## 14. Abweichungen, offene Punkte und verbleibende Auffälligkeiten

### Abweichungen vom Entwurf
1. **Ansichtsumschalter ohne `toggle-group`:** freigegebener Ersatz aus zwei Buttons (ADR-0043, Nachtrag).
2. **Combobox-Trigger ohne Tab-Stopp:** gilt für alle Comboboxen (Coin-Auswahl der Prüfmaske, Benutzerfilter im Audit-Log), siehe ADR-0043, Nachtrag.
3. **Kopfbereich:** Spalten 1:3:1, Titel erst ab 1024 px `text-3xl` (4.1).
4. **Neueste Coins:** zwei Kachelspalten ab 24rem statt 28rem (4.1).
5. **K12:** zusätzliche Testanpassung mit geänderter Erwartung, freigegeben 2026-11-15 (Abschnitt 10).
6. **Dateinamen des Startseiten-Vergleichs:** `<fall>` trägt einen sprechenden Zusatz (z. B. `vorher_fall2-ohne-kennzahlen-infotext_1280.png`). Erzeugt werden die Bilder von `web/ui-tests/vergleich-startseite.spec.ts` mit `COIN_VERGLEICH=vorher` bzw. `nachher`.

### Offene Punkte
- **Audit-Log: Filter nach Zeitraum und Aktion** (F5, Entscheidung des Auftraggebers): eigener Lauf mit API-Erweiterung von `GET /api/audit` (z. B. optionale Parameter `von`, `bis` mit Tagesgrenzen Europe/Berlin und `art` = Rolle/Status), Integrationstests, `docs/api.md` und eigenem ADR.
- Filter „Geändert von“ (Ausführender) im Audit-Log: bräuchte ebenfalls eine API-Erweiterung, derzeit nicht vorgesehen.
- Weitere Katalogfilter und Verfügbarkeits-Chips (F2, F3): erst mit API-Erweiterung.

### Verbleibende Auffälligkeiten
Texte, die Prüfinhalt bestehender Tests sind, blieben unverändert (AK-36, Abschnitt 12). Eine Änderung braucht einen eigenen Lauf mit Freigabe:
- „z. B. Truppenbesuch, Verabschiedung“ (Platzhalter in `AusgabeFormular`);
- „z. B. {{Zertifikat.Nummer}}“ (`VorlageHochladen`);
- „System (Bootstrap)“ (Audit-Log, Spalte „Geändert von“);
- Reiter und Tabellenname „Audit-Log“ neben der Panel-Überschrift „Änderungsprotokoll“ (zwei Begriffe für dieselbe Sache, R3).

Weitere Befunde aus Review und Umsetzung:
- Aktionsmeldungen in `features/*` (z. B. Fehler nach Speichern) sind weiter `<p role="alert">`; AK-35 betrifft nur Ladefehler in `widgets`/`pages`.
- `entities/coin/ui/CoinListe.tsx` enthält noch einen Leertext als `<p>` („Noch keine Coins erfasst.“); er ist nicht erreichbar, weil `CoinKatalog` vorher den `Leerzustand` zeigt.
- `CoinListe` nutzt weiter die shadcn-`Table` statt `DatenTabelle` (keine Karten unter 768 px, die Tabelle scrollt im Container).
- Nach „Erneut versuchen“ fällt der Fokus auf `body`, weil der Button mit dem Fehlerzustand verschwindet (WCAG 2.4.3, gering).
- `Rangliste`: „Platz“ und die Zahl stehen in zwei getrennten sr-only-Spans; manche Screenreader lesen sie als getrennte Stücke.

Aus der Sichtprüfung (Screenshots):
- Logos im Kopfbereich bei 768 px sehr klein (etwa 54 px), weil sie mit ihrer Spalte schrumpfen.
- Kartenansicht des Katalogs bei 360 px sehr lang wegen des Bildfelds 1:1; zu entscheiden ist, ob das Bildfeld kleiner wird.
- Ansichtsumschalter bei 768 px in einer eigenen Zeile unter der Suche.
- Prüfergebnis „nicht gefunden“ wirkt im Dunkelmodus flach (Fläche `muted`).
- Gruppe „Ausgabe“ der Ergebniskarte: bei drei Gruppen bleibt neben ihr freier Platz im zweispaltigen Raster.
- Seitenleiste endet in Ganzseiten-Screenshots auf Höhe des Viewports: Artefakt der Aufnahme, kein Fehler der Seite.

### Startseiten-Vergleich (F6)
`docs/design/vergleich-startseite/` enthält je 12 Bilder `vorher_*` und `nachher_*` (6 Fälle aus 11.2 bei 1280 und 360 px, hell, 24 Dateien). Bei 1280 px:
1. **Alle Blöcke** (`fall1-alle`): vorher drei schmale Spalten mit Kennzahlen als Liste und viel Leerraum unter Kennzahlen und Rangliste; nachher Kopf als Fläche, Infotext als Karte, Kennzahlen als vier Karten in eigener Zeile, darunter Neueste und Meistausgegebene gleich hoch nebeneinander.
2. **Ohne Kennzahlen und Infotext** (`fall2-ohne-kennzahlen-infotext`): vorher eine leere dritte Spalte; nachher volle Breite ohne Lücke.
3. **Getrennte Paarblöcke** (`fall3-getrennte-paare`): vorher drei schmale Spalten nebeneinander mit Leerraum unter Kennzahlen und Rangliste; nachher Neueste (dreispaltige Kacheln), Kennzahlen und Meistausgegebene je in voller Breite in der konfigurierten Reihenfolge.
4. **Kennzahlen und Meistausgegebene ohne Kopf** (`fall4-kennzahlen-meistausgegeben`): vorher zwei Spalten und eine leere dritte; nachher Kennzahlen und Rangliste je in voller Breite.
5. **Nur Neueste, leer** (`fall5-nur-neueste-leer`): vorher eine Karte in einem Drittel der Breite mit Leertext als Absatz; nachher volle Breite mit `Leerzustand`.
6. **Anonym mit Kopf** (`fall6-anonym-kopf`): vorher Kopf ohne Fläche; nachher Kopf als hervorgehobene Fläche mit zentriertem, größerem Titel.

Bei 360 px stehen in beiden Ständen alle Blöcke untereinander; nachher mit Kopffläche, Kennzahlkarten, Kacheln und Rangliste.
