# ADR-0010: TanStack Router code-basiert im Layer `app`

Status: Angenommen · Datum: 2026-10-05 · Feature: frontend-grundgeruest

## Kontext
Vorgegeben ist `@tanstack/react-router`. Der Router unterstützt zwei Arten der Routendefinition:
- **dateibasiert:** Ordner `src/routes`, generierter `routeTree.gen.ts`, Vite-Plugin,
- **code-basiert:** `createRoute` und `createRouter`.

Das Frontend folgt FSD (ADR-0008). Seiten liegen in `pages/`, Steiger prüft `src/`.

## Entscheidung
Der Router ist code-basiert und liegt in `src/app/router/router.tsx`:
- Root-Route mit dem Layout-Widget,
- Kind-Routen `/` (Startseite) und `/coins` (Coin-Liste),
- deutsche `defaultNotFoundComponent` und `defaultErrorComponent` ohne technische Details (`src/app/router/Fehlerseiten.tsx`),
- `Register`-Deklaration für typgeprüfte Links.

Die Pfade stehen in `shared/config/routen.ts` (`ROUTEN`). Die Fabrikfunktion `erstelleRouter(history?)` nimmt optional eine History entgegen (Standard: Browser-History), damit Tests eine Memory-History verwenden können.

## Begründung
- Das dateibasierte Routing bräuchte einen zweiten Ordner für Seiten neben `pages/`. Dieser Ordner wäre für Steiger kein gültiger Layer. Dazu kämen eine generierte Datei und ein Build-Plugin.
- Code-basiert bleibt die Komposition in `app`. Seiten verwenden keine Router-Hooks. `CoinListeSeite` hat keine Router-Abhängigkeit und ist ohne Router testbar; `StartSeite` nutzt nur die `Link`-Komponente und wird im Test mit einem minimalen Router gerendert.
- Bei zwei Routen ist der Mehraufwand gering. Typsicherheit gibt es über `Register` trotzdem.

## Folgen
- Für neue Seiten sind eine Route in `app/router` und ein Pfad in `shared/config` nötig.
- Die URL `/coins` braucht beim Hosting einen SPA-Fallback. Dev und Preview liefern ihn bereits. Für ein Deployment wird das später festgelegt.
