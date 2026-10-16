# Platzhalter in Zertifikatsvorlagen

Zertifikatsvorlagen sind Word-Dokumente (.docx) mit Platzhaltern im Format `{{Gruppe.Feld}}`. Beim
späteren Ausstellen eines Zertifikats werden sie durch die Werte ersetzt. Grundlage:
[Feature zertifikatsvorlagen](features/zertifikatsvorlagen.md), [ADR-0022](adr/0022-openxml-sdk-fuer-word-vorlagen.md),
[ADR-0024](adr/0024-pruefung-hochgeladener-word-dateien.md).

Die Liste ist im Code zentral definiert (`Coin.Domain.Vorlagen.Platzhalterkatalog`). Die Tabelle
unten wird automatisch gegen den Code geprüft und muss bei jeder Änderung mitgezogen werden. Die
Marker-Kommentare und das Tabellenformat (Spaltenreihenfolge, Name in Backticks, `ja`/`nein`) nicht
verändern.

<!-- platzhalter:start -->
| Platzhalter | Pflicht | Bedeutung | Beispiel |
|---|---|---|---|
| `Coin.Name` | ja | Name des Coins | Einsatzkontingent Beispiel 2025 |
| `Exemplar.Nummer` | ja | Nummer des Exemplars | 12 |
| `Zertifikat.Nummer` | ja | Eindeutige Nummer des Zertifikats | wird beim Ausstellen vergeben |
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
