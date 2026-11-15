# ADR-0041: Tabellenmuster – Datentabelle, Kartenansicht, Sortierung, Filter-Chips, Zeilenklick

Status: Angenommen (Entscheidungen des Auftraggebers vom 2026-11-14, formulare-detailseiten F6–F8) · Datum: 2026-11-14 · Feature: [formulare-detailseiten](../features/formulare-detailseiten.md) · Ergänzt: [ADR-0036](0036-layoutprinzip-app-shell-und-bausteine.md), [ADR-0039](0039-formularmuster-und-validierung.md) Punkt 4

## Kontext
Die Tabellen (Exemplare, Ausgabehistorie, Benutzer, Audit-Log, Vorlagenversionen) sind einfache shadcn-Tabellen mit `overflow-x-auto`. Gefordert sind:
- sortierbare Spalten, Paginierung und eine Filterleiste mit entfernbaren Chips;
- klickbare, per Tastatur erreichbare Zeilen und sinnvolle Breiten;
- Karten statt abgeschnittener Tabellen auf kleinen Bildschirmen.

Die API liefert alle Listen außer den Vorlagenversionen seitenweise (25 Einträge), mit fester Sortierung und ohne Sortierparameter. Die API wird in diesem Lauf nicht geändert.

## Entscheidung
1. **Baustein `DatenTabelle<T>`** (`shared/ui/daten-tabelle.tsx`) auf Basis von shadcn `table` und `card`, mit Spaltendefinitionen (Titel, Zelle, Breite, Ausrichtung, Rolle in der Karte, optional Sortierwert). Die Caption (sr-only) bleibt der zugängliche Name.
2. **Kartenansicht per Media-Query, nicht per CSS-Doppelung:**
   - Unterhalb von `kartenUnter` (`md` = 768 px, bei mehr als fünf Spalten `lg` = 1024 px) rendert der Baustein `<ul aria-label="{Caption}">` mit je einer Karte: Titel h3, `dl` der übrigen Spalten, Aktionen.
   - Es ist immer nur eine Darstellung im DOM (`useMedienabfrage`), damit Rollen und Namen eindeutig bleiben. In Vitest gilt Desktop (`stubMatchMedia`).
3. **Sortierung (F7):**
   - Interaktiv nur bei vollständig geladenen Listen, clientseitig. Ein Button im `th` trägt den Spaltentitel als Namen, der Pfeil ist `aria-hidden`, den Zustand trägt `aria-sort`. Der Text des `th` bleibt der Titel.
   - Seitenweise Listen zeigen die feste Serversortierung nur per `aria-sort` an der betroffenen Spalte.
   - Sortieren innerhalb einer Seite gibt es nicht.
4. **Filterleiste** (`shared/ui/filterleiste.tsx`):
   - Filter werden über bestehende Query-Parameter der API angewendet, darunter neu im UI `status` der Ausgabehistorie (F8). Aktive Filter erscheinen als Chips in `<ul aria-label="Aktive Filter">` mit dem Text „{Filter}: {Wert}“ und dem Button „Filter „…“ entfernen“ (≥ 40 px).
   - Nach dem Entfernen geht der Fokus auf den nächsten Chip oder das erste Filterbedienelement. Neu geladen wird ab Seite 1.
5. **Paginierung:** `Blaettern` (Bestand) bleibt der einzige Paginierungsbaustein.
6. **Zeilenklick:**
   - Nur wo es ein Ziel gibt. Ein Mausklick in die Zeile löst den Link der Zeile aus.
   - Die Logik aus `CoinListe` (keine Folgeklicks, keine Zusatztasten, kein markierter Text, kein Klick auf andere Bedienelemente) wandert als `useZeilenklick` nach `shared/lib/hooks`.
   - Die Zeile hat keinen Tab-Stopp, per Tastatur dient der Link. In Karten ist der Titel der Link.
7. **Breiten:** Nummern und Zahlen schmal mit `tabular-nums`, Freitexte breit mit Umbruch, Aktionen schmal rechts. Links in Tabellen und Karten sind ≥ 40 px hoch.
8. **Geltungsbereich (F6):** Exemplare, Ausgabehistorie, Benutzer, Audit-Log, Vorlagenversionen. Katalog `/coins` und die Listen der Startseiten-Blöcke folgen im nächsten Lauf.

## Betrachtete Alternativen
- **TanStack Table:** mächtig, aber eine neue Abhängigkeit. Für fünf kleine Tabellen ohne clientseitiges Paging ist sie nicht nötig. Verworfen.
- **Tabelle und Karten gleichzeitig im DOM, per CSS umgeschaltet:** doppelte Rollen und Namen (Tests, Screenreader in Sonderfällen, Fokus). Verworfen.
- **Horizontal scrollende Tabelle auch auf Smartphones** (Stand design-fundament AK-15): erfüllt „keine abgeschnittene Tabelle“ nur formal und ist bei 9 Spalten kaum bedienbar. Verworfen für umgebaute Tabellen. Für Katalog und Bausteinbeispiel bleibt AK-15.
- **Sortieren innerhalb der geladenen Seite:** suggeriert eine Gesamtsortierung. Verworfen.
- **Zeile als fokussierbares Element (`tabIndex=0`, Enter):** doppelter Tab-Stopp neben dem Link. Verworfen.

## Folgen
- Serverseitige Sortierung kommt erst mit einer API-Erweiterung (eigener Lauf).
- Katalog `/coins` und Startseiten-Listen übernehmen das Muster im nächsten Lauf. `CoinListe` nutzt schon jetzt `useZeilenklick`, ohne sichtbare Änderung.
