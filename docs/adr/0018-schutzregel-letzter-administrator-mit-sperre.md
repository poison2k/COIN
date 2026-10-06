# ADR-0018: Schutzregel „letzter aktiver Administrator“, serialisiert per Advisory Lock

Status: Angenommen (umgesetzt; Reihenfolge der Prüfungen am 2026-10-06 geändert und umgesetzt, Rev. 3) · Datum: 2026-10-05, geändert 2026-10-06 · Feature: rollen-benutzerverwaltung

## Kontext
Der letzte aktive Administrator darf weder herabgestuft noch deaktiviert werden, und niemand darf sich selbst die Administratorrolle entziehen. Die Regel muss auch bei direkten API-Aufrufen und bei Nebenläufigkeit halten. Beispiel: Es gibt genau zwei aktive Administratoren A und B. A stuft gleichzeitig B herab, während B A herabstuft. Unter `READ COMMITTED` sähen beide Transaktionen „2 Administratoren“ und würden beide durchlaufen. Danach gäbe es keinen Administrator mehr, und ohne Keycloak-Schreibzugriff ließe sich das nur per SQL reparieren.

Änderung 2026-10-06: In der ersten Fassung kamen `NichtGefunden` und `Unveraendert` vor der Akteur-Prüfung. Ein Akteur, dem `users.manage` zwischen Autorisierung und Ausführung entzogen wurde, erhielt bei einer Änderung ohne Wirkung noch `200` mit dem Eintrag des Ziels (Name, E-Mail) und bei unbekannter Id `404`. Der Auftraggeber hat entschieden, das zu beseitigen.

## Entscheidung
1. **Regeln in der Domain** (`BenutzerverwaltungService`, reine Prüfung `Schutzregeln`), in dieser Reihenfolge:
   1. Der Akteur fehlt oder hat `users.manage` nicht (mehr), geprüft über `Rechtematrix.Hat(akteur, users.manage)` (berücksichtigt den Status) → `AkteurNichtBerechtigt`. Das wird innerhalb der Sperre erneut geprüft (TOCTOU), wird also auch dann erkannt, wenn ihm die Rolle zwischen Autorisierung und Ausführung entzogen wurde. Weil diese Prüfung zuerst kommt, erfährt ein nicht (mehr) berechtigter Akteur weder Zieldaten noch, ob die Ziel-Id existiert.
   2. Ziel existiert nicht → `NichtGefunden`.
   3. Neuer Wert gleich dem alten → `Unveraendert` (kein Schreiben, kein Audit).
   4. Ziel = Akteur, und die Änderung entzieht die Administratorrolle oder deaktiviert → `EigenesKonto`.
   5. Ziel ist aktiver Administrator, die Änderung entzieht die Rolle oder deaktiviert, und die Zahl der aktiven Administratoren ist 1 → `LetzterAdministrator`.
2. **Serialisierung**: Jede Rollen- oder Statusänderung läuft in einer Transaktion, die zuerst `SELECT pg_advisory_xact_lock(<feste Konstante „benutzerverwaltung“>)` ausführt. Erst danach werden Akteur, Ziel und die Zahl der aktiven Administratoren gelesen, die Regeln geprüft und dann `benutzer` sowie `benutzer_audit` geschrieben. Die Sperre endet mit Commit oder Rollback.
3. Der Login-Abgleich nimmt die Sperre nicht. Er ändert weder Rolle noch Status. Der Bootstrap kann die Zahl der Administratoren nur erhöhen.
4. **HTTP**: `EigenesKonto` und `LetzterAdministrator` → `409` (ProblemDetails mit `code` `eigenes_konto` bzw. `letzter_administrator`), `AkteurNichtBerechtigt` → `403` `keine_berechtigung` (ohne Zieldaten im Body).

## Betrachtete Optionen
| Option | Bewertung |
|---|---|
| A: Prüfen ohne Sperre | Race wie oben beschrieben, verworfen |
| B: `SERIALIZABLE` + Retry | korrekt, braucht aber Retry-Logik für `40001` und erzeugt schwer testbare Abbrüche |
| C: `SELECT … FOR UPDATE` auf alle aktiven Admins | korrekt nur durch die Neuauswertung von `READ COMMITTED` (EvalPlanQual), schwer zu durchschauen; neue Admins außerhalb der Sperrmenge |
| D: Transaktions-Advisory-Lock (gewählt) | offensichtlich korrekt, einfach, Änderungen sind selten und kurz; die Sperre gilt nur für Code, der sie nimmt, und das ist genau dieser eine Pfad |
| E: DB-Constraint-Trigger „mindestens ein aktiver Admin“ | wirkt auch bei SQL-Eingriffen, ist aber nebenläufig ebenfalls nur mit Sperre korrekt und blockiert legitime Reparaturen, verworfen |

Zur Reihenfolge (2026-10-06): Akteur-Prüfung nur vor `Unveraendert` zu ziehen hätte das Restrisiko ebenfalls beseitigt. Gewählt ist „Akteur zuerst“, weil es zusätzlich das Existenz-Orakel (`404` gegenüber `403`) schließt und die Regel einfacher macht: Ohne Recht gibt es immer `403`.

## Folgen
- Alle Rollen- und Statusänderungen laufen nacheinander. Bei der erwarteten Zahl an Administratoren ist das unkritisch.
- Ein Integrationstest prüft die gegenseitige Herabstufung mit parallelen Requests in mehreren Durchläufen. Es bleibt immer mindestens ein aktiver Administrator, und es entsteht genau ein Audit-Eintrag.
- Direkte SQL-Änderungen umgehen die Regel. Das ist bewusst so, weil sie den Notfall-Weg darstellen (SQL-Hinweis im README, Abschnitt „Hinweise für den Betrieb“).
- Die Regel `LetzterAdministrator` ist über die API nicht erreichbar: Der Akteur muss selbst aktiver Administrator sein (Schritt 1). Ist er der einzige, ist das Ziel er selbst, und `EigenesKonto` (Schritt 4) greift vorher. Die Regel ist Absicherung in der Tiefe (z. B. für künftige Aufrufer ohne Selbstprüfung oder bei Änderungen der Matrix) und nur per Unit-Test (`SchutzregelnTests`) belegt. Im Nebenläufigkeitstest endet der verlierende Request deshalb mit `403 keine_berechtigung` oder `409`.
- Ein Akteur ohne (gültiges) `users.manage` erhält innerhalb der Sperre immer `403 keine_berechtigung` (ohne Zieldaten im Body), auch bei unbekannter Ziel-Id (`403` statt `404`) und bei Änderungen ohne Wirkung. Belegt per Unit-Test (`SchutzregelnTests`) und Integrationstest auf Service-Ebene gegen PostgreSQL (`AkteurZuerstTests`), weil die Policy diesen Fall über HTTP meist schon vorher abfängt. Für berechtigte Akteure ändert sich nichts.
