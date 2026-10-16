# ADR-0022: OpenXML SDK für Word-Vorlagen, Platzhalterkatalog im Code

Status: Angenommen, umgesetzt (Entscheidungen des Auftraggebers vom 2026-10-09 in `docs/features/zertifikatsvorlagen.md`) · Datum: 2026-10-09 · Feature: [zertifikatsvorlagen](../features/zertifikatsvorlagen.md)

## Kontext
Je Coin gibt es eine Word-Vorlage (.docx) für das Echtheitszertifikat. Das Backend muss eine Standardvorlage erzeugen (nicht als Binärdatei im Repo), hochgeladene Vorlagen lesen, prüfen und bereinigen und später Platzhalter ersetzen. Vorgaben: Platzhalter `{{Gruppe.Feld}}` aus einer zentralen Liste im Code, auch wenn Word sie auf mehrere Runs verteilt; Kopf- und Fußzeilen und Tabellen werden mitgeprüft. Das Backend läuft auf .NET 10, die Domain hat keine Abhängigkeiten nach außen.

## Entscheidung
1. **Bibliothek `DocumentFormat.OpenXml`** (Open XML SDK, .NET Foundation, MIT-Lizenz), neueste stabile 3.x-Version, nur in `Coin.Infrastructure`. Sie unterstützt `net8.0`+ bzw. `netstandard2.0` und damit .NET 10. Genutzt werden das typisierte Dokumentmodell (`WordprocessingDocument`) zum Erzeugen der Standardvorlage, zum Lesen der Absätze und zum Bereinigen der Dokumenteigenschaften (ADR-0024) sowie `OpenXmlValidator` in Tests.
2. **Kein Office, kein Interop, kein Konverter** auf dem Server. Dokumente werden nur als ZIP/XML gelesen und geschrieben, nie geöffnet oder gerendert.
3. **Platzhalterkatalog in der Domain** (`Coin.Domain.Vorlagen.Platzhalterkatalog`, ohne Bibliotheksabhängigkeit): Name, Pflicht, Bedeutung, Beispiel. Standardvorlage, Prüfung und Dokumentation (`docs/platzhalter.md`, per Unit-Test abgeglichen) nutzen nur diese Liste.
4. **Schnitt Domain/Infrastructure**: Die Infrastructure liefert je Absatz den verketteten Text aller Runs (Port `IDocxAnalyse`, Regeln in ADR-0024). Die Domain prüft die Platzhalter nur auf diesen Texten (`PlatzhalterPruefung`). Damit ist die Run-Verteilung an genau einer Stelle gelöst und die Platzhalterlogik ohne DOCX unit-testbar. Die Bereinigung ist ein eigener Port (`IDocxBereinigung`).
5. **Standardvorlage per Code**: `StandardvorlageErzeuger` baut das Dokument mit dem SDK (A4, Ränder, Stile, Fußzeile, Erläuterungstabelle aus dem Katalog), je Prozess einmal, und hält die Bytes im Speicher. Sie wird metadatenfrei erzeugt (nur `dc:creator` „C.O.I.N.“, kein `lastModifiedBy`, keine Firma, keine benutzerdefinierten Eigenschaften) und entspricht damit bereits dem Ergebnis der Bereinigung. Jeder Platzhalter steht in genau einem Run.
6. Testdokumente (gültige und bösartige) werden in den Tests per SDK bzw. `System.IO.Compression.ZipArchive` erzeugt; im Repository liegen keine DOCX-Dateien.

## Betrachtete Optionen
| Option | Bewertung |
|---|---|
| **Open XML SDK (gewählt)** | MIT, von Microsoft gepflegt, vollständiges Schema-Modell, Validator, keine nativen Abhängigkeiten; Run-Verteilung muss selbst behandelt werden (Punkt 4) |
| DocX (Xceed) | Community-Version mit eingeschränkter Lizenz für kommerzielle Nutzung, weniger Kontrolle über XML-Details, verworfen |
| NPOI | Apache-2.0, aber primär Excel/Word 97; XWPF weniger vollständig, verworfen |
| Aspose.Words, Syncfusion | kommerziell bzw. Lizenzschlüssel, verworfen |
| Vorlage als DOCX im Repo | Vorgabe schließt Binärdatei aus; Platzhalterliste und Datei könnten auseinanderlaufen, verworfen |
| reines `ZipArchive` + `XmlReader` ohne SDK | keine Fremdabhängigkeit, aber Erzeugen, Bereinigen und Validieren aufwendig; für die Vorprüfung (ADR-0024) wird es trotzdem genutzt |

## Folgen
- Neue NuGet-Abhängigkeit in `Coin.Infrastructure` (und transitiv in den Integrationstests). Updates folgen dem normalen Abhängigkeitsprozess.
- Das spätere Feature „Zertifikate erzeugen“ kann mit derselben Bibliothek und derselben Absatz-Logik Platzhalter ersetzen.
- Eine PDF-Ausgabe ist damit nicht gelöst; sie braucht eine eigene Entscheidung.
