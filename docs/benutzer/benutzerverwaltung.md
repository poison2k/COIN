# Benutzerverwaltung – Anleitung für Administratoren

In der Benutzerverwaltung vergeben Sie Rollen, deaktivieren oder reaktivieren Benutzer und sehen im
Änderungsprotokoll, wer wann was geändert hat. Die Seite steht nur Administratoren zur Verfügung.

## Seite öffnen

Klicken Sie in der Seitenleiste auf **Benutzerverwaltung**. Den Eintrag sehen nur Administratoren.
Wer die Adresse `/benutzerverwaltung` direkt aufruft, wird ohne Anmeldung zur Anmeldung geschickt.
Ohne Rolle, mit deaktiviertem Konto oder mit einer anderen Rolle als Administrator erscheint die
Seite **Kein Zugriff** (mit einer anderen Rolle mit dem Text „Ihr Benutzerkonto ist für diese Seite
nicht berechtigt. …“, siehe [Anmeldung](anmeldung.md#keine-berechtigung-für-eine-seite)).

Die Seite hat zwei Reiter: **Benutzer** und **Änderungsprotokoll**. Zwischen den Reitern wechseln
Sie per Klick oder mit den Pfeiltasten, wenn ein Reiter den Fokus hat. Der Reiter **Benutzer**
enthält die Karte „Benutzer“, der Reiter **Änderungsprotokoll** die gleichnamige Karte. Der gewählte
Reiter steht in der Adresszeile; nach dem Neuladen bleibt er geöffnet.

## Rollen und Rechte

| Rolle | Coin-Katalog ansehen | Exemplare und Kennzahlen | Coins hinzufügen und bearbeiten, Auflage ändern, Zertifikatsvorlagen | Ausgaben sehen, erfassen, stornieren | Benutzerverwaltung und Änderungsprotokoll |
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

Über der Tabelle steht, wie viele Benutzer gefunden wurden, z. B. „3 Benutzer gefunden“. Ein
aktiver Suchbegriff erscheint als Chip „Suche: …“; das Kreuz im Chip zeigt wieder alle Benutzer (siehe
[Bedienung](bedienung.md#filter-chips)). Ohne Treffer steht dort „Keine Benutzer gefunden.“ mit dem
Button **Suche zurücksetzen**. Die Tabelle zeigt Name, E-Mail, Rolle, Status und Aktion,
sortiert nach Namen, 25 Benutzer pro Seite; unter 768 Pixel Breite erscheinen die Benutzer als
Karten.
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
| „Benutzer konnten nicht geladen werden. Bitte später erneut versuchen.“ | Die Liste konnte nicht geladen werden. **Erneut versuchen** lädt sie neu. |
| „Änderungsprotokoll konnte nicht geladen werden. Bitte später erneut versuchen.“ | Das Änderungsprotokoll konnte nicht geladen werden. **Erneut versuchen** lädt es neu; der Fokus springt dabei an den Anfang des Änderungsprotokolls. |

Nach einer Fehlermeldung zeigt die Zeile wieder den gespeicherten Stand.

## Änderungsprotokoll

Der Reiter **Änderungsprotokoll** zeigt jede Änderung an Rollen und Status, die neueste zuerst,
25 Einträge pro Seite. Er wird bei jedem Öffnen neu geladen. Geblättert wird wie in der
Benutzerliste.

### Filtern

Über der Tabelle stehen drei Filter. Sie lassen sich beliebig kombinieren; es erscheinen nur
Einträge, die zu allen gesetzten Filtern passen. Jede Änderung wirkt sofort, ohne Button, und die
Liste beginnt wieder auf Seite 1.

- **Zeitraum** mit den Datumsfeldern **Von** und **Bis**: Es zählen ganze Tage nach deutscher Zeit,
  beide Tage eingeschlossen. Sie können auch nur eines der Felder ausfüllen („ab“ bzw. „bis
  einschließlich“). Der Zeitraum darf höchstens 366 Tage umfassen. Erst ein vollständiges Datum
  zwischen dem Jahr 2000 und 2999 wird übernommen.
- **Aktion** mit je einem Kästchen für „Rolle“ und „Status“: Wählen Sie eines oder beide (beide
  zeigen Rollen- und Statusänderungen). Konnte die Liste der Aktionen nicht geladen werden, steht dort
  „Aktionen konnten nicht geladen werden.“; die übrigen Filter funktionieren trotzdem.
- **Benutzer**: Wählen Sie ein Benutzerkonto, um nur die Änderungen **an diesem Konto** zu sehen
  (nicht die Änderungen, die dieser Benutzer selbst vorgenommen hat).
  1. Tippen Sie einen Teil des Namens. Nach einem kurzen Moment erscheinen passende Benutzer (nur mit
     Namen). Gibt es keinen, steht dort „Keine Benutzer gefunden“.
  2. Wählen Sie den Benutzer per Klick oder mit Pfeiltasten und **Eingabetaste**.

Jeder aktive Filter steht als Chip über der Tabelle, z. B. „Von: 01.10.2026“, „Bis: 31.10.2026“,
„Aktion: Status“ oder „Benutzer: {Name}“. Das Kreuz im Chip hebt nur diesen Filter auf.
**Filter zurücksetzen** hebt alle Filter auf und setzt den Fokus in das Feld **Von**.

Passt kein Eintrag zu den Filtern, steht dort „Keine Einträge für diese Filter.“ mit dem Button
**Filter zurücksetzen**. Ist ein Filter ungültig (z. B. „Bis“ vor „Von“ oder mehr als 366 Tage),
steht die Meldung direkt am Feld, und die Tabelle wird nicht angezeigt:

| Meldung | Bedeutung |
|---|---|
| „Das Datum „bis“ darf nicht vor dem Datum „von“ liegen.“ | Tauschen oder korrigieren Sie die Daten. |
| „Der Zeitraum darf höchstens 366 Tage umfassen.“ | Wählen Sie einen kürzeren Zeitraum. |

### Filter in der Adresszeile

Reiter, Filter und Seite stehen in der Adresszeile des Browsers, z. B.
`/benutzerverwaltung?reiter=aenderungsprotokoll&von=2026-10-01&bis=2026-10-31&aktion=Status`.

- **Teilen und merken:** Sie können die Adresse als Lesezeichen speichern oder an andere
  Administratoren weitergeben. Beim Öffnen erscheinen dieselben Filter. Der Name eines gefilterten
  Benutzers steht nie in der Adresse, nur eine interne Kennung; der Chip zeigt den Namen aus den
  geladenen Einträgen, ohne Einträge „Benutzer: unbekannt“.
- **Zurück-Schaltfläche:** Jede Filteränderung und jedes Blättern ist ein eigener Schritt im
  Browserverlauf. Mit **Zurück** kehren Sie zum vorigen Filterstand zurück. Der Wechsel zwischen den
  Reitern legt keinen eigenen Schritt an.
- Die Filter bleiben beim Wechsel zum Reiter **Benutzer** in der Adresse und gelten wieder, sobald Sie
  zum Änderungsprotokoll zurückwechseln.

Öffnen Sie eine Seite, die es nicht (mehr) gibt, steht dort „Auf dieser Seite gibt es keine
Einträge.“; mit **Vorherige Seite** kommen Sie zurück.

| Spalte | Inhalt |
|---|---|
| Zeitpunkt | Datum und Uhrzeit der Änderung in deutscher Zeit, z. B. „05.10.2026, 14:34 Uhr“; mit der Maus darüber erscheinen auch die Sekunden |
| Geändert von | wer die Änderung vorgenommen hat; „System (Ersteinrichtung)“ beim ersten Administrator, der beim Einrichten automatisch angelegt wurde |
| Benutzer | wessen Konto geändert wurde |
| Änderung | „Rolle“ oder „Status“ |
| Vorher, Nachher | z. B. „Keine Rolle“ → „Betrachter“ oder „Aktiv“ → „Deaktiviert“ |

Einträge im Änderungsprotokoll können nicht geändert oder gelöscht werden. Sie werden vorerst unbegrenzt
aufbewahrt. Ohne Einträge steht dort „Noch keine Einträge.“
