# Anforderungen C.O.I.N.

Status: Entwurf. Offene Punkte sind mit [?] markiert und müssen vom Auftraggeber geklärt werden.

## Rollen
Jeder Benutzer hat genau eine feste Rolle oder keine. Welche Rolle welche Berechtigung hat, legt die
Rechtematrix im Code fest ([berechtigungen.md](berechtigungen.md), ADR-0016). Rollen vergeben
Administratoren in der Benutzerverwaltung.
- **Administrator**: verwaltet Coins, Exemplare, Verleihungen, Benutzer (umgesetzt: Coins erfassen, Benutzer und Rollen verwalten, Audit-Log lesen)
- **Sachbearbeiter**: legt Verleihungen an, stellt Zertifikate aus [?] (umgesetzt: Coins erfassen)
- **Betrachter**: sieht Katalog (und ggf. Verleihungen) [?]. Heute liest ein Betrachter dasselbe wie die Öffentlichkeit (ADR-0014).
- **Öffentlichkeit**: prüft ein Zertifikat per Link/QR-Code, ohne Anmeldung; sieht den Coin-Katalog lesend, ohne Anmeldung

## Funktionen (Stichpunkte)
1. Coin-Katalog: anlegen, bearbeiten, ansehen, Liste mit Suche und Filter (teilweise umgesetzt, `docs/features/coin-katalog.md`, `docs/features/katalog-seiten.md`: anlegen auf eigener Seite, ansehen, Liste mit Suche in Name/Herausgeber und Blättern; noch ohne Filter und Bearbeiten)
2. Exemplare: Seriennummern pro Coin, Status (verfügbar, verliehen, ungültig)
3. Verleihungen: Empfänger, Datum, Anlass/Begründung, verleihende Stelle. Lesen braucht eine eigene Berechtigung (z. B. `verleihungen.read`) und einen eigenen geschützten Endpunkt; Verleihungsdaten kommen nie in das öffentliche Coin-DTO (katalog-seiten, Annahme A6). Welche Rollen die Berechtigung erhalten, ist offen [?] (siehe Betrachter).
4. Zertifikate: eindeutige Nummer, digital signiert, PDF-Ausgabe, öffentliche Prüfseite
5. Detailansicht eines Coins mit Verleihungshistorie (teilweise umgesetzt, `docs/features/katalog-seiten.md`: Stammdaten und Motivbild; die Verleihungshistorie ist ein Platzhalter ohne Daten)
6. Benutzer- und Rollenverwaltung mit Audit-Log (umgesetzt, `docs/features/rollen-benutzerverwaltung.md`): Benutzer suchen, Rolle zuweisen oder entziehen, Benutzer deaktivieren und reaktivieren; Schutz des letzten aktiven Administrators; jede Rollen- und Statusänderung im Audit-Log

## Datenmodell (grob)
Coin, Exemplar (Seriennummer), Verleihung (Person, Datum, Anlass), Zertifikat (Nummer, Signatur, Ausstelldatum), Benutzer/Rolle.

## Nichtfunktionale Anforderungen
- Datenschutz: Zugriff auf Personendaten nur nach Rolle, Änderungen nachvollziehbar (Audit-Log). Umgesetzt für Rollen- und Statusänderungen von Benutzern (ADR-0017); Audit für weitere Daten (z. B. Verleihungen) folgt mit den jeweiligen Features.
- Zertifikate fälschungssicher (Signatur), Prüfung ohne Preisgabe von Personendaten
- Betrieb: noch offen [?] (lokal, Intranet, Cloud)

## Offene Fragen
- Entschieden (2026-10-05, ADR-0012): Wer authentifiziert sich wie? Anmeldung mit E-Mail und Passwort über Keycloak (OIDC), der in Produktion an das AD angebunden ist. Rollen werden in C.O.I.N. selbst geführt (ADR-0013).
- [?] Werden Empfänger als Freitext oder als Personenstammdaten geführt?
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
  - F5: „Ausgaben“ sind Verleihungen. Die Detailseite zeigt dafür nur einen Platzhalter „Verleihungen“, öffentlich, ohne Daten, Zahlen oder Hinweise auf Personen. Für das Feature Verleihungen sind eine eigene Berechtigung (z. B. `verleihungen.read`) und ein eigener geschützter Endpunkt vorgemerkt; der Abschnitt erscheint dann nur mit dieser Berechtigung.
  - F6: Das Motivbild bleibt im Formular „Coin hinzufügen“, einschließlich „Bild erneut hochladen“ bei einem Teilerfolg.
  - F7: `GET /api/coins` liefert ohne Abwärtskompatibilität das Seiten-Format.
- [?] Welche Schutzstufe haben die Daten, und wo darf die Anwendung betrieben werden?
- [?] Sprache der Oberfläche (nur Deutsch oder auch Englisch)?

## Erstes Feature (Pilot)
„Coin anlegen und in einer Liste anzeigen“ – inklusive API, Datenbank, Oberfläche, Tests.
