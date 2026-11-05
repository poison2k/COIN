# ADR-0034: Hologrammprüfung – zwei Endpunkte nach Berechtigung, Ratenbegrenzung je Benutzer, gleichförmige Antworten, Prüf-Audit

Status: Angenommen, umgesetzt (Entscheidungen des Auftraggebers vom 2026-11-03, H6–H10 in [hologrammnummer](../features/hologrammnummer.md) Abschnitt 1.2; Rev. 2) · Datum: 2026-11-03 · Feature: [hologrammnummer](../features/hologrammnummer.md) · Ergänzt: [ADR-0016](0016-berechtigungen-im-code-und-deaktivierte-benutzer.md), [ADR-0019](0019-request-protokoll-ohne-personendaten.md), [ADR-0021](0021-rechte-fuer-exemplare-und-ausgaben.md) Punkt 2, [ADR-0033](0033-hologrammnummer-datenmodell-und-normalisierung.md)

## Kontext
Benutzer mit Rolle prüfen auf der Seite „Zertifikat prüfen“, ob eine Hologrammnummer zu einem echten, gültigen Zertifikat gehört. Vorgaben:
- Alle Rollen sehen Coin, Exemplar, Zertifikatsnummer, Ausgabedatum und Status; nur mit `issues.read` zusätzlich Empfänger, Gelegenheit, Begründung und ausgebende Stelle. „Das Backend liefert diese Felder anderen Rollen nicht aus.“
- Ergebnisarten: gültig, storniert, falscher Coin (ohne den anderen Coin zu nennen), nicht gefunden.
- Ratenbegrenzung je Benutzer (etwa 20 Prüfungen je Minute), danach `429` mit deutscher Meldung. „Falscher Coin“ und „nicht gefunden“ mit gleich langen Antwortzeiten und ohne Hinweise, die systematisches Durchprobieren erleichtern.
- Jede Prüfung im Audit: Benutzer, Zeitpunkt, geprüfte Nummer, Ergebnisart, ohne Empfängerdaten.
- Keine öffentliche Prüfung ohne Anmeldung (nicht Teil des Features).

Entscheidungen vom 2026-11-03: zwei Prüf-Endpunkte (H6); bei Storno Datensatz mit Storno-Datum, ohne Grund (H7); 20 je Minute fest im Code, je Instanz, `429` ohne Audit (H8); Mindestdauer 250 ms für alle vier Ergebnisse (H9); kein Lese-Endpunkt, unbegrenzte Aufbewahrung (H10).

ADR-0021 Punkt 2 legt fest: getrennte Endpunkte je Berechtigung statt Feldfilter je Rolle; jeder Endpunkt verlangt genau eine Berechtigung (`docs/berechtigungen.md`). Eine Ratenbegrenzung gibt es in der API bisher nicht.

## Entscheidung
1. **Zwei Endpunkte mit gleichem Request** (H6), beide `[KeinCache]`, `[Inhaltstyp("application/json")]`:
   - `POST /api/pruefung` mit **`coins.read`** (Administrator, Sachbearbeiter, Betrachter = „alle Benutzer mit Rolle“). Antwort-DTO **ohne Felder** für Empfängerdaten und ohne `ausgabeId`; die Abfrage liest die Empfängerspalten gar nicht erst.
   - `POST /api/pruefung/mit-empfaenger` mit **`issues.read`**. Antwort wie oben, zusätzlich `ausgabeId`, `empfaenger`, `gelegenheit`, `begruendung`, `ausgebendeStelle`. Betrachter erhalten `403`.
   - Das Frontend ruft genau einen der beiden auf, abhängig von `issues.read` aus `/api/me`.
   - POST statt GET, damit die Nummer nicht in URL, Browser-Verlauf, Proxy- oder Zugriffslogs steht (ADR-0019 protokolliert nur das Routen-Template, vorgelagerte Systeme aber oft die URL).
2. **Ergebnis in fester Reihenfolge**, ermittelt aus genau einer Abfrage über die aktuelle Zuordnung (`ausgabe_hologramm.abgeloest_am IS NULL`) per Normalform:
   1. keine Zeile → `nichtGefunden` (auch für abgelöste, also korrigierte Nummern);
   2. Coin gewählt und ≠ Coin der Ausgabe → `falscherCoin` (vor der Storno-Prüfung, damit der Status fremder Ausgaben nicht durchscheint; ein unbekannter `coinId` gilt wie ein anderer Coin, kein `404`);
   3. Ausgabe storniert → `storniert` mit Datensatz: Status `storniert` und `storniertAm` (Datum), **ohne Storno-Grund** (H7; Freitext, möglicherweise mit Personendaten), auch nicht auf dem Endpunkt mit Empfänger;
   4. sonst `gueltig` mit Datensatz.
   Bei `nichtGefunden` und `falscherCoin` ist `datensatz` `null`; beide Antworten haben dieselbe Form, denselben Status `200` und dieselben Header.
3. **Gleichförmige Laufzeit** (H9): Jeder Prüfaufruf (alle vier Ergebnisse, beide Endpunkte) führt dieselbe eine Leseabfrage und denselben einen Audit-Insert aus und antwortet frühestens **250 ms** nach Beginn der Verarbeitung im Service (Warten über `TimeProvider`, im Unit-Test mit `FakeTimeProvider` prüfbar). Kein zusätzlicher Abruf für den Coin-Namen bei `falscherCoin`. Die Mindestdauer gilt nicht für `400`/`401`/`403`/`429`.
4. **Ratenbegrenzung** (H8) mit `Microsoft.AspNetCore.RateLimiting` (Bordmittel, kein neues Paket):
   - Policy `pruefung`, **feste Werte im Code** (wie die Token-Prüfparameter nicht per Konfiguration lockerbar): Fixed Window, **20 Anfragen je 60 s**, `QueueLimit = 0`.
   - **Partition je Benutzer** über den Claim `sub` des geprüften Tokens (1:1 zu `benutzer`), nie nach IP. Beide Prüf-Endpunkte nutzen **dieselbe** Policy und damit dasselbe Kontingent.
   - `app.UseRateLimiter()` steht **nach** `UseAuthentication()`/`UseAuthorization()`: `401`/`403` kommen vor `429`, abgelehnte Anmeldungen verbrauchen kein Kontingent, deaktivierte Benutzer erhalten weiter `403`.
   - Überschreitung → `429` ProblemDetails (`title` „Zu viele Prüfungen“, `code` `zu_viele_pruefungen`, `detail` „Sie haben in kurzer Zeit zu viele Prüfungen durchgeführt. Bitte warten Sie einen Moment und versuchen Sie es erneut.“), Header `Retry-After` in ganzen Sekunden (1–60), `Cache-Control: no-store`. **Kein Audit-Eintrag**; der Request steht mit Status `429` im Request-Protokoll (ADR-0019). Keine eigene Warnung mit Benutzerbezug.
   - **In-Memory je API-Instanz.** Bei mehreren Instanzen ist die Grenze effektiv Instanzen × 20. Für den Betrieb mit einer Instanz ausreichend; ein verteilter Zähler wird erst mit der Betriebsentscheidung (requirements: „Betrieb offen“) nötig.
5. **Prüf-Audit `pruefung_audit`** (Muster ADR-0029): `id` (GUID v7), `zeitpunkt`, `akteur_id` (FK `benutzer`), `nummer` (`varchar(40)`, **Normalform** der geprüften Nummer), `coin_id_gewaehlt` (`uuid NULL`, ohne FK), `ergebnis` (`varchar(15)`, Check `Gueltig` | `Storniert` | `FalscherCoin` | `NichtGefunden`), `ausgabe_id` (`uuid NULL`, FK `ausgabe`, gesetzt bei allen Ergebnissen außer `NichtGefunden`), `mit_empfaenger` (`bool`, ob Empfängerdaten ausgeliefert wurden). Indizes auf `akteur_id` und `zeitpunkt`. Unveränderlich per Trigger `trg_pruefung_audit_unveraenderlich`. Keine Empfängerdaten.
   - Geschrieben wird nur für Prüfungen, die ein Ergebnis liefern (`200`). `400`, `401`, `403`, `429` schreiben nichts. Scheitert der Audit-Insert, gibt es kein Ergebnis (`500`).
   - **Kein Lese-Endpunkt** (H10, wie F7/F9 und ADR-0029), Auswertung per SQL. Aufbewahrung unbegrenzt bis zum Löschkonzept; die Tabelle wächst mit jeder Prüfung (höchstens 20 je Benutzer und Minute und Instanz).
6. **Keine Nummern in Anwendungslogs:** Request-DTOs mit wertfreiem `ToString`, keine Log-Aufrufe mit Nummer, Coin oder Ergebnis. Das Audit ist der einzige Ort, an dem geprüfte Nummern gespeichert werden.
7. **403-Texte:** Es gelten die bestehenden Texte je Berechtigung (`coins.read`: „… die Exemplare einzusehen.“, `issues.read`: „… Ausgaben einzusehen.“); das Frontend zeigt eigene Texte (wie zertifikat-erzeugen, Abweichung 6).

## Betrachtete Optionen
| Thema | Option | Bewertung |
|---|---|---|
| Rollenabhängige Felder | ein Endpunkt `coins.read`, Felder je `issues.read` weglassen | widerspricht ADR-0021 Punkt 2 (Feldfilter, nur per Review prüfbar), Endpunkttabelle kann zwei Rechtsstufen nicht abbilden; verworfen (H6) |
| | Prüfung (`coins.read`) liefert `ausgabeId`, Details über `GET …/ausgaben/{ausgabeId}` (`issues.read`) | Prüfantwort selbst enthielte nie Empfängerdaten, `ausgabeId` ginge an Betrachter, zweiter Request ohne Ratenbegrenzung; verworfen (H6) |
| | **zwei Endpunkte, gleicher Service (gewählt)** | eine Berechtigung je Endpunkt, Schutz über Inventar- und Rollentests prüfbar, DTO für Betrachter ohne Personendaten per Konstruktion |
| Storno-Datensatz | nur Hinweis ohne Datensatz; Grund für `issues.read` zeigen | verworfen (H7) |
| | **Datensatz mit Storno-Datum, ohne Grund (gewählt)** | Ausdruck eindeutig zuordenbar, kein Freitext |
| Partition | IP-Adresse | trifft hinter NAT/Proxy viele Benutzer gemeinsam, schützt nicht vor einem Benutzer mit wechselnden Adressen, verworfen |
| | **`sub` aus dem Token (gewählt)** | je Benutzer, ohne DB-Zugriff vor der Begrenzung |
| Verfahren | Sliding Window / Token Bucket | glatter, aber schwerer im Test vorherzusagen; Fixed Window erlaubt an der Fenstergrenze kurz bis zu 40 – hingenommen |
| Werte | konfigurierbar | Sicherheitsparameter bleiben fest im Code (H8) |
| Speicher | verteilter Zähler | erst bei mehreren Instanzen nötig, Betrieb offen (H8) |
| Laufzeit | nur Mindestdauer für `falscherCoin`/`nichtGefunden` | Treffer wären messbar schneller oder langsamer, verworfen (H9) |
| | **gleicher Abfragepfad + Mindestdauer für alle (gewählt)** | Antwortzeit verrät die Ergebnisart nicht; Rest-Schwankungen der DB liegen deutlich unter 250 ms |
| Audit | `zertifikat_audit` erweitern | anderer Zweck (Download), `ausgabe_id` dort Pflicht, verworfen |
| | 429 auditieren | keine Prüfung erfolgt, würde das Audit bei Missbrauch fluten; verworfen (H8) |
| | Anzeige im bestehenden Audit-Log | verworfen (H10) |

## Folgen
- Neue Middleware `UseRateLimiter` im Pipeline-Aufbau (`Program.cs`); andere Endpunkte bleiben unbegrenzt.
- Jede Prüfung dauert mindestens 250 ms; 20 Prüfungen je Minute reichen für Einzelprüfungen, nicht für Massenprüfungen (Sammelprüfung ist „nicht dazu“).
- Betrachter erfahren erstmals Ausgabedatum, Zertifikatsnummer und Status einer einzelnen Ausgabe – nur für eine Nummer, die sie kennen. Empfängerdaten sehen sie weiterhin nie (ADR-0021).
- `falscherCoin` verrät, dass die Nummer existiert; eine Prüfung ohne Coin liefert dann den Datensatz. Das folgt aus der Vorgabe c) und ist hingenommen; die Ratenbegrenzung begrenzt das Durchprobieren.
- Eine korrigierte (abgelöste) Nummer ergibt „nicht gefunden“; ein alter Ausdruck mit falsch eingetragener Nummer ist damit nicht mehr bestätigbar (gewollt, ADR-0033 H1).
- Eine spätere öffentliche Prüfseite braucht einen eigenen Endpunkt mit eigener Begrenzung (z. B. nach IP) und eigenem ADR.
