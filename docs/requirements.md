# Anforderungen C.O.I.N.

Status: Entwurf. Offene Punkte sind mit [?] markiert und müssen vom Auftraggeber geklärt werden.

## Rollen
Jeder Benutzer hat genau eine feste Rolle oder keine. Welche Rolle welche Berechtigung hat, legt die
Rechtematrix im Code fest ([berechtigungen.md](berechtigungen.md), ADR-0016). Rollen vergeben
Administratoren in der Benutzerverwaltung.
- **Administrator**: verwaltet Coins, Exemplare, Ausgaben, Benutzer (umgesetzt: Coins erfassen und bearbeiten, Auflage ändern, Zertifikatsvorlagen verwalten, Ausgaben lesen, erfassen und stornieren, Benutzer und Rollen verwalten, Audit-Log lesen, Zertifikate herunterladen, Startseite konfigurieren mit `startpage.manage`)
- **Sachbearbeiter**: erfasst Ausgaben, stellt Zertifikate aus (umgesetzt: Coins erfassen und bearbeiten, Auflage ändern, Zertifikatsvorlagen verwalten, Ausgaben lesen, erfassen und stornieren, Zertifikate herunterladen mit `issues.write`, `docs/features/zertifikat-erzeugen.md`)
- **Betrachter**: sieht den Katalog, je Coin die Kennzahlen und den Status der Exemplare und die Startseite mit allen aktiven Blöcken, aber keine Ausgaben, keine Empfängerdaten und keine Zertifikate (entschieden 2026-10-08, F2, ADR-0021; Startseite ADR-0032).
- **Öffentlichkeit**: prüft ein Zertifikat per Link/QR-Code, ohne Anmeldung; sieht den Coin-Katalog lesend und den Kopfbereich der Startseite (Titel, Untertitel, Logos), ohne Anmeldung (ADR-0014, ADR-0032)

## Funktionen (Stichpunkte)
1. Coin-Katalog: anlegen, bearbeiten, ansehen, Liste mit Suche und Filter (teilweise umgesetzt, `docs/features/coin-katalog.md`, `docs/features/katalog-seiten.md`, `docs/features/zertifikatsvorlagen.md`: anlegen auf eigener Seite, ansehen, Liste mit Suche in Name/Herausgeber und Blättern, bearbeiten auf der Seite „Coin bearbeiten“ (Stammdaten, Motivbild ersetzen); noch ohne Filter und Löschen)
2. Exemplare: Seriennummern pro Coin, Status (verfügbar, ausgegeben, ungültig) (teilweise umgesetzt, `docs/features/coin-ausgaben.md`: Exemplare 1 bis Auflage, Status verfügbar/ausgegeben, Kennzahlen, Auflage ändern; noch ohne Status „ungültig“)
3. Ausgaben (früher „Verleihungen“): Empfänger, Datum, Gelegenheit, Begründung, ausgebende Stelle (umgesetzt, `docs/features/coin-ausgaben.md`: erfassen, stornieren mit Grund, Historie; Empfänger als Freitext). Lesen mit `issues.read`, Erfassen und Stornieren mit `issues.write`, beide nur Administrator und Sachbearbeiter (ADR-0021). Ausgabedaten kommen nie in das öffentliche Coin-DTO. Nicht enthalten: Bearbeiten (Korrektur = Storno + neue Ausgabe), Rückgabe, Import.
4. Zertifikate: Nummer, digital signiert, PDF-Ausgabe, öffentliche Prüfseite – zusammenhängende Anforderung, siehe Abschnitt [Zertifikate](#zertifikate) (teilweise umgesetzt: Vorlage, Nummer, Erzeugung als DOCX, Download mit Audit; offen: Signatur, PDF, QR-Code, Prüfseite).
5. Detailansicht eines Coins mit Ausgabehistorie (umgesetzt, `docs/features/katalog-seiten.md`, `docs/features/coin-ausgaben.md`: Stammdaten, Motivbild, Abschnitt „Exemplare“ mit `coins.read`, Abschnitt „Ausgabehistorie“ mit `issues.read`)
6. Benutzer- und Rollenverwaltung mit Audit-Log (umgesetzt, `docs/features/rollen-benutzerverwaltung.md`): Benutzer suchen, Rolle zuweisen oder entziehen, Benutzer deaktivieren und reaktivieren; Schutz des letzten aktiven Administrators; jede Rollen- und Statusänderung im Audit-Log
7. Startseite (umgesetzt, `docs/features/startseite.md`, ADR-0030 bis ADR-0032): `/` zeigt bis zu fünf Blöcke – Kopfbereich (Titel, Untertitel, Logo des Bereitstellers und der Software), Infotext (eingeschränktes Markdown), Kennzahlen über alle Coins, neueste Coins, meistausgegebene Coins. Administratoren pflegen Ein/Aus, Reihenfolge, Texte, Anzahlen und Logos auf `/verwaltung/startseite` mit Vorschau (`startpage.manage`). Ohne Konfiguration gelten Standardblöcke mit Standardtexten. Den Kopfbereich sehen alle Besucher ohne Anmeldung, die übrigen Blöcke nur mit `coins.read`. Nicht enthalten: freier Layout-Editor, mehrere Sprachen, Startseiten je Rolle, zeitgesteuerte Veröffentlichung, Entwurf/Freigabe, Diagramme.

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

Wird die Vorlage eines Coins ersetzt, erzeugen neue Downloads mit der dann aktiven Vorlage; Nummer und
Ausgabedaten bleiben gleich. Nicht vorgesehen: Sammel- oder Serienausdruck, Archivierung erzeugter Dateien.
Der Platzhalterkatalog bleibt für die Erzeugung unverändert (13 Platzhalter, 4 Pflicht); bestehende
Vorlagen bleiben gültig.

## Datenmodell (grob)
Coin (mit Kennung), Exemplar (Seriennummer), Ausgabe (Person, Datum, Gelegenheit, Zertifikatsnummer), Zertifikatsvorlage (Versionen je Coin), Zertifikat (Nummer, Signatur, Ausstelldatum – Signatur und Ausstelldatum offen), Benutzer/Rolle, Startseitenkonfiguration (eine Konfiguration, zwei Logo-Plätze).

## Nichtfunktionale Anforderungen
- Datenschutz: Zugriff auf Personendaten nur nach Rolle, Änderungen nachvollziehbar (Audit-Log). Umgesetzt für Rollen- und Statusänderungen von Benutzern (ADR-0017) sowie für das Erfassen und Stornieren von Ausgaben (ADR-0020, ohne Empfängerdaten) und für Upload und Zurücksetzen von Zertifikatsvorlagen (ADR-0023) und für den Download von Zertifikaten (ADR-0029) und für Änderungen an der Startseite (`startseite_audit`, ADR-0030, ohne Textinhalte, kein Lese-Endpunkt). Stammdatenänderungen an Coins werden nicht protokolliert (zertifikatsvorlagen F3). Zertifikate enthalten Personendaten; sie landen nicht in Logs und werden auf dem Server nicht zwischengespeichert.
- Zertifikate fälschungssicher (Signatur), Prüfung ohne Preisgabe von Personendaten
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
- [?] Welche Schutzstufe haben die Daten, und wo darf die Anwendung betrieben werden?
- [?] Sprache der Oberfläche (nur Deutsch oder auch Englisch)?

## Erstes Feature (Pilot)
„Coin anlegen und in einer Liste anzeigen“ – inklusive API, Datenbank, Oberfläche, Tests.
