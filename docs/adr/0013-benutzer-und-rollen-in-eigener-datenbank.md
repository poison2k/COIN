# ADR-0013: Benutzer und Rollen in der eigenen Datenbank, Abgleich pro Request, Bootstrap-Administratoren

Status: Angenommen, teilweise abgelöst durch [ADR-0016](0016-berechtigungen-im-code-und-deaktivierte-benutzer.md) (Punkt 2 Auslöser des Abgleichs, Punkt 4 letzter Satz, Punkt 5) · Datum: 2026-10-05 · Feature: anmeldung-keycloak

> Seit dem Feature rollen-benutzerverwaltung gilt: Rollen vergeben Administratoren in der App
> (`PUT /api/benutzer/{id}/rolle`); Endpunkte verlangen Berechtigungen statt der Policy
> `KatalogSchreiben`; abgeglichen wird bei jedem Request auf einen geschützten Endpunkt. Tabelle,
> Abgleich-Technik, Claims und Bootstrap gelten unverändert.

## Kontext
Der Keycloak ist in Produktion nur lesend nutzbar, und seine Rollen dürfen nicht verwendet werden. Die Rollen Administrator, Sachbearbeiter und Betrachter (`docs/requirements.md`) führt C.O.I.N. deshalb selbst. Neue Benutzer haben keine Rolle. Der erste Administrator kommt aus `Bootstrap:AdminEmails`. Sachbearbeiter und Betrachter werden erst in einem späteren Feature vergeben (Rollen- und Rechteverwaltung). Die API sieht keine Login-Ereignisse, sondern nur Tokens.

## Entscheidung
1. **Tabelle `benutzer`** (Migration `Benutzer`):
   - Surrogat-Id (GUID v7), fachlicher Schlüssel `(issuer, subject)` mit eindeutigem Index `ux_benutzer_issuer_subject`.
   - `email` (nullable), `anzeigename`, `rolle` (nullable, `NULL` = keine, Check `ck_benutzer_rolle`), `erstellt_am`, `aktualisiert_am`.
   - Die Domain liegt in `Coin.Domain/Benutzer`, das Repository in `Coin.Infrastructure`. Das Enum `Rolle` enthält alle drei Rollen.
2. **Abgleich** einmal pro Request, und nur wenn der Request den Benutzer braucht (`/api/me`, Policy `KatalogSchreiben`). Zuständig ist ein scoped Service `IAktuellerBenutzer`.
   - Technik: `INSERT … ON CONFLICT (issuer, subject) DO UPDATE … WHERE <E-Mail oder Name geändert> RETURNING`. Atomar, ohne Duplikate bei parallelen Erstaufrufen.
   - Geschrieben wird nur bei Änderung. Die Rolle ist nie Teil des Updates.
   - Öffentliche Lese-Endpunkte (ADR-0014) lösen keinen Abgleich aus.
3. **Claims**:
   - `sub` ist Pflicht. Ausgewertet werden außerdem `email` und `email_verified` (nur der JSON-Boolean `true` zählt, nicht die Zeichenkette „true“).
   - Anzeigename: `name`, sonst `preferred_username`, sonst `email`, sonst „Unbekannt“.
   - Ein Name über 200 Zeichen wird gekürzt. Eine E-Mail über 320 Zeichen wird `NULL`.
4. **Bootstrap**:
   - Greift nur beim Anlegen.
   - Rolle Administrator nur, wenn `email_verified=true` ist (vom Auftraggeber bestätigt) und die E-Mail nach Trim, ohne Beachtung der Groß-/Kleinschreibung, in `Bootstrap:AdminEmails` steht.
   - Änderungen an der Liste wirken nicht rückwirkend.
   - Es gibt keinen weiteren Vergabemechanismus (keine weiteren Listen, kein Seed).
5. **Autorisierung**:
   - Policy `KatalogSchreiben` = Rolle Administrator oder Sachbearbeiter.
   - Lesen des Katalogs ist öffentlich (ADR-0014).
   - `/api/me` verlangt nur Anmeldung.
   - Rollen-Claims aus Tokens werden nie ausgewertet (`RoleClaimType` zeigt auf einen ungenutzten Claim).

## Betrachtete Optionen (Zeitpunkt des Abgleichs)
| Option | Bewertung |
|---|---|
| A: nur in `GET /api/me` | Hängt davon ab, dass das Frontend `/api/me` zuerst aufruft. Für die Schreibprüfung braucht es trotzdem eine DB-Abfrage. |
| B: `IClaimsTransformation` | Läuft bei jedem `AuthenticateAsync`, eventuell mehrfach, auch auf öffentlichen Endpunkten. Schreibzugriffe dort sind schwer nachvollziehbar. |
| C: scoped `IAktuellerBenutzer` mit Upsert (gewählt) | Eine zentrale Stelle, höchstens einmal pro Request und nur bei Bedarf. Schreibt nur bei Änderung. |

## Folgen
- Pro schreibendem Request kommt ein Statement auf einen Unique-Index hinzu. Das ist vertretbar.
- Personendaten (E-Mail, Name) liegen in `benutzer`. Sie werden nicht geloggt, die Testdaten sind synthetisch.
- Bis zur Rollenverwaltung hatte nur der Bootstrap-Administrator eine Rolle. Seit ADR-0016 vergeben Administratoren Rollen in der App; Integrationstests setzen Rollen weiterhin direkt in der Test-DB.
- Die Surrogat-Id ist später der Fremdschlüssel für Audit und Verleihungen. `sub` und Issuer verlassen die API nicht.
