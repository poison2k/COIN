# ADR-0046: Katalogtabelle auf `DatenTabelle`, Karten unter 768 px

Status: Angenommen (Testanpassungen E5/E6 freigegeben am 2026-11-16, [nacharbeiten-audit-filter](../features/nacharbeiten-audit-filter.md) F2) · Datum: 2026-11-16 · Feature: [nacharbeiten-audit-filter](../features/nacharbeiten-audit-filter.md) · Ändert: [ADR-0041](0041-tabellenmuster.md) Punkt 8 und die Ausnahme in „Betrachtete Alternativen“ (Katalog behält AK-15), design-fundament AK-15 für den Katalog

## Kontext
Die Tabellen der Anwendung nutzen seit ADR-0041 den Baustein `DatenTabelle`. Er bringt Karten unter 768 px, Zeilenklick und die Anzeige der festen Serversortierung per `aria-sort`. Nur `entities/coin/ui/CoinListe.tsx` hat noch eigenes shadcn-`Table`-Markup. Unter 768 px scrollt diese Tabelle horizontal in ihrem Container (design-fundament AK-15). Gefordert ist, dass auch der Katalog die gemeinsame Tabelle nutzt und unter 768 px Karten zeigt.

## Entscheidung
1. `CoinListe` rendert ausschließlich `DatenTabelle`:
   - Caption „Coins“;
   - Spalten Bild, Name (Kartentitel mit Link), Herausgeber, Auflage (rechts, Badge „unbekannt“), Erfasst am;
   - `zeilenklick`, `kartenUnter="md"`, `leer="Noch keine Coins erfasst."`.
   Eigenes Tabellenmarkup im Katalog entfällt.
2. Sortierung: Die API sortiert fest nach Name (seitenweise). Der Katalog zeigt das nur per `aria-sort="ascending"` an der Spalte „Name“, ohne Sortier-Button (ADR-0041 Punkt 3).
3. Unter 768 px zeigt die Ansicht „Tabelle“ die Karten der `DatenTabelle` (`<ul aria-label="Coins">`). Die Ansicht „Karten“ (`CoinKarten`, ADR-0043) bleibt als eigene Darstellung mit Motivbild bestehen. In beiden ist immer nur eine Darstellung im DOM.
4. Braucht der Zeilenlink Zustand aus derselben `useZeilenklick`-Instanz, wird `DatenTabelle` abwärtskompatibel erweitert. Der Katalog bekommt dafür keinen eigenen Tabellencode.
5. Die Ausnahme „Für Katalog und Bausteinbeispiel bleibt AK-15“ gilt nur noch für das Bausteinbeispiel.

## Betrachtete Alternativen
- **Katalog unter 768 px weiter horizontal scrollen lassen:** Er wäre der einzige Sonderfall und mit fünf Spalten auf 360 px schlecht bedienbar. Verworfen.
- **Unter 768 px immer `CoinKarten` statt der `DatenTabelle`-Karten:** Die Ansichtswahl würde dann auf kleinen Bildschirmen wirkungslos. Verworfen.
- **Interaktive Sortierung im Katalog:** Sie bräuchte eine API-Erweiterung bzw. sortierte nur die geladene Seite (ADR-0041 Punkt 3). Verworfen.

## Folgen
- Zwei UI-Tests ändern ihre Erwartung für 360 px (E5, E6 im Feature, freigegeben).
- Alle Listen mit Tabellenform nutzen nun `DatenTabelle`. Neue Tabellen dürfen kein eigenes `Table`-Markup mehr einführen (Code-Test für `entities/coin` und `widgets/coin-katalog`).

## Nachtrag (2026-11-16): Umsetzung
- `CoinListe` ist umgesetzt wie beschrieben, ohne eigenen Tabellencode.
- Vor der Liste steht eine sr-only-Überschrift h2 „Ergebnisse“. Ohne sie meldete axe bei 360 px
  `heading-order`, weil die Karten-Überschriften (h3) direkt auf die h1 folgten.
- Die Ansicht „Karten“ (`CoinKarten`) zeigt unter 640 px eine kompakte Karte mit 80 px großem Bild
  neben dem Text (Variante B aus nacharbeiten-audit-filter 4.5), ab 640 px ein Bildfeld 4:3 mit
  `object-contain`. Begründung: Bei 360 × 800 px ist eine Karte etwa 155 statt 315 px hoch, es passen
  über vier statt gut zwei Karten auf einen Bildschirm. Variante A ist nicht im Code.
