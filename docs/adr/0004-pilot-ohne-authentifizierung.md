# ADR-0004: Pilot ohne Authentifizierung

Status: Angenommen (vom Auftraggeber bestätigt am 2026-10-05) · Datum: 2026-10-05 · Feature: coin-katalog

## Kontext
Die Authentifizierungsmethode (lokale Konten, Active Directory, SSO) ist in `docs/requirements.md` offen. Der Pilot „Coin anlegen und anzeigen“ verarbeitet nur Katalogdaten und Motivbilder ohne Personenbezug.

## Entscheidung
- Der Pilot wird ohne Authentifizierung und Autorisierung gebaut und nur lokal/in der Entwicklung betrieben.
- Endpunkte werden so strukturiert, dass Policies (z. B. `KatalogSchreiben` für POST/PUT, `KatalogLesen` für GET) später ohne Umbau der Logik ergänzt werden können.
- Vor jedem Betrieb außerhalb der Entwicklung und vor jedem Feature mit Personendaten (Verleihungen) wird Authentifizierung als eigenes Feature umgesetzt; dabei wird auch CSRF-Schutz (insbesondere für multipart-Uploads) betrachtet.
- Kein Audit-Log im Pilot, da ohne Anmeldung kein Akteur bekannt ist.

## Folgen
- Schneller technischer Durchstich ohne Vorentscheidung zur Auth-Methode.
- Bis zur Auth-Einführung kann jeder mit Netzzugriff Coins anlegen und Bilder hochladen; daher kein produktiver Betrieb.
- Tests für Berechtigungen kommen mit dem Auth-Feature hinzu.
