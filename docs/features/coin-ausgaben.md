# Feature: Coin-Ausgaben (Exemplare, Ausgabe erfassen, Storno, Historie)

Status: umgesetzt (vom qa-reviewer freigegeben; Abweichungen und Ergänzungen in Abschnitt 12) · Entwurf Rev. 2 mit den Entscheidungen des Auftraggebers vom 2026-10-08 (Abschnitt 1) · Branch: `feature/coin-ausgaben` (basiert auf `feature/katalog-seiten`) · ADRs: [0020](../adr/0020-exemplare-und-ausgaben-datenmodell.md) (neu, Datenmodell), [0021](../adr/0021-rechte-fuer-exemplare-und-ausgaben.md) (neu, Rechte), [0014](../adr/0014-coin-katalog-oeffentlich-lesbar.md), [0016](../adr/0016-berechtigungen-im-code-und-deaktivierte-benutzer.md), [0017](../adr/0017-audit-log-fuer-rollen-und-status.md), [0019](../adr/0019-request-protokoll-ohne-personendaten.md)

## 1. Ziel
Verwalter dokumentieren, welches Exemplar eines Coins an wen, wann, bei welcher Gelegenheit und wofür ausgegeben wurde. Beispiel: Auflage 150, davon 37 ausgegeben, 113 verfügbar. Der Auftrag des Menschen steht wörtlich im Auftrag zu diesem Branch.

Nicht dazu: Zertifikate, PDF, Personenstammdaten mit Wiederverwendung, Rückgabe, Import bestehender Listen, Status „ungültig“, Bearbeiten von Ausgaben (Korrektur = Storno + neue Ausgabe), Coins bearbeiten außer der Auflage.

**Begriffe** (Entscheidung F1): In UI, API und Code heißt es **Ausgabe** (`Ausgabe`, `/ausgaben`, `issues.*`). „Ausgabe“ ersetzt den bisherigen Begriff „Verleihung“ (katalog-seiten F5). Der Platzhalter „Verleihungen“ und die vorgemerkte Berechtigung `verleihungen.read` entfallen. Ein **Exemplar** ist ein nummeriertes Stück eines Coins (Nr. 1 bis Auflage).

### Entscheidungen des Auftraggebers (2026-10-08)
1. **F1 Begriff:** überall „Ausgabe“ (UI, API `/ausgaben`, Code), Berechtigungen `issues.read`/`issues.write`. Platzhalter „Verleihungen“ und `verleihungen.read` entfallen. Den Fachbegriff in `CLAUDE.md` passt der Koordinator an.
2. **F2 Sichtbarkeit:** Kennzahlen und Exemplar-Status nur mit `coins.read` (Betrachter, Sachbearbeiter, Administrator). Anonyme, Benutzer ohne Rolle und Deaktivierte sehen nur die Stammdaten (ADR-0021).
3. **F3 Auflage ändern:** nur per `PUT /api/coins/{id}/auflage` (`coins.write`) und Dialog „Auflage ändern“ auf der Detailseite. Kein weiteres Bearbeiten von Coins.
4. **F4 Untergrenze beim Senken:** höchste **je** ausgegebene Nummer (aktiv oder storniert). Kein Zurück auf „unbekannt“.
5. **F5 Ausgebende Stelle:** Pflicht-Freitext „Ausgebende Stelle oder Person“. Der Erfasser wird automatisch gespeichert (`erfasstVon`).
6. **F6 Audit-Inhalt:** keine Empfängerdaten im Audit, nur Ids, Exemplar-Nummer, Art, Akteur, Zeit und beim Storno der Grund. Die Oberfläche weist am Grund-Feld darauf hin, keine Personendaten einzutragen (AK-24).
7. **F7 Audit lesen:** kein Lese-Endpunkt für `ausgabe_audit`. Erfasser und Stornierer sind in der Historie sichtbar.
8. **F8 Datum:** Pflicht, reines Datum, nicht in der Zukunft (heute nach Europe/Berlin), keine Untergrenze.
9. **F9 Obergrenze Auflage:** bleibt 1.000.000.
10. **F10 Aufbewahrung:** Ausgaben samt Empfängerdaten und Audit vorerst unbegrenzt; Löschkonzept als eigenes späteres Feature.

## 2. Ist-Stand (geprüft)
| Punkt | Stand | Folge |
|---|---|---|
| `CoinTyp` | `Auflage` `int?` (1–1.000.000, `NULL` = unbekannt), keine Änderungsmethode, kein Bearbeiten-Endpunkt | Auflage ändern kommt hinzu (AK-17, F3) |
| Exemplare, Ausgaben | nicht vorhanden | neue Tabellen (ADR-0020) |
| Berechtigungen | `coins.read` (nicht durchgesetzt), `coins.write`, `users.manage`, `audit.read`; Frontend-Typ `Berechtigung` in `entities/benutzer/model/types.ts` | `issues.read`, `issues.write` neu; `coins.read` erstmals durchgesetzt (ADR-0021) |
| Audit | `benutzer_audit` mit Check-Constraint nur für Rolle/Status, Trigger unveränderlich; `GET /api/audit` | eigene Tabelle `ausgabe_audit` (ADR-0020) |
| Sperren | Benutzerverwaltung serialisiert per Advisory Lock (ADR-0018) | Ausgaben serialisieren je Coin per `FOR UPDATE` (ADR-0020) |
| Detailseite `/coins/$coinId` | Stammdaten, Bild, statischer Platzhalter „Verleihungen“ (katalog-seiten AK-19) | Platzhalter wird ersetzt (AK-20) |
| Guard | `erfordertBerechtigung(b)` → `/kein-zugriff?grund=berechtigung` | wird für `/coins/$coinId/ausgaben/neu` genutzt |
| `shared/ui` | u. a. `alert-dialog`, `badge`, `select`, `table`, `textarea`, `input`, `label`, `blaettern`, `card` | neu: `radio-group`, `dialog` |
| Testbenutzer | `admin`, `sachbearbeiter`, `betrachter`, `neu` (`@test.local`); nur admin hat per Bootstrap eine Rolle | Systemtest vergibt Rollen über die Benutzerverwaltung |

## 3. Akzeptanzkriterien

### Exemplare und Auflage (Backend)
- **AK-1** `POST /api/coins` mit `auflage: N` erzeugt in derselben Transaktion genau N Exemplare mit den Nummern 1 bis N. Mit `auflage: null` entstehen keine Exemplare. Antwort und Verhalten des Endpunkts bleiben sonst unverändert. Ein Coin mit Auflage 150 hat danach 150 Exemplare, alle „verfügbar“.
- **AK-2** Die Migration `Exemplare` erzeugt für jeden bestehenden Coin mit Auflage die Exemplare 1 bis Auflage, für Coins ohne Auflage keine. Integrationstest: Datenbank auf dem Stand vor der Migration mit zwei Coins (Auflage 3 und `NULL`), danach 3 bzw. 0 Exemplare.
- **AK-3** `GET /api/coins/{id}/exemplare` (Berechtigung `coins.read`) liefert Kennzahlen `{ auflage, ausgegeben, verfuegbar }` und die Exemplare seitenweise `{ nummer, status }`, sortiert nach `nummer`. `status` ist `"verfuegbar"` oder `"ausgegeben"`. Filter `status=verfuegbar|ausgegeben` (fehlend = alle), Paging wie `/api/coins`. Die Kennzahlen gelten immer für alle Exemplare, `gesamt` für den Filter. Bei Auflage `null`: `auflage: null`, `ausgegeben: 0`, `verfuegbar: 0`, keine Einträge. Nach drei aktiven Ausgaben bei Auflage 150: `ausgegeben: 3`, `verfuegbar: 147`.
- **AK-4** Die Antwort aus AK-3 enthält keine Felder außer den genannten, für jede Rolle gleich. Kein Empfänger, keine Gelegenheit, keine Begründung, keine Ausgabe-Id, kein Datum.
- **AK-5** `GET /api/coins` und `GET /api/coins/{id}` bleiben unverändert (sieben Felder, keine Kennzahlen, öffentlich). Bestehende Tests dazu bleiben ohne Anpassung grün.

### Ausgabe erfassen (Backend)
- **AK-6** `POST /api/coins/{id}/ausgaben` (Berechtigung `issues.write`) legt eine Ausgabe an. Pflicht: `empfaengerName`, `datum`, `gelegenheit`, `begruendung`, `ausgebendeStelle`. Optional: `exemplarNummer` (fehlend oder `null` = nächste freie), `empfaengerDienstgrad`, `empfaengerDienststelle`. Texte werden getrimmt, leere optionale Texte werden `null`. Antwort `201` mit der Ausgabe im Format aus Abschnitt 5.2. `erfasstVon` ist der angemeldete Benutzer, `erfasstAm` die Serverzeit (F5). Mitgesendete Felder `erfasstVon`, `erfasstAm`, `storno`, `id` werden ignoriert.
- **AK-7** Validierung (`400`, ValidationProblemDetails „Eingaben ungültig“, alle Fehler gemeinsam), Meldungen wörtlich:
  - `empfaengerName`: „Name des Empfängers ist erforderlich.“ / „Name des Empfängers darf höchstens 200 Zeichen lang sein.“
  - `empfaengerDienstgrad`: „Dienstgrad darf höchstens 100 Zeichen lang sein.“
  - `empfaengerDienststelle`: „Dienststelle darf höchstens 200 Zeichen lang sein.“
  - `datum` (Format `JJJJ-MM-TT`): „Datum ist erforderlich.“ / „Das Datum darf nicht in der Zukunft liegen.“ (heute nach Europe/Berlin, F8)
  - `gelegenheit`: „Gelegenheit ist erforderlich.“ / „Gelegenheit darf höchstens 200 Zeichen lang sein.“
  - `begruendung`: „Begründung ist erforderlich.“ / „Begründung darf höchstens 2000 Zeichen lang sein.“
  - `ausgebendeStelle`: „Ausgebende Stelle ist erforderlich.“ / „Ausgebende Stelle darf höchstens 200 Zeichen lang sein.“
  - `exemplarNummer` außerhalb 1 bis Auflage: „Exemplar-Nummer muss zwischen 1 und {Auflage} liegen.“ (geprüft unter der Sperre aus AK-10)
  - Nicht lesbarer Wert: „Ungültiger Wert für dieses Feld.“; kein JSON: `errors.anfrage`.
- **AK-8** Fachliche Fehler (ProblemDetails, `title` „Ausgabe nicht möglich“, Erweiterung `code`):
  - Coin unbekannt: `404` „Coin nicht gefunden“.
  - Coin ohne Auflage: `409` `auflage_unbekannt`, „Für diesen Coin ist keine Auflage erfasst. Ausgaben sind erst nach dem Festlegen der Auflage möglich.“
  - Gewähltes Exemplar ist aktiv ausgegeben: `409` `exemplar_ausgegeben`, „Exemplar Nr. {n} ist bereits ausgegeben.“
  - „Nächste freie“, aber alle ausgegeben: `409` `kein_exemplar_frei`, „Alle Exemplare dieses Coins sind ausgegeben.“
  - Reihenfolge: `401` → `403` → `415` → `400` (Body) → `404` → `409`/`400 exemplarNummer`. Bei jedem Fehler wird nichts gespeichert.
- **AK-9** Ein Exemplar ist höchstens einmal aktiv ausgegeben, durchgesetzt durch den partiellen eindeutigen Index `ux_ausgabe_exemplar_aktiv` (ADR-0020 Punkt 5):
  - Integrationstest DB: Ein zweites direktes `INSERT` einer aktiven Ausgabe für dasselbe Exemplar per SQL scheitert mit `23505`.
  - Integrationstest API: 10 parallele `POST` auf dieselbe `exemplarNummer` ergeben genau einen `201` und neunmal `409 exemplar_ausgegeben`; es gibt genau eine aktive Ausgabe und genau einen Audit-Eintrag `Erfasst`. Der Test läuft in mehreren Durchläufen.
  - Integrationstest API: K parallele `POST` „nächste freie“ bei mindestens K freien Exemplaren ergeben K verschiedene Nummern, jeweils die kleinsten freien.
  - Verletzt ein Insert den Index trotz Sperre, antwortet die API `409 exemplar_ausgegeben`, nie `500`.
- **AK-10** Erfassen, Stornieren und Auflage ändern sperren die Coin-Zeile (`FOR UPDATE`) und laufen je Coin nacheinander (ADR-0020 Punkt 6). „Nächste freie“ ist die kleinste Nummer ohne aktive Ausgabe; eine stornierte Nummer wird wieder vergeben.

### Storno (Backend)
- **AK-11** `POST /api/coins/{id}/ausgaben/{ausgabeId}/storno` (Berechtigung `issues.write`) mit `{ "grund": "…" }` storniert eine aktive Ausgabe: setzt `storniert_am`, `storniert_von` (angemeldeter Benutzer) und `storno_grund`. Antwort `200` mit der Ausgabe (gefülltes `storno`). Das Exemplar ist danach „verfügbar“ und kann erneut ausgegeben werden; die stornierte Ausgabe bleibt unverändert in der Historie.
- **AK-12** Fehler: `grund` fehlt/leer: `400` „Bitte einen Grund für das Storno angeben.“, länger als 500: „Der Grund darf höchstens 500 Zeichen lang sein.“; Coin oder Ausgabe unbekannt, oder die Ausgabe gehört zu einem anderen Coin: `404` „Ausgabe nicht gefunden“; schon storniert: `409` `bereits_storniert`, „Diese Ausgabe ist bereits storniert.“ Zwei parallele Stornos derselben Ausgabe: genau ein `200`, ein `409`, genau ein Audit-Eintrag `Storniert`.
- **AK-13** Ausgaben sind in der Datenbank nicht löschbar und nur einmal stornierbar (Trigger `trg_ausgabe_nur_storno`, ADR-0020 Punkt 9). Integrationstest per SQL: `DELETE`, das Ändern von `empfaenger_name` und ein zweites Storno scheitern. Es gibt keinen `DELETE`- oder `PUT`-Endpunkt für Ausgaben.

### Historie (Backend)
- **AK-14** `GET /api/coins/{id}/ausgaben` (Berechtigung `issues.read`) liefert alle Ausgaben des Coins seitenweise im Format aus Abschnitt 5.2, neueste zuerst (`erfasstAm` absteigend, dann `id` absteigend), aktive und stornierte. Filter `status=aktiv|storniert` (fehlend = alle). Unbekannter Coin: `404`. `Cache-Control: no-store`.
- **AK-15** Rechte je Rolle (Integrationstest je Rolle, Vorgabe „Betrachter erhalten keine Empfängerdaten“):

  | Endpunkt | Administrator | Sachbearbeiter | Betrachter | keine Rolle | deaktiviert | anonym |
  |---|---|---|---|---|---|---|
  | `GET …/exemplare` | 200 | 200 | 200 | 403 | 403 | 401 |
  | `GET …/ausgaben` | 200 | 200 | **403** | 403 | 403 | 401 |
  | `POST …/ausgaben`, `POST …/storno` | 201/200 | 201/200 | 403 | 403 | 403 | 401 |
  | `PUT …/auflage` | 200 | 200 | 403 | 403 | 403 | 401 |

  Für den Betrachter enthält **keine** Antwort (auch nicht `403`-Body, `…/exemplare`, `GET /api/coins/{id}`) den Empfängernamen, Dienstgrad, Dienststelle, Gelegenheit, Begründung, ausgebende Stelle oder Storno-Grund einer zuvor erfassten Ausgabe (Prüfung per Suche nach den eindeutigen Testwerten im Antworttext). `403` geht `404` vor (unbekannte Coin-Id ohne Recht → `403`).
- **AK-16** `GET /api/me` liefert die neuen Berechtigungen nach der Rechtematrix: Administrator und Sachbearbeiter zusätzlich `issues.read`, `issues.write`; Betrachter unverändert `["coins.read"]`. Ordinal sortiert.

### Auflage ändern (Backend, F3/F4)
- **AK-17** `PUT /api/coins/{id}/auflage` (Berechtigung `coins.write`) mit `{ "auflage": N }`:
  - `N` Pflicht, 1–1.000.000 (F9), Meldungen wie beim Anlegen („Auflage muss zwischen 1 und 1000000 liegen.“), fehlend/`null`: „Auflage ist erforderlich.“ (kein Zurück auf „unbekannt“, F4).
  - Erhöhung erzeugt die Exemplare alt+1 bis N (bei bisher `null`: 1 bis N). Gleicher Wert: `200` ohne Änderung.
  - Senkung löscht die Exemplare N+1 bis alt, wenn keines davon je ausgegeben war (aktiv oder storniert, F4). Sonst `409` `auflage_zu_klein`, `title` „Änderung nicht möglich“, „Die Auflage kann nicht unter {m} gesenkt werden, weil Exemplar Nr. {m} ausgegeben wurde.“ ({m} = höchste je ausgegebene Nummer).
  - Unbekannter Coin `404`. Antwort `200` mit dem Coin (Coin-Format).
  - Integrationstest: Auflage 10, Nr. 7 ausgegeben und storniert → Senkung auf 6 `409`, auf 7 `200` (Exemplare 1–7). Parallel Senkung auf 5 und Ausgabe Nr. 6: entweder Ausgabe `201` und Senkung `409`, oder Senkung `200` und Ausgabe `400 exemplarNummer`; nie beides erfolgreich.

### Audit
- **AK-18** Jede erfasste Ausgabe schreibt in derselben Transaktion genau einen Eintrag in `ausgabe_audit` (`art` `Erfasst`, `akteur_id`, `ausgabe_id`, `coin_id`, `exemplar_nummer`, `zeitpunkt`), jedes Storno genau einen (`art` `Storniert`, zusätzlich `grund`). Fehlgeschlagene Anfragen schreiben nichts. Das Audit enthält keine Empfängerdaten (F6). Einträge sind per Trigger unveränderlich (Integrationstest per SQL: `UPDATE`/`DELETE` scheitern). Es gibt keinen Lese-Endpunkt dafür (F7).
- **AK-19** Weder Empfängerdaten noch Gelegenheit, Begründung, ausgebende Stelle oder Storno-Grund erscheinen in Logs. Integrationstest (Muster `LogTests`): Erfassen und Stornieren mit eindeutigen Testwerten, auch mit Validierungsfehler und mit `409`; kein Testwert im gesammelten Log; Request-Protokoll nur mit Routen-Template (`/api/coins/{id}/ausgaben`, `/api/coins/{id}/ausgaben/{ausgabeId}/storno`). Request-DTOs überschreiben `ToString()` ohne Werte.

### Frontend: Detailseite `/coins/$coinId`
- **AK-20** Der Platzhalter „Verleihungen“ entfällt (F1). Mit `coins.read` erscheint der Abschnitt `h2` „Exemplare“:
  - Kennzahlen als `<dl>`: „Auflage“, „Ausgegeben“, „Verfügbar“ (Zahlen `de-DE`). Bei Auflage `null`: „Für diesen Coin ist keine Auflage erfasst. Es gibt daher keine Exemplare.“
  - Filter „Status“ (`Select` mit Label) mit „Alle“, „Verfügbar“, „Ausgegeben“; Tabelle mit sr-only-Caption „Exemplare“, Spalten „Nr.“ und „Status“ (`Badge` mit Text „verfügbar“/„ausgegeben“, nicht nur Farbe); `Blaettern` (25 je Seite). Filter und Seite stehen in der URL (`?status=ausgegeben&seite=2`), ungültige Werte gelten als „Alle“ bzw. Seite 1.
  - Laden `role="status"` „Exemplare werden geladen …“, Fehler `role="alert"` „Die Exemplare konnten nicht geladen werden. Bitte später erneut versuchen.“, leerer Filter „Keine Exemplare mit diesem Status.“
- **AK-21** Ohne `coins.read` (anonym, ohne Rolle, deaktiviert) fehlen die Abschnitte „Exemplare“ und „Ausgabehistorie“ im DOM, und es gibt keinen Request auf `…/exemplare` oder `…/ausgaben` (F2). Stammdaten und Bild bleiben öffentlich wie bisher.
- **AK-22** Mit `issues.read` erscheint zusätzlich `h2` „Ausgabehistorie“: Tabelle (sr-only-Caption „Ausgabehistorie“) mit „Nr.“, „Empfänger“ (Name, darunter Dienstgrad und Dienststelle, falls vorhanden), „Datum“ (`de-DE`), „Gelegenheit“, „Begründung“, „Ausgebende Stelle“, „Erfasst“ (Name, Datum), „Status“ („aktiv“ bzw. „storniert am {Datum} von {Name}: {Grund}“). Neueste zuerst, `Blaettern`. Leer: „Für diesen Coin wurden noch keine Ausgaben erfasst.“ Alle Inhalte als Text, nie als HTML. Ohne `issues.read` (Betrachter) fehlt der Abschnitt im DOM, und es gibt keinen Request auf `…/ausgaben`.
- **AK-23** Mit `issues.write` und gesetzter Auflage: Link „Ausgabe erfassen“ (Router-`Link`, `buttonVariants`, Ziel `/coins/{id}/ausgaben/neu`) im Abschnitt „Exemplare“. Sonst nicht im DOM. Bei `verfuegbar: 0` ist er vorhanden, die Erfassen-Seite meldet dann den Fehler aus AK-8.
- **AK-24** Mit `issues.write` hat jede aktive Ausgabe in der Historie den Button „Stornieren“ (`aria-label` „Ausgabe von Exemplar Nr. {n} stornieren“). Er öffnet einen `AlertDialog` „Ausgabe stornieren?“ mit:
  - Pflichtfeld „Grund“ (`Textarea`, `maxLength` 500) und dem Hinweis „Bitte keine Personendaten in den Grund schreiben.“, per `aria-describedby` mit dem Feld verbunden (F6).
  - Buttons „Stornieren“ und „Abbrechen“. Leerer Grund: Feldfehler „Bitte einen Grund für das Storno angeben.“, kein Request.
  - Nach Erfolg: Dialog schließt, `role="status"` „Ausgabe von Exemplar Nr. {n} wurde storniert.“, Historie und Kennzahlen werden neu geladen, Fokus auf die Statusmeldung.
  - `409 bereits_storniert` und andere Fehler erscheinen im Dialog als `role="alert"`; danach lädt die Historie neu.
  - Der Dialog hält den Fokus und gibt ihn beim Schließen an den auslösenden Button (bzw. die Statusmeldung) zurück; Escape bricht ab.
- **AK-25** Mit `coins.write` (F3): Button „Auflage ändern“ bei den Kennzahlen öffnet einen `Dialog` mit dem Feld „Auflage“ (Zahl, Pflicht, vorbelegt), „Speichern“, „Abbrechen“. Fehler (`400`, `409 auflage_zu_klein`) erscheinen im Dialog, nach Erfolg schließt er, Stammdaten und Kennzahlen laden neu, `role="status"` „Auflage wurde geändert.“ Ein leeres Feld ist nicht erlaubt (Feldfehler „Auflage ist erforderlich.“).

### Frontend: Seite „Ausgabe erfassen“ (`/coins/$coinId/ausgaben/neu`)
- **AK-26** Route mit `beforeLoad: erfordertBerechtigung('issues.write')`: anonym → Anmeldung mit Rückkehrziel; deaktiviert/ohne Rolle → `/kein-zugriff`; Betrachter → `/kein-zugriff?grund=berechtigung`. Die Routen-Komponente rendert nur mit `issues.write`. Keine GUID → „Coin nicht gefunden“ ohne API-Aufruf; `404` ebenso.
- **AK-27** `h1` „Ausgabe erfassen“, darunter der Coin-Name und „Verfügbar: {n} von {Auflage}“. Formular (ein `<form>`, Enter sendet):
  - Gruppe „Exemplar“ (`RadioGroup` mit `fieldset`/`legend`): „Nächstes freies Exemplar“ (Standard) oder „Bestimmte Nummer“ mit Zahlenfeld „Exemplar-Nummer“ (1 bis Auflage, nur bei dieser Wahl aktiv und dann Pflicht).
  - „Name des Empfängers“ (Pflicht), „Dienstgrad“ (optional), „Dienststelle“ (optional), „Datum“ (`type="date"`, Pflicht, Standard heute, `max` heute), „Gelegenheit“ (Pflicht, Hinweis „z. B. Truppenbesuch, Verabschiedung“), „Begründung“ (`Textarea`, Pflicht), „Ausgebende Stelle oder Person“ (Pflicht, F5).
  - Pflichtfelder sind im Label gekennzeichnet („Pflichtfeld“ für Screenreader). Clientseitige Prüfung mit denselben Texten wie AK-7; Fehler per `aria-invalid` und `aria-describedby`, beim Absenden Fokus auf das erste fehlerhafte Feld.
  - Buttons „Ausgabe speichern“ (Sende-Sperre gegen Doppel-POST) und Link „Abbrechen“ (zur Detailseite).
  - Bei Auflage `null` oder `verfuegbar: 0` zeigt die Seite statt des Formulars den Text aus AK-8 und „Zurück zum Coin“.
- **AK-28** Nach `201` navigiert die App mit `replace` zur Detailseite mit `role="status"` „Exemplar Nr. {n} wurde ausgegeben.“ (ohne Empfängernamen, Meldungsschlüssel und Nummer im History-State, verbraucht wie in katalog-seiten AK-22), Fokus auf das `h1`. Die neue Ausgabe steht oben in der Historie, die Kennzahlen sind aktualisiert. „Zurück“ führt nicht auf das ausgefüllte Formular.
- **AK-29** Fehler bleiben auf der Seite, Eingaben bleiben erhalten: `400` als Feldfehler; `409 exemplar_ausgegeben` am Feld „Exemplar-Nummer“; `409 kein_exemplar_frei`/`auflage_unbekannt` als `role="alert"`; `403` und `401` mit den bestehenden Texten.

### Struktur, Barrierefreiheit, Doku
- **AK-30** Barrierefreiheit (WCAG 2.1 AA / BITV) auf Detail- und Erfassen-Seite: genau ein `h1`; alle Bedienelemente (Filter, Blättern, „Ausgabe erfassen“, „Stornieren“, Dialoge, Formularfelder, Radio-Gruppe mit Pfeiltasten) per Tastatur in sinnvoller Reihenfolge erreichbar, sichtbarer Fokus (`focus-visible`); Dialoge mit Rolle `alertdialog`/`dialog` und zugänglichem Namen; Status nicht nur über Farbe; alle Texte deutsch inkl. `sr-only`, `aria-label`, Captions (Englisch-Prüfung der bestehenden Tests läuft für beide Seiten und beide Dialoge).
- **AK-31** FSD nach Abschnitt 6, `npm run lint` (ESLint + Steiger) ohne Befund, keine Querimporte, Seiten ohne Router-Hooks. Neue shadcn-Komponenten `radio-group` und `dialog` sind nach ADR-0009 nachbearbeitet.
- **AK-32** `docs/berechtigungen.md`: Rechtematrix und Endpunkttabelle nach Abschnitt 5.3, Format und Marker unverändert. `BerechtigungsDokuTests`, `EndpunktTabelleTests` und `EndpunktInventarTests` sind grün (nur die erwarteten Daten werden ergänzt, nicht die Prüflogik).
- **AK-33** Systemtest `e2e/tests/coin-ausgaben.spec.ts` (Abschnitt 8). `dotnet build` ohne Warnungen, `dotnet test`, `npm test`, `npm run test:ui`, `npm run lint`, `npm run build`, `npx playwright test` in `e2e/` grün; Doku nach Abschnitt 9 nachgezogen.

## 4. Datenmodell (ADR-0020)
```
coin_typ (unverändert)
exemplar        PK (coin_id, nummer)  coin_id FK coin_typ RESTRICT, nummer int CHECK >= 1
ausgabe         PK id (uuid v7)
                coin_id, exemplar_nummer  FK exemplar RESTRICT
                empfaenger_name varchar(200) NOT NULL, empfaenger_dienstgrad varchar(100), empfaenger_dienststelle varchar(200)
                datum date NOT NULL, gelegenheit varchar(200) NOT NULL, begruendung varchar(2000) NOT NULL,
                ausgebende_stelle varchar(200) NOT NULL
                erfasst_am timestamptz NOT NULL, erfasst_von uuid NOT NULL FK benutzer RESTRICT
                storniert_am timestamptz, storniert_von uuid FK benutzer RESTRICT, storno_grund varchar(500)
                CHECK ck_ausgabe_storno: alle drei NULL oder alle drei NOT NULL
                UNIQUE ux_ausgabe_exemplar_aktiv (coin_id, exemplar_nummer) WHERE storniert_am IS NULL
                INDEX ix_ausgabe_coin_erfasst (coin_id, erfasst_am DESC, id DESC)
                TRIGGER trg_ausgabe_nur_storno (kein DELETE, UPDATE nur einmal NULL → storniert, sonst nichts)
ausgabe_audit   PK id (uuid v7), zeitpunkt timestamptz, akteur_id FK benutzer NOT NULL, ausgabe_id FK ausgabe RESTRICT,
                coin_id, exemplar_nummer, art varchar(10) ('Erfasst'|'Storniert'), grund varchar(500)
                CHECK (art = 'Erfasst' AND grund IS NULL) OR (art = 'Storniert' AND grund IS NOT NULL)
                TRIGGER trg_ausgabe_audit_unveraenderlich
```
Migration `Exemplare` erzeugt Exemplare für bestehende Coins (ADR-0020 Punkt 3). Integrationstests leeren die DB weiterhin per `TRUNCATE … CASCADE`; die neuen Tabellen sind dort aufzunehmen.

## 5. API

### 5.1 Endpunkte
| Methode | Pfad | Zugang | Antwort |
|---|---|---|---|
| `GET` | `/api/coins/{id}/exemplare?status=&seite=&groesse=` | `coins.read` | `200` `{ kennzahlen, eintraege: [{ nummer, status }], gesamt, seite, groesse }`, `400` (`status`: „Bitte einen gültigen Status wählen.“, Paging wie bisher), `404` |
| `GET` | `/api/coins/{id}/ausgaben?status=&seite=&groesse=` | `issues.read` | `200` Seite mit Ausgaben, `400`, `404` |
| `POST` | `/api/coins/{id}/ausgaben` | `issues.write` | `201` Ausgabe (kein `Location`, es gibt keinen Einzelabruf), `400`, `404`, `409`, `415` |
| `POST` | `/api/coins/{id}/ausgaben/{ausgabeId}/storno` | `issues.write` | `200` Ausgabe, `400`, `404`, `409`, `415` |
| `PUT` | `/api/coins/{id}/auflage` | `coins.write` | `200` Coin, `400`, `404`, `409`, `415` |

Alle neuen Endpunkte: `Cache-Control: no-store`; schreibende per `[Inhaltstyp]` (`application/json`); `401`/`403` vor allen fachlichen Prüfungen; `{id}`/`{ausgabeId}` als GUID, sonst `404`.

### 5.2 Formate
Request `POST …/ausgaben`:
```json
{ "exemplarNummer": null, "empfaengerName": "Max Beispiel", "empfaengerDienstgrad": "Hauptmann",
  "empfaengerDienststelle": "Beispielbataillon 1", "datum": "2026-10-01", "gelegenheit": "Truppenbesuch",
  "begruendung": "Herausragende Leistung", "ausgebendeStelle": "Kommandeur Beispielbataillon 1" }
```
Ausgabe (Antwort, nur unter `issues.read`/`issues.write`):
```json
{ "id": "…", "exemplarNummer": 12,
  "empfaenger": { "name": "Max Beispiel", "dienstgrad": "Hauptmann", "dienststelle": "Beispielbataillon 1" },
  "datum": "2026-10-01", "gelegenheit": "Truppenbesuch", "begruendung": "…", "ausgebendeStelle": "…",
  "erfasstAm": "2026-10-08T09:00:00.123456+00:00", "erfasstVon": { "id": "…", "name": "Test Sachbearbeiter" },
  "storno": null }
```
`storno`: `null` oder `{ "am": "…", "von": { "id", "name" }, "grund": "…" }`. Namen der Akteure kommen beim Lesen aus `benutzer` (wie `GET /api/audit`).

Kennzahlen: `{ "auflage": 150, "ausgegeben": 3, "verfuegbar": 147 }`.

### 5.3 `docs/berechtigungen.md` (neuer Inhalt zwischen den Markern)
```
| `coins.read` | Katalog lesen (öffentlich, nicht durchgesetzt); Exemplare und Kennzahlen lesen | ✓ | ✓ | ✓ | – |
| `coins.write` | Coins anlegen, Motivbild hochladen, Auflage ändern | ✓ | ✓ | – | – |
| `issues.read` | Ausgaben mit Empfängerdaten lesen | ✓ | ✓ | – | – |
| `issues.write` | Ausgaben erfassen und stornieren | ✓ | ✓ | – | – |
| `users.manage` | … unverändert
| `audit.read` | … unverändert
```
Endpunkte:
```
| `POST /api/coins`, `PUT /api/coins/{id}/bild`, `PUT /api/coins/{id}/auflage` | `coins.write` |
| `GET /api/coins/{id}/exemplare` | `coins.read` |
| `GET /api/coins/{id}/ausgaben` | `issues.read` |
| `POST /api/coins/{id}/ausgaben`, `POST /api/coins/{id}/ausgaben/{ausgabeId}/storno` | `issues.write` |
```
Der Satz „`coins.read` ist definiert, wird aber nicht durchgesetzt …“ wird ersetzt durch: „`coins.read` gilt für `GET /api/coins/{id}/exemplare`; die übrigen Katalog-Endpunkte bleiben öffentlich (ADR-0014, ADR-0021).“

### 5.4 Backend-Schnitt
- **Domain** `Coin.Domain.Ausgaben`: `Ausgabe` (Erstellen mit Validierung nach AK-7, `Stornieren(grund, akteurId, jetzt)`), `AusgabeService` (Erfassen, Stornieren, Historie, Exemplare/Kennzahlen; Ergebnisse als geschlossene Ergebnistypen wie `CoinAnlegenErgebnis`), `IAusgabeRepository`. Auflage-Regel in `CoinKatalogService.AuflageAendernAsync` (Domain-Prüfung gegen die höchste je ausgegebene Nummer). `Berechtigungen` + `Rechtematrix` erweitert. „Heute“ über `TimeProvider` in Europe/Berlin.
- **Infrastruktur**: `AusgabeRepository` (Transaktion mit `FOR UPDATE`, `generate_series`, Übersetzung `23505` auf `ux_ausgabe_exemplar_aktiv` → `ExemplarAusgegeben`), Exemplar-Erzeugung im bestehenden `HinzufuegenAsync`, Konfigurationen, Migration mit Triggern.
- **API**: `AusgabenController` (Route `api/coins/{id:guid}/ausgaben`), `ExemplareController` oder Aktion in `CoinsController`, `PUT …/auflage` in `CoinsController`; keine Logik in Controllern; `[KeinCache]`; 403-Texte in `AutorisierungsErgebnisBehandlung` (ADR-0021 Punkt 7).

## 6. Frontend (FSD, Public API je `index.ts`)
```
shared/config/routen.ts      + coinAusgabeNeu: '/coins/$coinId/ausgaben/neu'
shared/ui                    + radio-group, dialog (npx shadcn add, Diff prüfen, ADR-0009); vorhanden: alert-dialog, badge,
                               select, table, textarea, input, label, blaettern
entities/benutzer            Typ Berechtigung + 'issues.read' | 'issues.write'
entities/exemplar/ (neu)     model/types.ts (Exemplar, Kennzahlen, ExemplarStatus), api/exemplare.ts ladeExemplare(coinId,
                               { status, seite }), ui/ExemplarTabelle.tsx, ui/Kennzahlen.tsx, ui/ExemplarStatusBadge.tsx
                               index.ts: Typen, ladeExemplare, ExemplarTabelle, Kennzahlen
entities/ausgabe/ (neu)      model/types.ts (Ausgabe, AusgabeStatus), api/ausgaben.ts ladeAusgaben(coinId, { status, seite }),
                               ui/AusgabenTabelle.tsx (Prop `aktion?: (a: Ausgabe) => ReactNode` für den Storno-Button)
                               index.ts: Typen, ladeAusgaben, AusgabenTabelle
entities/coin                + aendereAuflage(id, auflage) in api/coins.ts, index.ts
features/ausgabe-erfassen/   model/validiereAusgabe.ts, api/erfasseAusgabe.ts, ui/AusgabeFormular.tsx
                               (Props { coin, kennzahlen, onErfasst(ausgabe) }) · index.ts: AusgabeFormular
features/ausgabe-stornieren/ api/storniereAusgabe.ts, ui/AusgabeStornieren.tsx (Button + AlertDialog mit Datenschutz-Hinweis,
                               Props { coinId, ausgabe, onStorniert }) · index.ts
features/auflage-aendern/    api über entities/coin, ui/AuflageAendern.tsx (Button + Dialog) · index.ts
widgets/coin-exemplare/ (neu) Kennzahlen, Status-Filter, ExemplarTabelle, Blaettern, Lade-/Fehlerzustand, Link „Ausgabe
                               erfassen“ (Prop darfErfassen), AuflageAendern (Prop darfAuflageAendern); Props { coinId, status,
                               seite, onStatus, onSeite, neuLaden } · index.ts
widgets/ausgaben-historie/ (neu) AusgabenTabelle + Blaettern (Seite lokal) + AusgabeStornieren je aktiver Zeile (Prop
                               darfStornieren); meldet onGeaendert, damit die Kennzahlen neu laden · index.ts
pages/coin-detail            Props + { berechtigungen: { exemplare, historie, erfassen, auflage }, status, seite, onStatus,
                               onSeite, meldung (+ 'ausgabeErfasst' mit Nummer) }; Platzhalter „Verleihungen“ entfällt
pages/ausgabe-erfassen/ (neu) AusgabeErfassenSeite { coinId, onErfasst }: lädt Coin und Kennzahlen, h1, AusgabeFormular,
                               „Abbrechen“ · index.ts
app/router                   router.tsx: coinAusgabeNeuRoute (Geschwister, beforeLoad erfordertBerechtigung('issues.write')),
                               validateSearch der Detailroute { status?, seite? }; routen-komponenten.tsx:
                               AusgabeErfassenRoute, CoinDetailRoute reicht Berechtigungen und Search durch; HistoryState
                               + ausgabeErfasst?: { nummer: number }
```
Importrichtung: `pages/coin-detail` → `widgets/coin-exemplare`, `widgets/ausgaben-historie` → `features/*` → `entities/*` → `shared`. Keine Querimporte zwischen `entities/exemplar`, `entities/ausgabe` und `entities/coin`; wo eine Seite mehrere braucht, setzt sie sie zusammen. Die Sidebar bleibt unverändert (keine eigene Navigationsseite; „Katalog“ ist auf Unterseiten aktiv).

## 7. Sicherheit und Datenschutz
- **Personendaten** (Empfänger, Gelegenheit, Begründung, ausgebende Stelle, Storno-Grund) gibt es nur über `GET …/ausgaben` (`issues.read`) und in den Antworten der schreibenden Endpunkte (`issues.write`). Betrachter, Rollenlose, Deaktivierte und Anonyme erhalten sie nie (AK-15). Öffentliche DTOs bleiben unverändert (AK-5).
- Geschützt wird im Backend; das Frontend blendet nur aus. Policies je Endpunkt, Inventartests (AK-32).
- **Logs**: keine Feldwerte, Request-DTOs mit `ToString()` ohne Werte, Request-Protokoll nur Routen-Templates (ADR-0019, AK-19). Fehlermeldungen und ProblemDetails enthalten nie Empfängerdaten (nur Exemplar-Nummern). Die Erfolgsmeldung im Frontend und der History-State enthalten nur die Nummer (AK-28).
- **Audit** ohne Empfängerdaten (ADR-0020 Punkt 10, F6), unveränderlich, ohne Lese-Endpunkt (F7); der Storno-Grund ist Freitext, die UI weist auf „keine Personendaten“ hin (AK-24). Ausgaben selbst nur stornierbar, nie löschbar (Trigger).
- **Integrität**: partieller Unique-Index + Zeilensperre je Coin (AK-9, AK-10); keine Abhängigkeit von Client-Angaben für Akteur und Zeit.
- **Caching**: `no-store` auf allen neuen Endpunkten; Frontend speichert Ausgaben nicht in `localStorage`.
- **Ausgabe im Browser**: alle Freitexte als Text gerendert (kein `dangerouslySetInnerHTML`).
- **Aufbewahrung** (F10): Ausgaben und Audit vorerst unbegrenzt; Löschkonzept als eigenes späteres Feature.

## 8. Testplan
| Ebene | Inhalt |
|---|---|
| xUnit Unit | `Ausgabe.Erstellen` (alle Regeln AK-7, Trimmen, Grenzen 200/201, 2000/2001, Datum heute/morgen in Europe/Berlin um 23:30 UTC), `Stornieren` (Grund Pflicht/500, zweites Storno), Auflage-Regel (Erhöhung, Senkung bis zur höchsten je ausgegebenen Nummer inkl. storniert, gleicher Wert, `null` abgelehnt), `Rechtematrix` mit `issues.*`, `BerechtigungsDokuTests` (Doku nachgezogen). |
| xUnit Integration (Testcontainers) | Neu `Ausgaben/`: Exemplare beim Anlegen (150 → 150), Migration (AK-2), Exemplare/Kennzahlen inkl. Filter, Paging und 150/3/147 (AK-3, AK-4), Erfassen inkl. aller `400`/`404`/`409` und Prüfreihenfolge (AK-6–AK-8), Nebenläufigkeit (AK-9, AK-10, AK-12, AK-17 parallel), DB-Constraint und Trigger per SQL (AK-9, AK-13, AK-18), Storno (AK-11, AK-12), Historie (AK-14), **Rollentest je Rolle** (AK-15, Theory über Admin/Sachbearbeiter/Betrachter/keine Rolle/deaktiviert/anonym, Suche nach Testwerten im Antworttext), `/api/me` (AK-16), Auflage ändern (AK-17), Audit-Einträge (AK-18), `LogTests` erweitert (AK-19), `no-store`. Anzupassen: `EndpunktTabelleTests`/`EndpunktInventarTests` laufen gegen die neue Doku; `TRUNCATE`-Liste der Testbasis; `CoinAnlegen`-Tests ggf. um Exemplare ergänzen. |
| Vitest | `ladeExemplare`, `ladeAusgaben`, `erfasseAusgabe`, `storniereAusgabe`, `aendereAuflage` (Query/Body, Fehlerabbildung inkl. `code`); `validiereAusgabe`; `Kennzahlen`, `ExemplarTabelle`, `ExemplarStatusBadge`, `AusgabenTabelle` (Storno-Text, optionale Felder, Text statt HTML); `AusgabeFormular` (Radio-Wahl, Pflichtfelder, Fokus auf erstes Fehlerfeld, Sende-Sperre, 409 am Feld); `AusgabeStornieren` (leerer Grund ohne Request, Datenschutz-Hinweis per `aria-describedby`, Erfolg, 409 im Dialog, Fokus-Rückgabe); `AuflageAendern` (leeres Feld abgelehnt, 409); Widgets (veraltete Antworten verworfen, Filter); `CoinDetailSeite` je Berechtigungsstufe (anonym/Betrachter/Sachbearbeiter: welche Abschnitte und Requests); `App.*.test.tsx`: Guard für `/coins/{id}/ausgaben/neu` für alle Rollen, anonym, deaktiviert; Erfassen → Detailseite mit Meldung; Englisch-Prüfung. Anzupassen: Tests zum Platzhalter „Verleihungen“ (katalog-seiten AK-19) entfallen bzw. werden ersetzt. |
| UI-Test `web/ui-tests/coin-ausgaben.spec.ts` (gemockte API) | Sachbearbeiter: Detailseite → „Ausgabe erfassen“ → Formular nur per Tastatur → POST-Body geprüft → Detailseite mit Meldung, Fokus `h1`, Historie oben, Kennzahlen 150/3/147 (Mock); Storno per Tastatur mit Dialog; Betrachter: Kennzahlen und Status, kein Historie-Abschnitt, kein Request auf `…/ausgaben`, Direktaufruf der Erfassen-Seite → „Kein Zugriff“; anonym: keine Exemplare-Requests; Filter und Blättern in der URL; sichtbarer Fokus an Filter, Link, „Stornieren“, Dialogfeldern, Radio-Gruppe; 409-Fälle. Anzupassen: `katalog-seiten.spec.ts` (Platzhalter „Verleihungen“). |
| Systemtest `e2e/tests/coin-ausgaben.spec.ts` (echte API, Keycloak, `workers: 1`) | 1. Admin vergibt `sachbearbeiter@test.local` die Rolle Sachbearbeiter und `betrachter@test.local` die Rolle Betrachter (wiederholbar wie `benutzerverwaltung.spec.ts`) und legt einen Coin mit eindeutigem Namen und Auflage 150 an. 2. Sachbearbeiter öffnet die Detailseite (Suche im Katalog), sieht 150/0/150, erfasst eine Ausgabe mit eindeutigem Empfängernamen, landet auf der Detailseite mit Meldung, sieht die Ausgabe in der Historie und 1 ausgegeben/149 verfügbar. 3. Betrachter öffnet dieselbe Detailseite: Kennzahlen 1/149, Exemplar Nr. 1 „ausgegeben“, kein Abschnitt „Ausgabehistorie“, der Empfängername kommt auf der Seite nicht vor; Direktaufruf von `/coins/{id}/ausgaben/neu` → „Kein Zugriff“. 4. Sachbearbeiter storniert die Ausgabe mit Grund; Historie zeigt „storniert“, Kennzahlen 0/150. Anzupassen: `katalog-seiten.spec.ts` (Abschnitt „Verleihungen“). |

## 9. Doku-Bedarf
- `docs/api.md`: neue Endpunkte, Formate, Fehlercodes (`auflage_unbekannt`, `exemplar_ausgegeben`, `kein_exemplar_frei`, `bereits_storniert`, `auflage_zu_klein`), neue Schlüssel in der Fehlertabelle, 403-Texte, `/api/me`-Beispiel mit `issues.*`, Hinweis: `POST /api/coins` erzeugt Exemplare.
- `docs/berechtigungen.md`: nach Abschnitt 5.3.
- `docs/requirements.md`: Funktionen 2, 3 und 5 als teilweise umgesetzt; Funktion 3 mit `issues.read`/`issues.write` statt `verleihungen.read`; Betrachter-Zeile und Frage „Freitext oder Stammdaten“ als entschieden (Freitext); Entscheidungen F1–F10 vom 2026-10-08.
- `docs/benutzer/coin-ausgaben.md` (neu): Exemplare, Ausgabe erfassen, Stornieren, Auflage ändern, wer was sieht. `docs/benutzer/coin-katalog.md`: Detailseite.
- `docs/features/katalog-seiten.md`: Hinweis „Platzhalter Verleihungen ersetzt durch coin-ausgaben“. ADR-0016: Hinweis „ergänzt durch ADR-0021“; ADR-0017 Folgen: Verweis auf ADR-0020.
- `CLAUDE.md`: Fachbegriff „Verleihung“ → „Ausgabe“ und Aktueller Stand; passt der Koordinator an (F1), nicht der architect.

## 10. Offene Fragen
Keine. F1 bis F10 hat der Auftraggeber am 2026-10-08 entschieden (Abschnitt 1).

## 11. Annahmen
- A1: Status „ungültig“ (requirements Funktion 2) und Rückgabe sind nicht Teil dieses Features; ein Exemplar ist „verfügbar“ oder „ausgegeben“.
- A2: Eine Ausgabe wird nicht bearbeitet. Korrektur = Storno mit Grund + neue Ausgabe.
- A3: Die Berechtigung wird wie bei `coins.write` am Request-Anfang per Policy geprüft; ein Rechteentzug während der laufenden Anfrage wird nicht erneut geprüft (anders als ADR-0018, wo es um Rechtevergabe selbst geht).
- A4: „Nächste freie“ ist die kleinste freie Nummer.
- A5: Auflage-Änderungen werden nicht im Audit festgehalten (nicht verlangt; Coin-Anlage ist es bisher auch nicht).
- A6: Gelegenheit ist Freitext (Pflicht) ohne feste Auswahlliste.
- A7: Die Historie wird nicht nach Exemplar gefiltert; Filter nur nach Status.

## 12. Abweichungen und Ergänzungen aus Umsetzung und Review

Backend:
- **Auflage ändern** liegt in `AusgabeService.AuflageAendernAsync` (Regel `AuflageAenderung` in `Coin.Domain.Katalog`) statt in `CoinKatalogService`, weil es dieselbe Coin-Sperre braucht wie Erfassen und Storno. `GET …/exemplare` und `PUT …/auflage` stehen im `ExemplareController`, nicht im `CoinsController` (ADR-0020/0021, Abschnitt „Umsetzung“).
- **Index `ix_ausgabe_exemplar`** `(coin_id, exemplar_nummer)` nach Review Runde 1 nachgetragen (in der bestehenden Migration `20261008100432_Exemplare`), dazu ein **Befehls-Timeout von 120 s** nur für das Erzeugen und Löschen von Exemplaren. Integrationstests mit Auflage 1.000.000 (`GrosseAuflageTests`, Trait `Kategorie=Langsam`) sichern das ab.
- **Kennzahlen aus einer Abfrage** (Auflage, Exemplare, aktive Ausgaben in einem Statement), damit sie zueinander passen.
- **Deutsche Standardtitel** für ProblemDetails ohne fachlichen Titel (`ProblemTitel.Setzen`, Liste in `docs/api.md`), u. a. 500 „Ein unerwarteter Fehler ist aufgetreten.“
- **`errors.anfrage` bei syntaktisch kaputtem JSON** gilt jetzt für alle Endpunkte: Ist der Body kein JSON, gibt es nur diesen Schlüssel statt eines Feldfehlers an der Stelle, an der der Parser stand.
- `Include Error Detail` (Npgsql) ist in Konfiguration und Code verboten und per Test geprüft (`KonfigurationsdateienTests`), weil sonst Empfängerdaten in Fehlermeldungen gelangen.

Frontend:
- `shared/api`: Option `konfliktDetail` für `sende`/`bildeAb` übernimmt bei `409` zusätzlich `detail` (genutzt von `AuflageAendern` für den Text „… nicht unter {m} gesenkt …“; nur für Texte ohne Personendaten).
- `widgets/coin-exemplare`: zusätzliche Prop `onAuflageGeaendert(coin)`, damit die Seite die Stammdaten aus der Antwort übernimmt; die Meldung „Auflage wurde geändert.“ zeigt das Widget selbst.
- `features/ausgabe-stornieren`: zusätzliche Props `onFehler` (Historie lädt nach einem Fehler neu, der Dialog bleibt mit Fehlermeldung offen) und `onGeschlossen`.
- `features/ausgabe-erfassen`: `409 exemplar_ausgegeben` bei „Nächstes freies Exemplar“ (gleichzeitige Ausgabe) erscheint als Alarm „Das gewählte Exemplar wurde gerade ausgegeben. Bitte erneut speichern.“
- `shared/lib/format.ts` bündelt Zahl- und Datumsformatierung (`de-DE`, Europe/Berlin, `heuteInBerlin`).
- `shared/ui/dialog` und `shared/ui/radio-group` nach ADR-0009 nachbearbeitet (`cn`-Import, „Schließen“, Tab-Falle im Dialog).

Bekannte Hinweise und Folgepunkte:
- `ProblemTitel` setzt für `403` ohne fachlichen Titel „Zugriff verweigert“, ADR-0016 verwendet „Kein Zugriff“. Praktisch nicht sichtbar, weil jedes `403` den fachlichen Titel trägt.
- Ein Unit-Test für `ProblemTitel.Setzen` fehlt (insbesondere `415` und der Titel von Validierungsfehlern ohne fachlichen Titel); abgedeckt sind bisher nur 500 und Routing-Fehler über `FehlerbehandlungTests`.
- Vitest und Playwright-UI-Tests liefen bei paralleler Ausführung unter sehr hoher Last in Timeouts. Eine angepasste Timeout-Konfiguration für Vitest ist eine eigene Aufgabe.
- Lokale Dev-DBs, auf die die Migration `Exemplare` vor dem Index-Nachtrag angewendet wurde, haben den Index nicht (Abhilfe im README).

Doku: Die Anwenderanleitung heißt `docs/benutzer/ausgaben.md` (statt `coin-ausgaben.md` aus Abschnitt 9).
