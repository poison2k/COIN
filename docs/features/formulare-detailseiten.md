# Feature: Formulare und Detailseiten – übersichtlich und zügig bedienbar

Status: umgesetzt (Entscheidungen F1–F10 des Auftraggebers vom 2026-11-14 in Abschnitt 12, Abweichungen der Umsetzung in Abschnitt 13, offene Punkte in Abschnitt 14) · Datum: 2026-11-14 · Branch: `feature/formulare-detailseiten` · ADRs: [0039](../adr/0039-formularmuster-und-validierung.md) (neu, Formularmuster und Validierung), [0040](../adr/0040-warnung-bei-ungespeicherten-aenderungen.md) (neu, Warnung bei ungespeicherten Änderungen), [0041](../adr/0041-tabellenmuster.md) (neu, Tabellenmuster), [0042](../adr/0042-detailseiten-mit-reitern.md) (neu, Detailseiten mit Reitern), Grundlage [design-fundament](design-fundament.md) mit ADR-0035 bis ADR-0038

## 1. Ziel
Formulare und Detailansichten werden übersichtlich und lassen sich zügig bedienen. Funktion und Fachregeln bleiben gleich. Grundlage sind die Bausteine und Regeln des Design-Fundaments. Fehlende Bausteine kommen nach `shared/ui` bzw. `shared/lib` und auf die Bausteinseite.

**Nicht dazu:** neue Felder oder Fachregeln, Änderungen an API oder Datenbank, die Startseite `/` und ihre Blöcke, die Prüfmaske `/pruefung` und die Listen der Übersicht (Abgrenzung in Abschnitt 4.7.1, Entscheidung F6). Ebenfalls nicht dazu: Umstellung von Meldungen auf Toasts, Brotkrumen auf bestehenden Seiten (design-fundament D1), eine Ausgaben-Übersichtsseite.

**Datenmodell und API:** keine Änderungen. `docs/api.md` und `docs/berechtigungen.md` bleiben unverändert. Was die API nicht liefert, zeigt die Oberfläche nicht an (Abschnitt 4.6, F3).

## 2. Ist-Stand (geprüft im Code)
| Bereich | Ist | Folge |
|---|---|---|
| Formulare allgemein | Jede Feature-Komponente baut Label, Hilfe, Fehler und `aria-describedby` selbst (`CoinFormular`, `CoinBearbeitenFormular`, `AusgabeFormular`, `HologrammnummerAendern`, `VorlageHochladen`, `StartseiteFormular`). `Formularfeld` aus dem Fundament wird noch nirgends genutzt. Alle Felder stehen einspaltig untereinander, ohne Abschnitte (außer „Exemplar“ im Ausgabe-Formular und Block-Karten der Startseite). | gemeinsames Muster (ADR-0039) |
| Pflichtkennzeichnung | uneinheitlich: Ausgabe, Hologramm, Storno mit „*“ und sr-only „(Pflichtfeld)“; Coin-Formulare kennzeichnen nur optionale Felder mit „(optional)“; `Formularfeld` rendert sichtbar und im Namen „(Pflicht)“ | einheitlich, ohne Testkollision (4.1) |
| Validierung | nur beim Absenden; Fokus aufs erste fehlerhafte Feld nur in Bearbeiten, Ausgabe und Startseite, nicht in „Coin anlegen“; Zusammenfassung nur auf der Startseite („Bitte die markierten Eingaben prüfen.“, unten vor den Buttons) | Verlassen-Validierung, Fokus, Zusammenfassung oben |
| Aktionen | Hauptbutton links unter dem Formular (`justify-self-start`), „Abbrechen“ als eigener Link außerhalb des `<form>`; Sperre per `disabled={sendet}` (Fokus geht verloren) bzw. `focusableWhenDisabled` (Startseite, Dialoge); `Button` kann `laedt`, wird aber in Formularen nicht genutzt | Aktionsleiste, `laedt` |
| Ungespeicherte Änderungen | nur `/verwaltung/startseite` (`StartseiteVerwaltungRoute`: `useBlocker` + `beforeunload`, Dialog „Ungespeicherte Änderungen“, „Bleiben“/„Verlassen“, startseite AK-32) | verallgemeinern (ADR-0040) |
| Coin-Detailseite `/coins/{id}` | Seitenkopf mit „Bearbeiten“, darunter Karten „Stammdaten“, „Exemplare“ (Kennzahlen als `dl`, Filter, Tabelle, Blättern, „Auflage ändern“, „Ausgabe erfassen“) und „Ausgabehistorie“, Link „Zurück zum Katalog“; Exemplar-Filter und -Seite in der URL (`status`, `seite`); Zertifikatsvorlage nur auf `/coins/{id}/bearbeiten` | Kopf, Kennzahlenkarten, Reiter (ADR-0042) |
| Ausgabe-Seite `/coins/{id}/ausgaben/{aid}` | eine `dl` (`AusgabeDetails`), „Hologrammnummer ergänzen/korrigieren“ und „Zertifikat herunterladen“ unter der Karte, kein Stornieren | Abschnitte, Zeitleiste, Aktionen im Kopf, Stornieren |
| Daten für den Verlauf | `GET …/ausgaben/{aid}` liefert `erfasstAm`, `erfasstVon`, `storno {am, von, grund}`, `datum` und nur die **aktuelle** `hologrammnummer`. Für Hologramm-Korrekturen gibt es keinen Lese-Endpunkt (`hologramm_audit` ohne Lese-Endpunkt, ADR-0034) | Zeitleiste ohne Korrekturen (F3) |
| Bestätigungen | Storno (`AlertDialog` mit Pflichtgrund), Deaktivieren, Rolle ändern, Vorlage zurücksetzen und „Änderungen verwerfen“ haben schon Dialoge, je eigener Code. Die Texte haben zwei Sätze und sind Prüfinhalt (`StatusAendern.test.tsx`, `VorlageZuruecksetzen.test.tsx`, `ui-tests/zertifikatsvorlagen.spec.ts:480`) | gemeinsamer Baustein, Texte bleiben (F5) |
| Tabellen | `shadcn table` mit `overflow-x-auto`; Zeilenklick nur im Katalog (`CoinListe`); keine Sortierung, keine Filter-Chips, keine Kartenansicht | Tabellenmuster (ADR-0041) |
| Sortierung/Filter in der API | `…/exemplare`: Filter `status`, feste Sortierung `nummer`; `…/ausgaben`: Filter `status` (aktiv/storniert, heute im UI ungenutzt), fest neueste zuerst; `/api/benutzer`: `suche`, fest nach Name; `/api/audit`: `benutzerId`, fest neueste zuerst; alle seitenweise (25). Vorlagenversionen kommen vollständig mit `GET …/zertifikatsvorlage`. Es gibt keinen Sortierparameter | Sortierung nur clientseitig bei vollständigen Listen (4.7) |
| Coin-Status | Der Coin hat kein Statusfeld. Ableitbar ohne neue Regel: Auflage unbekannt (`auflage = null`), Exemplare verfügbar (`verfuegbar > 0`), alle Exemplare ausgegeben (`verfuegbar = 0`, Auflage bekannt; Meldung `kein_exemplar_frei` existiert) | Status-Chips (4.5, F4) |

## 3. Annahmen
- A1: Bestehende Überschriften, Feld-, Link- und Buttonnamen, Hinweis- und Fehlertexte bleiben wortgleich. Neue Hinweise kommen als zusätzlicher Satz hinzu (bestehende Tests prüfen „enthält“).
- A2: „Kleiner Bildschirm“ heißt Viewport < 768 px (design-fundament A4). Tabellen mit vielen Spalten dürfen schon unter 1024 px als Karten erscheinen (4.7).
- A3: Dialog-Formulare (Storno, Hologrammnummer, Auflage ändern) warnen beim Schließen nicht. „Abbrechen“ und Escape sind dort ausdrückliche Entscheidungen. Die Verlassen-Warnung gilt für Seitenformulare.
- A4: Weiterleitungen, die die App selbst auslöst (Anmeldung nach `401`, „Abmelden“), zeigen bei ungespeicherten Änderungen den Browser-Dialog von `beforeunload`, wie heute auf der Startseiten-Verwaltung. Dessen Text legt der Browser fest.
- A5: Reaktivieren und Rolle ändern bleiben wie bisher (Reaktivieren ohne Dialog, Rolle mit Dialog). Das Senken der Auflage bekommt keinen zusätzlichen Dialog, sondern einen Hilfetext (keine neue Fachregel).
- A6: Erfolgsmeldungen bleiben Statusmeldungen an ihrem Ort (`role="status"`), keine Toasts.

## 4. Entwurf

### 4.1 Formularmuster (ADR-0039)
- **Abschnitte:** Felder stehen nach Sinn in beschrifteten Abschnitten (`FormularAbschnitt`: `<fieldset>` mit `<legend>`, darin eine Überschrift der passenden Ebene). Ab `md` (768 px) zweispaltig, wo zwei kurze Felder zusammengehören (Spalten in 4.2). Lange Felder (Textbereich, Datei, Radiogruppe) belegen immer die volle Breite. Unter 768 px einspaltig. Formulare stehen in `max-w-reading`.
- **Pflicht/optional:** Pflichtfelder über `Formularfeld pflicht`: sichtbar „(Pflicht)“ (`aria-hidden`), für Screenreader „(Pflichtfeld)“ (sr-only), dazu `required`. So bleiben `formularfeld.test.tsx` (sichtbar „(Pflicht)“) und die Tests mit `/Pflichtfeld/` im zugänglichen Namen grün. Damit ändert sich design-fundament Abweichung 4 („(Pflicht)“ im Namen): Im Namen steht jetzt „(Pflichtfeld)“, wie auf `/pruefung`. Optionale Felder behalten „(optional)“ im Label (Bestand).
- **Hilfetexte** stehen am Feld (`Formularfeld hilfetext`), wo eine Regel nicht offensichtlich ist (Liste in 4.2).
- **Validierung:**
  - Keine Fehlermeldung, solange das Feld nicht verlassen wurde.
  - Beim Verlassen (`blur`) wird ein Feld geprüft, wenn sein Wert seit dem Laden geändert wurde. Ein leeres, unberührtes Pflichtfeld meldet erst beim Absenden.
  - Ein angezeigter Fehler verschwindet bei der Eingabe, sobald der Wert gültig ist. Ein neuer oder anderer Fehler erscheint erst beim nächsten Verlassen oder Absenden.
  - Server-Feldfehler (z. B. `hologrammnummer_vergeben`, `auflage_zu_klein`, `400 errors.<feld>`) stehen am Feld, bis es geändert wird.
  - Die Prüfregeln bleiben die bestehenden Modelfunktionen (`validiereCoin`, `validiereStammdaten`, `validiereAusgabe`, `pruefeHologrammnummer`, `pruefeVorlagendatei`, `validiere` der Startseite). Es gibt keine neuen Regeln und keine neuen Texte.
- **Absenden mit Fehlern:**
  - Alle Fehler werden angezeigt und der Fokus geht auf das erste fehlerhafte Feld in Formularreihenfolge.
  - Ab zwei Feldfehlern oder bei Befunden ohne Feldzuordnung steht oben im Formular die `Fehlerzusammenfassung`: Titel „Bitte die markierten Eingaben prüfen.“ (Text der Startseite), je Fehler ein Link „<Label>: <Meldung>“, der das Feld fokussiert, ohne die URL zu ändern.
  - Auf der Startseiten-Verwaltung erscheint die Zusammenfassung wie bisher schon ab einem Fehler, jetzt aber oben.
- **Formularmeldungen** (Konflikt, kein Zugriff, Netzwerk) bleiben mit ihren Texten als `role="alert"`. Sie stehen oben im Formular als Hinweisbanner `destructive`, der Hinweis „Anmeldung abgelaufen“ als `role="status"`.
- **Aktionsleiste** (`Aktionsleiste`, letztes Element im `<form>`):
  - links „Abbrechen“ (Link, sekundär), rechts die Hauptaktion (primär). Ab 768 px rechtsbündig am Formularende.
  - Unter 768 px klebt die Leiste am unteren Rand (`sticky bottom-0`, Fläche `bg-background`, obere Linie). Beide Buttons sind dann gleich breit und ≥ 40 px hoch.
  - Der Inhaltsbereich bekommt unten so viel `scroll-padding`, dass ein fokussiertes Feld nie unter der Leiste liegt.
- **Ladezustand und Doppelklick:** Die Hauptaktion nutzt `Button laedt` (Spinner, `aria-busy`, `aria-disabled`, Fokus bleibt). Eine synchrone Sendesperre (`useSendeSperre`) verwirft weitere Klicks und Enter, bis die Antwort da ist. Während des Sendens sind Felder nicht gesperrt, sie behalten also den Fokus. Ausnahme ist die Startseite, die heute sperrt (Bestand).
- **Tastatur:** Jedes Formular lässt sich allein per Tab, Pfeiltasten (Radio, Auswahl), Leertaste (Checkbox, Switch, Dateiauswahl) und Enter ausfüllen und absenden. Enter in einem einzeiligen Feld sendet ab.

### 4.2 Formulare im Einzelnen
| Formular (Slice) | Abschnitte und Felder (Spalten ab 768 px) | Neue Hilfetexte (zusätzlich zu den bestehenden) | Hauptaktion / Abbrechen |
|---|---|---|---|
| Coin anlegen (`features/coin-anlegen`, Seite `pages/coin-anlegen`) | **Stammdaten:** Name (Pflicht) · Herausgeber (Pflicht) [2 Spalten]; Auflage (optional) [halbe Breite]; Beschreibung (optional) · **Motivbild:** Datei (optional) mit Vorschau | Auflage: „Ganze Zahl von 1 bis 1.000.000. Ohne Angabe sind noch keine Ausgaben möglich.“ Beschreibung: „Höchstens 2.000 Zeichen.“ | „Coin anlegen“ / „Abbrechen“ → `/coins` |
| Coin bearbeiten (`features/coin-bearbeiten`, `features/motivbild-hochladen`, Seite `pages/coin-bearbeiten`) | Karte „Stammdaten“ (h2) mit Formular: Name · Herausgeber [2 Spalten]; Auflage (Pflicht, wenn gesetzt); Beschreibung · Karte „Motivbild“ (h2): eigenes Formular, Aktion „Bild hochladen“ (Bestandsname) im Abschnitt | Auflage: bestehender Hinweis + „Beim Senken werden die Exemplare über der neuen Auflage gelöscht.“ | „Änderungen speichern“ / „Abbrechen“ → Detailseite |
| Ausgabe erfassen (`features/ausgabe-erfassen`) | **Exemplar** (Radiogruppe + Exemplar-Nummer) · **Empfänger:** Name des Empfängers (Pflicht); Dienstgrad · Dienststelle [2 Spalten] · **Ausgabe:** Datum (Pflicht) · Gelegenheit (Pflicht) [2 Spalten]; Begründung (Pflicht); Ausgebende Stelle oder Person (Pflicht) · **Zertifikat:** Hologrammnummer (optional) | Exemplar-Nummer: „Zwischen 1 und {Auflage}.“ Hologrammnummer: bestehender Hinweis + „Kleinbuchstaben werden zu Großbuchstaben. Erlaubt sind A–Z und 0–9, höchstens 40 Zeichen. Die Nummer darf nur einmal vergeben sein.“ | „Ausgabe speichern“ / „Abbrechen“ → Detailseite |
| Hologrammnummer ändern (`features/hologrammnummer-aendern`, Dialog) | Hologrammnummer (Pflicht); bei Korrektur Grund der Korrektur (Pflicht) | Nummer: wie beim Erfassen (Normalisierung) | „Speichern“ / „Abbrechen“ (Dialogfuß) |
| Vorlage hochladen (`features/vorlage-hochladen`) | **Neue Version hochladen:** Word-Vorlage (.docx) | bestehende Hinweise + „Platzhalter haben die Form {{Gruppe.Feld}}, z. B. {{Zertifikat.Nummer}}. Die Liste aller Platzhalter steht in der Standardvorlage.“ | „Vorlage hochladen“, kein Abbrechen (Abschnitt einer Seite) |
| Auflage ändern (`features/auflage-aendern`, Dialog) | Auflage (Pflicht) | „Beim Senken werden die Exemplare über der neuen Auflage gelöscht. Senken ist nur bis zur höchsten je ausgegebenen Nummer möglich.“ | „Speichern“ / „Abbrechen“ |
| Storno (`features/ausgabe-stornieren`, Dialog) | Grund (Pflicht) | bestehender Hinweis „Bitte keine Personendaten in den Grund schreiben.“ + „Höchstens 500 Zeichen.“ | „Stornieren“ (gefährlich) / „Abbrechen“ |
| Benutzerverwaltung (`widgets/benutzer-tabelle`, `features/rolle-zuweisen`, `features/benutzer-status-aendern`) | Filterleiste mit „Benutzer suchen“ (Suche in Name und E-Mail) und „Suchen“; Rolle je Zeile (Auswahl mit Bestätigung), Deaktivieren/Reaktivieren je Zeile | Suche: „Sucht in Name und E-Mail.“ | keine Aktionsleiste (Sofortaktionen mit Dialog) |
| Startseite konfigurieren (`features/startseite-konfigurieren`) | Block-Karten wie bisher (je Block ein Abschnitt), Kopfbereich: Titel · Untertitel [2 Spalten], Logos [2 Spalten ab `lg`]; Pflicht: Titel bei aktivem Kopfbereich, Infotext bei aktivem Infotext-Block | bestehende Hinweise bleiben | „Speichern“ / „Änderungen verwerfen“ (Bestand, mit Rückfrage) |

### 4.3 Warnung bei ungespeicherten Änderungen (ADR-0040)
- Baustein `VerlassenWarnung` (`shared/ui/verlassen-warnung.tsx`) mit Hook `useVerlassenWarnung` (`shared/lib/hooks`). Er nutzt TanStack Router `useBlocker` (`withResolver`, `enableBeforeUnload: false`) und einen eigenen `beforeunload`-Listener, solange `aktiv` ist.
- Dialog (`alertdialog`) mit Titel „Ungespeicherte Änderungen“, Beschreibung je Formular und den Buttons „Bleiben“ (Fokus beim Öffnen) und „Verlassen“. Escape heißt „Bleiben“.
- Beschreibungen:
  - Coin anlegen: „Der neue Coin ist nicht gespeichert. Seite trotzdem verlassen?“
  - Coin bearbeiten: „Die Änderungen am Coin sind nicht gespeichert. Seite trotzdem verlassen?“
  - Ausgabe erfassen: „Die Ausgabe ist nicht gespeichert. Seite trotzdem verlassen?“
  - Vorlage hochladen: „Die ausgewählte Vorlage ist nicht hochgeladen. Seite trotzdem verlassen?“
  - Startseite: bisheriger Text.
- **Geändert** heißt: ein Wert weicht vom Ausgangswert ab (Text nach Vergleich ohne Trimmen, Datum ≠ vorbelegter Tag, Radiowahl, gewählte Datei). Zurück auf den Ausgangswert heißt „nicht geändert“.
- Blockiert werden Wechsel des Pfads, auf der Coin-Detailseite beim Reiter „Zertifikatsvorlage“ auch ein Reiterwechsel. Erfolgreiches Speichern setzt den Zustand vor der Navigation zurück, es erscheint also kein Dialog. Das Neuladen der Route nach `409` (Startseite) bleibt wie bisher.
- **Ausnahme „Coin bearbeiten“ (entschieden vom Auftraggeber):** Ist ein Motivbild gewählt, aber nicht hochgeladen, erscheint die Warnung auch nach erfolgreichem Speichern der Stammdaten. Ist nur noch das Bild offen, lautet die Beschreibung „Das ausgewählte Motivbild ist noch nicht hochgeladen. Wenn Sie die Seite verlassen, geht die Auswahl verloren.“ Mit „Bleiben“ bleibt man auf der Seite, ohne eigene Erfolgsmeldung. Der Seitenkopf zeigt bis zum Neuladen den alten Namen (offener Punkt N1, Abschnitt 14).
- `StartseiteVerwaltungRoute` nutzt den neuen Baustein mit unveränderten Texten (startseite AK-32 bleibt erfüllt).

### 4.4 Bestätigungsdialoge
- Baustein `Bestaetigungsdialog` (`shared/ui/bestaetigungsdialog.tsx`) auf Basis von `AlertDialog`.
  - Props: Titel als Frage, `folge` als Beschreibung, Bestätigungsbutton (Variante `gefaehrlich` oder `primaer`), „Abbrechen“, optional `children` für Felder (Grund), `laedt`, Fehlermeldung (`role="alert"` im Dialog).
  - Den Anfangsfokus hat „Abbrechen“, bei Feldern das erste Feld. Der Fokus kehrt zum Auslöser zurück oder, wenn es den Auslöser nach Erfolg nicht mehr gibt, zur Statusmeldung des Aufrufers.
  - Während der Anfrage schließen weder Escape noch „Abbrechen“ den Dialog.
- Genutzt von: Stornieren (Historie und Ausgabe-Seite), Deaktivieren, Auf Standardvorlage zurücksetzen, Rolle ändern, Änderungen verwerfen, Verlassen-Warnung.
- Titel, Buttonnamen und Beschreibungen bleiben wortgleich (F5). Die Folge steht dort bereits im ersten Satz.

### 4.5 Coin-Detailseite `/coins/{id}` (ADR-0042)
**Kopf (`Seitenkopf`)**
- h1 mit dem Namen, fokussierbar wie bisher. Daneben die Status-Chips (`Badge`, Text trägt die Bedeutung, F4):
  - „Auflage unbekannt“ (`warning`) für alle;
  - mit `coins.read` zusätzlich „Exemplare verfügbar“ (`success`, `verfuegbar > 0`) oder „Alle Exemplare ausgegeben“ (`neutral`, `verfuegbar = 0`).
- Aktionen, gebündelt und je nach Berechtigung, Reihenfolge links → rechts:
  - „Auflage ändern“ (sekundär, `coins.write`, Dialog wie bisher);
  - „Bearbeiten“ (sekundär, `coins.write`, Link);
  - „Ausgabe erfassen“ (primär, `issues.write`, nur bei bekannter Auflage und `verfuegbar > 0`, F4).

  Unter 640 px brechen sie unter den Titel um (Seitenkopf).
- Statusmeldungen wie bisher („Coin wurde angelegt.“, „Änderungen wurden gespeichert.“, „Exemplar Nr. {n} wurde ausgegeben.“, „Auflage wurde geändert.“) unter dem Kopf als `role="status"`.

**Kennzahlenkarten** (nur mit `coins.read`, Region `<section aria-label="Kennzahlen">`)
- Drei Karten in einer `dl`: „Auflage“, „Ausgegeben“, „Verfügbar“. Die `dd` enthält nur die Zahl (de-DE) bzw. „unbekannt“.
- Die Karte „Verfügbar“ hat einen Fortschrittsbalken (`Progress`, `role="progressbar"`, `aria-valuenow` = verfügbar, `aria-valuemax` = Auflage, `aria-valuetext` „{v} von {a} verfügbar ({p} %)“). Ohne Auflage gibt es keinen Balken.
- Ab 640 px dreispaltig, darunter einspaltig.
- Die Daten kommen aus derselben Antwort `GET …/exemplare`, die auch den Reiter „Exemplare“ füllt (genau eine Anfrage je Filter/Seite).

**Reiter** (`Tabs`, manuelle Aktivierung: Pfeiltasten bewegen den Fokus, Enter/Leertaste wählen)
| Reiter | Wert `reiter` | sichtbar mit | Inhalt |
|---|---|---|---|
| Stammdaten | `stammdaten` | allen (Reiterleiste erst ab 2 Reitern) | h2 „Stammdaten“, Motivbild und Beschreibungsliste (`CoinStammdaten`, unverändert) |
| Exemplare | `exemplare` | `coins.read` | h2 „Exemplare“, Filterleiste (Status mit Chip), Tabelle bzw. Karten, Blättern (`CoinExemplare` ohne eigene Kennzahlen und ohne Aktionen) |
| Ausgaben | `ausgaben` | `issues.read` | h2 „Ausgabehistorie“, Filterleiste (Status aktiv/storniert mit Chip), Tabelle bzw. Karten, Blättern, Stornieren und Zertifikat je Zeile mit `issues.write` |
| Zertifikatsvorlage | `vorlage` | `coins.write` | `ZertifikatsvorlageVerwalten` (verschoben von „Coin bearbeiten“, F2) |

- Der Reiter steht im URL-Suchparameter `reiter` (Direktaufruf öffnet ihn). Ein unbekannter oder nicht erlaubter Wert gilt als Standard, ohne Fehler und ohne Weiterleitung.
- Standard ohne `reiter`: „Exemplare“ mit `coins.read`, sonst „Stammdaten“ (F1). Direkt nach dem Erfassen einer Ausgabe öffnet die Seite „Ausgaben“, ohne die URL zu ändern.
- Ein Reiterwechsel ersetzt den Verlaufseintrag (`replace`) und behält `status`/`seite`.
- Inhalte nicht gewählter Reiter sind nicht im DOM. Ihre Anfragen laufen erst beim Öffnen (die Ausgabehistorie mit Personendaten also nur, wenn sie gezeigt wird).
- Ohne `coins.read` (anonym, ohne Rolle, deaktiviert) gibt es keine Reiterleiste: Stammdaten direkt, keine Kennzahlen, kein Request außer `GET /api/coins/{id}` (wie bisher).
- „Zurück zum Katalog“ bleibt am Seitenende.

### 4.6 Ausgabe-Seite `/coins/{id}/ausgaben/{aid}`
- **Kopf:**
  - h1 „Ausgabe von Exemplar Nr. {n}“ (unverändert), Beschreibung mit dem Coin-Namen als Link (unverändert), Status-Chip „aktiv“ (`success`) bzw. „storniert“ (`destructive`).
  - Aktionen (`issues.write`): „Zertifikat herunterladen“ (sekundär, Bestand inkl. Sperre bei Storno) und „Stornieren“ (gefährlich, nur aktive Ausgaben, `Bestaetigungsdialog` mit Pflichtgrund, gleiche Texte wie in der Historie).
  - Nach Erfolg zeigt die Seite die Antwort: Chip „storniert“, „Stornieren“ entfällt, der Download ist gesperrt, der Hologramm-Button entfällt. Dazu die Statusmeldung „Die Ausgabe wurde storniert.“ mit Fokus.
- **Abschnitte** (`AusgabeDetails`, gleiche Begriffe in gleicher DOM-Reihenfolge, je Abschnitt eine Karte mit h2 und eigener `dl`):
  - „Zertifikat“ (Zertifikatsnummer, Hologrammnummer mit „Hologrammnummer ergänzen/korrigieren“ daneben);
  - „Empfängerdaten“ (Empfänger, Dienstgrad, Dienststelle);
  - „Ausgabedaten“ (Datum, Gelegenheit, Begründung, Ausgebende Stelle, Erfasst, Status).

  Ab 1024 px stehen „Empfängerdaten“ und „Ausgabedaten“ nebeneinander.
- **Verlauf** (Karte, h2 „Verlauf“, `Zeitleiste` als `<ol>`, älteste zuerst):
  1. „Ausgabe erfasst“ – `erfasstAm` (Tag und Uhrzeit, Europe/Berlin), „von {erfasstVon.name}“;
  2. falls storniert: „Ausgabe storniert“ – `storno.am`, „von {storno.von.name}“, „Grund: {storno.grund}“.

  Hologramm-Korrekturen liefert die API nicht. Sie erscheinen daher nicht (F3). Die Zeitleiste erklärt das nicht, sie zeigt nur, was es gibt.
- „Zurück zum Coin“ bleibt am Seitenende.

### 4.7 Tabellenmuster (ADR-0041)
- Baustein `DatenTabelle<T>` (`shared/ui/daten-tabelle.tsx`) auf Basis von shadcn `table`.
  - Spaltendefinitionen mit Titel, Zelle, Breite (`schmal`/`mittel`/`breit`/`rest`), Ausrichtung, Rolle in der Karte (`titel`/`feld`/`aktion`/`aus`) und optional Sortierwert.
  - Caption bleibt (sr-only, gleicher Name wie heute).
- **Kartenansicht:** Unterhalb der Breite `kartenUnter` (Standard `md` = 768 px, bei mehr als 5 Spalten `lg` = 1024 px) rendert der Baustein statt der Tabelle eine Liste `<ul aria-label="{Caption}">`.
  - Je Eintrag gibt es eine Karte: Titelzeile (Spalte `titel`, Überschrift h3), eine `dl` der Felder (`dt` = Spaltentitel) und die Aktionen.
  - Es ist immer nur eine Darstellung im DOM (Media-Query per `useMedienabfrage`, in Vitest Desktop).
- **Sortierung:**
  - Nur clientseitig und nur bei vollständig geladenen Listen (Vorlagenversionen).
  - Der Spaltenkopf enthält einen Button mit dem Spaltentitel als Namen und einem `aria-hidden`-Pfeil. Den Zustand trägt `aria-sort` am `th`, `textContent` des `th` bleibt der Titel.
  - Seitenweise geladene Listen haben die feste Serversortierung. Die sortierte Spalte trägt `aria-sort`, ohne Button. Ein Sortieren nur innerhalb einer Seite gibt es nicht (F7).
- **Paginierung:** `Blaettern` (Bestand) mit „Vorherige Seite“, „Seite x von y“, „Nächste Seite“, unverändert.
- **Filterleiste** (`Filterleiste`): Filterbedienelemente links, darunter die aktiven Filter als Chips in `<ul aria-label="Aktive Filter">`.
  - Jeder Chip ist ein Badge mit dem Text „{Filter}: {Wert}“ und einem Button „Filter „{Filter}: {Wert}“ entfernen“ (≥ 40 × 40 px). Ab zwei Chips gibt es „Alle Filter entfernen“.
  - Nach dem Entfernen geht der Fokus auf den nächsten Chip, sonst auf das erste Filterbedienelement.
  - Das Ergebnis meldet die bestehende Statuszeile, z. B. „{n} Benutzer gefunden“.
- **Zeilenklick:** Nur wo es ein Ziel gibt (Ausgabehistorie → Ausgabe-Seite).
  - Ein Klick in die Zeile löst den Link der Zeile aus. Die Logik aus `CoinListe` (keine Folgeklicks, keine Zusatztasten, kein markierter Text, kein Klick auf andere Bedienelemente) wandert als `useZeilenklick` nach `shared/lib/hooks`, `CoinListe` nutzt sie unverändert.
  - Per Tastatur ist die Zeile über ihren Link erreichbar. Die Zeile selbst hat keinen Tab-Stopp. In der Kartenansicht ist der Titel der Link.
- **Spaltenbreiten:** Zahlen und Nummern `schmal` und rechtsbündig bzw. `tabular-nums`, Freitexte `breit` mit Umbruch, Aktionen `schmal` rechts. Textlinks in Tabellen werden ≥ 40 px hoch (D9 entfällt für umgebaute Tabellen).

#### 4.7.1 Tabellen in diesem Lauf
| Tabelle (Slice) | Sortierung | Filter (Chips) | Blättern | Zeilenklick | Karten unter |
|---|---|---|---|---|---|
| Exemplare (`entities/exemplar` `ExemplarTabelle`, `widgets/coin-exemplare`) | fest „Nr.“ aufsteigend (`aria-sort`) | Status (Server) | ja | nein | 768 px |
| Ausgabehistorie (`entities/ausgabe` `AusgabenTabelle`, `widgets/ausgaben-historie`) | fest „Erfasst“ absteigend | Status aktiv/storniert (Server-Parameter `status`, neu im UI, F8) | ja | ja → Ausgabe-Seite | 1024 px |
| Benutzer (`widgets/benutzer-tabelle`) | fest „Name“ aufsteigend | Suche (Server) | ja | nein | 768 px |
| Audit-Log (`entities/audit` `AuditTabelle`, `widgets/audit-log`) | fest „Zeitpunkt“ absteigend | keiner | ja | nein | 768 px |
| Vorlagenversionen (`entities/zertifikatsvorlage` `VersionenTabelle`) | clientseitig: Version, Hochgeladen am, Größe (Standard Version absteigend = API-Reihenfolge) | keiner | nein (vollständig) | nein | 768 px |

Nicht in diesem Lauf (Listen der Übersicht, F6): Katalog `/coins` (`CoinListe`, `widgets/coin-katalog`) und die Listen der Startseiten-Blöcke.

### 4.8 Neue und geänderte Bausteine
| Baustein | Datei (Public API = Modulpfad, ADR-0008) | Quelle | Props (Kern) | Bausteinseite (h2) |
|---|---|---|---|---|
| Fortschrittsbalken | `shared/ui/progress.tsx` | shadcn CLI (Base UI Progress), nachbearbeitet | `value`, `max`, `aria-label`/`aria-valuetext` | „Fortschrittsbalken“ |
| Formularabschnitt | `shared/ui/formular-abschnitt.tsx` | eigene Komposition (`fieldset`) | `titel`, `ebene?: 2\|3`, `beschreibung?`, `spalten?: 1\|2`, `children` | „Formularabschnitt“ |
| Fehlerzusammenfassung | `shared/ui/fehlerzusammenfassung.tsx` | Komposition aus `alert` | `titel?` (Standard „Bitte die markierten Eingaben prüfen.“), `fehler: {feldId, label, text}[]`, `weitere?: string[]` | „Fehlerzusammenfassung“ |
| Aktionsleiste | `shared/ui/aktionsleiste.tsx` | Komposition | `children` (Reihenfolge: Abbrechen, Hauptaktion), `fest?: boolean` (Standard `true`: sticky unter 768 px) | „Aktionsleiste“ |
| Bestätigungsdialog | `shared/ui/bestaetigungsdialog.tsx` | Komposition aus `alert-dialog` | `offen`, `onOffenAendern`, `titel`, `folge`, `bestaetigen`, `variante`, `laedt`, `fehler?`, `onBestaetigen`, `children?`, `ausloeserRef?` | „Bestätigungsdialog“ |
| Verlassen-Warnung | `shared/ui/verlassen-warnung.tsx` + `shared/lib/hooks/use-verlassen-warnung.ts` | Komposition + Router-Hook | `aktiv`, `beschreibung`, `blockiere?(von, nach)` | „Verlassen-Warnung“ (öffnet per Button, ohne Router-Navigation) |
| Kennzahlkarte | `shared/ui/kennzahl-karte.tsx` | Komposition aus `card` + `progress` | `KennzahlRaster` (`dl`), `KennzahlKarte({ begriff, wert, anteil?: { wert, von, text } })` | „Kennzahlkarte“ |
| Zeitleiste | `shared/ui/zeitleiste.tsx` | eigene Komposition (`ol`) | `beschriftung`, `eintraege: { id, titel, zeitpunkt (ISO), zeitText, beschreibung?, ton: 'neutral'\|'erfolg'\|'gefahr' }[]` | „Zeitleiste“ |
| Datentabelle | `shared/ui/daten-tabelle.tsx` | Komposition aus `table`, `card` | `beschriftung`, `zeilen`, `schluessel`, `spalten`, `sortierung?`, `onSortierung?`, `zeilenklick?`, `kartenUnter?: 'md'\|'lg'`, `leer?` | „Datentabelle“ (Tabelle, Karten bei 360 px, sortierbar) |
| Filterleiste mit Chips | `shared/ui/filterleiste.tsx` | Komposition aus `badge`, `button` | `children`, `chips: { id, text, onEntfernen }[]`, `onAlleEntfernen?` | „Filterleiste“ |
| Paginierung | `shared/ui/blaettern.tsx` | Bestand | unverändert | „Blättern“ (neu auf der Seite) |
| Formularfeld | `shared/ui/formularfeld.tsx` | Bestand, angepasst | `pflicht`: sichtbar „(Pflicht)“ `aria-hidden`, sr-only „(Pflichtfeld)“; neu `onBlur`-Weitergabe über `feld` | „Formularfeld“ (Bestand) |
| Formular-Hook | `shared/lib/formular/index.ts` (`useFormular`, `useSendeSperre`) | eigen (ADR-0039) | Abschnitt 4.1 | – (Beispielformular auf „Formularabschnitt“) |
| Medienabfrage, Zeilenklick | `shared/lib/hooks/use-medienabfrage.ts`, `use-zeilenklick.ts` | eigen | `useMedienabfrage(query)`, `useZeilenklick()` | – |

- Neue Abschnitte der Bausteinseite folgen in der genannten Reihenfolge nach „Brotkrumen“. Die Bausteinseite bleibt ohne API-Aufruf.
- Ist `progress` für Base UI nicht über die CLI verfügbar, wird gestoppt und gemeldet (ADR-0036 Punkt 6).
- Weitere CLI-Komponenten werden nicht gebraucht: `tabs`, `alert-dialog`, `badge`, `table` und `card` sind vorhanden.

### 4.9 FSD-Zuordnung (Importe nur nach unten)
- `app/router`:
  - `suchparameter.ts`: `coinDetailSuche` liest zusätzlich `reiter` (`stammdaten|exemplare|ausgaben|vorlage`, sonst `undefined`).
  - `routen-komponenten.tsx`: `CoinDetailRoute` reicht `reiter`/`onReiter` und `vorlage: coins.write` durch, `AusgabeDetailRoute` reicht `darfStornieren` durch. `StartseiteVerwaltungRoute` nutzt `VerlassenWarnung`.
- `pages`:
  - `coin-detail`: Kopf, Kennzahlen, Reiter. Lädt `…/exemplare` einmal und gibt die Daten an `CoinExemplare` weiter.
  - `ausgabe-detail`: Kopf, Abschnitte, Verlauf, Stornieren.
  - `coin-anlegen`, `coin-bearbeiten` (ohne Zertifikatsvorlage, F2), `ausgabe-erfassen`, `benutzerverwaltung`, `startseite-verwaltung`, `entwicklung-bausteine`.
- `widgets`:
  - `coin-exemplare`: neue optionale Props `daten` (kontrolliert, dann ohne eigene Anfrage), `kennzahlenZeigen` (Standard `true`); `darfErfassen`/`darfAuflageAendern` bleiben für den Bestand. Die Seite übergibt `false` und rendert die Aktionen im Kopf.
  - `ausgaben-historie` (Statusfilter, `DatenTabelle`, Zeilenklick), `benutzer-tabelle`, `audit-log`, `zertifikatsvorlage`.
- `features`: alle Formulare aus 4.2 sowie `ausgabe-stornieren`, `vorlage-zuruecksetzen`, `benutzer-status-aendern`, `rolle-zuweisen` (auf `Bestaetigungsdialog`).
- `entities`:
  - `exemplar`: `Kennzahlen` als Karten (`dl` bleibt) und neu `BestandChips`;
  - `ausgabe`: `AusgabeDetails` in Abschnitten und neu `AusgabeVerlauf`, `AusgabeStatusChip`, `AusgabenTabelle` auf `DatenTabelle`;
  - `audit`, `benutzer`, `zertifikatsvorlage` (Tabellen auf `DatenTabelle`);
  - `coin`: `CoinListe` nutzt `useZeilenklick`.

  Jede neue Komponente steht in der `index.ts` ihres Slices.
- `shared`: Abschnitt 4.8. Keine Querimporte, der Status-Chip des Coins entsteht in `pages/coin-detail` aus `entities/coin` und `entities/exemplar`.

## 5. Datenmodell und API
Keine Änderung: kein Endpunkt, kein DTO, keine Migration, keine neue Berechtigung. Neu im Frontend genutzt wird nur der vorhandene Query-Parameter `status` von `GET /api/coins/{id}/ausgaben` (F8).

## 6. Sicherheit und Datenschutz
- Sichtbarkeit von Reitern, Aktionen, Kennzahlen und Chips nur aus `berechtigungen` von `/api/me` (`abhaengigkeiten.test.ts`). Ohne Berechtigung fehlen Reiter und Aktionen im DOM, die zugehörigen Anfragen entfallen.
- Die Ausgabehistorie (Personendaten) wird erst beim Öffnen des Reiters geladen. Der URL-Parameter `reiter` enthält keine Daten. Filterwerte der Historie stehen nicht in der URL.
- Empfängerdaten, Gründe und Hologrammnummern erscheinen nie in URL, Logs, Statusmeldungen außerhalb der Ausgabe-Seite, Fehlerzusammenfassung-Links (Anker nur auf Feld-Ids) oder Toasts. Die Storno-Meldung nennt nur die Exemplar-Nummer bzw. keinen Empfänger.
- `Verlassen-Warnung` und `beforeunload` speichern nichts. Ungespeicherte Eingaben bleiben nur im React-Zustand, kein `localStorage`/`sessionStorage`.
- Kein `dangerouslySetInnerHTML`. Freitexte in Karten, Zeitleiste und Zusammenfassung werden als Text gerendert.
- Screenshots nur mit gemockten, synthetischen Daten („Testperson A“, „Dienststelle Beispiel“). Sie werden nicht eingecheckt (F10).

## 7. Akzeptanzkriterien

### Formulare (Formulare aus 4.2)
- **AK-1** Jedes Formular aus 4.2 gliedert seine Felder in die dort genannten Abschnitte. Jeder Abschnitt ist eine Gruppe (`group`) mit dem Abschnittstitel als zugänglichem Namen und einer Überschrift. Bei 1280 px stehen die als „2 Spalten“ markierten Felder nebeneinander (gleiche `y`-Position), bei 360 px untereinander.
- **AK-2** Pflichtfelder haben `required`, den sichtbaren Text „(Pflicht)“ und „(Pflichtfeld)“ im zugänglichen Namen. Optionale Felder haben weder `required` noch „Pflicht“ im Namen und behalten „(optional)“. Alle Felder nutzen `Formularfeld` (Label-Verknüpfung, `aria-describedby` mit Fehler vor Hilfe, Fehler mit sr-only „Fehler:“).
- **AK-3** Die Hilfetexte aus 4.2 stehen am jeweiligen Feld und sind in dessen zugänglicher Beschreibung enthalten. Bestehende Hinweistexte bleiben wortgleich.
- **AK-4** Fokus verlassen ohne Änderung erzeugt keinen Fehler, auch nicht bei leeren Pflichtfeldern. Vor dem ersten Verlassen eines Felds steht an ihm kein Fehler, auch wenn der Wert schon ungültig ist.
- **AK-5** Nach Eingabe eines ungültigen Werts und Verlassen des Felds erscheint am Feld die bestehende deutsche Meldung (`aria-invalid="true"`). Wird der Wert gültig, verschwindet sie bei der nächsten Eingabe. Ein Server-Feldfehler bleibt, bis das Feld geändert wird.
- **AK-6** Absenden mit Fehlern sendet keinen Request, zeigt alle Feldfehler und setzt den Fokus auf das erste fehlerhafte Feld in Formularreihenfolge. Das gilt auch für Server-Feldfehler (`400`, `409` mit Feldbezug).
- **AK-7** Ab zwei Feldfehlern steht oben im Formular (vor dem ersten Abschnitt) eine Zusammenfassung mit `role="alert"`, Titel „Bitte die markierten Eingaben prüfen.“ und je Fehler einem Link „<Label>: <Meldung>“. Ein Link (Enter oder Klick) fokussiert das Feld, die URL bleibt gleich. Bei genau einem Feldfehler gibt es keine Zusammenfassung (Ausnahme Startseite: wie bisher ab einem Fehler).
- **AK-8** Formularmeldungen ohne Feldbezug (z. B. „Ein Coin mit diesem Namen und Herausgeber existiert bereits.“, „Alle Exemplare dieses Coins sind ausgegeben.“, kein Zugriff, Netzwerk) erscheinen mit unverändertem Text als `role="alert"` oben im Formular. Eingaben bleiben erhalten.
- **AK-9** Aktionsleiste bei ≥ 768 px: Die Hauptaktion steht rechts, „Abbrechen“ links daneben (beide in derselben Zeile, Hauptaktion mit größerem `x`). Bei 360 px bleibt die Leiste beim Scrollen am unteren Viewportrand sichtbar, beide Buttons sind ≥ 40 px hoch und im Viewport. Ein per Tab fokussiertes Feld wird nie von der Leiste verdeckt (Bounding-Box-Prüfung).
- **AK-10** Beim Speichern zeigt die Hauptaktion den Ladezustand (`aria-busy="true"`, `aria-disabled="true"`, Spinner `aria-hidden`), ihr Name bleibt, der Fokus bleibt auf ihr. Zwei schnelle Klicks oder zweimal Enter erzeugen genau einen Request.
- **AK-11** Jedes Formular aus 4.2 lässt sich bei 1280 px und bei 360 px allein per Tastatur ausfüllen (Tab, Pfeiltasten, Leertaste, Enter, Dateiauswahl über den Dateidialog per Tastatur bzw. `setInputFiles` nach Fokus) und absenden. Danach kommt dieselbe Erfolgsmeldung bzw. Navigation wie bei Mausbedienung.
- **AK-12** Fachverhalten unverändert: gleiche Requests (Pfad, Methode, Body) wie bisher für gleiche Eingaben, gleiche Erfolgsmeldungen und Navigationsziele.

### Ungespeicherte Änderungen
- **AK-13** Auf „Coin anlegen“, „Coin bearbeiten“ und „Ausgabe erfassen“ und im Reiter „Zertifikatsvorlage“ (gewählte, nicht hochgeladene Datei) öffnet das Verlassen über die App (Sidebar, Links, „Abbrechen“, Zurück im Browser, Reiterwechsel bei „Zertifikatsvorlage“) nach einer Änderung den Dialog „Ungespeicherte Änderungen“ mit der Beschreibung aus 4.3 und „Bleiben“/„Verlassen“. „Bleiben“ und Escape lassen Seite und Eingaben unverändert. „Verlassen“ navigiert ohne Request.
- **AK-14** Ohne Änderung oder nach Rücksetzen auf den Ausgangswert erscheint kein Dialog. Nach erfolgreichem Speichern erscheint beim Weiterleiten kein Dialog. Ausnahme: Auf „Coin bearbeiten“ mit gewähltem, nicht hochgeladenem Motivbild erscheint die Warnung auch nach dem Speichern der Stammdaten (Text und Verhalten in 4.3).
- **AK-15** Bei Änderungen ist `beforeunload` registriert (Ereignis `cancelable`, `defaultPrevented` nach Auslösen), ohne Änderungen nicht.
- **AK-16** Die Startseiten-Verwaltung erfüllt startseite AK-32 unverändert und nutzt dafür denselben Baustein.

### Bestätigungen
- **AK-17** „Stornieren“ (Historie und Ausgabe-Seite), „Deaktivieren“ und „Auf Standardvorlage zurücksetzen“ senden erst nach Bestätigung im Dialog.
  - Der Dialog hat Titel und Beschreibung, die die Folge benennt. Die Texte bleiben wie bisher (F5).
  - „Abbrechen“ und Escape senden nichts und geben den Fokus an den Auslöser zurück.
  - Stornieren verlangt einen nicht leeren Grund: Ohne Grund erscheint der Feldfehler, kein Request.
  - Während der Anfrage zeigt der Bestätigungsbutton den Ladezustand und der Dialog schließt nicht.
- **AK-18** Alle Bestätigungs- und Warndialoge nutzen `Bestaetigungsdialog` (`alertdialog`, Titel als Name, Beschreibung als `aria-describedby`, gefährliche Aktion in Variante „gefährlich“).

### Coin-Detailseite
- **AK-19** Kopf: h1 = Name. Status-Chips nach 4.5 als Text-Badges: Anonym sieht bei fehlender Auflage „Auflage unbekannt“, mit `coins.read` zusätzlich genau einen von „Exemplare verfügbar“/„Alle Exemplare ausgegeben“, wenn die Auflage bekannt ist.
- **AK-20** Aktionen im Kopf nach Berechtigung:
  - Administrator und Sachbearbeiter sehen „Auflage ändern“, „Bearbeiten“ und „Ausgabe erfassen“ (letzteres nur bei bekannter Auflage und `verfuegbar > 0`, F4).
  - Betrachter, anonyme Besucher und Benutzer ohne Rolle sehen keine dieser Aktionen.
  - Kein anderer Bereich der Seite enthält diese Aktionen.
- **AK-21** Kennzahlen (mit `coins.read`): Region „Kennzahlen“ mit `dl` „Auflage“, „Ausgegeben“, „Verfügbar“. Die `dd` enthalten nur die Zahlen in de-DE bzw. „unbekannt“. Die Karte „Verfügbar“ hat einen `progressbar` mit `aria-valuenow`/`aria-valuemax` und `aria-valuetext` „{v} von {a} verfügbar ({p} %)“, ohne Auflage keinen. Es gibt genau einen Request auf `…/exemplare` je Filter/Seite, ohne `coins.read` keinen.
- **AK-22** Reiter nach 4.5:
  - Reiterleiste (`tablist`) nur ab zwei sichtbaren Reitern. Betrachter: „Stammdaten“, „Exemplare“. Sachbearbeiter und Administrator: alle vier.
  - Pfeiltasten bewegen den Fokus zwischen den Reitern, Enter/Leertaste aktivieren. Der aktive Reiter hat `aria-selected="true"`, sein Panel ist `tabpanel` mit dem Reiter als Namen.
  - Inhalte anderer Reiter sind nicht im DOM. Die Ausgabehistorie wird erst beim Öffnen von „Ausgaben“ geladen.
- **AK-23** `?reiter=<wert>` öffnet den Reiter direkt. Ein Reiterwechsel schreibt den Wert per `replace` in die URL und behält `status`/`seite`. Ein unbekannter oder nicht erlaubter Wert zeigt den Standardreiter ohne Fehler. Standard: „Exemplare“ mit `coins.read`, sonst Stammdaten ohne Reiterleiste (F1). Nach dem Erfassen einer Ausgabe ist „Ausgaben“ geöffnet, die URL bleibt `/coins/{id}`.
- **AK-24** Exemplar-Filter und -Seite funktionieren wie bisher (URL `status`, `seite`). Der aktive Statusfilter erscheint als Chip „Status: Verfügbar“ bzw. „Status: Ausgegeben“. Entfernen des Chips setzt „Alle“ und Seite 1 und setzt den Fokus nach AK-33.
- **AK-25** „Auflage ändern“ im Kopf aktualisiert nach Erfolg Stammdaten und Kennzahlen und meldet „Auflage wurde geändert.“ (`role="status"`). Storno in der Historie aktualisiert die Kennzahlen.

### Ausgabe-Seite
- **AK-26** Abschnitte „Zertifikat“, „Empfängerdaten“, „Ausgabedaten“ und „Verlauf“ als h2. Die Begriffe der Beschreibungslisten bleiben in der bisherigen Reihenfolge (`AusgabeDetails.test.tsx`). Status-Chip „aktiv“ bzw. „storniert“ im Kopf.
- **AK-27** Verlauf als geordnete Liste: „Ausgabe erfasst“ mit `<time dateTime>` = `erfasstAm` und Name des Erfassers. Bei Storno folgt „Ausgabe storniert“ mit Zeitpunkt, Name und Grund. Kein Eintrag nennt Daten, die die API nicht liefert.
- **AK-28** Mit `issues.write` stehen im Kopf „Zertifikat herunterladen“ (Bestand) und bei aktiver Ausgabe „Stornieren“. Nach bestätigtem Storno zeigt die Seite ohne Neuladen „storniert“, den Verlaufseintrag und die Meldung „Die Ausgabe wurde storniert.“ (Fokus). „Stornieren“ und „Hologrammnummer …“ entfallen, der Download ist gesperrt wie bisher. Ohne `issues.write` gibt es weder Aktionen noch einen Request auf `…/storno`.

### Tabellen
- **AK-29** Die Tabellen aus 4.7.1 behalten Caption-Namen, Spaltentitel (`columnheader`-Text) und Zeilentexte. Breiten nach 4.7. Bei 1280 px ist die Ausgabehistorie ohne horizontales Scrollen vollständig sichtbar.
- **AK-30** Unterhalb ihrer Kartenbreite (4.7.1) erscheinen statt der Tabelle Karten: eine Liste mit dem Caption-Namen, je Eintrag Titel (h3) und `dl` mit allen sichtbaren Spalten außer der Titelspalte sowie den Aktionen. Bei 360 px gibt es auf keiner Seite dieses Laufs eine abgeschnittene Tabelle: `scrollWidth ≤ clientWidth` für jeden Tabellencontainer und `document.documentElement.scrollWidth ≤ innerWidth`.
- **AK-31** Vorlagenversionen: Die Spalten „Version“, „Hochgeladen am“ und „Größe“ sind per Button im Spaltenkopf sortierbar (Enter/Leertaste, Wechsel aufsteigend ↔ absteigend). `aria-sort` gibt den Zustand an, der Button-Name ist der Spaltentitel. Seitenweise Tabellen zeigen ihre feste Sortierung nur per `aria-sort` an der sortierten Spalte und haben keinen Sortier-Button.
- **AK-32** Ausgabehistorie: Ein Mausklick in eine Zeile außerhalb von Bedienelementen öffnet die Ausgabe-Seite. Folgeklicks, Zusatztasten und markierter Text navigieren nicht. Per Tastatur ist jede Zeile über den Link „Ausgabe {Nummer} anzeigen“ erreichbar, die Zeile selbst hat keinen Tab-Stopp. In der Kartenansicht ist der Titel dieser Link.
- **AK-33** Filter-Chips (Exemplare: Status, Historie: Status, Benutzer: Suche):
  - Jeder aktive Filter ist ein Chip in der Liste „Aktive Filter“ mit dem Text „{Filter}: {Wert}“ und dem Button „Filter „{Filter}: {Wert}“ entfernen“ (≥ 40 × 40 px).
  - Entfernen lädt neu ab Seite 1. Der Fokus geht auf den nächsten Chip, sonst auf das erste Filterbedienelement.
  - Ohne aktive Filter gibt es keine Liste.
- **AK-34** Blättern bleibt wie bisher („Vorherige Seite“, „Seite x von y“, „Nächste Seite“, Fokusverhalten am Rand). In Kartenansicht steht es unter den Karten.

### Bausteine, Barrierefreiheit, Qualität
- **AK-35** Die Bausteine aus 4.8 liegen in den genannten Dateien. Die Bausteinseite zeigt je neuem Baustein einen Abschnitt (h2) mit allen Varianten und Zuständen (Fehler, lädt, leer, Kartenansicht per Umschalter „Kartenansicht zeigen“). Alle Texte sind deutsch, es gibt keinen API-Aufruf. `progress` ist nachbearbeitet (`cn` aus `@/shared/lib/cn`, keine englischen Texte).
- **AK-36** Keine neue Laufzeit- oder Entwicklungsabhängigkeit in `web/package.json` und `e2e/package.json` (keine Formular-, Tabellen- oder Validierungsbibliothek).
- **AK-37** axe meldet 0 Verstöße `serious`/`critical`:
  - auf allen Seiten dieses Laufs bei 360 und 1280 px, hell und dunkel;
  - auf der Coin-Detailseite je Reiter;
  - mit geöffnetem Storno-, Deaktivieren-, Zurücksetzen- und Verlassen-Dialog;
  - je Formular im Fehlerzustand (mit Zusammenfassung).
- **AK-38** Bei 360, 768 und 1280 px scrollt keine Seite dieses Laufs horizontal, auch nicht mit Fehlern, Zusammenfassung oder geöffnetem Dialog. Klickflächen ≥ 40 × 40 px wie design-fundament AK-34, jetzt einschließlich Tabellen- und Kartenlinks, Chip-Buttons und Reiter.
- **AK-39** Gestaltungsregeln (design-fundament AK-3 bis AK-5): keine Farben und beliebigen Abstände außerhalb der Tokens in neuen oder geänderten Dateien.
- **AK-40** Alle bisherigen Tests (Vitest, `web/ui-tests`, `e2e`) sind grün. Angepasst werden nur die in Abschnitt 11 genannten Stellen K1–K8 und K10 (freigegeben, F9) und dort nur Navigationsschritte, Locator oder der Bestätigungsschritt im neuen Dialog, nicht der Prüfinhalt. Jede Anpassung steht mit Begründung im Commit und im QA-Bericht.
- **AK-41** Screenshots werden nur lokal erzeugt und nicht eingecheckt (F10):
  - `web/ui-tests/screenshots-formulare.spec.ts` läuft nur mit `COIN_SCREENSHOTS=1` und schreibt nach `web/test-results/screenshots-formulare/<ansicht>_<breite>_<hell|dunkel>.png`. Das Verzeichnis ist über `web/.gitignore` (`test-results`) ausgeschlossen. Ohne die Variable wird die Spec übersprungen und prüft keine Dateien.
  - Ansichten: je Formular aus 4.2 einmal mit Fehlern (Feldfehler und Zusammenfassung) und einmal im Erfolgsfall (Seite bzw. Meldung nach dem Speichern); die Coin-Detailseite je Reiter; die Ausgabe-Seite aktiv und storniert; die drei Bestätigungsdialoge und die Verlassen-Warnung; jeweils bei 360, 768 und 1280 px, hell und dunkel.
  - Der Developer erzeugt die Bilder, sieht jedes an und bessert nach. Die Befunde stehen im Bericht (Ansicht, Breite, Theme, Befund, Behebung).
  - Die 36 eingecheckten Bilder in `docs/design/ablage/` und `web/ui-tests/screenshots.spec.ts` bleiben unverändert.
  - Eine Datei unter `docs/design/` kommt in diesem Lauf nicht hinzu.
- **AK-42** Doku: dieser Entwurf, ADR-0039 bis ADR-0042, `docs/requirements.md` (Funktion 9, Entscheidungen) und der Hinweis zur Pflichtkennzeichnung in design-fundament Abschnitt 14 (Docs-Agent).

## 8. Tests (Zuordnung)
| Ebene | Datei (neu, falls nicht anders vermerkt) | AK |
|---|---|---|
| Vitest | `web/src/shared/lib/formular/use-formular.test.tsx` (Verlassen/Ändern/Absenden, Fokus erstes Feld, Server-Fehler, Sendesperre) | 4–7, 10 |
| Vitest | `web/src/shared/ui/fehlerzusammenfassung.test.tsx`, `formular-abschnitt.test.tsx`, `aktionsleiste.test.tsx`, `bestaetigungsdialog.test.tsx`, `verlassen-warnung.test.tsx` (mit Memory-Router), `kennzahl-karte.test.tsx`, `zeitleiste.test.tsx`, `daten-tabelle.test.tsx` (Tabelle, Karten per `stubMatchMedia`, Sortierung, Zeilenklick), `filterleiste.test.tsx`, `progress.test.tsx`; `formularfeld.test.tsx` (ergänzt: „(Pflichtfeld)“ im Namen) | 2, 7, 9, 13–15, 18, 21, 27, 30–33, 35 |
| Vitest | je Formular-Feature ein neuer `*.muster.test.tsx` (Abschnitte, Pflicht, Hilfe, Validierung bei Verlassen, Zusammenfassung, Sendesperre): `coin-anlegen`, `coin-bearbeiten`, `ausgabe-erfassen`, `hologrammnummer-aendern`, `vorlage-hochladen`, `auflage-aendern`, `ausgabe-stornieren`, `startseite-konfigurieren` | 1–8, 10, 12 |
| Vitest | `web/src/pages/coin-detail/ui/CoinDetailSeite.reiter.test.tsx` (je Berechtigungsstufe: Chips, Aktionen, Reiter, Requests, `reiter`-Prop, Fokus), `web/src/app/App.formulare-detailseiten.test.tsx` (Route: `?reiter`, ungültige Werte, Standard, nach Erfassen „Ausgaben“, Verlassen-Warnung je Route) | 13–14, 19–25 |
| Vitest | `web/src/pages/ausgabe-detail/ui/AusgabeDetailSeite.verlauf.test.tsx`, `entities/ausgabe/ui/AusgabeVerlauf.test.tsx` | 26–28 |
| Vitest | `web/src/app/gestaltungsregeln.test.ts`, `design-abhaengigkeiten.test.ts` (Bestand, laufen über neue Dateien), `BausteineSeite.test.tsx` (Bestand; `ABSCHNITTE` um die neuen Abschnitte erweitert) | 35, 36, 39 |
| UI-Test (gemockte API) | `web/ui-tests/formulare.spec.ts`: je Formular Tastatur-Durchlauf bei 1280 und 360 px, Fehler bei Verlassen, Zusammenfassung mit Link-Fokus, Aktionsleiste (Position, sticky, Fokus nicht verdeckt), Doppelklick = 1 Request | 1, 4–11 |
| UI-Test | `web/ui-tests/verlassen-warnung.spec.ts` (Sidebar-Link, Abbrechen, Browser-Zurück, Reiterwechsel, `beforeunload` per `page.on('dialog')` beim Neuladen) | 13–16 |
| UI-Test | `web/ui-tests/bestaetigungen.spec.ts` (Storno Historie und Ausgabe-Seite, Deaktivieren, Zurücksetzen: Abbrechen ohne Request, Escape, Bestätigen mit Request, Pflichtgrund) | 17, 18, 28 |
| UI-Test | `web/ui-tests/coin-detail-rollen.spec.ts` (Administrator, Sachbearbeiter, Betrachter, anonym: Kennzahlen, Chips, Reiter, Aktionen sichtbar bzw. nicht, `?reiter`) | 19–24 |
| UI-Test | `web/ui-tests/tabellen.spec.ts` (360/768/1280: Karten statt Tabelle, kein Abschneiden, Sortierung Versionen, Filter-Chips, Zeilenklick) | 29–34, 38 |
| UI-Test | `web/ui-tests/barrierefreiheit.spec.ts` und `responsiv.spec.ts` (Bestand, um die Zustände aus AK-37/38 ergänzt; Anpassung K8) | 37, 38 |
| UI-Test | `web/ui-tests/screenshots-formulare.spec.ts` (nur mit `COIN_SCREENSHOTS=1`, Ausgabe nach `web/test-results/screenshots-formulare/`, nicht eingecheckt; ohne Variable übersprungen) | 41 |
| Systemtest (echte API) | `e2e/tests/formulare-detailseiten.spec.ts`: Administrator legt per Tastatur einen Coin an (erst mit Fehler, dann erfolgreich), erfasst eine Ausgabe (landet auf „Ausgaben“), storniert sie auf der Ausgabe-Seite über den Dialog mit Grund (Verlauf zeigt Storno). Betrachter sieht Kennzahlen und Reiter ohne Aktionen. axe auf allen Reitern bei 360/1280 px, kein horizontales Scrollen | 11, 17, 20–23, 27, 28, 37, 38 |

Gemeinsame Mocks für die neuen UI-Tests gehören nach `web/ui-tests/hilfen/` (Tester). Hinweis: Playwright leert `test-results` zu Beginn jedes Laufs. Die Screenshots werden daher direkt nach dem Lauf mit `COIN_SCREENSHOTS=1` angesehen.

## 9. Doku
- `docs/requirements.md`: Funktion 9 und Entscheidungen F1–F10 (eingetragen).
- design-fundament Abschnitt 14 „Vormerkungen“: Tabellen-Umbau und Zustände in den Widgets dieses Laufs erledigt; Pflichtkennzeichnung nach ADR-0039.
- `CLAUDE.md` „Aktueller Stand“ und „Frontend-Standard“ (Formularmuster, Tabellenmuster, Reiter per `reiter`): übernimmt der Mensch bzw. die Hauptsitzung (wie D8).

## 10. Abhängigkeiten zu anderen Features
- zertifikatsvorlagen AK-26 bis AK-31: Die Vorlagenverwaltung zieht in den Reiter „Zertifikatsvorlage“ (F2), der Hinweis auf „Coin hinzufügen“ ändert sich entsprechend.
- startseite AK-32: bleibt erfüllt, neue Implementierung.
- katalog-seiten AK-17 bis AK-20, coin-ausgaben AK-20 bis AK-25, zertifikat-erzeugen AK-27 bis AK-30: Inhalte bleiben, Anordnung in Reitern.

## 11. Erwartete Kollisionen mit bestehenden Tests
Prüfinhalt (welche Daten, Texte, Rechte, Requests) bleibt. Es ändern sich Orte und Navigationsschritte. Die Anpassungen an K1–K8 und K10 sind freigegeben (F9, 2026-11-14), und zwar nur für Navigationsschritte, Locator und den Bestätigungsschritt, je begründet.

| # | Datei und Test | Warum rot | Lösung (freigegeben) |
|---|---|---|---|
| K1 | `web/src/pages/coin-detail/ui/CoinDetailSeite.test.tsx`: „Sachbearbeiter … zeigt „Exemplare“ und „Ausgabehistorie“ als Überschriften der Ebene 2“ (Z. 435), „lädt Exemplare und Historie je genau einmal“ (Z. 442), „deutsche Texte … mit allen Berechtigungen“ (Z. 611) | Ausgabehistorie ist nicht mehr gleichzeitig mit den Exemplaren im DOM (Reiter, Standard „Exemplare“) | Test rendert mit `reiter="ausgaben"` bzw. klickt den Reiter „Ausgaben“; Request-Zählung je Reiter |
| K2 | `web/src/app/App.coin-ausgaben.test.tsx` (Z. 194–195 beide Tabellen, Z. 304 ff. Historie), `web/src/app/App.katalog-seiten.test.tsx` (Z. 361–362 beide Regionen, Z. 864), `web/src/app/App.zertifikat-erzeugen.test.tsx` (Z. 162–194) | wie K1 | Aufruf mit `?reiter=ausgaben` oder Klick auf den Reiter |
| K3 | `web/ui-tests/coin-ausgaben.spec.ts` (Storno- und Historienfälle ab Z. 486, 508, 541, 644, 690, 713), `web/ui-tests/zertifikat-erzeugen.spec.ts` (Z. 255, 309), `web/ui-tests/katalog-seiten.spec.ts` (Z. 984), `e2e/tests/coin-ausgaben.spec.ts` (Z. 117–162), `e2e/tests/zertifikat-erzeugen.spec.ts` (Z. 134–175), `e2e/tests/hologrammnummer.spec.ts` (Historie-Zugriff), `e2e/tests/katalog-seiten.spec.ts` (Historie-Fälle) | wie K1 | Klick auf Reiter „Ausgaben“ (`getByRole('tab', { name: 'Ausgaben' })`) oder `goto(…?reiter=ausgaben)`. Fälle direkt nach dem Erfassen bleiben unverändert (Reiter öffnet automatisch), z. B. `e2e/tests/design-fundament.spec.ts:56–61` |
| K4 | `web/ui-tests/coin-ausgaben.spec.ts:287–292` (`kennzahlen()` = `section` mit h2 „Exemplare“ → `dl`), genutzt in Z. 302 und 340; `e2e/tests/coin-ausgaben.spec.ts:70` | Kennzahlen stehen jetzt im Kopf in der Region „Kennzahlen“ | Locator auf `getByRole('region', { name: 'Kennzahlen' }).locator('dl')`. Text und Regex bleiben |
| K5 | Vorlage auf „Coin bearbeiten“: `web/src/pages/coin-bearbeiten/ui/CoinBearbeitenSeite.test.tsx` (Z. 168 u. a.), `web/src/app/App.zertifikatsvorlagen.test.tsx` (Vorlagen-Requests), `web/ui-tests/zertifikatsvorlagen.spec.ts` (Z. 287, 296, 357, 408, 480, 527), `e2e/tests/zertifikatsvorlagen.spec.ts` (Z. 108–167), `web/src/pages/coin-anlegen/ui/CoinAnlegenSeite.test.tsx:164` (Hinweis „… auf der Seite „Coin bearbeiten“ hoch.“) | Vorlagenverwaltung zieht in den Reiter „Zertifikatsvorlage“ (F2) | Tests öffnen `/coins/{id}?reiter=vorlage`. Neuer Hinweistext auf „Coin hinzufügen“: „Laden Sie die Standardvorlage herunter, um daraus in Word eine Urkunde zu gestalten. Die fertige Vorlage laden Sie nach dem Anlegen auf der Detailseite des Coins im Reiter „Zertifikatsvorlage“ hoch.“ |
| K6 | `web/src/app/App.katalog-seiten.test.tsx:551` „führt über „Abbrechen“ zu /coins, ohne zu speichern“ (füllt aus, klickt „Abbrechen“) | Verlassen-Warnung erscheint (gewolltes neues Verhalten) | Test bestätigt mit „Verlassen“, Prüfinhalt (Pfad `/coins`, kein POST) bleibt |
| K7 | `web/src/features/coin-anlegen/ui/CoinFormular.test.tsx:719, 756` (`absenden` `toBeDisabled()` während des Sendens) | Hauptaktion nutzt `laedt` (`aria-disabled`, fokussierbar) statt nativem `disabled` | Erwartung `toHaveAttribute('aria-disabled', 'true')`, Prüfinhalt „gesperrt während des Sendens“ bleibt |
| K8 | `web/ui-tests/responsiv.spec.ts:116–131` „lässt Tabellen auf „benutzerverwaltung“ bei 360 px in ihrem Container scrollen“ (erwartet ≥ 1 `table`) | Benutzer erscheinen bei 360 px als Karten | „benutzerverwaltung“ aus der Schleife nehmen. Abdeckung durch `tabellen.spec.ts` (AK-30). Katalog und Bausteine bleiben |
| K9 | `web/ui-tests/screenshots.spec.ts` | keine: Die eingecheckten 36 Bilder bleiben, die Spec prüft nur deren Vorhandensein | keine Anpassung, keine Neuerzeugung (F10) |
| K10 | Risiko, nicht sicher rot: Tests, die eine Formularseite mit Eingaben per `page.goto`/`reload` verlassen (Browser-`beforeunload`), und Tests, die die Position der Startseiten-Zusammenfassung (bisher unten) oder Formularmeldungen relativ zu Buttons prüfen | `beforeunload`-Dialog bzw. neue Position | Tester prüft beim ersten roten Lauf. Bei `beforeunload`: `page.on('dialog', d => d.accept())` nur dort, wo das Verlassen gewollt ist. Bei Positionsprüfungen nur den Locator bzw. die Bezugsstelle anpassen |

Bewusst ohne Kollision gelöst:
- Pflichtkennzeichnung: sichtbar „(Pflicht)“, im Namen „(Pflichtfeld)“. Damit bleiben `formularfeld.test.tsx`, `AusgabeFormular*.test.tsx`, `HologrammnummerAendern.test.tsx` und `PruefungSeite.test.tsx` grün.
- `CoinExemplare` behält eigene Kennzahlen und Aktionen als Standard (`CoinExemplare.test.tsx` bleibt).
- `AusgabeDetails` behält Begriffe und Reihenfolge.
- Anonyme Detailseite ohne Reiterleiste (`CoinDetailSeite.test.tsx` „nur Ansicht“, „Links“).
- Kartenansicht nur per Media-Query (Vitest bleibt bei Tabellen).
- Nach dem Erfassen öffnet „Ausgaben“ ohne URL-Änderung (`toHaveURL(…/coins/{id}$)` bleibt).
- Bestätigungstexte bleiben wortgleich (F5).

Stellt sich bei einer weiteren Stelle heraus, dass sie nur durch eine Testanpassung grün wird, wird gestoppt und gemeldet. Die Freigabe gilt nur für K1–K8 und K10.

## 12. Entscheidungen des Auftraggebers (2026-11-14)
Der Auftraggeber hat die Vorschläge zu F1–F9 übernommen. F10 entscheidet er abweichend.
- **F1 Standardreiter:** Ohne `?reiter` ist „Exemplare“ offen (mit `coins.read`), „Stammdaten“ bleibt erster Reiter. Ohne `coins.read` gibt es keine Reiterleiste.
- **F2 Zertifikatsvorlage:** Die Verwaltung zieht von „Coin bearbeiten“ in den Reiter „Zertifikatsvorlage“ der Detailseite (Variante A). „Coin bearbeiten“ enthält nur noch Stammdaten und Motivbild, der Hinweis auf „Coin hinzufügen“ wird angepasst (K5).
- **F3 Verlauf:** Der Verlauf der Ausgabe zeigt nur „erfasst“ und „storniert“. Hologramm-Korrekturen folgen in einem eigenen Lauf mit Lese-Endpunkt; dazu ist ADR-0034 zu ändern.
- **F4 Status-Chips:** nur aus vorhandenen Daten: „Auflage unbekannt“, „Exemplare verfügbar“, „Alle Exemplare ausgegeben“. „Ausgabe erfassen“ erscheint im Kopf nur bei bekannter Auflage und `verfuegbar > 0`.
- **F5 Dialogtexte:** Die bisherigen Texte bleiben wortgleich, die Folge steht im ersten Satz.
- **F6 Abgrenzung:** „Listen der Übersicht“ sind der Katalog `/coins` und die Listen der Startseiten-Blöcke. Exemplare, Ausgabehistorie, Benutzer, Audit-Log und Vorlagenversionen gehören zu diesem Lauf.
- **F7 Sortierung:** Sortierbar sind nur vollständig geladene Listen (Vorlagenversionen). Seitenweise Listen zeigen ihre feste Sortierung per `aria-sort`. Serverseitige Sortierung kommt später mit API-Erweiterung.
- **F8 Statusfilter der Ausgabehistorie:** wird über den vorhandenen API-Parameter `status` aufgenommen, mit Chip.
- **F9 Testanpassungen:** freigegeben genau für K1–K8 und K10, nur Navigationsschritte, Locator und Bestätigungsschritt, je begründet im Commit und im QA-Bericht.
- **F10 Screenshots:** Abweichend vom Vorschlag werden die Screenshots **nicht eingecheckt**. Sie entstehen nur lokal in `web/test-results/screenshots-formulare/` (per `web/.gitignore` ausgeschlossen) und werden vom Agenten angesehen. Auch eine Auswahl wird nicht eingecheckt (AK-41).
- **Verlassen-Warnung bei offenem Motivbild:** Auf „Coin bearbeiten“ warnt die Seite auch nach erfolgreichem Speichern der Stammdaten, solange ein gewähltes Motivbild nicht hochgeladen ist (Ausnahme zu AK-14, Text in 4.3).

## 13. Abweichungen der Umsetzung vom Entwurf
- **`KennzahlKarte`:** Der Fortschrittsbalken steht nicht in der `dd`, sondern in einem `div role="definition"` innerhalb der `dl`. So bleibt die `dd` die reine Zahl (AK-21) und axe meldet keinen Verstoß „definition-list“ (ADR-0042, Nachtrag).
- **Prüfung beim Verlassen:** Ist beim Verlassen eines Felds die Maus auf einem Bedienelement gedrückt (Button, Link, Reiter, Switch, Auswahl), läuft die Prüfung erst nach dem Klick, spätestens nach 1 s. Sonst verschiebt die Fehlermeldung das Layout und der Klick geht verloren. Per Tastatur wird sofort geprüft. Umsetzung in `shared/lib/formular/zeiger.ts` mit globalen Listenern, die beim Import als Seiteneffekt registriert werden (ADR-0039, Nachtrag).
- **`useVerlassenWarnung`:** Neben `useBlocker` (Push/Replace) gibt es einen zweiten Blocker direkt über `router.history.block` für Zurück/Vor. Er nimmt den Schritt zurück und berechnet die Weite eines `GO`-Sprungs aus `__TSR_index`. Für die Memory-History, die Blocker bei Zurück/Vor nicht fragt, geht der Hook den Schritt per History-Abo selbst zurück (ADR-0040, Nachtrag).
- **`Progress`:** rendert die Wurzel über die `render`-Prop ohne den visuell versteckten Span „x“, den Base UI sonst anhängt (er stünde im Textinhalt und im Accessibility-Baum).
- **Motivbild auf „Coin bearbeiten“:** folgt dem Formularmuster. Feldfehler stehen am Feld, sonstige Fehler als Alarm oben im Formular mit Fokus.
- **Startseiten-Formular:** Reihenfolge der Aktionsleiste „Änderungen verwerfen“, dann „Speichern“ (Abbrechen-Rolle links, Hauptaktion rechts).
- **Zusätzliche Props** gegenüber 4.8: `Formularfeld.id`; `Bestaetigungsdialog.abbrechen`, `ladeText`, `ersatzFokusRef`; `DatenTabelle.ansicht` sowie je Spalte `titelVersteckt` und `kartenZelle`; `useFormular` liefert zusätzlich `versucht`, `zuruecksetzen` und `setzeWert`.

## 14. Offene Punkte
- Hologramm-Korrekturen erscheinen nicht in der Zeitleiste (F3, braucht Lese-Endpunkt und Änderung von ADR-0034).
- Sortierung nur clientseitig bei vollständig geladenen Listen (F7), serverseitig erst mit API-Erweiterung.
- Der Zustand „Kein Zugriff“ hat keinen Seitenkopf.
- **N1:** Nach dem Speichern der Stammdaten mit offenem Motivbild und „Bleiben“ zeigt der Seitenkopf von „Coin bearbeiten“ bis zum Neuladen den alten Namen.
- Benutzer- und Versionstabelle sind bei 768 px eng.
- Native Dateifelder zeigen Texte in der Browsersprache (z. B. Englisch).
- Listen der Übersicht (Katalog, Startseiten-Blöcke), Startseite und Prüfmaske `/pruefung` folgen im nächsten Lauf.
