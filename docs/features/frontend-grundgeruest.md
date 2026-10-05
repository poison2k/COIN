# Feature: Frontend-Grundgerüst nach Referenzvorgaben

Status: umgesetzt (vom qa-reviewer freigegeben) · Branch: `feature/frontend-grundgeruest` (basiert auf `feature/e2e-testdatenbank`) · Art: technischer Standard für `web/`, keine neue Fachfunktion

Zugehörige ADRs: [0008](../adr/0008-frontend-struktur-feature-sliced-design.md) (FSD-Struktur, Steiger), [0009](../adr/0009-ui-basis-shadcn-base-ui-tailwind.md) (shadcn/ui statt @stack-lib, Tailwind, Theme), [0010](../adr/0010-tanstack-router-code-basiert.md) (Router), [0011](../adr/0011-frontend-pruefwerkzeuge.md) (ESLint/Prettier, Husky, Playwright in `web/`)

## 1. Ziel
`web/` folgt einem festen Technologie- und Strukturstandard (Vorgabe des Auftraggebers, wörtlich im Auftrag). Der Pilot (Coin-Liste und Formular) wird ohne Verhaltensänderung in die neue Struktur migriert. Dazu kommen eine App-Shell mit Router, Sidebar und Hell/Dunkel-Umschaltung.

Vom Auftraggeber geklärte Abweichungen:
- `@stack-lib/sidebar` und `@stack-lib/theme` sind nicht verfügbar (npm 404, private Registry). Ersatz ist Original-shadcn/ui in der Base-UI-Variante: die Sidebar-Komponente (mit ihren registryDependencies) und der Theme-Provider nach shadcn-Doku „Dark mode – Vite“. Beides wird per shadcn-CLI mit `components.json` eingerichtet.
- Es gibt keine Versions-Referenz. Verwendet werden aktuelle stabile Versionen; react und react-dom müssen `^19.2.3` erfüllen.

## 2. Akzeptanzkriterien
Alle Befehle laufen in `web/`, sofern nichts anderes angegeben ist.

### Tooling und Skripte
- **AK-1** `package.json` enthält genau diese Skripte (Begründung für `tsc -b` in Abschnitt 4.7):
  `dev`=`vite` · `build`=`eslint . && tsc -b && vite build` · `lint`=`eslint . && steiger ./src` · `lint:fix`=`eslint . --fix` · `lint:fsd`=`steiger ./src` · `format`=`prettier --write "**/*.{ts,tsx,js,jsx,json,css}"` · `test`=`vitest run` · `test:dev`=`vitest` · `test:ui`=`playwright test` · `tsc`=`tsc -b` · `preview`=`vite preview` · `prepare`=`cd .. && husky web/.husky`. Zusätzlich erlaubt ist nur `install-browser`=`playwright install chromium`.
- **AK-2** dependencies: `react` und `react-dom` (^19.2.3 erfüllt), `@tanstack/react-router`, `tailwindcss` ^4, `@tailwindcss/vite`, `tw-animate-css`, `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `framer-motion`, `date-fns`, `react-day-picker`. Nicht enthalten: `@stack-lib/*`, `oxlint`, `oidc-client-ts`, `react-oidc-context`, `srts-netlayer`. Die devDependencies umfassen u. a. `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-plugin-prettier`, `eslint-config-prettier`, `prettier`, `steiger`, `@feature-sliced/steiger-plugin`, `vitest`, `@playwright/test`, `husky` und `globals`. Optional ist `prettier-plugin-tailwindcss`.
- **AK-3** `npm run lint` endet mit Exit-Code 0. ESLint gibt **0 Fehler und 0 Warnungen** aus, Steiger meldet **keine** Verstöße. Das gilt auch für den von shadcn erzeugten Code.
- **AK-4** `npm run tsc` und `npm run build` enden ohne Fehler und ohne Warnungen. `tsc -b` prüft `src/`, `test/`, `ui-tests/` und alle Konfigurationsdateien (`vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`).
- **AK-5** `.oxlintrc.json` und die Abhängigkeit `oxlint` sind entfernt. Es gibt eine ESLint-Flat-Config (`eslint.config.js`), `.prettierrc.json` und `.prettierignore`.
- **AK-6** Die ESLint-Konfiguration enthält keine Regel mit Schweregrad `warn`. Empfohlene Regeln, die standardmäßig `warn` sind, werden auf `error` gehoben. `linterOptions.reportUnusedDisableDirectives` steht auf `error`. `eslint-disable`-Kommentare sind nur zeilenweise, nur für eine benannte Regel und nur mit Begründung erlaubt (`// eslint-disable-next-line regel -- Grund`).
- **AK-7** Nach `npm run format` meldet `npx prettier --check "**/*.{ts,tsx,js,jsx,json,css}"` keine Abweichungen.

### Struktur (FSD)
- **AK-8** `src/` enthält nur die Layer `app`, `pages`, `widgets`, `features`, `entities` und `shared`, zugeschnitten wie in Abschnitt 4.1. Die Ordner `src/api`, `src/katalog` und `src/test` sowie die Dateien `src/App.tsx`, `src/App.css` und `src/main.tsx` gibt es nicht mehr.
- **AK-9** Jeder Slice hat eine `index.ts` als Public API. Code außerhalb eines Slices importiert nur über `@/<layer>/<slice>`, nie aus Unterordnern eines fremden Slices. Innerhalb eines Slices wird relativ importiert.
- **AK-10** Es gibt keine Importe nach oben und keine Querimporte zwischen Slices desselben Layers. Steiger prüft das (`fsd/forbidden-imports`, `fsd/no-cross-imports`).
- **AK-11** `cn()` liegt in `src/shared/lib/cn.ts` (clsx + tailwind-merge). `src/shared/lib/cn.test.ts` deckt mindestens ab: Zusammenfügen, falsy-Werte (`false`, `null`, `undefined`, `''`), bedingte Objekte und Arrays sowie die Auflösung von Tailwind-Konflikten (`cn('p-2', 'p-4') === 'p-4'`, `cn('text-sm', cond && 'text-lg')`).
- **AK-12** Der Alias `@/*` → `src/*` ist in `tsconfig.json`, `tsconfig.app.json` und `vite.config.ts` definiert. Vitest übernimmt ihn über `mergeConfig`. `components.json` bildet die shadcn-Aliase auf FSD ab (Abschnitt 4.3).

### App-Shell
- **AK-13** Routen (TanStack Router, code-basiert in `src/app/router/`): `/` zeigt die Startseite mit der Überschrift „Willkommen bei C.O.I.N.“ (Ebene 1), einem kurzen deutschen Einleitungstext und dem Link „Zur Coin-Liste“. `/coins` zeigt die Coin-Liste, also die bisherige Katalogseite (Überschrift „Coin-Katalog“, Formular und Tabelle).
- **AK-14** Beide Routen liegen im Layout mit Sidebar. Die Sidebar zeigt den Titel „C.O.I.N.“ und die Navigationseinträge „Startseite“ (`/`) und „Coin-Liste“ (`/coins`) mit lucide-Icons. Der aktive Eintrag ist markiert (`aria-current="page"`). Navigiert wird ohne Neuladen der Seite.
- **AK-15** Die Sidebar lässt sich per Button in der Kopfzeile ein- und ausklappen. Auf schmalen Bildschirmen öffnet sie sich als Overlay. Der Button hat den zugänglichen Namen „Seitenleiste ein-/ausblenden“. Der Zustand der Sidebar wird nicht persistiert (kein Cookie).
- **AK-16** Theme-Umschaltung: In der Kopfzeile gibt es einen Button mit dem zugänglichen Namen „Farbschema wählen“. Er öffnet ein Menü mit „Hell“, „Dunkel“ und „System“. Bei Auswahl setzt die App die Klasse `light` bzw. `dark` auf `<html>`. Die Auswahl wird unter dem localStorage-Schlüssel `coin-theme` gespeichert und nach einem Neuladen wieder angewendet. Ohne gespeicherten Wert gilt „System“ (`prefers-color-scheme`).
- **AK-17** Alle sichtbaren und zugänglichen Texte sind deutsch, auch `sr-only`-Texte, `aria-label`, `title`, Sheet-Titel und -Beschreibungen aus dem shadcn-Code sowie die Fehler- und 404-Komponente des Routers. Unbekannte Pfade zeigen „Seite nicht gefunden.“ mit einem Link „Zur Startseite“. `index.html` bleibt bei `lang="de"`.
- **AK-18** Der Vite-Proxy `/api` → `VITE_API_PROXY_TARGET` (Default `http://localhost:5172`) bleibt unverändert.

### Migration, Verhalten unverändert
- **AK-19** Alle bisherigen Vitest-Tests (147 Testfälle) laufen weiterhin. Ausnahme ist `App.test.tsx` (siehe AK-21). Erlaubte Änderungen an den Testdateien sind nur: Verschieben bzw. Umbenennen der Datei, Import-Zeilen und der Bezeichner der gerenderten Komponente (`KatalogSeite` → `CoinListeSeite`). Assertions, Testnamen und Testdaten bleiben unverändert. Nachweis in Abschnitt 5.
- **AK-20** Die Anforderungen AK-28 bis AK-36 aus `coin-katalog.md` gelten unverändert für die Seite `/coins`. Texte, Labels, IDs, `role`, `aria-*`, `accept`, Ladehinweis, Fehlermeldungen und das Vorschaubild (höchstens 64×64 px, `object-fit: contain`, `loading="lazy"`) bleiben erhalten.
- **AK-21** `src/app/App.test.tsx` deckt die Verdrahtung ab. Bei `/coins` sind Katalogliste und Formular zu sehen (bisherige Assertions). `/` zeigt die Startseite. Ein Klick auf „Coin-Liste“ in der Sidebar führt zur Liste. Inhalte des Vite-Templates kommen nicht vor. Die Theme-Umschaltung setzt die Klasse auf `<html>` und schreibt `localStorage`. Der Router wird im Test mit Memory-History erzeugt.
- **AK-22** Die 5 Systemtests in `e2e/` laufen grün. Die einzige zulässige Änderung ist `page.goto('/')` → `page.goto('/coins')` in `beforeEach` von `coin-katalog.spec.ts`. Labels, Texte und Assertions bleiben unverändert.

### UI-Test (Playwright in `web/`) und Pre-Commit
- **AK-23** `npm run test:ui` startet Vite auf Port 5193 (`--strictPort`, keine Wiederverwendung) und führt `ui-tests/*.spec.ts` in Chromium aus. Backend und Docker werden nicht benötigt. Die API wird per `page.route` gemockt. Jede nicht gemockte `/api/**`-Anfrage lässt den Test fehlschlagen.
- **AK-24** `ui-tests/app-shell.spec.ts` prüft:
  - (a) `/` laden, Startseite ist sichtbar.
  - (b) Sidebar-Link „Coin-Liste“ klicken. Die URL endet auf `/coins`, die Tabelle zeigt den gemockten Coin (Name, Herausgeber, „unbekannt“, „Kein Bild“).
  - (c) `/coins` direkt laden. Bei leerer Antwort erscheint „Noch keine Coins erfasst.“
  - (d) „Dunkel“ wählen: `<html>` hat die Klasse `dark`, und das bleibt auch nach `page.reload()` so.
- **AK-25** Nach `npm install` in `web/` gilt `git config core.hooksPath` = `web/.husky/_`. `web/.husky/pre-commit` führt in `web/` `npm run lint` und `npm test` aus. Ein Commit mit Lint-Fehler wird abgelehnt (Exit-Code ≠ 0, kein neuer Commit). Ein Commit ohne Fehler geht durch. Prüfablauf in Abschnitt 5.

### Sonstiges
- **AK-26** `dotnet build` und `dotnet test` bleiben grün. `src/Coin.*` wird nicht geändert. `docs/api.md` ändert sich nicht.
- **AK-27** Keine Secrets im Repo. Testdaten in `ui-tests/` sind synthetisch.

## 3. Abgrenzung (nicht im Umfang)
- Anmeldung (oidc-client-ts, react-oidc-context, @stack-lib/jwt-utils, srts-netlayer), neue Fachfunktionen, Detailseiten.
- Nutzung von `framer-motion`, `date-fns` und `react-day-picker`: Die Pakete werden nur installiert und erst bei Bedarf in Folgefeatures verwendet. Die Datumsformatierung der Liste bleibt bei `Intl.DateTimeFormat`.
- Data-Fetching-Bibliothek (z. B. TanStack Query), Router-Loader, Router-Devtools.
- Inline-Skript gegen kurzes Aufblitzen des hellen Themes beim Laden.
- SPA-Fallback für ein Produktions-Hosting (es gibt noch kein Deployment). Dev und Preview liefern bei `/coins` die `index.html` aus.
- CI-Pipeline, lint-staged.
- Doppelte Pflege der Systemtests: `e2e/` bleibt für Full-Stack-Abläufe zuständig, `web/ui-tests` nur für die Shell (siehe ADR-0011).

## 4. Lösungsentwurf

### 4.1 Zielstruktur und Zuschnitt (ADR-0008)
```
web/
  index.html                 script → /src/app/main.tsx
  components.json            shadcn (Base UI)
  eslint.config.js  .prettierrc.json  .prettierignore  steiger.config.ts
  vite.config.ts  vitest.config.ts  playwright.config.ts
  tsconfig.json (Referenzen + paths)  tsconfig.app.json  tsconfig.node.json  tsconfig.ui-tests.json
  .husky/pre-commit
  test/                      Testinfrastruktur, außerhalb der FSD-Layer
    setup.ts  matchMedia.ts  ← src/test/setup.ts (+ matchMedia-Stub für jsdom)
    fakeApi.ts  hilfen.ts    ← src/test/* (Import von Coin über @/entities/coin)
  ui-tests/app-shell.spec.ts Playwright, API gemockt
  src/
    app/
      main.tsx               ← src/main.tsx
      App.tsx                ThemeProvider + RouterProvider
      App.test.tsx           ← src/App.test.tsx (angepasst, AK-21)
      router/router.tsx      Routenbaum, createRouter, Register-Deklaration
      router/Fehlerseiten.tsx  Not-Found- und Fehlerkomponente (+ Test)
      styles/index.css       Tailwind-Einstieg, shadcn-Tokens (ersetzt index.css und App.css)
    pages/
      start/                 index.ts, ui/StartSeite.tsx (+ Test)
      coin-liste/            index.ts, ui/CoinListeSeite.tsx (← katalog/KatalogSeite.tsx) + Test
    widgets/
      app-shell/             index.ts, ui/AppShell.tsx (SidebarProvider, Kopfzeile, Inhalt via children), ui/AppSidebar.tsx
    features/
      coin-anlegen/          index.ts (CoinFormular), ui/CoinFormular.tsx (+ Test), model/validiereCoin.ts (+ Test)
      theme-umschalten/      index.ts, ui/ThemeUmschalter.tsx
    entities/
      coin/                  index.ts, model/types.ts (Coin, CoinAnlegen), api/coins.ts (+ coins.test.ts), ui/CoinListe.tsx (+ Test)
    shared/
      api/                   index.ts, http.ts (ApiErgebnis, sende, bildeAb, leseJson ← aus api/coins.ts), problem-details.ts
      config/                index.ts, routen.ts (ROUTEN = { start: '/', coinListe: '/coins' } as const)
      lib/cn.ts (+ cn.test.ts), lib/theme/ (theme-context.ts, theme-provider.tsx, use-theme.ts, index.ts), lib/hooks/ (index.ts, use-mobile.ts aus shadcn)
      ui/                    shadcn-Komponenten (sidebar, button, sheet, tooltip, input, separator, skeleton, dropdown-menu, textarea, label, table …)
```
Regeln für den Zuschnitt:
- **`api/coins.ts` wird geteilt.** Die generischen Teile (Ergebnistyp und Statuscode-Abbildung) kommen nach `shared/api/http.ts`, die Coin-Endpunkte nach `entities/coin/api/coins.ts`. Der Code wird nur verschoben, die Logik bleibt gleich. `coins.test.ts` testet weiter über `ladeCoins`, `legeCoinAn` und `ladeBildHoch` und deckt damit beide Teile ab.
- **`CoinListe` ist reine Entity-Darstellung** (Props `coins`) und gehört nach `entities/coin/ui`. Das Formular inklusive Validierung ist eine Nutzeraktion und gehört nach `features/coin-anlegen`. Die Seite setzt beides zusammen und hält den Listenzustand.
- **`ThemeProvider` und `useTheme` liegen in `shared/lib/theme`** und nicht in `app`. Sonst könnte der Umschalter in `features/` den Hook nicht importieren, weil Importe nach oben verboten sind. `app` bindet nur den Provider ein. Provider und Hook liegen in getrennten Dateien, damit `react-refresh/only-export-components` nicht anschlägt.
- **Das Layout ist ein Widget** (`fsd/no-ui-in-app` verbietet `app/ui`). Es bekommt den Seiteninhalt als `children`. Die Root-Route in `app` rendert `<AppShell><Outlet/></AppShell>`.
- **Die Navigation verwendet `ROUTEN` aus `shared/config`.** Links in der Sidebar sind über die `Register`-Deklaration typgeprüft.
- **Die Testhilfen kommen nach `web/test/`, außerhalb von `src/`.** Sie hängen von `entities/coin` ab und wären in `shared` ein Verstoß gegen die Schichtregeln. Steiger prüft nur `./src`, ESLint und `tsc` prüfen `test/` mit.

### 4.2 Steiger (ADR-0008)
`steiger.config.ts`: `fsd.configs.recommended`. Einzige vorab genehmigte Ausnahme ist `fsd/insignificant-slice: 'off'`. Begründung: Die Regel ist eine Strukturempfehlung (Slices mit nur einem Verwender zusammenlegen) und keine Abhängigkeitsregel. In der Anfangsphase haben `features/coin-anlegen`, `features/theme-umschalten` und `widgets/app-shell` bewusst nur einen Verwender, weil die Struktur Vorlage für Folgefeatures ist. Alle Abhängigkeits- und Public-API-Regeln bleiben aktiv und dürfen nicht abgeschaltet werden: `forbidden-imports`, `no-cross-imports`, `public-api`, `no-public-api-sidestep`, `no-layer-public-api`, `import-locality`, `no-ui-in-app`, `segments-by-purpose`, `no-reserved-folder-names`, `no-segmentless-slices`. Meldet Steiger für `shared/ui` (shadcn) Verstöße, wird der generierte Code angepasst, etwa durch relative Importe innerhalb des Segments oder ein `index.ts`, wenn `fsd/public-api` es verlangt. Weitere Ausnahmen gibt es nur mit Freigabe und Eintrag in ADR-0008.

### 4.3 shadcn/ui (Base UI) und Tailwind v4 (ADR-0009)
- Einrichtung per `npx shadcn@latest init` mit Komponentenbibliothek Base UI, danach `npx shadcn@latest add sidebar dropdown-menu button input textarea label table`. Die registryDependencies der Sidebar (u. a. `sheet`, `tooltip`, `separator`, `skeleton`, `use-mobile`) kommen automatisch mit. Den Theme-Provider gibt es nicht in der Registry. Er wird nach der Doku „Dark mode – Vite“ übernommen und auf Deutsch angepasst.
- `components.json`: `tailwind.css` = `src/app/styles/index.css`. Aliase: `components` = `@/shared/ui`, `ui` = `@/shared/ui`, `utils` = `@/shared/lib/cn`, `lib` = `@/shared/lib`, `hooks` = `@/shared/lib/hooks`. `iconLibrary` = `lucide`. Den Stil und die Basisfarbe legt die CLI fest, Vorgabe für Base UI ist `neutral`.
- Nacharbeit am generierten Code ist ausdrücklich vorgesehen. Gemäß shadcn-Prinzip gehört der Code dem Projekt. Nötig sind:
  1. englische Texte übersetzen (AK-17), z. B. „Toggle Sidebar“ und Sheet-Titel und -Beschreibung,
  2. das Cookie `sidebar_state` entfernen (AK-15),
  3. Lint-Befunde beheben, insbesondere `react-hooks`-Regeln (z. B. `Math.random` im Render von `SidebarMenuSkeleton`, `setState` im Effect von `use-mobile`, besser mit `useSyncExternalStore`),
  4. `npm run format` ausführen.
  
  Ist `sidebar` für Base UI über die CLI nicht verfügbar: stoppen und melden, nicht selbst bauen.
- **Styling der migrierten Komponenten (Empfehlung):** `App.css` entfällt, die Regeln werden zu Tailwind-Klassen. Native Elemente werden durch die shadcn-Primitive `Button`, `Input`, `Textarea`, `Label` und `Table` ersetzt, **solange Struktur und Semantik gleich bleiben** (gleiches HTML-Element, `id`, `htmlFor`, `aria-*`, `disabled`, `accept`, `role`). Das Dateifeld bleibt `<input type="file">` (gern mit Input-Styling). Fehler- und Erfolgsfarben kommen aus Tokens (`text-destructive`, eine Erfolgsfarbe für hell und dunkel). Schlägt durch ein Primitive ein unveränderter Test fehl, etwa weil Base UI eigene `id`- oder `aria`-Werte setzt, wird für dieses Element das native Element mit Tailwind-Klassen verwendet. Die Tests gehen vor.

### 4.4 Router (ADR-0010)
Der Router ist code-basiert (`createRootRoute`, `createRoute`, `createRouter`) in `src/app/router/router.tsx` mit `createBrowserHistory`. Die Fabrikfunktion `erstelleRouter(history?)` erlaubt Tests mit `createMemoryHistory({ initialEntries: ['/coins'] })`. Außerdem gibt es eine `declare module '@tanstack/react-router' { interface Register { router: … } }`-Deklaration, `defaultNotFoundComponent` und `defaultErrorComponent` auf Deutsch. Den Fehlertext zeigt die Fehlerkomponente nicht an (keine technischen Details). Seiten bleiben frei von Router-Hooks, deshalb rendert `CoinListeSeite.test.tsx` die Seite unverändert ohne Router.

### 4.5 Theme
`ThemeProvider` folgt der shadcn-Doku: `defaultTheme="system"`, `storageKey="coin-theme"`, Klassen `light` und `dark` auf `document.documentElement`, `system` über `matchMedia('(prefers-color-scheme: dark)')`. Der Provider liest `localStorage` nur beim Start und schreibt nur bei einer Auswahl. Er wird in `app/App.tsx` eingebunden. Der Umschalter `features/theme-umschalten` (DropdownMenu mit Hell/Dunkel/System, Icons Sonne/Mond) sitzt in der Kopfzeile von `widgets/app-shell`. Tailwind v4: `@custom-variant dark (&:is(.dark *));` (setzt die shadcn-init). In jsdom stubbt `test/setup.ts` `window.matchMedia`.

### 4.6 ESLint und Prettier (ADR-0011)
- `eslint.config.js` (Flat Config). Ignoriert werden `dist`, `coverage`, `playwright-report`, `test-results`. Enthalten sind:
  - `@eslint/js` recommended,
  - `typescript-eslint` recommended,
  - `eslint-plugin-react-hooks` recommended (Flat-Preset der aktuellen Version),
  - `eslint-plugin-react-refresh` (`only-export-components`: `error`, `allowConstantExport: true`; für `src/shared/ui/**` aus, weil shadcn-Dateien `…Variants` und Hooks neben Komponenten exportieren und die Regel nur HMR betrifft),
  - `eslint-plugin-prettier/recommended` (zuletzt).
  
  `globals.browser` gilt für `src` und `test`, `globals.node` für Konfigurationsdateien und `ui-tests`. Regeln, die als `warn` voreingestellt sind (z. B. `react-hooks/exhaustive-deps`), werden auf `error` gesetzt (AK-6).
- `.prettierrc.json` folgt dem bisherigen Code-Stil: `{ "semi": false, "singleQuote": true, "printWidth": 120, "trailingComma": "all", "plugins": ["prettier-plugin-tailwindcss"], "tailwindStylesheet": "./src/app/styles/index.css" }`. `.prettierignore`: `dist`, `coverage`, `playwright-report`, `test-results`, `package-lock.json`. Die einmalige Umformatierung des Bestands geschieht in einem eigenen Commit „Formatierung (Prettier)“, damit Verschiebungen und Logik im Diff lesbar bleiben.

### 4.7 TypeScript
- Das Root-`tsconfig.json` ist eine Solution-Konfiguration (`files: []`, `references`). Ein nacktes `tsc` prüft dort nichts. Deshalb ist das Skript `tsc` = `tsc -b`, und `build` ruft `tsc -b` auf. Das entspricht dem Sinn der Vorgabe „eslint . && tsc && vite build“.
- Projekte:
  - `tsconfig.app.json`: `src`, `test`; Typen `vite/client`; `paths`,
  - `tsconfig.node.json`: `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `steiger.config.ts`,
  - `tsconfig.ui-tests.json`: `ui-tests`; lib `ES2023` und `DOM`; Typen `node`.
- `compilerOptions.paths` `{"@/*": ["./src/*"]}` steht im Root-`tsconfig.json` (wird von der shadcn-CLI gelesen) und in `tsconfig.app.json`.

### 4.8 Playwright (ADR-0011)
`web/playwright.config.ts`: `testDir: './ui-tests'`, `baseURL` `http://localhost:5193`, `locale: 'de-DE'`, nur Chromium. `webServer`: `npm run dev -- --port 5193 --strictPort` mit `reuseExistingServer: false` und `env: { VITE_API_PROXY_TARGET: 'http://127.0.0.1:9' }`, ein absichtlich unerreichbares Ziel, damit nie eine echte API angesprochen wird. In den Tests gibt es eine Catch-all-Route für alle Pfade mit `pathname === '/api'` oder `pathname.startsWith('/api/')`, die ungemockte Aufrufe als Testfehler meldet (AK-23, siehe Abschnitt 10). Ports: Dev 5173, e2e 5183, UI-Tests 5193. `e2e/` (ADR-0007) bleibt unverändert für Full-Stack-Tests zuständig.

### 4.9 Husky
`prepare` = `cd .. && husky web/.husky` (Husky v9, Git-Root ist das Repo-Root). `web/.husky/pre-commit`:
```sh
cd web
npm run lint
npm test
```
Der Hook läuft bei jedem Commit im Repo, auch bei reinen Backend-Änderungen. Das ist bewusst so (Vorgabe). Ohne `.git` (z. B. Archiv-Installation) bricht `prepare` die Installation nicht ab.

## 5. Nachweise für Tester
- **Testmigration (AK-19):** Vor der Migration auf dem Basis-Branch und danach `npx vitest run --reporter=json --outputFile=<datei>` ausführen. Die Menge der vollständigen Testnamen (`ancestorTitles` + `title`, ohne Dateipfad) muss vorher eine Teilmenge von nachher sein, ausgenommen die 3 Tests aus `App.test.tsx`. Die Zahl der bisherigen Tests (147) ist erreicht, alle sind `passed`. Zusätzlich `git diff -M --stat <basis> -- web/src web/test` (Umbenennungen erkannt) und `git diff -M <basis> -- "web/**/*.test.ts*"`: Geändert sind nur Import-Zeilen und der Komponentenbezeichner (außer `App.test.tsx`).
- **Pre-Commit (AK-25):** In einem sauberen Arbeitsstand prüfen:
  1. `git config core.hooksPath` liefert `web/.husky/_`.
  2. Datei `web/src/shared/lib/lint-probe.ts` mit `export let x = 1` anlegen (`prefer-const` ist ein Fehler). `git add` und `git commit -m probe`. Erwartet: Exit-Code ≠ 0, `git log -1` unverändert.
  3. Datei entfernen, Index zurücksetzen.
  4. Positivfall: Ein leerer Commit mit `git commit --allow-empty -m probe` läuft durch, danach `git reset --soft HEAD~1`.
- **Lint ohne Warnungen (AK-3, AK-6):** `npx eslint . --max-warnings 0` endet mit Exit-Code 0, und `eslint.config.js` enthält kein `'warn'`.
- **e2e (AK-22):** `cd e2e; npx playwright test` ist grün. `git diff <basis> -- e2e/` zeigt nur die `goto`-Zeile.

## 6. Sicherheit und Datenschutz
- Keine Personendaten. Im Browser werden nur die Theme-Präferenz (`coin-theme` in localStorage) gespeichert. Das Sidebar-Cookie wird entfernt, damit kein unnötiges Cookie an `/api` gesendet wird (relevant für den späteren CSRF-Entwurf, ADR-0004).
- Die Router-Fehlerkomponente zeigt keine Fehlermeldungen oder Stacktraces.
- Kein `dangerouslySetInnerHTML`, kein Inline-Skript in `index.html`. Das hält eine spätere CSP einfach.
- Neue npm-Abhängigkeiten nur aus dem öffentlichen Index, keine privaten Registries oder Tokens im Repo (`.npmrc` ohne Credentials). `npm audit` ohne high/critical bei Abschluss (Hinweis im Review, kein harter AK).
- Die UI-Tests sprechen nie eine echte API an (unerreichbares Proxy-Ziel und Catch-all).

## 7. Doku-Bedarf
- Erledigt: `README.md` (Abschnitt „Frontend“), `docs/features/coin-katalog.md` (AK-28, Abschnitt 6), `docs/benutzer/coin-katalog.md` (Navigation, Farbschema), ADR-0008 bis ADR-0011.
- Offen: `CLAUDE.md`, Abschnitte Technik, Projektstruktur und Befehle (oxlint entfernen; `npm run lint`, `npm run test:ui`; FSD, Tailwind, shadcn/Base UI, TanStack Router). **Nur mit Freigabe des Auftraggebers**, Agenten ändern `CLAUDE.md` nicht eigenmächtig.
- `docs/api.md`: keine Änderung.

## 8. Annahmen
- Die Paketnamen `@base-ui/react` und `framer-motion` sind die gewünschten (nicht `motion`). Die shadcn-CLI bietet Base UI als Komponentenbibliothek inklusive `sidebar` und `dropdown-menu` an.
- Husky v9 ist installiert, Git for Windows führt den `sh`-Hook aus.
- Playwright-Browser werden lokal einmalig per `npm run install-browser` installiert (gemeinsamer Cache mit `e2e/`).
- Die Systemvorgabe wird beim Laden bzw. bei Auswahl von „System“ ausgewertet. Live auf eine Änderung der OS-Einstellung zu reagieren, ist nicht gefordert (shadcn-Doku-Verhalten).

## 9. Entschiedene Fragen
1. **Startseite vs. Coin-Liste:** `/` ist eine eigene, schlichte Startseite (Begrüßung und Link „Zur Coin-Liste“). Die Liste liegt unter `/coins`. Die Systemtests navigieren direkt zu `/coins` (AK-22). AK-28 in `coin-katalog.md` ist entsprechend angepasst.
2. **URL der Coin-Liste:** `/coins`, analog zu `/api/coins` und zum Fachbegriff „Coin“.

## 10. Abweichungen vom Entwurf (Umsetzung)
- **Catch-all in `ui-tests`:** Statt des Globs `**/api/**` prüft eine Funktion `pathname === '/api' || pathname.startsWith('/api/')`. Der Glob hätte auch Vite-Module wie `/src/shared/api/http.ts` abgefangen.
- **Zusätzliche `index.ts`** in `shared/api`, `shared/config` und `shared/lib/hooks`, weil Steiger sie verlangt (`fsd/public-api`). Importe dorthin laufen über `@/shared/api`, `@/shared/config` und `@/shared/lib/hooks`.
- **`SidebarRail`** ist im shadcn-Code vorhanden, wird aber nicht verwendet.
- **Eingeklappte Sidebar ist `inert`:** Im eingeklappten Zustand (Desktop, `collapsible="offcanvas"`) ist der Sidebar-Container `inert`, damit unsichtbare Links nicht per Tab den Fokus erhalten (WCAG 2.4.7). Das Mobile-Overlay ist nicht betroffen.
- **Strg+B (bzw. Cmd+B)** schaltet die Sidebar nicht um, wenn der Fokus in `input`, `textarea`, `select` oder einem `contentEditable`-Element liegt.
- **Zusätzliche Pakete:** `@fontsource-variable/geist` (Schrift aus der shadcn-Einrichtung) als dependency und `shadcn` als devDependency, weil `src/app/styles/index.css` `shadcn/tailwind.css` importiert.
- **Prettier** hat bei der einmaligen Formatierung auch Testdateien umformatiert. Das ist reine Formatierung, Assertions, Testnamen und Testdaten sind unverändert.
