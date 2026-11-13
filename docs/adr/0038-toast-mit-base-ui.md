# ADR-0038: Toast-Meldungen mit Base UI Toast statt `sonner`

Status: Angenommen (Entscheidung des Auftraggebers vom 2026-11-13, design-fundament D6) · Datum: 2026-11-13 · Feature: [design-fundament](../features/design-fundament.md) · Ergänzt: [ADR-0009](0009-ui-basis-shadcn-base-ui-tailwind.md)

## Kontext
Die Vorgabe verlangt einen wiederverwendbaren Baustein „Toast“. shadcn/ui bietet dafür die Komponente `sonner`. Sie bringt das npm-Paket `sonner` als neue UI-Bibliothek mit. `@base-ui/react` ist bereits Abhängigkeit und enthält eine zugängliche Toast-Primitive (`@base-ui/react/toast`: Provider, Viewport, Root, Title, Description, Close, `useToastManager`). ADR-0009 verbietet Eigenbauten, wenn shadcn eine passende Komponente hat, und verlangt für neue UI-Bibliotheken ein ADR.

## Entscheidung
1. **Base UI Toast** in `web/src/shared/ui/toast.tsx`. Die Datei setzt nur die Primitive zusammen, ohne eigene Zustandslogik, und wird nach shadcn-Muster mit Tokens gestaltet:
   - `ToastProvider`: umschließt die App-Shell (`widgets/app-shell`), Standard-Zeitlimit 6000 ms, höchstens 3 sichtbare Meldungen.
   - `Toaster`: Viewport mit `aria-label="Benachrichtigungen"`. Auf dem Desktop unten rechts, unter 640 px unten über die volle Breite mit Seitenrand, ohne horizontales Scrollen.
   - `useToast()` liefert `zeige({ titel, beschreibung?, art })` mit `art` aus `'erfolg' | 'info' | 'warnung' | 'fehler'`.
2. **Barrierefreiheit:**
   - Ansage über die Live-Region von Base UI: `erfolg` und `info` höflich, `warnung` und `fehler` mit `priority: 'high'`.
   - `fehler` und `warnung` schließen sich nicht selbst (`timeout: 0`). Die anderen pausieren bei Hover und Fokus.
   - Jeder Toast hat einen Schließen-Button „Meldung schließen“ (≥ 40 × 40 px) und ein Icon je Art (`aria-hidden`). Die Art steht zusätzlich als Text für Screenreader da („Erfolg:“, „Hinweis:“, „Warnung:“, „Fehler:“).
3. **Verwendungsregel:** Toasts ergänzen nur. Meldungen, die eine Handlung verlangen oder Fehler in Formularen beschreiben, stehen immer auf der Seite (Hinweisbanner, Feldfehler). Toasts enthalten nie Empfängerdaten oder andere Personendaten (wie Logs, CLAUDE.md „Sicherheit und Datenschutz“). In diesem Feature werden keine bestehenden Meldungen auf Toasts umgestellt. Toasts erscheinen nur auf der Bausteinseite.

## Betrachtete Alternativen
- **shadcn `sonner`:** shadcn-konform, aber eine neue Abhängigkeit mit eigenen englischen Standardtexten (Containerbeschriftung „Notifications“, Schließen-Label), die einzeln überschrieben werden müssten. Base UI ist bereits die Primitive-Bibliothek des Projekts. Verworfen (Entscheidung D6).
- **Eigenbau mit `aria-live`:** Fokus-, Pausen- und Stapellogik selbst zu bauen ist fehleranfällig und laut ADR-0009 nicht vorgesehen. Verworfen.

## Folgen
- Keine neue Laufzeitabhängigkeit.
- Ein späterer Wechsel zu `sonner` ersetzt nur `shared/ui/toast.tsx` (gleiche Schnittstelle `useToast().zeige`). Dafür ist ein Nachtrag zu diesem ADR nötig.

## Nachtrag (2026-11-13, Umsetzung): Ansage ohne `priority: 'high'`
Ersetzt Punkt 2, erster Spiegelstrich.

**Kontext:** Base UI setzt bei Toasts mit `priority: 'high'` `aria-hidden` auf den Toast und sagt ihn über eine eigene versteckte Region an. Der Schließen-Button liegt dann in einem `aria-hidden`-Bereich (axe `aria-hidden-focus`) und ist für Screenreader nicht erreichbar. Außerdem sagen Screenreader eine Live-Region, die erst mit ihrem Inhalt erscheint, oft nicht an.

**Entscheidung:**
- Alle Arten werden höflich angesagt, kein `priority: 'high'`. `warnung` und `fehler` bleiben dafür stehen, bis sie geschlossen werden (`timeout: 0`, unverändert).
- Die Ansage übernimmt eine eigene, dauerhaft gerenderte unsichtbare Live-Region in `shared/ui/toast.tsx` (`aria-live="polite"`, `aria-atomic="true"`, `sr-only`). Sie hat bewusst keine Rolle, weil Seitentests die Rollen `status` und `region` zählen. Angesagt wird nur eine neu hinzugefügte Meldung (bisher unbekannte Toast-ID), mit Präfix der Art („Fehler: …“). Jede Ansage ist ein neuer Knoten (`key` je Toast-ID), damit auch eine gleichlautende zweite Meldung angesagt wird. Schließen oder Ablaufen ändert die Region nicht.
- Der Viewport „Benachrichtigungen“ hat `aria-live="off"` (keine Doppelansage) und ist ohne Meldung ausgeblendet (`empty:hidden`), damit keine leere Region in der Landmark-Liste steht.
- Der Schließen-Button setzt `aria-hidden={false}`, weil Base UI ihn im gestapelten Zustand sonst ausblendet; die Meldungen stehen untereinander.

**Folgen:** Fehler und Warnungen werden nicht mehr unterbrechend angesagt. Da Toasts nur ergänzen (Punkt 3) und Fehler immer zusätzlich auf der Seite stehen, ist das vertretbar.
