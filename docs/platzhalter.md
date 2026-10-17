# Platzhalter in Zertifikatsvorlagen

Zertifikatsvorlagen sind Word-Dokumente (.docx) mit Platzhaltern im Format `{{Gruppe.Feld}}`. Beim
Erzeugen eines Zertifikats werden sie durch die Werte der Ausgabe ersetzt. Grundlage:
[Feature zertifikatsvorlagen](features/zertifikatsvorlagen.md), [Feature zertifikat-erzeugen](features/zertifikat-erzeugen.md),
[ADR-0022](adr/0022-openxml-sdk-fuer-word-vorlagen.md), [ADR-0024](adr/0024-pruefung-hochgeladener-word-dateien.md),
[ADR-0028](adr/0028-zertifikat-erzeugen-im-speicher.md).

Die Liste ist im Code zentral definiert (`Coin.Domain.Vorlagen.Platzhalterkatalog`). Die Tabelle
unten wird automatisch gegen den Code geprüft und muss bei jeder Änderung mitgezogen werden. Die
Marker-Kommentare und das Tabellenformat (Spaltenreihenfolge, Name in Backticks, `ja`/`nein`) nicht
verändern.

<!-- platzhalter:start -->
| Platzhalter | Pflicht | Bedeutung | Beispiel |
|---|---|---|---|
| `Coin.Name` | ja | Name des Coins | Einsatzkontingent Beispiel 2025 |
| `Exemplar.Nummer` | ja | Nummer des Exemplars | 12 |
| `Zertifikat.Nummer` | ja | Eindeutige Nummer des Zertifikats | C0042-0012 |
| `Empfaenger.Name` | ja | Name des Empfängers | Max Beispiel |
| `Coin.Herausgeber` | nein | Herausgeber des Coins | Beispielbataillon 1 |
| `Coin.Beschreibung` | nein | Beschreibung des Coins | Optionaler Text |
| `Coin.Auflage` | nein | Auflage des Coins | 500 |
| `Empfaenger.Dienstgrad` | nein | Dienstgrad des Empfängers | Hauptmann |
| `Empfaenger.Dienststelle` | nein | Dienststelle des Empfängers | Beispielbataillon 1 |
| `Ausgabe.Datum` | nein | Datum der Ausgabe | 01.10.2026 |
| `Ausgabe.Gelegenheit` | nein | Gelegenheit der Ausgabe | Truppenbesuch |
| `Ausgabe.Begruendung` | nein | Begründung der Ausgabe | Herausragende Leistung |
| `Ausgabe.AusgebendeStelle` | nein | Ausgebende Stelle oder Person | Kommandeur Beispielbataillon 1 |
<!-- platzhalter:ende -->

Regeln für hochgeladene Vorlagen:
- Alle Pflichtplatzhalter müssen enthalten sein; optionale dürfen fehlen; jeder Platzhalter darf
  mehrfach vorkommen.
- Schreibweise exakt wie oben, ohne Leerzeichen innerhalb der Klammern, Groß-/Kleinschreibung zählt.
  Andere Texte in doppelten geschweiften Klammern gelten als unbekannte Platzhalter.
- Ein Platzhalter muss innerhalb eines Absatzes stehen. Formatwechsel mitten im Platzhalter stören
  die Prüfung nicht.
- Geprüft werden Haupttext, Kopf- und Fußzeilen, Fuß- und Endnoten, Tabellen und Textfelder.
- Eine Vorlage darf höchstens 200 Platzhaltervorkommen enthalten (alle Teile zusammen).

## Beim Erzeugen

- Ersetzt wird in denselben Teilen, die auch geprüft werden (Haupttext, Kopf- und Fußzeilen, Fuß-
  und Endnoten, darin Tabellen, Textfelder, Inhaltssteuerelemente, Hyperlink-Texte und
  Feldergebnisse). Aktualisiert jemand ein Feld später in Word, gilt dessen Ergebnis.
- Der Wert übernimmt die Formatierung des Zeichens, mit dem der Platzhalter beginnt (erstes `{`).
  Text vor und nach dem Platzhalter bleibt mit seiner Formatierung erhalten.
- Werte werden als Text eingesetzt, nie als Word-Markup. Ein Wert, der selbst wie ein Platzhalter
  aussieht, wird nicht noch einmal ersetzt.
- Formate: `Exemplar.Nummer` und `Coin.Auflage` als Ziffern ohne führende Nullen und ohne
  Tausenderpunkt (`12`, `1500`), `Ausgabe.Datum` als `TT.MM.JJJJ`, `Zertifikat.Nummer` wie
  gespeichert (`C0042-0012`). Zeilenumbrüche in `Coin.Beschreibung`, `Ausgabe.Gelegenheit`,
  `Ausgabe.Begruendung` und `Ausgabe.AusgebendeStelle` werden zu Zeilenumbrüchen in Word.
- Fehlt ein optionaler Wert (z. B. kein Dienstgrad), bleibt die Stelle leer; der umgebende Text
  bleibt stehen.
- Tabulatoren in Werten werden zu Tabulatoren in Word; Steuerzeichen, die Word nicht darstellen kann,
  entfallen. Lange Texte werden nicht gekürzt.
- Die `Coin.*`-Werte (Name, Herausgeber, Beschreibung, Auflage) kommen aus dem aktuellen Stand des
  Coins, alle übrigen Werte aus der Ausgabe.
- Die Standardvorlage wird im Zertifikat ohne den Abschnitt „Erläuterung der Platzhalter“ erzeugt.
- Enthält eine gespeicherte Vorlage mehr als 200 Platzhalter, wird kein Zertifikat erzeugt
  (`409 vorlage_zu_viele_platzhalter`).
