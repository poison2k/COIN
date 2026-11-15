# ADR-0039: Formularmuster und Validierung ohne Formular-Bibliothek

Status: Angenommen (Entscheidungen des Auftraggebers vom 2026-11-14, formulare-detailseiten F1–F10) · Datum: 2026-11-14 · Feature: [formulare-detailseiten](../features/formulare-detailseiten.md) · Ergänzt: [ADR-0036](0036-layoutprinzip-app-shell-und-bausteine.md) Punkt 7, [ADR-0009](0009-ui-basis-shadcn-base-ui-tailwind.md)

## Kontext
Die Formulare (Coin anlegen und bearbeiten, Ausgabe erfassen, Hologrammnummer, Auflage, Storno, Vorlage hochladen, Startseite) bauen Label, Hilfe, Fehler, Fokus und Sendesperre jeweils selbst. Pflichtfelder sind uneinheitlich gekennzeichnet. Geprüft wird nur beim Absenden, eine Zusammenfassung gibt es nur auf der Startseite. Gefordert sind:
- Abschnitte und Pflichtkennzeichnung;
- Fehler erst nach Verlassen des Felds, Fokus auf den ersten Fehler, Zusammenfassung bei mehreren Fehlern;
- eine Aktionsleiste mit Ladezustand und Schutz vor Doppelklicks.

Die Prüfregeln liegen schon als reine Funktionen in den Slices (`validiereCoin`, `validiereStammdaten`, `validiereAusgabe`, `pruefeHologrammnummer`, `pruefeVorlagendatei`, `validiere` der Startseite).

ADR-0036 Punkt 7 erlaubt eigene Bausteine nur als Komposition ohne eigene Interaktionslogik. Validierungs-Timing und Fokusführung sind aber Interaktionslogik.

## Entscheidung
1. **Keine Formular-Bibliothek** (weder `react-hook-form` noch TanStack Form noch `zod`). Stattdessen ein kleiner Hook `useFormular` in `shared/lib/formular`.
   - Er führt Werte, Ausgangswerte, „verlassen“, Client- und Server-Fehler und einen „abgesendet“-Zustand.
   - Er bekommt die bestehende Prüffunktion des Slices und die Feldreihenfolge.
   - Er liefert je Feld `value`, `onChange`, `onBlur` und `fehler` für `Formularfeld`, dazu `geaendert` (für ADR-0040), `absenden(handler)` und `fokussiereErstenFehler`.
   - Dazu kommt `useSendeSperre` (synchrone Sperre per `useRef`, Zustand für `Button laedt`).
2. **Regeln für die Anzeige:**
   - Ein Fehler erscheint erst nach dem Verlassen eines geänderten Felds oder beim Absenden.
   - Er verschwindet bei der Eingabe, sobald der Wert gültig ist. Ein anderer Fehler erscheint erst beim nächsten Verlassen.
   - Server-Feldfehler bleiben bis zur Änderung des Felds.
   - Beim Absenden mit Fehlern: kein Request, Fokus auf das erste fehlerhafte Feld in Formularreihenfolge. Ab zwei Feldfehlern steht oben die `Fehlerzusammenfassung` („Bitte die markierten Eingaben prüfen.“, Links auf die Felder, `role="alert"`).
3. **Pflichtkennzeichnung:** `Formularfeld pflicht` zeigt sichtbar „(Pflicht)“ (`aria-hidden`) und gibt Screenreadern „(Pflichtfeld)“ (sr-only), dazu `required`. Das ersetzt design-fundament Abweichung 4: Im zugänglichen Namen steht jetzt „(Pflichtfeld)“ wie auf `/pruefung` und in den bestehenden Tests. Optionale Felder behalten „(optional)“ im Label.
4. **Bausteine mit Interaktionslogik** sind in `shared` zulässig, wenn sie fachfrei sind, deutsche Props haben, nur shadcn-/Base-UI-Teile und bestehende Abhängigkeiten nutzen und auf der Bausteinseite gezeigt werden. Das gilt für `useFormular`, `useSendeSperre`, `Fehlerzusammenfassung`, `FormularAbschnitt` (`fieldset` + `legend` mit Überschrift, ein- oder zweispaltig) und `Aktionsleiste` (Abbrechen links, Hauptaktion rechts; unter 768 px `sticky bottom-0`, mit `scroll-padding` gegen Verdecken). Damit wird ADR-0036 Punkt 7 erweitert.
5. **Ladezustand:** Hauptaktionen nutzen `Button laedt` (fokussierbar gesperrt). Natives `disabled` für Absende-Buttons entfällt.

## Betrachtete Alternativen
- **react-hook-form / TanStack Form:** verbreitet, aber eine neue Laufzeitabhängigkeit. Sie würde die vorhandenen Prüffunktionen umhüllen statt ersetzen. Fokus- und Meldungsregeln müssten wir trotzdem selbst bauen. Verworfen.
- **Schema-Bibliothek (zod/valibot):** Die Regeln sind schon als Funktionen da und teilen ihre Texte mit dem Backend-Vertrag. Eine zweite Quelle für Regeln entstünde. Verworfen.
- **Validierung bei jeder Eingabe:** meldet Fehler, bevor der Benutzer fertig ist. Das widerspricht der Anforderung. Verworfen.
- **Fokus auf die Zusammenfassung statt aufs Feld (GOV.UK-Muster):** Die Anforderung verlangt den Fokus auf den ersten Fehler. Die Zusammenfassung wird per `role="alert"` angesagt. Verworfen.
- **„(Pflicht)“ im zugänglichen Namen beibehalten:** würde die Prüftests der Ausgabe-, Hologramm- und Prüfformulare (`/Pflichtfeld/`) rot machen. Verworfen.

## Folgen
- Neue Formulare nutzen `useFormular`, `Formularfeld`, `FormularAbschnitt`, `Fehlerzusammenfassung` und `Aktionsleiste`. Eigene Fehler-, Hilfe- oder Pflicht-Markup in Features ist nicht vorgesehen.
- Bestehende Prüffunktionen bleiben die einzige Quelle der Regeln, ihre Tests bleiben unverändert.
- Die Prüfmaske `/pruefung` übernimmt das Muster im nächsten Lauf.

## Nachtrag (Umsetzung)
- Verlässt man ein Feld, während die Maus auf einem Bedienelement gedrückt ist (z. B. „Speichern“), läuft die Prüfung erst nach dem Klick (spätestens nach 1 s). Sonst würde die Fehlermeldung das Layout verschieben und der Klick ginge verloren. Per Tastatur wird sofort geprüft.
- Umgesetzt in `shared/lib/formular/zeiger.ts` (`pruefeNachZeigerklick`). Die Datei registriert beim Import als Seiteneffekt globale Listener auf `document` (`pointerdown`, `click`, `pointercancel`, Capture-Phase) und hält einen modulweiten Zustand. Die Listener werden nie entfernt. Ohne `document` (z. B. SSR) entfällt die Verzögerung.
- `useFormular` liefert zusätzlich `versucht`, `zuruecksetzen` und `setzeWert`.
