# Coin-Katalog – Anleitung

Im Katalog suchen und blättern Sie in allen erfassten Coins und öffnen die Detailseite eines Coins.
Neue Coins legen Sie auf der eigenen Seite **Coin hinzufügen** an.

Den Katalog und die Detailseiten kann jeder ohne Anmeldung ansehen. **Coins hinzufügen** können nur
angemeldete Benutzer mit der Rolle Administrator oder Sachbearbeiter. Wie Sie sich anmelden, steht in
der [Anleitung zur Anmeldung](anmeldung.md).

## Navigation

Links befindet sich die Seitenleiste:

- **Startseite**: Begrüßung mit kurzer Einleitung und dem Button **Zum Katalog**.
- **Katalog**: Liste aller Coins mit Suche. Der Eintrag ist auch auf der Detailseite eines Coins und
  auf **Coin hinzufügen** hervorgehoben.
- **Benutzerverwaltung**: nur für Administratoren (siehe [Benutzerverwaltung](benutzerverwaltung.md)).

Rechts in der Kopfzeile stehen **Anmelden** bzw. Ihr Name und **Abmelden**.

Der Eintrag der aktuell geöffneten Seite ist hervorgehoben.

Mit dem Button ganz links in der Kopfzeile (**Seitenleiste ein-/ausblenden**) blenden Sie die
Seitenleiste aus und wieder ein. Dasselbe geht mit **Strg+B** (am Mac **Cmd+B**), solange der
Cursor nicht in einem Eingabefeld steht. Dort behält die Tastenkombination ihre übliche Wirkung.

Auf schmalen Bildschirmen, z. B. auf dem Smartphone, ist die Seitenleiste zunächst verborgen.
Der Button öffnet sie als Überlagerung über der Seite. Nach der Auswahl eines Eintrags schließt
sie sich wieder.

Ruft man eine Adresse auf, die es nicht gibt, erscheint „Seite nicht gefunden.“ mit einem Link
**Zur Startseite**.

## Farbschema

Über den Button **Farbschema wählen** rechts in der Kopfzeile (Symbol Sonne/Mond) wählen Sie:

- **Hell** oder **Dunkel**: festes Farbschema.
- **System**: übernimmt die Einstellung Ihres Betriebssystems. Das ist die Voreinstellung.

Ihre Wahl wird im Browser gespeichert und gilt auch nach dem Neuladen der Seite.

## Katalog ansehen

Die Seite **Katalog** zeigt eine Tabelle mit den Spalten **Bild**, **Name**, **Herausgeber**,
**Auflage** und **Erfasst am**, alphabetisch nach Name sortiert, 25 Coins pro Seite.

- **Bild**: kleines Vorschaubild des Motivs oder „Kein Bild“.
- **Auflage**: z. B. „1.000“, oder „unbekannt“, wenn keine Auflage angegeben wurde.
- **Erfasst am**: Datum der Erfassung, z. B. 05.10.2026.

Solange der Katalog lädt, erscheint „Coins werden geladen …“. Gibt es noch keine Coins, steht dort
„Noch keine Coins erfasst.“ Kann der Katalog nicht geladen werden, erscheint „Coins konnten nicht
geladen werden. Bitte später erneut versuchen.“

### Suchen

1. Geben Sie im Feld **Coins suchen** einen Teil des Namens oder des Herausgebers ein (höchstens
   100 Zeichen). Groß- und Kleinschreibung spielen keine Rolle. Die Beschreibung wird nicht durchsucht.
2. Klicken Sie auf **Suchen** oder drücken Sie die Eingabetaste. Die Suche beginnt immer auf Seite 1.
   Ein leeres Suchfeld zeigt wieder alle Coins.

Über der Tabelle steht, wie viele Coins gefunden wurden, z. B. „3 Coins gefunden“. Gibt es keinen
Treffer, steht dort „Keine Coins gefunden.“ Ist das Laden fehlgeschlagen, startet ein erneuter Klick
auf **Suchen** das Laden neu.

### Blättern

Mit **Vorherige Seite** und **Nächste Seite** unter der Tabelle blättern Sie; dazwischen steht
„Seite x von y“. Auf der ersten bzw. letzten Seite ist der jeweilige Button gesperrt. Während die
nächste Seite lädt, bleibt die bisherige Seite sichtbar.

Suchbegriff und Seite stehen in der Adresse (z. B. `/coins?suche=bataillon&seite=2`). Sie können sie
also als Lesezeichen speichern oder die Seite neu laden. Zeigt eine solche Adresse eine Seite hinter
dem Ende (z. B. weil inzwischen weniger Coins passen), erscheint „Auf dieser Seite gibt es keine
Coins.“ **Vorherige Seite** führt dann zur letzten vorhandenen Seite.

### Coin öffnen

Klicken Sie auf den Namen eines Coins oder irgendwo in seine Zeile. Mit der Tastatur erreichen Sie
den Namen mit der Tab-Taste und öffnen ihn mit der Eingabetaste. Mit gedrückter Strg-, Cmd-,
Umschalt- oder Alt-Taste öffnet ein Klick auf die Zeile nichts; den Namen können Sie so wie jeden
Link z. B. in einem neuen Tab öffnen.

Mit **Zurück** im Browser kommen Sie von der Detailseite wieder zu derselben Suche und Seite.

## Detailseite eines Coins

Die Detailseite (`/coins/…`) zeigt als Überschrift den Namen des Coins und darunter:

- das Motivbild oder „Kein Motivbild vorhanden.“,
- **Herausgeber**, **Auflage** (oder „unbekannt“), **Erfasst am** und **Beschreibung** (mit den
  eingegebenen Zeilenumbrüchen, sonst „Keine Beschreibung“),
- den Abschnitt **Verleihungen** mit dem Hinweis „Dieser Bereich wird in einer späteren Version
  ergänzt.“ Er enthält noch keine Daten.

Mit **Zurück zum Katalog** geht es zur ersten Seite des Katalogs ohne Suche.

Bearbeiten oder Löschen ist auf der Detailseite nicht möglich. Gibt es den Coin nicht (z. B. bei
einer falsch abgetippten Adresse), erscheint „Coin nicht gefunden“ mit dem Link **Zum Katalog**.
Kann der Coin nicht geladen werden, erscheint „Der Coin konnte nicht geladen werden. Bitte später
erneut versuchen.“

## Coin hinzufügen

Nur angemeldet mit der Rolle Administrator oder Sachbearbeiter. Nur dann steht auf der Seite
**Katalog** rechts neben der Überschrift der Button **Coin hinzufügen**. Er öffnet die Seite
**Coin hinzufügen** (`/coins/neu`).

Rufen Sie die Adresse `/coins/neu` direkt auf, gilt:

- ohne Anmeldung: Sie werden zur Anmeldung geschickt und kommen danach wieder auf diese Seite
  (sofern Ihre Rolle das Hinzufügen erlaubt),
- ohne passende Berechtigung (z. B. als Betrachter): Seite **Kein Zugriff** (siehe
  [Anmeldung](anmeldung.md#seite-kein-zugriff)).

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
öffnet sich die Detailseite des neuen Coins mit der Meldung „Coin wurde angelegt.“ Die Meldung
erscheint nur dieses eine Mal. **Zurück** im Browser führt danach nicht wieder zum ausgefüllten
Formular.

Mit **Abbrechen** kehren Sie ohne Speichern zum Katalog zurück.

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

## Bild erneut hochladen

Coin und Bild werden nacheinander gespeichert. Klappt nur das Bild nicht, bleiben Sie auf der Seite
**Coin hinzufügen**, und es erscheint „Coin wurde angelegt, das Bild konnte nicht gespeichert
werden:“ mit dem Grund. Der Coin steht dann ohne Bild im Katalog; das gewählte Bild bleibt im
Formular. Sie haben zwei Möglichkeiten:

- **Bild erneut hochladen**: Das Bild wird für denselben Coin gespeichert, es entsteht kein zweiter
  Coin. Ist das Bild selbst das Problem (Format oder Größe), wählen Sie vorher ein anderes Bild aus.
  Klappt es, öffnet sich die Detailseite mit „Coin wurde angelegt.“
- **Ohne Bild fortfahren**: Die Detailseite öffnet sich mit „Coin wurde ohne Motivbild angelegt.“

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
| „Sie sind nicht berechtigt, Coins zu erfassen.“ | Ihrem Konto fehlt die nötige Rolle. Wenden Sie sich an einen Administrator. |
| „Ihr Benutzerkonto ist deaktiviert.“ | Ein Administrator hat Ihr Konto deaktiviert (siehe [Anmeldung](anmeldung.md#konto-deaktiviert)). |
| „Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …“ | Melden Sie sich erneut an. Die Eingaben gehen dabei verloren (siehe [Anmeldung](anmeldung.md#sitzung-abgelaufen)). |
| „Der Coin konnte nicht angelegt werden. Bitte später erneut versuchen.“ | Technisches Problem, z. B. keine Verbindung zum Server. |
