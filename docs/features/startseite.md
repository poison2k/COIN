# Feature: Startseite mit konfigurierbaren Blöcken

Status: umgesetzt (Rev. 2 mit den Entscheidungen des Auftraggebers vom 2026-10-26, Abschnitt 12; Änderungen gegenüber Rev. 1 mit *(Rev. 2)* markiert; QA-Freigabe; Abweichungen in Abschnitt 13) · Datum: 2026-10-19, Rev. 2 vom 2026-10-26 · Branch: `feature/startseite` (von `main` bei 627f2df) · ADRs: [0030](../adr/0030-konfigurationsmodell-der-startseite.md) (neu, Konfigurationsmodell), [0031](../adr/0031-startseite-ohne-svg-und-rohes-html.md) (neu, kein SVG, kein rohes HTML), [0032](../adr/0032-sichtbarkeit-der-startseite.md) (neu, Sichtbarkeit, öffentlicher Kopfbereich, `startpage.manage`), [0005](../adr/0005-motivbild-in-postgresql.md), [0006](../adr/0006-bild-upload-als-eigener-endpunkt.md), [0014](../adr/0014-coin-katalog-oeffentlich-lesbar.md), [0016](../adr/0016-berechtigungen-im-code-und-deaktivierte-benutzer.md), [0017](../adr/0017-audit-log-fuer-rollen-und-status.md), [0019](../adr/0019-request-protokoll-ohne-personendaten.md), [0021](../adr/0021-rechte-fuer-exemplare-und-ausgaben.md)

## 1. Ziel
Nach der Anmeldung zeigt `/` eine gefüllte Startseite aus bis zu fünf Blöcken. Administratoren pflegen Blöcke, Reihenfolge, Texte, Anzahl und Logos auf `/verwaltung/startseite` mit Vorschau, ohne Entwickler. *(Rev. 2)* Den Kopfbereich sehen auch anonyme Besucher, Benutzer ohne Rolle und deaktivierte Benutzer (S1). Der Auftrag steht wörtlich im Auftrag zu diesem Branch.

**Nicht dazu:** freier Layout-Editor/Drag-and-Drop, mehrere Sprachen, Startseiten je Rolle, zeitgesteuerte Veröffentlichung, Entwurf/Freigabe, Diagramme, Ausgaben mit Personenbezug, Lese-Endpunkt für das Audit (S7), serverseitiger Cache (S8), Änderungen am Motivbild-Upload.

**Begriffe:**
- *Block*: einer von fünf festen Bausteinen (`kopf`, `infotext`, `kennzahlen`, `neueste`, `meistausgegeben`).
- *Logo-Platz*: `bereitsteller` (Wappen/Logo des Bereitstellers) oder `software` (Logo der Software).
- *Standardkonfiguration*: die Konfiguration aus dem Code, solange nichts gespeichert ist.
- *(Rev. 2)* *Öffentlicher Teil*: Kopfbereich samt Logos, ohne Anmeldung lesbar.

## 2. Ist-Stand (geprüft)
| Punkt | Stand | Folge |
|---|---|---|
| Startseite `/` | `pages/start/StartSeite`: statisch, h1 „Willkommen bei C.O.I.N.“, ein Absatz, Link „Zum Katalog“, kein API-Aufruf, ohne Guard. Viele Vitest-, UI- und Systemtests erwarten dieses h1 (auch angemeldet) | Bei ausgeschaltetem Kopfbereich (Standard) und bei Fehlern bleibt das h1 (AK-21). *(Rev. 2)* Ohne `coins.read` ruft die Seite jetzt `GET /api/startseite/kopf` auf; der Vitest „ruft keine API auf“ wird bewusst ersetzt (9.7) |
| App-Shell/Sidebar | `widgets/app-shell/AppSidebar`: Einträge mit optionaler `berechtigung`, Sichtbarkeit aus `/api/me` | neuer Eintrag mit `startpage.manage` |
| Router | code-basiert, Guards `erfordertBerechtigung` in `beforeLoad`, Seiten ohne Router-Hooks, Props aus `routen-komponenten.tsx` | neue Route `/verwaltung/startseite` |
| Rechte | `Berechtigungen` + `Rechtematrix` (6 Berechtigungen), `/api/me` liefert sortierte `berechtigungen`; Frontend-Typ `Berechtigung` | `startpage.manage` nur Administrator |
| Doku-Tests | `BerechtigungsDokuTests` (Matrix ↔ Code), `EndpunktTabelleTests`, `EndpunktInventarTests` (genau drei anonyme Endpunkte `OeffentlicheKatalogEndpunkte`; jeder geschützte Endpunkt ohne Token `401`) | Tabellen in `docs/berechtigungen.md` eingetragen (Rev. 2). *(Rev. 2)* Der Inventartest erlaubt bewusst fünf anonyme Endpunkte (drei Katalog-Endpunkte, `GET /api/startseite/kopf`, `GET /api/startseite/logos/{platz}`) |
| Bild-Upload | `MultipartDateiLeser` (genau eine Datei im Feld `datei`, 6 MiB Request, 16 Abschnitte, `413` bei Größe), `[FormularBindungDeaktivieren]`, `[RequestSizeLimit(32 MiB)]`, `BildFormatErkennung` nur Magic Bytes, keine Maße, EXIF bleibt; Auslieferung `nosniff`, CSP-Sandbox, `private, immutable`, ETag | Leser für mehrere Teile (ADR-0030 Punkt 4), Kopfanalyse mit Maßen neu (ADR-0031) |
| Upload-Härtung Vorlagen | ADR-0024/0026: Inhalt statt Endung, Befunde als `400 errors.<feld>`, keine Inhalte in Logs, SVG abgelehnt (F15) | Regeln übernommen (Abschnitt 8.1) |
| Audit | `benutzer_audit` (Lese-Endpunkt), `ausgabe_audit`, `vorlage_audit`, `zertifikat_audit` (kein Lese-Endpunkt), alle per Trigger unveränderlich, SQL-INSERT in derselben Transaktion | neue Tabelle `startseite_audit` gleichen Musters |
| HTTP-Helfer | `[KeinCache]` (`no-store`), `DateiDownload.Docx` (Anhang), `AnfrageProtokoll` (nur Routen-Template), CORS nur `GET`/`POST`/`PUT` | Logo-Auslieferung wie Motivbild, Entfernen ohne `DELETE` |
| Öffentliche Endpunkte | ADR-0014: `[AllowAnonymous]`, tokenunabhängig (ungültiges Token → kein `401`), kein `Vary: Authorization`, kein Benutzerabgleich | *(Rev. 2)* gilt ebenso für `…/kopf` und `…/logos/{platz}` |
| Kennzahlen | je Coin in `AusgabeRepository.ExemplareAsync`: Auflage, `ausgegeben` = aktive Ausgaben (`storniert_am IS NULL`), `verfuegbar` = Exemplare − ausgegeben; Exemplare sind genau 1…Auflage (ADR-0020) | Gesamtwerte gleich definiert, `exemplare` = Summe der Auflagen (Abschnitt 6) |
| Indizes | `ux_ausgabe_exemplar_aktiv (coin_id, exemplar_nummer) WHERE storniert_am IS NULL`; kein Index auf `coin_typ.erstellt_am` | Rangliste über den partiellen Index, neuer Index für „Neueste“ |
| Markdown | keine Bibliothek, kein `dangerouslySetInnerHTML` im Frontend | `react-markdown` + `remark-breaks` (ADR-0031, S4) |
| shadcn | vorhanden u. a. `button`, `card`, `input`, `label`, `textarea`, `select`, `tabs`, `alert`, `alert-dialog`, `badge`, `skeleton`, `separator` | neu: `switch` |

## 3. Akzeptanzkriterien

### Anzeige und Standard
- **AK-1** Ohne Zeile in `startseite_konfiguration` gilt die Standardkonfiguration:
  - Reihenfolge `kopf, infotext, kennzahlen, neueste, meistausgegeben`;
  - `kopf` aus (Titel „C.O.I.N.“, Untertitel „Certified Official Issue Numbering“, keine Logos);
  - `infotext` an mit „C.O.I.N. verwaltet die Gedenk-Coins der Bundeswehr: den Katalog der Coins, ihre nummerierten Exemplare und die Echtheitszertifikate.“;
  - `kennzahlen` an; `neueste` an, Anzahl 6; `meistausgegeben` an, Anzahl 5.

  `GET /api/startseite` liefert dann `200` mit genau den Blöcken `infotext, kennzahlen, neueste, meistausgegeben`, auch bei leerer DB (keine Coins, keine Ausgaben), ohne Fehler und ohne DB-Schreibzugriff. *(Rev. 2)* `GET /api/startseite/kopf` liefert `200` `{ "aktiv": false, "position": 1 }`.
- **AK-2** `GET /api/startseite` liefert nur aktive Blöcke in gespeicherter Reihenfolge im Format aus Abschnitt 5.2; Daten inaktiver Blöcke werden nicht abgefragt.
- **AK-3** Kennzahlen (Abschnitt 6, Entscheidung S2):
  - `coins` = Anzahl aller Coins;
  - `exemplare` = Summe der Auflagen (Coins ohne Auflage zählen 0);
  - `ausgegeben` = Anzahl aktiver Ausgaben;
  - `verfuegbar` = `exemplare − ausgegeben`.

  Testdaten: 3 Coins A, B, C mit Auflagen 100, 150, 200; 13 Ausgaben erfasst (A 7, B 5, C 1), die von C storniert → `{coins: 3, exemplare: 450, ausgegeben: 12, verfuegbar: 438}`. Ein zusätzlicher Coin ohne Auflage ergibt `coins: 4`, `exemplare` unverändert.
- **AK-4** „Neueste Coins“: die `anzahl` zuletzt angelegten Coins nach `erstellt_am` absteigend, bei Gleichstand `id` absteigend; je Eintrag `id`, `name`, `herausgeber`, `bildUrl` (wie im Katalog, sonst `null`). Gibt es weniger Coins als `anzahl`, kommen alle.
- **AK-5** „Meistausgegebene Coins“ (S3):
  - nur Coins mit mindestens einer aktiven Ausgabe, absteigend nach Anzahl aktiver Ausgaben;
  - bei Gleichstand nach `lower(name)` aufsteigend, dann `id`; höchstens `anzahl` Einträge;
  - stornierte Ausgaben zählen nicht.

  Testdaten aus AK-3 → `[A (7), B (5)]`, C fehlt. Gleichstand (A 5, B 5) → alphabetisch. Anzahl 3 bei 5 Coins mit Ausgaben → genau 3.
- **AK-6** Leistung (Abschnitt 6):
  - `GET /api/startseite` führt höchstens 4 SQL-Befehle aus, *(Rev. 2)* `GET /api/startseite/kopf` genau 1, unabhängig von der Datenmenge;
  - kein Befehl liest die Tabelle `exemplar` oder die Spalten `empfaenger_*`, `gelegenheit`, `begruendung`, `ausgebende_stelle`, `storno_grund`;
  - mit einem Coin der Auflage 1.000.000 und 1.000 Ausgaben antwortet `GET /api/startseite` in unter 1 s (Testcontainer);
  - beide Antworten tragen `Cache-Control: no-store`.

### Konfiguration (API)
- **AK-7** `GET /api/startseite/konfiguration` (`startpage.manage`) liefert die gespeicherte oder die Standardkonfiguration (`standard: true`, `version: 0`) mit Logo-Metadaten und Vorschaudaten (Kennzahlen, 12 neueste, 10 meistausgegebene; Abschnitt 5.3), `Cache-Control: no-store`.
- **AK-8** `PUT /api/startseite/konfiguration` (`startpage.manage`, `multipart/form-data`, Abschnitt 5.4) ersetzt die Konfiguration als Ganzes. Erfolg: `200` im Format aus AK-7, `version` um 1 erhöht, `geaendertAm`/`geaendertVon` gesetzt. Ein Request ohne inhaltliche Änderung (gleiche Werte, kein Dateiteil) → `200`, Version unverändert, kein Audit.
- **AK-9** Validierung serverseitig mit den Meldungen aus Abschnitt 5.5; alle Feld- und Logobefunde gemeinsam als `400` ValidationProblemDetails. Texte inaktiver Blöcke werden nur auf Länge und Steuerzeichen geprüft. Titel, Untertitel und Alternativtexte werden an den Rändern getrimmt, der Infotext nicht; Zeilenenden werden zu `\n`.
- **AK-10** Logos:
  - ein Dateiteil setzt bzw. ersetzt das Logo des Platzes;
  - `null` ohne Dateiteil entfernt es;
  - ein Objekt ohne Dateiteil behält das vorhandene Logo (Alternativtext änderbar);
  - Objekt ohne Dateiteil und ohne vorhandenes Logo, oder `null` mit Dateiteil → `400` (5.5).

  Konfiguration, Logos und Audit werden in einer Transaktion geschrieben; bei jedem Fehler bleibt alles unverändert.
- **AK-11** Logoprüfung am Inhalt (ADR-0031); Dateiname und deklarierter Typ werden ignoriert. Mit der jeweiligen Meldung aus 5.5 abgelehnt werden:
  - leere Datei;
  - SVG (auch mit Endung `.png`, mit BOM, mit XML-Deklaration, mit `<SVG`);
  - Nicht-Bilddateien mit Bildendung (Text, PDF, HTML, ZIP, GIF, BMP, ICO, SVGZ);
  - PNG/JPEG/WebP mit unvollständigem oder widersprüchlichem Kopf (PNG ohne `IHDR` als ersten Chunk, JPEG ohne `SOFn` vor `SOS`, abgeschnittenes WebP);
  - Breite oder Höhe über 2048 Pixel oder 0;
  - animierte Bilder (APNG, animiertes WebP).

  Datei über 2 MiB → `413` (5.5). Gültig sind PNG, JPEG (Baseline und progressiv) und WebP (`VP8 `, `VP8L`, `VP8X` ohne Animation) bis 2048 × 2048. Metadaten bleiben erhalten (S5).
- **AK-12** *(Rev. 2)* `GET /api/startseite/logos/{platz}` ist **öffentlich** (`[AllowAnonymous]`, tokenunabhängig: ohne Token, mit gültigem, ungültigem oder abgelaufenem Token und für deaktivierte Benutzer dieselbe Antwort, nie `401`/`403`, kein `Vary: Authorization`, kein Benutzerabgleich). Die Antwort enthält die gespeicherten Bytes unverändert und diese Header:
  - `Content-Type` aus dem erkannten Format;
  - `X-Content-Type-Options: nosniff`;
  - `Content-Security-Policy: default-src 'none'; sandbox`;
  - `Content-Disposition: inline; filename="logo-<platz>.<endung>"`;
  - ETag = SHA-256 in Anführungszeichen; passendes `If-None-Match` → `304`.

  Caching (ADR-0032 Punkt 3): `v` gleich den ersten 16 Hex-Zeichen des aktuellen SHA-256 → `Cache-Control: private, max-age=31536000, immutable`; ohne `v` oder mit anderem `v` → `Cache-Control: no-cache` und aktueller Inhalt. Unbekannter Platz oder kein Logo → `404` „Logo nicht gefunden“. Auch bei ausgeschaltetem Kopfbereich wird ein gespeichertes Logo ausgeliefert. Die URLs in den Antworten tragen `?v=<erste 16 Hex-Zeichen>`.
- **AK-13** Gleichzeitigkeit (ADR-0030 Punkt 5, S6): `version` im Request ≠ gespeicherte Version → `409 startseite_geaendert`, nichts wird geändert. Zwei parallele `PUT` mit derselben Version → genau ein `200` und ein `409`; Audit nur für das erfolgreiche.
- **AK-14** Statuscodes in Prüfreihenfolge nach Abschnitt 5.1; `401`/`403` kommen vor jedem Lesen des Bodys (auch bei zu großem oder kaputtem Body).
- **AK-37** *(Rev. 2)* `GET /api/startseite/kopf` ist **öffentlich** und tokenunabhängig (wie AK-12) und liefert das Format aus 5.2a:
  - immer `aktiv` und `position` (1–5, Stelle von `kopf` in der Reihenfolge);
  - nur bei aktivem Kopfbereich `titel`, `untertitel` und `logoBereitsteller`/`logoSoftware` (`url`, `alternativtext`, `breite`, `hoehe`, sonst `null`);
  - bei ausgeschaltetem Kopfbereich weder Texte noch Logos.

  Die Antwort enthält nie Kennzahlen, Coins, Infotext, Anzahlen, `version`, `geaendertAm`, `geaendertVon` oder Angaben zu Hochladenden. Sie trägt `Cache-Control: no-store`. Nach einem `PUT` liefert der nächste Abruf den neuen Stand.

### Rechte, Audit, Datenschutz
- **AK-15** *(Rev. 2)* Rechte (Integrationstest als Theory):

  | Endpunkt | Administrator | Sachbearbeiter | Betrachter | keine Rolle | deaktiviert | anonym | ungültiges Token |
  |---|---|---|---|---|---|---|---|
  | `GET /api/startseite/kopf` | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
  | `GET /api/startseite/logos/{platz}` (Logo vorhanden) | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
  | `GET /api/startseite` | 200 | 200 | 200 | 403 | 403 | 401 | 401 |
  | `GET /api/startseite/konfiguration` | 200 | 403 | 403 | 403 | 403 | 401 | 401 |
  | `PUT /api/startseite/konfiguration` | 200 | 403 | 403 | 403 | 403 | 401 | 401 |

  Die öffentlichen Antworten sind für alle Spalten byte-gleich. `403` trägt `code` `keine_berechtigung` bzw. `benutzer_deaktiviert` wie bisher. `startpage.manage` steht nur beim Administrator in `Rechtematrix` und in `/api/me`.
- **AK-16** *(Rev. 2)* `docs/berechtigungen.md` nach Abschnitt 5.6 (eingetragen). `BerechtigungsDokuTests`, `EndpunktTabelleTests` und `EndpunktInventarTests` sind grün. Bewusst ergänzt werden nur die erwarteten Daten:
  - Policy `startpage.manage`;
  - die Zuordnungen der fünf Endpunkte;
  - die anonymen Endpunkte jetzt die drei Katalog-Endpunkte plus `GET /api/startseite/kopf` und `GET /api/startseite/logos/{platz}` (der Test „genau die drei Katalog-Lese-Endpunkte“ wird entsprechend umbenannt und erweitert; in Development kommt weiterhin nur OpenAPI hinzu).
- **AK-17** *(Rev. 2)* Keine Empfänger- oder Personendaten. Aufbau: Ausgaben, deren Empfänger, Dienstgrad, Dienststelle, Gelegenheit, Begründung, ausgebende Stelle und Storno-Grund eindeutige Testwerte tragen; alle fünf Blöcke aktiv. Dann enthält keine der folgenden Antworten einen dieser Werte, und auch nicht den Namen eines Erfassers, Stornierers, Hochladenden oder Speichernden (Suche im Antworttext):
  - `GET /api/startseite` als Betrachter;
  - `GET /api/startseite/konfiguration` als Administrator (Ausnahme: `geaendertVon`, S11);
  - `GET /api/startseite/kopf` und die Logo-Antworten als anonymer Besucher.

  Die öffentlichen DTOs haben keine Felder dafür.
- **AK-18** Audit (ADR-0030 Punkt 7, S7): Jede gespeicherte Änderung schreibt in derselben Transaktion je Änderung eine Zeile in `startseite_audit` mit der `version` des Speichervorgangs, Akteur, Zeitpunkt und Art nach Abschnitt 4.3; beim ersten Speichern gegen die Standardkonfiguration.
  - Test: Block `kennzahlen` aus, Reihenfolge geändert, Infotext geändert, Logo hochgeladen → genau 4 Zeilen (`BlockAusgeschaltet` `kennzahlen`; `ReihenfolgeGeaendert` mit alter und neuer Folge; `InfotextGeaendert` ohne `alt`/`neu`; `LogoHochgeladen` mit SHA-256).
  - Kein Spaltenwert enthält Titel-, Untertitel-, Infotext- oder Alternativtext-Inhalte (Suche nach eindeutigen Testwerten).
  - `UPDATE`/`DELETE` per SQL scheitern (Trigger). Abgelehnte Requests schreiben nichts. Kein Lese-Endpunkt.
- **AK-19** Logs: Weder Texte der Konfiguration noch Dateinamen, Logo-Bytes, Maße aus Meldungen oder Ausnahmetexte des Formularlesers erscheinen im Log. Das Request-Protokoll enthält nur die Routen-Templates `/api/startseite…` (Integrationstest Muster `LogTests`).

### Frontend
- **AK-20** `/` für Benutzer **mit** `coins.read`: lädt nur `GET /api/startseite` (nicht zusätzlich `…/kopf`) und zeigt die Blöcke in Reihenfolge (Widget `StartseiteBloecke`, Abschnitt 7).
  - *Kopfbereich:* Logo Bereitsteller (links), Titel, Untertitel, Logo Software (rechts), auf schmalen Bildschirmen untereinander. Logos per `<img src>` (öffentliche URL, *(Rev. 2)*), höchstens 96 px hoch, `width`/`height` aus der API, auf heller Fläche in beiden Themes.
  - *Infotext:* über `MarkdownText`.
  - *Kennzahlen:* als `<dl>` mit „Coins“, „Exemplare gesamt“, „Ausgegeben“, „Verfügbar“ (Zahlen `de-DE`).
  - *Neueste:* Liste mit Motivbild (`alt=""`, 48 px), Name als Link auf `/coins/{id}`, Herausgeber darunter; leer: „Noch keine Coins im Katalog.“
  - *Meistausgegebene:* `<ol>` mit Name (Link) und „{n} ausgegeben“; leer: „Noch keine Coins ausgegeben.“
  - Kennzahlen, Neueste und Meistausgegebene stehen ab `md` im responsiven Raster nebeneinander, sonst untereinander. Am Ende der Link „Zum Katalog“.
- **AK-21** *(Rev. 2)* Überschriften (S9), für alle Besucher gleich:
  - Ist `kopf` aktiv, ist sein Titel das einzige h1; sonst h1 „Willkommen bei C.O.I.N.“.
  - Während des Ladens gibt es kein h1, nur `role="status"` „Startseite wird geladen …“. Danach erscheint das h1 nach dieser Regel.
  - Bei einem Fehler gilt h1 „Willkommen bei C.O.I.N.“. Benutzer mit `coins.read` sehen zusätzlich `role="alert"` „Die Startseite konnte nicht geladen werden. Bitte später erneut versuchen.“; ohne `coins.read` gibt es keine Fehlermeldung, sondern die statische Begrüßung.
  - „Zum Katalog“ ist in jedem Zustand vorhanden.
  - Blöcke als `<section aria-labelledby>` mit h2 „Kennzahlen“, „Neueste Coins“, „Meistausgegebene Coins“; der Infotext als `<section aria-label="Information">` ohne h2.
- **AK-22** *(Rev. 2)* `/` für Anonyme, Benutzer ohne Rolle und Deaktivierte (ohne `coins.read`): ruft genau einen Endpunkt der Startseite auf, `GET /api/startseite/kopf`, nie `GET /api/startseite`.
  - Kopfbereich aktiv: Er steht an der Stelle der statischen Begrüßung (Titel als h1, Untertitel, Logos per `<img src>` mit Alternativtext); der bisherige Einleitungsabsatz entfällt; darunter „Zum Katalog“.
  - Kopfbereich aus oder Abruf fehlgeschlagen: unverändert die statische Seite (h1 „Willkommen bei C.O.I.N.“, bisheriger Absatz, „Zum Katalog“).
  - In keinem Fall erscheinen Infotext, Kennzahlen oder Coin-Listen.
  - `StartSeite` ohne Props verhält sich so.
- **AK-23** Infotext-Darstellung (ADR-0031 Punkt 6, S4):
  - `**fett**` → `<strong>`, `*kursiv*` → `<em>`, `- `/`1. ` → Listen;
  - Leerzeile → neuer Absatz, Zeilenumbruch → `<br>`;
  - `[Text](https://…)` → Link mit `rel="noopener noreferrer"`, `target="_blank"` und sr-only „(öffnet in neuem Tab)“; `mailto:` und relative Pfade `/…` ohne `target`;
  - rohes HTML wird entfernt; andere Markdown-Elemente erscheinen als Text; Bilder entfallen ohne Abruf.
- **AK-24** XSS: Ein Infotext mit folgenden Nutzlasten wird gerendert:
  - `<script>window.__xss=1</script>`, `<img src=x onerror="window.__xss=2">`, `<svg onload="window.__xss=3">`, `<iframe src="javascript:…">`;
  - `[a](javascript:window.__xss=4)`, `[b](JAVASCRIPT:…)`, `[c](java&#x09;script:…)`, `[d](data:text/html,…)`, `[e](vbscript:…)`, `[f](//evil.example)`, `<a href="javascript:…">g</a>`;
  - `![x](https://evil.example/x.png)`.

  Erwartet: kein `script`-, `img`-, `svg`- oder `iframe`-Element und kein Attribut `on*` im DOM; kein `href` mit anderem Ziel als `http`, `https`, `mailto` oder relativem `/`-Pfad; kein Netzwerkabruf von `evil.example`; `window.__xss` bleibt `undefined`; kein Dialog öffnet sich. Gilt auf `/` und in der Vorschau. *(Rev. 2)* Titel, Untertitel und Alternativtexte mit denselben Nutzlasten erscheinen als reiner Text, auch für anonyme Besucher. Im Frontend gibt es kein `dangerouslySetInnerHTML` (Code-Test).
- **AK-25** Sidebar: Eintrag „Startseite verwalten“ (Icon `LayoutDashboardIcon`, `aria-hidden`) nach „Benutzerverwaltung“, nur mit `startpage.manage`; für Betrachter, Sachbearbeiter, Benutzer ohne Rolle und Anonyme nicht im DOM.
- **AK-26** Route `/verwaltung/startseite` (`ROUTEN.startseiteVerwaltung`), `beforeLoad: erfordertBerechtigung('startpage.manage')`:
  - anonym → Anmeldung mit Rückkehr;
  - ohne Rolle/deaktiviert → `/kein-zugriff`;
  - Betrachter/Sachbearbeiter → `/kein-zugriff?grund=berechtigung`;
  - ohne die Berechtigung kein Aufruf von `…/konfiguration`.
- **AK-27** Konfigurationsseite: h1 „Startseite verwalten“; `Tabs` „Bearbeiten“ und „Vorschau“. Unter „Bearbeiten“ steht je Block in aktueller Reihenfolge eine `Card` mit h2 (Blockname), `Switch` „{Block} anzeigen“, Buttons „{Block} nach oben verschieben“ / „{Block} nach unten verschieben“ (Icons mit diesem `aria-label`; am Rand `aria-disabled`, fokussierbar) und diesen Feldern:
  - *Kopfbereich:* „Titel“ (Pflicht, wenn angezeigt), „Untertitel“. Je Logo-Platz („Logo des Bereitstellers“ bzw. „Logo der Software“): aktuelle Vorschau, Dateifeld „Logo auswählen“ (`accept="image/png,image/jpeg,image/webp"`), Button „Logo entfernen“, Feld „Alternativtext“ (Pflicht, sobald ein Logo vorhanden oder ausgewählt ist). Hinweise: „PNG, JPEG oder WebP, höchstens 2 MB und 2048 × 2048 Pixel. SVG und animierte Bilder sind nicht erlaubt.“, „Bitte nur Bilder ohne personenbezogene Metadaten hochladen.“ und *(Rev. 2)* „Kopfbereich und Logos sind auch ohne Anmeldung sichtbar.“
  - *Infotext:* `Textarea` „Infotext“ mit Zähler „{n} von 5.000 Zeichen“ und Hilfe „Formatierung: **fett**, *kursiv*, Listen mit „- “ oder „1. “, Links als [Text](https://…). HTML wird nicht angezeigt. Bitte keine personenbezogenen Daten eintragen.“ (per `aria-describedby`).
  - *Neueste/Meistausgegebene:* `Select` „Anzahl“ (3–12 bzw. 3–10).
  - „Speichern“ und „Änderungen verwerfen“ (bestätigt per `AlertDialog`).
  - Ist eine Konfiguration gespeichert, steht „Zuletzt gespeichert am {Datum} von {geaendertVon}“ unter der Überschrift (S11).
- **AK-28** Verschieben: Nach „nach oben/unten“ steht der Block an der neuen Stelle, der Fokus bleibt auf demselben Button des verschobenen Blocks, und `role="status"` meldet „{Block} steht jetzt an Position {p} von 5.“
- **AK-29** Vorschau: zeigt mit dem aktuellen, ungespeicherten Formularzustand dasselbe Widget wie `/` für Benutzer mit Rolle.
  - Basisebene h2, damit die Seite genau ein h1 hat.
  - Daten aus `daten`, gekürzt auf die eingestellte Anzahl.
  - Neu ausgewählte Logos als Object-URL der Datei (freigegeben beim Ersetzen und Verlassen); entfernte Logos fehlen.
  - `<section aria-label="Vorschau der Startseite">`.
- **AK-30** Client-Vorprüfung (maßgeblich bleibt der Server): Pflichtfelder, Längen, Dateityp laut Browser und Größe ≤ 2 MiB mit den Meldungen aus 5.5.
  - Fehler als Feldfehler (`aria-invalid`, `aria-describedby`), Zusammenfassung `role="alert"` „Bitte die markierten Eingaben prüfen.“, Fokus auf das erste ungültige Feld.
  - Serverfehler: `400` als Feldfehler (Schlüssel aus 5.5); `413` am Logo-Feld aus `feld` bzw. als Zusammenfassung; `409 startseite_geaendert` als `role="alert"` mit Button „Neu laden“; `401`/`403` mit den bestehenden Texten.
  - Eingaben und ausgewählte Dateien bleiben bei jedem Fehler erhalten.
- **AK-31** Nach `200`: `role="status"` „Die Startseite wurde gespeichert.“, Fokus auf die Meldung, Formular auf dem neuen Stand (neue `version`). Benutzer und *(Rev. 2)* anonyme Besucher (Kopfbereich) sehen die Änderung nach dem Neuladen von `/`.
- **AK-32** Ungespeicherte Änderungen: Verlassen der Seite über die App (Sidebar, Links) fragt per `AlertDialog` „Ungespeicherte Änderungen“ / „Die Änderungen an der Startseite sind nicht gespeichert. Seite trotzdem verlassen?“ („Verlassen“, „Bleiben“). Neuladen und Schließen sind per `beforeunload` abgesichert.
- **AK-33** Barrierefreiheit (WCAG 2.1 AA / BITV) auf `/` (alle Besuchergruppen) und `/verwaltung/startseite`:
  - genau ein h1 nach dem Laden;
  - alles per Tastatur bedienbar in sinnvoller Reihenfolge (Tabs mit Pfeiltasten, Switch mit Leertaste, Select, Dateifeld, Verschieben);
  - sichtbarer Fokus (`focus-visible`);
  - alle Bedienelemente mit deutschem zugänglichem Namen;
  - Logos mit Alternativtext aus der Konfiguration, Motivbilder in Listen dekorativ;
  - Zustände nicht nur über Farbe;
  - Textkontrast ≥ 4,5 : 1 im hellen und dunklen Theme (Kennzahlen, Hinweise, Links);
  - Links im Infotext unterstrichen; keine Animationen.
- **AK-34** FSD nach Abschnitt 7: `npm run lint` (ESLint + Steiger) ohne Befund, keine Querimporte, Seiten ohne Router-Hooks. `entities/benutzer` kennt `startpage.manage`. `abhaengigkeiten.test.ts` bleibt unverändert grün (keine Rollennamen für Sichtbarkeit; die Unterscheidung „mit/ohne `coins.read`“ kommt aus `berechtigungen`).

### Abschluss
- **AK-35** Migration `Startseite` (Abschnitt 4); Integrationstests leeren die neuen Tabellen (Liste in der Testbasis ergänzt).
- **AK-36** Systemtest `e2e/tests/startseite.spec.ts` (Abschnitt 9.5). Grün sind: `dotnet build` ohne Warnungen, `dotnet test`, `npm test`, `npm run test:ui`, `npm run lint`, `npm run build` und `npx playwright test` in `e2e/`. Doku nach Abschnitt 10.

## 4. Datenmodell und Migration
Migration `Startseite` (EF Core; Trigger und Array-Check per SQL).

### 4.1 `startseite_konfiguration` (höchstens eine Zeile)
| Spalte | Typ | Regel |
|---|---|---|
| `id` | `smallint` PK | Check `id = 1` |
| `version` | `int` | ≥ 1 |
| `reihenfolge` | `varchar(20)[]` | Check `cardinality(reihenfolge) = 5 AND reihenfolge @> ARRAY['kopf','infotext','kennzahlen','neueste','meistausgegeben']` |
| `kopf_aktiv`, `infotext_aktiv`, `kennzahlen_aktiv`, `neueste_aktiv`, `meistausgegeben_aktiv` | `boolean` | Pflicht |
| `kopf_titel` | `varchar(100)` | Pflicht (leer erlaubt); Check `NOT kopf_aktiv OR btrim(kopf_titel) <> ''` |
| `kopf_untertitel` | `varchar(200)` | Pflicht (leer erlaubt) |
| `infotext` | `varchar(5000)` | Pflicht (leer erlaubt); Check `NOT infotext_aktiv OR btrim(infotext) <> ''` |
| `neueste_anzahl` | `smallint` | 3–12 |
| `meistausgegeben_anzahl` | `smallint` | 3–10 |
| `geaendert_am` | `timestamptz` | Pflicht |
| `geaendert_von` | `uuid` | FK `benutzer`, `RESTRICT` |

### 4.2 `startseite_logo` (je Platz höchstens eine Zeile)
| Spalte | Typ | Regel |
|---|---|---|
| `platz` | `varchar(20)` PK | Check `IN ('bereitsteller','software')` |
| `inhalt` | `bytea` | Pflicht |
| `format` | `varchar(10)` | Werte wie `coin_bild.format` |
| `groesse_bytes` | `int` | 1–2.097.152 |
| `breite`, `hoehe` | `int` | je 1–2048 |
| `sha256` | `char(64)` | Pflicht |
| `alternativtext` | `varchar(200)` | Check `btrim(alternativtext) <> ''` |
| `hochgeladen_am` | `timestamptz` | Pflicht |
| `hochgeladen_von` | `uuid` | FK `benutzer`, `RESTRICT`; nie in einem öffentlichen DTO |

Metadaten werden nie zusammen mit `inhalt` gelesen; die Bytes liest nur der Logo-Endpunkt.

### 4.3 `startseite_audit` (unveränderlich)
Spalten: `id uuid` (v7), `zeitpunkt timestamptz`, `akteur_id uuid` (FK `benutzer`, `RESTRICT`), `version int`, `art varchar(30)`, `ziel varchar(20) NULL`, `alt varchar(64) NULL`, `neu varchar(64) NULL`. Index `(zeitpunkt)`. Trigger `trg_startseite_audit_unveraenderlich` (Funktion `startseite_audit_unveraenderlich()`): kein `UPDATE`/`DELETE`, `TRUNCATE` bleibt möglich. Check-Constraint je Art:

| `art` | `ziel` | `alt` | `neu` |
|---|---|---|---|
| `BlockEingeschaltet`, `BlockAusgeschaltet` | Blockart | – | – |
| `ReihenfolgeGeaendert` | – | alte Folge `kopf,infotext,…` | neue Folge |
| `TitelGeaendert`, `UntertitelGeaendert`, `InfotextGeaendert` | – | – | – |
| `AnzahlGeaendert` | `neueste` / `meistausgegeben` | alte Zahl | neue Zahl |
| `LogoHochgeladen` | Platz | – | SHA-256 |
| `LogoErsetzt` | Platz | alter SHA-256 | neuer SHA-256 |
| `LogoEntfernt` | Platz | alter SHA-256 | – |
| `AlternativtextGeaendert` | Platz | – | – |

Zeilen eines Vorgangs in dieser Reihenfolge: Blöcke in Standardreihenfolge, dann Reihenfolge, Texte, Anzahl, Logos. Ein unveränderter Wert ergibt keine Zeile; ein Logo mit gleichem SHA-256 gilt als unverändert.

### 4.4 Weitere Änderungen
- Index `ix_coin_typ_erstellt (erstellt_am DESC, id DESC)` für „Neueste“.
- Keine Änderung an bestehenden Tabellen und Triggern; die Down-Migration entfernt alles wieder.

## 5. API

### 5.1 Endpunkte und Prüfreihenfolge
| Endpunkt | Zugriff | Reihenfolge der Antworten |
|---|---|---|
| *(Rev. 2)* `GET /api/startseite/kopf` | öffentlich, tokenunabhängig | `200` |
| *(Rev. 2)* `GET /api/startseite/logos/{platz}` | öffentlich, tokenunabhängig | `404` (Platz unbekannt oder ohne Logo) → `304`/`200` |
| `GET /api/startseite` | `coins.read` | `401` → `403` → `200` |
| `GET /api/startseite/konfiguration` | `startpage.manage` | `401` → `403` → `200` |
| `PUT /api/startseite/konfiguration` | `startpage.manage` | `401` → `403` → `415` (kein `multipart/form-data`, `[Inhaltstyp]`) → `413` (Request > 6 MiB, Logo > 2 MiB, Teil `konfiguration` > 64 KiB) → `400 anfrage` (Formular kaputt, unbekannter oder doppelter Teil) → `400 konfiguration` (Teil fehlt, kein gültiges JSON) → `400` Feld- und Logobefunde (gesammelt) → `409 startseite_geaendert` → `200` |

Hinweise zur Umsetzung:
- `{platz}` bekommt keinen Route-Constraint; unbekannte Werte ergeben `404` in der Aktion.
- Die öffentlichen Endpunkte tragen `[AllowAnonymous]` (Begründung ADR-0032) und führen keinen Benutzerabgleich aus.
- `PUT` mit `[FormularBindungDeaktivieren]` und `[RequestSizeLimit(32 MiB)]`. Gelesen wird mit dem neuen `MultipartFormularLeser` (ADR-0030 Punkt 4): erlaubt sind `konfiguration` ohne Dateiname sowie `logoBereitsteller`/`logoSoftware` mit Dateiname, je höchstens einmal.
- Alle Antworten außer den Logos tragen `Cache-Control: no-store`.
- Controller bilden nur ab; die Logik liegt in `StartseiteService` (Domain).

### 5.2 `GET /api/startseite`
```json
{
  "bloecke": [
    { "art": "kopf", "titel": "C.O.I.N.", "untertitel": "Certified Official Issue Numbering",
      "logoBereitsteller": { "url": "/api/startseite/logos/bereitsteller?v=0123456789abcdef", "alternativtext": "Wappen …", "breite": 400, "hoehe": 480 },
      "logoSoftware": null },
    { "art": "infotext", "text": "…Markdown-Quelle…" },
    { "art": "kennzahlen", "coins": 3, "exemplare": 450, "ausgegeben": 12, "verfuegbar": 438 },
    { "art": "neueste", "eintraege": [ { "id": "…", "name": "…", "herausgeber": "…", "bildUrl": "/api/coins/…/bild?v=…" } ] },
    { "art": "meistausgegeben", "eintraege": [ { "id": "…", "name": "…", "herausgeber": "…", "ausgegeben": 7 } ] }
  ]
}
```

### 5.2a *(Rev. 2)* `GET /api/startseite/kopf`
Aktiv:
```json
{ "aktiv": true, "position": 1, "titel": "C.O.I.N.", "untertitel": "Certified Official Issue Numbering",
  "logoBereitsteller": { "url": "/api/startseite/logos/bereitsteller?v=0123456789abcdef", "alternativtext": "Wappen …", "breite": 400, "hoehe": 480 },
  "logoSoftware": null }
```
Ausgeschaltet: `{ "aktiv": false, "position": 3 }`. `position` ist die Stelle von `kopf` in der gespeicherten Reihenfolge. Anonyme Besucher sehen nur den Kopfbereich; die Position dient der Vollständigkeit der öffentlichen Angabe und hat auf `/` ohne Rolle keine sichtbare Wirkung.

### 5.3 `GET /api/startseite/konfiguration`
```json
{
  "version": 3, "standard": false, "geaendertAm": "2026-10-19T08:00:00Z", "geaendertVon": "Anzeigename",
  "reihenfolge": ["kopf", "infotext", "kennzahlen", "neueste", "meistausgegeben"],
  "kopf": { "aktiv": true, "titel": "…", "untertitel": "…",
            "logoBereitsteller": { "url": "…", "alternativtext": "…", "format": "png", "breite": 400, "hoehe": 480, "groesseBytes": 51234 },
            "logoSoftware": null },
  "infotext": { "aktiv": true, "text": "…" },
  "kennzahlen": { "aktiv": true },
  "neueste": { "aktiv": true, "anzahl": 6 },
  "meistausgegeben": { "aktiv": true, "anzahl": 5 },
  "daten": { "kennzahlen": { "coins": 3, "exemplare": 450, "ausgegeben": 12, "verfuegbar": 438 },
             "neueste": [ "bis 12 Einträge, Format 5.2" ], "meistausgegeben": [ "bis 10 Einträge, Format 5.2" ] }
}
```
Ohne gespeicherte Konfiguration: `version: 0`, `standard: true`, `geaendertAm`/`geaendertVon` `null`.

### 5.4 `PUT /api/startseite/konfiguration` (multipart/form-data)
- Teil `konfiguration` (Pflicht, JSON): Felder wie in 5.3, ohne `standard`, `geaendert*`, `daten` und ohne Logo-Metadaten. `version` = geladene Version (0 ohne gespeicherte Konfiguration). Logo-Plätze: `{ "alternativtext": "…" }` oder `null`. Unbekannte Felder werden ignoriert.
- Teile `logoBereitsteller`, `logoSoftware` (optional, je eine Datei).
- Antwort `200` wie in 5.3.

### 5.5 Fehler (wörtlich)
| Schlüssel / Status | Meldung |
|---|---|
| `anfrage` | Meldungen des Formularlesers: „Die Anfrage ist kein gültiges multipart/form-data.“, „Die Anfrage enthält unbekannte oder doppelte Formularfelder.“, „Die Anfrage konnte nicht gelesen werden.“ |
| `konfiguration` | „Die Konfiguration fehlt.“ / „Die Konfiguration ist kein gültiges JSON.“ |
| `version` | „Ungültiger Wert für dieses Feld.“ (fehlt oder < 0) |
| `reihenfolge` | „Die Reihenfolge muss jeden Block genau einmal enthalten.“ |
| `kopf.titel` | „Bitte einen Titel eingeben oder den Kopfbereich ausschalten.“ / „Der Titel darf höchstens 100 Zeichen lang sein.“ |
| `kopf.untertitel` | „Der Untertitel darf höchstens 200 Zeichen lang sein.“ |
| `kopf.logoBereitsteller.alternativtext`, `kopf.logoSoftware.alternativtext` | „Bitte einen Alternativtext für das Logo des Bereitstellers eingeben.“ (bzw. „… für das Logo der Software …“, auch bei `null` mit Dateiteil) / „Der Alternativtext darf höchstens 200 Zeichen lang sein.“ |
| `infotext.text` | „Bitte einen Infotext eingeben oder den Block ausschalten.“ / „Der Infotext darf höchstens 5.000 Zeichen lang sein.“ |
| jedes Textfeld | „Der Text enthält unzulässige Steuerzeichen.“ (erlaubt sind `\n`, `\r`, `\t`) |
| `neueste.anzahl` / `meistausgegeben.anzahl` | „Die Anzahl muss zwischen 3 und 12 liegen.“ / „Die Anzahl muss zwischen 3 und 10 liegen.“ |
| Feld fehlt oder falscher JSON-Typ | „Ungültiger Wert für dieses Feld.“ |
| `logoBereitsteller` / `logoSoftware` | „Bitte eine Bilddatei für das Logo des Bereitstellers auswählen.“ (bzw. „… der Software …“) · „Die Datei ist leer.“ · „SVG-Dateien sind nicht erlaubt. Bitte das Logo als PNG, JPEG oder WebP hochladen.“ · „Die Datei ist kein Bild im Format PNG, JPEG oder WebP.“ · „Die Bilddatei ist beschädigt oder unvollständig.“ · „Das Logo ist {b} × {h} Pixel groß; erlaubt sind höchstens 2048 × 2048 Pixel.“ · „Animierte Bilder sind nicht erlaubt.“ |
| `413` | `title` „Datei zu groß“, `code` `datei_zu_gross`, `feld` `logoBereitsteller`/`logoSoftware`/`konfiguration`/`anfrage`, `detail` „Das Logo des Bereitstellers darf höchstens 2 MB groß sein.“ bzw. „… der Software …“ / „Die Konfiguration ist zu groß.“ / „Die Anfrage ist zu groß. Logos dürfen höchstens 2 MB groß sein.“ |
| `409` | `title` „Speichern nicht möglich“, `code` `startseite_geaendert`, `detail` „Die Startseite wurde inzwischen geändert. Bitte die Seite neu laden.“ |
| `404` (Logo) | `title` „Logo nicht gefunden“ |

Prüfreihenfolge je Logodatei:
1. leer;
2. Magic Bytes – ohne Treffer folgt die SVG-Erkennung: Beginnt der Text nach optionalem UTF-8-BOM und Leerraum mit `<` und enthält er in den ersten 4 KiB `<svg` (ohne Groß-/Kleinschreibung), kommt die SVG-Meldung, sonst „kein Bild“;
3. Kopf und Maße;
4. Animation;
5. Pixelgrenze.

Je Datei gibt es genau eine Meldung.

### 5.6 `docs/berechtigungen.md` (eingetragen, Rev. 2)
- **Rechtematrix:** neue Zeile `startpage.manage` „Startseite konfigurieren: Blöcke, Reihenfolge, Texte, Logos“, nur Administrator. `coins.read` erhält in „Bedeutung“ zusätzlich „Startseite mit Kennzahlen und Coins“ und den Hinweis, dass der Kopfbereich öffentlich ist.
- **Endpunkttabelle:**
  - `GET /api/startseite/kopf`, `GET /api/startseite/logos/{platz}` → öffentlich;
  - `GET /api/startseite` → `coins.read`;
  - `GET /api/startseite/konfiguration`, `PUT /api/startseite/konfiguration` → `startpage.manage`.
- **Erläuterungsabsatz** zur Startseite.

## 6. Auswertungen und Leistung
- **Kennzahlen** in einem Befehl: `count(*)` und `coalesce(sum(auflage), 0)` über `coin_typ`, dazu als Teilabfrage `count(*)` über `ausgabe WHERE storniert_am IS NULL` (ein Snapshot). Die Tabelle `exemplar` wird nicht gelesen; die Gleichheit `sum(auflage) = count(exemplar)` (ADR-0020) sichert ein Integrationstest ab.
- **Neueste:** `ORDER BY erstellt_am DESC, id DESC LIMIT n` über `ix_coin_typ_erstellt`; die Bildversion kommt aus `coin_bild.sha256`, ohne `inhalt`.
- **Meistausgegebene:** `SELECT coin_id, count(*) FROM ausgabe WHERE storniert_am IS NULL GROUP BY coin_id` (Index-only über `ux_ausgabe_exemplar_aktiv`), Join auf `coin_typ`, Sortierung nach AK-5, `LIMIT n`.
- **Konfiguration und Logo-Metadaten** in einem Befehl (ohne `inhalt`); *(Rev. 2)* für `…/kopf` ist das der einzige Befehl.
- Zusammen höchstens 4 Befehle (AK-6). Kein Cache (ADR-0030 Punkt 8, S8).

## 7. Frontend (FSD)
```
shared/ui/switch.tsx (neu, shadcn Base UI)   nach `npx shadcn add switch` den Diff prüfen (deutsche Texte, cn aus @/shared/lib/cn)
shared/ui/markdown.tsx (neu)                 MarkdownText({ text }) – einzige Markdown-Stelle, Konfiguration nach ADR-0031
shared/config/routen.ts                      + startseiteVerwaltung: '/verwaltung/startseite'
entities/benutzer (geändert)                 Berechtigung + 'startpage.manage'
entities/startseite (neu)
  model/types.ts      BlockArt, BLOCK_NAMEN (deutsch), LogoPlatz, StartseiteAnsicht, KopfAnsicht, Block-Typen,
                      Konfiguration, Kennzahlen, Grenzen (TITEL_MAX 100, UNTERTITEL_MAX 200, INFOTEXT_MAX 5000,
                      ALTTEXT_MAX 200, LOGO_MAX_BYTES, LOGO_MAX_PIXEL, ANZAHL_GRENZEN)
  api/startseite.ts   ladeStartseite(), ladeKopf() (öffentlich), ladeKonfiguration()
  lib/use-datei-url.ts  Object-URL für ein ausgewähltes File (Vorschau), Freigabe beim Wechsel/Unmount
  ui/                 Kopfbereich (Logos per <img src>), InfotextBlock (MarkdownText), KennzahlenBlock,
                      NeuesteCoinsBlock, MeistausgegebeneBlock
  index.ts            Typen, Grenzen, BLOCK_NAMEN, ladeStartseite, ladeKopf, ladeKonfiguration, useDateiUrl,
                      Block-Komponenten
widgets/startseite (neu)
  ui/StartseiteBloecke.tsx  { bloecke, ebene: 1 | 2 } – Blöcke in Reihenfolge, Raster, Überschriften nach AK-21
                            (Ebene 2 in der Vorschau)
  index.ts            StartseiteBloecke
features/startseite-konfigurieren (neu)
  model/formular.ts   Formularzustand aus Konfiguration, verschiebe(), schalte(), zuAnsicht(formular, daten) für die
                      Vorschau, istGeaendert(), validiere()
  model/validiereLogo.ts  Typ (image/png|jpeg|webp) und Größe
  api/speichereKonfiguration.ts  FormData mit Teilen nach 5.4, Fehlerabbildung nach 5.5
  ui/StartseiteFormular.tsx, ui/BlockKarte.tsx, ui/LogoFeld.tsx, ui/VerschiebenButtons.tsx
  index.ts            StartseiteFormular, zuAnsicht, Typen
pages/start (geändert)            StartSeite({ darfAnsehen = false }) – ohne Recht: ladeKopf(), Kopfbereich oder
                                  statische Begrüßung (AK-22); mit Recht: ladeStartseite() und Widget (AK-20, AK-21)
pages/startseite-verwaltung (neu) StartseiteVerwaltungSeite({ onGeaendert(dirty) }) – lädt die Konfiguration, Tabs mit
                                  Formular (feature) und Vorschau (widget)
app/router                        Route /verwaltung/startseite mit Guard; StartRoute und StartseiteVerwaltungRoute in
                                  routen-komponenten.tsx (darfAnsehen = hatBerechtigung(benutzer, 'coins.read');
                                  useBlocker + AlertDialog für AK-32)
widgets/app-shell                 Sidebar-Eintrag „Startseite verwalten“ (startpage.manage)
```
- shadcn-Komponenten: vorhanden `button`, `card`, `input`, `label`, `textarea`, `select`, `tabs`, `alert`, `alert-dialog`, `skeleton`, `separator`; neu `switch`.
- Neue npm-Abhängigkeiten: `react-markdown`, `remark-breaks` (S4).
- *(Rev. 2)* Logos werden überall per `<img src>` über die öffentliche URL geladen, kein Blob-Abruf mit Token.

## 8. Sicherheit, Datenschutz, Barrierefreiheit
### 8.1 Datei-Uploads (abgeleitet aus ADR-0005/0006/0024/0026, hier angewandt)
- Hochgeladene Dateien sind nicht vertrauenswürdig. Typ nur am Inhalt; feste Formate per Positivliste, SVG nie.
- Größe beim Lesen begrenzt (`413`), Struktur begrenzt (Teile, Maße).
- Verarbeitung nur im Speicher, nie im Dateisystem; Speicherung unter festem Schlüssel ohne Originalnamen.
- Auslieferung mit erkanntem Content-Type, `nosniff`, CSP-Sandbox und generiertem ASCII-Namen.
- Dateinamen, Inhalte und Parser-Ausnahmen nie im Log; Befunde als `400 errors.<feld>` mit deutscher Meldung ohne Dateiinhalt.

### 8.2 Weitere Punkte
- XSS: ADR-0031; React escaped alle Texte; kein `dangerouslySetInnerHTML` (Code-Test). Restrisiko: Die SPA hat keine CSP (A5).
- Rechte nur über Berechtigungen (`coins.read`, `startpage.manage`), nie über Rollen; das Frontend leitet sie aus `/api/me` ab.
- *(Rev. 2)* Öffentlicher Teil (ADR-0032):
  - `…/kopf` und `…/logos/{platz}` sind tokenunabhängig und liefern keine Personendaten, kein `geaendertVon`, kein `hochgeladenVon` und keine Daten anderer Blöcke.
  - Titel, Untertitel, Alternativtexte und Logos sind damit für jeden mit Netzzugriff sichtbar; gespeicherte Logos auch bei ausgeschaltetem Kopfbereich. Hinweis in der Oberfläche (AK-27) und in der Anwenderdoku.
- Datenschutz:
  - Keine Ausgaben-, Empfänger- oder Akteursdaten in Startseiten-DTOs (AK-17); `geaendertVon` nur mit `startpage.manage`.
  - Der Infotext kann Personendaten enthalten, wenn eine Administratorin sie einträgt → Hinweis am Feld; das Audit enthält keine Inhalte.
  - Logos können EXIF/XMP enthalten → Hinweis (S5).
- Logs: nur das Request-Protokoll; Service und Formularleser loggen keine Inhalte (AK-19). DTOs und Requests überschreiben `ToString()` ohne Werte.
- Barrierefreiheit: AK-21, AK-27 bis AK-29, AK-33.

## 9. Testplan
### 9.1 Unit (`tests/Coin.UnitTests`)
- **Kopfanalyse der Logos:**
  - Maße für PNG, JPEG (Baseline, progressiv, mit APP-Segmenten vor `SOF`), WebP `VP8 `/`VP8L`/`VP8X`;
  - Grenzen 2048/2049 und 0;
  - abgeschnittene Köpfe, Segmentlänge außerhalb der Datei, `SOS` vor `SOF`, PNG ohne `IHDR` als ersten Chunk;
  - APNG, animiertes WebP;
  - SVG-Erkennung (BOM, Leerraum, `<?xml`, `<SVG`); HTML, Text und PDF → „kein Bild“;
  - Prüfreihenfolge aus 5.5; lineare Laufzeit bei 2 MiB aus vielen Segmenten.
- **Konfiguration:** Standardwerte (AK-1), Validierung und Meldungen (5.5), Trimmen, Zeilenenden, Steuerzeichen, Reihenfolge als Permutation. *(Rev. 2)* Abbildung auf die öffentliche Kopfansicht: aktiv mit Texten und Logos, inaktiv nur `aktiv`/`position`.
- **Audit:** Änderungen → Audit-Einträge (4.3), auch gegen den Standard; keine Einträge ohne Änderung; Logo mit gleichem Hash gilt als unverändert.
- **Rechte:** `Rechtematrix` mit `startpage.manage` nur beim Administrator; `BerechtigungsDokuTests` grün.

### 9.2 Integration (`tests/Coin.IntegrationTests/Startseite`)
- **Grundfunktion:** Standard ohne Zeile; Round-Trip PUT/GET inkl. Reihenfolge und Abschalten, der Betrachter liest die Änderung; Validierung (alle Meldungen, gesammelt).
- **Logo-Upload:**
  - abgelehnt: SVG, umbenannte Text-/PDF-/HTML-Datei, 2 MiB + 1 Byte (`413` mit `feld`), 2049 × 10 Pixel, APNG, beschädigter Kopf, Request > 6 MiB, unbekannte und doppelte Teile;
  - chunked; Body nach `401`/`403` nicht gelesen;
  - Ersetzen, Entfernen, Alternativtext ändern.
- **Logo-Endpunkt:** Header, `304`, `404`. *(Rev. 2)* Cache-Control mit aktuellem `v` (`immutable`), ohne `v` und mit veraltetem `v` (`no-cache`, aktueller Inhalt); nach Ersetzen neue URL; nach Entfernen `404`; Auslieferung bei ausgeschaltetem Kopfbereich.
- *(Rev. 2)* **`GET /api/startseite/kopf`** (AK-37):
  - aktiv: Texte und Logo-URLs vorhanden; inaktiv: nur `aktiv`/`position`, ohne Titel aus der DB (Suche nach eindeutigem Testtitel);
  - keine Kennzahlen, Coin-Namen oder Infotext-Testwerte in der Antwort;
  - `no-store`; neuer Stand nach PUT; genau 1 SQL-Befehl.
- *(Rev. 2)* **Tokenunabhängigkeit** (AK-12, AK-37): `…/kopf` und `…/logos/{platz}` liefern anonym, mit ungültigem bzw. abgelaufenem Token, als deaktivierter Benutzer, ohne Rolle und als Betrachter dieselben Bytes und `200`; kein `Vary: Authorization`; kein Benutzer wird angelegt bzw. abgeglichen.
- *(Rev. 2)* **Gegenprobe für Besucher ohne `coins.read`:** Anonym, ohne Rolle und deaktiviert erhalten auf `GET /api/startseite` `401`/`403`/`403`, und deren Bodys enthalten weder Kennzahlen noch Coin-Namen.
- **Rechte und Datenschutz:** Rechte-Theory AK-15; Empfängerdaten AK-17 inkl. der öffentlichen Endpunkte als anonymer Besucher.
- **Auswertungen:** Kennzahlen und Ranglisten mit den Testdaten aus AK-3/AK-5 inkl. Storno und Gleichstand; `sum(auflage) = count(exemplar)`; Leistung AK-6 (Befehlszähler per `DbCommandInterceptor`, große Auflage).
- **Speichern und Audit:** Version/`409` und parallele PUTs; Audit AK-18 inkl. Trigger.
- **Sonstiges:** Logs AK-19; Migration Up/Down.
- **Doku-Abgleich:** `EndpunktTabelleTests` mit den neuen Daten; *(Rev. 2)* `EndpunktInventarTests` mit fünf anonymen Endpunkten (9.7).

### 9.3 Vitest (`web/src`)
- **`shared/ui/markdown`:** Formatierung, Links (`rel`, `target`, sr-only), Schemata, XSS-Nutzlasten aus AK-24 (DOM ohne `script`/`img`/`svg`/`iframe`/`on*`, kein unzulässiges `href`), Bilder ohne `<img>`.
- **`entities/startseite`:** Blöcke, Zahlen `de-DE`, Leerzustände, Logo mit Alternativtext und `width`/`height`, `useDateiUrl` gibt Object-URLs frei.
- **`widgets/startseite`:** Reihenfolge, inaktive Blöcke fehlen, Überschriftenebenen 1/2, genau ein h1.
- **`features/startseite-konfigurieren`:** Verschieben inkl. Fokus und Statusmeldung, Validierung, `validiereLogo`, FormData-Aufbau (Teile, `null`, Version), Fehlerabbildung 400/413/409, Hinweis „auch ohne Anmeldung sichtbar“.
- *(Rev. 2)* **`pages/start` ohne Recht:**
  - ruft nur `GET /api/startseite/kopf` auf, nie `/api/startseite`;
  - Kopf aktiv → Titel als einziges h1, Logos mit Alternativtext, kein Einleitungsabsatz, „Zum Katalog“;
  - Kopf aus → statische Begrüßung;
  - Fehler → statische Begrüßung ohne Fehlermeldung;
  - beim Laden kein h1, `role="status"`;
  - Titel mit XSS-Nutzlast erscheint als Text.
- **`pages/start` mit Recht:** ruft nur `/api/startseite` auf; Laden/Fehler/h1 nach AK-21.
- **`pages/startseite-verwaltung`:** Tabs, Vorschau entspricht dem Formular, `onGeaendert`, Anzeige „Zuletzt gespeichert …“.
- **`app`:** Sidebar-Eintrag nur mit `startpage.manage`, Guard der Route, Code-Test „kein `dangerouslySetInnerHTML`“.

### 9.4 Playwright-UI mit gemockter API (`web/ui-tests/startseite.spec.ts`)
- Standardstartseite für Betrachter.
- **Administrator:** Block aus, Reihenfolge per Tastatur ändern, speichern (Request-Teile geprüft), danach `/` neu laden mit gemockter neuer Antwort.
- **XSS:** Nutzlasten im echten Chromium auf `/` und in der Vorschau (`window.__xss` undefiniert, kein `dialog`-Ereignis, kein Request an `evil.example`).
- **Betrachter und Sachbearbeiter:** kein Menüpunkt, Direktaufruf → „Kein Zugriff“.
- **Fehleranzeigen:** 400/413/409; ungespeicherte Änderungen; reine Tastaturbedienung der Konfigurationsseite mit sichtbarem Fokus.
- *(Rev. 2)* **Anonym** mit gemocktem `…/kopf` (aktiv): Kopfbereich mit Titel als h1 und Logo (`img` mit Alternativtext); kein Request auf `/api/startseite`; keine Kennzahlen. Mit inaktivem Kopf: „Willkommen bei C.O.I.N.“. Der Titel mit XSS-Nutzlast bleibt wirkungslos.

### 9.5 Systemtest mit echter API (`e2e/tests/startseite.spec.ts`)
1. Frische DB, Betrachter: Standardblöcke, h1 „Willkommen bei C.O.I.N.“, keine Fehlermeldung.
2. Administrator lädt ein PNG-Logo (im Test erzeugt) mit Alternativtext hoch, schaltet den Kopfbereich ein, ändert den Infotext und speichert. Ein Betrachter meldet sich an und sieht das Logo (`img` mit Alternativtext, vollständig geladen) und den Infotext. *(Rev. 2)* Ein anonymer Besucher (neuer Browser-Kontext ohne Anmeldung) sieht Titel und Logo, aber weder Infotext noch Kennzahlen.
3. Administrator schaltet „Kennzahlen“ aus, verschiebt „Meistausgegebene Coins“ nach oben und speichert; der Betrachter sieht nach dem Neuladen die neue Reihenfolge ohne Kennzahlen.
4. Upload einer SVG-Datei zeigt „SVG-Dateien sind nicht erlaubt. …“ am Feld; nichts wird gespeichert.
5. Betrachter: kein Menüpunkt; `/verwaltung/startseite` → „Kein Zugriff“.

### 9.6 Zuordnung „Fertig, wenn“
| Punkt aus dem Auftrag | AK | Tests |
|---|---|---|
| Ohne Konfiguration Standardblöcke mit Standardtexten, ohne Fehler | AK-1, AK-21, AK-22 | Integration „Standard ohne Zeile“; Vitest `pages/start`, `widgets/startseite`; UI-Test Standardstartseite; e2e 9.5-1 |
| Administrator schaltet Block ab, ändert Reihenfolge, speichert; Benutzer sehen es nach dem Neuladen | AK-2, AK-8, AK-28, AK-31 | Integration Round-Trip (Betrachter liest nach PUT); Vitest Verschieben; UI-Test Admin-Fluss; e2e 9.5-3 |
| SVG, umbenannte Nicht-Bilddatei und zu großes Bild mit konkreter Meldung abgelehnt (Integrationstests) | AK-11, 5.5 | Integration Logoprüfung (SVG, `.png`-Textdatei, 2 MiB + 1 → `413`, 2049 px); Unit Kopfanalyse; e2e 9.5-4 |
| Infotext mit `<script>` und `onerror` wirkungslos, geprüft am gerenderten Ergebnis | AK-23, AK-24 | Vitest `markdown` und `pages/start` (DOM); UI-Test in Chromium (`window.__xss`, kein Dialog) auf `/` und in der Vorschau |
| Betrachter und Sachbearbeiter: `403` auf die Konfigurations-API, kein Menüpunkt | AK-15, AK-25, AK-26 | Integration Rechte-Theory; Vitest Sidebar/Guard; UI-Test; e2e 9.5-5 |
| Keine Empfängerdaten für Betrachter (alle Blöcke) | AK-17 | Integration mit eindeutigen Testwerten, alle Blöcke aktiv, als Betrachter, Administrator und *(Rev. 2)* anonym auf den öffentlichen Endpunkten |
| Kennzahlen und Rangliste stimmen mit Testdaten (3 Coins, 450 Exemplare, 12 ausgegeben) | AK-3, AK-5 | Integration Auswertungen |
| Playwright: Administrator lädt Logo hoch, ändert Infotext, speichert; Betrachter sieht beides | AK-10, AK-20, AK-31 | e2e 9.5-2 |
| *(Rev. 2, Entscheidung S1)* Kopfbereich auch für Anonyme, ohne Rolle, deaktiviert; Kennzahlen und Coins nicht | AK-12, AK-15, AK-22, AK-37 | Integration Tokenunabhängigkeit und Gegenprobe; Vitest `pages/start` ohne Recht; UI-Test anonym; e2e 9.5-2 (anonym) |

### 9.7 *(Rev. 2)* Bestehende Tests, die bewusst angepasst werden
- `web/src/pages/start/ui/StartSeite.test.tsx` „ruft keine API auf“: wird ersetzt durch „ruft ohne Recht nur `GET /api/startseite/kopf` auf“. Die übrigen Fälle dort (h1, Absatz, „Zum Katalog“) gelten weiter für inaktiven Kopf bzw. Fehler; der Test-Router braucht dafür einen `fetch`-Mock.
- `tests/Coin.IntegrationTests/Anmeldung/EndpunktInventarTests.cs`: `OeffentlicheKatalogEndpunkte` bzw. der Test „genau die drei Katalog-Lese-Endpunkte“ wird auf die fünf öffentlichen Endpunkte erweitert (Name anpassen). „In Development kommt nur OpenAPI hinzu“ vergleicht gegen die erweiterte Liste.
- Vitest-, UI- und Systemtests, die auf `/` das h1 „Willkommen bei C.O.I.N.“ erwarten, bleiben gültig, solange der Kopfbereich aus ist (Standard) oder der Abruf scheitert. Tests, die sofort und synchron nach dem Rendern ein h1 erwarten oder alle `fetch`-Aufrufe zählen, prüft der tester und passt sie an, wo der neue Aufruf `…/kopf` bzw. `/api/startseite` sie berührt. Das gilt besonders für `App*.test.tsx` und `web/ui-tests/*` mit eng gefassten Fetch- oder Route-Mocks.

## 10. Doku-Bedarf
- `docs/api.md`: Abschnitt „Startseite“ (5.1–5.5) inkl. *(Rev. 2)* der öffentlichen Endpunkte `…/kopf` und `…/logos/{platz}` und ihrer Cache-Regeln; Fehlerschlüssel `anfrage`, `konfiguration`, `kopf.*`, `infotext.text`, `*.anzahl`, `logo*`; Codes `startseite_geaendert`, `datei_zu_gross` mit `feld`; `/api/me`-Beispiel mit `startpage.manage`.
- `docs/berechtigungen.md`: eingetragen (5.6, Rev. 2).
- *(Rev. 2)* `docs/requirements.md`: **Nachtrag durch docs** – Funktion 7 „Startseite“, Rolle Öffentlichkeit (sieht den Kopfbereich der Startseite), die Entscheidungen S1–S11 vom 2026-10-26 unter „Offene Fragen“, Datenschutz (Audit der Startseite).
- `docs/adr/0014-coin-katalog-oeffentlich-lesbar.md`: Nachtrag durch docs, Verweis „ergänzt durch ADR-0032“ (die Liste der öffentlichen Endpunkte wächst um zwei).
- `docs/benutzer/startseite.md` (neu): Pflege der Startseite, erlaubte Formatierung, Logo-Anforderungen, Umwandlung von SVG in PNG, Metadaten-Hinweis, *(Rev. 2)* Hinweis auf die öffentliche Sichtbarkeit von Kopfbereich und Logos.
- `CLAUDE.md` (Hauptkontext):
  - „Aktueller Stand“ und Fachbegriffe (Block, Logo-Platz, öffentlicher Teil);
  - unter „Sicherheit“ die erweiterte Liste der öffentlichen Endpunkte;
  - **neuer Abschnitt „Datei-Uploads“** mit den Regeln aus 8.1. Vorschlag:
  > ## Datei-Uploads
  > - Hochgeladene Dateien sind nicht vertrauenswürdig. Typ nur am Inhalt (Magic Bytes, Struktur), nie an Endung oder deklariertem Content-Type; feste Positivliste der Formate, SVG nie.
  > - Größe beim Lesen begrenzen (`MultipartDateiLeser`/`MultipartFormularLeser`, `[FormularBindungDeaktivieren]`, `[RequestSizeLimit]` höher als die fachliche Grenze), Überschreitung `413` als ProblemDetails; Strukturgrenzen (Teile, Einträge, Tiefe, Pixel) prüfen.
  > - Verarbeitung nur im Speicher, nie im Dateisystem; Speicherung in PostgreSQL (`bytea`) ohne Originalnamen und deklarierten Typ (ADR-0005, ADR-0023, ADR-0030).
  > - Auslieferung mit erkanntem Content-Type, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, generiertem ASCII-Dateinamen; Downloads mit Personendaten `no-store`, öffentliche Bilder mit versionierter URL und ETag (ADR-0014, ADR-0032).
  > - Dateinamen, Dateiinhalte, Metadaten und Parser-Ausnahmen nie loggen; Befunde als `400 errors.<feld>` mit deutscher Meldung ohne Dateiinhalt (ADR-0024, ADR-0026, ADR-0031).
  > - Im Frontend kein `dangerouslySetInnerHTML`; vom Benutzer formatierter Text nur über `MarkdownText` (ADR-0031).

## 11. Annahmen
- A1 „2 MB“ = 2 MiB (2.097.152 Bytes), wie „5 MB“ bei Motivbild und Vorlage.
- A2 Kennzahlen „über alle Coins“ ohne Filter; Coins ohne Auflage zählen bei „Coins“, nicht bei „Exemplare“.
- A3 *(Rev. 2)* Logos werden auch bei ausgeschaltetem Kopfbereich gespeichert und bleiben **öffentlich** abrufbar (ADR-0032 Punkt 2).
- A4 Logos erscheinen auch im dunklen Theme auf heller Fläche, damit dunkle Logos sichtbar bleiben (Logos sind von WCAG 1.4.3 ausgenommen).
- A5 Eine CSP für die SPA ist nicht Teil dieses Features (Betrieb/Hosting offen, requirements); Schutz über React-Escaping und ADR-0031.
- A6 Keine Begrenzung gleichzeitiger Uploads per Semaphore wie bei den Vorlagen: Die Logoprüfung liest nur Köpfe (linear, ≤ 2 MiB je Datei).
- A7 *(Rev. 2)* Ohne `coins.read` ersetzt ein aktiver Kopfbereich h1 und Einleitungsabsatz der statischen Begrüßung; der Link „Zum Katalog“ bleibt („an der Stelle der statischen Begrüßung“).

## 12. Entscheidungen des Auftraggebers (2026-10-26)
1. **S1 Sichtbarkeit:** Kopfbereich (Titel, Untertitel, Logos mit Alternativtext, aktiv und Position) öffentlich, auch für Benutzer ohne Rolle und Deaktivierte; die übrigen Blöcke nur mit `coins.read`. Umsetzung: eigener öffentlicher Endpunkt `GET /api/startseite/kopf`, öffentlicher Logo-Endpunkt, Caching mit versionierter URL und ETag (ADR-0032). *Abweichend von der Empfehlung aus Rev. 1.*
2. **S2 Kennzahlen:** aktive Ausgaben; „verfügbar“ = Exemplare − aktive Ausgaben; „Exemplare gesamt“ = Summe der Auflagen.
3. **S3 Rangliste:** nur Coins mit aktiver Ausgabe; Gleichstand alphabetisch; fortlaufende Plätze.
4. **S4 Markdown:** `react-markdown` + `remark-breaks`, HTML entfernen, Links `http`/`https`/`mailto`/`/…`, externe Links in neuem Tab mit Hinweis, Zeilenumbruch bleibt.
5. **S5 Logos:** höchstens 2048 × 2048, keine Animation, Metadaten bleiben, Hinweis in der Oberfläche.
6. **S6 Speichern:** atomar in einem Request; Versionsprüfung mit `409`.
7. **S7 Audit:** Granularität nach 4.3, kein Lese-Endpunkt, unbegrenzte Aufbewahrung bis zum Löschkonzept.
8. **S8 Cache:** kein Server-Cache, `no-store` (Logos nach ADR-0032 Punkt 3).
9. **S9 Überschrift:** Ist der Kopfbereich aktiv, ist sein Titel für alle Besucher das h1; sonst „Willkommen bei C.O.I.N.“. Standardtexte wie AK-1.
10. **S10 Grenzen:** Titel 100, Untertitel 200, Alternativtext 200, Infotext 5.000 Zeichen.
11. **S11 `geaendertVon`:** wird Administratoren auf der Konfigurationsseite angezeigt, nie öffentlich.

Offene Fragen: keine.

## 13. Umsetzung und Abweichungen vom Entwurf
Umgesetzt auf `feature/startseite`, von QA freigegeben. Migration `20261026100926_Startseite`. Tests: `tests/Coin.UnitTests` (Kopfanalyse, Konfiguration, Audit, Rechtematrix), `tests/Coin.IntegrationTests/Startseite/*`, Vitest in den Slices aus Abschnitt 7 und `web/src/app/markdown-sicherheit.test.ts` (kein `dangerouslySetInnerHTML`), `web/ui-tests/startseite.spec.ts` (Mocks in `startseite-mocks.ts`), `e2e/tests/startseite.spec.ts` (PNG-Erzeugung in `e2e/tests/hilfen/png.ts`; stellt am Ende die Standardwerte wieder her). Doku: [api.md](../api.md#startseite), [benutzer/startseite.md](../benutzer/startseite.md), Nachtrag in ADR-0014 und `requirements.md` (Funktion 7, S1–S11).

### Abweichungen und Präzisierungen
1. **`403`-Texte:** `GET /api/startseite` liefert ohne `coins.read` das bestehende `detail` „Ihr Benutzerkonto ist nicht berechtigt, die Exemplare einzusehen.“; für `startpage.manage` gibt es keinen eigenen Text, es gilt der allgemeine „Ihr Benutzerkonto ist für diese Aktion nicht berechtigt.“ Das Frontend zeigt beim Speichern eigenständig „Sie sind nicht berechtigt, die Startseite zu verwalten.“
2. **Formularleser (5.5 `anfrage`):** Auch ein Teil mit falscher Art (Datei statt Feld bzw. umgekehrt) und mehr als 16 Abschnitte ergeben „Die Anfrage enthält unbekannte oder doppelte Formularfelder.“ Unzulässige Teile werden bis zum Ende mitgelesen, damit die Größengrenze (`413 anfrage`) zuerst greift.
3. **Teil `konfiguration`:** Ein JSON-Wert, der kein Objekt ist, oder eine Verschachtelung über 16 Ebenen gilt als „Die Konfiguration ist kein gültiges JSON.“ Fehlende Felder werden für die weitere Prüfung durch Standardwerte ersetzt, damit alle Befunde gemeinsam gemeldet werden.
4. **`StartSeite`** hat zusätzlich die Prop `bereit`: Solange die Anmeldung geprüft wird, zeigt die Seite nur „Startseite wird geladen …“ und ruft noch keinen Endpunkt auf.
5. **Konfigurationsseite, zusätzliche Zustände:** Ladefehler „Die Konfiguration der Startseite konnte nicht geladen werden. Bitte später erneut versuchen.“ mit „Erneut versuchen“; nach „Neu laden“ (409) die Statusmeldung „Die Konfiguration wurde neu geladen.“ (Fokus darauf), bei Fehlschlag „Die Konfiguration konnte nicht neu geladen werden. Bitte später erneut versuchen.“ – Formular und Eingaben bleiben dann erhalten. „Neu laden“ ersetzt die ungespeicherten Eingaben durch den Serverstand.
6. **Logo-Feld:** „Logo entfernen“ meldet per `role="status"` „{Logo-Platz} entfernt.“ und setzt den Fokus auf das Dateifeld desselben Platzes. Die Vorschau im Feld nutzt ohne Alternativtext `alt` „Vorschau des ausgewählten Logos“.
7. **„Änderungen verwerfen“:** Dialog „Änderungen verwerfen?“ / „Alle ungespeicherten Änderungen an der Startseite gehen verloren.“ mit „Verwerfen“ und „Abbrechen“.
8. **„Zuletzt gespeichert am …“:** Zeitpunkt als `TT.MM.JJJJ, HH:MM Uhr` (Europe/Berlin).
