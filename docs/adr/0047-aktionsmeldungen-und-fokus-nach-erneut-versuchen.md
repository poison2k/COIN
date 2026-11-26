# ADR-0047: Aktionsmeldungen über einen Baustein und Fokus nach „Erneut versuchen“

Status: Angenommen (umgesetzt 2026-11-16) · Datum: 2026-11-16 · Feature: [nacharbeiten-audit-filter](../features/nacharbeiten-audit-filter.md) · Ergänzt: [ADR-0036](0036-layoutprinzip-app-shell-und-bausteine.md) (Bausteine), [ADR-0039](0039-formularmuster-und-validierung.md) (Formularmuster), design-fundament AK-18 (Hinweisbanner)

## Kontext
- **Meldungen nach Aktionen** (Speichern fehlgeschlagen, Upload abgelehnt, Download fehlgeschlagen, gespeichert) stehen in etwa 16 Dateien als eigenes `<p role="alert">` bzw. `<p role="status">` mit Textfarbe. Ladefehler nutzen schon `Fehlerzustand` (startseite-listen-pruefung AK-35).
- **„Erneut versuchen“:** Nach dem Klick verschwindet der Button mit dem Fehlerzustand, und der Tastaturfokus fällt auf `body` (WCAG 2.4.3).

## Entscheidung
1. **Baustein `Aktionsmeldung`** (`shared/ui/aktionsmeldung.tsx`) auf Basis von `Alert`, für alle Meldungen nach Aktionen in `features`, `widgets`, `pages` und im `Bestaetigungsdialog`. Die Props:
   - `meldung` (`null` oder `{ art, text, titel? }`);
   - `aktion?`, `ref?`, `fokussierbar?`.
   Die Arten:
   - `fehler` und `warnung` erscheinen als `Alert` `destructive`/`warning` mit `role="alert"`, eingefügt beim Erscheinen;
   - `erfolg` und `hinweis` erscheinen als `Alert` `success`/`info` in einem dauerhaft vorhandenen Container mit `role="status"`. Das Banner selbst hat `role="none"`, damit Ansagen zuverlässig sind und keine zweite Live-Region entsteht.
   Reine Statuszeilen (Laden, Trefferzahl, Fortschritt, sr-only-Ansagen) bleiben `<p role="status">` und stehen in einer Positivliste im Code-Test. Feldfehler bleiben am Feld (`Formularfeld`), Formularfehler in der `Fehlerzusammenfassung`.
2. **Fokus nach „Erneut versuchen“ im Baustein `Fehlerzustand`:** Vor dem Aufruf von `onErneutVersuchen` fokussiert er
   - die erste Überschrift (h1–h4) des Ziels, sonst das Ziel selbst (`tabIndex=-1` bei Bedarf, sichtbarer Fokusring);
   - Ziel ist die Prop `fokusZiel`, sonst der nächste Vorfahre mit `data-inhaltsbereich`, sonst `main#inhalt`.
   Das Ziel bleibt in den Zuständen Laden, Fehler und Inhalt eingehängt. Scheitert der Versuch erneut, bleibt der Fokus dort, und der neue Alarm wird per `role="alert"` angesagt.

## Betrachtete Alternativen
- **Toast für Aktionsmeldungen:** Toasts verschwinden von selbst und sind für Fehler mit Folgeaktion („Neu laden“) ungeeignet. Verworfen (Toast bleibt für flüchtige Bestätigungen).
- **`Alert` direkt an jeder Stelle:** Die Live-Region-Regel für Statusmeldungen müsste an 16 Stellen wiederholt werden. Verworfen zugunsten eines dünnen Bausteins.
- **Fokus nach dem Laden auf das erste Element des Inhalts:** Das Ziel ist je Zustand verschieden und springt bei leerem Ergebnis. Verworfen. Ein stabiles Ziel mit Überschrift ist vorhersehbar.
- **Fokus auf den neuen „Erneut versuchen“-Button bei erneutem Fehler:** Dafür bräuchte jede Stelle einen Wiederholungszustand. Verworfen, die Ansage übernimmt `role="alert"`.

## Folgen
- Neue Meldungen nach Aktionen entstehen nur über `Aktionsmeldung`. Der Code-Test verbietet `role="alert"` in `features`, `widgets` und `pages`.
- Widgets markieren ihren stabilen Inhaltsbereich mit `data-inhaltsbereich`. Neue Fehlerzustände erhalten die Fokusführung ohne eigenen Code.

## Nachtrag (2026-11-16): Umsetzung
- **Aktionsmeldung:** in 16 Dateien eingesetzt (dazu die Bausteinseite). Der `role="status"`-Container
  ist immer vorhanden (leer `empty:sr-only`); Fehler und Warnungen stehen als eigenes Banner mit
  `role="alert"` davor. Ein fokussierbares Erfolgs- oder Hinweisbanner hat keine eigene Rolle statt
  `role="none"` (axe `presentation-role-conflict`). Der Code-Test in `web/src/app/konsistenz.test.ts`
  führt zwei Positivlisten:
  - `role="alert"` bleibt nur in `PruefFormular` (nutzt schon `Alert`) und `Kopfzeile` (kein Formular);
  - `role="status"` nur an den reinen Statuszeilen (Laden, Treffer, Ansage beim Verschieben) und der
    Live-Region von `PruefFormular`.
- **Fokusführung:** `Fehlerzustand` hat die Props `fokusZiel` (Ref) und `fokusUeberschrift`
  (Standard `true`). Mit `fokusUeberschrift={false}` erhält das Ziel selbst den Fokus statt seiner
  ersten Überschrift. Das ist nötig, wenn die Seite beim Neuladen nur die Ladeanzeige zeigt und das
  h1 ausgehängt wird.
- **Baustein `Inhaltsbereich`** (`shared/ui/zustaende.tsx`): stabiler Wrapper mit
  `data-inhaltsbereich`, `tabIndex=-1` und sichtbarem Fokusring. Er umschließt Coin-Detail,
  Coin-Bearbeiten, Ausgabe erfassen und Ausgabe-Detail; dort steht `fokusUeberschrift={false}`. Die
  Startseite übergibt ein eigenes `fokusZiel`. Widgets (Änderungsprotokoll, Benutzertabelle, Katalog,
  Exemplare, Ausgabenhistorie, Zertifikatsvorlage) setzen `data-inhaltsbereich` an ihrer Wurzel.
- Hat das gewählte Element kein `tabindex`, setzt `Fehlerzustand` vorübergehend `tabindex="-1"` und
  die Fokusring-Klassen per DOM und nimmt beides beim `blur` zurück.
