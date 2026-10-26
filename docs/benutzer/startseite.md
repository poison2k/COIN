# Startseite – Anleitung

Die Startseite (Seitenleiste › **Startseite**) besteht aus bis zu fünf **Blöcken**. Welche Blöcke in
welcher Reihenfolge erscheinen, legen Administratoren auf der Seite **Startseite verwalten** fest.

## Was sehe ich auf der Startseite?

| Block | Inhalt |
|---|---|
| **Kopfbereich** | links das Logo des Bereitstellers, in der Mitte Titel und Untertitel, rechts das Logo der Software; auf schmalen Bildschirmen untereinander |
| **Infotext** | ein Text mit einfacher Formatierung |
| **Kennzahlen** | **Coins** (Anzahl im Katalog), **Exemplare gesamt** (Summe der Auflagen), **Ausgegeben** (nicht stornierte Ausgaben), **Verfügbar** (Exemplare minus Ausgegeben) |
| **Neueste Coins** | die zuletzt angelegten Coins mit Motivbild, Name (Link zur Detailseite) und Herausgeber |
| **Meistausgegebene Coins** | Coins mit den meisten nicht stornierten Ausgaben, z. B. „7 ausgegeben“; bei Gleichstand alphabetisch. Coins ohne Ausgabe fehlen |

Am Ende steht immer der Button **Zum Katalog**. Ist der Kopfbereich eingeschaltet, ist sein Titel die
Überschrift der Seite; sonst heißt sie „Willkommen bei C.O.I.N.“.

Wer was sieht:

- **Mit Rolle** (Administrator, Sachbearbeiter, Betrachter): alle eingeschalteten Blöcke. Die Startseite
  enthält nie Empfänger oder andere Angaben zu Personen.
- **Ohne Anmeldung, ohne Rolle oder mit deaktiviertem Konto**: nur den Kopfbereich, wenn er
  eingeschaltet ist; sonst die Begrüßung „Willkommen bei C.O.I.N.“ mit einem kurzen Einleitungstext.

Leere Listen zeigen „Noch keine Coins im Katalog.“ bzw. „Noch keine Coins ausgegeben.“ Kann die
Startseite nicht geladen werden, erscheint „Die Startseite konnte nicht geladen werden. Bitte später
erneut versuchen.“ (nur mit Rolle; ohne Rolle erscheint die Begrüßung).

Solange ein Administrator nichts gespeichert hat, gilt die Standardeinstellung: Kopfbereich aus,
Infotext „C.O.I.N. verwaltet die Gedenk-Coins der Bundeswehr: den Katalog der Coins, ihre nummerierten
Exemplare und die Echtheitszertifikate.“, Kennzahlen an, 6 neueste und 5 meistausgegebene Coins.

## Startseite verwalten

Nur für Administratoren: Seitenleiste › **Startseite verwalten** (Adresse `/verwaltung/startseite`).
Andere Benutzer sehen den Eintrag nicht; rufen sie die Adresse direkt auf, erscheint „Kein Zugriff“.

Die Seite hat zwei Reiter: **Bearbeiten** und **Vorschau**. Unter der Überschrift steht nach dem ersten
Speichern „Zuletzt gespeichert am {Datum} von {Name}“.

### Blöcke ein- und ausschalten, Reihenfolge ändern

Unter **Bearbeiten** steht für jeden Block eine Karte in der aktuellen Reihenfolge.

- Der Schalter **{Block} anzeigen** (z. B. „Kennzahlen anzeigen“) schaltet den Block ein oder aus. Mit
  der Tastatur: Tab bis zum Schalter, dann Leertaste.
- Die Pfeil-Buttons **{Block} nach oben verschieben** und **{Block} nach unten verschieben** verschieben
  den Block um eine Stelle. Der Fokus bleibt auf dem Button, Bildschirmleser hören z. B. „Kennzahlen
  steht jetzt an Position 2 von 5.“ Am Anfang bzw. Ende der Liste ist der jeweilige Button gesperrt.
- Bei **Neueste Coins** (3 bis 12) und **Meistausgegebene Coins** (3 bis 10) wählen Sie unter
  **Anzahl**, wie viele Coins erscheinen.

### Kopfbereich

- **Titel**: Pflicht, solange der Kopfbereich angezeigt wird, höchstens 100 Zeichen.
- **Untertitel**: optional, höchstens 200 Zeichen.
- Zwei Logo-Plätze: **Logo des Bereitstellers** (z. B. Wappen des Verbands) und **Logo der Software**.

**Kopfbereich und Logos sind auch ohne Anmeldung sichtbar.** Jeder, der die Anwendung erreicht, sieht
Titel, Untertitel und Logos. Ein gespeichertes Logo bleibt unter seiner Adresse abrufbar, auch wenn
der Kopfbereich ausgeschaltet ist; entfernen Sie es, wenn es nicht mehr öffentlich sein soll.

### Logos

1. Unter dem Logo-Platz **Logo auswählen** klicken und die Datei wählen. Das Logo erscheint sofort als
   Vorschau im Feld.
2. Im Feld **Alternativtext** beschreiben, was das Logo zeigt (z. B. „Wappen des
   Beispielbataillons 1“). Der Alternativtext ist Pflicht, sobald ein Logo vorhanden oder ausgewählt
   ist (höchstens 200 Zeichen). Bildschirmleser lesen ihn anstelle des Bildes vor.
3. **Speichern** klicken. Erst dann wird das Logo übernommen.

**Logo entfernen** löscht das Logo dieses Platzes beim nächsten Speichern. Ein vorhandenes Logo bleibt
erhalten, solange Sie keine neue Datei auswählen; den Alternativtext können Sie trotzdem ändern.

Anforderungen an die Datei:

- **PNG, JPEG oder WebP**, höchstens **2 MB** und **2048 × 2048 Pixel**.
- **Kein SVG** und keine animierten Bilder (z. B. animiertes PNG oder WebP). Der Server prüft den
  Inhalt der Datei, nicht ihre Endung: Eine umbenannte Datei wird abgelehnt.
- Haben Sie das Logo nur als SVG, wandeln Sie es vorher in PNG um, z. B. indem Sie es im Browser oder
  in einem Grafikprogramm öffnen und als PNG exportieren (Größe höchstens 2048 Pixel je Seite).
- **Bitte nur Bilder ohne personenbezogene Metadaten hochladen.** C.O.I.N. entfernt eingebettete
  Angaben wie EXIF (z. B. Aufnahmeort, Kamera, Autor) nicht. Entfernen Sie sie vorher, z. B. durch
  „Exportieren“ als neue PNG-Datei.
- Logos erscheinen höchstens 96 Pixel hoch und auch im dunklen Farbschema auf hellem Hintergrund.

### Infotext

Im Feld **Infotext** (höchstens 5.000 Zeichen, der Zähler zeigt „{n} von 5.000 Zeichen“) ist diese
Formatierung möglich:

| Eingabe | Ergebnis |
|---|---|
| `**fett**` | **fett** |
| `*kursiv*` | *kursiv* |
| Zeilen mit `- ` am Anfang | Aufzählung |
| Zeilen mit `1. ` am Anfang | nummerierte Liste |
| Leerzeile | neuer Absatz |
| einfacher Zeilenumbruch | Zeilenumbruch im selben Absatz |
| `[Text](https://beispiel.de)` | Link, öffnet in einem neuen Tab |
| `[Text](mailto:stelle@beispiel.de)` oder `[Text](/coins)` | Link im selben Tab |

Links sind nur auf Adressen mit `https://`, `http://`, `mailto:` oder auf Seiten von C.O.I.N. (`/…`)
möglich; andere Links erscheinen als reiner Text. HTML, Bilder und andere Formatierungen werden nicht
angezeigt. Tragen Sie **keine personenbezogenen Daten** in den Infotext ein. Ist der Infotext
eingeschaltet, darf er nicht leer sein.

### Vorschau

Der Reiter **Vorschau** zeigt die Startseite so, wie Benutzer mit Rolle sie nach dem Speichern sehen,
mit Ihren noch nicht gespeicherten Änderungen und echten Kennzahlen und Coins. Neu ausgewählte Logos
erscheinen schon, entfernte nicht mehr. Besucher ohne Anmeldung sehen davon nur den Kopfbereich.

### Speichern und Verwerfen

- **Speichern** übernimmt alle Änderungen auf einmal. Danach erscheint „Die Startseite wurde
  gespeichert.“ Benutzer und Besucher sehen die Änderung, sobald sie die Startseite neu laden.
- **Änderungen verwerfen** fragt „Änderungen verwerfen?“ und stellt nach **Verwerfen** den zuletzt
  gespeicherten Stand wieder her. **Abbrechen** schließt ohne Änderung.
- Verlassen Sie die Seite mit ungespeicherten Änderungen über die Seitenleiste oder einen Link, fragt
  C.O.I.N. „Ungespeicherte Änderungen“ – **Verlassen** verwirft sie, **Bleiben** kehrt zurück. Beim
  Neuladen oder Schließen des Tabs warnt der Browser.

Jede gespeicherte Änderung wird mit Zeitpunkt und Benutzer protokolliert, ohne die Texte selbst.

### Gleichzeitiges Bearbeiten

Hat ein anderer Administrator die Startseite gespeichert, während Sie bearbeiten, erscheint beim
Speichern „Die Startseite wurde inzwischen geändert. Bitte die Seite neu laden.“ mit dem Button
**Neu laden**. Nichts von Ihren Änderungen wurde gespeichert. **Neu laden** holt den aktuellen Stand
(„Die Konfiguration wurde neu geladen.“); Ihre Eingaben sind danach verworfen. Notieren Sie sie vorher,
wenn Sie sie erneut eintragen möchten.

## Fehlermeldungen

Bei Fehlern erscheint oben „Bitte die markierten Eingaben prüfen.“, die Meldung steht am betroffenen
Feld, und der Cursor springt in das erste fehlerhafte Feld. Ihre Eingaben und ausgewählten Dateien
bleiben erhalten.

| Meldung | Was tun? |
|---|---|
| „Bitte einen Titel eingeben oder den Kopfbereich ausschalten.“ | Titel eintragen oder Kopfbereich ausschalten. |
| „Bitte einen Infotext eingeben oder den Block ausschalten.“ | Text eintragen oder Infotext ausschalten. |
| „Der Titel darf höchstens 100 Zeichen lang sein.“ (ebenso Untertitel 200, Alternativtext 200, Infotext 5.000) | Text kürzen. |
| „Bitte einen Alternativtext für das Logo des Bereitstellers eingeben.“ (bzw. „… der Software …“) | Beschreiben, was das Logo zeigt. |
| „Bitte eine Bilddatei für das Logo des Bereitstellers auswählen.“ (bzw. „… der Software …“) | Das bisherige Logo gibt es nicht mehr (z. B. von einem anderen Administrator entfernt). Logo neu auswählen oder **Logo entfernen** klicken; im Zweifel die Seite neu laden. |
| „SVG-Dateien sind nicht erlaubt. Bitte das Logo als PNG, JPEG oder WebP hochladen.“ | Logo in PNG umwandeln (siehe oben). |
| „Die Datei ist kein Bild im Format PNG, JPEG oder WebP.“ | Echte PNG-, JPEG- oder WebP-Datei verwenden; Umbenennen genügt nicht. |
| „Die Datei ist leer.“ | Datei neu speichern. |
| „Die Bilddatei ist beschädigt oder unvollständig.“ | Bild neu exportieren. |
| „Das Logo ist {b} × {h} Pixel groß; erlaubt sind höchstens 2048 × 2048 Pixel.“ | Bild verkleinern. |
| „Animierte Bilder sind nicht erlaubt.“ | Ein unbewegtes Bild verwenden. |
| „Das Logo des Bereitstellers darf höchstens 2 MB groß sein.“ (bzw. „… der Software …“) | Bild verkleinern oder stärker komprimieren. |
| „Die Anfrage ist zu groß. Logos dürfen höchstens 2 MB groß sein.“ | Kleinere Logos verwenden. |
| „Der Text enthält unzulässige Steuerzeichen.“ | Text neu eintippen statt aus einer anderen Anwendung einfügen. |
| „Die Startseite wurde inzwischen geändert. Bitte die Seite neu laden.“ | Siehe [Gleichzeitiges Bearbeiten](#gleichzeitiges-bearbeiten). |
| „Die Konfiguration der Startseite konnte nicht geladen werden. Bitte später erneut versuchen.“ | **Erneut versuchen** klicken. |
| „Sie sind nicht berechtigt, die Startseite zu verwalten.“ | Nur Administratoren pflegen die Startseite. |
| „Ihr Benutzerkonto ist deaktiviert.“ | Siehe [Anmeldung](anmeldung.md#konto-deaktiviert). |
| „Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …“ | Erneut anmelden. |
| „Die Startseite konnte nicht gespeichert werden. Bitte später erneut versuchen.“ | Technisches Problem, z. B. keine Verbindung zum Server. |
