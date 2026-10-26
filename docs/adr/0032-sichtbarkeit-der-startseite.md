# ADR-0032: Sichtbarkeit der Startseite – Kopfbereich und Logos öffentlich, übrige Blöcke mit `coins.read`, Konfiguration mit `startpage.manage`

Status: Angenommen (Entscheidung des Auftraggebers vom 2026-10-26, S1 in [startseite](../features/startseite.md) Abschnitt 12; Rev. 2) · Datum: 2026-10-19, Rev. 2 vom 2026-10-26 · Feature: [startseite](../features/startseite.md) · Ergänzt: [ADR-0014](0014-coin-katalog-oeffentlich-lesbar.md) (Liste der öffentlichen Endpunkte), [ADR-0016](0016-berechtigungen-im-code-und-deaktivierte-benutzer.md), [ADR-0021](0021-rechte-fuer-exemplare-und-ausgaben.md)

## Kontext
„Die Startseite sehen alle Benutzer mit einer Rolle.“ Der Katalog ist öffentlich (ADR-0014), Kennzahlen je Coin sehen nur Rollen mit `coins.read` (ADR-0021, coin-ausgaben F2). Rev. 1 schlug vor, die ganze Startseite an `coins.read` zu binden. Der Auftraggeber hat am 2026-10-26 entschieden: Den **Kopfbereich** (Titel, Untertitel, Logos mit Alternativtext, ob aktiv und an welcher Stelle) sehen auch anonyme Besucher, Benutzer ohne Rolle und deaktivierte Benutzer; die übrigen Blöcke nicht. Öffentliche Endpunkte sind tokenunabhängig und enthalten keine Personendaten (CLAUDE.md „Sicherheit“, ADR-0014).

## Entscheidung
1. **Öffentlicher Endpunkt `GET /api/startseite/kopf`** (`[AllowAnonymous]`). Er liefert nur den Kopfbereich: `aktiv` und `position` (1–5) immer; `titel`, `untertitel` und die Logos (`url`, `alternativtext`, `breite`, `hoehe`) nur, wenn der Kopfbereich aktiv ist. Er liefert keine Kennzahlen, keine Coins, keine Texte anderer Blöcke und kein `geaendertAm`/`geaendertVon`/`hochgeladenVon`. **Begründung:** Der Kopfbereich ist der Auftritt des Bereitstellers und für die Öffentlichkeit bestimmt wie der Katalog (ADR-0014). Ein eigener Endpunkt statt einer tokenabhängigen Teilantwort von `GET /api/startseite`, weil öffentliche Antworten nicht vom Token abhängen dürfen (ADR-0014: kein `Vary: Authorization`, kein Benutzerabgleich, ungültiges Token führt nicht zu `401`).
2. **Öffentlicher Endpunkt `GET /api/startseite/logos/{platz}`** (`[AllowAnonymous]`). **Begründung:** Er liefert die Logos zum Kopfbereich aus Punkt 1. `<img src>` funktioniert für alle Besucher, ohne Blob-Abruf mit Token (wie das Motivbild, ADR-0014 Option A). Gespeicherte Logos sind auch bei ausgeschaltetem Kopfbereich abrufbar. Das ist hingenommen, weil Logos nur zur Veröffentlichung hochgeladen werden und keine Personendaten tragen; Metadaten bleiben ein Hinweis an die Hochladenden (ADR-0031 Punkt 3).
3. **Caching der Logos:** ETag = SHA-256. Ist der Query-Parameter `v` gleich dem aktuellen Hash-Präfix, gilt `Cache-Control: private, max-age=31536000, immutable`. Ohne `v` oder mit veraltetem `v` gilt `Cache-Control: no-cache` (der Browser fragt jedes Mal per ETag nach, `304` bei Gleichheit). So verfällt der Cache bei jedem Ersetzen, weil sich die URL ändert, und eine unversionierte URL wird nie dauerhaft eingefroren. `private` statt `public` aus demselben Grund wie ADR-0014: Shared Caches würden ein entferntes Logo bis zu einem Jahr weiter ausliefern. `GET /api/startseite/kopf` trägt `Cache-Control: no-store`, damit Änderungen beim nächsten Laden sichtbar sind.
4. **`GET /api/startseite` verlangt `coins.read`** und liefert alle aktiven Blöcke einschließlich Kopfbereich. Benutzer mit Rolle brauchen damit einen Aufruf, und die Gesamtkennzahlen sind nicht offener als die Kennzahlen je Coin.
5. **Neue Berechtigung `startpage.manage`**, nur für Administratoren: `GET` und `PUT /api/startseite/konfiguration`. Betrachter und Sachbearbeiter erhalten `403`.
6. **Darstellung auf `/`:** Besucher ohne `coins.read` (anonym, ohne Rolle, deaktiviert) laden nur `GET /api/startseite/kopf`. Ist der Kopfbereich aktiv, steht er an der Stelle der bisherigen statischen Begrüßung (Titel als h1 statt „Willkommen bei C.O.I.N.“ und Einleitungsabsatz). Ist er aus oder schlägt der Abruf fehl, bleibt die statische Begrüßung. Der Link „Zum Katalog“ bleibt in jedem Fall. Weitere Blöcke sehen diese Besucher nicht.
7. **Öffentliche DTOs** enthalten keine Personendaten. Der Endpunkt-Inventartest erlaubt neben den drei Katalog-Endpunkten genau diese zwei öffentlichen Endpunkte.

## Betrachtete Optionen
| Option | Bewertung |
|---|---|
| A (Rev. 1): alles mit `coins.read`, statische Begrüßung für alle anderen | vom Auftraggeber verworfen (S1) |
| **B: Kopfbereich und Logos öffentlich über eigene Endpunkte, übrige Blöcke mit `coins.read` (gewählt)** | einheitlicher Auftritt vor und nach der Anmeldung, Kennzahlen bleiben geschützt, öffentliche Antwort klein und tokenunabhängig |
| B': `GET /api/startseite` öffentlich, Inhalt je nach Token | widerspricht „öffentliche Endpunkte sind tokenunabhängig“ (ADR-0014), Gefahr von Cache-Vermischung, verworfen |
| B'': Kopfdaten in eine statische Datei oder in `index.html` einbetten | braucht Schreiben ins Dateisystem bzw. serverseitiges Rendern, verworfen |
| C: ganze Startseite öffentlich | Kennzahlen und Ranglisten öffentlich, widerspricht coin-ausgaben F2, verworfen |
| Logos öffentlich nur bei aktivem Kopfbereich | die Vorschau der Administratorin bräuchte einen zweiten, geschützten Logo-Endpunkt, und die Antwort hinge vom Zustand ab; kein Schutzgewinn für Logos, verworfen |
| Logos `Cache-Control: public` | Shared Caches lieferten entfernte Logos weiter aus, verworfen (ADR-0014) |
| Logos immer `immutable`, auch ohne `v` | eine unversionierte URL bliebe nach dem Ersetzen im Browser veraltet, verworfen |

## Folgen
- Jeder mit Netzzugriff sieht Titel, Untertitel und Logos, auch bei ausgeschaltetem Kopfbereich die Logos (Punkt 2). Die Anwenderdoku weist Administratoren darauf hin.
- ADR-0014 („genau drei öffentliche Endpunkte“) ist um diese zwei Endpunkte ergänzt; `EndpunktInventarTests` und die Endpunkttabelle in `docs/berechtigungen.md` werden bewusst angepasst.
- Der bestehende Vitest „StartSeite ruft keine API auf“ wird bewusst ersetzt: Ohne `coins.read` ruft die Seite genau `GET /api/startseite/kopf` auf.
- Rollenwechsel wirken wie bisher erst nach dem Neuladen.
