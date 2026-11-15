# ADR-0044: Ansichtswahl des Katalogs im `localStorage`

Status: Angenommen (Entscheidung des Auftraggebers vom 2026-11-15, startseite-listen-pruefung F7) · Datum: 2026-11-15 · Feature: [startseite-listen-pruefung](../features/startseite-listen-pruefung.md) · Ergänzt: [ADR-0035](0035-gestaltungsregeln-tokens-palette-schrift.md) Punkt 1 (Theme in `coin-theme`), design-fundament Abschnitt 12 („`localStorage` enthält nur `coin-theme`“)

## Kontext
Der Katalog bekommt eine Tabellen- und eine Kartenansicht. Die Wahl soll gemerkt werden. Bisher steht im Browser nur das Farbschema (`coin-theme`). Ungespeicherte Eingaben dürfen nie in Storage landen (formulare-detailseiten Abschnitt 6).

## Entscheidung
1. Die Ansicht steht unter dem Schlüssel `coin-katalog-ansicht` mit genau den Werten `tabelle` oder `karten` im `localStorage`. Andere Werte gelten als `tabelle` (Standard, F1).
2. Lesen und Schreiben laufen nur über `useLokaleWahl` (`shared/lib/hooks`) mit fester Positivliste der Werte. Wirft der Speicherzugriff (z. B. gesperrter Speicher), gilt der Wert nur im Speicher der Komponente, ohne Fehlermeldung.
3. Die Ansicht steht nicht in der URL. Suche und Seite bleiben wie bisher in der URL.
4. Im Browser-Speicher stehen nur Bedienvorlieben ohne Personenbezug: `coin-theme` und `coin-katalog-ansicht`. Suchbegriffe, Filter, Hologrammnummern, Namen und Formularinhalte kommen nie dorthin.

## Betrachtete Alternativen
- **URL-Parameter `ansicht`:** Die Ansicht bliebe nur im Verlauf und in Lesezeichen gemerkt, und geteilte Links trügen eine fremde Vorliebe. Verworfen.
- **Speicherung je Benutzer in der Datenbank:** Das ist eine API- und Datenbankänderung und für anonyme Besucher nicht möglich. Verworfen.
- **`sessionStorage`:** Die Wahl wäre nach dem Schließen des Tabs vergessen. Verworfen.
- **Cookie:** Es würde bei jedem Request mitgesendet, und das Projekt verzichtet auf Cookies (ADR-0009). Verworfen.

## Folgen
- Weitere Ansichtsvorlieben nutzen denselben Hook mit eigenem, im Feature dokumentiertem Schlüssel.
- Ein Test prüft, dass nach einem Rundgang durch die Seiten nur diese beiden Schlüssel im `localStorage` stehen.
