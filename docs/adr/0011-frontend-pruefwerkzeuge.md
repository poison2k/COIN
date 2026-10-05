# ADR-0011: Prüfwerkzeuge im Frontend (ESLint/Prettier, Husky im Unterordner, Playwright-UI-Tests in `web/`)

Status: Angenommen · Datum: 2026-10-05 · Feature: frontend-grundgeruest

## Kontext
Die Vorgabe verlangt ESLint mit Prettier (`eslint-plugin-prettier`), Steiger, Vitest, Playwright (`test:ui` = `playwright test` in `web/`) und Husky. Vor dieser Entscheidung nutzte `web/` oxlint. Die Systemtests liegen in `e2e/` und laufen mit Wegwerf-Datenbank (ADR-0007). Das Git-Root ist das Repo-Root, `package.json` liegt in `web/`.

## Entscheidung
1. **ESLint ersetzt oxlint.** Flat Config mit:
   - `@eslint/js` und `typescript-eslint` (jeweils recommended),
   - `react-hooks` (recommended),
   - `react-refresh`,
   - `eslint-plugin-prettier/recommended`.

   Es gibt keine Regeln mit `warn`. Was als `warn` voreingestellt ist (`react-hooks/exhaustive-deps`, `react-hooks/incompatible-library`, `react-hooks/unsupported-syntax`), wird zu `error`, damit „ohne Warnungen“ auch ohne `--max-warnings` erzwungen ist. Ungenutzte Disable-Direktiven und ungenutzte Inline-Konfigurationen sind Fehler (`reportUnusedDisableDirectives`, `reportUnusedInlineConfigs`). `react-refresh/only-export-components` ist nur für `src/shared/ui/**` aus: shadcn exportiert Varianten und Hooks neben Komponenten, und die Regel betrifft nur HMR. `.oxlintrc.json` und `oxlint` entfallen.
2. **Prettier** übernimmt den bisherigen Stil: ohne Semikolon, einfache Anführungszeichen, 120 Zeichen Zeilenbreite, `trailingComma: all`. Dazu kommt `prettier-plugin-tailwindcss` (sortiert Tailwind-Klassen anhand von `src/app/styles/index.css`).
3. **TypeScript-Prüfung:** Skript `tsc` = `tsc -b` über die Projekt-Referenzen (app, node, ui-tests). Ein nacktes `tsc` prüft bei einer Solution-`tsconfig.json` nichts.
4. **Husky im Unterordner:** `prepare` = `cd .. && husky web/.husky`. Der Pre-Commit-Hook wechselt nach `web/` und führt `npm run lint` und `npm test` aus. Browser-Tests (`test:ui`, `e2e`) laufen bewusst nicht im Hook, weil sie zu langsam sind und Browser bzw. Docker brauchen.
5. **Playwright-UI-Tests in `web/ui-tests/` mit gemockter API.** Sie laufen gegen Vite auf Port 5193 (`--strictPort`, kein Wiederverwenden eines laufenden Servers) und mocken die API per `page.route`. Das Proxy-Ziel ist absichtlich unerreichbar (`http://127.0.0.1:9`), und ein Catch-all für Pfade unter `/api/` (Prüfung per `pathname`, kein Glob, damit Vite-Module wie `/src/shared/api/http.ts` nicht abgefangen werden) lässt ungemockte Aufrufe als Fehler scheitern. Die Tests prüfen nur die App-Shell: Laden, Routing, Sidebar, Theme und die Darstellung der Liste. Fachliche Abläufe über alle Schichten bleiben in `e2e/` (ADR-0007).

## Betrachtete Alternativen
- **`test:ui` startet `e2e/`** (`playwright test -c ../e2e/...`): Das Frontend-Skript bräuchte Docker, .NET und eine Datenbank und wäre langsam. Außerdem würden die Zuständigkeiten vermischt. Verworfen.
- **Playwright-Konfiguration nur in `web/`, `e2e/` auflösen:** widerspricht ADR-0007 und dem bestehenden Full-Stack-Nachweis. Verworfen.
- **oxlint zusätzlich behalten:** zwei Linter mit überlappenden Regeln. Verworfen.

## Folgen
- Es gibt zwei Playwright-Projekte mit klarer Abgrenzung: `web/ui-tests` prüft das Frontend isoliert (schnell, ohne Backend), `e2e/` prüft das System. Die Browser-Installation wird gemeinsam genutzt.
- Der Hook gilt für jeden Commit im Repo, auch bei reinen Backend-Änderungen. Er wird erst nach `npm install` in `web/` aktiv (`core.hooksPath` = `web/.husky/_`).
- Der Hook prüft den Arbeitsstand, nicht nur den Index (kein lint-staged). Nicht gestagte Änderungen beeinflussen das Ergebnis; verlässlich ist es nur, wenn Index und Arbeitsstand übereinstimmen.
- Die einmalige Prettier-Umformatierung des Bestands (auch der Testdateien) erzeugt einen großen Diff. Sie gehört deshalb in einen eigenen Commit.
