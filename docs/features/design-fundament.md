# Feature: Design-Fundament – Gestaltungsregeln, Bausteine, App-Layout

Status: umgesetzt (Entscheidungen D1–D13 des Auftraggebers vom 2026-11-13 in Abschnitt 13; Abweichungen und Vormerkungen in Abschnitt 14) · Datum: 2026-11-13 · Branch: `feature/design-fundament` · ADRs: [0035](../adr/0035-gestaltungsregeln-tokens-palette-schrift.md) (neu, Tokens, Palette, Schrift), [0036](../adr/0036-layoutprinzip-app-shell-und-bausteine.md) (neu, Layoutprinzip, Bausteine, Bausteinseite), [0037](../adr/0037-pruefung-barrierefreiheit-und-gestaltungsregeln.md) (neu, axe und Code-Tests), [0038](../adr/0038-toast-mit-base-ui.md) (neu, Toast), [0008](../adr/0008-frontend-struktur-feature-sliced-design.md), [0009](../adr/0009-ui-basis-shadcn-base-ui-tailwind.md), [0010](../adr/0010-tanstack-router-code-basiert.md), [0011](../adr/0011-frontend-pruefwerkzeuge.md)

## 1. Ziel
Die Oberfläche bekommt ein einheitliches, sachliches Erscheinungsbild mit Tokens, Bausteinen und App-Layout, auf dem alle Seiten aufbauen. Die Funktion bleibt unverändert. Den Auftrag gibt der Auftraggeber wörtlich vor (Auftrag zu diesem Branch).

**Nicht dazu:** neue Funktionen, Backend-Änderungen (kein Endpunkt, keine Migration, kein DTO), Animationen über dezente Übergänge hinaus, neue Seiten außer `/entwicklung/bausteine`, Umbau von Formularen, Tabellen und Dashboards (Startseiten-Blöcke, Katalogtabelle, Exemplare, Historie, Benutzertabelle, Audit-Log, Prüfergebnis), Umstellung bestehender Meldungen auf Toasts, eine Ausgaben-Übersichtsseite, Brotkrumen auf bestehenden Seiten (D1), Zustände in Widgets (D2), Entfernen ungenutzter Pakete (D13).

**Datenmodell und API:** keine Änderungen. `docs/api.md` und `docs/berechtigungen.md` bleiben unverändert.

## 2. Ist-Stand (geprüft)
| Punkt | Stand | Folge |
|---|---|---|
| Theme | `shared/lib/theme` (shadcn „Dark mode – Vite“), Klasse `light`/`dark` auf `<html>`, `localStorage` `coin-theme`, Umschalter `features/theme-umschalten` (Menü Hell/Dunkel/System). `@stack-lib/theme` gibt es nicht (ADR-0009), `abhaengigkeiten.test.ts` verbietet `@stack-lib/*` | Verfahren bleibt (ADR-0035 Punkt 1) |
| Tokens | `app/styles/index.css`: shadcn `neutral` in OKLCH, Primärfarbe fast schwarz, `--success`/`--warning` vorhanden, kein `--info`, Fokus `outline-ring/50` | neue Palette in Hex, Statusfarben vollständig (ADR-0035) |
| Hartkodierte Farben | `bg-black/10` in `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`; `bg-white` in `entities/startseite/ui/Kopfbereich.tsx` und `features/startseite-konfigurieren/ui/LogoFeld.tsx`; `color-mix(...)` in `button.tsx` | durch `bg-overlay`, `bg-logo-surface` und `bg-primary-hover`/Tokens ersetzen |
| Beliebige Abstände | u. a. `sheet.tsx`, `input-group.tsx`, `tabs.tsx` (`-[2.5rem]`, `-[-0.3rem]` …) | auf die Skala bringen oder als begründete Ausnahme im Test führen (AK-4) |
| `shared/ui` | vorhanden: `alert`, `alert-dialog`, `badge`, `blaettern`, `button`, `card`, `combobox`, `dialog`, `dropdown-menu`, `input`, `input-group`, `label`, `markdown`, `radio-group`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `switch`, `table`, `tabs`, `textarea`, `tooltip`; Button `h-8` (32 px) | neu: `checkbox`, `field`, `breadcrumb`, `empty`, `spinner` (CLI), eigene `seitenkopf`, `formularfeld`, `zustaende`, `toast` |
| App-Shell | `widgets/app-shell`: `AppSidebar` (flache Liste in `<nav aria-label="Hauptnavigation">`, Einträge nach Berechtigung), `Kopfzeile` (`AnmeldeBereich`: „Angemeldet als “ sr-only + Name, Abmelden), `ThemeUmschalter`; `offcanvas`, eingeklappt `inert` | Gruppen, Rolle, Skip-Link, Inhaltscontainer |
| `/api/me` | liefert `id`, `name`, `email`, `rolle`, `berechtigungen`; `ROLLEN_ANZEIGE` in `entities/benutzer` | Rolle in der Kopfzeile ohne Backend-Änderung (nur Anzeige) |
| Seitenrahmen | jede Seite `mx-auto max-w-5xl p-6`, h1 `text-2xl font-semibold`, Lade-/Fehlerzustand als `<p role="status">`/`<p role="alert">` | Rahmen in die Shell, Seitenkopf und Zustandsbausteine |
| Test-Abhängigkeiten an der Shell | genau ein `header` (`document.querySelector('header')`, `page.locator('header')`), `navigation` „Hauptnavigation“, Linknamen „Startseite“, „Katalog“, „Zertifikat prüfen“, „Benutzerverwaltung“, „Startseite verwalten“ und deren Reihenfolge, `aria-current`/`data-active`, `inert` eingeklappt, Dialog „Seitenleiste“, Button „Seitenleiste ein-/ausblenden“, „Farbschema wählen“ mit `menuitem` „Hell/Dunkel/System“, Text „C.O.I.N.“ genau einmal, `CoinDetailSeite.test.tsx` erwartet als einzigen Link „Zurück zum Katalog“ | alles bleibt erhalten (AK-25 bis AK-31, D1) |
| Ungenutzte Pakete | `framer-motion`, `react-day-picker` ohne Verwendung in `src` | eigener `chore/*`-Branch (D13) |

## 3. Annahmen
- A1: Die bestehenden Linknamen, Überschriften, Rollen und Texte sind Prüfinhalt der Tests und bleiben wortgleich. Neu sind nur der Skip-Link, die Gruppenlabels der Seitenleiste, die Rolle in der Kopfzeile, „Erneut versuchen“ in Seitenfehlern (D2) und die Bausteinseite.
- A2: Kleine Barrierefreiheitskorrekturen an bestehenden Formularen und Tabellen, die axe verlangt (Attribute wie `aria-label` oder `id`/`for`), sind erlaubt. Strukturänderungen nicht: Sie werden gemeldet.
- A3: Die Bausteinseite ist in der Entwicklungsumgebung ohne Anmeldung erreichbar (D10). Sie enthält keine Daten aus der API.
- A4: „Smartphone“ heißt Viewport < 768 px (Grenze von `use-mobile`). Bei 768 px gilt das Desktop-Layout.

## 4. Gestaltungsregeln (Tokens)
### 4.1 Tokens
Alle Werte, Namen und Kontraste stehen in ADR-0035. Kurzfassung:
- Einzige Theme-Datei: `web/src/app/styles/index.css`. `:root` (hell) und `.dark` mit Hex-Werten. `@theme inline` bildet `--color-<token>` ab, `--color-*: initial` schaltet die Tailwind-Palette ab.
- Farbtokens: `background`, `foreground`, `card(-foreground)`, `popover(-foreground)`, `primary`, `primary-foreground`, `primary-hover`, `secondary(-foreground)`, `muted(-foreground)`, `accent(-foreground)`, `destructive`, `destructive-foreground`, `destructive-subtle`, `success`, `success-foreground`, `success-subtle`, `warning`, `warning-foreground`, `warning-subtle`, `info`, `info-foreground`, `info-subtle`, `border`, `input`, `ring`, `sidebar*`, `overlay`, `logo-surface`.
- Primärfarbe Marineblau `#1e40af` / dunkel `#93c5fd` (D3). Schrift Geist Variable (D12), Stufen `text-xs` bis `text-3xl`. Raster `--spacing: 0.25rem` (Layout in 8-px-Schritten). Radien `--radius-sm/md/lg/xl` = 4/6/8/12 px. Schatten `--shadow-xs/sm/md`. Breiten `--container-page: 72rem`, `--container-reading: 45rem`.

### 4.2 Kontrastpaare (Kontrasttest, je hell und dunkel)
Text ≥ 4,5:1:
- `foreground` auf `background`, `card`, `muted`;
- `card-foreground` auf `card`;
- `popover-foreground` auf `popover`;
- `muted-foreground` auf `background`, `card`, `muted`, `sidebar`, `sidebar-accent`;
- `primary` auf `background`, `card`;
- `primary-foreground` auf `primary` und `primary-hover`;
- `secondary-foreground` auf `secondary`;
- `accent-foreground` auf `accent`;
- `destructive`, `success`, `warning`, `info` jeweils auf `background`, `card`, `muted` und der eigenen `*-subtle`-Fläche;
- `destructive-foreground` auf `destructive`, `success-foreground` auf `success`, `warning-foreground` auf `warning`, `info-foreground` auf `info`;
- `sidebar-foreground` auf `sidebar`;
- `sidebar-accent-foreground` auf `sidebar-accent`;
- `sidebar-primary-foreground` auf `sidebar-primary`.

Nicht-Text ≥ 3:1:
- `input` auf `background` und `card`;
- `ring` auf `background`, `card`, `muted`;
- `sidebar-ring` auf `sidebar`.

## 5. Bausteine (`web/src/shared/ui`, Import `@/shared/ui/<datei>`)
| Baustein | Datei | Quelle | Props / Varianten | Barrierefreiheit |
|---|---|---|---|---|
| Button | `button.tsx` | vorhanden, angepasst | `variant`: `default` = **primär**, `outline` = **sekundär**, `destructive` = **gefährlich** (gefüllt `bg-destructive text-destructive-foreground`), `ghost` = **Text**; `secondary` und `link` bleiben für den Bestand. `size`: `sm` (h-10, px-3), `default` (h-10, px-4), `lg` (h-12, px-6, `text-base`), `icon` (size-10). `xs`, `icon-xs`, `icon-sm` und `icon-lg` bleiben als Aliase, aber keine Größe unter 40 × 40 px (D9). Neu `laedt?: boolean` | `laedt`: Spinner (`aria-hidden`) statt Start-Icon, Beschriftung bleibt, `aria-busy="true"`, gesperrt per `focusableWhenDisabled` (`aria-disabled`), Klicks werden verworfen. Fokusring ohne Deckkraftreduktion |
| Eingabefeld | `input.tsx` | vorhanden | h-10, Rahmen `border-input`, `aria-invalid` → Rahmen `destructive` | Fehler nie nur über Farbe (Text im Formularfeld) |
| Textbereich | `textarea.tsx` | vorhanden | wie Eingabefeld, `min-h-24` | – |
| Auswahl | `select.tsx` | vorhanden | Trigger h-10, Optionen ≥ 40 px hoch | Pfeiltasten-Umlauf bleibt (ADR-0009) |
| Checkbox | `checkbox.tsx` | **neu (CLI)** | `checked`, `indeterminate`, `disabled` | `role="checkbox"`, Leertaste, Beschriftung per `<label>`, Klickfläche Zeile ≥ 40 px |
| Formularfeld | `field.tsx` (CLI) + `formularfeld.tsx` (eigen) | **neu** | `Formularfeld({ label, hilfetext?, fehler?, pflicht?, children: (feld) => ReactNode })`, `feld` = `{ id, 'aria-describedby', 'aria-invalid', required }` | `label for`, Hilfetext und Fehler über `aria-describedby`; Fehler mit Icon (`aria-hidden`) und sr-only-Präfix „Fehler:“; Pflicht als Text „(Pflicht)“, nicht nur „*“ |
| Karte | `card.tsx` | vorhanden, ergänzt | `Card`, `CardHeader`, `CardTitle` (neu `ebene?: 2 \| 3 \| 4` → `h2`/`h3`/`h4`, ohne Angabe `div` wie bisher), `CardDescription`, `CardAction`, `CardContent`, `CardFooter` | kein `<header>`/`<footer>`-Element |
| Tabelle | `table.tsx` | vorhanden | unverändert, Container `overflow-x-auto`; `TableCaption` | breite Tabellen scrollen in ihrem Container, nie die Seite |
| Badge / Status-Chip | `badge.tsx` | vorhanden, ergänzt | neue `variant`: `neutral`, `info`, `success`, `warning`, `destructive` (je `*-subtle`-Fläche mit Statusfarbe als Text); bestehende Varianten bleiben; `rounded-full` | Bedeutung immer im Text, optionales Icon `aria-hidden` |
| Dialog | `dialog.tsx`, `alert-dialog.tsx` | vorhanden | Overlay `bg-overlay` | Titel Pflicht, Fokusfalle, Escape, Fokus zurück, „Schließen“ |
| Hinweisbanner | `alert.tsx` | vorhanden, ergänzt | `variant`: `default`, `info`, `success`, `warning`, `destructive` mit festem Icon je Variante | `role` bleibt standardmäßig `alert` (Bestand); überschreibbar (`role="status"` oder ohne Rolle für statische Hinweise). Titeltext trägt die Bedeutung |
| Leerzustand | `empty.tsx` (CLI) + `zustaende.tsx` | **neu** | `Leerzustand({ titel, beschreibung?, aktion?, icon?, titelEbene?: 1 \| 2 \| 3 })`, Standard `2` | Icon `aria-hidden` |
| Ladeanzeige | `skeleton.tsx` + `zustaende.tsx` | **neu** | `Ladeanzeige({ text, form?: 'zeilen' \| 'karte' \| 'tabelle' })` | Container `role="status"`, `text` nur für Screenreader (z. B. „Coin wird geladen …“), Skeletons `aria-hidden` |
| Fehlerzustand | `zustaende.tsx` | **neu** | `Fehlerzustand({ meldung, titel?, onErneutVersuchen? })` | Hinweisbanner `destructive` mit `role="alert"`, Button „Erneut versuchen“; Fokus wird nicht verschoben |
| Spinner | `spinner.tsx` | **neu (CLI)** | `className` | `role="status"`, `aria-label="Wird geladen"`; im Button `aria-hidden` |
| Toast | `toast.tsx` | **neu** (Base UI, ADR-0038, D6) | `ToastProvider`, `Toaster`, `useToast().zeige({ titel, beschreibung?, art })` | ADR-0038 Punkt 2 |
| Seitenkopf | `seitenkopf.tsx` | **neu** | `Seitenkopf({ titel, beschreibung?, aktionen?, brotkrumen?, titelRef?, titelFokussierbar? })` | genau ein `h1`; `titelFokussierbar` → `tabIndex={-1}` (für den bestehenden Fokus nach Meldungen); Element `<div>` |
| Brotkrumen | `breadcrumb.tsx` | **neu (CLI)** | `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink` (`render={<Link …/>}`), `BreadcrumbPage`, `BreadcrumbSeparator` | `<nav aria-label="Brotkrumen">`, `<ol>`, Trenner `aria-hidden`, aktuelle Seite `aria-current="page"` ohne Link, Links ≥ 40 px hoch |

Bausteine, die eine shadcn-Entsprechung haben, kommen aus der CLI (ADR-0009). Eigene Dateien setzen nur shadcn- oder Base-UI-Teile zusammen (ADR-0036 Punkt 7).

## 6. App-Layout (`widgets/app-shell`, Public API `index.ts`: `AppShell`, `type BenutzerZustand`)
### 6.1 Aufbau
Skip-Link → Seitenleiste → Kopfzeile (`<header>`) → `<main id="inhalt" tabIndex={-1}>` mit Container `mx-auto w-full max-w-page px-4 py-6 md:px-6 md:py-8 lg:px-8`. `ToastProvider` umschließt die Shell, `Toaster` liegt am Ende. Der Skip-Link ist ein `<a href="#inhalt">`. Sein `onClick` verhindert die Standardaktion und fokussiert `main`, damit sich die URL nicht ändert. Er ist sichtbar, sobald er den Fokus hat.

### 6.2 Seitenleiste
Kopf: Icon (`aria-hidden`) und Text „C.O.I.N.“ (genau einmal im Dokument). Gruppen in fester Reihenfolge, nur bestehende Routen (D4):

| Gruppe (Label) | Eintrag | Pfad | Icon (lucide) | sichtbar mit |
|---|---|---|---|---|
| Übersicht | Startseite | `/` | `HouseIcon` | allen |
| Coins | Katalog | `/coins` | `LibraryIcon` | allen |
| Prüfung | Zertifikat prüfen | `/pruefung` | `ShieldCheckIcon` | `coins.read` |
| Verwaltung | Benutzerverwaltung | `/benutzerverwaltung` | `UsersIcon` | `users.manage` |
| Verwaltung | Startseite verwalten | `/verwaltung/startseite` | `LayoutDashboardIcon` | `startpage.manage` |

Eine Gruppe „Ausgaben“ entfällt, bis es eine Ausgaben-Übersichtsseite gibt (D4). Die Bausteinseite hat keinen Eintrag (D10). Eingeklappt wird per `offcanvas` (D5).

### 6.3 Kopfzeile
| Zustand | Inhalt rechts (Reihenfolge) |
|---|---|
| `pruefe` | Theme-Umschalter |
| `anonym`, `nichtKonfiguriert` | „Anmelden“, Theme-Umschalter |
| `angemeldet` | Name und Rolle (`<span class="sr-only">Angemeldet als </span>{name}`, `<span class="sr-only">, Rolle: </span>{ROLLEN_ANZEIGE[rolle]}`; ab 640 px sichtbar, Rolle in `text-xs text-muted-foreground`), Theme-Umschalter, „Abmelden“ |
| `deaktiviert` | Theme-Umschalter, „Abmelden“ (ohne Name, wie bisher) |
| `fehler` | Meldung mit „Erneut versuchen“ (wie bisher), Theme-Umschalter |

Die heutige Reihenfolge (Anmeldebereich vor Theme-Umschalter) darf bleiben. Entscheidend ist, dass alles in `header` liegt.

## 7. Einheitliche Zustände auf Seitenebene (D2)
| Seite | Laden (`Ladeanzeige`, Text unverändert) | Fehler (`Fehlerzustand`, Text unverändert) | Leer/nicht gefunden (`Leerzustand`) |
|---|---|---|---|
| `/` Startseite | „Startseite wird geladen …“ | bestehender Text | – |
| `/coins/{id}` | „Coin wird geladen …“ | „Der Coin konnte nicht geladen werden. Bitte später erneut versuchen.“ + „Erneut versuchen“ | h1 „Coin nicht gefunden“, Text und Link „Zum Katalog“ wie bisher |
| `/coins/{id}/bearbeiten` | „Coin wird geladen …“ | wie Detailseite | wie bisher |
| `/coins/{id}/ausgaben/neu` | „Coin wird geladen …“ | wie Detailseite | wie bisher |
| `/coins/{id}/ausgaben/{aid}` | „Ausgabe wird geladen …“ | „Die Ausgabe konnte nicht geladen werden. …“ + „Erneut versuchen“ | wie bisher |
| `/verwaltung/startseite` | „Konfiguration wird geladen …“ | bestehender Fehler mit bestehendem Button | – |
| 404 (`NichtGefunden`) | – | – | Leerzustand mit „Seite nicht gefunden.“ und Link „Zur Startseite“ |
| Router-Fehler (`Fehler`) | – | Fehlerzustand mit bestehendem Text und Link „Zur Startseite“ | – |

Zustände in Widgets (Katalog, Exemplare, Historie, Benutzer, Audit, Startseiten-Blöcke, Prüfergebnis) bleiben in diesem Lauf unverändert und folgen mit deren Umbau (D2).

## 8. Anwendung auf bestehende Seiten
Jede Seite entfernt ihren äußeren Rahmen (`mx-auto max-w-5xl p-6`) und nutzt den Container der Shell. Überschriften, Linknamen, Buttonnamen, Rollen und die Reihenfolge der Bedienelemente bleiben gleich.

| Seite (Slice) | Seitenkopf (h1 unverändert) | Aktionen im Seitenkopf | Karten |
|---|---|---|---|
| `/` (`pages/start`) | keiner (Kopfbereich-Block ist der Kopf, Dashboard unverändert) | – | – |
| `/coins` (`pages/coin-liste`) | ja | „Coin hinzufügen“ | Katalog-Widget in `Card` |
| `/coins/neu` (`pages/coin-anlegen`) | ja | – | Formular in `Card` (`max-w-reading`) |
| `/coins/{id}` (`pages/coin-detail`) | ja, `titelRef` + `titelFokussierbar` | „Bearbeiten“ | Stammdaten, Exemplare, Historie je eine `Card` |
| `/coins/{id}/bearbeiten` (`pages/coin-bearbeiten`) | ja | – | Abschnitte je `Card` |
| `/coins/{id}/ausgaben/neu` (`pages/ausgabe-erfassen`) | ja | – | Formular in `Card` |
| `/coins/{id}/ausgaben/{aid}` (`pages/ausgabe-detail`) | ja | bestehende Aktionen bleiben an ihrem Platz | Details in `Card` |
| `/pruefung` (`pages/pruefung`) | ja | – | Formular und Ergebnis in einer gemeinsamen `Card` (Abschnitt 14) |
| `/benutzerverwaltung` (`pages/benutzerverwaltung`) | ja | – | Tabelle und Audit-Log je `Card` |
| `/verwaltung/startseite` (`pages/startseite-verwaltung`) | ja | – | Formular und Vorschau je `Card` |
| `/kein-zugriff` | nein, h1 in der `Card` (Abschnitt 14) | – | Inhalt in `Card` |
| `/abgemeldet` | ja | – | Inhalt in `Card` |
| `/anmeldung/rueckruf` (ohne Shell) | – | – | zentrierte `Card` mit `Ladeanzeige` |

Bestehende Seiten bekommen in diesem Lauf keine Brotkrumen. Das folgt in einem eigenen Lauf mit freigegebener Testanpassung (D1).

## 9. Bausteinseite `/entwicklung/bausteine`
- Slice `pages/entwicklung-bausteine` (Public API `index.ts`: `BausteineSeite`), importiert nur `@/shared/ui/*`, `@/shared/lib/*`, `lucide-react`.
- Pfad `ROUTEN.entwicklungBausteine = '/entwicklung/bausteine'` in `shared/config/routen.ts`. Route unter `shellRoute` nur bei `import.meta.env.DEV && entwicklung` (ADR-0036 Punkt 8), Komponente per `lazyRouteComponent`. Ohne Anmeldung, ohne Sidebar-Eintrag (D10).
- Inhalt:
  - h1 „Bausteinübersicht“;
  - je Baustein ein Abschnitt mit h2 in der Reihenfolge von Abschnitt 5;
  - vorneweg „Farben“ (je Token ein Feld mit Name, nur Token-Klassen) und „Schrift“ (alle Stufen).
- Gezeigt werden alle Varianten und Größen sowie die Zustände „deaktiviert“, „lädt“, „Fehler“ und „ausgewählt“.
- Die Beispieltabelle enthält nur synthetische Coin-Daten, keine Personennamen.
- Dialog und Toast öffnen sich per Button.

## 10. Akzeptanzkriterien

### Gestaltungsregeln
- **AK-1** `web/src/app/styles/index.css` ist die einzige Datei mit Farbwerten. Sie enthält alle Tokens aus Abschnitt 4.1 mit den Werten aus ADR-0035 in `:root` und `.dark`, `--color-*: initial` in `@theme` und `color-scheme: light` bzw. `dark`. Geprüft per Kontrasttest (Tokens vorhanden) und Review (`--color-*: initial`).
- **AK-2** Der Kontrasttest berechnet alle Paare aus Abschnitt 4.2 für hell und dunkel aus `index.css`. Text ≥ 4,5:1, Nicht-Text ≥ 3:1. Ein fehlendes Token lässt ihn scheitern.
- **AK-3** Der Code-Test „Gestaltungsregeln“ (ADR-0037 Punkt 2) findet in `web/src` außerhalb von `index.css` und Testdateien 0 hartkodierte Farben (Hex, Farbfunktionen, Palettenklassen inkl. `black`/`white`, beliebige Farbwerte). Die Anzahl der Treffer steht im QA-Bericht.
- **AK-4** Derselbe Test findet 0 beliebige Abstandswerte (`p-[…]`, `m-[…]`, `gap-[…]`, `space-x-[…]`, `inset-[…]`, `top-[…]` …). Ausnahmen nur aus der Liste im Test mit Begründung.
- **AK-5** Kein `ring-ring/NN` und kein `outline-ring/NN` in `web/src` (Code-Test). Jedes fokussierbare Element zeigt bei Tastaturfokus einen Indikator von mindestens 2 px in `--ring`: berechneter `outline-width` ≥ 2 px oder `box-shadow` ≠ `none` (Playwright, AK-42).
- **AK-6** Grundschrift 16 px Geist Variable. h1 im Seitenkopf `text-2xl md:text-3xl font-semibold`. Andere Schriftstufen als `text-xs` bis `text-3xl` erzeugen keine Regel (`--text-4xl` … `--text-9xl: initial`).
- **AK-7** Hell/Dunkel/System funktioniert wie bisher (`coin-theme`, Klasse auf `<html>`). Es gibt kein neues Theme-Paket.
- **AK-8** Bei `prefers-reduced-motion: reduce` sind `animation-duration` und `transition-duration` aller Elemente ≤ 0,01 ms (Playwright mit `reducedMotion: 'reduce'`, Stichprobe Theme-Umschalter-Icon und Sheet).

### Bausteine
- **AK-9** Die Bausteine aus Abschnitt 5 liegen in den genannten Dateien. CLI-Komponenten sind nachbearbeitet: `cn` aus `@/shared/lib/cn`, keine englischen Texte (`breadcrumb`: „Brotkrumen“, „Weitere Seiten“; `spinner`: „Wird geladen“). Es gibt keine neue Laufzeitabhängigkeit (AK-44).
- **AK-10** Button: Die vier Varianten primär/sekundär/gefährlich/Text und die Größen `sm`/`default`/`lg`/`icon` sind gerendert mindestens 40 × 40 px groß. Mit `laedt`:
  - Name unverändert, `aria-busy="true"`, `aria-disabled="true"`;
  - der Fokus bleibt auf dem Button, ein Klick löst `onClick` nicht aus;
  - der Spinner ist `aria-hidden`.
- **AK-11** Eingabefeld, Textbereich und Auswahl sind ≥ 40 px hoch und haben den Rahmen `--input`. Mit `aria-invalid="true"` wechselt der Rahmen auf `--destructive`.
- **AK-12** Checkbox: Rolle `checkbox`, umschaltbar mit Leertaste und Klick auf die Beschriftung, Zustände an, aus, unbestimmt und deaktiviert. Die Klickfläche aus Beschriftung und Kästchen ist ≥ 40 px hoch.
- **AK-13** Formularfeld: Das Label ist mit dem Feld verknüpft (zugänglicher Name = Label). Hilfetext und Fehler stehen in `aria-describedby` (Fehler zuerst). Mit Fehler ist `aria-invalid="true"` gesetzt und der Fehlertext beginnt für Screenreader mit „Fehler:“. Pflichtfelder haben `required` und den sichtbaren Text „(Pflicht)“.
- **AK-14** Karte: `CardTitle ebene={2}` rendert `h2` (3 → `h3`, 4 → `h4`), ohne `ebene` ein `div`. Keine Karte enthält `<header>` oder `<footer>`.
- **AK-15** Tabelle: Bei 360 px scrollt eine Tabelle, die breiter als der Viewport ist, in ihrem Container. `document.documentElement.scrollWidth` bleibt ≤ `innerWidth`.
- **AK-16** Badge-Varianten `neutral`, `info`, `success`, `warning`, `destructive`: Text vorhanden, Icon (falls gesetzt) `aria-hidden`, Farben nur aus Tokens.
- **AK-17** Dialog: Titel als zugänglicher Name. Tab bleibt im Dialog, Escape schließt, der Fokus kehrt zum Auslöser zurück. Der Schließen-Button heißt „Schließen“ und ist ≥ 40 × 40 px groß.
- **AK-18** Hinweisbanner `info`/`success`/`warning`/`destructive`: Je Variante gibt es ein eigenes Icon (`aria-hidden`) und einen Titel. Ohne `role`-Prop bleibt `role="alert"`, mit `role="status"` wird `status` gerendert.
- **AK-19** Leerzustand: Titel als Überschrift der Ebene `titelEbene` (Standard 2), Beschreibung, optional eine Aktion (Button oder Link).
- **AK-20** Ladeanzeige: genau ein Element `role="status"` mit dem übergebenen Text als zugänglichem Inhalt. Die Skeleton-Blöcke sind `aria-hidden`.
- **AK-21** Fehlerzustand: `role="alert"` mit der Meldung. Mit `onErneutVersuchen` erscheint ein Button „Erneut versuchen“, der den Callback genau einmal je Klick aufruft. Der Fokus wird beim Erscheinen nicht verschoben.
- **AK-22** Toast (ADR-0038):
  - `zeige` blendet Titel und Beschreibung in der Region „Benachrichtigungen“ ein;
  - je Toast ein Button „Meldung schließen“;
  - `fehler` und `warnung` bleiben stehen, `erfolg` und `info` verschwinden nach 6 s, außer bei Hover oder Fokus;
  - höchstens 3 sichtbar;
  - die Art steht als sr-only-Text („Fehler:“ usw.).
- **AK-23** Seitenkopf: rendert genau ein `h1` mit `titel`, die Beschreibung als Absatz und die Aktionen in einem Container. `titelRef` zeigt auf das `h1`, `titelFokussierbar` setzt `tabIndex=-1`. Das Wurzelelement ist kein `<header>`. Bei 360 px brechen die Aktionen unter den Titel um, ohne horizontales Scrollen.
- **AK-24** Brotkrumen: `navigation` mit Namen „Brotkrumen“, geordnete Liste, Trenner `aria-hidden`. Der letzte Eintrag ist kein Link und hat `aria-current="page"`. Die Links sind ≥ 40 px hoch.

### App-Layout
- **AK-25** Auf jeder Seite in der Shell gibt es genau ein `<header>` (die Kopfzeile, Landmark `banner`), genau ein `<main id="inhalt">` und genau eine `navigation` „Hauptnavigation“. Die DOM-Reihenfolge ist Skip-Link, Seitenleiste, Kopfzeile, `main`.
- **AK-26** Skip-Link: Der erste Tab nach dem Laden fokussiert den Link „Zum Inhalt springen“, der dann sichtbar ist (im Viewport, nicht `sr-only`). Enter setzt den Fokus auf `main#inhalt`. Pfad, Suche und Hash der URL bleiben unverändert.
- **AK-27** Seitenleiste: Gruppen und Sichtbarkeit wie in Abschnitt 6.2, abhängig nur von `berechtigungen` aus `/api/me`.
  - Gruppen ohne sichtbaren Eintrag fehlen im DOM. Anonym sieht man nur „Übersicht“ und „Coins“, als Betrachter zusätzlich „Prüfung“, als Administrator alle vier.
  - Jede Gruppenliste hat als zugänglichen Namen ihr Label.
  - Linknamen, `href` und relative Reihenfolge der fünf Einträge sind unverändert. Kein Gruppenlabel ist gleich einem Linknamen.
  - Icons sind `aria-hidden`.
- **AK-28** Aktiver Eintrag: `aria-current="page"` nur auf dem exakten Pfad, `data-active` auch auf Unterseiten (wie bisher). Sichtbar durch Hintergrund `sidebar-accent`, einen Balken in `sidebar-primary` und `font-semibold`. Der Unterschied zum inaktiven Eintrag zeigt sich also auch ohne Farbwahrnehmung (Balken und Gewicht).
- **AK-29** Einklappen (Desktop, `offcanvas`, D5): Der Button „Seitenleiste ein-/ausblenden“ hat `aria-expanded` passend zum Zustand. Eingeklappt ist die Seitenleiste ausgeblendet und `inert`. Strg/Cmd+B schaltet um, außer in Eingabefeldern. Es gibt kein Cookie und keinen gespeicherten Zustand.
- **AK-30** Unter 768 px:
  - Der Button öffnet den Dialog „Seitenleiste“ mit deutscher Beschreibung.
  - Der Fokus liegt im Dialog und Tab bleibt darin.
  - Escape schließt den Dialog und setzt den Fokus zurück auf den Button.
  - Nach Auswahl eines Eintrags schließt der Dialog.
- **AK-31** Kopfzeile wie Abschnitt 6.3:
  - angemeldet `textContent` enthält „Angemeldet als <Name>“ und die Rolle (z. B. „Administrator“, ohne Rolle „Keine Rolle“);
  - „Abmelden“ und „Farbschema wählen“ sind Buttons in `header`;
  - bei 360 px sind „Abmelden“ bzw. „Anmelden“ und der Theme-Umschalter im Viewport;
  - die Rolle wird nie für Sichtbarkeit verwendet (`abhaengigkeiten.test.ts` bleibt grün).
- **AK-32** Der Inhaltscontainer ist bei 1280 px höchstens 72rem breit und zentriert. Seitenränder: 16 px unter 768 px, 24 px ab 768 px, 32 px ab 1024 px (Playwright misst den Abstand des h1 zum Rand von `main`). Keine Datei unter `src/pages` und `src/app/router` enthält `max-w-5xl` (Code-Test).
- **AK-33** Bei 360, 768 und 1280 px scrollt keine Seite aus Abschnitt 11.2 horizontal (`scrollWidth ≤ innerWidth`), auch nicht mit geöffnetem Mobilmenü oder auf der Bausteinseite.
- **AK-34** Klickflächen: Alle sichtbaren Elemente mit Rolle `button`, `link`, `checkbox`, `combobox`, `textbox`, `menuitem`, `switch` oder `radio` sind ≥ 40 × 40 px groß, bei Checkbox und Radio gemessen an der umgebenden Beschriftung. Das gilt in `header`, „Hauptnavigation“, „Brotkrumen“, im Seitenkopf, im Mobilmenü, auf der Bausteinseite und auf den Fehler-, Leer- und Ladezuständen. Ausgenommen sind Links im Fließtext (`p a`), Textlinks in bestehenden Tabellen (D9) und der Skip-Link im unfokussierten Zustand.

### Zustände und bestehende Seiten
- **AK-35** Seitenzustände wie in Abschnitt 7: gleiche Texte und Rollen wie bisher. Seitenfehler beim Laden bieten „Erneut versuchen“, das genau eine neue Anfrage auslöst und bei Erfolg die Seite zeigt (Vitest je Seite, D2).
- **AK-36** Bestehende Seiten wie in Abschnitt 8: Seitenkopf mit unverändertem h1 und Karten, ohne Brotkrumen (D1). Die Inhalte von Formularen, Tabellen und Dashboards sind unverändert (gleiche Felder, Spalten, Texte und Reihenfolge).
- **AK-37** Alle bisherigen Tests (Vitest, `web/ui-tests`, `e2e`) sind grün. Angepasst werden dürfen nur Selektoren, deren Element sich geändert hat, nicht der Prüfinhalt. Jede Anpassung steht mit Begründung im Commit und im QA-Bericht. Wird ein Test rot, weil der Skip-Link einen Tab-Stopp hinzufügt, darf er um genau diesen Tab-Stopp ergänzt werden (D11).

### Bausteinseite
- **AK-38** In der Entwicklungsumgebung (`npm run dev`, UI-Tests) zeigt `/entwicklung/bausteine` in der Shell:
  - h1 „Bausteinübersicht“;
  - je Baustein aus Abschnitt 5 einen Abschnitt mit h2 und allen dort genannten Varianten, Größen und Zuständen;
  - die Abschnitte „Farben“ und „Schrift“.

  Die Seite löst keinen API-Aufruf aus und hat keinen Sidebar-Eintrag. Alle Texte sind deutsch: kein „Loading“, „Close“, „Toggle“, „More“, „breadcrumb“, „Notifications“ (Vitest-Textprüfung).
- **AK-39** Produktion:
  - `erstelleRouter(history, { entwicklung: false })` zeigt auf `/entwicklung/bausteine` die 404-Ansicht (Vitest).
  - `npm run build` endet mit `pruefe-produktionsbuild.mjs`, das scheitert, wenn eine Datei in `web/dist` „Bausteinübersicht“ enthält.
  - Der Build ist grün, der Text kommt im Bundle nicht vor.

### Barrierefreiheit gesamt
- **AK-40** Bedeutung nie nur über Farbe: Status-Badges, Banner, Toasts und Feldfehler tragen Text. Der aktive Menüpunkt hat Balken und Gewicht. Links im Fließtext sind unterstrichen.
- **AK-41** axe (ADR-0037 Punkt 1) meldet 0 Verstöße der Stufe `serious` oder `critical`:
  - auf allen Seiten aus Abschnitt 11.2, hell und dunkel, bei 1280 px;
  - auf allen Seiten hell bei 360 px;
  - mit geöffnetem Mobilmenü hell und dunkel;
  - auf der Bausteinseite mit geöffnetem Dialog und sichtbarem Toast.
- **AK-42** Tastatur (Playwright `tastatur.spec.ts`) als Administrator bei 1280 px:
  - Der Skip-Link funktioniert (AK-26).
  - Jeder Eintrag der Hauptnavigation ist allein mit Tab erreichbar, Enter navigiert (URL und h1 der Zielseite stimmen).
  - Der Seitenleisten-Button klappt mit Enter und Leertaste ein und aus; eingeklappt sind die Links nicht erreichbar.
  - „Farbschema wählen“ öffnet mit Enter, Pfeiltasten und Enter wählen „Dunkel“ (Klasse `dark`).
  - „Abmelden“ ist erreichbar.
  - Bei 360 px öffnet sich das Mobilmenü per Tastatur, ein Eintrag wird per Enter gewählt, Escape schließt mit Fokus-Rückkehr.
  - Bei jedem Schritt erfüllt das fokussierte Element AK-5.
- **AK-43** Screenreader-Namen: Alle Icon-Buttons haben einen deutschen zugänglichen Namen. Dekorative Icons sind `aria-hidden`. Kein Element hat einen englischen `aria-label` (Vitest-Textprüfung über `shared/ui` und `widgets/app-shell`).

### Abhängigkeiten und Doku
- **AK-44** Gegenüber `develop` kommt in `web/package.json` und `e2e/package.json` nur `@axe-core/playwright` als devDependency hinzu. Es gibt keine weitere neue Abhängigkeit, auch kein `sonner` und kein `@stack-lib/*`.
- **AK-45** `web/ui-tests/screenshots.spec.ts` erzeugt bei `COIN_SCREENSHOTS=1` die Bilder `docs/design/ablage/<seite>_<breite>_<hell|dunkel>.png`. Seiten: `start`, `katalog`, `coin-detail`, `pruefung`, `benutzerverwaltung`, `bausteine`, Breiten 360/768/1280, also 36 Dateien. Sie werden eingecheckt (D7). Nur synthetische Daten. Ohne die Variable wird die Datei übersprungen. Der Developer sieht sich die Bilder an und behebt offensichtliche Fehler. Die Befunde stehen im Bericht.
- **AK-46** Doku: ADR-0035 bis ADR-0038, dieser Entwurf, `docs/requirements.md` (Funktion 8, NFR Barrierefreiheit) und der Abschnitt „Frontend-Standard“ in `CLAUDE.md` (Text in Abschnitt 12, Übernahme durch den Menschen bzw. die Hauptsitzung, D8).

## 11. Tests
### 11.1 Zuordnung
| Ebene | Datei (neu) | AK |
|---|---|---|
| Vitest | `web/src/app/gestaltungsregeln.test.ts` (Farben, Abstände, Fokus-Deckkraft, `max-w-5xl` in `pages`/`app/router`, Musterselbsttest) | 3, 4, 5, 32 |
| Vitest | `web/src/app/kontrast.test.ts` | 1, 2 |
| Vitest | `web/src/shared/ui/button.test.tsx`, `formularfeld.test.tsx`, `checkbox.test.tsx`, `card.test.tsx`, `badge.test.tsx`, `alert.test.tsx`, `zustaende.test.tsx`, `toast.test.tsx` (mit Fake-Timern), `seitenkopf.test.tsx`, `breadcrumb.test.tsx` | 10–14, 16–24 |
| Vitest | `web/src/widgets/app-shell/ui/AppSidebar.test.tsx` (Gruppen je Berechtigungssatz, keine leeren Gruppen, Listen-Namen, Reihenfolge), `Kopfzeile.test.tsx` (Rolle, Präfix, Zustände), `AppShell.test.tsx` (ein `header`, ein `main#inhalt`, Skip-Link) | 25–28, 31 |
| Vitest | `web/src/app/router/entwicklung.test.tsx` (DEV-Route vorhanden; `entwicklung: false` → 404), `web/src/pages/entwicklung-bausteine/ui/BausteineSeite.test.tsx` (Abschnitte, deutsche Texte, kein API-Aufruf) | 38, 39, 43 |
| Vitest | Seitentests je Seite aus Abschnitt 7 für „Erneut versuchen“ | 35 |
| UI-Test (gemockte API) | `web/ui-tests/barrierefreiheit.spec.ts` | 41 |
| UI-Test | `web/ui-tests/responsiv.spec.ts` (360/768/1280, Overflow, Klickflächen, Seitenränder, Mobilmenü) | 15, 23, 32, 33, 34 |
| UI-Test | `web/ui-tests/tastatur.spec.ts` | 5, 26, 29, 30, 42 |
| UI-Test | `web/ui-tests/bausteine.spec.ts` (Seite, hell/dunkel, Dialog, Toast, kein API-Aufruf) | 22, 38 |
| UI-Test | `web/ui-tests/bewegung.spec.ts` (`reducedMotion`) | 8 |
| UI-Test | `web/ui-tests/screenshots.spec.ts` (nur mit `COIN_SCREENSHOTS=1`) | 45 |
| Systemtest (echte API) | `e2e/tests/design-fundament.spec.ts`: Administrator legt einen Coin und eine Ausgabe an, dann axe (`serious`/`critical` = 0) und 360-px-Overflow auf `/`, `/coins`, `/coins/{id}`, `/coins/{id}/ausgaben/{aid}`, `/pruefung`, `/benutzerverwaltung`, `/verwaltung/startseite`, hell und dunkel | 33, 41 |
| Build | `web/scripts/pruefe-produktionsbuild.mjs` in `npm run build` | 39 |

Gemeinsame Mocks für die neuen UI-Tests (angemeldet als Administrator, Betrachter, anonym, ohne Rolle; Coin, Exemplare, Ausgabe, Benutzer, Startseite) gehören nach `web/ui-tests/hilfen/` (Tester). Die bestehenden Specs bleiben unverändert.

### 11.2 Seitenliste für axe, Overflow und Screenshots
`/` (anonym und Administrator), `/coins`, `/coins/neu`, `/coins/{id}`, `/coins/{id}/bearbeiten`, `/coins/{id}/ausgaben/neu`, `/coins/{id}/ausgaben/{aid}`, `/pruefung` (mit gültigem Ergebnis), `/benutzerverwaltung`, `/verwaltung/startseite`, `/kein-zugriff` (ohne Rolle), `/abgemeldet`, `/anmeldung/rueckruf` (fehlgeschlagen), unbekannter Pfad (404), `/entwicklung/bausteine`.

## 12. Sicherheit, Datenschutz, Doku
- Kein neuer Endpunkt, keine neue Berechtigung, keine neue Speicherung. `localStorage` enthielt in diesem Lauf nur `coin-theme`, für die Seitenleiste gibt es kein Cookie (ADR-0009). Seit startseite-listen-pruefung kommt `coin-katalog-ansicht` (Ansicht des Katalogs, `tabelle`/`karten`) hinzu ([ADR-0044](../adr/0044-ansichtswahl-lokal-speichern.md)); weitere Schlüssel gibt es nicht.
- Die Bausteinseite ist nicht im Produktions-Bundle (AK-39) und zeigt nur synthetische Daten.
- Kein `dangerouslySetInnerHTML`, Schrift lokal (kein CDN), keine externen Ressourcen.
- Die Rolle in der Kopfzeile ist reine Anzeige, Sichtbarkeit nur aus `berechtigungen` (CLAUDE.md, `abhaengigkeiten.test.ts`).
- Toasts, Screenshots und axe-Ausgaben enthalten keine Personendaten. Die Screenshots entstehen nur mit gemockten, synthetischen Daten („Testperson A“, „Dienststelle Beispiel“).
- `docs/requirements.md`: Funktion 8 und NFR ergänzt (dieser Lauf).
- Text für den neuen Abschnitt in `CLAUDE.md` (nach „Konventionen“, Übernahme durch den Menschen bzw. die Hauptsitzung, D8):

  ```
  ## Frontend-Standard
  - Gestaltung nur über die Tokens in `web/src/app/styles/index.css` (ADR-0035); keine Farben
    (Hex, rgb/hsl/oklch, Tailwind-Palette wie `bg-red-500`, `bg-white`) und keine beliebigen
    Abstände (`p-[13px]`) in Komponenten – geprüft in `web/src/app/gestaltungsregeln.test.ts`.
  - Bausteine aus `shared/ui` verwenden (Button, Formularfeld, Card, Badge, Hinweisbanner,
    Seitenkopf, Ladeanzeige/Leerzustand/Fehlerzustand, Toast; Übersicht unter
    `/entwicklung/bausteine`, nur in Entwicklung). Neue Seiten: `Seitenkopf` + `Card`, kein
    eigener Seitenrand und keine eigene Maximalbreite (Shell, ADR-0036).
  - WCAG 2.1 AA: Text ≥ 4,5:1, Fokus sichtbar (`ring` ohne Deckkraft), Klickflächen ≥ 40 px,
    Bedeutung nie nur über Farbe; axe ohne serious/critical (ADR-0037), 360 px ohne
    horizontales Scrollen. Neue Seiten in `barrierefreiheit.spec.ts`/`responsiv.spec.ts`
    aufnehmen.
  - Genau ein `<header>` (Kopfzeile); Seitenkopf und Karten nie als `<header>`.
  ```

## 13. Entscheidungen des Auftraggebers (2026-11-13)
Der Auftraggeber hat alle Vorschläge zu D1–D13 übernommen.
- **D1 Brotkrumen:** Bestehende Seiten bekommen in diesem Lauf keine Brotkrumen, weil sie Prüfinhalte bestehender Tests ändern würden (`CoinDetailSeite.test.tsx`: einziger Link „Zurück zum Katalog“; seitenweite Suche nach genau einem Link „Katalog“). Der Baustein wird gebaut und auf der Bausteinseite gezeigt. Eingesetzt wird er in einem Folgelauf mit freigegebener Testanpassung.
- **D2 Zustände:** Umgestellt werden nur die Zustände auf Seitenebene (Abschnitt 7), einschließlich „Erneut versuchen“ bei Ladefehlern einer Seite. Zustände in Widgets folgen mit dem Umbau der Tabellen und Dashboards.
- **D3 Primärfarbe:** Marineblau `#1e40af` (dunkel `#93c5fd`). Ein späteres Corporate Design wird allein über die Tokens übernommen.
- **D4 Gruppen der Seitenleiste:** „Übersicht“, „Coins“, „Prüfung“, „Verwaltung“. „Ausgaben“ kommt erst mit einer künftigen Übersichtsseite.
- **D5 Einklappen:** `offcanvas` wie bisher, keine Icon-Leiste.
- **D6 Toast:** Base UI Toast, kein `sonner` (ADR-0038).
- **D7 Screenshots:** Die 36 PNG-Dateien in `docs/design/ablage/` werden eingecheckt und nur bei Bedarf neu erzeugt (`COIN_SCREENSHOTS=1`).
- **D8 CLAUDE.md:** Den Text aus Abschnitt 12 übernimmt der Mensch bzw. die Hauptsitzung beim Abschluss. Agenten ändern `CLAUDE.md` nicht.
- **D9 Klickflächen:** Bestehende Formulare wachsen auf 40 px. Textlinks in bestehenden Tabellen bleiben bis zum Tabellen-Umbau kleiner und sind von AK-34 ausgenommen.
- **D10 Bausteinseite:** ohne Anmeldung und ohne Sidebar-Eintrag, nur per URL in der Entwicklungsumgebung.
- **D11 Skip-Link:** Bestehende Tests, die nur wegen des zusätzlichen Tab-Stopps rot werden, dürfen um diesen einen Tab-Stopp ergänzt werden, mit Begründung im Bericht.
- **D12 Schrift:** Geist Variable bleibt.
- **D13 Ungenutzte Pakete:** `framer-motion` und `react-day-picker` werden in einem eigenen `chore/*`-Branch entfernt, nicht in diesem Feature.

## 14. Umsetzung und Abweichungen vom Entwurf
Umgesetzt auf `feature/design-fundament`. Neue Tests wie in Abschnitt 11.1, dazu `e2e/tests/design-fundament.spec.ts`. Die 36 Screenshots liegen in `docs/design/ablage/`; ohne `COIN_SCREENSHOTS=1` prüft `screenshots.spec.ts` nur, dass genau diese 36 Dateien vorhanden sind.

### Abweichungen
1. **„Kein Zugriff“ ohne Seitenkopf (Abschnitt 8, AK-36):** Das h1 steht direkt in der `Card`, gestaltet wie der Seitenkopf. Grund: `web/src/app/App.anmeldung.test.tsx:425` verlangt den Button „Abmelden“ im Elternelement des h1. Die Umstellung auf `Seitenkopf` folgt in einem Folgelauf mit freigegebener Testanpassung.
2. **Startseite zwischen 768 und 1023 px einspaltig:** Die Blöcke stehen erst ab `lg` (1024 px) dreispaltig (`StartseiteBloecke`, `lg:grid-cols-3`), vorher untereinander. Bei 768 px mit sichtbarer Seitenleiste führte die dreispaltige Anordnung zu horizontalem Scrollen (AK-33). Abgelöst durch das Zeilenraster aus [startseite-listen-pruefung](startseite-listen-pruefung.md) 4.1 (ADR-0043): Paarzeilen ab 1024 px zweispaltig, sonst eine Spalte.
3. **Prüfseite mit einer gemeinsamen Karte:** Formular und Ergebnis standen in einer `Card` statt in zwei (Abschnitt 8). Abgelöst durch [startseite-listen-pruefung](startseite-listen-pruefung.md) 4.3: Formular in einer Karte, das Ergebnis als eigene Ergebniskarte darunter.
4. **Formularfeld – Pflichtkennzeichnung (AK-13):** Ersetzt durch [ADR-0039](../adr/0039-formularmuster-und-validierung.md) Punkt 3 (formulare-detailseiten): sichtbar „(Pflicht)“ (`aria-hidden`), im zugänglichen Namen „(Pflichtfeld)“ (sr-only), z. B. „Name (Pflichtfeld)“.
5. **Zugänglicher Name des Zertifikat-Buttons (WCAG 2.5.3):** axe meldete `label-content-name-mismatch`, weil „Zertifikat C0042-0012 herunterladen“ den sichtbaren Text „Zertifikat herunterladen“ nicht zusammenhängend enthält. Auf Entscheidung des Auftraggebers vom 2026-11-13 heißt der Button jetzt „Zertifikat herunterladen: <Nummer>“, bei Storno „Zertifikat herunterladen: <Nummer> (nicht möglich, Ausgabe storniert)“. Der sichtbare Text bleibt gleich. Die betroffenen bestehenden Tests (u. a. `ZertifikatHerunterladen.test.tsx`, `App.zertifikat-erzeugen.test.tsx`, `e2e/tests/zertifikat-erzeugen.spec.ts`) wurden mit Freigabe angepasst. Nachgezogen in [zertifikat-erzeugen](zertifikat-erzeugen.md) AK-24 und Abschnitt 12.
6. **Toast-Ansage ohne `priority: 'high'`:** siehe Nachtrag in [ADR-0038](../adr/0038-toast-mit-base-ui.md).
7. **Schatten, dunkle `bg-muted`-Flächen, Skeleton:** siehe Nachtrag in [ADR-0035](../adr/0035-gestaltungsregeln-tokens-palette-schrift.md).

### Vormerkungen für Folgeläufe
- Brotkrumen auf bestehenden Seiten (D1), mit freigegebener Testanpassung.
- Zustände in Widgets (D2): erledigt in startseite-listen-pruefung (Abschnitt 13 dort).
- Tabellen-Umbau: erledigt für Exemplare, Ausgabehistorie, Benutzer, Audit-Log und Vorlagenversionen (`DatenTabelle`, Textlinks ≥ 40 px, ADR-0041). Der Katalog `/coins` hat seit startseite-listen-pruefung eine Kartenansicht, die Tabelle (`CoinListe`) nutzt aber weiter die shadcn-`Table` statt `DatenTabelle` (dort Abschnitt 14).
- Seitenkopf auf „Kein Zugriff“ (Abweichung 1).
- Entfernen von `framer-motion` und `react-day-picker` in einem `chore/*`-Branch (D13).
