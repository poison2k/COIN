# Feature: Zertifikat erzeugen (DOCX je Ausgabe aus der aktiven Vorlage)

Status: umgesetzt (Rev. 2 mit den Entscheidungen des Auftraggebers vom 2026-10-16, Abschnitt 1.3; Präzisierungen vom 2026-10-17 zu AK-17, AK-24, AK-27, Abschnitte 5.2 und 5.4; QA-Freigabe in Runde 2; Abweichungen in Abschnitt 12) · Datum: 2026-10-16 · Branch: `feature/zertifikat-erzeugen` (von `main` bei d3a226f) · Anforderung: [Zertifikate](../requirements.md#zertifikate), Schritte 2–4 · ADRs: [0027](../adr/0027-coin-kennung-und-zertifikatsnummer.md) (neu, Kennung und Nummer), [0028](../adr/0028-zertifikat-erzeugen-im-speicher.md) (neu, Ersetzung im Speicher), [0029](../adr/0029-audit-der-zertifikat-downloads.md) (neu, Download-Audit), [0020](../adr/0020-exemplare-und-ausgaben-datenmodell.md), [0021](../adr/0021-rechte-fuer-exemplare-und-ausgaben.md), [0022](../adr/0022-openxml-sdk-fuer-word-vorlagen.md), [0023](../adr/0023-zertifikatsvorlagen-in-postgresql-mit-versionen.md), [0024](../adr/0024-pruefung-hochgeladener-word-dateien.md), [0025](../adr/0025-coin-stammdaten-bearbeiten.md), [0026](../adr/0026-namespace-positivliste-fuer-word-dateien.md), [0019](../adr/0019-request-protokoll-ohne-personendaten.md)

## 1. Ziel
Zu jeder aktiven Ausgabe lädt ein Berechtigter (`issues.write`) das Echtheitszertifikat als DOCX herunter, befüllt aus der aktiven Vorlage des Coins mit den Daten der Ausgabe. Jede Ausgabe erhält bei der Erfassung eine unveränderliche Zertifikatsnummer, die unter den aktiven Ausgaben eindeutig ist. Der Auftrag steht wörtlich im Auftrag zu diesem Branch.

**Nicht dazu:** PDF, QR-Code, digitale Signatur, öffentliche Prüfseite, Sammel-/Serienausdruck, Archivierung erzeugter Dateien, Stornieren auf der neuen Ausgabe-Seite, Lese-Endpunkt für das Download-Audit (F9), Änderungen an der Eingabeprüfung von Ausgaben.

**Begriffe:**
- *(Rev. 2)* **Coin-Kennung:** `C` und eine laufende Nummer mit mindestens 4 Ziffern (`C0042`, ab 10.000 ungekürzt), per DB-Sequenz vergeben, unveränderlich (ADR-0027).
- *(Rev. 2)* **Zertifikatsnummer:** `<Kennung>-<Exemplar, mind. 4-stellig>`, z. B. `C0042-0012`. Eine Neuausgabe desselben Exemplars nach Storno erhält dieselbe Nummer (F2, ADR-0027 Punkt 5).
- **Story-Teile der Ersetzung:** Hauptteil, Kopf- und Fußzeilen, Fuß- und Endnoten (`OpcPaket.Geschichten()`, dieselben Teile wie die Platzhalterprüfung) – darin Tabellen, Textfelder, Inhaltssteuerelemente, Hyperlink-Texte, Feldergebnisse.
- **Zertifikatsfassung der Standardvorlage:** Standardvorlage ohne den Abschnitt „Erläuterung der Platzhalter“ (F7).

### 1.1 Einordnung: Anforderung „Zertifikate“
Zertifikatsvorlagen (umgesetzt) und dieses Feature bilden zusammen die Anforderung [„Zertifikate“](../requirements.md#zertifikate): **Vorlage → Nummer → Erzeugung → Download/Audit**, danach offen Signatur, PDF, QR-Code und Prüfseite.

| Schritt | Feature | Stand | Grundlage |
|---|---|---|---|
| 1. Vorlage je Coin (Standardvorlage, Upload mit Prüfung und Bereinigung, Versionen, aktive Vorlage, Zurücksetzen) | [zertifikatsvorlagen](zertifikatsvorlagen.md) | umgesetzt | ADR-0022 bis ADR-0026, Entscheidungen F1–F16 vom 2026-10-09/14/16 |
| 2. Zertifikatsnummer bei der Erfassung | dieses Feature | umgesetzt | ADR-0027, AK-1 bis AK-6 |
| 3. Erzeugung aus der aktiven Vorlage | dieses Feature | umgesetzt | ADR-0028, AK-7 bis AK-17 |
| 4. Download und Audit | dieses Feature | umgesetzt | ADR-0029, AK-18 bis AK-30 |
| 5.–7. Signatur, PDF, QR-Code/Prüfseite | – | offen | requirements, Abschnitt „Zertifikate“ |

Bezüge auf die Vorlagen-Entscheidungen: Die Erzeugung setzt voraus, dass gespeicherte Vorlagen nach F8 (keine nachverfolgten Änderungen), F9 (strenge Schreibweise), F10 (bereinigt), F13–F16 (Positivliste, keine SVG/Signaturzeilen) geprüft sind; sie prüft nicht erneut (A3). F6 (frühere Versionen nur herunterladen) bleibt: Erzeugt wird immer aus der **aktiven** Version (AK-8). F3 (Stammdatenänderungen ohne Audit) und ADR-0025 betreffen die Coin-Werte im Zertifikat (F6 dieses Entwurfs: immer aktueller Stand). Die Lücke aus zertifikatsvorlagen 4.1 („Formatierung und leere Felder legt das spätere Feature fest“) schließt Abschnitt 4.

### 1.2 Platzhalterkatalog
Der Katalog ([platzhalter.md](../platzhalter.md), `Coin.Domain.Vorlagen.Platzhalterkatalog`) enthält bereits alle für die Erzeugung nötigen Gruppen: `Coin.*`, `Exemplar.Nummer`, `Zertifikat.Nummer`, `Empfaenger.*`, `Ausgabe.*` (13 Einträge, Pflicht `Coin.Name`, `Exemplar.Nummer`, `Zertifikat.Nummer`, `Empfaenger.Name`). **Es kommt kein Platzhalter hinzu und keiner entfällt.** Änderungen:
- *(Rev. 2)* Spalte „Beispiel“ für `Zertifikat.Nummer`: „C0042-0012“ statt „wird beim Ausstellen vergeben“ (wirkt nur auf die Erläuterungstabelle der Standardvorlage und die Doku).
- `docs/platzhalter.md` erhält unterhalb der Markertabelle (Marker und Tabellenformat unverändert) einen Abschnitt „Beim Erzeugen“: Werte und Formate (Abschnitt 4), leere optionale Felder, Werte wörtlich ohne erneute Ersetzung, Orte der Ersetzung (AK-9), Grenze von 200 Vorkommen (AK-14).

**Bestehende Vorlagen bleiben gültig:** Namen, Schreibweise und Pflicht-Kennzeichen ändern sich nicht, also besteht jede gespeicherte Version die Platzhalterprüfung weiter. Die neue Grenze von 200 Vorkommen gilt nur für **neue** Uploads; gespeicherte Versionen werden nicht nachgeprüft und nicht verändert. Eine gespeicherte Version über der Grenze (praktisch nicht zu erwarten) bleibt herunterladbar, nur das Erzeugen antwortet `409 vorlage_zu_viele_platzhalter` (AK-14). Künftige Ergänzungen des Katalogs dürfen nur **optionale** Platzhalter hinzufügen; ein neuer Pflichtplatzhalter würde alle bestehenden Vorlagen ungültig machen und braucht eine eigene Entscheidung.

### 1.3 Entscheidungen des Auftraggebers (2026-10-16) *(Rev. 2)*
1. **F1 Coin-Kennung:** laufende Nummer `C` + mindestens 4 Ziffern (`C0042`), ab 10.000 ungekürzt; Vergabe per DB-Sequenz beim Anlegen, unveränderlich per Trigger, Lücken zulässig; Migration nach Anlagezeitpunkt. Dass die Kennung Anzahl und Reihenfolge der Coins verrät, ist akzeptiert. Nicht im öffentlichen DTO.
2. **F2 Wiederausgabe nach Storno:** gleiche Nummer erneut (`C0042-0012`). Eindeutig unter den **aktiven** Ausgaben (partieller Unique-Index), je Ausgabe unveränderlich, im Audit immer mit `ausgabe_id`. Bewusste Abweichung von „eindeutig“ aus Umfang Punkt 1; Restrisiko für die Prüfseite in ADR-0027 „Folgen“.
3. **F3** Exemplar über 9999: mindestens 4 Stellen, darüber ungekürzt.
4. **F4** Migration: alle bestehenden Ausgaben, auch stornierte, erhalten die Nummer ihres Exemplars (folgt aus F2).
5. **F5** Neue Seite der einzelnen Ausgabe mit `issues.read`, verlinkt über die Zertifikatsnummer.
6. **F6** Coin-Daten im Zertifikat: immer der aktuelle Stand.
7. **F7** Standardvorlage: im Zertifikat ohne „Erläuterung der Platzhalter“.
8. **F8** Leere optionale Felder ergeben leeren Text; in der Standardvorlage steht die Dienststelle in einem eigenen Absatz ohne Komma.
9. **F9** Kein Lese-Endpunkt für das Download-Audit.
10. **F10** Datum `TT.MM.JJJJ`, Exemplar und Auflage ohne Tausenderpunkt.
11. **F11** Höchstens 200 Platzhaltervorkommen je Vorlage (neue Uploads und Erzeugung).
12. **F12** Ausgabe-Seite mit `issues.read`, Download nur mit `issues.write`.

## 2. Ist-Stand (geprüft)
| Punkt | Stand | Folge |
|---|---|---|
| Coin-Kennung | `CoinTyp`: `Id` (GUID v7), Name/Herausgeber seit ADR-0025 änderbar; keine kurze Kennung | neue Spalte `coin_typ.kennung` mit Sequenz (ADR-0027) |
| Exemplare | Nr. 1 bis Auflage (≤ 1.000.000), stornierte Nummern werden wieder vergeben (ADR-0020 Punkt 7) | Neuausgabe übernimmt die Nummer (F2), mehr als 4 Stellen ab 10.000 (F3) |
| Ausgabe | `ausgabe` ohne Nummer; Trigger `trg_ausgabe_nur_storno` schützt alle Spalten außer Storno; `ux_ausgabe_exemplar_aktiv`; kein Einzelabruf (coin-ausgaben 5.1) | Spalte `zertifikatsnummer` mit partiellem Index, Trigger erweitert; `GET …/ausgaben/{ausgabeId}` neu (F5) |
| Platzhalter | 13 im `Platzhalterkatalog`, alle nötigen Gruppen vorhanden; Formatierung und leere Felder offen gelassen (zertifikatsvorlagen 4.1) | Werte und Formate in Abschnitt 4, Katalog unverändert (Abschnitt 1.2) |
| Prüfung | `Absatztexte` liest `w:t` je Absatz in Hauptteil, Kopf-/Fußzeilen, Fuß-/Endnoten; Glossar nicht; Zerlegung `{{` bis `}}` in `PlatzhalterPruefung` | Ersetzung nutzt dieselbe Sicht (ADR-0028 Punkt 1) |
| Standardvorlage | je Platzhalter genau ein Run, `{{Zertifikat.Nummer}}` auch in der Fußzeile, Zeile „Dienstgrad Name, Dienststelle“, danach Seitenumbruch und „Erläuterung der Platzhalter“ | Zertifikatsfassung ohne Erläuterung (F7), Dienststelle eigener Absatz (F8) |
| Downloads | `ZertifikatsvorlagenController.Download` setzt `nosniff`, CSP-Sandbox, `attachment`; `[KeinCache]`; CORS gibt `Content-Disposition` frei; Frontend `ladeDatei`, `speichereDatei` | gemeinsamer Download-Helfer in `Coin.Api/Http`, gleiche Frontend-Bausteine |
| Audit | `ausgabe_audit` (`art varchar(10)`), `vorlage_audit`; kein Lese-Endpunkt (F7 beider Features) | neue Tabelle `zertifikat_audit` (ADR-0029) |
| Fehler | `UseExceptionHandler` protokolliert unbehandelte Ausnahmen | Erzeugung fängt alle Ausnahmen selbst (AK-17) |
| Frontend | `AusgabenTabelle` (Render-Prop `aktion`), `AusgabenHistorie` (`darfStornieren` = `issues.write`), keine Seite für eine einzelne Ausgabe | neue Spalte „Zertifikat“, neue Seite (F5) |

## 3. Akzeptanzkriterien

### Coin-Kennung und Zertifikatsnummer (Backend, ADR-0027)
- **AK-1** *(Rev. 2)* Jeder Coin hat eine `kennung` im Format `C` + mindestens 4 Ziffern mit führenden Nullen (`C0001` … `C9999`, dann `C10000`). `POST /api/coins` vergibt sie per Sequenz `coin_kennung_seq`: `CoinKatalogService.AnlegenAsync` holt sie nach der Feldprüfung und **vor** der Duplikatprüfung über `ICoinKatalogRepository.KennungVergebenAsync` (`coin_kennung_neu()`, also `nextval`); der Spalten-Default `coin_kennung_neu()` mit `RETURNING` greift nur noch als Absicherung (z. B. Inserts per SQL). Ein mitgesendetes `kennung` wird ignoriert. Eindeutiger Index `ux_coin_typ_kennung`, Check `^C[0-9]{4,}$`. Lücken sind zulässig (Test: ein `409 coin_existiert` dazwischen verbraucht eine Nummer, der nächste Coin erhält die übernächste). Nacheinander angelegte Coins erhalten aufsteigende Kennungen. Test der Funktion mit Sequenzwert 9999 → `C9999`, 10000 → `C10000`. `PUT /api/coins/{id}` ändert sie nie. `CoinResponse` bleibt bei sieben Feldern.
- **AK-2** Die Kennung ist unveränderlich: Ein `UPDATE coin_typ SET kennung = …` per SQL scheitert (Trigger `trg_coin_typ_kennung_unveraenderlich`); Updates anderer Spalten (Stammdaten, `aktive_vorlage_version`, Auflage) gelingen weiter.
- **AK-3** *(Rev. 2)* `POST /api/coins/{id}/ausgaben` vergibt unter der Coin-Sperre die Zertifikatsnummer `<Kennung>-<Exemplar>` und gibt sie in der Antwort zurück (`zertifikatsnummer`, Abschnitt 5.3); ein mitgesendetes Feld wird ignoriert. Exemplar mit mindestens 4 Ziffern und führenden Nullen: Nr. 1 → `C0042-0001`, Nr. 9999 → `…-9999`, Nr. 10000 → `…-10000`, Nr. 1000000 → `…-1000000` (F3).
- **AK-4** *(Rev. 2)* Eindeutigkeit und Unveränderlichkeit in der DB: partieller eindeutiger Index `ux_ausgabe_zertifikatsnummer_aktiv ON ausgabe (zertifikatsnummer) WHERE storniert_am IS NULL` (zweites `INSERT` einer **aktiven** Ausgabe mit gleicher Nummer per SQL → `23505`; dieselbe Nummer bei einer stornierten und einer aktiven Ausgabe → zulässig). `UPDATE ausgabe SET zertifikatsnummer = …` scheitert, auch zusammen mit einem Storno (Trigger). Verletzt ein Insert einen der beiden partiellen Indizes trotz Sperre, antwortet die API `409 exemplar_ausgegeben`, nie `500`.
- **AK-5** *(Rev. 2)* Zwei Ausgaben desselben Coins (verschiedene Exemplare) erhalten verschiedene Nummern. Das Storno einer Ausgabe ändert die Nummer keiner anderen Ausgabe; die stornierte Ausgabe behält ihre Nummer. **Neuausgabe nach Storno:** Wird das stornierte Exemplar erneut ausgegeben, erhält die neue Ausgabe **dieselbe** Nummer (`C0042-0012`); beide Ausgaben stehen mit dieser Nummer in der Historie, unterscheidbar über `id` und Status. K parallele Erfassungen „nächste freie“ ergeben K verschiedene Nummern.
- **AK-6** *(Rev. 2)* Migration `Zertifikatsnummern`: Bestehende Coins erhalten Kennungen nach `erstellt_am`, dann `id` (`C0001`, `C0002`, …); die Sequenz steht danach auf dem höchsten Wert (der nächste neue Coin erhält die folgende Nummer). Jede bestehende Ausgabe, auch stornierte, erhält `<Kennung>-<Exemplar>` (F4). Integrationstest: DB vor der Migration mit zwei Coins (A älter als B); bei A Exemplar 3 ausgegeben und storniert, dann erneut ausgegeben, Exemplar 5 aktiv → A = `C0001`, B = `C0002`; Nummern `C0001-0003` (zweimal, eine storniert), `C0001-0005`; danach `NOT NULL`, Indizes und Trigger wirksam, ein neuer Coin erhält `C0003`. Gespeicherte Vorlagen und `vorlage_audit` bleiben unverändert.

### Erzeugung (Backend, ADR-0028)
- **AK-7** `GET /api/coins/{id}/ausgaben/{ausgabeId}/zertifikat` (`issues.write`) liefert `200` mit einem DOCX. Header wie zertifikatsvorlagen AK-6: `Content-Type` DOCX, `Content-Disposition: attachment; filename="Zertifikat_<Zertifikatsnummer>.docx"` (nur ASCII, z. B. `Zertifikat_C0042-0012.docx`), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: no-store`; `Access-Control-Expose-Headers: Content-Disposition` bei Anfragen vom `Frontend:Ursprung`.
- **AK-8** Quelle ist die zum Zeitpunkt des Requests aktive eigene Vorlage des Coins, sonst die Zertifikatsfassung der Standardvorlage (F7). Zeiger und Inhalt werden in einer Abfrage gelesen. Wird die Vorlage später ersetzt oder zurückgesetzt, nutzt der nächste Download die dann aktive; Zertifikatsnummer und Ausgabedaten bleiben gleich. Die gespeicherte Vorlage bleibt byte-gleich (SHA-256 in der DB und Versions-Download vor/nach dem Erzeugen gleich).
- **AK-9** Ersetzt wird in allen Story-Teilen (Abschnitt 1), auch in verschachtelten Tabellen, in Textfeldern (in `mc:Choice` und `mc:Fallback`), in `w:sdt`, in Hyperlink-Texten und Feldergebnissen. Nicht verändert werden `w:instrText`, das Glossar, Attribute (Alternativtext, `w:alias`, `w:tag`), Beziehungen und `docProps`. Die Erläuterungstabelle (Namen ohne Klammern) bleibt unverändert.
- **AK-10** Über mehrere Runs verteilte Platzhalter (auch über Lesezeichen, Rechtschreibmarken, Hyperlink- und `w:sdt`-Grenzen hinweg, solange sie die Prüfung als einen Platzhalter liest) werden ersetzt. Der Wert steht im Run des ersten `{` und trägt dessen `w:rPr` (Test: erster Run fett und rot, zweiter Run kursiv → Wert fett und rot, nicht kursiv). Text vor und nach dem Platzhalter und in anderen Runs bleibt mit seiner Formatierung erhalten.
- **AK-11** Werte werden als Text eingefügt (ADR-0028 Punkt 5):
  - XML-Sonderzeichen (`& < > " '`), Umlaute, `ß`, `€`, Emoji und Zeichen außerhalb der BMP erscheinen unverändert im Word-Text;
  - `\r\n`, `\r`, `\n`, U+0085, U+2028, U+2029 → je ein `w:br`; `\t` → `w:tab`; in XML 1.0 unzulässige Zeichen werden entfernt, einzelne Surrogate werden U+FFFD; das Dokument bleibt wohlgeformt;
  - führende, folgende und mehrfache Leerzeichen bleiben erhalten (`xml:space="preserve"`);
  - keine Kürzung (Begründung mit 2.000 Zeichen vollständig);
  - **keine erneute Ersetzung:** Ein Wert `{{Coin.Name}}` oder `{{Zertifikat.Nummer}}` (z. B. als Empfängername oder Begründung) steht wörtlich im Ergebnis.
- **AK-12** Werte und Formate nach Abschnitt 4. Leere optionale Felder ergeben leeren Text; der Platzhalter verschwindet (F8). Ein Unit-Test stellt sicher, dass für jeden Eintrag des `Platzhalterkatalog` ein Wert gebildet wird. *(Rev. 2)* Standardvorlage (F8): Der Absatz „{{Empfaenger.Dienstgrad}} {{Empfaenger.Name}}, {{Empfaenger.Dienststelle}}“ wird zu „{{Empfaenger.Dienstgrad}} {{Empfaenger.Name}}“ und einem eigenen Absatz „{{Empfaenger.Dienststelle}}“ ohne Komma; sonst bleiben zertifikatsvorlagen AK-2 bis AK-5 erfüllt (alle Platzhalter, je einer in genau einem Run, eigene Prüfung ohne Befund).
- **AK-13** Ergebnis: In keinem Story-Teil steht danach ein Platzhalter aus der Vorlage (Prüfung über die Absatztexte: keine Fundstelle eines Katalognamens außer solchen, die aus eingesetzten Werten stammen). Alle anderen ZIP-Einträge sind byte-gleich zur Vorlage und stehen in derselben Reihenfolge. `OpenXmlValidator` meldet keine Fehler, die die Vorlage nicht schon hatte. `docProps` enthalten keine Werte der Ausgabe.
- **AK-14** Grenze 200 Platzhaltervorkommen je Dokument (alle Story-Teile zusammen): darüber `409` `vorlage_zu_viele_platzhalter` (Abschnitt 5.2), kein Audit. Neue Uploads von Vorlagen mit mehr als 200 Vorkommen werden abgelehnt (`400 datei`: „Die Vorlage enthält mehr als 200 Platzhalter. Bitte die Anzahl verringern.“, nach den bisherigen Platzhaltermeldungen; F11); gespeicherte Versionen bleiben unverändert (Abschnitt 1.2). Die Standardvorlage liegt deutlich darunter.
- **AK-15** Verarbeitung nur im Speicher (ADR-0028 Punkt 6/7): keine Temp-Dateien, kein Dateisystemzugriff, kein Output-/Response-Caching. Ein Code-Test (Muster `KonfigurationsdateienTests`) stellt sicher, dass `Coin.Domain/Zertifikate` und `Coin.Infrastructure/Zertifikate` weder `System.IO.File`, `FileStream`, `Path.GetTempPath`/`GetTempFileName` noch `System.IO.Packaging` verwenden.
- **AK-16** Höchstens 2 Erzeugungen gleichzeitig je Prozess (Singleton); eine dritte wartet; Abbruch des Requests beendet das Warten (`CancellationToken`).
- **AK-17** Jede Ausnahme beim Lesen der Vorlage oder Schreiben des Ergebnisses (auch: der Erzeuger wirft) → `500` mit `title` „Zertifikat nicht möglich“ und `code` `zertifikat_fehler` (Abschnitt 5.2), kein Audit, genau eine Protokollzeile der Stufe `Warning` mit fester EventId, deren `EventId.Name` `ZertifikatErzeugungFehlgeschlagen` ist, und fester Meldung, ohne Ausnahmetext und Stacktrace (keine `Exception` am Log-Eintrag). Der `UseExceptionHandler` protokolliert in diesem Fall nichts zusätzlich.

### Fehler, Rechte, Audit
- **AK-18** Fehler und Reihenfolge: `401` → `403` → `404` „Ausgabe nicht gefunden“ (Coin unbekannt, Ausgabe unbekannt oder zu einem anderen Coin, keine GUID) → `409 ausgabe_storniert` → `409 vorlage_zu_viele_platzhalter` → `500`. Texte wörtlich nach Abschnitt 5.2, ohne Personendaten. *(Rev. 2)* Bei einem Exemplar mit stornierter und aktiver Ausgabe gleicher Nummer: Download der stornierten (`ausgabeId` der stornierten) → `409`, der aktiven → `200`.
- **AK-19** Rechte je Rolle (Integrationstest als Theory):

  | Endpunkt | Administrator | Sachbearbeiter | Betrachter | keine Rolle | deaktiviert | anonym |
  |---|---|---|---|---|---|---|
  | `GET …/ausgaben/{ausgabeId}/zertifikat` | 200 | 200 | 403 | 403 | 403 | 401 |
  | `GET …/ausgaben/{ausgabeId}` | 200 | 200 | 403 | 403 | 403 | 401 |

  `403` kommt vor `404` (unbekannte Id ohne Recht → `403`). Kein `403`-Body enthält Werte der Ausgabe.
- **AK-20** *(Rev. 2)* Jeder erfolgreiche Download schreibt genau einen Eintrag in `zertifikat_audit` (`zeitpunkt`, `akteur_id`, **`ausgabe_id`**, `coin_id`, `zertifikatsnummer`, `vorlage_version` – `NULL` bei Standardvorlage –, `art` `Heruntergeladen`); zwei Downloads → zwei Einträge. Nach Storno und Neuausgabe desselben Exemplars haben Downloads der alten und der neuen Ausgabe dieselbe Nummer, aber verschiedene `ausgabe_id`. Einfügen und Storno-Prüfung sind atomar (ADR-0029 Punkt 4): Wird die Ausgabe zwischen Laden und Audit storniert → `409 ausgabe_storniert`, keine Datei. Abgelehnte Requests schreiben nichts. Keine Empfängerdaten, keine Dateiinhalte (Suche nach eindeutigen Testwerten in allen Spalten). `UPDATE`/`DELETE` per SQL scheitern (Trigger). Kein Lese-Endpunkt (F9).
- **AK-21** Logs enthalten weder Werte der Ausgabe noch Coin-Daten, Zertifikatsnummer oder Dateiinhalte; Request-Protokoll nur mit Routen-Template (`/api/coins/{id}/ausgaben/{ausgabeId}/zertifikat`). Integrationstest (Muster `LogTests`): Download mit eindeutigen Werten in allen Feldern, Download einer stornierten Ausgabe, Erzeugung mit Testersatz, der eine Ausnahme mit eindeutigem Text wirft → keiner der Werte, kein Ausnahmetext, kein Stacktrace im Log; die Warnung aus AK-17 ist vorhanden. `ZertifikatWerte` und Ergebnisobjekte überschreiben `ToString()` ohne Werte.
- **AK-22** `GET /api/coins/{id}/ausgaben/{ausgabeId}` (`issues.read`) liefert die Ausgabe im Format aus Abschnitt 5.3 (aktiv oder storniert); `404` „Ausgabe nicht gefunden“ wie AK-18; `Cache-Control: no-store` (F5).
- **AK-23** `docs/berechtigungen.md` nach Abschnitt 5.4; `EndpunktTabelleTests`, `EndpunktInventarTests`, `BerechtigungsDokuTests` grün (nur erwartete Daten ergänzt).

### Frontend
- **AK-24** Ausgabehistorie (Detailseite, `issues.read`): neue Spalte „Zertifikat“ vor „Status“. Sie zeigt die Zertifikatsnummer als Router-`Link` zur Ausgabe-Seite (AK-27) und, nur mit `issues.write`, den Button „Zertifikat herunterladen“. *(Rev. 2)* Weil eine Nummer nach Storno zweimal vorkommen kann, nennen die zugänglichen Namen zusätzlich den Status: Link „Ausgabe {Nummer} anzeigen“ bzw. „Stornierte Ausgabe {Nummer} anzeigen“, Button `aria-label` „Zertifikat {Nummer} herunterladen“. Bei stornierten Ausgaben ist der Button vorhanden, aber gesperrt (umgesetzt per `aria-disabled`, fokussierbar, Abschnitt 12), mit `aria-label` „Zertifikat {Nummer} herunterladen (nicht möglich, Ausgabe storniert)“. Ohne `issues.write` gibt es keinen Button. Die Spalte gehört zur Render-Prop `zertifikat` der `AusgabenTabelle` (Abschnitt 7): Ohne diese Prop rendert `AusgabenTabelle` weder Spaltenkopf noch Zellen „Zertifikat“ (bisherige Spalten unverändert); `AusgabenHistorie` übergibt sie immer.
- **AK-25** *(Rev. 2)* Download: per `fetch` mit Token (`ladeDatei`), nie mit Token in der URL; der Button ist währenddessen gesperrt. Dateiname aus `Content-Disposition`, nur wenn er `^Zertifikat_C[0-9]{4,}-[0-9]{4,7}\.docx$` entspricht, sonst `Zertifikat_{zertifikatsnummer}.docx` aus den geladenen Daten (wenn die Nummer nicht `^C[0-9]{4,}-[0-9]{4,7}$` entspricht: `Zertifikat.docx`). Speichern über `speichereDatei` (Object-URL nach 40 s freigegeben).
- **AK-26** Fehler beim Download als `role="alert"` beim Button, als Text: `409 ausgabe_storniert` → „Diese Ausgabe wurde inzwischen storniert. Ein Zertifikat kann nicht mehr heruntergeladen werden.“, danach lädt die Historie bzw. die Seite neu; `409 vorlage_zu_viele_platzhalter` → Text aus `detail`; `403`/`401` → bestehende Texte; sonst „Das Zertifikat konnte nicht heruntergeladen werden. Bitte später erneut versuchen.“ Der Fokus bleibt auf dem Button.
- **AK-27** Neue Seite „Ausgabe“ `/coins/$coinId/ausgaben/$ausgabeId` (`ROUTEN.ausgabeDetail`), `beforeLoad: erfordertBerechtigung('issues.read')`: anonym → Anmeldung mit Rückkehrziel; deaktiviert/ohne Rolle → `/kein-zugriff`; Betrachter → `/kein-zugriff?grund=berechtigung`. Ist `coinId` **oder** `ausgabeId` keine GUID → „Ausgabe nicht gefunden“ ohne API-Aufruf (weder Coin noch Ausgabe wird geladen), `404` ebenso. `/coins/$coinId/ausgaben/neu` bleibt die Erfassen-Seite.
- **AK-28** Inhalt: `h1` „Ausgabe von Exemplar Nr. {n}“, darunter der Coin-Name als Link zur Detailseite. `<dl>` mit „Zertifikatsnummer“, „Empfänger“, „Dienstgrad“, „Dienststelle“ (nur wenn vorhanden), „Datum“, „Gelegenheit“, „Begründung“ (Zeilenumbrüche sichtbar, `whitespace-pre-line`), „Ausgebende Stelle“, „Erfasst“ (Name, Datum), „Status“ (wie in der Historie). Mit `issues.write` Button „Zertifikat herunterladen“ (AK-25, AK-26); bei stornierter Ausgabe gesperrt (`aria-disabled`, fokussierbar) und darunter „Für stornierte Ausgaben kann kein Zertifikat heruntergeladen werden.“ (per `aria-describedby` verbunden). Link „Zurück zum Coin“. Laden `role="status"` „Ausgabe wird geladen …“, Fehler `role="alert"` „Die Ausgabe konnte nicht geladen werden. Bitte später erneut versuchen.“ Alle Werte als Text, nie als HTML.
- **AK-29** Ohne `issues.write` (Betrachter, anonym, ohne Rolle, deaktiviert) gibt es nirgends einen Zertifikat-Button und keinen Request auf `…/zertifikat`; ohne `issues.read` keinen Request auf `…/ausgaben…`.
- **AK-30** Barrierefreiheit (WCAG 2.1 AA / BITV) auf Detailseite und Ausgabe-Seite: genau ein `h1`; Link und Button je Zeile per Tastatur in Zeilenreihenfolge erreichbar, sichtbarer Fokus (`focus-visible`); zugängliche Namen nach AK-24/AK-28; Sperrzustand und Storno nicht nur über Farbe; Fehler per `role="alert"`; alle Texte deutsch inkl. `aria-label`, `sr-only`, Captions (Englisch-Prüfung der bestehenden Tests läuft für beide Seiten).
- **AK-31** FSD nach Abschnitt 7, `npm run lint` (ESLint + Steiger) ohne Befund, keine Querimporte, Seiten ohne Router-Hooks. Keine neue shadcn-Komponente nötig.

### Doku und Abschluss
- **AK-32** *(Rev. 2)* Platzhalterkatalog nach Abschnitt 1.2: 13 Einträge unverändert in Name, Pflicht und Reihenfolge; Beispiel für `Zertifikat.Nummer` „C0042-0012“ in Code und `docs/platzhalter.md`; dort neuer Abschnitt „Beim Erzeugen“ außerhalb der Marker. `PlatzhalterDokuTests` grün. Ein Integrationstest legt vor der Migration eine Vorlage an und erzeugt danach daraus ein Zertifikat.
- **AK-33** Systemtest `e2e/tests/zertifikat-erzeugen.spec.ts` (Abschnitt 8). `dotnet build` ohne Warnungen, `dotnet test`, `npm test`, `npm run test:ui`, `npm run lint`, `npm run build`, `npx playwright test` in `e2e/` grün; Doku nach Abschnitt 9.

## 4. Werte und Formate (F6, F8, F10)
| Platzhalter | Quelle | Format |
|---|---|---|
| `Coin.Name`, `Coin.Herausgeber` | aktueller Coin (F6) | Text |
| `Coin.Beschreibung` | aktueller Coin | Text, Zeilenumbrüche → `w:br`; `null` → leer |
| `Coin.Auflage` | aktueller Coin | Ziffern ohne Tausenderpunkt (`1500`); `null` → leer (kommt bei Ausgaben nicht vor) |
| `Exemplar.Nummer` | Ausgabe | Ziffern ohne führende Nullen und Tausenderpunkt (`12`) |
| `Zertifikat.Nummer` | Ausgabe | gespeicherte Nummer (`C0042-0012`) |
| `Empfaenger.Name` | Ausgabe | Text |
| `Empfaenger.Dienstgrad`, `Empfaenger.Dienststelle` | Ausgabe | Text; `null` → leer |
| `Ausgabe.Datum` | Ausgabe | `TT.MM.JJJJ` (`01.10.2026`) |
| `Ausgabe.Gelegenheit`, `Ausgabe.Begruendung`, `Ausgabe.AusgebendeStelle` | Ausgabe | Text, Zeilenumbrüche → `w:br` |

## 5. API

### 5.1 Endpunkte
| Methode | Pfad | Zugang | Antwort |
|---|---|---|---|
| `GET` | `/api/coins/{id}/ausgaben/{ausgabeId}` | `issues.read` | `200` Ausgabe, `404` |
| `GET` | `/api/coins/{id}/ausgaben/{ausgabeId}/zertifikat` | `issues.write` | `200` DOCX, `404`, `409`, `500` |
| `POST` | `/api/coins/{id}/ausgaben` (geändert) | `issues.write` | wie bisher, Antwort mit `zertifikatsnummer` |
| `GET` | `/api/coins/{id}/ausgaben`, `POST …/storno` (geändert) | wie bisher | Einträge mit `zertifikatsnummer` |
| `POST` | `/api/coins/{id}/zertifikatsvorlage/versionen` (geändert) | `coins.write` | zusätzliche `400`-Meldung (AK-14) |

`{id}`/`{ausgabeId}` als GUID, sonst `404`. Beide neuen Endpunkte `[KeinCache]`. Keine Request-Bodys, kein `[Inhaltstyp]`.

### 5.2 Fehler (ProblemDetails, `title` „Zertifikat nicht möglich“ für alle `409` und die `500`, nur `404` abweichend)
| Status | `title` | `code` | `detail` |
|---|---|---|---|
| `404` | „Ausgabe nicht gefunden“ | – | – |
| `409` | „Zertifikat nicht möglich“ | `ausgabe_storniert` | „Für eine stornierte Ausgabe kann kein Zertifikat heruntergeladen werden.“ |
| `409` | „Zertifikat nicht möglich“ | `vorlage_zu_viele_platzhalter` | „Die aktive Vorlage enthält mehr als 200 Platzhalter. Bitte eine angepasste Vorlage hochladen.“ |
| `500` | „Zertifikat nicht möglich“ | `zertifikat_fehler` | „Das Zertifikat konnte nicht erzeugt werden. Bitte später erneut versuchen.“ |

### 5.3 Format Ausgabe (ergänzt)
```json
{ "id": "…", "exemplarNummer": 12, "zertifikatsnummer": "C0042-0012",
  "empfaenger": { "name": "…", "dienstgrad": null, "dienststelle": null }, "datum": "2026-10-01", "…": "…", "storno": null }
```

### 5.4 `docs/berechtigungen.md`
Rechtematrix (Haken unverändert): `issues.write` „Ausgaben erfassen und stornieren, Zertifikate herunterladen“; `issues.read` „Ausgaben mit Empfängerdaten lesen (Liste und Einzelansicht)“. Endpunkttabelle (Routen ohne Constraint, `{id}`/`{ausgabeId}` wie im Routen-Template des Controllers):
```
| `GET /api/coins/{id}/ausgaben`, `GET /api/coins/{id}/ausgaben/{ausgabeId}` | `issues.read` |
| `POST /api/coins/{id}/ausgaben`, `POST /api/coins/{id}/ausgaben/{ausgabeId}/storno`, `GET /api/coins/{id}/ausgaben/{ausgabeId}/zertifikat` | `issues.write` |
```
Eingetragen am 2026-10-17.

### 5.5 Backend-Schnitt
- **Domain** `Coin.Domain.Katalog`: `CoinKennung` (Muster `^C[0-9]{4,}$`, Formatierung aus einer Zahl), `CoinTyp.Kennung` (nach dem Speichern gesetzt bzw. beim Wiederherstellen geladen). `Coin.Domain.Ausgaben`: `Ausgabe.Zertifikatsnummer`, `ICoinSperre` liefert `Kennung`. `Coin.Domain.Zertifikate` (neu): `Zertifikatsnummer.Bilden(kennung, exemplar)`, `ZertifikatWerte.Aus(coin, ausgabe)` (Abschnitt 4), `PlatzhalterErsetzung` (reine Textlogik, ADR-0028 Punkt 2), Port `IZertifikatErzeuger` (Vorlagen-Bytes + Werte → `Erzeugt(bytes)` | `ZuVielePlatzhalter` | `Fehlgeschlagen`), `ZertifikatService.HerunterladenAsync(coinId, ausgabeId, akteurId)`, `IZertifikatRepository` (Ausgabe + Coin + aktive Vorlage in einer Abfrage; Audit-Insert mit Storno-Bedingung). `PlatzhalterPruefung` um die Grenze aus AK-14.
- **Infrastructure** `Zertifikate/ZertifikatErzeuger` (Singleton, `SemaphoreSlim(2)`, ZipArchive + XDocument, gemeinsamer Absatz-Durchlauf mit `Absatztexte`), `StandardvorlageErzeuger` + `Zertifikatsfassung` und Dienststellen-Absatz (F8), `ZertifikatRepository`, Konfigurationen, Migration `Zertifikatsnummern` (Sequenz, Funktion, Kennungen, Nummern, Indizes, Trigger, `zertifikat_audit`), `CoinKatalogRepository.KennungVergebenAsync` (Vergabe vor der Duplikatprüfung) und als Absicherung `RETURNING` des Spalten-Defaults; Übersetzung `23505` auf `ux_ausgabe_zertifikatsnummer_aktiv` → `ExemplarAusgegeben` im `AusgabeRepository`.
- **API** `GET …/{ausgabeId}` im `AusgabenController`; `ZertifikateController` (`GET api/coins/{id:guid}/ausgaben/{ausgabeId:guid}/zertifikat`); Download-Härtung als gemeinsamer Helfer in `Coin.Api/Http` (auch vom `ZertifikatsvorlagenController` genutzt); `ZertifikatProtokoll` (Warnung, Muster `VorlagenProtokoll`, EventId-Name `ZertifikatErzeugungFehlgeschlagen`). Keine Logik im Controller.

## 6. Datenmodell *(Rev. 2)*
```
coin_kennung_seq  SEQUENCE (neu), Funktion coin_kennung_neu() → 'C' + mind. 4 Ziffern
coin_typ          + kennung varchar(12) NOT NULL DEFAULT coin_kennung_neu(), CHECK (kennung ~ '^C[0-9]{4,}$'),
                    UNIQUE ux_coin_typ_kennung, TRIGGER trg_coin_typ_kennung_unveraenderlich
ausgabe           + zertifikatsnummer varchar(32) NOT NULL,
                    UNIQUE ux_ausgabe_zertifikatsnummer_aktiv (zertifikatsnummer) WHERE storniert_am IS NULL
                    trg_ausgabe_nur_storno: zertifikatsnummer in die unveränderlichen Spalten
zertifikat_audit  PK id (uuid v7), zeitpunkt timestamptz NOT NULL, akteur_id uuid NOT NULL FK benutzer RESTRICT,
  (neu)             ausgabe_id uuid NOT NULL FK ausgabe RESTRICT, coin_id uuid NOT NULL, zertifikatsnummer varchar(32) NOT NULL,
                    vorlage_version int NULL, art varchar(15) NOT NULL CHECK (art = 'Heruntergeladen'),
                    INDEX ix_zertifikat_audit_ausgabe, TRIGGER trg_zertifikat_audit_unveraenderlich
```
Migration nach ADR-0027 Punkt 6. `ausgabe_audit`, `zertifikat_vorlage` und `vorlage_audit` bleiben unverändert. `TRUNCATE`-Liste der Testbasis um `zertifikat_audit` (die Sequenz wird von `TRUNCATE` nicht zurückgesetzt; Tests erwarten keine festen Kennungen außer im Migrationstest).

## 7. Frontend (FSD, Public API je `index.ts`)
```
shared/config/routen.ts            + ausgabeDetail: '/coins/$coinId/ausgaben/$ausgabeId'
shared/api, shared/lib/datei.ts    unverändert (ladeDatei, speichereDatei)
shared/ui                          unverändert (button, table, badge, card)
entities/ausgabe/                  model/types.ts: Ausgabe + zertifikatsnummer; api/ausgaben.ts: + ladeAusgabe(coinId, ausgabeId);
                                   ui/AusgabenTabelle.tsx: Spalte „Zertifikat“ über Render-Prop zertifikat?: (a) => ReactNode
                                   (ohne Prop keine Spalte, AK-24);
                                   ui/AusgabeDetails.tsx (dl nach AK-28) · index.ts
features/zertifikat-herunterladen/ api/ladeZertifikat.ts (ladeDatei auf …/zertifikat), model/zertifikatDateiname.ts (Muster
  (neu)                            und Rückfall, AK-25), ui/ZertifikatHerunterladen.tsx (Props { coinId, ausgabe, variante:
                                   'zeile' | 'seite', onStorniertErkannt? }; Button, Sperre, Alarm) · index.ts
widgets/ausgaben-historie/         Prop darfZertifikat; rendert Link (ROUTEN.ausgabeDetail) + ZertifikatHerunterladen;
                                   onStorniertErkannt → Historie neu laden
pages/coin-detail/                 reicht darfZertifikat = issues.write an das Widget
pages/ausgabe-detail/ (neu)        AusgabeDetailSeite { coinId, ausgabeId, darfZertifikat }: lädt Coin (Name) und Ausgabe,
                                   h1, AusgabeDetails, ZertifikatHerunterladen, „Zurück zum Coin“ · index.ts
app/router/                        ausgabeDetailRoute (beforeLoad erfordertBerechtigung('issues.read')), routen-komponenten:
                                   AusgabeDetailRoute (Berechtigungen aus /api/me)
```
Importrichtung: `pages/*` → `widgets/ausgaben-historie`, `features/zertifikat-herunterladen` → `entities/ausgabe` → `shared`. Kein Querimport zwischen `features/zertifikat-herunterladen` und `features/ausgabe-stornieren`. Sidebar unverändert („Katalog“ ist auf `/coins/…` aktiv).

## 8. Testplan
| Ebene | Inhalt |
|---|---|
| xUnit Unit | *(Rev. 2)* `CoinKennung` (Formatierung 1 → `C0001`, 9999 → `C9999`, 10000 → `C10000`; Muster lehnt `C001`, `c0001`, `X0001`, `C0001 ` ab); `Zertifikatsnummer.Bilden` (1 → `-0001`, 9999, 10000, 1000000; gleiches Exemplar → gleiche Nummer); `ZertifikatWerte` (alle 13 Katalognamen belegt, Datum `TT.MM.JJJJ`, Zahlen ohne Trennzeichen, `null` → leer, aktuelle Coin-Daten); `PlatzhalterErsetzung` (Platzhalter in einem Segment, über 2/3/5 Segmente, mehrere je Absatz, Wert mit `{{Coin.Name}}` und `{{` bleibt wörtlich, `{{{Coin.Name}}` wie Prüfung, unbekannter Platzhalter unverändert, leerer Wert, Umbruch-/Tab-Bausteine für `\r\n`, `\r`, `\n`, U+2028, ungültige XML-Zeichen entfernt, einzelnes Surrogat → U+FFFD, Zählung der Vorkommen und Grenze 200, Laufzeit: 200 Vorkommen mit je 2.000 Zeichen unter 1 s); `PlatzhalterPruefung` mit 200/201 Vorkommen; `Platzhalterkatalog` (13 Einträge, Namen und Pflicht unverändert, neues Beispiel); `AusgabeService.ErfassenAsync` mit Fakes (Nummer aus Kennung und Exemplar); `ZertifikatService` mit Fakes (Reihenfolge der Ergebnisse, Audit nur bei Erfolg); Code-Test AK-15; `Rechtematrix`/`BerechtigungsDokuTests`; `PlatzhalterDokuTests`. |
| xUnit Integration (Testcontainers) | **Testdateien im Test erzeugt.** `Zertifikate/ZertifikatErzeugenTests` über die API (Upload der Testvorlage, Ausgabe erfassen, Download): Vorlage mit **jedem** Platzhalter im Fließtext, in einer (verschachtelten) Tabelle, in Kopf- und **Fußzeile**, Fuß- und Endnote, Textfeld (Word-Form mit `mc:Choice`/`mc:Fallback`), `w:sdt`, Hyperlink-Text, über Runs verteilt mit unterschiedlicher Formatierung → kein Katalog-Platzhalter mehr in den Absatztexten, alle Werte vorhanden, Formatierung nach AK-10, `OpenXmlValidator` ohne neue Fehler, übrige Einträge byte-gleich, Vorlage in der DB unverändert, Glossar und `w:instrText` unverändert; **Sonderzeichen**: Name `Jürgen Öztürk-Weiß & <Söhne> "Ä" 'ß' € 😀`, Begründung mit `\r\n`, `\n`, `\t`, `\u0001` und 2.000 Zeichen, Gelegenheit `{{Coin.Name}}` → wörtlich, `w:br`/`w:tab` an den Stellen, Steuerzeichen entfernt, Datei mit `WordprocessingDocument.Open` lesbar; Standardvorlage ohne eigene Vorlage (Zertifikatsfassung ohne Erläuterung; ohne Dienstgrad und Dienststelle kein „, “ im Ergebnis); Vorlage ersetzen → nächster Download aus v2, Nummer gleich; Zurücksetzen → Standard; vor der Migration gespeicherte Vorlage → Zertifikat erzeugbar (AK-32); 201 Vorkommen per direkt eingefügter Version → `409`; Upload mit 201 → `400`. *(Rev. 2)* `Zertifikate/ZertifikatsnummerTests`: Kennung per Sequenz, aufsteigend, Lücke nach `409 coin_existiert`, Kennung unveränderlich (SQL), `PUT /api/coins/{id}` mit `kennung` ignoriert; zwei Ausgaben verschiedener Exemplare → verschiedene Nummern; Storno einer anderen Ausgabe ändert keine Nummer; **Neuausgabe nach Storno erhält dieselbe Nummer** (Historie zeigt zwei Einträge mit `C…-0012`, einer storniert); SQL: zweite **aktive** Ausgabe mit gleicher Nummer → `23505`, stornierte + aktive mit gleicher Nummer → zulässig, `UPDATE zertifikatsnummer` → scheitert; parallele Erfassung „nächste freie“ → verschiedene Nummern; Migration (AK-6). `Zertifikate/ZertifikatDownloadTests`: Header (AK-7), Dateiname, storniert → `409` ohne Audit, *(Rev. 2)* stornierte und aktive Ausgabe gleicher Nummer → `409` bzw. `200`, unbekannt/fremder Coin/keine GUID → `404`, Rollentest (AK-19), Audit (AK-20, inkl. `vorlage_version`, *(Rev. 2)* gleiche Nummer mit verschiedenen `ausgabe_id` nach Neuausgabe, Trigger per SQL, Suche nach Testwerten), Storno zwischen Laden und Audit (Testersatz für das Repository oder SQL im Test), Erzeuger-Ersatz wirft → `500` (`title`/`code` nach 5.2) ohne Audit, genau eine Warnung mit EventId-Name `ZertifikatErzeugungFehlgeschlagen` (AK-17), Begrenzung auf 2 gleichzeitige Erzeugungen; `GET …/{ausgabeId}` (AK-22). `Vorlagen/StandardvorlageTests` angepasst (Dienststelle eigener Absatz, Beispiel „C0042-0012“ in der Erläuterungstabelle). `LogTests` erweitert (AK-21). Anzupassen: `EndpunktTabelleTests` (neue Pfade), `TRUNCATE`-Liste, bestehende Ausgabe-Tests, die die Antwort feldweise vergleichen (`zertifikatsnummer`), Tests mit SQL-Inserts in `coin_typ`/`ausgabe` (Pflichtspalte `zertifikatsnummer`; `kennung` hat einen Default). |
| Vitest | `ladeAusgabe`, `ladeZertifikat` (Token, 409-Codes, `konfliktDetail`); *(Rev. 2)* `zertifikatDateiname` (gültiger Header `Zertifikat_C0042-0012.docx` und `Zertifikat_C10000-12345.docx`, `../x.docx`, `Zertifikat_a.exe`, `Zertifikat_C0042-0012-2.docx`, fehlend → Rückfall; ungültige Nummer → `Zertifikat.docx`); `ZertifikatHerunterladen` (Sperre während Download, `disabled` bei Storno mit Label nach AK-24, Alarmtexte AK-26, Fokus bleibt, `onStorniertErkannt`); `AusgabenTabelle` (Spalte „Zertifikat“ nur mit Prop `zertifikat`, ohne Prop keine Spalte, Nummer als Text, *(Rev. 2)* zwei Zeilen mit gleicher Nummer: Link-Namen „Ausgabe … anzeigen“ und „Stornierte Ausgabe … anzeigen“); `AusgabenHistorie` (Button nur mit `darfZertifikat`, Link-Ziel mit `ausgabeId`, Neuladen nach 409); `AusgabeDetails` (alle Felder, optionale fehlen, Text statt HTML, Zeilenumbrüche); `AusgabeDetailSeite` (keine GUID in `coinId` oder `ausgabeId` ohne Request, 404, Laden/Fehler, Button nur mit `issues.write`); `App.*.test.tsx`: Guard für `/coins/{id}/ausgaben/{ausgabeId}` für alle Rollen, anonym, deaktiviert, `/coins/{id}/ausgaben/neu` unverändert; keine `…/zertifikat`-Requests ohne `issues.write`; Englisch-Prüfung. |
| UI-Test `web/ui-tests/zertifikat-erzeugen.spec.ts` (gemockte API) | Sachbearbeiter: Detailseite → Historie mit aktiver und stornierter Ausgabe *(Rev. 2: desselben Exemplars, gleiche Nummer)* → per Tastatur zum Button der aktiven Zeile → Download (Playwright `download`, Name aus Header `Zertifikat_C0042-0012.docx`, Request mit `Authorization` und der `ausgabeId` der aktiven Zeile) → Button der stornierten Zeile `disabled`; Mock-409 `ausgabe_storniert` → Alarm, Historie neu geladen; Link → Ausgabe-Seite → Download dort; Betrachter: keine Spalte mit Button, Direktaufruf der Ausgabe-Seite → „Kein Zugriff“, keine `…/zertifikat`-Requests; sichtbarer Fokus an Link und Button. |
| Systemtest `e2e/tests/zertifikat-erzeugen.spec.ts` (echte API, Keycloak, `workers: 1`) | 1. Admin vergibt Sachbearbeiter- und Betrachter-Rolle (wiederholbar, Muster `coin-ausgaben.spec.ts`). 2. Sachbearbeiter legt einen Coin mit eindeutigem Namen und Auflage 5 an, erfasst eine Ausgabe mit eindeutigem Empfängernamen mit Umlauten (z. B. „Jürgen Öztürk-Weiß {eindeutig}“). 3. Historie zeigt die Zertifikatsnummer (Muster `C…-0001`); „Zertifikat herunterladen“ → Dateiname `Zertifikat_<Nummer>.docx`; die Datei ist ein ZIP, `word/document.xml` lässt sich entpacken (Hilfsfunktion mit `node:zlib` oder ZIP-Bibliothek als devDependency, entscheidet der tester) und enthält den Empfängernamen und die Nummer, aber kein `{{`. 4. Ausgabe-Seite über den Link, Download dort. 5. Storno → Button `disabled`. 6. Betrachter: kein Button, Direktaufruf der Ausgabe-Seite → „Kein Zugriff“. |

**Abnahme „Fertig, wenn“:** Platzhalter überall ersetzt → AK-9, AK-13 (Integration); Sonderzeichen/Umlaute und Wert mit `{{Coin.Name}}` → AK-11; zwei Ausgaben, Storno einer anderen → AK-5 (verschiedene Exemplare; dazu Neuausgabe nach Storno mit derselben Nummer); stornierte Ausgabe abgelehnt → AK-18, AK-20; Betrachter `403`, Audit → AK-19, AK-20; Playwright → Systemtest Schritte 2–3.

## 9. Doku-Bedarf
- `docs/api.md`: neue Endpunkte, Fehlercodes (`ausgabe_storniert`, `vorlage_zu_viele_platzhalter`, `zertifikat_fehler`), Feld `zertifikatsnummer`, Format der Nummer (gleich bei Neuausgabe), Download-Header, neue Upload-Meldung.
- `docs/berechtigungen.md` nach Abschnitt 5.4 und `docs/platzhalter.md` nach Abschnitt 1.2 und AK-32: am 2026-10-17 vom architect eingetragen (Doku-Tests gleichen sie ab).
- `docs/requirements.md`: Abschnitt „Zertifikate“ mit den Entscheidungen vom 2026-10-16 ist vom architect nachgezogen; nach Abschluss Schritte 2–4 als umgesetzt markieren.
- Benutzerdoku: umgesetzt in `docs/benutzer/ausgaben.md` (Zertifikatsnummer, Spalte „Zertifikat“, Download, Seite „Ausgabe“, Storno und Neuausgabe) und `docs/benutzer/zertifikatsvorlagen.md` (200 Platzhalter, Ersetzung beim Erzeugen, Erläuterung entfällt, Dienststelle eigene Zeile); auf Vorgabe des Koordinators keine eigene Datei `docs/benutzer/zertifikate.md`.
- `docs/features/zertifikatsvorlagen.md` Abschnitt 4.1/4.2: Hinweis „Formatierung und leere Felder: siehe zertifikat-erzeugen Abschnitt 4; Dienststelle eigener Absatz (F8)“.
- ADR-0020 und ADR-0022: Hinweis „ergänzt durch ADR-0027/0028“.
- `CLAUDE.md` „Aktueller Stand“ und Fachbegriffe „Coin-Kennung“, „Zertifikatsnummer“: passt der Koordinator an.

## 10. Offene Fragen
Keine. F1–F12 hat der Auftraggeber am 2026-10-16 entschieden (Abschnitt 1.3). *(Rev. 2)* Abweichungen von Rev. 1: F1 laufende Nummer statt Zufallscode; F2 gleiche Nummer bei Neuausgabe statt Folgezusatz `-2`; F4 folgt daraus. Dafür entfallen in Rev. 2 Folgenummer, Zählung bisheriger Ausgaben und die Kollisionswiederholung beim Anlegen.

## 11. Annahmen
- A1: Die Zertifikatsnummer ist kein Echtheitsnachweis und darf in der Ausgabehistorie stehen; der Nachweis kommt mit der Signatur. *(Rev. 2)* Die spätere Prüfseite muss stornierte Ausgaben trotz gleicher Nummer erkennen (ADR-0027 „Folgen“).
- A2: Die Kennung erscheint nicht im öffentlichen Coin-DTO und nicht auf der Detailseite (nur in der Nummer); kann später ergänzt werden.
- A3: Gespeicherte Vorlagen sind geprüft und werden beim Download nicht erneut geprüft; Ausnahmen beim Lesen führen zu `500` (AK-17).
- A4: Die Eingabeprüfung von Ausgaben bleibt unverändert; Steuerzeichen werden erst beim Erzeugen entfernt (die Ausgabe selbst ist unveränderlich).
- A5: Platzhalter in Feldergebnissen werden ersetzt; aktualisiert der Benutzer das Feld in Word, gilt dessen Ergebnis.
- A6: GET mit Audit-Eintrag ist zulässig (Lesezugriff mit Protokoll); ein abgebrochener Download steht trotzdem im Audit.
- A7: Grenze von 2 gleichzeitigen Erzeugungen, getrennt von den 2 Aufbereitungen beim Upload; übliche Zertifikate sind in Millisekunden fertig.
- A8 *(Rev. 2)*: Der partielle Index auf `zertifikatsnummer` ist wegen eindeutiger Kennungen gleichwertig zu `ux_ausgabe_exemplar_aktiv`; er bleibt als ausdrückliche Sicherung der Nummer (Vorgabe F2).
- A9 *(Rev. 2)*: Kennungen werden nie wiederverwendet; Coins können nicht gelöscht werden, Lücken entstehen nur durch abgelehnte Duplikate und zurückgerollte Anlagen.

## 12. Umsetzung und Abweichungen vom Entwurf
Umgesetzt auf `feature/zertifikat-erzeugen`, QA-Freigabe in Runde 2. Tests: `tests/Coin.IntegrationTests/Zertifikate/*`, `web/ui-tests/zertifikat-erzeugen.spec.ts`, `e2e/tests/zertifikat-erzeugen.spec.ts` (DOCX-Prüfung mit eigener Hilfe `e2e/tests/hilfen/docx`, keine neue Abhängigkeit).

### Abweichungen
1. **Vergabe der Coin-Kennung (AK-1, ADR-0027 Punkt 2):** Statt allein über den Spalten-Default beim Insert vergibt `CoinKatalogService.AnlegenAsync` die Kennung vorab über `ICoinKatalogRepository.KennungVergebenAsync` (`SELECT coin_kennung_neu()`), nach der Feldprüfung und vor der Duplikatprüfung. Deshalb verbraucht ein `409 coin_existiert` sicher eine Nummer, ein `400` nicht. Der Default mit `RETURNING` bleibt als Absicherung. ADR-0027 Punkt 2 ist angeglichen.
2. **Gesperrte Download-Buttons (AK-24, AK-25, AK-26, AK-28, QA-Runde 1):** Statt `disabled` per `aria-disabled` (Base UI `focusableWhenDisabled`), sowohl während des Downloads als auch bei stornierten Ausgaben. Die Buttons bleiben fokussierbar, damit der Fokus nach `409 ausgabe_storniert` und dem Neuladen nicht auf `<body>` fällt; Klicks bleiben wirkungslos, der Sperrzustand ist zusätzlich über Deckkraft und Mauszeiger sichtbar.
3. **ZIP-Einträge (AK-13):** Nicht betroffene Einträge sind inhaltlich byte-gleich und in derselben Reihenfolge, werden aber neu komprimiert; die Datei als Ganzes ist nicht byte-gleich zur Vorlage.
4. **Werte außerhalb eines Runs:** Steht ein `w:t` nicht direkt in einem `w:r`, werden Zeilenumbruch und Tabulator dort zu einem Leerzeichen statt `w:br`/`w:tab`.
5. **Zählung (AK-14):** Gezählt werden nur bekannte Platzhalter; unbekannte `{{…}}` zählen nicht zur Grenze von 200.
6. **`403`-Text:** Fehlt `issues.write`, liefert auch der Zertifikat-Download das bestehende `detail` „Ihr Benutzerkonto ist nicht berechtigt, Ausgaben zu erfassen oder zu stornieren.“; das Frontend zeigt eigenständig „Sie sind nicht berechtigt, Zertifikate herunterzuladen.“
7. **Benutzerdoku:** keine eigene `docs/benutzer/zertifikate.md` (Abschnitt 9).

### Offener Hinweis für eine spätere Revision (QA, nicht blockierend)
- **WCAG 2.5.3 „Label in Name“:** Der zugängliche Name des Buttons „Zertifikat C0042-0012 herunterladen“ enthält den sichtbaren Text „Zertifikat herunterladen“ nicht zusammenhängend; Sprachsteuerung per „Klick Zertifikat herunterladen“ kann daran scheitern. Vorschlag: „Zertifikat herunterladen: C0042-0012“ (bei Storno „Zertifikat herunterladen: C0042-0012 (nicht möglich, Ausgabe storniert)“). Betrifft AK-24, Code und Tests.
