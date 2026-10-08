# Exemplare und Ausgaben – Anleitung

Jeder Coin mit bekannter Auflage hat nummerierte **Exemplare** (Nr. 1 bis zur Auflage). Eine
**Ausgabe** hält fest, welches Exemplar an wen, wann, bei welcher Gelegenheit und wofür übergeben
wurde. Beides finden Sie auf der Detailseite eines Coins (siehe [Coin-Katalog](coin-katalog.md#detailseite-eines-coins)).

## Wer sieht was

| | Stammdaten und Bild | Exemplare und Kennzahlen | Ausgabehistorie | Ausgabe erfassen, stornieren | Auflage ändern |
|---|---|---|---|---|---|
| ohne Anmeldung, ohne Rolle oder deaktiviert | ja | – | – | – | – |
| Betrachter | ja | ja | – | – | – |
| Sachbearbeiter, Administrator | ja | ja | ja | ja | ja |

Betrachter sehen nur Zahlen und den Status der Exemplare, nie Namen von Empfängern oder andere
Angaben zu einer Ausgabe. Abschnitte ohne Berechtigung erscheinen gar nicht.

## Abschnitt „Exemplare“

Oben stehen die Kennzahlen:

- **Auflage**: Anzahl der Exemplare,
- **Ausgegeben**: Exemplare mit einer aktiven (nicht stornierten) Ausgabe,
- **Verfügbar**: alle übrigen Exemplare.

Darunter steht die Tabelle mit **Nr.** und **Status** („verfügbar“ oder „ausgegeben“), 25
Exemplare pro Seite. Mit **Vorherige Seite** und **Nächste Seite** blättern Sie. Über die Auswahl
**Status** zeigen Sie **Alle**, nur **Verfügbar** oder nur **Ausgegeben**; die Liste beginnt dann
wieder auf Seite 1. Filter und Seite stehen in der Adresse (z. B. `/coins/…?status=ausgegeben&seite=2`)
und bleiben beim Neuladen erhalten.

Ist für den Coin keine Auflage erfasst, steht dort „Für diesen Coin ist keine Auflage erfasst. Es
gibt daher keine Exemplare.“ Passt kein Exemplar zum Filter, erscheint „Keine Exemplare mit diesem
Status.“

## Abschnitt „Ausgabehistorie“

Nur für Sachbearbeiter und Administratoren. Die Tabelle zeigt alle Ausgaben des Coins, die neueste
zuerst, auch stornierte:

| Spalte | Inhalt |
|---|---|
| Nr. | Exemplar-Nummer |
| Empfänger | Name, darunter Dienstgrad und Dienststelle, falls angegeben |
| Datum | Tag der Ausgabe |
| Gelegenheit, Begründung, Ausgebende Stelle | wie erfasst |
| Erfasst | wer die Ausgabe eingetragen hat und wann |
| Status | „aktiv“ oder „storniert am {Datum} von {Name}: {Grund}“ |

Gibt es noch keine Ausgaben, steht dort „Für diesen Coin wurden noch keine Ausgaben erfasst.“

## Ausgabe erfassen

1. Klicken Sie im Abschnitt **Exemplare** auf **Ausgabe erfassen**. Der Button erscheint nur, wenn
   eine Auflage erfasst ist.
2. Die Seite **Ausgabe erfassen** zeigt den Namen des Coins und z. B. „Verfügbar: 147 von 150“.
3. Wählen Sie unter **Exemplar**:
   - **Nächstes freies Exemplar** (Voreinstellung): Die kleinste freie Nummer wird vergeben. Das
     kann auch eine Nummer sein, deren Ausgabe storniert wurde.
   - **Bestimmte Nummer**: Tragen Sie die **Exemplar-Nummer** ein (1 bis zur Auflage).
4. Füllen Sie die Felder aus. Pflichtfelder sind mit * markiert.

| Feld | Pflicht | Regel |
|---|---|---|
| Name des Empfängers | ja | höchstens 200 Zeichen |
| Dienstgrad | nein | höchstens 100 Zeichen |
| Dienststelle | nein | höchstens 200 Zeichen |
| Datum | ja | vorbelegt mit heute; darf nicht in der Zukunft liegen |
| Gelegenheit | ja | z. B. Truppenbesuch, Verabschiedung; höchstens 200 Zeichen |
| Begründung | ja | höchstens 2000 Zeichen |
| Ausgebende Stelle oder Person | ja | wer den Coin übergeben hat; höchstens 200 Zeichen |

5. Klicken Sie auf **Ausgabe speichern** oder drücken Sie die Eingabetaste. Wer die Ausgabe
   erfasst und wann, speichert C.O.I.N. automatisch.

Danach öffnet sich die Detailseite mit der Meldung „Exemplar Nr. … wurde ausgegeben.“ Die neue
Ausgabe steht oben in der Historie, die Kennzahlen sind aktualisiert. **Zurück** im Browser führt
nicht wieder zum ausgefüllten Formular. Mit **Abbrechen** kehren Sie ohne Speichern zum Coin zurück.

Eine Ausgabe kann nicht bearbeitet werden. Ist etwas falsch, stornieren Sie sie und erfassen sie neu.

Sind alle Exemplare ausgegeben oder fehlt die Auflage, zeigt die Seite statt des Formulars den Grund
und **Zurück zum Coin**. Ohne passende Berechtigung führt die Adresse `/coins/…/ausgaben/neu` zur
Seite **Kein Zugriff** (siehe [Anmeldung](anmeldung.md#seite-kein-zugriff)).

## Ausgabe stornieren

1. Klicken Sie in der Ausgabehistorie in der Zeile einer aktiven Ausgabe auf **Stornieren**.
2. Geben Sie im Dialog **Ausgabe stornieren?** einen **Grund** ein (Pflicht, höchstens 500 Zeichen).
   **Bitte keine Personendaten in den Grund schreiben**, z. B. „Falsches Exemplar erfasst“ statt
   eines Namens. Der Grund wird dauerhaft gespeichert.
3. Klicken Sie auf **Stornieren**. Mit **Abbrechen** oder Escape schließen Sie den Dialog ohne Änderung.

Danach erscheint „Ausgabe von Exemplar Nr. … wurde storniert.“ Die Ausgabe bleibt mit ihrem
Storno-Vermerk in der Historie, das Exemplar ist wieder verfügbar. Ein Storno lässt sich nicht
rückgängig machen; erfassen Sie bei Bedarf eine neue Ausgabe.

## Auflage ändern

Nur für Sachbearbeiter und Administratoren.

1. Klicken Sie im Abschnitt **Exemplare** auf **Auflage ändern**.
2. Tragen Sie die neue **Auflage** ein (1 bis 1.000.000) und klicken Sie auf **Speichern**.

- **Erhöhen** legt die zusätzlichen Exemplare an. So legen Sie auch für einen Coin ohne Auflage
  erstmals eine fest.
- **Senken** ist nur bis zur höchsten Exemplar-Nummer möglich, die jemals ausgegeben wurde, auch wenn
  diese Ausgabe inzwischen storniert ist. Sonst erscheint z. B. „Die Auflage kann nicht unter 7
  gesenkt werden, weil Exemplar Nr. 7 ausgegeben wurde.“
- Zurück auf „unbekannt“ geht nicht.

Nach dem Speichern erscheint „Auflage wurde geändert.“, Stammdaten und Kennzahlen sind aktualisiert.

## Fehlermeldungen

Fehler zu einzelnen Feldern stehen direkt unter dem Feld; Ihre Eingaben bleiben erhalten.

| Meldung | Bedeutung |
|---|---|
| „… ist erforderlich.“ / „… darf höchstens … Zeichen lang sein.“ | Pflichtfeld ausfüllen bzw. Text kürzen. |
| „Exemplar-Nummer muss zwischen 1 und … liegen.“ | Eine Nummer innerhalb der Auflage eingeben. |
| „Das Datum darf nicht in der Zukunft liegen.“ | Heute oder ein früheres Datum wählen. |
| „Exemplar Nr. … ist bereits ausgegeben.“ | Eine andere Nummer oder **Nächstes freies Exemplar** wählen. |
| „Alle Exemplare dieses Coins sind ausgegeben.“ | Es gibt kein freies Exemplar mehr. |
| „Diese Ausgabe ist bereits storniert.“ | Jemand hat sie gerade storniert; die Historie zeigt den aktuellen Stand. |
| „Bitte einen Grund für das Storno angeben.“ | Grund eintragen. |
| „Sie sind nicht berechtigt, …“ | Ihrem Konto fehlt die nötige Rolle. Wenden Sie sich an einen Administrator. |
| „Die Exemplare konnten nicht geladen werden. Bitte später erneut versuchen.“ | Technisches Problem, z. B. keine Verbindung zum Server. |
