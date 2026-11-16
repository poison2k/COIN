# ADR-0043: Übersichtsmuster – Startseitenraster ohne Lücken, Katalogansichten, Prüfmaske als zentrierte Arbeitsseite

Status: Angenommen (Entscheidungen des Auftraggebers vom 2026-11-15, startseite-listen-pruefung F1–F7) · Datum: 2026-11-15 · Feature: [startseite-listen-pruefung](../features/startseite-listen-pruefung.md) · Ergänzt: [ADR-0036](0036-layoutprinzip-app-shell-und-bausteine.md) Punkt 1, [ADR-0041](0041-tabellenmuster.md) Punkt 8, [ADR-0030](0030-konfigurationsmodell-der-startseite.md), [ADR-0034](0034-hologrammpruefung-rechte-ratenbegrenzung-audit.md)

## Kontext
- **Startseite:** Die Blöcke stehen in einem festen Raster mit drei Spalten. Deaktivierte Blöcke oder eine getrennte Reihenfolge lassen Zellen leer.
- **Katalog:** Gewünscht sind eine umschaltbare Karten- oder Tabellenansicht, eine Filterleiste und Status-Chips. Die API kennt aber nur `suche` und liefert kein Verfügbarkeitsfeld.
- **Prüfmaske:** Sie soll eine ruhige, zentrale Arbeitsseite werden. ADR-0036 verbietet Seiten eine eigene Maximalbreite und erlaubt `max-w-reading` nur für Formulare und Fließtext.

## Entscheidung
1. **Startseitenraster in Zeilen:**
   - `StartseiteBloecke` bildet aus den aktiven Blöcken in Konfigurationsreihenfolge Zeilen. `kopf`, `infotext` und `kennzahlen` stehen allein.
   - `neueste` und `meistausgegeben` teilen sich ab 1024 px eine zweispaltige Zeile, wenn sie direkt aufeinander folgen. Sonst steht jeder allein.
   - Jede Zeile ist ein eigenes Grid, es gibt kein Raster mit fester Spaltenzahl. Die Abstände sind einheitlich `gap-6`, und Blöcke einer Zeile sind gleich hoch.
   - Die Reihenfolge ändert das Raster nie. Die Zeilenbildung ist eine reine Funktion (`bildeZeilen`) und wird vollständig über alle geordneten Teilmengen getestet.
2. **Katalogansichten:**
   - Tabelle (Bestand, `DatenTabelle` mit fester Ansicht `tabelle`, scrollt bei 360 px im Container; Standard auf allen Breiten, F1) und Karten (`entities/coin/CoinKarten`, Galerie mit Motivbild, Container-Queries).
   - Umschaltung über `Ansichtsumschalter` (shadcn `toggle-group`, Base UI). Ist `toggle-group` für Base UI nicht per CLI verfügbar, besteht der Umschalter aus zwei `Button` mit `aria-pressed` in einer beschrifteten `role="group"`. Diesen Ersatz hat der Auftraggeber freigegeben (2026-11-15); er ist kein Eigenbau mit eigener Interaktionslogik.
   - Gespeichert wird die Wahl nach ADR-0044.
   - Filter nur über vorhandene API-Parameter (Suche als Chip, F2). Status-Chips nur aus vorhandenen Feldern („Auflage unbekannt“, F3).
   - Kein clientseitiges Filtern innerhalb einer Seite.
3. **Prüfmaske als zentrierte Arbeitsseite:**
   - Ausnahme zu ADR-0036 Punkt 1 nur für `/pruefung`: Seitenkopf und Inhalt stehen in einer zentrierten Spalte `mx-auto max-w-reading`. Die Shell setzt Rand und Maximalbreite weiter.
   - Das Ergebnis erscheint als Ergebniskarte (`shared/ui/ergebniskarte`) in der dauerhaften Live-Region. Die vier Ergebnisse sind über Text und Icon unterschieden, die Farbe kommt hinzu.
   - Der Datensatz steht in Gruppen (h3, je eine `dl`), mit genau den Feldern der Antwort wie bisher.
   - Nach jeder Prüfung liegt der Fokus im Nummernfeld, und der Inhalt ist markiert (F4).
   - Requests, Endpunktwahl, Mindestdauer und Ratenbegrenzung bleiben unverändert (ADR-0034).

## Betrachtete Alternativen
- **Raster mit `grid-auto-flow: dense` oder automatisch füllenden Spalten:** Das ändert die sichtbare Reihenfolge gegenüber der DOM- und Konfigurationsreihenfolge (WCAG 1.3.2). Verworfen.
- **Leere Blöcke ausblenden:** Das ändert das Fachverhalten (startseite AK-20, Leertexte). Verworfen.
- **Kartenansicht über die Karten der `DatenTabelle`:** Diese Karten sind Listen von Feldern ohne Bild, für eine Galerie ungeeignet. Verworfen.
- **Karten als Standard unter 768 px:** mobil angenehmer, aber bestehende Tests mit Tabellenbezug würden rot. Verworfen (F1).
- **Verfügbarkeit als Chip im Katalog:** Das braucht je Coin einen Request oder ein neues DTO-Feld (API-Änderung). Verworfen.
- **Fokus nach der Prüfung auf die Ergebniskarte:** Das unterbricht die Serienprüfung. Die Ansage leistet die Live-Region. Verworfen.
- **Feld nach der Prüfung leeren:** Ein Tippfehler wäre dann nicht mehr korrigierbar. Markieren ersetzt beim Tippen ebenso. Verworfen (F4).

## Folgen
- Weitere Arbeitsseiten mit zentrierter Spalte brauchen eine eigene Entscheidung, die Ausnahme gilt nur für `/pruefung`.
- Neue Startseiten-Blöcke müssen in `bildeZeilen` eingeordnet werden (eigene Zeile oder Paar).
- Katalogfilter über die Suche hinaus und Verfügbarkeits-Chips kommen erst mit einer API-Erweiterung.

## Nachträge (2026-11-15, Umsetzung)
- **Ersatz für `toggle-group`:** Der Ersatz wird genutzt. `shared/ui/ansichtsumschalter.tsx` besteht aus zwei `Button` mit `aria-pressed` und sichtbarem Text („Tabelle“, „Karten“, Icons `aria-hidden`) in einer `role="group"` mit `aria-label="Ansicht"`. `toggle-group` und `toggle` sind nicht im Projekt.
- **Combobox-Trigger ohne eigenen Tab-Stopp:** In `shared/ui/combobox.tsx` hat der Button „Vorschläge anzeigen“ `tabIndex={-1}`. Das wirkt global, also auf die Coin-Auswahl der Prüfmaske (`CoinAuswahl`) und den Benutzerfilter des Audit-Logs (`BenutzerFilter`).
  - Grund: Prüfmaske AK-20 verlangt die Tab-Reihenfolge Coin, Hologrammnummer, Prüfen. Enter und Tab springen so direkt weiter.
  - Per Tastatur öffnet die Liste beim Tippen oder mit Pfeil runter im Eingabefeld (WAI-ARIA-Muster Combobox). Maus und virtueller Cursor von Screenreadern erreichen den Trigger weiterhin.
  - Nach `npx shadcn add combobox` muss diese Anpassung erhalten bleiben (ADR-0009).
- **Abweichung von ADR-0036 Punkt 1:** In ADR-0036 ist ein Verweis auf die Ausnahme für `/pruefung` (Punkt 3) nachgetragen.
