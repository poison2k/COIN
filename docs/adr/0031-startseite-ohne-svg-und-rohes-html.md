# ADR-0031: Startseite ohne SVG und ohne rohes HTML – Logos als geprüfte Rasterbilder, Infotext als eingeschränktes Markdown

Status: Angenommen (Entscheidungen des Auftraggebers vom 2026-10-26, S4 und S5 in [startseite](../features/startseite.md) Abschnitt 12, wie empfohlen) · Datum: 2026-10-19 · Feature: [startseite](../features/startseite.md) · Ergänzt: [ADR-0005](0005-motivbild-in-postgresql.md), [ADR-0006](0006-bild-upload-als-eigener-endpunkt.md), [ADR-0024](0024-pruefung-hochgeladener-word-dateien.md), [ADR-0026](0026-namespace-positivliste-fuer-word-dateien.md) (F15)

## Kontext
Administratoren laden Logos hoch und schreiben einen Infotext. Den Infotext sehen alle Benutzer mit Rolle, die Logos seit ADR-0032 auch anonyme Besucher. Ein Administrator-Konto kann übernommen werden oder Inhalte aus fremden Quellen einfügen. Logo und Infotext sind daher nicht vertrauenswürdig und erreichen jeden Betrachter (gespeichertes XSS).

Vorgaben:
- Logos nur PNG, JPEG, WebP, höchstens 2 MB, begrenzte Pixelgröße, Prüfung am Inhalt, SVG ausdrücklich verboten.
- Infotext mit Absätzen und etwas Formatierung (fett, kursiv, Listen, Links) per Markdown; rohes HTML wird nie ausgeführt; Links mit `rel="noopener noreferrer"`; Länge begrenzt.

Bestand:
- Die Motivbild-Prüfung nutzt nur Magic Bytes, ohne Maße (`BildFormatErkennung`).
- Auslieferung mit `nosniff` und `Content-Security-Policy: default-src 'none'; sandbox`.
- Im Frontend gibt es kein `dangerouslySetInnerHTML` und keine Markdown-Bibliothek.

## Entscheidung
### Logos
1. **Kein SVG.** SVG ist ein aktives XML-Format (Skripte, Event-Attribute, `xlink:href`, eingebettetes CSS, externe Ressourcen). Bereinigen hieße, einen eigenen Sanitizer zu bauen, mit dem Risiko aus ADR-0024/0026; der Nutzen (skalierbare Logos) rechtfertigt das nicht. Gleiche Linie wie F15 (Zertifikatsvorlagen) und das Motivbild. SVG wird mit eigener Meldung abgelehnt, damit Benutzer die Ursache erkennen.
2. **Prüfung nur am Inhalt, ohne Dekodieren**:
   - Format über Magic Bytes (`BildFormatErkennung`).
   - Danach Lesen der Bildmaße aus dem Kopf: PNG `IHDR` als erster Chunk; JPEG erstes `SOFn`-Segment vor `SOS`; WebP `VP8 `/`VP8L`/`VP8X`. Kopf unvollständig oder widersprüchlich → „beschädigt“.
   - Höchstens 2048 × 2048 Pixel (begrenzt den Speicherbedarf beim Dekodieren im Browser), höchstens 2 MiB.
   - Animierte Bilder (APNG mit `acTL` vor dem ersten `IDAT`, WebP mit Animations-Flag) werden abgelehnt (WCAG 2.2.2, Entscheidung S5).
   - Dateiname und deklarierter Content-Type werden ignoriert.
3. **Kein Umkodieren** und keine Bildbibliothek auf dem Server: Ein Decoder wäre zusätzliche Angriffsfläche und Abhängigkeit (Lizenz, native Bibliotheken). Gespeichert und ausgeliefert werden die geprüften Originalbytes. Metadaten (EXIF, XMP) bleiben wie beim Motivbild erhalten; die Oberfläche weist beim Hochladen darauf hin (Entscheidung S5).
4. **Auslieferung** wie das Motivbild: `Content-Type` aus dem erkannten Format, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Disposition: inline` mit generiertem ASCII-Namen, ETag, versionierte URL (`?v=<SHA-256-Präfix>`); Caching nach ADR-0032 Punkt 3. Damit wird eine Polyglot-Datei (gültiges PNG mit angehängtem HTML) nie als Dokument interpretiert, auch nicht beim direkten Aufruf der öffentlichen URL.

### Infotext
5. **Gespeichert wird Rohtext** (Markdown-Quelle, höchstens 5.000 Zeichen, Zeilenenden auf `\n` normalisiert, keine Steuerzeichen außer `\n` und `\t`). Der Server wandelt nicht in HTML um und filtert kein HTML; er liefert den Text als JSON-String.
6. **Dargestellt wird im Frontend mit `react-markdown`** (CommonMark, erzeugt React-Elemente, nie `innerHTML`) plus `remark-breaks` (einfacher Zeilenumbruch = Zeilenumbruch), an genau einer Stelle (`shared/ui/markdown.tsx`), fest konfiguriert:
   - **Rohes HTML wird entfernt** (`skipHtml`, kein `rehype-raw`): `<script>`, `<img onerror>`, `<iframe>`, `<svg onload>` u. a. erscheinen weder als Element noch als Text.
   - **Positivliste der Elemente**: `p`, `br`, `strong`, `em`, `ul`, `ol`, `li`, `a`. Alle anderen Markdown-Elemente werden durch ihren Textinhalt ersetzt (`unwrapDisallowed`); Bilder (`![]()`) entfallen, ohne abgerufen zu werden.
   - **Positivliste der Link-Ziele**: `http:`, `https:`, `mailto:` (ohne Groß-/Kleinschreibung, ohne Leer- und Steuerzeichen im Ziel) und relative Pfade mit genau einem führenden `/` (nicht `//`, nicht `/\`). Jedes andere Ziel (`javascript:`, `data:`, `vbscript:`, `file:`, kodierte oder verschleierte Varianten) wird als reiner Text ohne `<a>` dargestellt.
   - Jeder Link trägt `rel="noopener noreferrer"`. Externe Links (`http`/`https`) öffnen mit `target="_blank"` und dem `sr-only`-Zusatz „(öffnet in neuem Tab)“.
7. **Kein `dangerouslySetInnerHTML`** im gesamten Frontend; ein Code-Test in `web/src/app` stellt das sicher (Muster `abhaengigkeiten.test.ts`).
8. Titel, Untertitel und Alternativtexte sind reiner Text (React escaped sie).

## Betrachtete Optionen
| Thema | Option | Bewertung |
|---|---|---|
| Logoformat | SVG zulassen und bereinigen (z. B. DOMPurify mit SVG-Profil) | eigener Sanitizer für ein aktives Format, Umgehungen bekannt, vom Auftraggeber ausgeschlossen, verworfen |
| | SVG nur als `<img>` einbinden (Skripte laufen dort nicht) | der direkte Aufruf der öffentlichen URL öffnete das SVG als Dokument; der Schutz hinge allein an der CSP-Sandbox, verworfen |
| | **nur PNG/JPEG/WebP, Prüfung am Kopf (gewählt)** | bewährter Weg wie beim Motivbild, ergänzt um Maße |
| Prüftiefe | vollständig dekodieren (ImageSharp, SkiaSharp) und neu kodieren | entfernt Metadaten und Polyglot-Anhänge, aber neue Abhängigkeit, Decoder-Angriffsfläche, Speicherbedarf, verworfen |
| | **Kopf lesen ohne Dekodieren (gewählt)** | linear, klein, testbar; der übrige Inhalt bleibt ungeprüft und ist durch `nosniff`, CSP und `<img>` unschädlich |
| Metadaten | Metadaten-Segmente ohne Dekodieren entfernen | zusätzlicher Code je Format, vom Auftraggeber nicht gewählt (S5) |
| | **erhalten, Hinweis in der Oberfläche (gewählt)** | gleich wie beim Motivbild |
| Infotext | HTML-Editor mit Sanitizer (DOMPurify, `innerHTML`) | die Sicherheit hinge an der Sanitizer-Konfiguration und an `innerHTML`, verworfen |
| | Markdown → HTML auf dem Server | zweite Darstellungsstelle, HTML-Ausgabe im Frontend nötig, verworfen |
| | eigener kleiner Parser im Frontend | volle Kontrolle, keine Abhängigkeit, aber eigener Parser mit Randfällen (Verschachtelung, Escapes, Laufzeit), verworfen (S4) |
| | **`react-markdown` mit Positivlisten (gewählt)** | ausgereift, kein `innerHTML`, HTML-Behandlung und URL-Filter eingebaut; Abhängigkeit von etwa 45 KB (gzip) |
| HTML im Text | maskiert als Text anzeigen | Leser sähen Tags als Zeichensalat, verworfen |
| | **entfernen (gewählt)** | sauberes Ergebnis; die Vorschau zeigt der Administratorin die Wirkung, die Oberfläche weist darauf hin |

## Folgen
- Neue Abhängigkeiten im Frontend: `react-markdown`, `remark-breaks` (ADR-0011: Prüfwerkzeuge unverändert). Updates laufen wie bei anderen Abhängigkeiten; Tests mit XSS-Nutzlasten sichern die Konfiguration ab.
- Wer Überschriften, Tabellen oder Bilder im Infotext erwartet, sieht nur deren Text; die Hilfe am Eingabefeld nennt die erlaubte Formatierung.
- Logos mit Metadaten werden unverändert und öffentlich ausgeliefert; die Oberfläche und die Anwenderdoku weisen darauf hin.
- Die Kopfanalyse ist eigener Code in `Coin.Domain` mit Unit-Tests je Format und Fehlerfall; das Motivbild bleibt unverändert (keine Maßprüfung).
