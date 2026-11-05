# Feature: Hologrammnummer auf Zertifikaten und Echtheitsprüfung

Status: Umgesetzt (2026-11-05) auf Basis von Entwurf Rev. 2 (2026-11-03), alle offenen Fragen entschieden (Abschnitt 1.2), Abweichungen in Abschnitt 14 · Branch `feature/hologrammnummer` (von `develop`) · ADR: [0033](../adr/0033-hologrammnummer-datenmodell-und-normalisierung.md), [0034](../adr/0034-hologrammpruefung-rechte-ratenbegrenzung-audit.md)

## 1. Ziel
Jedes gedruckte Zertifikat trägt einen Hologramm-Sticker mit eindeutiger Nummer. Die Nummer wird zur Ausgabe erfasst (beim Erfassen oder nachträglich). Benutzer mit Rolle prüfen auf `/pruefung`, ob eine Nummer zu einem echten, gültigen Zertifikat gehört, und sehen den passenden Datensatz – Empfängerdaten nur mit `issues.read`.

**Nicht dazu:** öffentliche Prüfseite ohne Anmeldung, QR-Code, Kamera-Scan, digitale Signatur, Vorab-Erfassung von Nummernkreisen oder Sticker-Beständen, Sammelprüfung, Entfernen einer Nummer, Lese-Endpunkt für die neuen Audits.

### 1.1 Begriffe
- **Hologrammnummer**: Nummer des physischen Hologramm-Stickers auf einem gedruckten Zertifikat. Optional je Ausgabe, eindeutig nach Normalform (Abschnitt 4) über alle Coins und alle Ausgaben einschließlich stornierter; nachträglich ergänzbar und mit Grund korrigierbar. Eine Korrektur gibt die alte Nummer frei; die Nummer einer stornierten Ausgabe bleibt für immer gesperrt.
- **Zertifikatsnummer** (`C0042-0012`, ADR-0027): bleibt unverändert; bezeichnet das Exemplar und wiederholt sich bei einer Neuausgabe nach Storno. Die Hologrammnummer unterscheidet dagegen den einzelnen Ausdruck.
- **Anzeigeform / Normalform**: siehe Abschnitt 4.

### 1.2 Entscheidungen des Auftraggebers (2026-11-03) *(Rev. 2)*
Alle Empfehlungen aus Rev. 1 übernommen:
- **H1** Eine Korrektur gibt die alte Nummer frei. Der eindeutige Index gilt nur für nicht abgelöste Zeilen (`WHERE abgeloest_am IS NULL`).
- **H2** Zeichensatz nach der Normalisierung nur `A–Z` und `0–9`; Leerzeichen und Bindestriche sind Trenner.
- **H3** Angezeigt und ins Zertifikat gesetzt wird die bereinigte Form in Großbuchstaben („AB 12-34“); verglichen wird die Normalform.
- **H4** Keine Änderung der Nummer nach einem Storno (`409 ausgabe_storniert`).
- **H5** Kein Entfernen einer Nummer.
- **H6** Zwei Prüf-Endpunkte: `POST /api/pruefung` (`coins.read`), `POST /api/pruefung/mit-empfaenger` (`issues.read`).
- **H7** Bei stornierter Ausgabe Datensatz mit Storno-Datum, ohne Storno-Grund.
- **H8** Ratenbegrenzung 20 je 60 s, fest im Code, je Benutzer, je API-Instanz im Speicher; `429` ohne Audit.
- **H9** Mindestdauer 250 ms für alle vier Prüfergebnisse.
- **H10** Kein Lese-Endpunkt für `hologramm_audit` und `pruefung_audit`; Aufbewahrung unbegrenzt bis zum Löschkonzept.
- **H11** Standardvorlage: eigener Absatz „Hologramm Nr. {{Zertifikat.Hologrammnummer}}“ nach der Zertifikatsnummer; ohne Nummer bleibt die Beschriftung stehen.

## 2. Ist-Stand (geprüft)
- `ausgabe` ist per `trg_ausgabe_nur_storno` unveränderlich bis auf das einmalige Storno (Migration `20261017001806_Zertifikatsnummern`). Schreiben läuft in `AusgabeRepository.CoinSperre` per SQL unter `SELECT … FOR UPDATE` auf `coin_typ`; `23505` auf den partiellen Indizes wird zu `409`.
- `AusgabeService.ErfassenAsync` prüft Angaben (`AusgabeAngaben.Pruefen`, alle Fehler gemeinsam), dann Coin, Auflage, Exemplar; Audit `ausgabe_audit` in derselben Transaktion.
- `Platzhalterkatalog.Alle` hat 13 Einträge (4 Pflicht); `ZertifikatWerte.Aus` verlangt genau einen Wert je Eintrag; `StandardvorlageErzeuger` baut Körper, Fußzeile und Erläuterungstabelle aus dem Katalog.
- Berechtigungen: `coins.read` haben alle drei Rollen, `issues.read`/`issues.write` Administrator und Sachbearbeiter (`Rechtematrix`). Eine Ratenbegrenzung gibt es nicht; Pipeline: `AnfrageProtokoll` → … → `UseAuthentication` → `UseAuthorization` → `MapControllers`.
- Frontend: `ApiErgebnis` kennt kein `429`; Sidebar-Einträge mit optionaler `berechtigung`; `shared/ui` hat `input`, `label`, `button`, `alert`, `badge`, `card`, `dialog`, `textarea`, `select`, aber **keine Combobox**.

## 3. Akzeptanzkriterien

### Normalisierung und Datenmodell (Backend, ADR-0033)
- **AK-1** `Hologrammnummer.Pruefen(string?)` (Domain) liefert keine Nummer, eine Nummer `(Anzeige, Normalform)` oder einen Fehler nach Abschnitt 4. Alle Testvektoren aus Abschnitt 4.2 gelten in xUnit **und** Vitest (gleiche Tabelle).
- **AK-2** *(Rev. 2)* Tabelle `ausgabe_hologramm` nach Abschnitt 6 mit generierter Spalte `nummer_normalisiert`, Checks und den Indizes `ux_ausgabe_hologramm_aktuell (ausgabe_id) WHERE abgeloest_am IS NULL` und `ux_ausgabe_hologramm_nummer (nummer_normalisiert) WHERE abgeloest_am IS NULL`. Per SQL:
  - zweite **nicht abgelöste** Zeile mit `'AB 12-34'` neben `'AB1234'` (andere Ausgabe, anderer Coin) → `23505`;
  - zweite nicht abgelöste Zeile mit `'AB1234'`, wenn die bisherige Zeile mit `'AB1234'` **abgelöst** ist → gelingt;
  - zweite nicht abgelöste Zeile für dieselbe Ausgabe → `23505`;
  - `nummer = 'ab12'` oder `'AB/1'` oder `' AB'` oder `'A  B'` → Check-Verletzung; `nummer_normalisiert` direkt setzen → Fehler (generiert).
- **AK-3** Trigger `trg_ausgabe_hologramm_nur_abloesen`: `DELETE` scheitert; `UPDATE` von `nummer`, `ausgabe_id`, `gesetzt_*` scheitert; `UPDATE abgeloest_am` von `NULL` auf einen Wert gelingt genau einmal, danach scheitert jedes `UPDATE`. `ausgabe` und `trg_ausgabe_nur_storno` sind unverändert (Definition der Trigger-Funktion gleich dem Stand vor der Migration).
- **AK-4** Migration `Hologrammnummern`: legt `ausgabe_hologramm`, `hologramm_audit`, `pruefung_audit` samt Triggern und Indizes an; bestehende Ausgaben (aktiv und storniert) haben danach keine Hologrammnummer (`hologrammnummer: null`). `Down` entfernt alles wieder.

### Erfassen (Backend)
- **AK-5** `POST /api/coins/{id}/ausgaben` nimmt das optionale Feld `hologrammnummer` an. Gespeichert wird die Anzeigeform; die Antwort enthält `hologrammnummer` (Anzeigeform, z. B. Eingabe „ab 12-34“ → „AB 12-34“) bzw. `null` ohne Angabe oder bei Leerraum. Ausgabe, Zuordnung, `ausgabe_audit` (`Erfasst`) und `hologramm_audit` (`Gesetzt`) entstehen in einer Transaktion.
- **AK-6** Ungültige Nummer → `400` mit Schlüssel `hologrammnummer` (Texte Abschnitt 5.3), gemeinsam mit allen anderen Feldfehlern.
- **AK-7** Ist die Normalform bereits einer nicht abgelösten Zuordnung zugeordnet – gleich welcher Coin, auch einer **stornierten** Ausgabe – → `409 hologrammnummer_vergeben` (`title` „Ausgabe nicht möglich“, `detail` Abschnitt 5.3, ohne Empfänger, Coin oder Ausgabe). Keine Ausgabe, kein Audit, das Exemplar bleibt verfügbar. Beispiel: „AB1234“ vorhanden, Erfassen mit „ab 12-34“ → `409`.
- **AK-8** Reihenfolge: `400` → `404` Coin → `409 auflage_unbekannt` → `400 exemplarNummer` → `409 exemplar_ausgegeben`/`kein_exemplar_frei` → `409 hologrammnummer_vergeben`.
- **AK-9** **Parallelität:** Zwei gleichzeitige `POST` auf **zwei verschiedene Coins** mit „ab 12-34“ und „AB1234“ (Start per Barriere, 20 Wiederholungen mit je neuer Nummer) → je Durchlauf genau ein `201` und ein `409 hologrammnummer_vergeben`, nie `500`; in der DB genau eine nicht abgelöste Zeile mit der Normalform, genau eine neue Ausgabe. Dasselbe für zwei gleichzeitige `PUT …/hologrammnummer` (AK-10) auf Ausgaben verschiedener Coins und für `POST` gegen `PUT`.

### Ergänzen und Korrigieren (Backend)
- **AK-10** `PUT /api/coins/{id}/ausgaben/{ausgabeId}/hologrammnummer` (`issues.write`, Body Abschnitt 5.2) unter der Coin-Sperre:
  - ohne bisherige Nummer: **Ergänzen**, `grund` wird ignoriert; Audit `Gesetzt`.
  - mit bisheriger Nummer: **Korrektur**, `grund` Pflicht (≤ 500 nach Trimmen); bisherige Zeile erhält `abgeloest_am`, danach entsteht die neue Zeile (eine Transaktion); Audit `Geaendert` mit alt, neu, Grund.
  - `bisherige` (wird normalisiert; `null` oder leer = „keine“) muss der aktuellen Normalform entsprechen, sonst `409 hologrammnummer_geaendert`.
  - neue Normalform = aktuelle → `200` ohne Schreiben und ohne Audit (auch wenn sich nur die Schreibweise unterscheidet).
  - Antwort `200` mit der Ausgabe (Abschnitt 5.4).
  - Es gibt keinen Weg, eine Nummer zu entfernen (H5): leere `hologrammnummer` → `400`.
- **AK-11** Fehler und Reihenfolge des `PUT`: `401` → `403` → `415` → `400` (`hologrammnummer` fehlt/leer/ungültig, `grund` zu lang) → `404` „Ausgabe nicht gefunden“ (Coin oder Ausgabe unbekannt, Ausgabe eines anderen Coins, keine GUID) → `409 ausgabe_storniert` → `409 hologrammnummer_geaendert` → (unverändert → `200`) → `400 grund` fehlt bei Korrektur → `409 hologrammnummer_vergeben`. Texte nach Abschnitt 5.3.
- **AK-12** *(Rev. 2)* **Nummer stornierter Ausgabe bleibt gesperrt** (H4): Ausgabe X (Coin A) mit „AB1234“ erfassen, X stornieren. Danach:
  - `POST` an Coin A (Neuausgabe desselben Exemplars) mit „AB1234“ → `409 hologrammnummer_vergeben`;
  - `POST` an Coin B mit „ab 12 34“ → `409 hologrammnummer_vergeben`;
  - `PUT` auf eine andere aktive Ausgabe Y mit „AB-1234“ → `409 hologrammnummer_vergeben`;
  - `PUT` auf X (Ergänzen oder Korrigieren, auch mit Grund) → `409 ausgabe_storniert`, die Zeile von X bleibt nicht abgelöst;
  - in der DB ist die Zeile von X unverändert (`abgeloest_am IS NULL`).
  Dasselbe, wenn X vor dem Storno schon einmal korrigiert wurde (dann ist die **aktuelle** Nummer gesperrt, die abgelöste frei).
- **AK-13** *(Rev. 2)* **Korrigierte alte Nummer ist wieder vergebbar** (H1): Ausgabe X mit „AB1243“, Korrektur auf „AB1234“ mit Grund. Danach:
  - die Zeile „AB1243“ hat `abgeloest_am` gesetzt, „AB1234“ ist die aktuelle Zeile von X;
  - `POST` an einen anderen Coin mit „ab 12-43“ → `201`, die neue Ausgabe hat „AB 12-43“;
  - alternativ `PUT` auf Ausgabe Y mit „AB1243“ → `200`;
  - Prüfung von „AB1243“ **vor** der Neuvergabe → `nichtGefunden`; **nach** der Neuvergabe → Treffer auf die neue Ausgabe (nie auf X);
  - eine Korrektur zurück auf die eigene alte Nummer („AB1234“ → „AB1243“, solange frei) → `200`.
- **AK-14** `hologrammnummer` (Anzeigeform der aktuellen Zuordnung oder `null`) steht in **allen** Ausgabe-Antworten: `GET …/ausgaben`, `GET …/ausgaben/{ausgabeId}`, `POST …/ausgaben`, `POST …/storno`, `PUT …/hologrammnummer`. Sonst keine Änderung am Format.
- **AK-15** `hologramm_audit` nach Abschnitt 6: je Ergänzen ein `Gesetzt` (beim Erfassen mit Nummer ebenfalls), je Korrektur ein `Geaendert` (Normalform alt/neu, Grund, Akteur, Zeitpunkt, `ausgabe_id`, `coin_id`); abgelehnte und unveränderte Requests schreiben nichts. Unveränderlich per Trigger (SQL-Test). Keine Empfängerdaten (Suche nach den Testwerten des Empfängers in allen Spalten ergibt nichts).

### Prüfung (Backend, ADR-0034)
- **AK-16** `POST /api/pruefung` (`coins.read`) und `POST /api/pruefung/mit-empfaenger` (`issues.read`), Request und Antwort nach Abschnitt 5.2/5.4. Ergebnis nach ADR-0034 Punkt 2:
  - gültige Nummer ohne Coin → `gueltig` + Datensatz; mit passendem Coin → `gueltig` + Datensatz;
  - Coin gewählt, Nummer gehört zu anderem Coin → `falscherCoin`, `datensatz: null` (auch wenn die fremde Ausgabe storniert ist);
  - unbekannte Nummer (mit oder ohne Coin) und abgelöste Nummer → `nichtGefunden`, `datensatz: null`;
  - stornierte Ausgabe → `storniert` + Datensatz mit `status: "storniert"` und `storniertAm` (Datum `JJJJ-MM-TT`), auf beiden Endpunkten ohne Storno-Grund (H7);
  - Eingabe in beliebiger Schreibweise („ab 12-34“) findet „AB1234“; unbekannter `coinId` (GUID) wie ein anderer Coin.
- **AK-17** **Rechte je Rolle** (Integrationstest als Theory, beide Endpunkte): anonym `401`; ohne Rolle `403`; deaktiviert `403 benutzer_deaktiviert`; Betrachter `200` bzw. `403`; Sachbearbeiter und Administrator `200`/`200`. Die Antwort von `/api/pruefung` enthält für **jede** Rolle keine Schlüssel `ausgabeId`, `empfaenger`, `gelegenheit`, `begruendung`, `ausgebendeStelle`, `stornoGrund`/`grund` und keinen der Testwerte (Empfängername, Dienstgrad, Dienststelle, Gelegenheit, Begründung, ausgebende Stelle, Storno-Grund) im Body; die Antwort von `…/mit-empfaenger` enthält Empfänger, Gelegenheit, Begründung und ausgebende Stelle, aber keinen Storno-Grund.
- **AK-18** **Gleichförmigkeit** (H9): Für alle vier Ergebnisse auf beiden Endpunkten genau ein Lesezugriff und ein Audit-Insert (Unit-Test mit Fakes); Antwort frühestens 250 ms nach Beginn (Unit-Test mit `FakeTimeProvider` für jedes Ergebnis; Integrationstest: jede `200`-Prüfantwort ≥ 250 ms). `falscherCoin` und `nichtGefunden`: Status `200`, gleiche Header-Namen, gleiche JSON-Schlüssel, `datensatz: null`, kein Hinweis auf Coin, Ausgabe oder Existenz außer dem Ergebniswert.
- **AK-19** **Ratenbegrenzung** (H8): Je Benutzer höchstens 20 Prüfungen je 60 s über **beide** Endpunkte zusammen; die 21. Anfrage → `429` (`code` `zu_viele_pruefungen`, Texte Abschnitt 5.3), `Retry-After` 1–60, `Cache-Control: no-store`, kein Audit-Eintrag (Zahl der Zeilen in `pruefung_audit` bleibt 20). Ein zweiter Benutzer ist davon unberührt (`200`). `401`/`403` verbrauchen kein Kontingent und kommen vor `429` (ein Betrachter erhält auf `…/mit-empfaenger` auch nach 25 Anfragen `403` und danach auf `/api/pruefung` noch `200`). `400` verbraucht Kontingent. Andere Endpunkte sind nicht begrenzt. Grenzen als Konstanten im Code, keine Konfigurationsschlüssel.
- **AK-20** **Prüf-Audit** `pruefung_audit` (Abschnitt 6): je `200`-Prüfung genau ein Eintrag mit Akteur, Zeitpunkt, Normalform der geprüften Nummer, gewähltem Coin oder `NULL`, Ergebnis (`Gueltig`, `Storniert`, `FalscherCoin`, `NichtGefunden`), `ausgabe_id` (außer `NichtGefunden`) und `mit_empfaenger`. `400`, `401`, `403`, `429` schreiben nichts. Unveränderlich per Trigger. Keine Empfängerdaten. Scheitert der Insert (Testersatz), → `500` ohne Ergebnis. Kein Lese-Endpunkt (H10).
- **AK-21** Prüfung-`400` mit Schlüssel `hologrammnummer` (leer, Zeichen, Länge, nur Trennzeichen) bzw. `coinId` (keine GUID); keine Mindestdauer, kein Audit.

### Logs, Zertifikat, Doku (Backend)
- **AK-22** Keine Hologrammnummer (Eingabe- oder Normalform), kein Empfängerdatum, kein Grund in Anwendungslogs: Log-Tests (Muster `AusgabenLogTests`, `ZertifikatLogTests`) für Erfassen, Ergänzen, Korrigieren, `409 vergeben` (inkl. paralleler `23505`), Prüfung aller Ergebnisse und `429` durchsuchen alle Log-Einträge nach den Testwerten. Request-DTOs geben in `ToString` keine Werte aus.
- **AK-23** Platzhalter `Zertifikat.Hologrammnummer` (Pflicht `nein`, Bedeutung „Nummer des Hologramm-Stickers“, Beispiel „AB 12-34“) als 14. Eintrag im `Platzhalterkatalog` nach `Ausgabe.AusgebendeStelle`; `docs/platzhalter.md` ist bereits nachgezogen (`PlatzhalterDokuTests` grün). Wert: Anzeigeform der **aktuellen** Nummer (nach Korrektur die neue), leer ohne Nummer. Uploads mit dem Platzhalter werden angenommen; bestehende Vorlagen ohne ihn bleiben gültig und erzeugen unverändert (gleiche Story-Teile wie vorher bei gleichen Werten). Die Grenze von 200 Platzhaltern bleibt.
- **AK-24** *(Rev. 2)* Standardvorlage (H11): im Körper direkt nach dem Absatz „Zertifikat Nr. {{Zertifikat.Nummer}}“ ein eigener Absatz „Hologramm Nr. {{Zertifikat.Hologrammnummer}}“ (gleiche Ausrichtung und Formatierung wie der Absatz davor). Erzeugtes Zertifikat mit Nummer enthält „Hologramm Nr. AB 12-34“, ohne Nummer „Hologramm Nr. “ (Beschriftung bleibt, Wert leer). Fußzeile unverändert. Die Erläuterungstabelle hat 14 Zeilen.
- **AK-25** `docs/berechtigungen.md` (bereits nachgezogen, Abschnitt 5.5); `EndpunktTabelleTests`, `EndpunktInventarTests`, `BerechtigungsDokuTests` grün. Die drei neuen Endpunkte verlangen je genau eine Berechtigung; kein neuer öffentlicher Endpunkt.

### Frontend
- **AK-26** „Ausgabe erfassen“: neues Feld „Hologrammnummer (optional)“ nach „Ausgebende Stelle oder Person“, `maxLength` 40, `autoComplete="off"`, `spellCheck={false}`, Hinweis per `aria-describedby`: „Nummer des Hologramm-Stickers auf dem Zertifikat. Leerzeichen und Bindestriche sind erlaubt.“ Clientprüfung mit derselben Logik wie AK-1 (Vitest-Vektoren); Serverfehler `hologrammnummer` und `409 hologrammnummer_vergeben` erscheinen am Feld („Diese Hologrammnummer ist bereits vergeben.“), Fokus auf das Feld.
- **AK-27** Seite „Ausgabe“: `AusgabeDetails` zeigt „Hologrammnummer“ (Anzeigeform oder „Keine erfasst“). Mit `issues.write` und **nicht storniert**: Button „Hologrammnummer ergänzen“ bzw. „Hologrammnummer korrigieren“ öffnet einen Dialog (Titel wie Button) mit „Hologrammnummer“ (Pflicht, vorbelegt mit der aktuellen) und bei Korrektur „Grund der Korrektur“ (Pflicht, ≤ 500, Hinweise „Bitte keine Personendaten eintragen.“ und „Die bisherige Nummer wird dadurch wieder frei.“); Speichern sendet `bisherige`. Erfolg → Dialog schließt, Seite zeigt die neue Nummer, Fokus zurück auf den Button, Statusmeldung „Hologrammnummer gespeichert.“. `409 hologrammnummer_vergeben` → Fehler am Feld; `409 hologrammnummer_geaendert` → Alarm „Die Hologrammnummer wurde inzwischen geändert. Die Seite wurde neu geladen.“ und Neuladen; `409 ausgabe_storniert` → Alarm „Die Ausgabe wurde inzwischen storniert. Die Hologrammnummer kann nicht mehr geändert werden.“ und Neuladen. Ohne `issues.write` oder bei Storno kein Button und kein `PUT`. Es gibt keinen Button zum Entfernen (H5).
- **AK-28** Route `/pruefung` (`ROUTEN.pruefung`), `beforeLoad: erfordertBerechtigung('coins.read')`: anonym → Anmeldung mit Rückkehrziel; deaktiviert oder ohne Rolle → `/kein-zugriff`. Sidebar-Eintrag „Zertifikat prüfen“ (Icon `ShieldCheck`, `aria-hidden`) mit `berechtigung: 'coins.read'` nach „Katalog“ – sichtbar für alle drei Rollen, nicht für anonym/ohne Rolle/deaktiviert; Sichtbarkeit nur aus `berechtigungen` (`abhaengigkeiten.test.ts`).
- **AK-29** Seite „Zertifikat prüfen“: genau ein `h1` „Zertifikat prüfen“; Formular mit (1) „Coin (optional)“ als Combobox mit Suche (`GET /api/coins?suche=…&groesse=20`, 300 ms verzögert, Einträge „Name – Herausgeber“, „Keine Coins gefunden“, Auswahl per Button „Auswahl entfernen“ löschbar), (2) „Hologrammnummer“ (Pflicht, `maxLength` 40, `autoComplete="off"`, `spellCheck={false}`, `autoCapitalize="characters"`), (3) Button „Prüfen“. Enter im Nummernfeld löst die Prüfung aus; Enter in der geöffneten Combobox wählt den Eintrag. Leere/ungültige Eingabe → Feldfehler ohne Request. Während der Prüfung ist der Button gesperrt (`aria-disabled`), ein Doppel-Enter sendet nicht doppelt. Die Nummer steht nie in URL, Suchparametern, `localStorage` oder `sessionStorage`.
- **AK-30** Ergebnis in einer dauerhaft vorhandenen Live-Region (`role="status"`, `aria-live="polite"`), Überschrift `h2`, jeweils Farbe **und** Icon **und** Text:
  | Ergebnis | Überschrift | Icon | Farbe |
  |---|---|---|---|
  | `gueltig` | „Zertifikat gültig“ | `CircleCheck` | grün |
  | `storniert` | „Ausgabe storniert, Zertifikat ungültig“ | `Ban` | rot |
  | `falscherCoin` | „Die Nummer gehört nicht zu diesem Coin.“ | `TriangleAlert` | orange |
  | `nichtGefunden` | „Nummer nicht gefunden. Das Zertifikat kann nicht bestätigt werden.“ | `SearchX` | grau |
  Darunter „Geprüfte Nummer: …“ (bereinigte Eingabe). Icons `aria-hidden`. Kontrast Text ≥ 4,5:1, Icon/Rahmen ≥ 3:1 in Hell und Dunkel. Eine Änderung an Nummer oder Coin blendet ein altes Ergebnis aus. Der Fokus bleibt im Nummernfeld.
- **AK-31** Datensatz bei `gueltig`/`storniert` als `dl`: Coin (Link zur Detailseite), Exemplar („Nr. 12“), Zertifikatsnummer, Hologrammnummer, Ausgabedatum (`TT.MM.JJJJ`), Status („Aktiv“ bzw. „Storniert am TT.MM.JJJJ“, nie ein Grund). Nur mit `issues.read` ruft die Seite `…/mit-empfaenger` auf und zeigt zusätzlich Empfänger (Name, Dienstgrad, Dienststelle), Gelegenheit, Begründung, ausgebende Stelle und den Link „Zur Ausgabe“. Ohne `issues.read` geht kein Request an `…/mit-empfaenger` oder `…/ausgaben…`, und keine dieser Beschriftungen steht im DOM.
- **AK-32** Fehler als `role="alert"`: `429` → „Sie haben in kurzer Zeit zu viele Prüfungen durchgeführt. Bitte warten Sie {n} Sekunden.“ (`n` aus `Retry-After`; ohne Header „Bitte warten Sie einen Moment.“), Button bis dahin gesperrt; `403` → „Sie sind nicht berechtigt, Zertifikate zu prüfen.“; `401` → bestehender Text; sonst „Die Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.“ `ApiErgebnis` erhält `{ art: 'zuVieleAnfragen'; wiederholenNachSekunden: number | null }`.
- **AK-33** Barrierefreiheit (WCAG 2.1 AA / BITV) auf Prüfseite, Erfassen-Formular und Dialog: alle Bedienelemente per Tastatur in sinnvoller Reihenfolge, sichtbarer Fokus (`focus-visible`), zugängliche Namen = sichtbare Beschriftungen, Combobox mit `role="combobox"`, `aria-expanded`, Pfeiltasten, Escape schließt; Pflichtfelder mit „(Pflichtfeld)“ für Screenreader; Fehler per `aria-invalid` + `aria-describedby`; Ergebnisse nicht nur über Farbe; alle Texte deutsch inkl. `aria-label`, `sr-only`, Platzhaltertexte (Englisch-Prüfung der bestehenden Tests deckt die neuen Seiten ab).
- **AK-34** FSD nach Abschnitt 8; `npm run lint` (ESLint + Steiger) ohne Befund; keine Querimporte zwischen Slices; Seiten ohne Router-Hooks. Neue shadcn-Komponente nur `combobox` (`npx shadcn add combobox`, Diff nach ADR-0009 geprüft, deutsche Texte).

### Abschluss
- **AK-35** Systemtest `e2e/tests/hologrammnummer.spec.ts` (Abschnitt 9). `dotnet build` ohne Warnungen, `dotnet test`, `npm test`, `npm run test:ui`, `npm run lint`, `npm run build`, `npx playwright test` in `e2e/` grün; Doku nach Abschnitt 10.

## 4. Normalisierung (ADR-0033 Punkt 4)

### 4.1 Regeln
1. `null`, leer oder nur Leerraum → **keine Nummer** (Erfassen: `hologrammnummer: null`; `PUT` und Prüfung: `400` „Bitte eine Hologrammnummer eingeben.“). Mehr als 200 Zeichen roh → Längenfehler.
2. NFKC.
3. Leerraum (`char.IsWhiteSpace` / JS `\p{White_Space}`) → Leerzeichen; Kategorie `Pd` und U+2212 → `-`; Kategorie `Cf` entfällt.
4. Trimmen, Leerzeichenfolgen zu einem Leerzeichen, Großbuchstaben (invariant) → **Anzeigeform** (H3).
5. Anzeigeform nur `A–Z`, `0–9`, Leerzeichen, `-` (sonst Zeichenfehler, H2); höchstens 40 Zeichen (sonst Längenfehler).
6. **Normalform** = Anzeigeform ohne Leerzeichen und `-`; leer → Fehler „mindestens ein Buchstabe oder eine Ziffer“.
Prüfreihenfolge der Fehler: Länge roh (> 200) → Zeichen → Länge (> 40) → leer nach Normalisierung.

### 4.2 Testvektoren (xUnit und Vitest)
| Eingabe (C#-Notation) | Anzeigeform | Normalform / Fehler |
|---|---|---|
| `"ab 12-34"` | `AB 12-34` | `AB1234` |
| `"AB1234"` | `AB1234` | `AB1234` |
| `"  AB– 12  34 "` | `AB- 12 34` | `AB1234` |
| `"ＡＢ１２３４"` (Vollbreite) | `AB1234` | `AB1234` |
| `"AB​12­34"` | `AB1234` | `AB1234` |
| `"ab\t12\n34"` | `AB 12 34` | `AB1234` |
| `"AB−12"` (Minus) | `AB-12` | `AB12` |
| `"AB/1234"`, `"AB.1234"`, `"Ä1234"`, `"AB_1"` | – | Zeichenfehler |
| `"- -"`, `"--"` | – | leer nach Normalisierung |
| `""`, `"   "`, `null` | – | keine Nummer |
| 40 × `"A"` | 40 × `A` | 40 × `A` |
| 41 × `"A"` | – | Längenfehler |
| 20 × `"A-"` (40 Zeichen) | `A-A-…A-` | 20 × `A` |
| 201 × `" "` + `"A"` | – | Längenfehler (roh) |

Die Datenbank leitet die Normalform selbst ab (`upper(translate(nummer, ' -', ''))`); ein Integrationstest speichert alle gültigen Vektoren und vergleicht die generierte Spalte mit der Domain.

## 5. API

### 5.1 Endpunkte
| Methode | Pfad | Zugang | Antwort |
|---|---|---|---|
| `POST` | `/api/coins/{id}/ausgaben` (geändert) | `issues.write` | wie bisher, Feld `hologrammnummer`, neuer `409` |
| `PUT` | `/api/coins/{id}/ausgaben/{ausgabeId}/hologrammnummer` (neu) | `issues.write` | `200` Ausgabe, `400`, `404`, `409` |
| `POST` | `/api/pruefung` (neu) | `coins.read` | `200` Prüfergebnis, `400`, `429` |
| `POST` | `/api/pruefung/mit-empfaenger` (neu) | `issues.read` | `200` Prüfergebnis mit Empfänger, `400`, `429` |
| `GET` | `/api/coins/{id}/ausgaben`, `…/{ausgabeId}`, `POST …/storno` (geändert) | wie bisher | Einträge mit `hologrammnummer` |

Alle neuen Endpunkte `[KeinCache]`, schreibende und Prüfung mit `[Inhaltstyp("application/json")]`. Prüf-Endpunkte mit `[EnableRateLimiting("pruefung")]`.

### 5.2 Requests
```json
// POST /api/coins/{id}/ausgaben – zusätzlich:
{ "…": "…", "hologrammnummer": "ab 12-34" }
// PUT …/hologrammnummer
{ "hologrammnummer": "AB 12-34", "grund": "Tippfehler bei der Erfassung", "bisherige": "AB 12-43" }
// POST /api/pruefung und /api/pruefung/mit-empfaenger
{ "hologrammnummer": "ab 12-34", "coinId": "0192…" }   // coinId optional/null
```

### 5.3 Fehler und Texte
| Status | `title` | `code` / Schlüssel | `detail` / Meldung |
|---|---|---|---|
| `400` | – | `hologrammnummer` | „Bitte eine Hologrammnummer eingeben.“ · „Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.“ · „Die Hologrammnummer darf höchstens 40 Zeichen lang sein.“ · „Die Hologrammnummer muss mindestens einen Buchstaben oder eine Ziffer enthalten.“ |
| `400` | – | `grund` | „Bitte einen Grund für die Korrektur angeben.“ · „Der Grund darf höchstens 500 Zeichen lang sein.“ |
| `404` | „Ausgabe nicht gefunden“ | – | – |
| `409` | „Ausgabe nicht möglich“ (Erfassen) / „Hologrammnummer nicht möglich“ (`PUT`) | `hologrammnummer_vergeben` | „Diese Hologrammnummer ist bereits vergeben. Bitte die Nummer prüfen.“ |
| `409` | „Hologrammnummer nicht möglich“ | `hologrammnummer_geaendert` | „Die Hologrammnummer wurde inzwischen geändert. Bitte die Seite neu laden.“ |
| `409` | „Hologrammnummer nicht möglich“ | `ausgabe_storniert` | „Die Hologrammnummer einer stornierten Ausgabe kann nicht geändert werden.“ |
| `429` | „Zu viele Prüfungen“ | `zu_viele_pruefungen` | „Sie haben in kurzer Zeit zu viele Prüfungen durchgeführt. Bitte warten Sie einen Moment und versuchen Sie es erneut.“ + `Retry-After` |

### 5.4 Antworten
Ausgabe (alle Ausgabe-Antworten): bisheriges Format + `"hologrammnummer": "AB 12-34" | null`.

Prüfergebnis `POST /api/pruefung`:
```json
{ "ergebnis": "gueltig",            // gueltig | storniert | falscherCoin | nichtGefunden
  "datensatz": {                    // null bei falscherCoin und nichtGefunden
    "coin": { "id": "…", "name": "Einsatzkontingent Beispiel 2025" },
    "exemplarNummer": 12, "zertifikatsnummer": "C0042-0012", "hologrammnummer": "AB 12-34",
    "datum": "2026-10-01", "status": "aktiv", "storniertAm": null } }      // status aktiv | storniert; storniertAm Datum
```
`POST /api/pruefung/mit-empfaenger`: `datensatz` zusätzlich `"ausgabeId"`, `"empfaenger": { "name", "dienstgrad", "dienststelle" }`, `"gelegenheit"`, `"begruendung"`, `"ausgebendeStelle"`. Kein Storno-Grund, kein Erfasser.

### 5.5 `docs/berechtigungen.md`
Eingetragen am 2026-11-03 (Rechtematrix: nur Bedeutungstexte; Endpunkttabelle):
```
| `POST /api/pruefung` | `coins.read` |
| `POST /api/pruefung/mit-empfaenger` | `issues.read` |
| `PUT /api/coins/{id}/ausgaben/{ausgabeId}/hologrammnummer` | `issues.write` |
```

### 5.6 Backend-Schnitt
- **Domain** `Coin.Domain.Ausgaben`: `Hologrammnummer` (Record `Anzeige`, `Normalform`; `Pruefen`, `MaxLaenge = 40`), Erweiterung `ErfassenAsync` um `string? hologrammnummer` (Fehler gemeinsam mit `AusgabeAngaben.Pruefen`) und Ergebnis `HologrammnummerVergeben`; `AusgabeEintrag.Hologrammnummer`; `HologrammnummerAendernAsync(coinId, ausgabeId, nummer, grund, bisherige, akteurId)` mit Ergebnissen `Geaendert | Unveraendert | Ungueltig | NichtGefunden | Storniert | VeraltetGelesen | Vergeben`; `ICoinSperre` um `HologrammLadenAsync`, `HologrammSetzenAsync` (Ablösen + Insert + Audit, `false` bei `23505`). `Coin.Domain.Pruefung` (neu): `PruefService.PruefenAsync(eingabe, coinId, mitEmpfaenger, akteurId)` mit Mindestdauer über `TimeProvider`, `IPruefRepository` (`TrefferAsync(normalform, mitEmpfaenger)` – eine Abfrage; `AuditSchreibenAsync`), Modelle `PruefErgebnisArt`, `PruefTreffer` (ohne Personendaten), `PruefTrefferMitEmpfaenger`. `Coin.Domain.Vorlagen.Platzhalterkatalog` + Eintrag; `ZertifikatWerte` + Wert.
- **Infrastructure**: Konfigurationen und Datensätze für die drei Tabellen, Migration `Hologrammnummern`, `AusgabeRepository` (Insert mit Übersetzung von `23505` auf `ux_ausgabe_hologramm_nummer`, Lesesicht mit aktueller Nummer), `PruefRepository`, `ZertifikatRepository` lädt die aktuelle Nummer, `StandardvorlageErzeuger` (AK-24).
- **API**: `AusgabenController` (+ `PUT …/hologrammnummer`), `PruefungController` (zwei Aktionen, zwei Response-DTOs), `Ratenbegrenzung.cs` in `Coin.Api/Http` (Policy, Partition `sub`, `OnRejected`), `UseRateLimiter()` nach `UseAuthorization()`. Keine Logik in Controllern.

## 6. Datenmodell
```
ausgabe_hologramm  PK id uuid, ausgabe_id uuid NOT NULL FK ausgabe RESTRICT,
  (neu)            nummer varchar(40) NOT NULL CHECK (nummer ~ '^[A-Z0-9 -]{1,40}$' AND nummer = btrim(nummer)
                                                      AND position('  ' IN nummer) = 0),
                   nummer_normalisiert varchar(40) GENERATED ALWAYS AS (upper(translate(nummer, ' -', ''))) STORED
                                                   CHECK (nummer_normalisiert ~ '^[A-Z0-9]{1,40}$'),
                   gesetzt_am timestamptz NOT NULL, gesetzt_von uuid NOT NULL FK benutzer RESTRICT, abgeloest_am timestamptz NULL,
                   UNIQUE ux_ausgabe_hologramm_aktuell (ausgabe_id) WHERE abgeloest_am IS NULL,
                   UNIQUE ux_ausgabe_hologramm_nummer (nummer_normalisiert) WHERE abgeloest_am IS NULL,
                   INDEX ix_ausgabe_hologramm_ausgabe (ausgabe_id), TRIGGER trg_ausgabe_hologramm_nur_abloesen
hologramm_audit    PK id uuid, zeitpunkt timestamptz, akteur_id uuid FK benutzer, ausgabe_id uuid FK ausgabe, coin_id uuid,
  (neu)            art varchar(10) CHECK, nummer_alt varchar(40) NULL, nummer_neu varchar(40) NOT NULL, grund varchar(500) NULL,
                   CHECK ((art='Gesetzt' AND nummer_alt IS NULL AND grund IS NULL)
                       OR (art='Geaendert' AND nummer_alt IS NOT NULL AND grund IS NOT NULL)),
                   INDEX ausgabe_id, TRIGGER trg_hologramm_audit_unveraenderlich
pruefung_audit     PK id uuid, zeitpunkt timestamptz, akteur_id uuid FK benutzer, nummer varchar(40) NOT NULL (Normalform),
  (neu)            coin_id_gewaehlt uuid NULL (ohne FK), ergebnis varchar(15) CHECK (Gueltig|Storniert|FalscherCoin|NichtGefunden),
                   ausgabe_id uuid NULL FK ausgabe RESTRICT, mit_empfaenger boolean NOT NULL,
                   CHECK ((ergebnis = 'NichtGefunden') = (ausgabe_id IS NULL)),
                   INDEX akteur_id, INDEX zeitpunkt, TRIGGER trg_pruefung_audit_unveraenderlich
```
Die Zeile einer stornierten Ausgabe wird nie abgelöst (H4, H5) und sperrt ihre Nummer damit dauerhaft; abgelöste Zeilen sperren nichts (H1). `ausgabe`, `ausgabe_audit`, `zertifikat_audit` und alle bestehenden Trigger bleiben unverändert. `TRUNCATE`-Liste in `PostgresFixture.DatenbankLeerenAsync` um die drei Tabellen ergänzen (vor `ausgabe`).

## 7. Zertifikat und Standardvorlage
- Katalog: 14 Platzhalter, weiterhin 4 Pflicht. Wert `Zertifikat.Hologrammnummer` = Anzeigeform der aktuellen Nummer, sonst leer; eingesetzt wie alle Werte (ADR-0028 Punkt 5).
- Standardvorlage (H11, AK-24): im Körper direkt nach „Zertifikat Nr. {{Zertifikat.Nummer}}“ ein eigener Absatz „Hologramm Nr. {{Zertifikat.Hologrammnummer}}“; ohne Nummer bleibt die Beschriftung stehen. Fußzeile unverändert. Die Erläuterungstabelle wächst automatisch um die Zeile.
- Downloads ändern sich nicht in Rechten, Audit oder Dateiname.

## 8. Frontend (FSD, Public API je `index.ts`)
```
shared/config/routen.ts            + pruefung: '/pruefung'
shared/api/http.ts                 + ApiErgebnis 'zuVieleAnfragen' (429, Retry-After in Sekunden oder null)
shared/ui/combobox.tsx (neu)       npx shadcn add combobox (Base UI), nachbearbeitet nach ADR-0009
entities/ausgabe/                  model/types.ts: Ausgabe + hologrammnummer: string | null;
                                   model/hologrammnummer.ts (neu): pruefeHologrammnummer(eingabe) → { art: 'leer' } |
                                   { art: 'ok', anzeige, normalform } | { art: 'fehler', meldung }, HOLOGRAMMNUMMER_MAX = 40;
                                   ui/AusgabeDetails.tsx: Zeile „Hologrammnummer“ · index.ts exportiert beides
entities/coin/                     unverändert (ladeCoins für die Suche)
features/ausgabe-erfassen/         Feld „Hologrammnummer (optional)“, 409 hologrammnummer_vergeben am Feld
features/hologrammnummer-aendern/  api/aendereHologrammnummer.ts (PUT), ui/HologrammnummerAendern.tsx
  (neu)                            (Props { coinId, ausgabe, onGeaendert, onNeuLaden }; Button + Dialog) · index.ts
features/zertifikat-pruefen/       api/pruefeHologramm.ts (pruefe(eingabe, { mitEmpfaenger }) → /api/pruefung bzw.
  (neu)                            /mit-empfaenger), model/types.ts (PruefErgebnis), ui/CoinAuswahl.tsx (Combobox, ladeCoins),
                                   ui/PruefFormular.tsx, ui/PruefErgebnisAnzeige.tsx (Tabelle AK-30, dl AK-31) · index.ts
pages/pruefung/ (neu)              PruefungSeite { darfEmpfaenger: boolean } – h1, PruefFormular · index.ts
pages/ausgabe-detail/              + HologrammnummerAendern bei issues.write und nicht storniert
                                   (Prop umbenennen in darfSchreiben oder zweite Prop darfHologramm – entscheidet developer)
app/router/                        pruefungRoute (beforeLoad erfordertBerechtigung('coins.read')); routen-komponenten:
                                   PruefungRoute (darfEmpfaenger = issues.read aus /api/me)
widgets/app-shell/AppSidebar.tsx   + { titel: 'Zertifikat prüfen', pfad: ROUTEN.pruefung, icon: ShieldCheckIcon,
                                   berechtigung: 'coins.read' } nach „Katalog“
```
Importrichtung: `pages/*` → `features/*` → `entities/*` → `shared`. `features/zertifikat-pruefen` und `features/hologrammnummer-aendern` importieren einander nicht; die Normalisierung liegt deshalb in `entities/ausgabe`. Neue shadcn-Komponenten: `combobox`; genutzt außerdem `input`, `label`, `button`, `alert`, `dialog`, `textarea`, `badge`.

## 9. Testplan
| Ebene | Inhalt |
|---|---|
| xUnit Unit | `Hologrammnummer.Pruefen` mit allen Vektoren 4.2; `AusgabeService.ErfassenAsync` (Fehler gemeinsam, Reihenfolge AK-8, `HologrammnummerVergeben`), `HologrammnummerAendernAsync` (Ergänzen ohne Grund, Korrektur mit Grund, `bisherige`, unverändert ohne Schreiben, storniert → `Storniert` auch mit Grund, leere Nummer → `Ungueltig`, Reihenfolge AK-11) mit Fakes; `PruefService` (vier Ergebnisse, `falscherCoin` vor Storno, unbekannter Coin, Storno ohne Grund im Ergebnis, genau ein Lesezugriff + ein Audit, Mindestdauer 250 ms mit `FakeTimeProvider` in **jedem** der vier Fälle und auf beiden Varianten, `mitEmpfaenger` reicht durch); `Platzhalterkatalog` (14 Einträge, neuer Eintrag optional, Reihenfolge der bisherigen unverändert); `ZertifikatWerte` (14 Werte, ohne Nummer leer, nach Korrektur neue Nummer); Ratenbegrenzungs-Konstanten (20, 60 s, keine Konfigurationsbindung); `PlatzhalterDokuTests`, `BerechtigungsDokuTests`; DTO-`ToString` ohne Werte. |
| xUnit Integration (Testcontainers) | `Hologramm/HologrammnummerDatenbankTests`: AK-2 (inkl. „abgelöste Zeile sperrt nicht“, „zweite aktuelle Zeile je Ausgabe → `23505`“), AK-3, AK-4, Vektoren gegen die generierte Spalte. `Hologramm/HologrammnummerErfassenTests`: AK-5–AK-8, AK-14. `Hologramm/HologrammnummerParallelTests`: AK-9 (zwei Coins, `Barrier`/`Task.WhenAll`, 20 Durchläufe; `POST`/`POST`, `PUT`/`PUT`, `POST`/`PUT`). `Hologramm/HologrammnummerAendernTests`: AK-10, AK-11, AK-15 (Audit per SQL, Trigger). *(Rev. 2)* `Hologramm/HologrammnummerReservierungTests`: **„Nummer stornierter Ausgabe bleibt gesperrt“** – alle Fälle aus AK-12 (Neuausgabe desselben Exemplars, anderer Coin, `PUT` auf andere Ausgabe, `PUT` auf die stornierte → `409 ausgabe_storniert`, Zeile unverändert; Variante mit vorheriger Korrektur: aktuelle Nummer gesperrt, abgelöste frei); **„korrigierte alte Nummer ist wieder vergebbar“** – alle Fälle aus AK-13 (`POST` und `PUT` mit alter Nummer gelingen, Prüfung der alten Nummer vor/nach Neuvergabe, Rückkorrektur auf eigene alte Nummer). `Pruefung/PruefungTests`: AK-16, AK-18, AK-20, AK-21. `Pruefung/PruefungRechteTests`: AK-17 als Theory je Rolle und Endpunkt inkl. Schlüssel- und Wertesuche im Body. `Pruefung/RatenbegrenzungTests`: AK-19 (21 Anfragen eines Benutzers über beide Endpunkte gemischt, zweiter Benutzer, Betrachter-403 ohne Verbrauch, `400` mit Verbrauch, `Retry-After`, Zeilenzahl in `pruefung_audit` = 20). `Pruefung/PruefungLogTests` und Erweiterung `AusgabenLogTests`: AK-22. `Zertifikate`: Download mit/ohne Nummer und nach Korrektur, Vorlage mit Platzhalter hochladen, bestehende Vorlage ohne Platzhalter unverändert (AK-23); `StandardvorlageTests` angepasst (AK-24: Absatz nach der Zertifikatsnummer, Beschriftung ohne Nummer, 14 Tabellenzeilen). **Anzupassen:** `EndpunktTabelleTests`/`EndpunktInventarTests` (neue Pfade, erwartete Daten), `PostgresFixture`-`TRUNCATE`-Liste, Ausgabe-Tests mit feldweisem Vergleich (`hologrammnummer: null`), Tests mit SQL-Inserts in `ausgabe` (unverändert, keine neue Pflichtspalte). |
| Vitest | `pruefeHologrammnummer` mit allen Vektoren 4.2; `http.ts` 429 → `zuVieleAnfragen` mit/ohne `Retry-After`; `aendereHologrammnummer`, `pruefeHologramm` (richtiger Endpunkt je `mitEmpfaenger`, Body, Token); `AusgabeFormular` (Feld, Hinweis, Clientfehler, 409 am Feld); `AusgabeDetails` (mit/ohne Nummer); `HologrammnummerAendern` (Ergänzen ohne Grundfeld, Korrektur mit Pflichtgrund und Hinweis „wieder frei“, `bisherige`, 409-Fälle, Fokus zurück, kein Button bei Storno, kein Entfernen); `CoinAuswahl` (Suche verzögert, leer, Auswahl entfernen, Tastatur); `PruefFormular` (Enter, kein Doppel-Request, Feldfehler ohne Request, altes Ergebnis ausgeblendet, Nummer nicht in URL/Storage); `PruefErgebnisAnzeige` (vier Varianten mit Text, Icon und Klasse; Storno-Datum ohne Grund; Empfängerfelder nur mit `mitEmpfaenger`); `PruefungSeite`; `AppSidebar` (Eintrag für alle drei Rollen, nicht für anonym/ohne Rolle/deaktiviert); `App.*.test.tsx` Guard `/pruefung`; Englisch-Prüfung. |
| UI-Test `web/ui-tests/hologrammnummer.spec.ts` (gemockte API) | Sachbearbeiter: Ausgabe erfassen mit Nummer (Request-Body enthält `hologrammnummer`), Mock-409 → Fehler am Feld; Ausgabe-Seite → „Hologrammnummer korrigieren“ per Tastatur, Grund Pflicht, Speichern (Body mit `bisherige`); stornierte Ausgabe ohne Button. Prüfseite nur per Tastatur: Coin per Combobox wählen, Nummer, Enter → je Mock-Antwort die vier Ergebnisse mit Text/Icon; Mock-429 mit `Retry-After: 30` → Alarm, Button gesperrt. Betrachter: Request nur an `/api/pruefung`, keine Empfänger-Beschriftungen; Sachbearbeiter: Request an `…/mit-empfaenger`. Sichtbarer Fokus an Combobox, Feld, Button, Dialog. URL enthält nie die Nummer. |
| Systemtest `e2e/tests/hologrammnummer.spec.ts` (echte API, Keycloak, `workers: 1`) | 1. Admin vergibt Sachbearbeiter- und Betrachter-Rolle (wiederholbar). 2. Sachbearbeiter legt Coin A und B an (eindeutige Namen, Auflage 5) und erfasst an A eine Ausgabe mit Empfänger „{eindeutig}“ und Hologrammnummer „ab {eindeutig}-34“. 3. Erfassen an B mit derselben Nummer in anderer Schreibweise → Meldung „bereits vergeben“. 4. Betrachter öffnet „Zertifikat prüfen“ über die Sidebar, prüft die Nummer ohne Coin → „Zertifikat gültig“, Coin A, Zertifikatsnummer `C…-0001`, Status „Aktiv“, **kein** Empfängername im Seiteninhalt; mit Coin B → „Die Nummer gehört nicht zu diesem Coin.“; unbekannte Nummer → „Nummer nicht gefunden …“. 5. Sachbearbeiter prüft → Empfänger sichtbar; storniert die Ausgabe → Prüfung zeigt „Ausgabe storniert, Zertifikat ungültig“ mit Storno-Datum; Erfassen an B mit der Nummer → weiterhin „bereits vergeben“. |

**Abnahme „Fertig, wenn“:** gleiche Nummer in zwei Schreibweisen, parallel → AK-1, AK-7, AK-9; gültige Nummer mit/ohne passenden Coin → AK-16; falscher Coin, unbekannt, storniert → AK-16; Empfängerdaten je Rolle → AK-17; Nummer nach Storno nicht neu vergebbar → AK-12; `429` → AK-19; Audit ohne Empfängerdaten → AK-15, AK-20; Playwright Sachbearbeiter erfasst, Betrachter prüft → Systemtest Schritte 2 und 4. Zusätzlich aus H1: korrigierte alte Nummer wieder vergebbar → AK-13.

## 10. Doku-Bedarf
- `docs/api.md`: neue Endpunkte, Felder `hologrammnummer`, Fehlercodes `hologrammnummer_vergeben`, `hologrammnummer_geaendert`, `zu_viele_pruefungen`, `429`/`Retry-After`, Validierungsschlüssel `hologrammnummer`, `grund`, `coinId`.
- `docs/berechtigungen.md` (erledigt, 5.5) und `docs/platzhalter.md` (erledigt, AK-23).
- `docs/requirements.md`: Funktion 3 (Hologrammnummer, Korrektur nur für dieses Feld abweichend von „Bearbeiten nicht enthalten“), Abschnitt „Zertifikate“ (14 Platzhalter, neue Zeile „Hologrammnummer und Prüfung“), Rolle Betrachter (prüft Nummern, sieht Ausgabedatum/Status/Zertifikatsnummer, keine Empfänger), Entscheidungen H1–H11 vom 2026-11-03 (Abschnitt 1.2).
- Benutzerdoku: `docs/benutzer/ausgaben.md` (Feld, Ergänzen/Korrigieren, alte Nummer wird frei, Storno sperrt dauerhaft) und neue `docs/benutzer/zertifikat-pruefen.md`.
- ADR-0020, ADR-0027: Hinweis „ergänzt durch ADR-0033“; ADR-0021: „ergänzt durch ADR-0034“.
- `CLAUDE.md`: Vorschläge in Abschnitt 13 (übernimmt der Koordinator).

## 11. Annahmen
- A1: „Für alle Benutzer mit Rolle“ = `coins.read` (alle drei Rollen); keine Rollennamen im Code.
- A2: Betrachter dürfen für eine bekannte Hologrammnummer Coin, Exemplar, Zertifikatsnummer, Ausgabedatum und Status sehen (Vorgabe Punkt 5); das erweitert ADR-0021 nur um diese Felder, nicht um Empfängerdaten.
- A3: Hologrammnummern sind keine Personendaten, werden aber wie solche aus Logs herausgehalten.
- A4: Ein unbekannter `coinId` in der Prüfung gilt wie ein anderer Coin (kein `404`), damit der Abfragepfad gleich bleibt.
- A5: Die Ausgabehistorie (Tabelle auf der Detailseite) bekommt keine eigene Spalte; die Nummer steht auf der Seite „Ausgabe“. Nachrüstbar.
- A6: Die Mindestdauer von 250 ms gilt je Request; parallele Prüfungen eines Benutzers sind durch die Ratenbegrenzung begrenzt.
- A7: Abgelöste Nummern zählen bei der Prüfung nicht; ihre Historie steht in `ausgabe_hologramm` und `hologramm_audit`.
- A8 *(Rev. 2)*: `400` auf den Prüf-Endpunkten verbraucht Kontingent (die Begrenzung greift vor der Validierung); `401`/`403` nicht.

## 12. Offene Fragen
Keine. H1–H11 hat der Auftraggeber am 2026-11-03 entschieden (Abschnitt 1.2). Gegenüber Rev. 1 entfallen die Alternativen „alte Nummer bleibt gesperrt“ (Index ohne `WHERE`) und „Freigabe durch Administratoren“.

## 13. Nachträge für CLAUDE.md (Vorschlag, übernimmt der Koordinator)
- **Fachbegriffe:** „**Hologrammnummer**: Nummer des Hologramm-Stickers auf einem gedruckten Zertifikat; optional je Ausgabe, nachträglich ergänzbar, Korrektur nur mit Grund (die alte Nummer wird frei), kein Entfernen; eindeutig unter allen aktuellen Zuordnungen über alle Coins nach Normalform (NFKC, Leerzeichen/Bindestriche entfernt, Großbuchstaben, nur A–Z/0–9, höchstens 40 Zeichen); angezeigt in bereinigter Form in Großbuchstaben; bleibt nach Storno dauerhaft gesperrt und ist dann nicht mehr änderbar. Nicht zu verwechseln mit der Zertifikatsnummer (bezeichnet das Exemplar, wiederholt sich nach Storno).“
- **Aktueller Stand:** „Hologrammnummer und Prüfung (`docs/features/hologrammnummer.md`, ADR-0033/0034): Nummer in `ausgabe_hologramm` (Ablösung statt Update, eindeutiger Index nur über nicht abgelöste Zeilen, `ausgabe` bleibt unveränderlich), Ergänzen/Korrigieren mit `issues.write`, Prüfseite `/pruefung` mit `coins.read` (`POST /api/pruefung`), Empfängerdaten nur über `POST /api/pruefung/mit-empfaenger` (`issues.read`); Ratenbegrenzung 20/min je Benutzer und Instanz; Mindestdauer 250 ms je Prüfung; Audits `hologramm_audit` und `pruefung_audit` unveränderlich per Trigger, ohne Lese-Endpunkt; Platzhalter `Zertifikat.Hologrammnummer` (14 Platzhalter), Standardvorlage mit Absatz „Hologramm Nr. …“.“
- **Sicherheit und Datenschutz:**
  - „Hologrammnummern nie in Logs oder URLs; Prüfungen nur per POST-Body. Die Normalform berechnet die Datenbank (generierte Spalte); die Domain-Normalisierung muss dazu passen (Test).“
  - „Die Ratenbegrenzung der Prüfung (Policy `pruefung`) ist fest im Code, partitioniert nach `sub`, nie nach IP; `UseRateLimiter` steht nach `UseAuthorization`. Nicht per Konfiguration lockern.“
  - „Prüfantworten haben für alle Ergebnisse denselben Abfragepfad und eine Mindestdauer von 250 ms; ‚falscher Coin‘ und ‚nicht gefunden‘ unterscheiden sich nur im Ergebniswert. Storno-Gründe erscheinen nie in Prüfantworten.“
  - „Prüf-Endpunkte ohne `issues.read` liefern DTOs ohne Felder für Empfängerdaten (ADR-0021/0034), kein Feldfilter je Rolle.“

## 14. Umsetzung (2026-11-05)
Umgesetzt wie entworfen (Migration `20261105114521_Hologrammnummern`, `Coin.Domain.Pruefung`, `PruefungController`, `Coin.Api/Http/Ratenbegrenzung.cs`). Abweichungen und Präzisierungen:
- **Zusätzliche shadcn-Komponente** `shared/ui/input-group.tsx`: Abhängigkeit von `combobox` (deren Eingabefeld baut darauf auf), `cn` aus `@/shared/lib/cn`. AK-34 nannte nur `combobox`. In `combobox.tsx` haben die Buttons ohne Text deutsche `sr-only`-Namen („Vorschläge anzeigen“, „Auswahl entfernen“, „Entfernen“).
- **Theme-Token `--warning`** (Tailwind `text-warning`/`border-warning`, Hell und Dunkel in `app/styles/index.css`) für das Ergebnis `falscherCoin`; `gueltig` nutzt das vorhandene `--success`, `storniert` `--destructive`, `nichtGefunden` `--muted-foreground`.
- **Funktionsname** `pruefeHologramm` (`features/zertifikat-pruefen/api/pruefeHologramm.ts`) statt `pruefe` aus Abschnitt 8; Signatur `pruefeHologramm({ hologrammnummer, coinId }, { mitEmpfaenger })`.
- **Prop `darfHologramm`** (optional, Standard `false`) an `AusgabeDetailSeite` zusätzlich zu `darfZertifikat` (Abschnitt 8 ließ die Wahl offen); `AusgabeDetailRoute` setzt beide aus `issues.write`.
- **Sperre nach `429` ohne lesbares `Retry-After`**: Das Formular sperrt den Button dann 60 s (Länge des Fensters) und zeigt „… Bitte warten Sie einen Moment.“. Das betrifft auch ein Frontend auf anderer Origin, weil die CORS-Konfiguration nur `Content-Disposition` freigibt, nicht `Retry-After`.
- **`storniertAm`** ist das Datum des Stornos nach Europe/Berlin (`JJJJ-MM-TT`), nicht der UTC-Tag.
- **Prüfreihenfolge der Prüf-Endpunkte**: `UseRateLimiter` steht vor den MVC-Filtern; ein `415` verbraucht deshalb wie `400` Kontingent, und `429` kommt vor `415` (`401` → `403` → `429` → `415` → `400`).

**Offener Hinweis:** Nach `409 ausgabe_storniert` im Dialog „Hologrammnummer ändern“ schließt der Dialog und die Seite lädt neu; dabei verschwindet der Button (Ausgabe storniert), und der Fokus fällt auf `body`. Der Alarm wird per `role="alert"` angesagt, ein sinnvolles Fokusziel fehlt aber noch (Barrierefreiheit, AK-33).
