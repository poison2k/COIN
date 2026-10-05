# Anforderungen C.O.I.N.

Status: Entwurf. Offene Punkte sind mit [?] markiert und müssen vom Auftraggeber geklärt werden.

## Rollen
- **Administrator**: verwaltet Coins, Exemplare, Verleihungen, Benutzer
- **Sachbearbeiter**: legt Verleihungen an, stellt Zertifikate aus [?]
- **Betrachter**: sieht Katalog (und ggf. Verleihungen) [?]
- **Öffentlichkeit**: prüft ein Zertifikat per Link/QR-Code, ohne Anmeldung

## Funktionen (Stichpunkte)
1. Coin-Katalog: anlegen, bearbeiten, ansehen, Liste mit Suche und Filter
2. Exemplare: Seriennummern pro Coin, Status (verfügbar, verliehen, ungültig)
3. Verleihungen: Empfänger, Datum, Anlass/Begründung, verleihende Stelle
4. Zertifikate: eindeutige Nummer, digital signiert, PDF-Ausgabe, öffentliche Prüfseite
5. Detailansicht eines Coins mit Verleihungshistorie

## Datenmodell (grob)
Coin, Exemplar (Seriennummer), Verleihung (Person, Datum, Anlass), Zertifikat (Nummer, Signatur, Ausstelldatum), Benutzer/Rolle.

## Nichtfunktionale Anforderungen
- Datenschutz: Zugriff auf Personendaten nur nach Rolle, Änderungen nachvollziehbar (Audit-Log)
- Zertifikate fälschungssicher (Signatur), Prüfung ohne Preisgabe von Personendaten
- Betrieb: noch offen [?] (lokal, Intranet, Cloud)

## Offene Fragen
- [?] Wer authentifiziert sich wie (lokale Konten, Active Directory, SSO)?
- [?] Werden Empfänger als Freitext oder als Personenstammdaten geführt?
- [?] Darf die Öffentlichkeit den Coin-Katalog sehen oder nur Zertifikate prüfen?
- [?] Welche Schutzstufe haben die Daten, und wo darf die Anwendung betrieben werden?
- [?] Sprache der Oberfläche (nur Deutsch oder auch Englisch)?

## Erstes Feature (Pilot)
„Coin anlegen und in einer Liste anzeigen“ – inklusive API, Datenbank, Oberfläche, Tests.
