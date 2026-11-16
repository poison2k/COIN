# Anforderungen C.O.I.N.

Status: Entwurf. Offene Punkte sind mit [?] markiert und müssen vom Auftraggeber geklärt werden.

## Rollen
Jeder Benutzer hat genau eine feste Rolle oder keine. Welche Rolle welche Berechtigung hat, legt die
Rechtematrix im Code fest ([berechtigungen.md](berechtigungen.md), ADR-0016). Rollen vergeben
Administratoren in der Benutzerverwaltung.
- **Administrator**: verwaltet Coins, Exemplare, Ausgaben, Benutzer (umgesetzt: Coins erfassen und bearbeiten, Auflage ändern, Zertifikatsvorlagen verwalten, Ausgaben lesen, erfassen und stornieren, Benutzer und Rollen verwalten, Audit-Log lesen, Zertifikate herunterladen, Hologrammnummern erfassen, korrigieren und mit Empfängerdaten prüfen, Startseite konfigurieren mit `startpage.manage`)
- **Sachbearbeiter**: erfasst Ausgaben, stellt Zertifikate aus (umgesetzt: Coins erfassen und bearbeiten, Auflage ändern, Zertifikatsvorlagen verwalten, Ausgaben lesen, erfassen und stornieren, Zertifikate herunterladen mit `issues.write`, `docs/features/zertifikat-erzeugen.md`; Hologrammnummern erfassen, korrigieren und mit Empfängerdaten prüfen, `docs/features/hologrammnummer.md`)
- **Betrachter**: sieht den Katalog, je Coin die Kennzahlen und den Status der Exemplare und die Startseite mit allen aktiven Blöcken, aber keine Ausgaben, keine Empfängerdaten und keine Zertifikate (entschieden 2026-10-08, F2, ADR-0021; Startseite ADR-0032). Prüft Hologrammnummern auf „Zertifikat prüfen“ und sieht dabei Coin, Exemplar, Zertifikatsnummer, Ausgabedatum und Status, keine Empfänger (ADR-0034).
- **Öffentlichkeit**: prüft ein Zertifikat per Link/QR-Code, ohne Anmeldung; sieht den Coin-Katalog lesend und den Kopfbereich der Startseite (Titel, Untertitel, Logos), ohne Anmeldung (ADR-0014, ADR-0032)

## Funktionen (Stichpunkte)
1. Coin-Katalog: anlegen, bearbeiten, ansehen, Liste mit Suche und Filter (teilweise umgesetzt, `docs/features/coin-katalog.md`, `docs/features/katalog-seiten.md`, `docs/features/zertifikatsvorlagen.md`: anlegen auf eigener Seite, ansehen, Liste mit Suche in Name/Herausgeber und Blättern, bearbeiten auf der Seite „Coin bearbeiten“ (Stammdaten, Motivbild ersetzen), Zertifikatsvorlage im Reiter „Zertifikatsvorlage“ der Detailseite; noch ohne Filter und Löschen)
2. Exemplare: Seriennummern pro Coin, Status (verfügbar, ausgegeben, ungültig) (teilweise umgesetzt, `docs/features/coin-ausgaben.md`: Exemplare 1 bis Auflage, Status verfügbar/ausgegeben, Kennzahlen, Auflage ändern; noch ohne Status „ungültig“)
3. Ausgaben (früher „Verleihungen“): Empfänger, Datum, Gelegenheit, Begründung, ausgebende Stelle (umgesetzt, `docs/features/coin-ausgaben.md`: erfassen, stornieren mit Grund, Historie; Empfänger als Freitext). Lesen mit `issues.read`, Erfassen und Stornieren mit `issues.write`, beide nur Administrator und Sachbearbeiter (ADR-0021). Ausgabedaten kommen nie in das öffentliche Coin-DTO. Optionale Hologrammnummer je Ausgabe (umgesetzt, `docs/features/hologrammnummer.md`, ADR-0033): beim Erfassen oder nachträglich ergänzen, mit Grund korrigieren (`issues.write`); eindeutig über alle Coins nach Normalform. Nicht enthalten: Bearbeiten (Korrektur = Storno + neue Ausgabe; einzige Ausnahme ist die Hologrammnummer), Rückgabe, Import.
4. Zertifikate: Nummer, digital signiert, PDF-Ausgabe, öffentliche Prüfseite – zusammenhängende Anforderung, siehe Abschnitt [Zertifikate](#zertifikate) (teilweise umgesetzt: Vorlage, Nummer, Erzeugung als DOCX, Download mit Audit, Hologrammnummer mit Prüfung für angemeldete Benutzer; offen: Signatur, PDF, QR-Code, öffentliche Prüfseite).
5. Detailansicht eines Coins mit Ausgabehistorie (umgesetzt, `docs/features/katalog-seiten.md`, `docs/features/coin-ausgaben.md`, `docs/features/formulare-detailseiten.md`: Kopf mit Status-Chips und Aktionen, Kennzahlen mit `coins.read`, Reiter „Stammdaten“, „Exemplare“ mit `coins.read`, „Ausgaben“ mit `issues.read`, „Zertifikatsvorlage“ mit `coins.write`)
6. Benutzer- und Rollenverwaltung mit Audit-Log (umgesetzt, `docs/features/rollen-benutzerverwaltung.md`): Benutzer suchen, Rolle zuweisen oder entziehen, Benutzer deaktivieren und reaktivieren; Schutz des letzten aktiven Administrators; jede Rollen- und Statusänderung im Audit-Log
7. Startseite (umgesetzt, `docs/features/startseite.md`, ADR-0030 bis ADR-0032): `/` zeigt bis zu fünf Blöcke – Kopfbereich (Titel, Untertitel, Logo des Bereitstellers und der Software), Infotext (eingeschränktes Markdown), Kennzahlen über alle Coins, neueste Coins, meistausgegebene Coins. Administratoren pflegen Ein/Aus, Reihenfolge, Texte, Anzahlen und Logos auf `/verwaltung/startseite` mit Vorschau (`startpage.manage`). Ohne Konfiguration gelten Standardblöcke mit Standardtexten. Den Kopfbereich sehen alle Besucher ohne Anmeldung, die übrigen Blöcke nur mit `coins.read`. Nicht enthalten: freier Layout-Editor, mehrere Sprachen, Startseiten je Rolle, zeitgesteuerte Veröffentlichung, Entwurf/Freigabe, Diagramme.
8. Einheitliches Erscheinungsbild (Design-Fundament, umgesetzt, `docs/features/design-fundament.md`, ADR-0035 bis ADR-0038): sachlich, ruhig, behördentauglich. Gestaltungsregeln als Tailwind-Theme-Tokens (Palette mit Primär-, Neutral- und Statusfarben, Schriftskala, 4/8-px-Raster, Radien, Schatten; hell und dunkel über den bestehenden Theme-Provider), Bausteine in `shared/ui` (Button, Eingabefeld, Textbereich, Auswahl, Checkbox, Formularfeld, Karte, Tabelle, Badge, Dialog, Hinweisbanner, Leerzustand, Ladeanzeige, Toast, Seitenkopf mit Brotkrumen), App-Layout mit gruppierter, einklappbarer Seitenleiste, Kopfzeile mit Name, Rolle, Theme und Abmelden, Inhaltsbereich mit fester Lesebreite, Mobilmenü unter 768 px; einheitliche Zustände für Laden, Leer und Fehler (zunächst auf Seitenebene); Bausteinübersicht `/entwicklung/bausteine` nur in der Entwicklungsumgebung. Funktion und Backend bleiben unverändert. Offen für Folgeläufe: Brotkrumen auf bestehenden Seiten (Formulare und Tabellen folgten mit Funktion 9, Zustände in Widgets und Dashboards mit Funktion 10).
9. Formulare und Detailseiten (umgesetzt, `docs/features/formulare-detailseiten.md`, ADR-0039 bis ADR-0042): Alle Formulare (Coin anlegen und bearbeiten, Ausgabe erfassen, Hologrammnummer, Vorlage hochladen, Benutzerverwaltung, Startseitenkonfiguration) gliedern ihre Felder in beschriftete Abschnitte, ein- oder zweispaltig. Sie kennzeichnen Pflichtfelder, zeigen Hilfetexte zu nicht offensichtlichen Regeln und melden Fehler am Feld erst nach dem Verlassen. Beim Absenden springt der Fokus auf den ersten Fehler, bei mehreren Fehlern steht oben eine Zusammenfassung. Die Aktionsleiste hat die Hauptaktion rechts (unter 768 px fest am unteren Rand), Ladezustand und Doppelklick-Schutz. Ungespeicherte Änderungen lösen beim Verlassen eine Warnung aus. Die Coin-Detailseite bekommt einen Kopf mit Status-Chips und gebündelten Aktionen, Kennzahlenkarten mit Fortschrittsbalken und Reiter „Stammdaten“, „Exemplare“, „Ausgaben“, „Zertifikatsvorlage“ (Reiter in der URL). Die Ausgabe-Seite hat Abschnitte, einen Verlauf als Zeitleiste und die Aktionen „Zertifikat herunterladen“ und „Stornieren“ im Kopf. Storno, Deaktivieren und Zurücksetzen gehen nur über einen Bestätigungsdialog. Tabellen bekommen Filter-Chips, Paginierung, klickbare Zeilen, Karten auf kleinen Bildschirmen und Sortierung, wo die vollständige Liste geladen ist. Funktion, Fachregeln, API und Datenbank bleiben unverändert. Nicht enthalten: Startseite, Prüfmaske und Listen der Übersicht (nächster Lauf), Hologramm-Korrekturen im Verlauf (F3), serverseitige Sortierung (F7).
10. Startseite, Listen und Prüfmaske (umgesetzt, `docs/features/startseite-listen-pruefung.md`, ADR-0043, ADR-0044): Die Startseite zeigt ihre Blöcke in einem Raster ohne Lücken: prominenter Kopfbereich mit Logos, Kennzahlen als Karten mit großen Zahlen, neueste Coins als Kacheln, meistausgegebene Coins als kompakte Rangliste mit Rangzahl; deaktivierte und leere Blöcke erzeugen keine Lücken. Der Katalog bekommt eine umschaltbare Tabellen- oder Kartenansicht (Wahl im Browser gemerkt, Standard Tabelle), ein prominentes Suchfeld in einer Filterleiste, den Status-Chip „Auflage unbekannt“ und Leerzustände. Die Prüfmaske wird eine zentrierte Arbeitsseite mit großem Nummernfeld neben der Coin-Auswahl und einer Ergebniskarte mit großem Status (gültig, storniert, falscher Coin, nicht gefunden) in Farbe, Icon und Text; der Datensatz steht in Gruppen. Nach jeder Prüfung bleibt der Fokus im Nummernfeld (Inhalt markiert), sodass sofort die nächste Nummer folgen kann. Benutzerverwaltung und Startseitenverwaltung bekommen einen einheitlichen Aufbau, das Audit-Log einen Filter nach dem geänderten Benutzer und lesbare Zeitpunkte (Europe/Berlin). Ein Konsistenz-Durchgang über alle Seiten vereinheitlicht Abstände, Überschriften, Beschriftungen, Icons, Zustände und Texte. Fachlich, in API und Datenbank ändert sich nichts. Die Prüfantwort zeigt nicht mehr als bisher. Nicht enthalten: neue Auswertungen und Diagramme, Filter des Audit-Logs nach Zeitraum und Aktion (eigener Lauf mit API-Erweiterung), weitere Katalogfilter und Verfügbarkeits-Chips (bräuchten eine API-Erweiterung).

## Zertifikate
Ein Zertifikat ist der Echtheitsnachweis für eine Ausgabe. Es entsteht in dieser Reihenfolge; die
Platzhalter `{{Gruppe.Feld}}` aus dem Platzhalterkatalog ([platzhalter.md](platzhalter.md),
`Coin.Domain.Vorlagen.Platzhalterkatalog`) verbinden Vorlage und Erzeugung.

| Schritt | Inhalt | Stand |
|---|---|---|
| 1. Vorlage | Je Coin eine Word-Vorlage (.docx): Standardvorlage aus dem Backend, eigene Vorlage hochladen (geprüft gegen den Platzhalterkatalog und die Namespace-Positivliste, bereinigt um persönliche Dokumenteigenschaften), Versionen, eine aktive Vorlage, Zurücksetzen; Recht `coins.write`; Audit `vorlage_audit` | umgesetzt (`docs/features/zertifikatsvorlagen.md`, ADR-0022 bis ADR-0026, Entscheidungen F1–F16 unten) |
| 2. Nummer | Jede Ausgabe erhält bei der Erfassung einmalig eine unveränderliche Zertifikatsnummer `<Coin-Kennung>-<Exemplar, mind. vierstellig>`, z. B. `C0042-0012`; Coin-Kennung `C` + laufende Nummer per DB-Sequenz. Eine Neuausgabe desselben Exemplars nach Storno erhält dieselbe Nummer; eindeutig ist sie unter den aktiven Ausgaben | umgesetzt (`docs/features/zertifikat-erzeugen.md`, ADR-0027) |
| 3. Erzeugung | Zu jeder aktiven Ausgabe wird die aktive Vorlage des Coins (sonst die Standardvorlage ohne Erläuterungsseite) kopiert und alle Platzhalter in Text, Tabellen, Kopf- und Fußzeilen, Fuß-/Endnoten und Textfeldern durch die Werte ersetzt (Formatierung bleibt, Werte als Text, keine erneute Ersetzung, Coin-Daten im aktuellen Stand, leere Felder leer); die Originalvorlage bleibt unverändert, Verarbeitung nur im Speicher; höchstens 200 Platzhalter je Vorlage | umgesetzt (ADR-0028) |
| 4. Download und Audit | Download als `Zertifikat_<Nummer>.docx` aus der Ausgabehistorie und von der neuen Seite der Ausgabe, nur mit `issues.write`; stornierte Ausgaben abgelehnt; jeder Download im Audit `zertifikat_audit` (wer, wann, Nummer, Ausgabe), ohne Empfängerdaten, ohne Lese-Endpunkt | umgesetzt (ADR-0029) |
| 5. Signatur | Zertifikat digital signieren (privater Schlüssel nie im Repository) | offen |
| 6. PDF | PDF-Ausgabe | offen |
| 7. QR-Code und Prüfseite | Öffentliche Prüfung per Link/QR-Code ohne Personendaten; muss stornierte Ausgaben trotz gleicher Nummer erkennen (ADR-0027 „Folgen“) | offen |
| 8. Hologrammnummer und Prüfung | Jedes gedruckte Zertifikat trägt einen Hologramm-Sticker; seine Nummer wird je Ausgabe erfasst (Platzhalter `{{Zertifikat.Hologrammnummer}}`, Standardvorlage mit Absatz „Hologramm Nr. …“). Angemeldete Benutzer mit Rolle prüfen auf `/pruefung`, ob eine Nummer zu einem gültigen Zertifikat gehört (gültig, storniert, falscher Coin, nicht gefunden), Empfängerdaten nur mit `issues.read`; Ratenbegrenzung 20 je Minute und Benutzer; Audits `hologramm_audit` und `pruefung_audit` ohne Lese-Endpunkt | umgesetzt (`docs/features/hologrammnummer.md`, ADR-0033, ADR-0034) |

Wird die Vorlage eines Coins ersetzt, erzeugen neue Downloads mit der dann aktiven Vorlage; Nummer und
Ausgabedaten bleiben gleich. Nicht vorgesehen: Sammel- oder Serienausdruck, Archivierung erzeugter Dateien.
Der Platzhalterkatalog hat 14 Platzhalter (4 Pflicht); `Zertifikat.Hologrammnummer` ist optional,
bestehende Vorlagen ohne ihn bleiben gültig.

## Datenmodell (grob)
Coin (mit Kennung), Exemplar (Seriennummer), Ausgabe (Person, Datum, Gelegenheit, Zertifikatsnummer, Hologrammnummer mit Historie), Zertifikatsvorlage (Versionen je Coin), Zertifikat (Nummer, Signatur, Ausstelldatum – Signatur und Ausstelldatum offen), Benutzer/Rolle, Startseitenkonfiguration (eine Konfiguration, zwei Logo-Plätze).

## Nichtfunktionale Anforderungen
- Datenschutz: Zugriff auf Personendaten nur nach Rolle, Änderungen nachvollziehbar (Audit-Log). Umgesetzt für Rollen- und Statusänderungen von Benutzern (ADR-0017) sowie für das Erfassen und Stornieren von Ausgaben (ADR-0020, ohne Empfängerdaten) und für Upload und Zurücksetzen von Zertifikatsvorlagen (ADR-0023) und für den Download von Zertifikaten (ADR-0029) und für Änderungen an der Startseite (`startseite_audit`, ADR-0030, ohne Textinhalte, kein Lese-Endpunkt) sowie für das Setzen und Korrigieren von Hologrammnummern (`hologramm_audit`) und jede Hologrammprüfung (`pruefung_audit`, ADR-0033, ADR-0034, ohne Empfängerdaten, kein Lese-Endpunkt). Stammdatenänderungen an Coins werden nicht protokolliert (zertifikatsvorlagen F3). Zertifikate enthalten Personendaten; sie landen nicht in Logs und werden auf dem Server nicht zwischengespeichert. Im Browser-Speicher stehen nur Bedienvorlieben ohne Personenbezug (`coin-theme`, `coin-katalog-ansicht`, ADR-0044).
- Zertifikate fälschungssicher (Signatur), Prüfung ohne Preisgabe von Personendaten
- Barrierefreiheit (design-fundament, ADR-0035 bis ADR-0037): WCAG 2.1 AA / BITV – Textkontrast ≥ 4,5:1 (hell und dunkel, per Test aus den Tokens berechnet), sichtbarer Tastaturfokus, alle Bedienelemente per Tastatur erreichbar, Bedeutung nie nur über Farbe, deutsche Beschriftungen für Screenreader, Klickflächen ≥ 40 px; automatische Prüfung mit axe (keine Verstöße der Stufen „serious“/„critical“). Ein manueller BITV-Test ist damit nicht ersetzt.
- Responsivität (design-fundament): Darstellung für 360, 768 und 1280 px Breite ohne horizontales Scrollen; unter 768 px Seitenleiste als ausklappbares Menü.
- Gestaltung (design-fundament, ADR-0035): Farben und Abstände nur über die Theme-Tokens, keine hartkodierten Werte in Komponenten (per Code-Test geprüft).
- Betrieb: noch offen [?] (lokal, Intranet, Cloud)

## Offene Fragen
- Entschieden (2026-10-05, ADR-0012): Wer authentifiziert sich wie? Anmeldung mit E-Mail und Passwort über Keycloak (OIDC), der in Produktion an das AD angebunden ist. Rollen werden in C.O.I.N. selbst geführt (ADR-0013).
- Entschieden (2026-10-08, coin-ausgaben): Empfänger werden als Freitext geführt (Name, Dienstgrad, Dienststelle), nicht als Personenstammdaten.
- Entschieden (2026-10-05, ADR-0014): Darf die Öffentlichkeit den Coin-Katalog sehen? Ja. Lesen (Liste, Detail, Motivbild) geht ohne Anmeldung. Schreiben dürfen nur Administrator und Sachbearbeiter. Öffentliche Antworten enthalten keine Personendaten.
- Entschieden (2026-10-05, ADR-0016): Deaktivierte Benutzer lesen die öffentlichen Katalog-Endpunkte wie alle anderen (`200`); `403` erhalten sie nur auf Endpunkten, die eine Anmeldung verlangen, einschließlich `/api/me`.
- Entschieden (2026-10-05, ADR-0017): Audit-Einträge werden vorerst unbegrenzt aufbewahrt. Das Löschkonzept kommt als eigenes späteres Feature.
- Entschieden (2026-10-06, rollen-benutzerverwaltung Rev. 3): Benutzer mit deaktiviertem Konto und Benutzer ohne Rolle können auf „Kein Zugriff“ ihren Zugang per „Erneut prüfen“ neu prüfen lassen; beim Zurückkehren ins Fenster prüft die App still (höchstens alle 30 s). Für angemeldete Benutzer mit Rolle gibt es keine solche Prüfung, ein Rollenwechsel wird bei ihnen erst nach dem Neuladen sichtbar. Nach Reaktivierung oder erster Rolle geht es zur Startseite.
- Entschieden (2026-10-06, ADR-0019): Alle Requests, auch die öffentlichen Katalog-GETs und Bildabrufe, werden ohne Personendaten auf `Information` protokolliert (Methode, Routen-Template, Status, Dauer). Absenken nur über das Log-Level.
- Entschieden (2026-10-06, katalog-seiten F1–F7):
  - F1: Wer angemeldet ist und eine Rolle hat, aber die Berechtigung für eine Seite nicht, landet auf „Kein Zugriff“ mit dem Grund „keine Berechtigung“. Das gilt für alle geschützten Seiten, auch für die Benutzerverwaltung (bisher Weiterleitung zur Startseite).
  - F2: Anonyme Besucher auf „Coin hinzufügen“ (`/coins/neu`) melden sich an und kehren dorthin zurück.
  - F3: Die Detailseite zeigt ein vorhandenes Motivbild.
  - F4: Die Katalogseite heißt „Katalog“ (Seitenleiste, Überschrift), der Startseiten-Link „Zum Katalog“.
  - F5: „Ausgaben“ sind Verleihungen. Die Detailseite zeigt dafür nur einen Platzhalter „Verleihungen“, öffentlich, ohne Daten, Zahlen oder Hinweise auf Personen. Für das Feature Verleihungen sind eine eigene Berechtigung (z. B. `verleihungen.read`) und ein eigener geschützter Endpunkt vorgemerkt; der Abschnitt erscheint dann nur mit dieser Berechtigung. Abgelöst durch coin-ausgaben F1 (2026-10-08): Begriff „Ausgabe“, Berechtigungen `issues.*`, der Platzhalter ist entfallen.
  - F6: Das Motivbild bleibt im Formular „Coin hinzufügen“, einschließlich „Bild erneut hochladen“ bei einem Teilerfolg.
  - F7: `GET /api/coins` liefert ohne Abwärtskompatibilität das Seiten-Format.
- Entschieden (2026-10-08, coin-ausgaben F1–F10, ADR-0020, ADR-0021):
  - F1: Überall heißt es „Ausgabe“ (Oberfläche, API `/ausgaben`, Code), Berechtigungen `issues.read` und `issues.write`. Der Platzhalter „Verleihungen“ und `verleihungen.read` entfallen.
  - F2: Kennzahlen und Exemplar-Status nur mit `coins.read` (Administrator, Sachbearbeiter, Betrachter). Anonyme, Benutzer ohne Rolle und Deaktivierte sehen nur die Stammdaten. Ausgaben mit Empfängerdaten nur mit `issues.read` (Administrator, Sachbearbeiter).
  - F3: Die Auflage ist nach dem Anlegen nur über „Auflage ändern“ änderbar; weiteres Bearbeiten von Coins gibt es nicht. Abgelöst am 2026-10-09 durch zertifikatsvorlagen (ADR-0025): Stammdaten samt Auflage sind auf „Coin bearbeiten“ änderbar, „Auflage ändern“ bleibt.
  - F4: Senken der Auflage nur bis zur höchsten je ausgegebenen Nummer (aktiv oder storniert); kein Zurück auf „unbekannt“.
  - F5: „Ausgebende Stelle oder Person“ ist ein Pflicht-Freitext; der Erfasser wird automatisch gespeichert.
  - F6: Das Audit der Ausgaben enthält keine Empfängerdaten. Am Storno-Grund weist die Oberfläche darauf hin, keine Personendaten einzutragen.
  - F7: Kein Lese-Endpunkt für das Ausgabe-Audit; Erfasser und Stornierer stehen in der Historie.
  - F8: Das Datum der Ausgabe ist Pflicht, ein reines Datum und darf nicht in der Zukunft liegen (heute nach Europe/Berlin).
  - F9: Die Obergrenze der Auflage bleibt 1.000.000.
  - F10: Ausgaben samt Empfängerdaten und ihr Audit werden vorerst unbegrenzt aufbewahrt; das Löschkonzept kommt als eigenes späteres Feature.
- Entschieden (2026-10-09, 2026-10-14, 2026-10-16, zertifikatsvorlagen F1–F16, ADR-0022 bis ADR-0026; Anforderung „Zertifikate“, Schritt 1):
  - F1/F2: Untergrenze der Auflage bleibt die höchste je ausgegebene Nummer; der Dialog „Auflage ändern“ bleibt auf der Detailseite.
  - F3/F4: Stammdatenänderungen ohne Audit; bei gleichzeitigem Bearbeiten gewinnt der Letzte. Löst coin-ausgaben F3 („kein weiteres Bearbeiten“) ab (ADR-0025).
  - F5: Das Motivbild ist auf „Coin bearbeiten“ ersetzbar, nicht löschbar.
  - F6/F7: Frühere Vorlagenversionen werden nur heruntergeladen, nicht wieder aktiviert; kein Lese-Endpunkt für das Vorlagen-Audit.
  - F8/F9: Vorlagen mit nachverfolgten Änderungen werden abgelehnt; Platzhalter gelten streng nach Schreibweise.
  - F10: Persönliche Dokumenteigenschaften werden beim Upload entfernt; gespeichert wird die bereinigte Fassung.
  - F11/F12: Versionen werden unbegrenzt aufbewahrt (Löschkonzept als eigenes Feature); kein Virenscan in der App (Betriebsthema).
  - F13: Hochgeladene Word-Dateien werden gegen eine feste Positivliste von Namespaces geprüft (`docs/word-namespaces.md`).
  - F14: Diagramme, SmartArt, Freihand, 3D-Modelle, SharePoint-Metadaten und Vertraulichkeitsbezeichnungen werden abgelehnt; eingebettete Schriften bleiben erlaubt.
  - F15: SVG-Grafiken werden abgelehnt, auch mit PNG-Rückfall (eigene Meldung).
  - F16: Signaturzeilen (Word: Einfügen › Signaturzeile) werden abgelehnt (Erweiterungsmeldung); die Unterschrift entsteht beim Ausstellen.
- Entschieden (2026-10-16, zertifikat-erzeugen F1–F12, ADR-0027 bis ADR-0029; Anforderung „Zertifikate“, Schritte 2–4):
  - F1: Coin-Kennung `C` + mindestens vierstellige laufende Nummer (`C0042`), per DB-Sequenz, unveränderlich, Lücken zulässig; dass sie Anzahl und Reihenfolge der Coins verrät, ist akzeptiert. Nicht im öffentlichen Coin-DTO.
  - F2: Eine Neuausgabe desselben Exemplars nach Storno erhält dieselbe Zertifikatsnummer; eindeutig ist sie unter den aktiven Ausgaben, im Audit steht immer die Ausgabe dazu. Bewusste Abweichung von „eindeutig“; Restrisiko für die Prüfseite.
  - F3/F4: Exemplarnummer mindestens vierstellig, darüber ungekürzt; bestehende Ausgaben (auch stornierte) erhalten die Nummer ihres Exemplars.
  - F5/F12: Neue Seite der einzelnen Ausgabe mit `issues.read`; Download nur mit `issues.write`.
  - F6: Coin-Daten im Zertifikat immer im aktuellen Stand.
  - F7/F8: Standardvorlage im Zertifikat ohne Erläuterungsseite; leere optionale Felder bleiben leer, Dienststelle in eigener Zeile.
  - F9: Kein Lese-Endpunkt für das Download-Audit.
  - F10: Datum `TT.MM.JJJJ`, Zahlen ohne Tausenderpunkt.
  - F11: Höchstens 200 Platzhalter je Vorlage (neue Uploads und Erzeugung).
- Entschieden (2026-10-26, startseite S1–S11, ADR-0030 bis ADR-0032; Funktion 7):
  - S1: Der Kopfbereich (Titel, Untertitel, Logos mit Alternativtext, ob aktiv und an welcher Stelle) ist öffentlich, auch für Benutzer ohne Rolle und deaktivierte Benutzer; die übrigen Blöcke nur mit `coins.read`. Gespeicherte Logos sind auch bei ausgeschaltetem Kopfbereich öffentlich abrufbar.
  - S2: Kennzahlen zählen aktive Ausgaben; „Exemplare gesamt“ = Summe der Auflagen, „verfügbar“ = Exemplare − aktive Ausgaben.
  - S3: Die Rangliste enthält nur Coins mit aktiver Ausgabe, bei Gleichstand alphabetisch.
  - S4: Infotext als eingeschränktes Markdown (fett, kursiv, Listen, Absätze, Zeilenumbrüche, Links auf `http`, `https`, `mailto` und `/…`); HTML wird entfernt, externe Links öffnen in neuem Tab.
  - S5: Logos höchstens 2048 × 2048 Pixel, keine Animation, kein SVG; Metadaten werden nicht entfernt, die Oberfläche weist darauf hin.
  - S6: Speichern atomar in einem Request mit Versionsprüfung (`409` bei zwischenzeitlicher Änderung).
  - S7: Audit je Änderung ohne Textinhalte, kein Lese-Endpunkt, unbegrenzte Aufbewahrung bis zum Löschkonzept.
  - S8: Kein Server-Cache; Logos mit versionierter URL und ETag.
  - S9: Ist der Kopfbereich aktiv, ist sein Titel für alle Besucher die Hauptüberschrift, sonst „Willkommen bei C.O.I.N.“.
  - S10: Grenzen: Titel 100, Untertitel 200, Alternativtext 200, Infotext 5.000 Zeichen.
  - S11: Wer zuletzt gespeichert hat, sehen nur Administratoren auf der Konfigurationsseite, nie öffentlich.
- Entschieden (2026-11-03, hologrammnummer H1–H11, ADR-0033, ADR-0034; Anforderung „Zertifikate“, Schritt 8):
  - H1: Eine Korrektur gibt die alte Nummer frei; eindeutig sind nur die aktuellen Zuordnungen.
  - H2: Erlaubt sind nach der Normalisierung nur `A–Z` und `0–9`; Leerzeichen und Bindestriche sind Trenner.
  - H3: Angezeigt und ins Zertifikat gesetzt wird die bereinigte Form in Großbuchstaben („AB 12-34“); verglichen wird die Normalform („AB1234“).
  - H4: Nach einem Storno ist die Nummer nicht mehr änderbar und bleibt dauerhaft gesperrt.
  - H5: Eine Nummer lässt sich nicht entfernen.
  - H6: Zwei Prüf-Endpunkte: ohne Empfängerdaten mit `coins.read`, mit Empfängerdaten mit `issues.read`.
  - H7: Bei stornierter Ausgabe zeigt die Prüfung den Datensatz mit Storno-Datum, ohne Storno-Grund.
  - H8: Ratenbegrenzung 20 Prüfungen je 60 s und Benutzer, fest im Code, je API-Instanz; `429` ohne Audit.
  - H9: Jede Prüfung dauert mindestens 250 ms.
  - H10: Kein Lese-Endpunkt für `hologramm_audit` und `pruefung_audit`; Aufbewahrung unbegrenzt bis zum Löschkonzept.
  - H11: Die Standardvorlage hat einen eigenen Absatz „Hologramm Nr. …“ nach der Zertifikatsnummer; ohne Nummer bleibt die Beschriftung stehen.
- Entschieden (2026-11-13, design-fundament D1–D13, ADR-0035 bis ADR-0038; Funktion 8; Details in `docs/features/design-fundament.md`, Abschnitt 13):
  - D1: Bestehende Seiten bekommen in diesem Lauf keine Brotkrumen; der Baustein ist da, eingesetzt wird er in einem Folgelauf.
  - D2: Einheitliche Zustände zunächst nur auf Seitenebene, einschließlich „Erneut versuchen“; Zustände in Widgets folgen mit deren Umbau.
  - D3: Primärfarbe Marineblau; ein späteres Corporate Design wird nur über die Tokens übernommen.
  - D4: Seitenleiste mit den Gruppen „Übersicht“, „Coins“, „Prüfung“ und „Verwaltung“, „Ausgaben“ erst mit einer Übersichtsseite.
  - D5: Einklappen durch vollständiges Ausblenden (`offcanvas`), keine Icon-Leiste.
  - D6: Toast mit Base UI, kein `sonner`.
  - D7: Screenshots in `docs/design/ablage/` werden eingecheckt und nur bei Bedarf neu erzeugt.
  - D8: Den Abschnitt „Frontend-Standard“ in `CLAUDE.md` ergänzt der Mensch bzw. die Hauptsitzung.
  - D9: Klickflächen ≥ 40 px auch in bestehenden Formularen; Textlinks in Tabellen bis zum Tabellen-Umbau ausgenommen.
  - D10: Die Bausteinseite ist nur in der Entwicklungsumgebung erreichbar, per URL, ohne Anmeldung und ohne Sidebar-Eintrag.
  - D11: Tests, die nur wegen des Tab-Stopps des Skip-Links rot werden, dürfen begründet um diesen Tab-Stopp ergänzt werden.
  - D12: Schrift Geist Variable.
  - D13: Ungenutzte Pakete (`framer-motion`, `react-day-picker`) werden in einem eigenen `chore/*`-Branch entfernt.
  - Zusätzlich (2026-11-13, WCAG 2.5.3): Der Zertifikat-Button heißt für Screenreader „Zertifikat herunterladen: <Nummer>“ (bei Storno mit Zusatz „(nicht möglich, Ausgabe storniert)“); bestehende Tests wurden dafür mit Freigabe angepasst.
- Entschieden (2026-11-14, formulare-detailseiten F1–F10, ADR-0039 bis ADR-0042; Funktion 9; Details in `docs/features/formulare-detailseiten.md`, Abschnitt 12):
  - F1: Ohne `?reiter` ist auf der Coin-Detailseite der Reiter „Exemplare“ offen (mit `coins.read`); „Stammdaten“ bleibt erster Reiter.
  - F2: Die Verwaltung der Zertifikatsvorlage zieht von „Coin bearbeiten“ in den Reiter „Zertifikatsvorlage“ der Detailseite; „Coin bearbeiten“ enthält nur noch Stammdaten und Motivbild.
  - F3: Der Verlauf der Ausgabe zeigt nur „erfasst“ und „storniert“; Hologramm-Korrekturen folgen in einem eigenen Lauf mit Lese-Endpunkt.
  - F4: Status-Chips des Coins nur aus vorhandenen Daten („Auflage unbekannt“, „Exemplare verfügbar“, „Alle Exemplare ausgegeben“); „Ausgabe erfassen“ erscheint nur, wenn ein Exemplar frei ist.
  - F5: Die Texte der Bestätigungsdialoge bleiben wortgleich; die Folge steht im ersten Satz.
  - F6: „Listen der Übersicht“ (nicht in diesem Lauf) sind der Katalog `/coins` und die Listen der Startseite.
  - F7: Sortierbar sind nur vollständig geladene Listen (Vorlagenversionen); serverseitige Sortierung erst mit API-Erweiterung.
  - F8: Die Ausgabehistorie bekommt einen Statusfilter (aktiv/storniert) über den vorhandenen API-Parameter.
  - F9: Testanpassungen sind genau für K1–K8 und K10 freigegeben, nur Navigationsschritte, Locator und Bestätigungsschritt, je begründet.
  - F10: Screenshots dieses Laufs werden nicht eingecheckt; sie entstehen nur lokal in `web/test-results/screenshots-formulare/` (per `.gitignore` ausgeschlossen) und werden vom Agenten angesehen.
- Entschieden (2026-11-15, startseite-listen-pruefung F1–F7, ADR-0043, ADR-0044; Funktion 10; Details in `docs/features/startseite-listen-pruefung.md`, Abschnitt 12):
  - F1: Standardansicht des Katalogs ist „Tabelle“ auf allen Breiten; die Wahl wird gemerkt.
  - F2: Einziger Katalogfilter ist die Suche (Chip „Suche: …“); kein clientseitiges Filtern innerhalb einer Seite.
  - F3: Einziger Status-Chip im Katalog ist „Auflage unbekannt“; Verfügbarkeits-Chips erst mit API-Erweiterung.
  - F4: Nach einer Prüfung bleibt der Fokus im Nummernfeld, der Inhalt wird markiert, nicht geleert.
  - F5: Das Audit-Log bekommt in diesem Lauf nur den Benutzerfilter über den vorhandenen Parameter `benutzerId`; der Filter gilt für den geänderten Benutzer, nicht für den Ausführenden. Zeitraum und Aktion folgen in einem eigenen Lauf mit API-Erweiterung und eigenem ADR.
  - F6: Für den Startseiten-Vergleich werden je 12 Vorher- und Nachher-Bilder in `docs/design/vergleich-startseite/` eingecheckt; alle übrigen Screenshots bleiben lokal.
  - F7: Die Ansichtswahl steht im `localStorage` (`coin-katalog-ansicht`), nicht in der URL.
  - Testanpassungen sind für K1, K3, K4, K6–K9 und K11 freigegeben, nur Locator und Bezugsstellen, je begründet.
  - K12 (freigegeben 2026-11-15, während der Umsetzung): `web/ui-tests/startseite.spec.ts:360` erwartet nicht mehr Kennzahlen, Neueste und Meistausgegebene auf breitem Bildschirm in einer Zeile, sondern Kennzahlen allein in einer Zeile und Neueste und Meistausgegebene darunter nebeneinander. Grund: Das Zeilenraster der Startseite sieht Kennzahlen als volle Zeile vor (ADR-0043 Punkt 1).
  - Der Ansichtsumschalter besteht aus zwei Buttons mit `aria-pressed` (Ersatz für `toggle-group`, umgesetzt).
  - Regelwidrige Texte, die Prüfinhalt bestehender Tests sind, werden im Konsistenz-Durchgang nur gesammelt, nicht geändert.
- [?] Welche Schutzstufe haben die Daten, und wo darf die Anwendung betrieben werden?
- [?] Sprache der Oberfläche (nur Deutsch oder auch Englisch)?

## Erstes Feature (Pilot)
„Coin anlegen und in einer Liste anzeigen“ – inklusive API, Datenbank, Oberfläche, Tests.
