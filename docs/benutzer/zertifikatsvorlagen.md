# Zertifikatsvorlagen – Anleitung

Zu jedem Coin gibt es eine Word-Vorlage (.docx) für das Echtheitszertifikat. Sie laden die
**Standardvorlage** herunter, gestalten sie in Word zu einer Urkunde und laden sie wieder hoch. Aus der
Vorlage, die gerade gilt, entsteht beim Herunterladen das Zertifikat einer Ausgabe (siehe
[Zertifikat herunterladen](ausgaben.md#zertifikat-herunterladen)).

Zertifikatsvorlagen verwalten nur angemeldete Benutzer mit der Rolle Administrator oder Sachbearbeiter.
Alle anderen sehen keine Schaltflächen dafür.

## Wo finde ich die Vorlage?

- **Coin hinzufügen**: Unter dem Formular steht der Abschnitt **Zertifikatsvorlage** mit dem Button
  **Standardvorlage herunterladen**.
- **Coin bearbeiten** (Detailseite des Coins › **Bearbeiten**): Abschnitt **Zertifikatsvorlage** mit
  allen Funktionen dieser Anleitung.

Dort steht oben, welche Vorlage gilt:

- „Aktiv: Standardvorlage“ – für diesen Coin wurde noch keine eigene Vorlage hochgeladen oder er wurde
  zurückgesetzt.
- „Aktiv: eigene Vorlage, Version 2“ – die hochgeladene Version 2 gilt.

## Vorlage herunterladen

- **Standardvorlage herunterladen**: die leere Vorlage, für alle Coins gleich (`zertifikatsvorlage-standard.docx`).
- **Aktuelle Vorlage herunterladen**: die Vorlage, die für diesen Coin gerade gilt (eigene Version oder
  Standardvorlage).
- In der Tabelle der Versionen: **Herunterladen** für eine bestimmte Version.

Während des Downloads ist der jeweilige Button gesperrt. Klappt es nicht, erscheint „Die Vorlage konnte
nicht heruntergeladen werden. Bitte später erneut versuchen.“

Die Standardvorlage enthält eine Urkunde mit der Überschrift „Echtheitszertifikat“, alle Platzhalter in
Beispielsätzen (die Dienststelle in einer eigenen Zeile unter Dienstgrad und Name) und am Ende auf einer
neuen Seite den Abschnitt „Erläuterung der Platzhalter“. Diesen Abschnitt können Sie in Ihrer eigenen
Vorlage löschen. Hat ein Coin keine eigene Vorlage, entsteht das Zertifikat aus der Standardvorlage
**ohne** diesen Abschnitt.

## Vorlage in Word gestalten

Die Vorlage enthält **Platzhalter** wie `{{Coin.Name}}`. Sie werden beim Herunterladen eines
Zertifikats durch die echten Werte ersetzt (siehe [unten](#beim-erzeugen-eines-zertifikats)). Die Liste
aller Platzhalter steht in [Platzhalter](../platzhalter.md).

Platzhalter:

- Pflicht sind `{{Coin.Name}}`, `{{Exemplar.Nummer}}`, `{{Zertifikat.Nummer}}` und `{{Empfaenger.Name}}`.
  Die übrigen dürfen fehlen. Jeder Platzhalter darf mehrfach vorkommen, zusammen aber höchstens
  **200-mal** in der ganzen Vorlage (Text, Kopf- und Fußzeilen usw.).
- Schreibweise genau beibehalten: Groß- und Kleinschreibung zählt, keine Leerzeichen in den Klammern.
  `{{ Coin.Name }}` oder `{{coin.name}}` gelten als unbekannt.
- Einen Platzhalter nicht auf mehrere Absätze verteilen. Formatieren (fett, Schriftart, Farbe) ist
  erlaubt, auch mitten im Platzhalter.
- Platzhalter dürfen im Text, in Tabellen, Textfeldern, Kopf- und Fußzeilen sowie Fuß- und Endnoten stehen.

Vor dem Hochladen in Word:

- **Speichern** als „Word-Dokument (*.docx)“ – nicht als „Strict Open XML-Dokument“, nicht als .docm,
  nicht mit Kennwort.
- **Kommentare löschen** und **alle nachverfolgten Änderungen annehmen oder ablehnen**. Nach
  gemeinsamem Bearbeiten (mehrere Personen gleichzeitig) auch alle Konflikte auflösen; sie zählen als
  nachverfolgte Änderungen.
- **Bilder nur als PNG oder JPEG.** SVG-Grafiken werden abgelehnt, auch Word-Piktogramme (Einfügen ›
  Piktogramme erzeugt SVG). Eine vorhandene SVG-Grafik speichern Sie in Word per Rechtsklick › „Als
  Bild speichern“ im PNG-Format und fügen das PNG statt der Grafik ein.
- **Keine Signaturzeile** einfügen (Einfügen › Signaturzeile). Für die Unterschrift genügt eine einfache
  Linie, z. B. Unterstriche wie in der Standardvorlage.
- **Nicht verwenden**: Makros, Diagramme, SmartArt, Freihandzeichnungen (auch nicht über die
  Zeichnen-Werkzeuge), 3D-Modelle, Add-ins, Online-Videos, eingebettete Office-Dateien oder
  Filialdokumente, ActiveX-Steuerelemente.
- **Keine Verknüpfungen nach außen**: keine verknüpfte Dokumentvorlage (z. B. auf einem Netzlaufwerk),
  keine Felder, die andere Dateien einbinden. Hyperlinks nur auf Adressen mit `http`, `https` oder
  `mailto`, nicht auf Dateien oder Freigaben; die QuickInfo eines Hyperlinks ohne Anführungszeichen.
- **Felder**: keine verschachtelten Felder (z. B. `{ = { PAGE } - 1 }`), keine Felder in Formeln. Felder
  in Textfeldern sind erlaubt.
- **Serienbrief** ausschalten: in Word „Sendungen › Seriendruck starten › Normales Word-Dokument“.
- Tabellen, Textfelder und Formen nicht übermäßig ineinander verschachteln.
- **Vorlage aus SharePoint**: Eine Vorlage aus einer SharePoint-Bibliothek trägt dort Metadaten, die
  abgelehnt werden. Speichern Sie sie vorher lokal (z. B. „Datei › Kopie speichern“ auf dem eigenen
  Rechner) und laden Sie diese Kopie hoch.
- **Vertraulichkeitsbezeichnung** vor dem Hochladen entfernen bzw. eine Vorlage ohne Bezeichnung
  verwenden.
- Eingebettete Schriften sind erlaubt.

## Beim Erzeugen eines Zertifikats

So setzt C.O.I.N. die Werte ein, wenn jemand ein Zertifikat herunterlädt:

- **Formatierung**: Der Wert übernimmt die Formatierung des ersten Zeichens des Platzhalters (der
  ersten `{`). Ist dort z. B. `{{Empfaenger.Name}}` fett und rot, steht der Name fett und rot im
  Zertifikat. Formatieren Sie deshalb den ganzen Platzhalter einheitlich. Text davor und danach behält
  seine eigene Formatierung.
- **Zeilenumbrüche** in Begründung, Gelegenheit, Beschreibung oder ausgebender Stelle werden zu
  Zeilenumbrüchen im selben Absatz (wie Umschalt+Eingabe in Word). Lange Texte werden nicht gekürzt;
  planen Sie in der Vorlage genug Platz ein, besonders für die Begründung (bis 2000 Zeichen).
- **Leere Felder**: Fehlt ein optionaler Wert (z. B. kein Dienstgrad, keine Dienststelle, keine
  Beschreibung), bleibt die Stelle leer. Text um den Platzhalter herum (z. B. ein Komma) bleibt stehen;
  setzen Sie optionale Platzhalter daher am besten in eine eigene Zeile, wie die Dienststelle in der
  Standardvorlage.
- **Formate**: Datum als `TT.MM.JJJJ` (z. B. 01.10.2026), Exemplar-Nummer und Auflage ohne
  Tausenderpunkt (`12`, `1500`), Zertifikatsnummer wie `C0042-0012`.
- **Aktueller Stand**: Name, Herausgeber, Beschreibung und Auflage des Coins stammen immer aus dem
  aktuellen Stand. Ändern Sie den Coin auf **Coin bearbeiten**, zeigen danach heruntergeladene
  Zertifikate die neuen Werte, auch für ältere Ausgaben.
- **Aktuelle Vorlage**: Jeder Download verwendet die Vorlage, die gerade aktiv ist. Nach einem neuen
  Upload oder dem Zurücksetzen sehen auch Zertifikate früherer Ausgaben anders aus; Nummer und Angaben
  der Ausgabe bleiben gleich. Ihre gespeicherte Vorlage selbst wird dabei nie verändert.
- **Felder** (z. B. Datum oder Seitenzahl): Platzhalter im angezeigten Ergebnis eines Felds werden
  ersetzt. Aktualisiert Word das Feld später (z. B. mit F9 oder beim Drucken), gilt wieder das Ergebnis
  des Felds.
- Werte erscheinen immer als reiner Text. Sieht ein Wert selbst wie ein Platzhalter aus (z. B. eine
  Begründung mit `{{Coin.Name}}`), steht er genau so im Zertifikat.

## Vorlage hochladen

1. Auf **Coin bearbeiten** im Feld **Word-Vorlage (.docx)** die Datei auswählen (höchstens 5 MB).
2. **Vorlage hochladen** klicken. Während des Hochladens ist der Button gesperrt.

Die App prüft vorher nur Endung und Größe; alles andere prüft der Server. Bei Erfolg erscheint z. B.
„Version 3 wurde hochgeladen und ist jetzt aktiv.“, die Tabelle zeigt die neue Version, das Dateifeld ist
wieder leer.

Wird die Datei abgelehnt, erscheint „Die Vorlage wurde nicht übernommen:“ mit einer Liste der Gründe. Die
bisherige Vorlage bleibt aktiv, es wird nichts gespeichert.

### Was beim Hochladen entfernt wird

Damit keine persönlichen Angaben in der Vorlage bleiben, entfernt der Server beim Hochladen:

- Autor, „Zuletzt geändert von“, Titel, Betreff, Stichwörter, Firma, Manager, Vorlagenpfad und weitere
  Dokumenteigenschaften. Als Autor steht danach „C.O.I.N.“.
- benutzerdefinierte Eigenschaften, Dokumentvariablen, Personenlisten und Datenbindungen,
- Bearbeitungsbereiche für einzelne Personen (der Text darin bleibt),
- nicht verwendete Bestandteile der Datei.

Text, Formatierung, Bilder, Schriften und Platzhalter bleiben unverändert. Die gespeicherte Datei ist
deshalb nicht mehr byte-gleich mit Ihrer, sieht in Word aber gleich aus. **Bild-Metadaten (z. B. EXIF
mit Aufnahmeort) werden nicht entfernt**; verwenden Sie Bilder ohne solche Angaben.

## Versionen

Die Tabelle (Spalten **Version**, **Hochgeladen am**, **Hochgeladen von**, **Größe**, **Status**) zeigt
alle hochgeladenen Versionen, die neueste zuerst. Die aktive Version trägt „aktiv“. Ohne eigene Vorlage
steht dort „Es wurde noch keine eigene Vorlage hochgeladen.“

Jeder Upload ergibt eine neue Versionsnummer und ist sofort aktiv. Frühere Versionen bleiben gespeichert
und lassen sich herunterladen, aber nicht wieder aktivieren und nicht löschen. Um eine frühere Version zu
nutzen, laden Sie sie herunter und wieder hoch (sie erhält dann eine neue Nummer).

## Auf die Standardvorlage zurücksetzen

Nur wenn eine eigene Vorlage aktiv ist: **Auf Standardvorlage zurücksetzen** öffnet die Frage „Auf
Standardvorlage zurücksetzen?“ mit dem Hinweis „Die eigene Vorlage bleibt als Version gespeichert.
Künftig wird die Standardvorlage verwendet.“ **Zurücksetzen** bestätigt, **Abbrechen** oder die
Escape-Taste schließt ohne Änderung. Danach erscheint „Die Standardvorlage ist jetzt aktiv.“ Alle
Versionen bleiben erhalten; der nächste Upload erhält die nächste freie Nummer.

Jedes Hochladen und Zurücksetzen wird mit Zeitpunkt und Benutzer protokolliert.

## Fehlermeldungen

| Meldung | Was tun? |
|---|---|
| „Bitte eine Word-Vorlage (.docx) auswählen.“ | Erst eine Datei auswählen. |
| „Die Datei ist kein Word-Dokument im Format .docx.“ | Datei in Word als „Word-Dokument (*.docx)“ speichern (nicht Strict, keine umbenannte Datei). |
| „Die Datei ist leer.“ | Die Datei hat keinen Inhalt; erneut speichern. |
| „Die Vorlage darf höchstens 5 MB groß sein.“ | Bilder verkleinern oder komprimieren. |
| „Die Datei ist ein älteres Word-Dokument (.doc) oder mit einem Kennwort geschützt. …“ | Als .docx ohne Kennwort speichern. |
| „Die Datei enthält Makros. …“ | Als Word-Dokument ohne Makros (.docx) speichern. |
| „Die Vorlage enthält SVG-Grafiken. …“ | SVG-Grafiken und Piktogramme durch PNG- oder JPEG-Bilder ersetzen. |
| „Die Datei enthält nicht unterstützte Word-Erweiterungen, z. B. Diagramme, SmartArt, Freihandzeichnungen oder Add-ins. …“ | Diese Inhalte sowie Signaturzeilen entfernen; Vorlage aus SharePoint lokal speichern; Vertraulichkeitsbezeichnung entfernen. Hilft das nicht, die Datei (ohne Personendaten) über den üblichen Supportweg melden – möglicherweise nutzt Ihre Word-Version eine neue Erweiterung, die erst geprüft und freigeschaltet werden muss. |
| „Die Datei enthält unzulässige Inhalte: …“ | Die genannten Inhalte entfernen (z. B. verknüpfte Dateien, eingebettete Objekte, Serienbrief, verschachtelte Felder, Hyperlinks auf Dateien). |
| „Die Vorlage enthält nachverfolgte Änderungen. …“ | Alle Änderungen und Konflikte annehmen oder ablehnen. |
| „Die Vorlage enthält Kommentare. …“ | Alle Kommentare löschen. |
| „Die Datei ist zu tief verschachtelt. …“ | Verschachtelte Tabellen, Textfelder oder Formen vereinfachen. |
| „Die Datei ist entpackt zu groß oder enthält zu viele Bestandteile.“ | Datei verkleinern, z. B. Bilder komprimieren oder überflüssige Inhalte entfernen. |
| „Es fehlen Pflichtplatzhalter: …“ | Die genannten Platzhalter wieder einfügen. |
| „Unbekannte Platzhalter: … Erlaubt sind nur die Platzhalter aus der Standardvorlage.“ | Schreibweise prüfen (Tippfehler, Leerzeichen, Groß-/Kleinschreibung). |
| „Unvollständige Platzhalter: …“ | Fehlende `{{` oder `}}` ergänzen; der Platzhalter muss in einem Absatz stehen. |
| „Die Vorlage enthält mehr als 200 Platzhalter. Bitte die Anzahl verringern.“ | Platzhalter streichen, bis höchstens 200 übrig sind (alle Stellen zusammen gezählt). |
| „Die Datei konnte nicht verarbeitet werden. …“ | In Word erneut als .docx speichern und noch einmal hochladen. |
| „Sie sind nicht berechtigt, Zertifikatsvorlagen hochzuladen.“ / „… zurückzusetzen.“ | Ihrem Konto fehlt die nötige Rolle. Wenden Sie sich an einen Administrator. |
| „Ihr Benutzerkonto ist deaktiviert.“ | Siehe [Anmeldung](anmeldung.md#konto-deaktiviert). |
| „Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …“ | Erneut anmelden. |
| „Die Vorlage konnte nicht hochgeladen werden. Bitte später erneut versuchen.“ | Technisches Problem, z. B. keine Verbindung zum Server. |
