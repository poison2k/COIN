# ADR-0035: Gestaltungsregeln als Tailwind-Theme-Tokens – Palette, Schrift, Raster, Hell/Dunkel

Status: Angenommen (Entscheidungen des Auftraggebers vom 2026-11-13, design-fundament D3, D12) · Datum: 2026-11-13 · Feature: [design-fundament](../features/design-fundament.md) · Ergänzt: [ADR-0009](0009-ui-basis-shadcn-base-ui-tailwind.md)

## Kontext
Die Oberfläche soll einheitlich, sachlich und behördentauglich wirken. Die Vorgabe: Farben, Schriftgrößen, Abstände, Radien und Schatten zentral über Tailwind-4-Theme-Variablen, Kontrast für Text ≥ 4,5:1 (WCAG 2.1 AA), kein Hartkodieren in Komponenten, Hell/Dunkel „über das bestehende Theme-Paket (`@stack-lib/theme`), falls es dafür ausreicht“.

Ist-Stand: `web/src/app/styles/index.css` enthält die shadcn-Tokens (`base-nova`, Basisfarbe `neutral`, reines Grau, Primärfarbe fast schwarz). `@stack-lib/theme` gibt es nicht: ADR-0009 hat es durch den shadcn-Theme-Provider ersetzt (`shared/lib/theme`, Klasse `light`/`dark` auf `<html>`, `localStorage` `coin-theme`), und `web/src/app/abhaengigkeiten.test.ts` verbietet `@stack-lib/*`. Im Code gibt es fünf hartkodierte Farben (`bg-black/10` in drei Overlays, `bg-white` hinter Logos) und Fokusringe mit 50 % Deckkraft (`ring-ring/50`, `outline-ring/50`), deren Kontrast nicht gesichert ist.

## Entscheidung
1. **Hell/Dunkel bleibt beim bestehenden Verfahren** (ADR-0009): `ThemeProvider` und `useTheme` aus `shared/lib/theme`, Umschalter `features/theme-umschalten` (Hell/Dunkel/System). Kein neues Paket. Zusätzlich `color-scheme: light` bzw. `dark`, damit native Bedienelemente und Scrollleisten passen.
2. **Eine einzige Theme-Datei:** `web/src/app/styles/index.css`. Nur dort stehen Farbwerte. Die Tailwind-Standardpalette wird abgeschaltet (`--color-*: initial;` in `@theme`), damit Klassen wie `bg-red-500`, `bg-white` oder `text-black` keine Wirkung haben. Farben werden als 6-stelliges Hex (`#rrggbb`) angegeben, Overlays als 8-stelliges Hex mit Deckkraft. So kann ein Test die Kontraste direkt aus der Datei berechnen.
3. **Semantische Token-Namen** (shadcn-Namen bleiben, weil die Komponenten sie verwenden; neu sind die Status-, Hover-, Overlay- und Logo-Tokens). Primärfarbe ist ein ruhiges Marineblau (D3). Werte und Kontraste (WCAG-Formel, gerundet):

   | Token | Hell | Dunkel | Verwendung |
   |---|---|---|---|
   | `--background` | `#ffffff` | `#0f172a` | Seitenhintergrund |
   | `--foreground` | `#0f172a` | `#f1f5f9` | Text (hell 17,85:1, dunkel 16,30:1 auf `background`) |
   | `--card`, `--popover` | `#ffffff` | `#1e293b` | Karten, Menüs, Dialoge |
   | `--card-foreground`, `--popover-foreground` | `#0f172a` | `#f1f5f9` | dunkel 13,35:1 auf `card` |
   | `--primary` | `#1e40af` | `#93c5fd` | Primärfarbe, Links (hell 8,72:1 auf Weiß, dunkel 9,90:1 / 8,11:1 auf `background`/`card`) |
   | `--primary-foreground` | `#ffffff` | `#0f172a` | Text auf Primär (8,72:1 / 9,90:1) |
   | `--primary-hover` | `#1e3a8a` | `#bfdbfe` | Hover auf Primär (10,36:1 / 12,56:1 mit `primary-foreground`) |
   | `--secondary`, `--muted` | `#f1f5f9` | `#1e293b` | ruhige Flächen |
   | `--secondary-foreground` | `#0f172a` | `#f1f5f9` | 16,30:1 / 13,35:1 |
   | `--muted-foreground` | `#475569` | `#94a3b8` | Nebentext (hell 7,58:1 auf Weiß, 6,92:1 auf `muted`; dunkel 6,96:1 / 5,71:1) |
   | `--accent` | `#e2e8f0` | `#334155` | Hover, aktiver Menüpunkt |
   | `--accent-foreground` | `#0f172a` | `#f1f5f9` | 14,48:1 / 9,45:1 |
   | `--destructive` | `#b91c1c` | `#f87171` | Fehler (hell 6,47:1 auf Weiß; dunkel 6,45:1 / 5,29:1) |
   | `--destructive-foreground` | `#ffffff` | `#0f172a` | Text auf Fehlerfläche (6,47:1 / 6,45:1) |
   | `--destructive-subtle` | `#fef2f2` | `#450a0a` | Fehlerbanner (Text `destructive`: 5,91:1 / 5,84:1) |
   | `--success` | `#15803d` | `#4ade80` | Erfolg (5,02:1; dunkel 10,24:1 / 8,39:1) |
   | `--success-foreground` | `#ffffff` | `#0f172a` | 5,02:1 / 10,24:1 |
   | `--success-subtle` | `#f0fdf4` | `#052e16` | Erfolgsbanner (4,79:1 / 8,55:1) |
   | `--warning` | `#b45309` | `#fbbf24` | Warnung (5,02:1; dunkel 10,69:1 / 8,76:1) |
   | `--warning-foreground` | `#ffffff` | `#0f172a` | 5,02:1 / 10,69:1 |
   | `--warning-subtle` | `#fffbeb` | `#451a03` | Warnbanner (4,84:1 / 8,97:1) |
   | `--info` | `#0369a1` | `#38bdf8` | Information (5,93:1; dunkel 8,33:1 / 6,83:1) |
   | `--info-foreground` | `#ffffff` | `#0f172a` | 5,93:1 / 8,33:1 |
   | `--info-subtle` | `#f0f9ff` | `#082f49` | Infobanner (5,57:1 / 6,48:1) |
   | `--border` | `#e2e8f0` | `#334155` | nur dekorative Trennlinien |
   | `--input` | `#64748b` | `#64748b` | Rahmen von Eingabefeldern (≥ 3:1 nach WCAG 1.4.11: hell 4,76:1, dunkel 3,75:1 / 3,07:1) |
   | `--ring` | `#1d4ed8` | `#60a5fa` | Fokusring (hell 6,70:1, dunkel 7,02:1 / 5,75:1) |
   | `--sidebar` | `#f8fafc` | `#0f172a` | Seitenleiste |
   | `--sidebar-foreground` | `#0f172a` | `#f1f5f9` | 17,06:1 / 16,30:1 |
   | `--sidebar-accent` | `#e2e8f0` | `#1e293b` | aktiver Menüpunkt (Text 14,48:1 / 13,35:1) |
   | `--sidebar-accent-foreground` | `#0f172a` | `#f1f5f9` | |
   | `--sidebar-primary`, `--sidebar-primary-foreground` | wie `primary` | wie `primary` | Markierungsbalken |
   | `--sidebar-border` | `#e2e8f0` | `#334155` | |
   | `--sidebar-ring` | `#1d4ed8` | `#60a5fa` | |
   | `--overlay` | `#0f172a66` | `#020617a6` | Hintergrund hinter Dialog/Sheet |
   | `--logo-surface` | `#ffffff` | `#ffffff` | Fläche hinter Logos (Logos sind für hellen Grund gestaltet) |

   Statusfarben als Text nur auf `background`, `card`, `muted` oder der eigenen `*-subtle`-Fläche, nie auf `accent` (dunkel z. B. `destructive` auf `accent` nur 3,74:1). Die `chart-*`-Tokens bleiben ungenutzt und neutral.
4. **Schrift:** Geist Variable (D12; bereits über `@fontsource-variable/geist` eingebunden, lokal ausgeliefert, kein CDN). Grundgröße 16 px. Erlaubte Stufen sind `text-xs` 12/16, `text-sm` 14/20, `text-base` 16/24, `text-lg` 18/28, `text-xl` 20/28, `text-2xl` 24/32 und `text-3xl` 30/36 (px Größe/Zeilenhöhe). Größere Stufen werden per `--text-4xl` … `--text-9xl: initial` abgeschaltet. Gewichte 400, 500 und 600. Zuordnung: Seitentitel (h1) `text-2xl md:text-3xl font-semibold tracking-tight`, Abschnitt (h2) `text-xl font-semibold`, Unterabschnitt (h3) `text-lg font-medium`, Fließtext `text-base`, dichte Bedienelemente und Tabellen `text-sm`, Metadaten und Badges `text-xs`. Zahlenspalten `tabular-nums`. Eine BundesSans o. Ä. ist lizenzpflichtig und wird nicht verwendet.
5. **Abstandsraster:** `--spacing: 0.25rem` (4 px). Abstände zwischen Layoutteilen (Seitenrand, Abstand zwischen Karten und Abschnitten) nutzen das 8-px-Raster (`2, 4, 6, 8, 10, 12, 16` → 8 bis 64 px). Der 4-px-Schritt (`1`, `3`, `5`) ist nur innerhalb von Bausteinen erlaubt. Beliebige Werte (`p-[13px]`, `gap-[0.3rem]`) sind verboten (Code-Test, ADR-0037).
6. **Radien:** `--radius: 0.5rem`. Daraus ergeben sich `--radius-sm` 0,25rem, `--radius-md` 0,375rem, `--radius-lg` 0,5rem, `--radius-xl` 0,75rem (fest angegeben statt Multiplikatoren). Badges `rounded-full`.
7. **Schatten** (zurückhaltend, nur im Theme): `--shadow-xs: 0 1px 2px 0 #0f172a0d`, `--shadow-sm: 0 1px 3px 0 #0f172a14, 0 1px 2px -1px #0f172a14`, `--shadow-md: 0 4px 6px -1px #0f172a14, 0 2px 4px -2px #0f172a0f`. Karten haben einen Rahmen plus `shadow-xs`, Menüs und Dialoge `shadow-md`. Im dunklen Modus trennt vor allem der Rahmen.
8. **Layout-Tokens:** `--container-page: 72rem` (`max-w-page`, Inhaltsbreite), `--container-reading: 45rem` (`max-w-reading`, Formulare und Fließtext).
9. **Fokus:** Fokusindikatoren nutzen `ring`/`outline` in voller Deckkraft (`ring-2 ring-ring ring-offset-2 ring-offset-background` bzw. `outline-2 outline-offset-2 outline-ring`), nie `ring-ring/NN`.
10. **Bewegung:** Übergänge bis 200 ms nur für Farbe, Deckkraft und Transform. Bei `prefers-reduced-motion: reduce` werden Animationen und Übergänge global abgeschaltet. `framer-motion` wird nicht verwendet.

## Betrachtete Alternativen
- **`@stack-lib/theme`:** nicht verfügbar (ADR-0009), per Test ausgeschlossen. Verworfen.
- **OKLCH-Werte wie bisher:** gleichwertig darstellbar, aber der Kontrast lässt sich im Test nur mit Farbraumumrechnung prüfen. Hex macht die Prüfung einfach und nachvollziehbar. Verworfen.
- **Standardpalette von Tailwind behalten und nur per Test verbieten:** Ein Verstoß würde dann trotzdem gerendert. Das Abschalten ist zusätzlich wirksam. Verworfen.
- **Kräftige Primärfarbe aus einem Corporate Design:** Ein verbindliches CD liegt nicht vor. Das Marineblau lässt sich später allein über die Token-Werte tauschen (D3). Verworfen.

## Folgen
- Alle Komponenten erhalten das neue Erscheinungsbild allein über die Tokens. Die drei Overlays nutzen `bg-overlay`, die Logo-Flächen `bg-logo-surface`.
- Ein späterer Wechsel der Primärfarbe ändert nur `index.css`. Der Kontrasttest (ADR-0037) sichert die Werte ab.
- Neue Tokens brauchen einen Eintrag in dieser Tabelle und im Kontrasttest.

## Nachtrag (2026-11-13, Umsetzung)
- **Schatten:** `index.css` setzt `--shadow-*: initial` und definiert danach nur `--shadow-xs`, `--shadow-sm` und `--shadow-md` (Punkt 7). Andere Schattenstufen von Tailwind erzeugen keine Regel.
- **`bg-muted` auf Karten im dunklen Modus:** `--muted` und `--card` sind dunkel gleich (`#1e293b`). Flächen mit `bg-muted` innerhalb von Karten (z. B. Kartenfuß, Dialogfuß, Icon-Fläche im Leerzustand, Platzhalterbild in „Neueste Coins“) werden deshalb über einen Rahmen (`border`/`border-t`) abgehoben. Die Token-Werte bleiben unverändert.
- **Skeleton:** Die Ladeblöcke (`shared/ui/skeleton.tsx`) nutzen `bg-accent` statt `bg-muted`, damit sie auf Karten hell und dunkel sichtbar sind.
