# ADR-0028: Zertifikat erzeugen – Platzhalterersetzung auf ZIP/XML-Ebene im Speicher

Status: Angenommen, umgesetzt (Entscheidungen des Auftraggebers vom 2026-10-16, F6–F8, F10, F11 in `docs/features/zertifikat-erzeugen.md`; Details unter „Umsetzung“) · Datum: 2026-10-16 · Feature: [zertifikat-erzeugen](../features/zertifikat-erzeugen.md) · Ergänzt: [ADR-0022](0022-openxml-sdk-fuer-word-vorlagen.md), [ADR-0024](0024-pruefung-hochgeladener-word-dateien.md) Punkt 4, 5, 7

## Kontext
Zu jeder aktiven Ausgabe wird ein DOCX aus der aktiven Vorlage des Coins (oder der Standardvorlage) erzeugt. Vorgaben: alle Platzhalter in Text, Tabellen, Kopf- und Fußzeilen ersetzen, Formatierung der Platzhalter erhalten, Werte als Text (Sonderzeichen, Zeilenumbrüche, lange Texte), keine erneute Ersetzung, Originalvorlage unverändert, keine Zwischenspeicherung auf dem Server, keine Personendaten in Logs.

Ist-Stand: Gespeicherte Vorlagen sind geprüft und bereinigt (ADR-0024, ADR-0026). Die Platzhalterprüfung liest je Absatz den Text aller `w:t` (`Absatztexte`, ADR-0022 Punkt 4) in den Story-Teilen `OpcPaket.Geschichten()`: Hauptteil, Kopf- und Fußzeilen, Fuß- und Endnoten – darin Tabellen, Textfelder, Inhaltssteuerelemente, Hyperlinks und Feldergebnisse; `w:br`/`w:cr` trennen, `w:tab` zählt als Leerzeichen, `w:instrText`/`w:delText` zählen nicht; das Glossar wird nicht geprüft. Die Zerlegung (`PlatzhalterPruefung`) sucht von links `{{` bis zum nächsten `}}`.

## Entscheidung
1. **Gleiche Textsicht wie die Prüfung.** Die Ersetzung arbeitet auf genau den Teilen und Textknoten, die die Prüfung liest. Die Absatz-Logik wird so verallgemeinert, dass Prüfung und Ersetzung denselben Durchlauf nutzen (z. B. `Absatztexte` liefert Segmente mit Verweis auf den `w:t`-Knoten). Nicht ersetzt wird in `w:instrText`, im Glossar, in Attributen (Alternativtext, `w:alias`, `w:tag`), in Beziehungszielen und in `docProps`.
2. **Reine Ersetzungslogik in der Domain** (`Coin.Domain.Zertifikate.PlatzhalterErsetzung`): Eingabe je Absatz die Liste der Segmenttexte und die Werte, Ausgabe je Segment der neue Inhalt als Folge von Bausteinen (Text, Zeilenumbruch, Tabulator). Zerlegung wie `PlatzhalterPruefung`, nur bekannte Platzhalter werden ersetzt. Ohne DOCX unit-testbar.
3. **Ein Durchgang, keine erneute Ersetzung.** Alle Fundstellen eines Absatzes werden auf dem Originaltext ermittelt, bevor etwas geändert wird. Eingesetzte Werte werden nie erneut durchsucht; ein Wert `{{Coin.Name}}` steht wörtlich im Ergebnis.
4. **Formatierung des ersten Runs.** Der Wert kommt in den Run des `w:t`, in dem das erste `{` des Platzhalters steht, an dessen Stelle; dessen `w:rPr` gilt damit für den ganzen Wert. Die übrigen Zeichen des Platzhalters werden aus den folgenden `w:t` entfernt; deren Runs, Formatierung und übriger Text bleiben unverändert.
5. **Werte als Text, nie als XML.** Einfügen nur über die XML-API (Textknoten), Escaping übernimmt der Writer. Je Wert: `\r\n`, `\r`, `\n`, U+0085, U+2028, U+2029 → `w:br`; `\t` → `w:tab`; in XML 1.0 unzulässige Zeichen (U+0000–U+0008, U+000B, U+000C, U+000E–U+001F, U+FFFE, U+FFFF) werden entfernt; einzelne Surrogate werden U+FFFD. Jedes `w:t` mit führendem oder folgendem Leerraum erhält `xml:space="preserve"`. Keine Kürzung. Leere optionale Werte ergeben leeren Text (F8). Coin-Werte stammen immer aus dem aktuellen Stand (F6), Datum `TT.MM.JJJJ`, Zahlen ohne Tausenderpunkt (F10).
6. **ZIP/XML statt typisiertem SDK-Modell.** Die Vorlagen-Bytes werden mit `System.IO.Compression.ZipArchive` gelesen; ein neues Paket entsteht in einem `MemoryStream`. Nicht betroffene Einträge werden byte-gleich und in derselben Reihenfolge übernommen, nur die Story-Teile mit Fundstellen werden neu geschrieben (UTF-8, gleiche XML-Deklaration, ohne Einrückung). Die Teile werden über `OpcPaket`/`Teilname` gefunden und mit den sicheren Leseeinstellungen von `SicheresXml` gelesen. Gründe: kein Umweg über `System.IO.Packaging` (das bei großen Teilen Zwischenablagen nutzen kann), keine Umformatierung unveränderter Teile durch das SDK, kein Dateisystem. Das SDK bleibt für die Standardvorlage und `OpenXmlValidator` in Tests.
7. **Nie auf Platte, nie im Cache.** Keine Temp-Dateien, kein Output- oder Response-Caching; Eingabe und Ergebnis leben nur als `byte[]`/`MemoryStream` für die Dauer des Requests. Die Originalvorlage wird nur gelesen. Download-Header wie bei den Vorlagen (`attachment`, `nosniff`, CSP-Sandbox, `no-store`).
8. **Grenzen** (F11). Höchstens 200 Platzhaltervorkommen je Vorlage (sonst `409`), damit ein 10-MiB-Dokument mit Tausenden `{{Ausgabe.Begruendung}}` nicht hunderte MiB erzeugt; dieselbe Grenze prüfen neue Uploads, gespeicherte Versionen bleiben unverändert. Prozessweit höchstens 2 gleichzeitige Erzeugungen (Singleton mit `SemaphoreSlim`, wie `VorlagenAufbereitung`).
9. **Fehler ohne Inhalt.** Jede Ausnahme beim Lesen oder Schreiben wird gefangen und als fester Fehler gemeldet (`500` mit festem deutschem Text); genau eine Warnung mit fester EventId, ohne Ausnahmeobjekt, Parameter oder Stacktrace (Muster `VorlagenProtokoll`).
10. **Standardvorlage als Zertifikatsfassung** (F7): Ohne eigene Vorlage wird eine vom `StandardvorlageErzeuger` erzeugte Fassung ohne den Abschnitt „Erläuterung der Platzhalter“ verwendet, je Prozess einmal erzeugt. In der Standardvorlage steht die Dienststelle in einem eigenen Absatz ohne Komma (F8).

## Betrachtete Optionen
| Thema | Option | Bewertung |
|---|---|---|
| Werkzeug | typisiertes SDK-Modell (`WordprocessingDocument.Open` auf `MemoryStream`) | bequem, schreibt aber ganze Teile neu und nutzt `System.IO.Packaging`; Zwischenablagen bei großen Teilen nicht ausgeschlossen, verworfen |
| | **ZipArchive + XDocument (gewählt)** | volle Kontrolle, unveränderte Teile byte-gleich, nur Speicher |
| | Textersetzung im rohen XML-String | bricht bei über Runs verteilten Platzhaltern und beim Escaping, verworfen |
| Verteilte Platzhalter | Runs zusammenführen (alle Runs eines Absatzes vereinigen) | zerstört Formatierung außerhalb des Platzhalters, verworfen |
| | **Wert in den Run des ersten Zeichens (gewählt)** | Formatierung wie in Word sichtbar am Anfang des Platzhalters |
| Erneute Ersetzung | Werte maskieren (`{{` → Ersatzzeichen) | verändert Benutzereingaben, verworfen |
| | **ein Durchgang auf dem Originaltext (gewählt)** | Werte bleiben wörtlich |
| Zeilenumbrüche | ein Absatz je Zeile | ändert Absatzformat und Nummerierung, verworfen |
| | **`w:br` im selben Run (gewählt)** | wie Umschalt+Enter in Word |
| Ungültige Zeichen | `400` beim Download | die Ausgabe ist unveränderlich, der Fehler wäre nicht behebbar, verworfen |
| | **entfernen (gewählt)** | nicht darstellbar, kein Informationsverlust für Leser |
| Ergebnis | auf Platte oder in der DB ablegen | Vorgabe „nicht zwischenspeichern“, Archivierung ist „nicht dazu“, verworfen |

## Folgen
- Prüfung und Ersetzung dürfen nicht auseinanderlaufen; der gemeinsame Durchlauf und Tests mit verteilten Platzhaltern sichern das ab.
- Platzhalter in Feldergebnissen werden ersetzt; aktualisiert Word das Feld (F9), überschreibt es den Wert. In Urkundenvorlagen selten, in der Anwenderdoku erwähnt.
- Werte mit Steuerzeichen erscheinen ohne diese Zeichen.
- Der Speicherbedarf je Erzeugung entspricht etwa der Aufbereitung beim Upload (ADR-0024 Punkt 7) für dieselbe Vorlage; übliche Vorlagen (unter 1 MiB) brauchen nur Millisekunden.

## Umsetzung
- Domain: `Coin.Domain.Zertifikate` mit `PlatzhalterErsetzung` (Konstante `MaxVorkommen = 200`, auch von `PlatzhalterPruefung` für die Upload-Meldung genutzt), `ZertifikatWerte`, `ZertifikatService`, Ports `IZertifikatErzeuger`, `IStandardzertifikat`, `IZertifikatProtokoll`, `IZertifikatRepository`. Infrastruktur: `Coin.Infrastructure.Zertifikate.ZertifikatErzeuger` (Singleton, `SemaphoreSlim(2)`), gemeinsamer Absatz-Durchlauf `Absatztexte.Segmente`, Zertifikatsfassung aus `StandardvorlageErzeuger` (einmal je Prozess erzeugt). API: `ZertifikateController`, gemeinsamer Download-Helfer `Coin.Api.Http.DateiDownload` (auch für die Vorlagen-Downloads), Warnung `ZertifikatProtokoll` (EventId 2501).
- Gezählt werden nur **bekannte** Platzhalter (Katalognamen), bei Upload und Erzeugung gleich.
- Nicht betroffene ZIP-Einträge werden inhaltlich byte-gleich und in derselben Reihenfolge übernommen, aber neu komprimiert; die DOCX-Datei als Ganzes ist also nicht byte-gleich zur Vorlage.
- Steht ein `w:t` ausnahmsweise nicht direkt in einem Run, werden Zeilenumbruch und Tabulator eines Werts dort zu einem Leerzeichen statt zu `w:br`/`w:tab`.
- Ausnahmen fängt sowohl der Erzeuger als auch `ZertifikatService`; beide liefern nur den festen Fehler, die Warnung schreibt der Service genau einmal.
