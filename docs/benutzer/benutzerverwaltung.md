# Benutzerverwaltung – Anleitung für Administratoren

In der Benutzerverwaltung vergeben Sie Rollen, deaktivieren oder reaktivieren Benutzer und sehen im
Audit-Log, wer wann was geändert hat. Die Seite steht nur Administratoren zur Verfügung.

## Seite öffnen

Klicken Sie in der Seitenleiste auf **Benutzerverwaltung**. Den Eintrag sehen nur Administratoren.
Wer die Adresse `/benutzerverwaltung` direkt aufruft, wird ohne Anmeldung zur Anmeldung geschickt.
Ohne Rolle, mit deaktiviertem Konto oder mit einer anderen Rolle als Administrator erscheint die
Seite **Kein Zugriff** (mit einer anderen Rolle mit dem Text „Ihr Benutzerkonto ist für diese Seite
nicht berechtigt. …“, siehe [Anmeldung](anmeldung.md#keine-berechtigung-für-eine-seite)).

Die Seite hat zwei Reiter: **Benutzer** und **Audit-Log**. Zwischen den Reitern wechseln Sie per
Klick oder mit den Pfeiltasten, wenn ein Reiter den Fokus hat.

## Rollen und Rechte

| Rolle | Coin-Katalog ansehen | Exemplare und Kennzahlen | Coins hinzufügen und bearbeiten, Auflage ändern, Zertifikatsvorlagen | Ausgaben sehen, erfassen, stornieren | Benutzerverwaltung und Audit-Log |
|---|---|---|---|---|---|
| Administrator | ja | ja | ja | ja | ja |
| Sachbearbeiter | ja | ja | ja | ja | nein |
| Betrachter | ja | ja | nein | nein | nein |
| Keine Rolle | ja | nein | nein | nein | nein |

Den Coin-Katalog kann jeder ansehen, auch ohne Anmeldung. Ein Betrachter sieht zusätzlich die
Kennzahlen und den Status der Exemplare, aber keine Ausgaben und keine Empfängerdaten (siehe
[Exemplare und Ausgaben](ausgaben.md)).

## Benutzer finden

Ein Benutzer erscheint erst in der Liste, **nachdem er sich einmal bei C.O.I.N. angemeldet hat**.
Benutzer von Hand anlegen oder löschen können Sie nicht.

1. Geben Sie im Feld **Benutzer suchen** einen Teil des Namens oder der E-Mail-Adresse ein.
   Groß- und Kleinschreibung spielen keine Rolle.
2. Klicken Sie auf **Suchen** oder drücken Sie die Eingabetaste. Ein leeres Suchfeld zeigt alle
   Benutzer.

Über der Tabelle steht, wie viele Benutzer gefunden wurden, z. B. „3 Benutzer gefunden“. Die
Tabelle zeigt Name, E-Mail, Rolle, Status und Aktion, sortiert nach Namen, 25 Benutzer pro Seite.
Mit **Vorherige Seite** und **Nächste Seite** blättern Sie; dazwischen steht „Seite x von y“.
Während die nächste Seite lädt, bleibt die bisherige Seite sichtbar.

Ihre eigene Zeile ist mit „(Sie)“ markiert. Rolle und Status Ihres eigenen Kontos können Sie nicht
ändern, die Bedienelemente sind dort gesperrt.

## Rolle ändern

1. Wählen Sie in der Spalte **Rolle** die neue Rolle: Administrator, Sachbearbeiter, Betrachter
   oder Keine Rolle.
2. Es erscheint die Rückfrage „Rolle ändern?“ mit „Rolle von {Name}: {alt} → {neu}“.
3. Klicken Sie auf **Rolle ändern**. Mit **Abbrechen** oder der Escape-Taste bleibt alles wie es war.

Nach dem Speichern erscheint „Die Rolle von {Name} wurde auf {neu} geändert.“ Mit **Keine Rolle**
entziehen Sie die Rolle.

## Benutzer deaktivieren und reaktivieren

Ein deaktivierter Benutzer kann in C.O.I.N. nichts mehr tun, was eine Anmeldung verlangt. Den
öffentlichen Coin-Katalog kann er weiter ansehen. Seine Rolle bleibt erhalten.

- **Deaktivieren**: Klicken Sie in der Spalte **Aktion** auf **Deaktivieren** und bestätigen Sie
  die Rückfrage „Benutzer deaktivieren?“ mit **Deaktivieren**.
- **Reaktivieren**: Klicken Sie auf **Reaktivieren**. Das geschieht ohne Rückfrage. Der Benutzer
  hat danach wieder seine bisherige Rolle.

Die Spalte **Status** zeigt „Aktiv“ oder „Deaktiviert“.

Während eine Änderung gespeichert wird, steht in der Rückfrage „Änderung wird gespeichert …“. Die
Rückfrage lässt sich dann nicht schließen, und weitere Klicks lösen keine zweite Änderung aus.

Änderungen an Rolle und Status gelten sofort bei der nächsten Aktion des Benutzers. Ein Benutzer,
der auf „Kein Zugriff“ steht (deaktiviert oder ohne Rolle), kommt nach Ihrer Änderung über **Erneut
prüfen** oder beim Zurückkehren ins Browserfenster weiter. Hat der Benutzer schon eine Rolle, passt
sich seine Ansicht (z. B. Menüeinträge) erst an, wenn er die Seite neu lädt oder sich neu anmeldet.

## Schutzregeln

- Sie können sich nicht selbst die Rolle Administrator entziehen und Ihr eigenes Konto nicht
  deaktivieren: „Das eigene Konto kann nicht geändert werden.“
- Es bleibt immer mindestens ein aktiver Administrator: „Der letzte aktive Administrator kann weder
  herabgestuft noch deaktiviert werden.“

## Meldungen

| Meldung | Bedeutung |
|---|---|
| „Das eigene Konto kann nicht geändert werden.“ | Sie haben versucht, Ihr eigenes Konto herabzustufen oder zu deaktivieren. |
| „Der letzte aktive Administrator kann weder herabgestuft noch deaktiviert werden.“ | Ernennen Sie zuerst einen weiteren Administrator. |
| „Der Benutzer wurde nicht gefunden.“ | Der Benutzer ist nicht vorhanden. Suchen Sie erneut. |
| „Sie sind nicht berechtigt, Benutzer zu verwalten.“ | Ihnen wurde inzwischen die Rolle Administrator entzogen. |
| „Ihr Benutzerkonto ist deaktiviert.“ | Ihr eigenes Konto wurde deaktiviert. |
| „Die Änderung konnte nicht gespeichert werden. Bitte später erneut versuchen.“ | Technisches Problem, z. B. keine Verbindung zum Server. |
| „Benutzer konnten nicht geladen werden. Bitte später erneut versuchen.“ | Die Liste konnte nicht geladen werden. |

Nach einer Fehlermeldung zeigt die Zeile wieder den gespeicherten Stand.

## Audit-Log

Der Reiter **Audit-Log** zeigt jede Änderung an Rollen und Status, die neueste zuerst, 25 Einträge
pro Seite. Er wird bei jedem Öffnen neu geladen. Geblättert wird wie in der Benutzerliste.

| Spalte | Inhalt |
|---|---|
| Zeitpunkt | Datum und Uhrzeit der Änderung |
| Geändert von | wer die Änderung vorgenommen hat; „System (Bootstrap)“ beim ersten Administrator, der beim Einrichten automatisch angelegt wurde |
| Benutzer | wessen Konto geändert wurde |
| Änderung | „Rolle“ oder „Status“ |
| Vorher, Nachher | z. B. „Keine Rolle“ → „Betrachter“ oder „Aktiv“ → „Deaktiviert“ |

Einträge im Audit-Log können nicht geändert oder gelöscht werden. Sie werden vorerst unbegrenzt
aufbewahrt. Ohne Einträge steht dort „Noch keine Einträge.“
