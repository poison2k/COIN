# ADR-0009: UI-Basis shadcn/ui (Base UI) mit Tailwind v4 statt @stack-lib

Status: Angenommen (Ersatz für @stack-lib vom Auftraggeber entschieden) · Datum: 2026-10-05 · Feature: frontend-grundgeruest

## Kontext
Die Vorgabe nennt `@stack-lib/sidebar` und `@stack-lib/theme`. Beide sind im öffentlichen npm-Index nicht verfügbar (404). Laut Prüfung handelt es sich um eine private shadcn-Registry. Gesetzt sind außerdem Tailwind v4, `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge` und `lucide-react`, also der Baukasten von shadcn/ui in der Base-UI-Variante.

## Entscheidung
- Statt `@stack-lib` wird **Original-shadcn/ui in der Base-UI-Variante** verwendet, eingerichtet per `npx shadcn@latest init/add` mit `components.json`:
  - die Komponente `sidebar` mit ihren registryDependencies,
  - der Theme-Provider nach der shadcn-Doku „Dark mode – Vite“.
- Ist eine benötigte Komponente für Base UI nicht über die CLI verfügbar, wird gestoppt und gemeldet. Es gibt keinen Eigenbau.
- Tailwind v4 läuft über `@tailwindcss/vite`, Animationen über `tw-animate-css`. Der Einstieg ist `src/app/styles/index.css` mit den shadcn-Tokens für hell und dunkel.
- Der generierte Code gehört dem Projekt und liegt in `src/shared/ui` (Stil `base-nova`, Basisfarbe `neutral`). Umgesetzte Nacharbeiten:
  - `cn`-Import: Die CLI erzeugt `import { cn } from "cn"`; korrigiert auf `@/shared/lib/cn`.
  - Sidebar: Cookie `sidebar_state` entfernt, der Zustand wird nicht persistiert.
  - Deutsche Texte, auch `sr-only`, `aria-label`, `title`, Sheet-Titel und -Beschreibung sowie Fehlermeldungen.
  - `use-mobile` (`src/shared/lib/hooks`) mit `useSyncExternalStore` statt `setState` im Effect (Lint-Regel `react-hooks`).
  - Eingeklappte Sidebar (Desktop, `offcanvas`) ist `inert`, damit verborgene Links nicht fokussierbar sind (WCAG 2.4.7).
  - Strg/Cmd+B schaltet die Sidebar nicht um, wenn der Fokus in einem Eingabefeld liegt.
  - `alert-dialog.tsx` (Feature rollen-benutzerverwaltung): eigene Tab-Falle im Popup. Tab am letzten bzw. Umschalt+Tab am ersten fokussierbaren Element springt sofort zum anderen Ende; Base UI fängt den Fokus sonst erst einen Frame später über Fokuswächter außerhalb des Popups ab. Grenze: Der Selektor (`button:not([disabled])`, `[href]`, `input`, `select`, `textarea`, `[tabindex]` ≠ -1) berücksichtigt keine Sichtbarkeit; unsichtbare, aber fokussierbare Elemente im Dialog würden als erstes oder letztes Element gezählt. Die heutigen Dialoge enthalten nur zwei sichtbare Buttons.
  - `select.tsx`: Pfeiltasten laufen am Listenende um (unten → erste, oben → letzte Option). Base UI hält am Rand an. Reiner Komfort für die Tastaturbedienung.
  - Buttons, die während einer Anfrage gesperrt sind, nutzen `focusableWhenDisabled` (z. B. `StatusAendern` in `features/benutzer-status-aendern`), damit der Fokus beim Sperren nicht auf `body` fällt.
  - App-Shell (`widgets/app-shell`): Die Kopfzeile steht als eigenes `<header>` (banner-Landmark) neben `<main>`, statt in `SidebarInset` zu liegen. `<main>` enthält nur den Seiteninhalt.
  - Lint-Sauberkeit und Prettier-Formatierung.
- Weitere per CLI übernommene Komponenten (Base UI): `select`, `alert-dialog`, `badge`, `tabs`. `shared/ui/blaettern.tsx` ist eine eigene Komponente aus shadcn-Bausteinen (`Button`), keine CLI-Komponente.
- Zusätzliche Pakete aus der shadcn-Einrichtung: `@fontsource-variable/geist` (Schrift) und `shadcn` als devDependency, weil `src/app/styles/index.css` `shadcn/tailwind.css` importiert.
- Theme:
  - Klasse `light`/`dark` auf `<html>`,
  - Default „System“,
  - Persistenz in localStorage (`coin-theme`),
  - Umschalter mit Hell/Dunkel/System (`features/theme-umschalten`), Provider und Hook in `shared/lib/theme`.
- Die Pilot-Komponenten übernehmen `Button`, `Input`, `Textarea`, `Label` und `Table` aus `shared/ui`, solange Element und Semantik gleich bleiben. Die unveränderten Tests haben Vorrang.

## Folgen
- Es gibt keine Abhängigkeit zu einer privaten Registry und keine Zugangsdaten.
- Updates von shadcn kommen nicht automatisch. Sie sind ein bewusster Schritt (`shadcn add --overwrite` und Diff-Prüfung). Ein erneutes `shadcn add` erzeugt wieder den falschen `cn`-Import und überschreibt die Nacharbeiten oben.
- `npm audit` meldet beim Abschluss des Features 9 Befunde der Stufe high, ausschließlich in devDependencies (über `steiger` → `micromatch`, `shadcn` → `fast-glob` und `ts-morph`). `npm audit --omit=dev` meldet 0. `npm audit fix --force` wird nicht angewendet, weil es `steiger` auf eine ältere Version herabstufen würde. Die Updates der betroffenen Pakete werden beobachtet.
- Werden die `@stack-lib`-Pakete später verfügbar, ist ein Wechsel ein eigenes Feature mit eigener ADR.
