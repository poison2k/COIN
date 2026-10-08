# ADR-0014: Coin-Katalog öffentlich lesbar, Schreiben nur mit Berechtigung

Status: Angenommen (Entscheidung des Auftraggebers vom 2026-10-05, umgesetzt) · Datum: 2026-10-05 · Feature: anmeldung-keycloak · Ergänzt: [ADR-0006](0006-bild-upload-als-eigener-endpunkt.md), [ADR-0012](0012-anmeldung-keycloak-oidc.md)

## Kontext
Mit ADR-0012 sind alle Endpunkte standardmäßig geschützt. In `docs/requirements.md` war offen, ob die Öffentlichkeit den Coin-Katalog sehen darf. Der Auftraggeber hat entschieden: Der Katalog ist ohne Anmeldung lesbar („Betrachter kann man auch ohne Login sein“). Schreiben dürfen nur Administrator und Sachbearbeiter. Rev. 1 dieses ADR sah einen geschützten Bild-Endpunkt mit Blob-Abruf im Frontend vor. Diese Variante ist damit hinfällig.

## Entscheidung
- `GET /api/coins`, `GET /api/coins/{id}` und `GET /api/coins/{id}/bild` tragen ausdrücklich `[AllowAnonymous]`. Die Regel „standardmäßig geschützt, öffentlich nur ausdrücklich markiert“ bleibt bestehen. Ein Test über alle Endpunkte prüft, dass genau diese drei öffentlich sind.
- Öffentliche Antworten hängen nicht von Anmeldung oder Token ab, auch ein ungültiges Token führt zu keinem `401`. Deshalb gibt es kein `Vary: Authorization`, und es findet kein Benutzerabgleich statt.
- Öffentliche DTOs enthalten keine Personendaten. Coin-Daten haben heute keinen Personenbezug. Ersteller-, Bearbeiter- oder Verleihungsangaben kommen künftig nur in geschützte Endpunkte und DTOs.
- `POST /api/coins` und `PUT /api/coins/{id}/bild` verlangen die Berechtigung `coins.write` (Rollen Administrator und Sachbearbeiter, ADR-0016; ursprünglich Policy `KatalogSchreiben`). Betrachter, Benutzer ohne Rolle und deaktivierte Benutzer erhalten `403`, Anonyme `401`.
- Das Frontend lädt Motivbilder wieder per `<img src={bildUrl}>`. Der Blob-Abruf entfällt.
- `Cache-Control` des Bild-Endpunkts bleibt `private, max-age=31536000, immutable`.
  - `public` würde Shared Caches (z. B. Proxys im Intranet) erlauben, Bilder ein Jahr lang zu speichern. Wird der Katalog später wieder eingeschränkt oder ein Motiv als schutzwürdig eingestuft, wäre das nicht mehr steuerbar.
  - Der Browser-Cache wirkt mit `private` unverändert. Das `immutable` ist durch den Inhalts-Hash im Parameter `v` gerechtfertigt.
  - Der Gewinn durch Shared Caches ist bei der erwarteten Nutzerzahl gering.

## Betrachtete Optionen (Bildabruf)
| Option | Bewertung |
|---|---|
| A: öffentlicher Endpunkt, `<img src>` (gewählt) | folgt aus der Entscheidung „Katalog öffentlich“, keine Änderung an Frontend oder Tests |
| B: `fetch` mit Bearer, Object-URL (Rev. 1) | nur nötig, solange der Katalog geschützt ist; jetzt Mehraufwand ohne Nutzen |
| C: Cookie-Authentifizierung oder signierte URLs | wie B nicht mehr nötig |

## Folgen
- Jeder mit Netzzugriff kann Katalog und Motivbilder lesen. Ob die Anwendung im Intranet oder im Internet läuft, ist weiter offen (`docs/requirements.md`, Betrieb). Diese Frage betrifft auch die Reichweite der Veröffentlichung.
- Die drei Katalog-Endpunkte bleiben öffentlich. Seit coin-ausgaben (ADR-0021) gilt `coins.read` für den zusätzlichen Endpunkt `GET /api/coins/{id}/exemplare`; Betrachter sehen damit Kennzahlen und Exemplar-Status, Anonyme nicht.
- Die Öffentlichkeit des Katalogs gilt auch für deaktivierte Benutzer: Mit ihrem Token erhalten sie auf den drei Lese-Endpunkten dieselbe Antwort wie anonyme Besucher (Entscheidung des Auftraggebers vom 2026-10-05, ADR-0016 Punkt 8).
- Soll der Katalog wieder eingeschränkt werden, ist das nur eine Attributänderung (`[AllowAnonymous]` → Policy `coins.read`). Dann wird dieses ADR abgelöst.
