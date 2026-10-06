# ADR-0016: Berechtigungen im Code, Policies je Berechtigung, deaktivierte Benutzer

Status: Angenommen (umgesetzt) · Datum: 2026-10-05 · Feature: rollen-benutzerverwaltung · Ändert: [ADR-0013](0013-benutzer-und-rollen-in-eigener-datenbank.md) (Punkt 4 letzter Satz und Punkt 5) · Bestätigt: [ADR-0014](0014-coin-katalog-oeffentlich-lesbar.md)

## Kontext
Der Keycloak ist nur lesend nutzbar, Rollen führt C.O.I.N. selbst (ADR-0013). Bisher gab es nur die Policy `KatalogSchreiben` mit einer Rollenliste. Die Vorgabe verlangt feste Rollen (Administrator, Sachbearbeiter, Betrachter), deren Rechte als Berechtigungen im Code definiert und über Autorisierungsrichtlinien durchgesetzt werden. Administratoren vergeben Rollen und deaktivieren Benutzer in der App. Deaktivierte Benutzer erhalten `403`, auch mit gültigem Token. Rechte sind nicht frei konfigurierbar.

## Entscheidung
1. **Berechtigungen** sind Konstanten in `Coin.Domain/Benutzer/Berechtigungen.cs`: `coins.read`, `coins.write`, `users.manage`, `audit.read`.
2. **Rechtematrix** im Code (`Rechtematrix.Von(Rolle?)`, Domain), unveränderlich, nicht konfigurierbar:

   | Berechtigung | Administrator | Sachbearbeiter | Betrachter | keine Rolle |
   |---|---|---|---|---|
   | `coins.read` | ja | ja | ja | nein |
   | `coins.write` | ja | ja | nein | nein |
   | `users.manage` | ja | nein | nein | nein |
   | `audit.read` | ja | nein | nein | nein |

   Die Matrix steht zusätzlich in `docs/berechtigungen.md`. Ein Unit-Test gleicht Doku und Code ab.
3. **Eine Policy je Berechtigung**, Policy-Name = Berechtigung (`[Authorize(Policy = Berechtigungen.CoinsWrite)]`). Die Policy `KatalogSchreiben` und `Rollen.DuerfenKatalogSchreiben` entfallen. Endpunkte prüfen nie Rollen, nur Berechtigungen.
4. **`coins.read`** ist definiert, wird aber an keinem Endpunkt verlangt, solange der Katalog öffentlich ist (ADR-0014). Sie ist für künftige nicht-öffentliche Katalogdaten reserviert und wird ans Frontend geliefert. Eine Einschränkung des Katalogs wäre dann nur ein Attributwechsel von `[AllowAnonymous]` auf diese Policy.
5. **Benutzerstatus** `aktiv` (Spalte `benutzer.aktiv`, Standard `true`). Ändern dürfen ihn nur Administratoren über die Benutzerverwaltung. Weder der Login-Abgleich noch der Bootstrap ändern ihn.
6. **Ein Requirement für alles Geschützte**: `BerechtigungAnforderung(string? berechtigung)`. `null` bedeutet „nur angemeldet und aktiv“. Default- und Fallback-Policy sind „angemeldet + `BerechtigungAnforderung(null)`“. Jede Berechtigungs-Policy ist „angemeldet + `BerechtigungAnforderung(x)`“. Der Handler lädt einmal pro Request `IAktuellerBenutzer`:
   - Ist der Benutzer deaktiviert, schlägt er mit dem Grund `benutzer_deaktiviert` fehl.
   - Fehlt die Berechtigung, schlägt er mit dem Grund `keine_berechtigung` fehl.
   - Ohne Endpunkt (unbekannter Pfad) entscheidet er nicht. Es wird kein Benutzer abgeglichen, der Pfad liefert weiter `404`.
7. **403-Antworten** schreibt `AutorisierungsErgebnisBehandlung` aus dem Fehlergrund, nicht mehr `JwtBearerEvents.OnForbidden`. ProblemDetails mit `title` „Kein Zugriff“, deutschem `detail` je Berechtigung und der Erweiterung `code` (`benutzer_deaktiviert` | `keine_berechtigung`). Das Frontend wertet `code` aus, nicht den Text.
8. **Öffentliche Endpunkte bleiben tokenunabhängig** (ADR-0014): Auch ein deaktivierter Benutzer mit gültigem Token erhält auf `GET /api/coins`, `/api/coins/{id}` und `/api/coins/{id}/bild` dieselbe Antwort wie ein anonymer Besucher (`200`). Ein `403` dort würde nichts schützen, weil der Benutzer das Token einfach weglassen kann, und es bräche die Zusage „Antwort hängt nicht vom Token ab“ (kein `Vary: Authorization`, kein Abgleich). „Deaktivierte Benutzer erhalten 403“ gilt deshalb für alle Endpunkte, die eine Anmeldung verlangen, einschließlich `GET /api/me`.
9. `GET /api/me` liefert zusätzlich `berechtigungen` (sortiertes String-Array aus der Matrix). Das Frontend blendet Menüpunkte und Schaltflächen nur danach ein. Rollenlogik gibt es im Frontend nicht mehr.

## Betrachtete Optionen
| Thema | Option | Bewertung |
|---|---|---|
| Rechte | Rollen direkt an Endpunkten (`Roles=`) | Rollenwissen verstreut, Matrix nicht prüfbar, verworfen |
| | Berechtigungen + Matrix im Code (gewählt) | eine Stelle, testbar, Doku per Test abgeglichen |
| | Matrix in DB/Konfiguration | „frei konfigurierbar“ ist ausdrücklich ausgeschlossen |
| Deaktiviert-Prüfung | eigene Middleware | läuft auch auf öffentlichen und unbekannten Pfaden, doppelte Logik zur Autorisierung |
| | Requirement in Default-, Fallback- und allen Berechtigungs-Policies (gewählt) | greift genau dort, wo Anmeldung verlangt ist; ein Handler, ein Abgleich pro Request |
| | Claim beim Token-Validieren | DB-Zugriff in `OnTokenValidated`, auch für öffentliche Endpunkte, verworfen |
| Deaktiviert auf öffentlichen GETs | `403` | ohne Schutzwirkung, verletzt ADR-0014, verworfen |

## Folgen
- Jeder geschützte Request gleicht den Benutzer ab, nicht nur `/api/me` und schreibende Requests. Das Upsert schreibt nur bei Änderung (ADR-0013), die Kosten sind ein Statement pro Request.
- Rollenwechsel und Deaktivierung wirken beim nächsten API-Aufruf sofort, ohne neues Token.
- Neue Endpunkte brauchen entweder `[AllowAnonymous]` mit Begründung, eine Berechtigungs-Policy oder gelten als „nur angemeldet und aktiv“. Ein Inventartest (`EndpunktTabelleTests`) gleicht die Endpunkt-Tabelle in `docs/berechtigungen.md` mit den Endpunkten ab.
- Policies werden nur aus `Berechtigungen.Alle` registriert. Ein Endpunkt mit unbekanntem Policy-Namen scheitert nicht beim Start, sondern erst beim Request (`500`, fail-closed). Abgesichert wird das durch die Inventartests, die jede Policy gegen die Endpunkttabelle prüfen.
- ADR-0013 Punkt 4 („kein weiterer Vergabemechanismus“) und Punkt 5 (Policy `KatalogSchreiben`) sind durch dieses ADR abgelöst. Bootstrap und Abgleich bleiben unverändert.
