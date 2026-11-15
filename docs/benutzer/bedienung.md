# Bedienung – Formulare, Dialoge und Tabellen

Diese Anleitung beschreibt, was auf allen Seiten von C.O.I.N. gleich funktioniert: Formulare
ausfüllen, Rückfragen bestätigen und Tabellen bedienen.

## Formulare ausfüllen

Das gilt für **Coin hinzufügen**, **Coin bearbeiten**, **Ausgabe erfassen**, **Vorlage hochladen**,
**Startseite verwalten** und für die Felder in Dialogen (z. B. Storno-Grund, Hologrammnummer,
Auflage).

- Die Felder stehen in beschrifteten Abschnitten, z. B. „Stammdaten“ oder „Empfänger“. Auf breiten
  Bildschirmen stehen kurze, zusammengehörige Felder nebeneinander.
- **Pflichtfelder** tragen hinter der Beschriftung „(Pflicht)“. Freiwillige Felder tragen
  „(optional)“.
- Unter manchen Feldern steht ein **Hinweis** zu den Regeln, z. B. „Höchstens 2.000 Zeichen.“
- **Fehler** erscheinen erst, wenn Sie ein Feld geändert und verlassen haben, nicht schon während der
  Eingabe. Ein leeres Pflichtfeld, das Sie nur überspringen, meldet erst beim Absenden. Ist der Wert
  wieder gültig, verschwindet die Meldung beim Weitertippen.
- Beim **Absenden mit Fehlern** wird nichts gespeichert. Alle Fehler werden angezeigt und der Cursor
  springt in das erste fehlerhafte Feld. Bei mehreren Fehlern steht oben im Formular „Bitte die
  markierten Eingaben prüfen.“ mit einer Liste. Ein Klick auf einen Eintrag führt zum Feld.
- Meldungen ohne Bezug zu einem Feld (z. B. „Ein Coin mit diesem Namen und Herausgeber existiert
  bereits.“ oder eine fehlende Verbindung) stehen oben im Formular. Ihre Eingaben bleiben erhalten.

### Speichern und Abbrechen

Am Ende des Formulars steht rechts die Hauptaktion (z. B. **Coin anlegen**, **Ausgabe speichern**),
links daneben **Abbrechen**. Auf schmalen Bildschirmen (unter 768 Pixel Breite) bleibt diese Leiste
beim Scrollen am unteren Rand sichtbar.

Während gespeichert wird, dreht sich im Button ein Ladesymbol. Weitere Klicks oder die Eingabetaste
lösen dann nichts aus. Sie speichern also nie versehentlich doppelt.

Jedes Formular lässt sich vollständig mit der Tastatur bedienen: **Tab** zum nächsten Feld,
Pfeiltasten in Auswahllisten und Optionsfeldern, **Leertaste** für Schalter und Dateiauswahl,
**Eingabetaste** zum Absenden.

## Warnung bei ungespeicherten Änderungen

Haben Sie in einem Formular etwas geändert und wollen die Seite verlassen (Seitenleiste, Link,
**Abbrechen**, **Zurück** im Browser), fragt C.O.I.N. nach: **Ungespeicherte Änderungen**, z. B.
„Der neue Coin ist nicht gespeichert. Seite trotzdem verlassen?“

- **Bleiben** (oder die Escape-Taste): Sie bleiben auf der Seite, Ihre Eingaben bleiben erhalten.
- **Verlassen**: Die Seite wird ohne Speichern verlassen, die Eingaben gehen verloren.

Die Warnung gibt es auf **Coin hinzufügen**, **Coin bearbeiten**, **Ausgabe erfassen**,
**Startseite verwalten** und im Reiter **Zertifikatsvorlage** der Coin-Detailseite (dort auch beim
Wechsel in einen anderen Reiter, wenn eine Datei gewählt, aber nicht hochgeladen ist).

Ohne Änderung erscheint keine Warnung. Haben Sie einen Wert zurück auf den alten Stand gesetzt, gilt
das ebenfalls als „nicht geändert“. Nach erfolgreichem Speichern erscheint sie nicht.

**Ausnahme auf „Coin bearbeiten“:** Haben Sie ein neues Motivbild gewählt, aber nicht auf **Bild
hochladen** geklickt, warnt die Seite auch nach dem Speichern der Stammdaten. Der Text lautet dann
„Das ausgewählte Motivbild ist noch nicht hochgeladen. Wenn Sie die Seite verlassen, geht die
Auswahl verloren.“ Mit **Bleiben** können Sie das Bild noch hochladen. Die Stammdaten sind in diesem
Fall schon gespeichert. Der Seitenkopf zeigt aber bis zum Neuladen noch den alten Namen.

Beim Neuladen oder Schließen des Browserfensters zeigt der Browser seine eigene Rückfrage, deren
Text C.O.I.N. nicht festlegen kann. Das gilt auch, wenn Sie sich mit ungespeicherten Änderungen
abmelden oder die Anmeldung abgelaufen ist.

In Dialogen (Storno, Hologrammnummer, Auflage ändern) gibt es keine Warnung: **Abbrechen** und
Escape verwerfen die Eingabe dort ohne Rückfrage.

## Bestätigungsdialoge

Aktionen mit Folgen fragen vorher nach: **Stornieren** einer Ausgabe, **Deaktivieren** eines
Benutzers, **Rolle ändern**, **Auf Standardvorlage zurücksetzen** und **Änderungen verwerfen** auf
der Startseiten-Verwaltung.

- Der Dialog nennt die Frage als Titel (z. B. „Ausgabe stornieren?“) und darunter die Folge.
- Der Bestätigungsbutton heißt wie die Aktion (z. B. **Stornieren**, **Deaktivieren**).
- **Abbrechen** oder Escape schließen den Dialog, ohne etwas zu ändern. Der Cursor steht danach
  wieder auf dem Button, der den Dialog geöffnet hat.
- Während die Aktion läuft, zeigt der Bestätigungsbutton ein Ladesymbol und der Dialog bleibt
  geöffnet. Bei einem Fehler steht die Meldung im Dialog.

## Tabellen

Das gilt für Exemplare, Ausgabehistorie, Benutzer, Audit-Log und die Versionen der
Zertifikatsvorlage. Der Katalog `/coins` ist im [Coin-Katalog](coin-katalog.md#katalog-ansehen)
beschrieben.

### Sortieren

Nur die Tabelle der **Vorlagenversionen** lässt sich sortieren: Ein Klick auf den Spaltenkopf
**Version**, **Hochgeladen am** oder **Größe** sortiert danach, ein zweiter Klick kehrt die
Reihenfolge um. Ein Pfeil zeigt die Richtung. Voreingestellt ist die neueste Version zuerst.

Die übrigen Tabellen haben eine feste Reihenfolge: Exemplare nach Nummer, Ausgaben und Audit-Log
neueste zuerst, Benutzer nach Name.

### Filter-Chips

Ist ein Filter aktiv (Status bei Exemplaren und Ausgaben, Suche im Katalog und in der
Benutzerverwaltung, Benutzer im Audit-Log), steht er unter der Filterauswahl als Chip, z. B.
„Status: Ausgegeben“, „Suche: Muster“ oder „Benutzer: Testperson A“. Das Kreuz im
Chip entfernt den Filter. Die Liste beginnt dann wieder auf Seite 1. Bei mehreren Chips entfernt
**Alle Filter entfernen** alle auf einmal.

### Blättern

Lange Listen zeigen 25 Einträge je Seite. Mit **Vorherige Seite** und **Nächste Seite** unter der
Tabelle blättern Sie, dazwischen steht „Seite x von y“.

### Zeilen anklicken

In der **Ausgabehistorie** öffnet ein Klick irgendwo in die Zeile die Seite der Ausgabe. Mit der
Tastatur erreichen Sie dafür die Zertifikatsnummer in der Zeile (**Tab**, dann **Eingabetaste**).
Ein Klick mit gedrückter Strg-, Cmd-, Umschalt- oder Alt-Taste oder beim Markieren von Text öffnet
nichts.

### Kleine Bildschirme

Auf schmalen Bildschirmen erscheinen die Einträge als Karten statt als Tabelle: oben der Titel
(z. B. die Nummer), darunter die übrigen Spalten als Liste und die Buttons. Das gilt unter 768 Pixel
Breite, bei der Ausgabehistorie mit ihren vielen Spalten schon unter 1024 Pixel. Sie müssen so nie
seitlich scrollen. Ausnahme ist die Tabellenansicht des Katalogs: Sie lässt sich auf schmalen
Bildschirmen seitlich verschieben; alternativ wählen Sie dort die Ansicht **Karten** (siehe
[Coin-Katalog](coin-katalog.md#ansicht-wählen-tabelle-oder-karten)).
