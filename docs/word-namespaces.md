# Erlaubte Namespaces in hochgeladenen Word-Dateien

Hochgeladene Zertifikatsvorlagen (.docx) dürfen in ihren XML-Teilen nur Elemente und qualifizierte
Attribute aus den unten erlaubten Namespaces verwenden (Positivliste). Grundlage:
[ADR-0026](adr/0026-namespace-positivliste-fuer-word-dateien.md),
[ADR-0024](adr/0024-pruefung-hochgeladener-word-dateien.md),
[Feature zertifikatsvorlagen](features/zertifikatsvorlagen.md) AK-10 (Rev. 7, Rev. 8).

Die Liste ist im Code zentral definiert (`Coin.Domain.Vorlagen.WordNamespaces`). Die Tabelle zwischen
den Markern wird automatisch gegen den Code geprüft (Präfix und Namespace-URI, gleiche Reihenfolge) und
muss bei jeder Änderung mitgezogen werden. Marker-Kommentare und Tabellenformat (Präfix und URI in
Backticks, Spaltenreihenfolge) nicht verändern. Das Präfix ist nur das übliche Präfix zur Orientierung;
geprüft wird allein der Namespace-URI (ordinal, exakt).

## Regeln (Kurzfassung)
- Geprüft werden alle XML-Teile (auch `[Content_Types].xml`, `.rels`, verwaiste Teile und
  `customXml`-Teile vor ihrer Entfernung): der Namespace jedes Elements und jedes Attributs mit
  Namespace. Elemente ohne Namespace sind nicht erlaubt.
- Nicht geprüft: Attribute ohne Präfix (*(Rev. 8)* außer an Elementen der WordprocessingML-Namespaces,
  unten), Namespace-Deklarationen (`xmlns:…`; deklarierte, aber ungenutzte Namespaces sind erlaubt),
  `xml:space` und `xml:lang`.
- Präfixe in `mc:Ignorable`, `mc:MustUnderstand`, `mc:ProcessContent`, `mc:PreserveElements`,
  `mc:PreserveAttributes` und `mc:Choice/@Requires` müssen auf erlaubte Namespaces zeigen.
  *(Rev. 8)* Die Einträge werden an Leerraum nach `char.IsWhiteSpace` getrennt (also auch an NBSP).
  Ein Präfix wird nur im Gültigkeitsbereich des Elements aufgelöst, an dem das Attribut steht: Ist es
  erst an einem Kind deklariert, gilt es als nicht deklariert → „kein .docx“. Eine Neudeklaration am
  Element selbst (z. B. `xmlns:w14="urn:example:fremd"`) zählt mit ihrem URI.
- *(Rev. 8)* Jedes andere Attribut im `mc`-Namespace (z. B. `mc:Requires`) → „Die Datei ist kein
  Word-Dokument im Format .docx.“
- *(Rev. 8)* Ein Attribut ohne Präfix an einem Element der WordprocessingML-Namespaces (Liste unten,
  z. B. `<w:fldSimple instr="…">`) → Erweiterungsmeldung (unten).
- *(Rev. 8)* Freihand-Elemente in erlaubten Namespaces (`w:contentPart`, `w14:contentPart`,
  `a14:contentPart`, `o:ink`; Entscheidung O1), Personenlisten (`w15:people`, `w15:person`,
  `w15:presenceInfo`) außerhalb des Personen-Teils (`…wordprocessingml.people+xml`) und Signaturzeilen
  (`o:signatureline` an jeder Stelle und in jedem XML-Teil; Entscheidung F16, 2026-10-16) →
  Erweiterungsmeldung.
- *(Rev. 8)* Konfliktmarkierungen beim gemeinsamen Bearbeiten in `w14` (`conflictIns`, `conflictDel`,
  `customXmlConflictInsRangeStart`/`…End`, `customXmlConflictDelRangeStart`/`…End`) gelten als
  nachverfolgte Änderungen (Feature AK-14).
- Strict-OOXML (`http://purl.oclc.org/ooxml/…`) ist nie erlaubt → „Die Datei ist kein Word-Dokument
  im Format .docx.“
- SVG-Grafiken (Entscheidung F15, 2026-10-14): ein Teil mit Content-Type `image/svg+xml` oder eine
  Verwendung der Namespaces `svg`, `xlink` oder `asvg` (unten) → „Die Vorlage enthält SVG-Grafiken.
  Bitte Bilder als PNG oder JPEG einfügen und erneut hochladen.“
- Jeder andere nicht erlaubte Namespace → „Die Datei enthält nicht unterstützte Word-Erweiterungen,
  z. B. Diagramme, SmartArt, Freihandzeichnungen oder Add-ins. Bitte diese Inhalte entfernen und erneut
  hochladen.“ (Wortlaut vom Auftraggeber bestätigt, O7, 2026-10-14)
- Eingebettete Schriften bleiben zulässig (bestätigt 2026-10-14; kein eigener Namespace).

## Erlaubte Namespaces

<!-- word-namespaces:start -->
| Präfix | Namespace-URI | Zweck | Begründung |
|---|---|---|---|
| `ct` | `http://schemas.openxmlformats.org/package/2006/content-types` | `[Content_Types].xml` | Paketstruktur, Pflicht |
| `pr` | `http://schemas.openxmlformats.org/package/2006/relationships` | Beziehungen (`.rels`) | Paketstruktur, Pflicht |
| `cp` | `http://schemas.openxmlformats.org/package/2006/metadata/core-properties` | Dokumenteigenschaften (`core.xml`) | wird bereinigt (AK-16) |
| `dc` | `http://purl.org/dc/elements/1.1/` | Dublin Core in `core.xml` | wird bereinigt, `dc:creator` „C.O.I.N.“ |
| `dcterms` | `http://purl.org/dc/terms/` | Datumswerte in `core.xml` | wird bereinigt |
| `dcmitype` | `http://purl.org/dc/dcmitype/` | Dublin-Core-Typen in `core.xml` | von Word und LibreOffice deklariert und genutzt |
| `xsi` | `http://www.w3.org/2001/XMLSchema-instance` | `xsi:type` in Eigenschaften | nur Typangaben |
| `ep` | `http://schemas.openxmlformats.org/officeDocument/2006/extended-properties` | `app.xml` | Statistikwerte bleiben, Rest bereinigt |
| `vt` | `http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes` | Werttypen in `app.xml`/`custom.xml` | nur Datentypen |
| `op` | `http://schemas.openxmlformats.org/officeDocument/2006/custom-properties` | `custom.xml` | wird geprüft und danach entfernt |
| `ds` | `http://schemas.openxmlformats.org/officeDocument/2006/customXml` | Eigenschaften von `customXml`-Teilen | wird geprüft und danach entfernt |
| `b` | `http://schemas.openxmlformats.org/officeDocument/2006/bibliography` | Quellenverzeichnis (`customXml`, schreibt Word fast immer) | wird geprüft und danach entfernt |
| `cppr` | `http://schemas.microsoft.com/office/2006/coverPageProps` | Deckblatt-Eigenschaften (`customXml`) | wird geprüft und danach entfernt |
| `w` | `http://schemas.openxmlformats.org/wordprocessingml/2006/main` | WordprocessingML (Transitional) | Kern des Dokuments, alle Inhaltsregeln; *(Rev. 8)* keine unqualifizierten Attribute, `w:contentPart` (Freihand) abgelehnt |
| `r` | `http://schemas.openxmlformats.org/officeDocument/2006/relationships` | Verweise auf Beziehungen (`r:id`, `r:embed`) | Pflicht; Regeln zu externen Beziehungen |
| `mc` | `http://schemas.openxmlformats.org/markup-compatibility/2006` | Markup Compatibility (`mc:AlternateContent`) | von Word für Textfelder genutzt; `mc:`-Präfixe werden geprüft; *(Rev. 8)* nur die fünf Präfix-Attribute erlaubt |
| `w14` | `http://schemas.microsoft.com/office/word/2010/wordml` | Word-2010-Erweiterungen (Absatz-Ids, Effekte) | von Word geschrieben, keine Verweise; *(Rev. 8)* Konfliktmarkierungen abgelehnt (AK-14), `w14:contentPart` (Freihand) abgelehnt |
| `w15` | `http://schemas.microsoft.com/office/word/2012/wordml` | Word-2013-Erweiterungen (Dokument-Id, Kommentarerweiterungen, Personen) | von Word geschrieben; Kommentare und `people.xml` nach AK-14/AK-16; *(Rev. 8)* Personenlisten nur in `people.xml` |
| `w16` | `http://schemas.microsoft.com/office/word/2018/wordml` | Word-2019-Erweiterungen | von Word 365 geschrieben |
| `w16se` | `http://schemas.microsoft.com/office/word/2015/wordml/symex` | Symbol-Erweiterungen (Emoji) | von Word 365 geschrieben |
| `w16cid` | `http://schemas.microsoft.com/office/word/2016/wordml/cid` | Kommentar-Ids | von Word 365 geschrieben; Kommentare abgelehnt (AK-14) |
| `w16cex` | `http://schemas.microsoft.com/office/word/2018/wordml/cex` | erweiterte Kommentare | von Word 365 geschrieben; Kommentare abgelehnt (AK-14) |
| `w16sdtdh` | `http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash` | Prüfsumme gebundener Inhaltssteuerelemente | von Word 365 geschrieben |
| `w16sdtfl` | `http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock` | Formatsperre von Inhaltssteuerelementen | von Word 365 geschrieben |
| `w16du` | `http://schemas.microsoft.com/office/word/2023/wordml/word16du` | Datum/Uhrzeit nachverfolgter Änderungen | von Word 365 geschrieben; Änderungen abgelehnt (AK-14) |
| `m` | `http://schemas.openxmlformats.org/officeDocument/2006/math` | Formeln (OMML) | Formeln zulässig; Felder darin abgelehnt (AK-13) |
| `wp` | `http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing` | Verankerung von Bildern und Formen | Bilder und Textfelder |
| `wp14` | `http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing` | relative Größe/Position | von Word geschrieben |
| `wp15` | `http://schemas.microsoft.com/office/word/2012/wordprocessingDrawing` | Online-Video (`wp15:webVideoPr`) | nur, damit die genauere Meldung „Verknüpfungen auf externe Inhalte“ erhalten bleibt; jedes Vorkommen von `wp15:webVideoPr` (einziges Element des Namespace) abgelehnt (AK-13) |
| `wps` | `http://schemas.microsoft.com/office/word/2010/wordprocessingShape` | Formen und Textfelder | Textfelder zulässig |
| `wpg` | `http://schemas.microsoft.com/office/word/2010/wordprocessingGroup` | gruppierte Formen | von Word geschrieben |
| `wpc` | `http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas` | Zeichenbereich | von Word geschrieben |
| `a` | `http://schemas.openxmlformats.org/drawingml/2006/main` | DrawingML (Bilder, Formen, Design `theme1.xml`) | Kern für Bilder und Design |
| `pic` | `http://schemas.openxmlformats.org/drawingml/2006/picture` | Bilder | Bilder zulässig (PNG, JPEG u. a. als Binärteile) |
| `a14` | `http://schemas.microsoft.com/office/drawing/2010/main` | Bild- und Formerweiterungen (`useLocalDpi`, Effekte) | von Word geschrieben; *(Rev. 8)* `a14:contentPart` (Freihand) abgelehnt |
| `a16` | `http://schemas.microsoft.com/office/drawing/2014/main` | Ids von Formen (`a16:creationId`) | von Word 365 geschrieben |
| `adec` | `http://schemas.microsoft.com/office/drawing/2017/decorative` | „Als dekorativ markieren“ | Barrierefreiheit |
| `thm15` | `http://schemas.microsoft.com/office/thememl/2012/main` | Designfamilie in `theme1.xml` | von Word 365 in jedem Design geschrieben |
| `v` | `urn:schemas-microsoft-com:vml` | VML (Textfeld-Rückfall, Wasserzeichen) | von Word im `mc:Fallback` geschrieben; VML-Regeln aus AK-13 |
| `o` | `urn:schemas-microsoft-com:office:office` | Office-VML-Erweiterungen | von Word geschrieben; `o:href`, `o:OLEObject` nach AK-13; *(Rev. 8)* `o:ink` (Freihand) und Signaturzeile `o:signatureline` (Entscheidung F16) abgelehnt |
| `w10` | `urn:schemas-microsoft-com:office:word` | VML-Textumbruch | von Word geschrieben |
| `ax` | `http://schemas.microsoft.com/office/2006/activeX` | ActiveX-Teile | nur, damit die genauere Meldung „ActiveX-Steuerelemente“ erhalten bleibt; ActiveX-Teile und -Beziehungen werden immer abgelehnt (AK-13); *(Rev. 8 präzisiert)* ein `ax:`-Element ohne ActiveX-Teil bzw. -Beziehung (z. B. `ax:ocx` im Hauptteil) wird angenommen, ist aber wirkungslos, weil Word ActiveX nur über Teil und Beziehung lädt |
<!-- word-namespaces:ende -->

## WordprocessingML-Namespaces ohne unqualifizierte Attribute (Rev. 8)

An Elementen dieser zehn Namespaces ist jedes Attribut ohne Präfix ein Befund (Erweiterungsmeldung;
Feature AK-10 Punkt 8, Menge `WordNamespaces.WordprocessingMl` im Code, Unit-Test der Menge). Ihre
Schemas kennen nur qualifizierte Attribute; Word, LibreOffice und das OpenXML SDK schreiben dort keine
unqualifizierten (gegengeprüft an der Standardvorlage und an der Word-365- und LibreOffice-Nachbildung
der Kontrolltests).

`w`, `w14`, `w15`, `w16`, `w16se`, `w16cid`, `w16cex`, `w16sdtdh`, `w16sdtfl`, `w16du` (URIs in der
Tabelle oben).

Nicht dazu gehören `w10` (VML-Erweiterung mit unqualifizierten Attributen, z. B. `w10:wrap type`), `m`,
`r`, `mc` (das unqualifizierte `Requires` an `mc:Choice` wird nach den `mc:`-Regeln geprüft), alle
DrawingML-Namespaces (`a`, `pic`, `wp`, `wp14`, `wp15`, `wps`, `wpg`, `wpc`, `a14`, `a16`, `adec`,
`thm15`), VML (`v`, `o`), `ax` sowie die Paket- und Eigenschafts-Namespaces (`ct`, `pr`, `cp`, `dc`,
`dcterms`, `dcmitype`, `xsi`, `ep`, `vt`, `op`, `ds`, `b`, `cppr`). Dort sind unqualifizierte Attribute
üblich (`Relationship/@Target`, `a:off/@x`, `v:shape/@style`).

## Durchsicht auf Änderungs-, Personen- und Freihandangaben (Rev. 8)

Nach QA-Review 6 wurden die erlaubten Microsoft-Namespaces gezielt auf Elemente und Attribute
durchgesehen, die Änderungen, Autoren, Daten, Initialen, Benutzer- oder Anbieterkennungen, E-Mail-
Adressen oder Freihanddaten tragen. Grundlage: die Element- und Attributliste des OpenXML SDK 3.5.1
(`DocumentFormat.OpenXml`, Stand des Projekts) je Namespace und ECMA-376. Namespaces, die das SDK nicht
modelliert, sind mit „nicht im SDK“ gekennzeichnet; dort gilt die Beschreibung aus der Tabelle oben.

| Präfix | Ergebnis | Folge |
|---|---|---|
| `w14` | **Konfliktmarkierungen** beim gemeinsamen Bearbeiten: `conflictIns`, `conflictDel` – als Container mit Läufen auf Absatzebene (`RunConflictInsertion`/`RunConflictDeletion`) und als leere Markierung (`ConflictInsertion`/`ConflictDeletion`) in `w:pPr/w:rPr`, `w:pPr/w:rPr/w:rPrChange/w:rPr` und `w:trPr`; `customXmlConflictInsRangeStart`, `customXmlConflictDelRangeStart` (Attribute `w:id`, `w:author`, `w:date`, `w16du:dateUtc`) und `customXmlConflictInsRangeEnd`, `customXmlConflictDelRangeEnd` (nur `w:id`). **Freihand:** `contentPart` (`r:id` auf einen Freihand-Teil). Einstellung `conflictMode` (`settings.xml`). Sonst Ids (`paraId`, `textId`, `anchorId`, `docId`, `id`) und Text- und Bildeffekte ohne Personenbezug | Konfliktmarkierungen → nachverfolgte Änderungen (AK-14); `w14:contentPart` → Erweiterungsmeldung (O1); `conflictMode` allein kein Befund |
| `w15` | **Personenliste** `people` → `person` (`w15:author`) → `presenceInfo` (`w15:providerId`, `w15:userId`). Kommentarerweiterung `commentEx` (`paraId`, `paraIdParent`, `done`, keine Namen). `dataBinding` (Bindung wiederholter Abschnitte an `customXml`, keine Personendaten). Sonst Einstellungen und Ids (`docId`, `appearance`, `color`, `repeatingSection`, `webExtensionLinked`/`Created`, `chartTrackingRefBased` …) | `people.xml` wird entfernt (AK-16); `w15:people`/`person`/`presenceInfo` in jedem anderen Teil → Erweiterungsmeldung; `commentEx` ohne Personendaten, keine Regel |
| `w16` | nicht im SDK; Word 365 nennt den Namespace in `mc:Ignorable`, Inhalte ohne Personenbezug bekannt | keine Regel |
| `w16se` | `symEx` (`w16se:font`, `w16se:char`) | keine Regel |
| `w16cid` | `commentsIds`/`commentId` (`w16cid:paraId`, `w16cid:durableId`) | Ids ohne Personenbezug; keine Regel (Kommentare selbst nach AK-14) |
| `w16cex` | `commentsExtensible`/`commentExtensible` (`w16cex:durableId`, `w16cex:dateUtc`, `w16cex:intelligentPlaceholder`) | Zeitstempel ohne Namen; keine Regel (Kommentare selbst nach AK-14) |
| `w16sdtdh` | nicht im SDK; Prüfsumme `storeItemChecksum` an `w:dataBinding` | keine Regel |
| `w16sdtfl` | nicht im SDK; Formatsperre von Inhaltssteuerelementen | keine Regel |
| `w16du` | nur das Attribut `dateUtc` (Zeitstempel) an Änderungselementen, Konfliktmarkierungen und Kommentaren | keine eigene Regel; die tragenden Elemente werden abgelehnt (AK-14) |
| `wp14` | relative Größe und Position, `anchorId`, `editId` | keine Regel |
| `wp15` | nur `webVideoPr` | abgelehnt (AK-13) |
| `wps`, `wpg`, `wpc` | Formen, Gruppen, Zeichenbereich (`wps:linkedTxbx` verknüpft Textfelder intern) | keine Regel |
| `a14` | **Freihand:** `contentPart` (`r:id`). Sonst Bildeffekte (`imgProps`, `artistic…`), `useLocalDpi`, `hidden…`, `cpLocks`, Ids | `a14:contentPart` → Erweiterungsmeldung (O1) |
| `a16` | Ids (`creationId`, `predDERef`, `cxnDERefs`, `rowId`, `colId`) | keine Regel |
| `adec` | `decorative` | keine Regel |
| `thm15` | Designfamilie und -varianten (`name`, `id`, `vid`; Name des Designs, keine Person) | keine Regel |
| `o` | **Signaturzeile** `signatureline` mit `o:suggestedsigner`, `o:suggestedsigner2`, `o:suggestedsigneremail` (Name und E-Mail-Adresse des vorgeschlagenen Unterzeichners) sowie unqualifiziert `signinginstructions`, `sigprovurl` (Adresse des Signaturanbieters), `addlxml`. **Freihand:** `ink` (Daten im Attribut `i`). `OLEObject`, `href`, `althref` (AK-13). Sonst Formeigenschaften (`shapedefaults`, `lock`, `callout` …) | `o:ink` → Erweiterungsmeldung (O1); `o:signatureline` an jeder Stelle und in jedem XML-Teil → Erweiterungsmeldung (Entscheidung F16 des Auftraggebers, 2026-10-16) |
| `w10` | Textumbruch und Rahmen (`wrap`, `border…`, `anchorlock`) | keine Regel |
| `v` | Formen; Adressattribute nach AK-13 | keine neue Regel |
| `ax` | `ocx` (`ax:name` u. a.), `ocxPr`, `font`, `picture` – nur in ActiveX-Teilen wirksam | ActiveX-Teile/-Beziehungen nach AK-13 abgelehnt; `ax:`-Elemente ohne solche wirkungslos |
| `cppr`, `b`, `ds`, `op` | Deckblatt-Angaben (Firma, E-Mail, Telefon), Quellen mit Autorennamen, Eigenschaften | Word schreibt sie nur in `customXml`-Teile bzw. `custom.xml`, die entfernt werden (AK-16). Die Namespaces sind aber **nicht** auf diese Teile begrenzt: In einem anderen Teil (z. B. `cppr:CompanyEmail` in `settings.xml`, `b:Person` als ignorierbares Element in `document.xml`) werden sie angenommen und bleiben im Download. Bekanntes Restrisiko (Abschnitt unten) |
| `w` (zum Vergleich) | **Freihand:** `contentPart` (`r:id`) | `w:contentPart` → Erweiterungsmeldung (O1) |

## Bekannte Restrisiken (QA-Review 7)

Die Positivliste gilt für alle XML-Teile gleich (eine Liste, nicht je Teiltyp; ADR-0026, A24). Daraus folgen
zwei bekannte Lücken für konstruierte Verstecke, die Word so nicht schreibt (vergleichbar mit A33):

- **Eigenschafts-Namespaces außerhalb ihrer Teile:** `cp`, `dc`, `dcterms`, `ep`, `op`, `ds`, `b` und
  `cppr` werden nicht auf `docProps`-, `custom.xml`- und `customXml`-Teile begrenzt. Die Bereinigung
  entfernt bzw. leert nur diese Teile. Steht ein solches Element in einem anderen Teil (z. B.
  `cppr:CompanyEmail` in `settings.xml` oder `b:Person` als ignorierbares Element in `document.xml`), wird
  die Datei angenommen und der Wert bleibt im Download.
- **Kommentar außerhalb eines Kommentar-Teils:** Ein `w:comment` direkt im Hauptteil (ohne Kommentar-Teil
  und ohne `w:commentReference`/`w:commentRangeStart`/`w:commentRangeEnd`) wird angenommen und bleibt im
  Download. Die Kommentarregel (Feature AK-14) prüft `w:comment` nur in Kommentar-Teilen.

Beides ist im Feature (Abschnitt 11) und in ADR-0026 („Folgen“) festgehalten.

## Nicht erlaubte Namespaces (Erläuterung)

Maßgeblich ist allein die Positivliste oben; alles, was dort nicht steht, wird abgelehnt. Die folgende
Tabelle erklärt die Fälle, die in Word- oder LibreOffice-Dateien vorkommen können. Sie wird nicht gegen
den Code geprüft. Die Einträge zu O1–O6 und F15 hat der Auftraggeber am 2026-10-14 entschieden.

| Präfix | Namespace-URI | Zweck | Begründung |
|---|---|---|---|
| – | alle URIs, die mit `http://purl.oclc.org/ooxml/` beginnen | Strict-OOXML (z. B. `…/wordprocessingml/main`, `…/officeDocument/relationships`) | Word liest Strict-Elemente in Transitional-Teilen wie `w:`-Elemente (QA-Review 5); Meldung „kein .docx“ |
| – | kein Namespace | Elemente ohne Namespace | Word schreibt sie nicht; nur in frei erzeugten Daten |
| `svg` | `http://www.w3.org/2000/svg` | SVG-Grafik (Teil `image/svg+xml`) | abgelehnt (Entscheidung F15): SVG kann Skripte, externe Verweise und eigene Parser-Angriffsfläche tragen, die die Inhaltsregeln nicht prüfen; eigene SVG-Meldung |
| `xlink` | `http://www.w3.org/1999/xlink` | Verweise in SVG (`xlink:href`) | abgelehnt (F15), eigene SVG-Meldung |
| `asvg` | `http://schemas.microsoft.com/office/drawing/2016/SVG/main` | Verweis auf den SVG-Teil (`asvg:svgBlip`) | abgelehnt (F15), damit die Ablehnung schon am Hauptteil greift; eigene SVG-Meldung |
| `wne` | `http://schemas.microsoft.com/office/word/2006/wordml` | Makro-Hilfsdaten, Tastenbelegungen, Symbolleisten | Makro-nah, in Urkunden nicht nötig; echte `.docm` melden weiter „Makros“ (Reihenfolge ADR-0026 Punkt 4) |
| `wpi`, `aink`, `inkml` | `http://schemas.microsoft.com/office/word/2010/wordprocessingInk`, `http://schemas.microsoft.com/office/drawing/2016/ink`, `http://www.w3.org/2003/InkML` | Freihandzeichnungen | abgelehnt (Entscheidung O1): eigene Datenteile; Unterschrift entsteht beim Ausstellen |
| `dgm`, `dsp` | `http://schemas.openxmlformats.org/drawingml/2006/diagram`, `http://schemas.microsoft.com/office/drawing/2008/diagram` | SmartArt | abgelehnt (Entscheidung O2): Text darin wird von der Platzhalterprüfung nicht erfasst |
| `c`, `c14`, `c15`, `c16…`, `cs`, `cx`, `cx1`–`cx8` | u. a. `http://schemas.openxmlformats.org/drawingml/2006/chart`, `http://schemas.microsoft.com/office/drawing/2014/chartex` | Diagramme (mit eingebetteter Arbeitsmappe oder externen Daten) | abgelehnt (Entscheidung O3) |
| `am3d` | `http://schemas.microsoft.com/office/drawing/2017/model3d` | 3D-Modelle | abgelehnt (Entscheidung O4): eingebettete Binärmodelle |
| SharePoint | u. a. `http://schemas.microsoft.com/office/2006/metadata/properties`, `http://schemas.microsoft.com/office/2006/metadata/contentType`, `http://schemas.microsoft.com/office/infopath/2007/PartnerControls`, frei vergebene URIs der Inhaltstypen | Metadaten aus Dokumentbibliotheken (`customXml`) | abgelehnt (Entscheidung O5), keine Ausnahme für `customXml`-Teile; Vorlage lokal speichern und von dort hochladen |
| `clbl` | `http://schemas.microsoft.com/office/2020/mipLabelMetadata` | Vertraulichkeitsbezeichnungen (`docMetadata/LabelInfo.xml`) | abgelehnt (Entscheidung O6) |
| `we`, `wetp` | `http://schemas.microsoft.com/office/webextensions/webextension/2010/11`, `http://schemas.microsoft.com/office/webextensions/taskpanes/2010/11` | Office-Add-ins (Web-Erweiterungen, Aufgabenbereiche) | laden Inhalte aus dem Netz |
| – | `http://schemas.microsoft.com/office/2006/01/customui`, `http://schemas.microsoft.com/office/2009/07/customui` | angepasstes Menüband | makro-nah, in .docx nicht nötig |
| `sl` | `http://schemas.openxmlformats.org/schemaLibrary/2006/main` | Schemabibliothek in `settings.xml` | enthält Speicherorte (Pfade) von Schemas |
| `a1611` | `http://schemas.microsoft.com/office/drawing/2016/11/main` | Herkunftsadresse von Online-Bildern | verweist auf externe Adressen; bei Bedarf nachtragen |
| `ahyp` | `http://schemas.microsoft.com/office/drawing/2018/hyperlinkcolor` | Hyperlinkfarbe an Formen | in Word-Dokumenten bisher nicht beobachtet; bei Meldung nachtragen |
| `oel` | `http://schemas.microsoft.com/office/2019/extlst` | Erweiterungslisten | von Word 365 deklariert, Verwendung in Word-Dokumenten bisher nicht beobachtet; bei Meldung nachtragen |
| `x`, `pvml` | `urn:schemas-microsoft-com:office:excel`, `urn:schemas-microsoft-com:office:powerpoint` | VML-Erweiterungen von Excel und PowerPoint | in Word-Dokumenten nicht nötig |
| `lc` | `http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas` | gesperrter Zeichenbereich | in Word-Dokumenten nicht nötig |

## Nachtragen eines Namespace
Wird eine echte Word- oder LibreOffice-Datei mit der Erweiterungsmeldung abgelehnt, läuft der
Nachtragsprozess aus ADR-0026 Punkt 7: Meldung mit Datei (ohne Personendaten) → lokale Analyse des
Namespace → Bewertung (externe Verweise, aktive Inhalte, Felder, Inhalte, die Word wie `w:` liest,
*(Rev. 8)* Änderungs-, Personen- und Freihandangaben wie in der Durchsicht oben, unqualifizierte
Attribute) → Eintrag im Code und in dieser Tabelle mit Begründung → Kontrolltest. Strict-Namespaces werden nie
aufgenommen; die Entscheidungen O1–O6, F15 (SVG) und F16 (Signaturzeilen) werden nur durch eine neue
Entscheidung des Auftraggebers geändert. Der Server loggt den abgelehnten Namespace nicht.
