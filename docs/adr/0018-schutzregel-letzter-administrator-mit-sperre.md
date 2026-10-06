# ADR-0018: Schutzregel „letzter aktiver Administrator“, serialisiert per Advisory Lock

Status: Angenommen (umgesetzt) · Datum: 2026-10-05 · Feature: rollen-benutzerverwaltung

## Kontext
Der letzte aktive Administrator darf weder herabgestuft noch deaktiviert werden, und niemand darf sich selbst die Administratorrolle entziehen. Die Regel muss auch bei direkten API-Aufrufen und bei Nebenläufigkeit halten. Beispiel: Es gibt genau zwei aktive Administratoren A und B. A stuft gleichzeitig B herab, während B A herabstuft. Unter `READ COMMITTED` sähen beide Transaktionen „2 Administratoren“ und würden beide durchlaufen. Danach gäbe es keinen Administrator mehr, und ohne Keycloak-Schreibzugriff ließe sich das nur per SQL reparieren.

## Entscheidung
1. **Regeln in der Domain** (`BenutzerverwaltungService`, reine Prüfung `Schutzregeln`), in dieser Reihenfolge:
   1. Ziel existiert nicht → `NichtGefunden`.
   2. Neuer Wert gleich dem alten → `Unveraendert` (kein Schreiben, kein Audit).
   3. Der Akteur hat `users.manage` nicht (mehr), geprüft über `Rechtematrix.Hat(akteur, users.manage)` (berücksichtigt den Status) → `AkteurNichtBerechtigt`. Das wird innerhalb der Sperre erneut geprüft (TOCTOU), wird also auch dann erkannt, wenn ihm die Rolle zwischen Autorisierung und Ausführung entzogen wurde.
   4. Ziel = Akteur, und die Änderung entzieht die Administratorrolle oder deaktiviert → `EigenesKonto`.
   5. Ziel ist aktiver Administrator, die Änderung entzieht die Rolle oder deaktiviert, und die Zahl der aktiven Administratoren ist 1 → `LetzterAdministrator`.
2. **Serialisierung**: Jede Rollen- oder Statusänderung läuft in einer Transaktion, die zuerst `SELECT pg_advisory_xact_lock(<feste Konstante „benutzerverwaltung“>)` ausführt. Erst danach werden Akteur, Ziel und die Zahl der aktiven Administratoren gelesen, die Regeln geprüft und dann `benutzer` sowie `benutzer_audit` geschrieben. Die Sperre endet mit Commit oder Rollback.
3. Der Login-Abgleich nimmt die Sperre nicht. Er ändert weder Rolle noch Status. Der Bootstrap kann die Zahl der Administratoren nur erhöhen.
4. **HTTP**: `EigenesKonto` und `LetzterAdministrator` → `409` (ProblemDetails mit `code` `eigenes_konto` bzw. `letzter_administrator`), `AkteurNichtBerechtigt` → `403` `keine_berechtigung`.

## Betrachtete Optionen
| Option | Bewertung |
|---|---|
| A: Prüfen ohne Sperre | Race wie oben beschrieben, verworfen |
| B: `SERIALIZABLE` + Retry | korrekt, braucht aber Retry-Logik für `40001` und erzeugt schwer testbare Abbrüche |
| C: `SELECT … FOR UPDATE` auf alle aktiven Admins | korrekt nur durch die Neuauswertung von `READ COMMITTED` (EvalPlanQual), schwer zu durchschauen; neue Admins außerhalb der Sperrmenge |
| D: Transaktions-Advisory-Lock (gewählt) | offensichtlich korrekt, einfach, Änderungen sind selten und kurz; die Sperre gilt nur für Code, der sie nimmt, und das ist genau dieser eine Pfad |
| E: DB-Constraint-Trigger „mindestens ein aktiver Admin“ | wirkt auch bei SQL-Eingriffen, ist aber nebenläufig ebenfalls nur mit Sperre korrekt und blockiert legitime Reparaturen, verworfen |

## Folgen
- Alle Rollen- und Statusänderungen laufen nacheinander. Bei der erwarteten Zahl an Administratoren ist das unkritisch.
- Ein Integrationstest prüft die gegenseitige Herabstufung mit parallelen Requests in mehreren Durchläufen. Es bleibt immer mindestens ein aktiver Administrator, und es entsteht genau ein Audit-Eintrag.
- Direkte SQL-Änderungen umgehen die Regel. Das ist bewusst so, weil sie den Notfall-Weg darstellen (SQL-Hinweis im README, Abschnitt „Hinweise für den Betrieb“).
- Die Regel `LetzterAdministrator` ist über die API nicht erreichbar: Der Akteur muss selbst aktiver Administrator sein (Schritt 3). Ist er der einzige, ist das Ziel er selbst, und `EigenesKonto` (Schritt 4) greift vorher. Die Regel ist Absicherung in der Tiefe (z. B. für künftige Aufrufer ohne Selbstprüfung oder bei Änderungen der Matrix) und nur per Unit-Test (`SchutzregelnTests`) belegt. Im Nebenläufigkeitstest endet der verlierende Request deshalb mit `403 keine_berechtigung` oder `409`.
- Bekanntes Restrisiko (vom Auftraggeber am 2026-10-06 akzeptiert): Weil `Unveraendert` (Schritt 2) vor `AkteurNichtBerechtigt` (Schritt 3) geprüft wird, erhält ein Akteur, dem `users.manage` zwischen Autorisierung und Ausführung entzogen wurde, bei einer Änderung ohne Wirkung noch `200` mit dem Eintrag des Ziels (Name, E-Mail). Das Zeitfenster ist sehr kurz, der Akteur hatte die Daten unmittelbar vorher legitim sehen dürfen. Abhilfe bei Bedarf: Schritt 3 vor Schritt 2 ziehen.
