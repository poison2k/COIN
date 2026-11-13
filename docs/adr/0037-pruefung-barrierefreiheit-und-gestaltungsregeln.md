# ADR-0037: Automatische Prüfung von Barrierefreiheit und Gestaltungsregeln – `@axe-core/playwright`, Code-Tests für Farben, Abstände und Kontrast

Status: Angenommen (Entscheidungen des Auftraggebers vom 2026-11-13, design-fundament D1–D13) · Datum: 2026-11-13 · Feature: [design-fundament](../features/design-fundament.md) · Ergänzt: [ADR-0011](0011-frontend-pruefwerkzeuge.md), [ADR-0007](0007-systemtests-mit-wegwerf-datenbank.md)

## Kontext
Abnahmekriterien des Auftraggebers: Eine automatische Barrierefreiheitsprüfung (axe über Playwright) meldet auf allen Seiten keine schwerwiegenden Verstöße. Keine Seite scrollt bei 360 px horizontal. Die Navigation ist per Tastatur bedienbar. Außerhalb der Theme-Definition steht keine hartkodierte Farbe (Prüfung per Suche). Neue Bibliotheken nur mit ADR.

## Entscheidung
1. **`@axe-core/playwright` als devDependency** in `web/` (UI-Tests) und `e2e/` (Systemtests), aktuelle 4.x-Version mit `^` wie die übrigen Pakete. Nur zur Testzeit, nie im Bundle. Lizenz von axe-core: MPL-2.0. Das ist unkritisch, weil das Paket nicht ausgeliefert wird.
   - Konfiguration: `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])`.
   - Als Fehler zählen Verstöße mit `impact` `serious` oder `critical`. Regeln werden nicht abgeschaltet (`disableRules`/`exclude` verboten). Eine Ausnahme bräuchte einen Nachtrag zu diesem ADR mit Begründung.
   - Die Testausgabe nennt Regel-Id, Selektor und Hilfe-URL, nie Seiteninhalte mit Personendaten (UI-Tests haben nur synthetische Daten).
2. **Code-Test „Gestaltungsregeln“** (Vitest, `web/src/app/gestaltungsregeln.test.ts`, gleiches Muster wie `abhaengigkeiten.test.ts` mit `import.meta.glob('?raw')`) über alle `web/src/**/*.{ts,tsx,css}` außer Testdateien und außer `src/app/styles/index.css`. Er findet:
   - Hex-Farben: `(?<![\w&/])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b`;
   - Farbfunktionen: `\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(`;
   - Tailwind-Palettenklassen mit beliebigen Varianten-Präfixen: `(?:bg|text|border(?:-[xytrblse])?|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|divide|shadow|inset-shadow|accent|caret|placeholder)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe)-\d{2,3}\b` sowie `-(?:black|white)\b` mit denselben Präfixen;
   - beliebige Farbwerte in Klassen: `-\[(?:#|rgba?\(|hsla?\(|oklch\(|color-mix\()`;
   - Fokus mit Deckkraft: `\b(?:ring|outline)-ring/\d+`;
   - beliebige Abstände: `\b-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end)-\[`.

   Ausnahmen stehen als Liste `{ datei, muster, begruendung }` im Test. Zu Beginn ist sie leer. Jede neue Ausnahme braucht eine Begründung und das Review. Der Test prüft seine Muster zusätzlich an Positiv- und Negativbeispielen (z. B. `bg-red-500`, `hover:text-white`, `bg-[#fff]`, `p-[13px]`, `ring-ring/50` werden gefunden; `bg-primary`, `text-destructive`, `bg-overlay`, `href="#inhalt"`, `size-[18px]`, `grid-cols-[12rem_1fr]` nicht). Die Anzahl der Treffer (soll 0 sein) steht im QA-Bericht.
3. **Kontrasttest** (Vitest, `web/src/app/kontrast.test.ts`): liest `index.css`, nimmt die Hex-Werte aus `:root` und `.dark`, rechnet nach der WCAG-2.1-Formel und prüft die Paare aus dem Feature-Entwurf (Abschnitt 4.2): Text ≥ 4,5:1, Eingaberahmen und Fokusring ≥ 3:1. Fehlt ein Token, ist das ein Fehler.
4. **Playwright-UI-Tests** (`web/ui-tests`, gemockte API, ADR-0011): `barrierefreiheit.spec.ts` (axe), `responsiv.spec.ts` (kein horizontales Scrollen bei 360/768/1280 px, Klickflächen ≥ 40 px), `tastatur.spec.ts` (Navigation per Tastatur, sichtbarer Fokus), `bausteine.spec.ts`. Dazu `screenshots.spec.ts`, das nur bei `COIN_SCREENSHOTS=1` läuft und PNGs nach `docs/design/ablage/` schreibt (eingecheckt, Entscheidung D7).
5. **Systemtest** (`e2e/tests/design-fundament.spec.ts`, echte API, ADR-0007): axe und 360-px-Prüfung auf den Hauptseiten mit echten Daten, hell und dunkel.
6. **Build-Prüfung** `web/scripts/pruefe-produktionsbuild.mjs` (ADR-0036 Punkt 8). Sie läuft als letzter Schritt von `npm run build`.

## Betrachtete Alternativen
- **`axe-playwright` (Drittanbieter-Wrapper) oder `jest-axe`/`vitest-axe` in jsdom:** jsdom berechnet weder Layout noch Farben, deshalb fehlt dort die Kontrastprüfung. Der offizielle Deque-Wrapper ist schlanker. Verworfen.
- **Lighthouse CI / pa11y:** zusätzliche Laufzeitumgebung und andere Regelbasis. Verworfen.
- **Stylelint/ESLint-Regel gegen Farben:** zusätzliche Plugins und Konfiguration. Der Code-Test folgt dem bestehenden Muster und braucht keine Abhängigkeit. Verworfen.

## Folgen
- Neue Seiten müssen in `barrierefreiheit.spec.ts` und `responsiv.spec.ts` aufgenommen werden (Seitenliste im Test).
- axe findet nur einen Teil der WCAG-Verstöße. Tastaturtest, Kontrasttest und Review ergänzen die Prüfung, ersetzen aber keinen manuellen BITV-Test.
- Die UI-Tests werden länger (Seiten × Themes × Breiten). Sie laufen weiter nicht im Pre-Commit-Hook (ADR-0011).
