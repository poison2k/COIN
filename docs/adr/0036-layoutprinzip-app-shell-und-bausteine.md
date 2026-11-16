# ADR-0036: Layoutprinzip – App-Shell, Seitenkopf, einheitliche Zustände, Bausteine in `shared/ui`, Bausteinseite nur in Entwicklung

Status: Angenommen (Entscheidungen des Auftraggebers vom 2026-11-13, design-fundament D1, D2, D4, D5, D10, D11) · Datum: 2026-11-13 · Feature: [design-fundament](../features/design-fundament.md) · Ergänzt: [ADR-0008](0008-frontend-struktur-feature-sliced-design.md), [ADR-0009](0009-ui-basis-shadcn-base-ui-tailwind.md), [ADR-0010](0010-tanstack-router-code-basiert.md)

## Kontext
Alle Seiten sollen auf einem gemeinsamen Gerüst aufbauen: gruppierte, einklappbare Seitenleiste mit Icons, Kopfzeile mit Benutzer, Rolle, Theme und Abmelden, ein Inhaltsbereich mit fester Lesebreite und einheitliche Zustände für Laden, Leer und Fehler. Heute legt jede Seite ihren Rahmen selbst fest (`mx-auto max-w-5xl p-6`), und Lade- und Fehlerzustände sind einzelne Absätze. Viele bestehende Tests hängen an der Struktur der Shell: genau ein `<header>` (Selektor `header`), `<nav aria-label="Hauptnavigation">`, Linknamen und Reihenfolge der Sidebar, `inert` bei eingeklappter Sidebar, der Overlay-Dialog „Seitenleiste“ und der Button „Seitenleiste ein-/ausblenden“.

## Entscheidung
1. **Shell-Aufbau** (`widgets/app-shell`), DOM-Reihenfolge: Skip-Link „Zum Inhalt springen“ → Seitenleiste → Kopfzeile (`<header>`, das einzige `<header>` im Dokument) → `<main id="inhalt" tabIndex={-1}>` mit einem inneren Container `mx-auto w-full max-w-page px-4 py-6 md:px-6 md:py-8 lg:px-8`. Seiten setzen keinen eigenen äußeren Rand und keine eigene Maximalbreite mehr. Formulare und Fließtext dürfen innen `max-w-reading` nutzen. Bestehende Tests, die nur wegen des zusätzlichen Tab-Stopps des Skip-Links rot werden, dürfen um diesen einen Tab-Stopp ergänzt werden (D11).
2. **Seitenleiste** (shadcn `sidebar`): eine `<nav aria-label="Hauptnavigation">` mit Gruppen „Übersicht“, „Coins“, „Prüfung“ und „Verwaltung“ (D4, ohne „Ausgaben“). Jede Gruppe hat ein sichtbares Label (`SidebarGroupLabel`, kein Heading) und eine Liste mit `aria-labelledby` auf dieses Label. Gruppen ohne sichtbaren Eintrag werden nicht gerendert. Sichtbarkeit nur aus `berechtigungen` von `/api/me` (wie bisher). Auf dem Desktop wird sie per `offcanvas` eingeklappt: ganz ausgeblendet und `inert`, Zustand nicht gespeichert, Strg/Cmd+B wie bisher (D5). Unter 768 px wird sie zum Sheet-Dialog „Seitenleiste“. Der aktive Eintrag wird nicht nur durch Farbe gezeigt: Hintergrund `sidebar-accent`, 3 px breiter Balken in `sidebar-primary` am linken Rand und `font-semibold`. `aria-current="page"` gibt es nur auf dem exakten Pfad.
3. **Kopfzeile:** links der Seitenleisten-Umschalter, rechts Name und Rolle (Rolle aus `rolle` von `/api/me` über `ROLLEN_ANZEIGE`, nur zur Anzeige, nie für Rechte), Theme-Umschalter und „Abmelden“ bzw. „Anmelden“. Unter 640 px sind Name und Rolle nur für Screenreader vorhanden. Das Präfix „Angemeldet als “ bleibt.
4. **Seitenkopf** (`shared/ui/seitenkopf.tsx`): optionale Brotkrumen, h1, optionale Beschreibung, Aktionen rechts (unter 640 px darunter). Gerendert als `<div>`, nie als `<header>`. Die Brotkrumen nutzen shadcn `breadcrumb` mit `<nav aria-label="Brotkrumen">`. Bestehende Seiten bekommen in diesem Lauf keine Brotkrumen (D1).
5. **Einheitliche Zustände** als Bausteine in `shared/ui`: `Ladeanzeige` (Skeleton mit `role="status"` und Text nur für Screenreader), `Leerzustand` (shadcn `empty`: Titel, Erklärung, Aktion) und `Fehlerzustand` (Hinweisbanner `role="alert"` mit „Erneut versuchen“). Sie ersetzen Zustände auf Seitenebene ohne Textänderung. Zustände in Widgets folgen mit deren Umbau (D2).
6. **Neue shadcn-Komponenten per CLI** (Base UI, Stil `base-nova`): `checkbox`, `field`, `breadcrumb`, `empty`, `spinner`. Nacharbeiten wie in ADR-0009: `cn`-Import, deutsche Texte (`breadcrumb`: `aria-label` „Brotkrumen“, sr-only „Weitere Seiten“; `spinner`: `aria-label` „Wird geladen“), keine Cookies. Ist eine dieser Komponenten für Base UI nicht über die CLI verfügbar, wird gestoppt und gemeldet. Es gibt keinen Eigenbau (ADR-0009).
7. **Eigene Bausteine** nur als Komposition aus shadcn-Bausteinen ohne eigene Interaktionslogik: `seitenkopf`, `formularfeld`, `zustaende` (Ladeanzeige, Leerzustand, Fehlerzustand), `toast` (ADR-0038). Sie liegen in `shared/ui`, werden über den Modulpfad importiert (`@/shared/ui/<datei>`, ADR-0008) und haben deutsche Props.
8. **Bausteinseite `/entwicklung/bausteine`** (`pages/entwicklung-bausteine`): nur in der Entwicklungsumgebung.
   - `router.tsx` erzeugt die Route nur unter `import.meta.env.DEV`, die Seite wird per dynamischem Import geladen (`lazyRouteComponent`). Im Produktions-Build ersetzt Vite `import.meta.env.DEV` durch `false`, Rollup entfernt Zweig und Chunk.
   - `erstelleRouter` bekommt die Option `entwicklung` (Standard `import.meta.env.DEV`). Die Route entsteht nur bei `import.meta.env.DEV && entwicklung`, damit Tests den Produktionsfall nachstellen können, ohne dass im Build ein Laufzeitzweig übrig bleibt.
   - Kein Sidebar-Eintrag, kein Guard, keine API-Aufrufe, nur synthetische Inhalte (D10).
   - Ein Prüfschritt nach `vite build` (`web/scripts/pruefe-produktionsbuild.mjs`, Teil von `npm run build`) bricht ab, wenn `dist/` den Text „Bausteinübersicht“ enthält.

## Betrachtete Alternativen
- **Icon-Leiste beim Einklappen** (shadcn `collapsible="icon"`): moderner, aber die Links blieben im eingeklappten Zustand fokussierbar. Das widerspricht dem bestehenden Prüfinhalt (`App.test.tsx`, „nimmt die Sidebar-Links im eingeklappten Zustand aus dem Tab-Fluss“). Verworfen (D5).
- **Rahmen weiter je Seite:** führt zu Abweichungen zwischen den Seiten. Verworfen.
- **Bausteinseite per Laufzeit-Flag oder Konfiguration:** Der Code wäre im Produktions-Bundle und die Seite wäre per Konfiguration einschaltbar. Verworfen.
- **Storybook o. Ä.:** neue, schwere Abhängigkeit für eine Übersicht, die eine Seite ebenso leistet. Verworfen.
- **Kopfzeile mit Benutzermenü (Abmelden im Dropdown):** ändert Bedienabläufe, die bestehende Tests prüfen („Abmelden“ als Button in `header`). Verworfen.

## Folgen
- Neue Seiten verwenden `Seitenkopf`, `Card` und die Zustandsbausteine. Eigene Ränder, Breiten und Farben in Seiten sind nicht vorgesehen.
- Brotkrumen auf bestehenden Seiten und die Zustände in Widgets folgen in eigenen Läufen mit freigegebener Testanpassung.
- Die Bausteinseite ist die lebende Referenz der Bausteine. Neue Bausteine werden dort mit allen Varianten ergänzt.

## Nachtrag (2026-11-15, startseite-listen-pruefung)
- **Ausnahme zu Punkt 1:** `/pruefung` steht als einzige Seite in einer zentrierten Spalte `mx-auto max-w-reading` ([ADR-0043](0043-uebersichtsmuster-startseitenraster-katalog-pruefmaske.md) Punkt 3). Rand und Maximalbreite der Shell gelten dort weiter.
- **Zu Punkt 5:** Die Zustände in Widgets nutzen jetzt ebenfalls `Ladeanzeige`, `Leerzustand` und `Fehlerzustand` mit „Erneut versuchen“ (Liste in [startseite-listen-pruefung](../features/startseite-listen-pruefung.md) Abschnitt 13).
