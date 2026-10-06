# ADR-0019: Request-Protokoll ohne Personendaten (eigene Middleware)

Status: Angenommen (umgesetzt; Umfang vom Auftraggeber am 2026-10-06 bestätigt) · Datum: 2026-10-06 · Feature: rollen-benutzerverwaltung (Rev. 3)

## Kontext
ADR-0017 Punkt 5 setzt die Kategorie `Microsoft.AspNetCore.Hosting.Diagnostics` fest auf `Warning`, weil sie jede Request-URL samt Query-String loggt (z. B. `GET /api/benutzer?suche=<Name oder E-Mail>`). Dadurch fehlen im Betrieb die Request-Einträge mit Methode, Status und Dauer, die für Fehlersuche und Betrieb gebraucht werden. Logs dürfen weiterhin keine Tokens, Header, Namen, E-Mails oder sonstigen Personendaten enthalten (CLAUDE.md, AK-22).

## Entscheidung
1. Eine eigene Middleware `AnfrageProtokoll` (`src/Coin.Api/Http/AnfrageProtokoll.cs`) schreibt für jeden Request genau einen Eintrag in der Kategorie `Coin.Api.Http.AnfrageProtokoll`, Level `Information`, EventId `4601` (`AnfrageBeendet`), Vorlage `HTTP {Methode} {Route} antwortete {Status} in {DauerMs} ms`, mit festen Feldern:
   - `Methode`: aus einer festen Liste (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS), sonst `ANDERE`.
   - `Route`: Routen-Template des Endpunkts, gebaut aus `RoutePattern.PathSegments` (führender `/`, Parameter nur als `{name}`, `{*name}` bzw. `{name?}`, ohne Constraints und Defaults), nicht aus `RawText`. Nie der rohe Pfad, nie der Query-String, keine Parameterwerte. Ohne Endpunkt `(keine Route)`. Hat der Exception-Handler den Endpunkt zurückgesetzt, gilt der ursprüngliche Endpunkt aus `IExceptionHandlerFeature`.
   - `Status`: der tatsächlich gesendete Status. Bei einer Ausnahme nach Antwortbeginn der begonnene Status, bei Client-Abbruch (`OperationCanceledException` mit `RequestAborted`) vor Antwortbeginn `499`, sonst `500`. Abbrüche vor Antwortbeginn fängt meist schon `UseExceptionHandler` ab und setzt selbst `499`.
   - `DauerMs`: über `TimeProvider` gemessen, auf ganze Millisekunden gerundet.
2. Erfasst werden alle Requests ohne Ausnahmeliste, auch die öffentlichen Katalog-GETs und der Bild-Endpunkt (Entscheidung des Auftraggebers vom 2026-10-06).
3. Nie protokolliert werden: Query-String, roher Pfad, Header (insbesondere `Authorization`), Body, Tokens, Claims, Benutzer-Id, Namen, E-Mails, IP-Adressen. Die Middleware öffnet keine Log-Scopes mit Request-Daten.
4. Die Middleware steht als erste im Pipeline-Aufbau (vor `UseExceptionHandler`), damit auch 401, 403, 404 und 500 erfasst werden. Den Endpunkt liest sie nach dem Durchlauf (`HttpContext.GetEndpoint()`).
5. **Framework-Kategorien mit Request-Daten** (`src/Coin.Api/Http/Protokollierung.cs`, erweitert): Ein Wrapper um die `ILoggerFactory` (`MitFestenStufen`) erzwingt feste Mindeststufen, unabhängig von Konfigurationsregeln (auch Wildcards und empfängerspezifische Regeln) und vom Empfänger:

   | Kategorie | Mindeststufe | Grund |
   |---|---|---|
   | `Microsoft.AspNetCore.Hosting.Diagnostics` | `Warning`, zusätzlich keine Scopes | URL samt Query; der Scope trug den rohen Pfad in jeden Eintrag des Requests |
   | `Microsoft.AspNetCore.Routing.Matching.DfaMatcher` | `Warning` | roher Pfad auf `Debug` |
   | `Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker` | `Debug` | Action-Argumente auf `Trace` |
   | `Microsoft.AspNetCore.Server.Kestrel.BadRequests` | `Warning` | Request-Zeile bzw. Pfad fehlerhafter Requests |

   Zusätzliche Filterregeln (Post-Configure je Empfänger) sind die zweite Linie. Die Kategorien werden exakt verglichen; gegen Umbenennung durch .NET-Updates sichern die Leak-Tests in `LogTests` ab. Die Tests `Aufgeloeste_LoggerFactory_*` schlagen an, wenn die Fabrik ersetzt wird (z. B. durch Serilog). Zur Korrelation dienen `TraceId` und `SpanId` (`ActivityTrackingOptions`) statt der früheren RequestId aus dem Hosting-Scope.
6. Absenken oder Abschalten des Request-Protokolls ist nur über die Log-Level-Konfiguration `Logging:LogLevel:Coin.Api.Http.AnfrageProtokoll` möglich. Feldauswahl und erfasste Endpunkte stehen fest im Code.

## Betrachtete Optionen
| Option | Bewertung |
|---|---|
| Hosting-Diagnose wieder öffnen | loggt die volle URL samt Query, nicht redigierbar, verworfen |
| ASP.NET-`HttpLogging` mit `RequestMethod`, `RequestPath`, `ResponseStatusCode`, `Duration`, `CombineLogs` | kein Query, aber der rohe Pfad: Pfadsegmente können Personendaten enthalten (z. B. vertippte oder künftige Pfade mit E-Mail); Redaktion nur per `IHttpLoggingInterceptor`, Feldauswahl per Konfiguration erweiterbar (Gefahr, Header oder Body versehentlich einzuschalten); verworfen |
| Eigene Middleware mit Routen-Template (gewählt) | wenige Zeilen, Felder fest im Code, Template statt Pfad schließt Personendaten in Pfadsegmenten aus, gut testbar |
| Nur Metriken (`http.server.request.duration`, enthält bereits das Routen-Template) | ergänzend sinnvoll, ersetzt aber keinen Einzel-Eintrag für die Fehlersuche und braucht einen Exporter; nicht Teil dieser Entscheidung |

## Folgen
- Methode, Route, Status und Dauer stehen im Betrieb wieder zur Verfügung, ohne Personendaten.
- Ein Request auf einen unbekannten Pfad ist im Log nur als `(keine Route)` mit Status sichtbar; der Pfad selbst ist für die Fehlersuche nicht verfügbar. Das ist gewollt.
- Neue Endpunkte sind automatisch erfasst. Wer Personendaten in Routen-Templates aufnehmen wollte, verstößt gegen diesen ADR; Templates enthalten nur Platzhalter.
- Der LogTest (AK-22, AK-47) prüft die Felder positiv und Personendaten negativ, auch bei `Trace`-Konfiguration mit Wildcard-Kategorien (z. B. `Microsoft.AspNetCore.Hosting.Diagnostics*`), allgemein und empfängerspezifisch.
- Die festen Stufen gelten nur, solange die eigene Fabrik aktiv ist. Wer einen anderen Logging-Stack einbindet, muss die vier Kategorien dort gleichwertig begrenzen.
- Einträge der Hosting-Diagnose ab `Warning` haben keinen Scope mehr (kein `RequestId`, kein `RequestPath`).
- Mehr Log-Volumen auf `Information`, vor allem durch öffentliche Katalog-GETs und Bildabrufe. Das ist vom Auftraggeber so gewollt; der Betrieb steuert das Volumen allein über das Log-Level.
