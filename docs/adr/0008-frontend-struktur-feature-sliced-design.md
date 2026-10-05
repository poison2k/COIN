# ADR-0008: Frontend-Struktur nach Feature-Sliced Design, geprüft mit Steiger

Status: Angenommen · Datum: 2026-10-05 · Feature: frontend-grundgeruest

## Kontext
Der Auftraggeber gibt für `web/` Feature-Sliced Design (FSD) mit den Layern `app`, `pages`, `widgets`, `features`, `entities` und `shared` sowie Steiger als Linter vor. Der Pilot lag vor dieser Entscheidung flach in `src/api` und `src/katalog`. Weitere Features (Exemplare, Verleihungen, Zertifikate) sollen einheitlich entstehen.

## Entscheidung
- **Zuschnitt des Pilots:**
  - `entities/coin` (Typen, API-Funktionen, `CoinListe` als reine Darstellung),
  - `features/coin-anlegen` (Formular und Validierung),
  - `pages/start` und `pages/coin-liste` (Komposition und Listenzustand),
  - `widgets/app-shell` (Layout mit Sidebar, Inhalt per `children`),
  - `features/theme-umschalten`,
  - `shared/api` (generischer Ergebnistyp und Statuscode-Abbildung, `ProblemDetails`),
  - `shared/lib` (`cn`, `theme`, shadcn-Hooks),
  - `shared/ui` (shadcn-Komponenten),
  - `shared/config` (Routenpfade),
  - `app` (Einstieg, Provider, Routenbaum, globale Styles).
- **Public API:** jeder Slice hat eine `index.ts`. Importe über Slice-Grenzen gehen nur über `@/<layer>/<slice>`. Innerhalb eines Slices wird relativ importiert. `shared` wird über Modulpfade importiert (`@/shared/ui/button`, `@/shared/lib/cn`). Barrels in `shared` gibt es nur, wenn Steiger sie verlangt (`fsd/public-api`). Das ist der Fall für `shared/api`, `shared/config`, `shared/lib/hooks` und `shared/lib/theme`; diese werden über `@/shared/api`, `@/shared/config`, `@/shared/lib/hooks` und `@/shared/lib/theme` importiert.
- **Alias:** Einziger Alias ist `@/*` → `src/*`. Die shadcn-Aliase in `components.json` zeigen auf `@/shared/ui`, `@/shared/lib`, `@/shared/lib/cn` und `@/shared/lib/hooks`.
- **Querschnitt ohne Importe nach oben:** `ThemeProvider` und `useTheme` liegen in `shared/lib/theme`. `app` bindet den Provider nur ein. Layout-UI liegt im Widget, weil `fsd/no-ui-in-app` UI in `app` verbietet.
- **Testinfrastruktur:** Fake-API und Testhilfen liegen außerhalb der Layer in `web/test/`. Sie hängen von `entities/coin` ab und dürften deshalb nicht in `shared` liegen. Komponententests liegen neben dem getesteten Code im Slice.
- **Steiger:** `fsd.configs.recommended`. Einzige Ausnahme ist `fsd/insignificant-slice: off`. Die Regel empfiehlt nur, Slices mit einem einzigen Verwender zusammenzulegen. Am Anfang haben `coin-anlegen`, `theme-umschalten` und `app-shell` bewusst nur einen Verwender, damit die Struktur als Vorlage dient. Alle Regeln zu Abhängigkeiten und Public API bleiben aktiv: `forbidden-imports`, `no-cross-imports`, `public-api`, `no-public-api-sidestep`, `no-layer-public-api`, `import-locality`, `no-ui-in-app`, `segments-by-purpose`, `no-reserved-folder-names`, `no-segmentless-slices`. Jede weitere Ausnahme braucht die Freigabe des Auftraggebers und einen Eintrag hier.

## Betrachtete Alternativen
- **„Pages first“, also Formular und Liste komplett in `pages/coin-liste`:** wäre FSD-konform und ohne Ausnahme. Für Folgefeatures, die `Coin` wiederverwenden, müsste aber sofort wieder umgebaut werden. Verworfen.
- **Testhilfen in `shared/lib/test`:** Das wäre ein Verstoß gegen die Schichtregeln (Import von `entities` aus `shared`). Verworfen.

## Folgen
- Neue Fachfunktionen entstehen als `entities/<ding>` und `features/<aktion>` und werden in `pages/<seite>` zusammengesetzt.
- Sobald ein zweiter Verwender existiert, wird geprüft, ob `insignificant-slice` wieder eingeschaltet werden kann.
- Generierter shadcn-Code in `shared/ui` wird bei Bedarf angepasst, damit Steiger keine Verstöße meldet. Ein erneutes `shadcn add` überschreibt diese Anpassungen. Deshalb Diff prüfen.
