# Anforderungen C.O.I.N.

Status: Entwurf. Offene Punkte sind mit [?] markiert und müssen vom Auftraggeber geklärt werden.

## Rollen
Jeder Benutzer hat genau eine feste Rolle oder keine. Welche Rolle welche Berechtigung hat, legt die
Rechtematrix im Code fest ([berechtigungen.md](berechtigungen.md), ADR-0016). Rollen vergeben
Administratoren in der Benutzerverwaltung.
- **Administrator**: verwaltet Coins, Exemplare, Ausgaben, Benutzer (umgesetzt: Coins erfassen, Auflage ändern, Ausgaben lesen, erfassen und stornieren, Benutzer und Rollen verwalten, Audit-Log lesen)
- **Sachbearbeiter**: erfasst Ausgaben, stellt Zertifikate aus [?] (umgesetzt: Coins erfassen, Auflage ändern, Ausgaben lesen, erfassen und stornieren)
- **Betrachter**: sieht den Katalog und je Coin die Kennzahlen und den Status der Exemplare, aber keine Ausgaben und keine Empfängerdaten (entschieden 2026-10-08, F2, ADR-0021).
- **Öffentlichkeit**: prüft ein Zertifikat per Link/QR-Code, ohne Anmeldung; sieht den Coin-Katalog lesend, ohne Anmeldung

## Funktionen (Stichpunkte)
1. Coin-Katalog: anlegen, bearbeiten, ansehen, Liste mit Suche und Filter (teilweise umgesetzt, `docs/features/coin-katalog.md`, `docs/features/katalog-seiten.md`: anlegen auf eigener Seite, ansehen, Liste mit Suche in Name/Herausgeber und Blättern; noch ohne Filter und Bearbeiten)
2. Exemplare: Seriennummern pro Coin, Status (verfügbar, ausgegeben, ungültig) (teilweise umgesetzt, `docs/features/coin-ausgaben.md`: Exemplare 1 bis Auflage, Status verfügbar/ausgegeben, Kennzahlen, Auflage ändern; noch ohne Status „ungültig“)
3. Ausgaben (früher „Verleihungen“): Empfänger, Datum, Gelegenheit, Begründung, ausgebende Stelle (umgesetzt, `docs/features/coin-ausgaben.md`: erfassen, stornieren mit Grund, Historie; Empfänger als Freitext). Lesen mit `issues.read`, Erfassen und Stornieren mit `issues.write`, beide nur Administrator und Sachbearbeiter (ADR-0021). Ausgabedaten kommen nie in das öffentliche Coin-DTO. Nicht enthalten: Bearbeiten (Korrektur = Storno + neue Ausgabe), Rückgabe, Import.
4. Zertifikate: eindeutige Nummer, digital signiert, PDF-Ausgabe, öffentliche Prüfseite
5. Detailansicht eines Coins mit Ausgabehistorie (umgesetzt, `docs/features/katalog-seiten.md`, `docs/features/coin-ausgaben.md`: Stammdaten, Motivbild, Abschnitt „Exemplare“ mit `coins.read`, Abschnitt „Ausgabehistorie“ mit `issues.read`)
6. Benutzer- und Rollenverwaltung mit Audit-Log (umgesetzt, `docs/features/rollen-benutzerverwaltung.md`): Benutzer suchen, Rolle zuweisen oder entziehen, Benutzer deaktivieren und reaktivieren; Schutz des letzten aktiven Administrators; jede Rollen- und Statusänderung im Audit-Log

## Datenmodell (grob)
Coin, Exemplar (Seriennummer), Ausgabe (Person, Datum, Gelegenheit), Zertifikat (Nummer, Signatur, Ausstelldatum), Benutzer/Rolle.

## Nichtfunktionale Anforderungen
- Datenschutz: Zugriff auf Personendaten nur nach Rolle, Änderungen nachvollziehbar (Audit-Log). Umgesetzt für Rollen- und Statusänderungen von Benutzern (ADR-0017) sowie für das Erfassen und Stornieren von Ausgaben (ADR-0020, ohne Empfängerdaten).
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
  - F3: Die Auflage ist nach dem Anlegen nur über „Auflage ändern“ änderbar; weiteres Bearbeiten von Coins gibt es nicht.
  - F4: Senken der Auflage nur bis zur höchsten je ausgegebenen Nummer (aktiv oder storniert); kein Zurück auf „unbekannt“.
  - F5: „Ausgebende Stelle oder Person“ ist ein Pflicht-Freitext; der Erfasser wird automatisch gespeichert.
  - F6: Das Audit der Ausgaben enthält keine Empfängerdaten. Am Storno-Grund weist die Oberfläche darauf hin, keine Personendaten einzutragen.
  - F7: Kein Lese-Endpunkt für das Ausgabe-Audit; Erfasser und Stornierer stehen in der Historie.
  - F8: Das Datum der Ausgabe ist Pflicht, ein reines Datum und darf nicht in der Zukunft liegen (heute nach Europe/Berlin).
  - F9: Die Obergrenze der Auflage bleibt 1.000.000.
  - F10: Ausgaben samt Empfängerdaten und ihr Audit werden vorerst unbegrenzt aufbewahrt; das Löschkonzept kommt als eigenes späteres Feature.
- [?] Welche Schutzstufe haben die Daten, und wo darf die Anwendung betrieben werden?
- [?] Sprache der Oberfläche (nur Deutsch oder auch Englisch)?

## Erstes Feature (Pilot)
„Coin anlegen und in einer Liste anzeigen“ – inklusive API, Datenbank, Oberfläche, Tests.
