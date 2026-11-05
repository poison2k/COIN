# Zertifikat prüfen – Anleitung

Jedes gedruckte Zertifikat trägt einen Hologramm-Sticker mit einer Nummer, der **Hologrammnummer**.
Auf der Seite **Zertifikat prüfen** stellen Sie fest, ob eine solche Nummer zu einem echten, gültigen
Zertifikat gehört. Wie die Nummer zur Ausgabe kommt, steht unter
[Exemplare und Ausgaben](ausgaben.md#hologrammnummer).

## Wer darf prüfen

| | Prüfen | Angezeigt werden |
|---|---|---|
| ohne Anmeldung, ohne Rolle oder deaktiviert | – | – |
| Betrachter | ja | Coin, Exemplar, Zertifikatsnummer, Hologrammnummer, Ausgabedatum, Status |
| Sachbearbeiter, Administrator | ja | zusätzlich Empfänger (Name, Dienstgrad, Dienststelle), Gelegenheit, Begründung, ausgebende Stelle und der Link **Zur Ausgabe** |

Den Grund eines Stornos zeigt die Prüfung nie. Eine Prüfung ohne Anmeldung gibt es nicht.

## So prüfen Sie

1. Klicken Sie in der Seitenleiste auf **Zertifikat prüfen** (Adresse `/pruefung`).
2. Optional: Wählen Sie unter **Coin (optional)** den Coin, zu dem das Zertifikat gehören soll. Tippen
   Sie dazu einen Teil des Namens oder Herausgebers; nach einem kurzen Moment erscheinen passende
   Coins als „Name – Herausgeber“. Mit den Pfeiltasten und der Eingabetaste oder per Klick wählen Sie
   einen aus, Escape schließt die Liste. Passt kein Coin, steht dort „Keine Coins gefunden“. Mit
   **Auswahl entfernen** heben Sie die Auswahl wieder auf.
3. Tragen Sie die **Hologrammnummer** vom Sticker ein. Groß- und Kleinschreibung, Leerzeichen und
   Bindestriche spielen keine Rolle: „ab 12-34“ findet „AB1234“.
4. Klicken Sie auf **Prüfen** oder drücken Sie im Nummernfeld die Eingabetaste.

Während der Prüfung ist der Button gesperrt. Eine Prüfung dauert immer mindestens eine Viertelsekunde.
Ändern Sie danach die Nummer oder den Coin, verschwindet das alte Ergebnis.

Die Nummer erscheint nie in der Adresszeile und wird im Browser nicht gespeichert. Jede Prüfung
protokolliert C.O.I.N. mit Benutzer, Zeitpunkt, Nummer und Ergebnis.

## Ergebnisse

Jedes Ergebnis hat eine eigene Überschrift, ein Symbol und eine Farbe. Darunter steht „Geprüfte
Nummer: …“ mit Ihrer bereinigten Eingabe.

| Überschrift | Farbe | Bedeutung |
|---|---|---|
| „Zertifikat gültig“ | grün | Die Nummer gehört zu einer aktiven Ausgabe (und, falls gewählt, zum gewählten Coin). |
| „Ausgabe storniert, Zertifikat ungültig“ | rot | Die Ausgabe zu dieser Nummer wurde storniert. Der Status zeigt „Storniert am TT.MM.JJJJ“. |
| „Die Nummer gehört nicht zu diesem Coin.“ | orange | Die Nummer gehört zu einem anderen Coin als dem gewählten. Welcher das ist, zeigt die Seite nicht. |
| „Nummer nicht gefunden. Das Zertifikat kann nicht bestätigt werden.“ | grau | Zu dieser Nummer gibt es keine Ausgabe. Auch eine Nummer, die später korrigiert wurde, gilt als nicht gefunden. |

Bei „gültig“ und „storniert“ folgen die Angaben aus der Tabelle oben: **Coin** (Link zur
Detailseite), **Exemplar** („Nr. 12“), **Zertifikatsnummer**, **Hologrammnummer**, **Ausgabedatum**
und **Status** („Aktiv“ oder „Storniert am …“), für Sachbearbeiter und Administratoren zusätzlich die
Empfängerangaben und **Zur Ausgabe**.

## Fehlermeldungen

| Meldung | Bedeutung |
|---|---|
| „Bitte eine Hologrammnummer eingeben.“ | Das Nummernfeld ist leer. |
| „Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.“ | Andere Zeichen (z. B. `/`, `.`, Umlaute) entfernen. |
| „Die Hologrammnummer darf höchstens 40 Zeichen lang sein.“ | Nummer kürzen. |
| „Die Hologrammnummer muss mindestens einen Buchstaben oder eine Ziffer enthalten.“ | Nicht nur Leerzeichen oder Bindestriche eintragen. |
| „Sie haben in kurzer Zeit zu viele Prüfungen durchgeführt. Bitte warten Sie … Sekunden.“ | Je Benutzer sind höchstens 20 Prüfungen pro Minute möglich. Der Button bleibt bis zum Ablauf der Wartezeit gesperrt (ohne Angabe der Sekunden: „Bitte warten Sie einen Moment.“, dann eine Minute). |
| „Sie sind nicht berechtigt, Zertifikate zu prüfen.“ | Ihrem Konto fehlt die nötige Rolle. Wenden Sie sich an einen Administrator. |
| „Ihr Benutzerkonto ist deaktiviert.“ | Ihr Konto wurde deaktiviert. |
| „Die Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.“ | Technisches Problem, z. B. keine Verbindung zum Server. |

Ohne Anmeldung führt die Adresse `/pruefung` zur Anmeldung und danach zurück; ohne Rolle oder mit
deaktiviertem Konto zur Seite **Kein Zugriff** (siehe [Anmeldung](anmeldung.md#seite-kein-zugriff)).
