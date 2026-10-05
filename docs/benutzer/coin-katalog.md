# Coin-Katalog – Anleitung

Im Coin-Katalog erfassen Sie Coins und sehen alle erfassten Coins in einer Liste.
Die Startseite enthält oben das Formular „Neuen Coin erfassen“ und darunter den Katalog.

## Katalog ansehen

Der Katalog ist eine Tabelle mit den Spalten **Bild**, **Name**, **Herausgeber**, **Auflage** und
**Erfasst am**. Die Coins sind alphabetisch nach Name sortiert.

- **Bild**: kleines Vorschaubild des Motivs oder „Kein Bild“.
- **Auflage**: „unbekannt“, wenn keine Auflage angegeben wurde.
- **Erfasst am**: Datum der Erfassung, z. B. 05.10.2026.

Solange der Katalog lädt, erscheint „Coins werden geladen …“. Gibt es noch keine Coins, steht dort
„Noch keine Coins erfasst.“ Kann der Katalog nicht geladen werden, erscheint „Coins konnten nicht
geladen werden. Bitte später erneut versuchen.“

## Coin anlegen

| Feld | Pflicht | Regel |
|---|---|---|
| Name | ja | höchstens 200 Zeichen |
| Herausgeber | ja | höchstens 200 Zeichen |
| Auflage | nein | ganze Zahl von 1 bis 1.000.000; leer lassen, wenn unbekannt |
| Beschreibung | nein | höchstens 2000 Zeichen |
| Motivbild | nein | siehe unten |

Leerzeichen am Anfang und Ende werden automatisch entfernt.

Name und Herausgeber zusammen müssen eindeutig sein. Groß- und Kleinschreibung spielt dabei keine
Rolle: „Coin A“ von „Bataillon 1“ und „coin a“ von „BATAILLON 1“ gelten als derselbe Coin. Derselbe
Name bei einem anderen Herausgeber ist erlaubt.

Klicken Sie auf **Coin anlegen**. Während gespeichert wird, ist der Button gesperrt. Bei Erfolg
erscheint „Coin wurde angelegt.“, das Formular wird geleert und der Coin erscheint sofort im Katalog.

Ein angelegter Coin kann in dieser Version weder bearbeitet noch gelöscht werden. Prüfen Sie Ihre
Eingaben deshalb vor dem Speichern.

## Motivbild

- Erlaubt sind **JPEG, PNG und WebP**, höchstens **5 MB**. Andere Formate wie GIF, SVG oder HEIC
  (Standardformat vieler iPhones) werden abgelehnt.
- Nach der Auswahl sehen Sie eine Vorschau. Mit **Bild entfernen** nehmen Sie die Auswahl zurück.
- Pro Coin gibt es ein Bild.
- **Hinweis zu Metadaten**: Fotos enthalten oft versteckte Zusatzdaten (EXIF), z. B. den Aufnahmeort
  per GPS oder Kameradaten. Diese werden nicht entfernt und mit dem Bild gespeichert. Laden Sie
  deshalb nur Bilder ohne personenbezogene Metadaten hoch, z. B. einen Screenshot oder ein mit einem
  Bildprogramm ohne Metadaten exportiertes Bild.

## Fehlermeldungen

Fehler zu einzelnen Feldern stehen direkt unter dem jeweiligen Feld. Ihre Eingaben bleiben erhalten.

| Meldung | Bedeutung |
|---|---|
| „Name ist erforderlich.“ / „Herausgeber ist erforderlich.“ | Pflichtfeld ausfüllen. |
| „… darf höchstens … Zeichen lang sein.“ | Text kürzen. |
| „Auflage muss eine ganze Zahl sein.“ | Nur Ziffern eingeben, ohne Punkt oder Komma. |
| „Auflage muss zwischen 1 und 1000000 liegen.“ | Wert anpassen oder Feld leer lassen. |
| „Nur JPEG, PNG oder WebP erlaubt.“ | Bild in einem erlaubten Format wählen. |
| „Bild ist zu groß (max. 5 MB).“ | Kleineres Bild wählen. |
| „Die Bilddatei ist leer.“ | Die gewählte Datei hat keinen Inhalt. |
| „Ein Coin mit diesem Namen und Herausgeber existiert bereits.“ | Dieser Coin ist schon im Katalog. |
| „Der Coin konnte nicht angelegt werden. Bitte später erneut versuchen.“ | Technisches Problem, z. B. keine Verbindung zum Server. |

## Bild erneut hochladen

Coin und Bild werden nacheinander gespeichert. Klappt nur das Bild nicht, erscheint
„Coin wurde angelegt, das Bild konnte nicht gespeichert werden:“ mit dem Grund. Der Coin steht dann
ohne Bild im Katalog; das gewählte Bild bleibt im Formular.

Klicken Sie auf **Bild erneut hochladen**. Das Bild wird für denselben Coin gespeichert, es entsteht
kein zweiter Coin. Ist das Bild selbst das Problem (Format oder Größe), wählen Sie vorher ein anderes
Bild aus.
