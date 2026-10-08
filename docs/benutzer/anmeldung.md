# Anmelden und Abmelden – Anleitung

## Was geht ohne Anmeldung?

Startseite, Katalog und die Detailseiten der Coins können Sie ohne Anmeldung ansehen, samt
Motivbildern. Sie werden dabei nie automatisch zur Anmeldung geschickt.

Coins hinzufügen können Sie nur angemeldet und nur mit der passenden Berechtigung (siehe unten).
Rufen Sie die Seite **Coin hinzufügen** (`/coins/neu`) ohne Anmeldung auf, werden Sie zur Anmeldung
geschickt und kommen danach dorthin zurück.

## Anmelden

1. Klicken Sie rechts oben in der Kopfzeile auf **Anmelden**.
2. Sie gelangen zur Anmeldeseite. Geben Sie dort Ihre E-Mail-Adresse und Ihr Passwort ein.
3. Kurz erscheint „Anmeldung wird abgeschlossen …“. Danach sind Sie wieder auf der Seite, von der
   aus Sie sich angemeldet haben.

Angemeldet steht rechts oben Ihr Name (auf schmalen Bildschirmen ausgeblendet) und der Button
**Abmelden**.

Ein eigenes Konto anlegen oder das Passwort ändern können Sie in C.O.I.N. nicht. Wenden Sie sich
dafür an die zuständige Stelle für Ihr Benutzerkonto.

Klappt die Anmeldung nicht, erscheint „Anmeldung fehlgeschlagen“ mit dem Hinweis „Die Anmeldung
konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.“ Wählen Sie **Erneut anmelden**
oder **Zum Coin-Katalog**.

Erscheint in der Kopfzeile „Ihre Anmeldung konnte nicht geprüft werden.“, ist der Server gerade
nicht erreichbar. Klicken Sie auf **Erneut versuchen**. Den Katalog können Sie in der Zwischenzeit
weiter ansehen, der Button **Coin hinzufügen** ist ausgeblendet.

## Berechtigungen

Was Sie nach der Anmeldung dürfen, hängt von der Rolle Ihres Kontos in C.O.I.N. ab:

| Rolle | Katalog ansehen | Coins hinzufügen | Benutzerverwaltung |
|---|---|---|---|
| ohne Anmeldung | ja | nein | nein |
| Administrator | ja | ja | ja |
| Sachbearbeiter | ja | ja | nein |
| Betrachter | ja | nein | nein |
| angemeldet, aber noch ohne Rolle | ja | nein | nein |
| Konto deaktiviert | ja | nein | nein |

Neue Konten haben zunächst keine Rolle. Die Rolle vergibt ein Administrator in der
[Benutzerverwaltung](benutzerverwaltung.md). Haben Sie noch keine Rolle, geht es über **Erneut
prüfen** weiter (siehe unten). Ändert ein Administrator eine Rolle, die Sie schon haben, sehen Sie
das erst nach dem Neuladen der Seite (Taste F5) oder nach der nächsten Anmeldung.

Den Button **Coin hinzufügen** auf der Seite **Katalog** und den Eintrag **Benutzerverwaltung** in
der Seitenleiste sehen Sie nur, wenn Ihre Rolle das erlaubt.

## Seite „Kein Zugriff“

Hat Ihr Konto noch keine Rolle, landen Sie nach der Anmeldung auf der Seite **Kein Zugriff**:
„Sie sind als … angemeldet, Ihrem Konto ist aber noch keine Rolle zugewiesen. Den Coin-Katalog
können Sie weiterhin ansehen. Für weitere Funktionen wenden Sie sich bitte an einen Administrator.“

Von dort geht es mit **Zum Coin-Katalog** zum Katalog, mit **Erneut prüfen** (siehe unten)
oder mit **Abmelden** hinaus.

### Keine Berechtigung für eine Seite

Haben Sie eine Rolle, rufen aber eine Seite auf, die Ihre Rolle nicht erlaubt (z. B. als Betrachter
die Adresse `/coins/neu` oder als Sachbearbeiter `/benutzerverwaltung`), erscheint ebenfalls
**Kein Zugriff**: „Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können
Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.“ Dort gibt es **Zum
Coin-Katalog** und **Abmelden**, aber kein **Erneut prüfen**.

## Konto deaktiviert

Ein Administrator kann Ihr Konto in C.O.I.N. deaktivieren. Melden Sie sich dann an, oder ist Ihr
Konto während der Arbeit deaktiviert worden, erscheint die Seite **Kein Zugriff** mit dem Text
„Ihr Benutzerkonto ist deaktiviert. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich
bei Fragen an einen Administrator.“ Rechts oben steht dann nur **Abmelden**, ohne Ihren Namen.

Den Coin-Katalog können Sie weiter ansehen, alle anderen Funktionen sind gesperrt.

## Erneut prüfen

Hat ein Administrator Ihnen inzwischen eine Rolle gegeben oder Ihr Konto wieder aktiviert, klicken
Sie auf der Seite **Kein Zugriff** auf **Erneut prüfen**. Während der Prüfung steht auf dem Button
„Wird geprüft …“.

- Haben Sie jetzt Zugriff, kommen Sie zur Startseite. Name und Menüeinträge erscheinen wieder.
- Hat sich nichts geändert, bleibt die Seite und es erscheint „Ihr Benutzerkonto ist weiterhin
  deaktiviert.“ bzw. „Ihrem Benutzerkonto ist weiterhin keine Rolle zugewiesen.“
- Hat sich der Grund geändert (z. B. Ihr Konto ohne Rolle wurde deaktiviert, oder es wurde
  reaktiviert, hat aber keine Rolle), zeigt die Seite den neuen Text.
- Ist der Server nicht erreichbar, erscheint „Die Prüfung ist fehlgeschlagen. Bitte später erneut
  versuchen.“

Solange Ihr Konto deaktiviert ist oder keine Rolle hat, prüft C.O.I.N. das auch von selbst, wenn
Sie in das Browserfenster zurückkehren (höchstens alle 30 Sekunden, ohne Meldung). Neu laden
(Taste F5) oder erneut anmelden geht ebenfalls.

## Abmelden

Klicken Sie rechts oben auf **Abmelden**. Sie werden in C.O.I.N. und auch an der Anmeldeseite
abgemeldet. Bei der nächsten Anmeldung müssen Sie Ihr Passwort also erneut eingeben.

Danach erscheint die Seite **Abgemeldet** mit „Sie wurden abgemeldet.“ Von dort können Sie sich
mit **Erneut anmelden** wieder anmelden oder mit **Zum Coin-Katalog** den Katalog weiter ansehen.

## Sitzung abgelaufen

Die Anmeldung gilt nur für den Browser-Tab, in dem Sie sich angemeldet haben. In einem neuen Tab
klicken Sie erneut auf **Anmelden**. Solange Sie aktiv sind, verlängert sich die Anmeldung
automatisch. Nach längerer Zeit ohne Aktivität oder nach einer Höchstdauer endet sie, und rechts oben
erscheint wieder **Anmelden**.

Ist die Anmeldung beim Speichern eines Coins abgelaufen, erscheint „Ihre Anmeldung ist abgelaufen.
Sie werden zur Anmeldung weitergeleitet …“. Nach der Anmeldung kommen Sie auf die Seite **Coin
hinzufügen** zurück. **Ihre Eingaben im Formular gehen dabei verloren** und müssen neu eingegeben
werden.

## Bekannte Einschränkung: mehrere Tabs

Arbeiten Sie gleichzeitig in mehreren Tabs mit C.O.I.N., kann ein Tab nach einiger Zeit wieder
**Anmelden** anzeigen, obwohl Sie sich nicht abgemeldet haben. Melden Sie sich in diesem Tab einfach
erneut an. Um das zu vermeiden, arbeiten Sie am besten in nur einem Tab.
