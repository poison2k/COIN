# Feature: Katalog-Seiten (Katalog, Detail, Coin hinzufügen)

Status: umgesetzt (vom qa-reviewer freigegeben; Abweichungen und Ergänzungen in Abschnitt 11) · Entwurf Rev. 2 mit den Entscheidungen des Auftraggebers vom 2026-10-06 · Branch: `feature/katalog-seiten` (basiert auf `feature/rollen-benutzerverwaltung`) · ADRs: [0008](../adr/0008-frontend-struktur-feature-sliced-design.md), [0009](../adr/0009-ui-basis-shadcn-base-ui-tailwind.md), [0010](../adr/0010-tanstack-router-code-basiert.md), [0014](../adr/0014-coin-katalog-oeffentlich-lesbar.md), [0016](../adr/0016-berechtigungen-im-code-und-deaktivierte-benutzer.md). Ein neues ADR ist nicht nötig, weil keine bestehende Entscheidung geändert wird.

## 1. Ziel
Die Katalogseite `/coins` dient nur noch zum Ansehen. Sie hat eine Liste mit Suche und Blättern, ein Klick führt zur Detailseite `/coins/{id}`. Angelegt werden Coins auf der eigenen Seite `/coins/neu`, die nur Benutzer mit `coins.write` erreichen. Nach dem Speichern geht es zur Detailseite des neuen Coins. Die Vorgabe des Auftraggebers steht wörtlich im Auftrag zu diesem Branch.

Nicht im Umfang: Coins bearbeiten oder löschen, Verleihungen (nur ein Platzhalter), neue Funktionen für den Bild-Upload.

### Entscheidungen des Auftraggebers (2026-10-06)
1. **F1 Kein Zugriff, einheitlich:** Angemeldete mit Rolle, denen die benötigte Berechtigung fehlt, landen auf `/kein-zugriff` mit dem neuen Grund „keine Berechtigung“. Das gilt für alle Routen mit `erfordertBerechtigung`, also auch für `/benutzerverwaltung` (bisher Weiterleitung nach `/`).
2. **F2:** Anonyme Besucher auf `/coins/neu` melden sich an und kehren nach `/coins/neu` zurück.
3. **F3:** Ein vorhandenes Motivbild wird auf der Detailseite angezeigt.
4. **F4:** Die Benennung lautet „Katalog“ (Sidebar, `h1`), der Startseiten-Link heißt „Zum Katalog“.
5. **F5:** „Ausgaben“ sind **Verleihungen**. Verleihungen enthalten Personendaten und sind schutzbedürftig. Der Platzhalter heißt daher „Verleihungen“ und enthält keine Daten und keine Hinweise auf Personen. Zur Sichtbarkeit siehe Annahme A6.
6. **F6:** Das Motivbild bleibt im Formular, einschließlich des Wegs bei einem Teilerfolg.
7. **F7:** `GET /api/coins` wird ohne Abwärtskompatibilität auf das Seiten-Format umgestellt.

## 2. Ist-Stand (geprüft)
| Punkt | Stand | Folge |
|---|---|---|
| `GET /api/coins/{id}` | vorhanden, öffentlich, `404` „Coin nicht gefunden“ | wird unverändert genutzt |
| `GET /api/coins` | liefert ein Array **aller** Coins, sortiert nach `name`, ohne Suche und ohne Paginierung | wird erweitert (Abschnitt 5.1) |
| Seiten-Format | `/api/benutzer` und `/api/audit` liefern `{ eintraege, gesamt, seite, groesse }`. `Seite<T>` liegt in `Coin.Domain.Benutzer`, die Validierung in `BenutzerverwaltungService` | wird für Coins wiederverwendet |
| Frontend `/coins` | `CoinListeSeite` enthält Formular und Liste. Prop `erfassen` (`erlaubt`/`anmelden`/`keineBerechtigung`/`unbekannt`) kommt aus `BenutzerKontext` | Formular entfällt dort, `erfassen` entfällt |
| `CoinFormular` | liegt bereits in `features/coin-anlegen` (inkl. optionalem Motivbild, Teilerfolg mit „Bild erneut hochladen“) | wird wiederverwendet, Callback ändert sich |
| Guard | `erfordertBerechtigung(b)`: anonym → Anmeldung mit Rückkehrziel; deaktiviert/ohne Rolle → `/kein-zugriff`; mit Rolle ohne Recht → `/` | Letzter Zweig ändert sich (Entscheidung F1) |
| `/kein-zugriff` | Guard lässt nur „deaktiviert“ und „ohne Rolle“ zu, sonst `/` (Rev. 3, AK-43) | wird um den Grund „keine Berechtigung“ erweitert |
| Berechtigungen | `coins.read`, `coins.write`, `users.manage`, `audit.read`; keine für Verleihungen | Platzhalter ohne Berechtigungsbindung (A6) |
| Endpunkttabelle `docs/berechtigungen.md` | `GET /api/coins` öffentlich | **keine Änderung**, es kommt kein Endpunkt hinzu |

## 3. Akzeptanzkriterien

### Backend: Suche und Paginierung im Katalog
- **AK-1** `GET /api/coins?suche=&seite=1&groesse=25` bleibt öffentlich (`[AllowAnonymous]`, ADR-0014) und liefert `200` mit `{ eintraege: Coin[], gesamt, seite, groesse }`. Das Coin-Format bleibt unverändert (sieben Felder). Ohne Parameter gelten `seite=1` und `groesse=25`. Ein Array-Format gibt es nicht mehr (Entscheidung F7).
- **AK-2** `suche` ist optional, wird getrimmt, leer heißt alle. Gesucht wird ein Teilstring in `name` **oder** `herausgeber`, ohne Beachtung der Groß-/Kleinschreibung. `%`, `_` und `\` gelten wörtlich. Die Abfrage ist parametrisiert.
- **AK-3** Sortierung: `name` ohne Beachtung der Groß-/Kleinschreibung, dann `id`. Die Reihenfolge ist auch bei gleichen Namen über Seiten hinweg stabil.
- **AK-4** Validierung (`400` ValidationProblemDetails, Titel „Eingaben ungültig“), Meldungen wörtlich wie bei `/api/benutzer`:
  - `seite < 1`: „Die Seite muss mindestens 1 sein.“
  - `groesse` außerhalb 1–100: „Die Seitengröße muss zwischen 1 und 100 liegen.“
  - `suche` nach dem Trimmen länger als 100 Zeichen: „Der Suchbegriff darf höchstens 100 Zeichen lang sein.“
  - Keine Zahl: „Ungültiger Wert für dieses Feld.“
  - Mehrere Fehler werden gemeinsam gemeldet. Eine Seite hinter dem Ende liefert `eintraege: []` mit korrektem `gesamt`.
- **AK-5** Die Antwort hängt nicht vom Token ab: Anonym, mit ungültigem Token und mit dem Token eines Deaktivierten ist sie identisch `200` (AK-5 aus rollen-benutzerverwaltung bleibt grün). Es gibt keinen Benutzerabgleich. Das Request-Protokoll enthält weder `suche` noch die Query (ADR-0019, Route `/api/coins`).
- **AK-6** `GET /api/coins/{id}`, `POST /api/coins` und die Bild-Endpunkte bleiben unverändert. Die Endpunkttabelle in `docs/berechtigungen.md` bleibt unverändert, `EndpunktTabelleTests` und `EndpunktInventarTests` bleiben ohne Anpassung grün.

### Frontend: Routen und Schutz
- **AK-7** Neue Routen in `app/router/router.tsx`, Pfade in `shared/config/routen.ts`: `coinNeu: '/coins/neu'` und `coinDetail: '/coins/$coinId'`, beide in der Shell. `/coins/neu` zeigt immer die Seite „Coin hinzufügen“ und nie die Detailseite. Es gibt nie einen Request `GET /api/coins/neu` (TanStack rangiert statische Segmente vor Parametern; Test in Vitest).
- **AK-8** `/coins/{coinId}` mit einer `coinId`, die keine GUID ist (z. B. `/coins/abc`), zeigt „Coin nicht gefunden“ (AK-17), ohne die API aufzurufen.
- **AK-9** `/coins/neu` hat `beforeLoad: erfordertBerechtigung('coins.write')`:
  - Anonym startet die Anmeldung mit Rückkehrziel `/coins/neu` (Entscheidung F2). Nach der Rückkehr greift der Guard erneut: Berechtigte sehen das Formular, alle anderen werden wie unten weitergeleitet.
  - Deaktiviert oder ohne Rolle: Weiterleitung nach `/kein-zugriff` (wie bisher).
  - Mit Rolle ohne `coins.write` (Betrachter): Weiterleitung nach `/kein-zugriff?grund=berechtigung` mit `replace` (Entscheidung F1).
  - Anmeldung nicht konfiguriert: Weiterleitung nach `/` (wie bisher).
  - Die Routen-Komponente rendert das Formular nur mit `coins.write`, sonst nichts (wie `BenutzerverwaltungRoute`).
- **AK-10** `/kein-zugriff?grund=berechtigung` zeigt für angemeldete Benutzer **mit** Rolle die Seite „Kein Zugriff“ mit dem Grund `keineBerechtigung` (Entscheidung F1):
  - `h1` „Kein Zugriff“, Text „Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.“
  - Link „Zum Coin-Katalog“ und Button „Abmelden“, kein „Erneut prüfen“ (Entscheidung F2 aus Rev. 3: keine Prüfung für Benutzer mit Rolle).
  - Deaktiviert und „ohne Rolle“ haben Vorrang vor dem Parameter und zeigen ihre bisherigen Texte. Ohne Parameter leitet der Guard Benutzer mit Rolle wie bisher nach `/` (Rev. 3, AK-43 bleibt grün). Einen anderen Wert von `grund` ignoriert der Guard.
- **AK-11** Dieselbe Regel gilt einheitlich für alle Routen mit `erfordertBerechtigung` (Entscheidung F1). Ein Betrachter oder Sachbearbeiter, der `/benutzerverwaltung` aufruft, landet auf `/kein-zugriff?grund=berechtigung` statt auf `/`. Diese AK ersetzt den Punkt „Mit Rolle ohne Berechtigung: Weiterleitung nach `/`“ aus AK-25 in rollen-benutzerverwaltung.

### Seite „Katalog“ (`/coins`)
- **AK-12** Die Seite enthält kein Formular: kein `<form>` außer der Suche, keine Eingabefelder außer dem Suchfeld. Die Texte „Neuen Coin erfassen“, „Zum Erfassen von Coins melden Sie sich bitte an.“ und „Coins erfassen können nur Administratoren und Sachbearbeiter.“ entfallen. `h1` „Katalog“ (Entscheidung F4).
- **AK-13** Link „Coin hinzufügen“ (Router-`Link` mit `buttonVariants`, Ziel `/coins/neu`, Icon `PlusIcon` mit `aria-hidden`) neben der Überschrift, **nur** mit `coins.write` aus `/api/me`. Anonym, als Betrachter, ohne Rolle, deaktiviert, während `/api/me` lädt und bei einem Fehler von `/api/me` ist er nicht im DOM.
- **AK-14** Suche:
  - Suchfeld mit Label „Coins suchen“ (`type="search"`, `maxLength` 100) und Button „Suchen“. Enter löst die Suche aus, die Suche springt auf Seite 1.
  - `role="status"` meldet „{n} Coins gefunden“ bzw. „1 Coin gefunden“.
  - Leerer Katalog ohne Suchbegriff: „Noch keine Coins erfasst.“ Kein Treffer mit Suchbegriff: „Keine Coins gefunden.“
  - Suchbegriff und Seite stehen in der URL (`/coins?suche=…&seite=2`). Neuladen sowie „Zurück“ von der Detailseite zeigen dieselbe Suche und Seite. Ungültige Werte in der URL (`seite=0`, `seite=abc`) gelten als Seite 1, ein `suche` über 100 Zeichen wird auf 100 gekürzt. Es gibt keinen `400` durch manipulierte URLs.
- **AK-15** Tabelle mit sr-only-Caption „Coins“ und den Spalten Bild, Name, Herausgeber, Auflage, Erfasst am (wie bisher; „Kein Bild“, „unbekannt“). Der Name jeder Zeile ist ein Link zur Detailseite (`/coins/{id}`), erreichbar mit Tab und auslösbar mit Enter. Zusätzlich ist die ganze Zeile per Maus klickbar, ohne dass ein zweiter Tab-Stopp entsteht. Blättern mit `Blaettern` aus `shared/ui` (25 je Seite, „Vorherige Seite“, „Seite x von y“, „Nächste Seite“, am Rand `disabled`).
- **AK-16** Zustände: Laden `role="status"` „Coins werden geladen …“. Fehler `role="alert"` „Coins konnten nicht geladen werden. Bitte später erneut versuchen.“ (Texte wie bisher). Eine veraltete Antwort (schnelles Suchen und Blättern) überschreibt nie eine neuere.

### Detailseite (`/coins/{id}`)
- **AK-17** Die Seite lädt `GET /api/coins/{id}`:
  - Laden: `role="status"` „Coin wird geladen …“.
  - `404`: `h1` „Coin nicht gefunden“, Text „Diesen Coin gibt es nicht im Katalog.“, Link „Zum Katalog“.
  - Sonstiger Fehler: `role="alert"` „Der Coin konnte nicht geladen werden. Bitte später erneut versuchen.“
- **AK-18** Bei Erfolg:
  - `h1` = Name des Coins.
  - Beschreibungsliste (`<dl>`) mit Herausgeber, Auflage (Zahl im Format `de-DE` oder „unbekannt“), Erfasst am (`de-DE`, Datum), Beschreibung (Zeilenumbrüche bleiben erhalten, sonst „Keine Beschreibung“).
  - Alle Inhalte als Text, nie als HTML.
  - Mit `bildUrl` das Motivbild per `<img src={bildUrl}>`, `alt` „Motiv: {Name}“, höchstens 320 × 320 px (Entscheidung F3). Ohne Bild der Text „Kein Motivbild vorhanden.“
  - Link „Zurück zum Katalog“ (`/coins`).
- **AK-19** Platzhalter „Verleihungen“ (Entscheidung F5, Annahme A6):
  - Abschnitt mit `h2` „Verleihungen“ und genau dem Text „Dieser Bereich wird in einer späteren Version ergänzt.“
  - Sichtbar für alle, auch anonym. Er hängt an keiner Berechtigung.
  - Er enthält keine Daten, keine Zahlen (z. B. keine Anzahl der Verleihungen), keine Namen und keine Formulierungen über Personen oder Empfänger. Es gibt keinen Request dafür.
  - Das Coin-DTO wird dafür nicht erweitert.
  - Der Begriff „Ausgaben“ kommt in der Oberfläche nicht vor.
- **AK-20** Die Detailseite zeigt keine Bearbeiten-, Löschen- oder Upload-Bedienelemente, auch nicht mit `coins.write`.

### Seite „Coin hinzufügen“ (`/coins/neu`)
- **AK-21** `h1` „Coin hinzufügen“, darunter `CoinFormular` aus `features/coin-anlegen`. Felder, Labels, Hinweise, Validierung und Fehlermeldungen bleiben unverändert, einschließlich des optionalen Motivbilds (Entscheidung F6). Link „Abbrechen“ führt zu `/coins`, ohne zu speichern.
- **AK-22** Nach erfolgreichem Anlegen (ohne Bild, oder mit Bild und erfolgreichem Upload) navigiert die App mit `replace` nach `/coins/{neue id}`:
  - Die Detailseite zeigt `role="status"` „Coin wurde angelegt.“
  - Der Fokus liegt auf dem `h1` der Detailseite (`tabIndex={-1}`).
  - „Zurück“ im Browser führt nicht zurück auf das ausgefüllte Formular.
  - Nach dem Neuladen der Detailseite oder einem erneuten Aufruf über den Katalog erscheint die Meldung nicht wieder.
- **AK-23** Teilerfolg (Coin angelegt, Bild-Upload fehlgeschlagen, Entscheidung F6): Die Seite bleibt stehen und zeigt die bisherige Meldung „Coin wurde angelegt, das Bild konnte nicht gespeichert werden: {Grund}“ mit „Bild erneut hochladen“. Zusätzlich gibt es den Button „Ohne Bild fortfahren“.
  - Gelingt der erneute Upload, gilt AK-22.
  - „Ohne Bild fortfahren“ navigiert wie in AK-22, mit der Meldung „Coin wurde ohne Motivbild angelegt.“
- **AK-24** Fehlerfälle bleiben wie bisher auf der Seite:
  - `400` als Feldfehler.
  - `409` „Ein Coin mit diesem Namen und Herausgeber existiert bereits.“, die Eingaben bleiben erhalten.
  - `403` mit dem jeweiligen Text, `401` mit dem Hinweis auf die Anmeldung.
  - Es gibt keine Navigation und keinen doppelten POST (bestehende Sende-Sperre).

### Navigation, Barrierefreiheit, Struktur
- **AK-25** Der Sidebar-Eintrag heißt „Katalog“ (Ziel `/coins`, `ListIcon`, Entscheidung F4). Er ist auf `/coins`, `/coins/neu` und `/coins/{id}` als aktiv markiert. `aria-current="page"` trägt er nur auf `/coins`. Der Link auf der Startseite heißt „Zum Katalog“. Einen Sidebar-Eintrag für „Coin hinzufügen“ gibt es nicht.
- **AK-26** Barrierefreiheit (WCAG 2.1 AA / BITV) auf allen drei Seiten:
  - Jede Seite hat genau ein `h1`.
  - Alle Bedienelemente (Suche, „Suchen“, Namens-Links, Blättern, „Coin hinzufügen“, Formular, „Abbrechen“, „Zurück zum Katalog“) sind per Tastatur in sinnvoller Reihenfolge erreichbar und haben einen sichtbaren Fokus (`focus-visible`-Ring).
  - Links haben Link-Semantik, Buttons Button-Semantik („Coin hinzufügen“ ist ein Link).
  - Bilder haben ein deutsches `alt`, Icons sind `aria-hidden`.
  - Alle Texte sind deutsch, auch `sr-only`, `aria-label` und Caption. Die Englisch-Prüfung der bestehenden Tests läuft für die drei Seiten und für „Kein Zugriff“ mit dem Grund `keineBerechtigung`.
- **AK-27** FSD nach Abschnitt 5.3, `npm run lint` (ESLint + Steiger) ohne Befund. Seiten verwenden keine Router-Hooks: Parameter, Suche und Navigation reicht `app/router/routen-komponenten.tsx` als Props durch. Es gibt keine Querimporte zwischen Slices. Neue shadcn-Komponenten sind nicht nötig.

### Tests und Abschluss
- **AK-28** Systemtest `e2e/tests/katalog-seiten.spec.ts` mit echter API und echtem Keycloak:
  1. `admin@test.local` (berechtigt) öffnet `/coins`, klickt „Coin hinzufügen“ und legt einen Coin mit eindeutigem Namen an. Er landet auf `/coins/{id}` mit „Coin wurde angelegt.“, den eingegebenen Stammdaten und dem Abschnitt „Verleihungen“.
  2. Im Katalog findet die Suche nach dem Namen genau diesen Coin, und ein Klick auf den Namen öffnet die Detailseite.
  3. `betrachter@test.local` mit der Rolle Betrachter sieht `/coins` ohne „Coin hinzufügen“ und ohne Formular. Die Rolle setzt der Test vorher als Admin über die Benutzerverwaltung, wiederholbar wie in `benutzerverwaltung.spec.ts`. Ein direkter Aufruf von `/coins/neu` endet auf „Kein Zugriff“ mit dem Text aus AK-10, es gibt keinen `POST /api/coins`.
  4. Anonym zeigt `/coins` die Liste ohne „Coin hinzufügen“. Die Detailseite ist anonym lesbar.
- **AK-29** `dotnet build` ohne Warnungen, `dotnet test`, `npm test`, `npm run test:ui`, `npm run lint`, `npm run build` (inkl. `tsc -b`) und `npx playwright test` in `e2e/` sind grün. Die Doku nach Abschnitt 8 ist nachgezogen.

## 4. Datenmodell
Keine Änderung an Tabellen oder Migrationen. Die Suche läuft als `ILIKE '%…%'` auf `coin_typ.name` und `coin_typ.herausgeber`, ohne zusätzlichen Index (die Katalogmenge ist klein; `pg_trgm` erst bei Bedarf, siehe Annahme A2).

## 5. Lösungsentwurf

### 5.1 Backend
- **Domain**
  - `Seite<T>` zieht aus `Coin.Domain.Benutzer` in einen neutralen Namespace (Vorschlag `Coin.Domain.Gemeinsam`).
  - Die Seiten-Validierung (`SeiteFehler`, `GroesseMin/Max`, `StandardGroesse`, `SucheMaxLaenge`) kommt in eine gemeinsame statische Klasse `Seitenabfrage`, die `BenutzerverwaltungService` und `CoinKatalogService` nutzen. Das Verhalten der Benutzerverwaltung bleibt gleich.
  - `CoinKatalogService.SuchenAsync(string? suche, int? seite, int? groesse, ct) : Ergebnis<Seite<CoinEintrag>>` ersetzt `AuflistenAsync`.
  - `ICoinKatalogRepository.SuchenAsync(string? suche, int seite, int groesse, ct)` ersetzt `AlleAsync`.
- **Infrastruktur**: `CoinKatalogRepository.SuchenAsync` mit `EF.Functions.ILike(…, muster, "\\")` auf `Name` oder `Herausgeber`, `OrderBy(Name.ToLower()).ThenBy(Id)`, `Count` und `Skip`/`Take`. Das Maskieren und die Versatz-Berechnung aus `BenutzerverwaltungRepository` werden in einen internen Helfer ausgelagert und gemeinsam genutzt.
- **API**: `CoinsController.Auflisten([FromQuery] CoinSucheAnfrage anfrage, ct)`, bleibt `[AllowAnonymous]`. Die Query-Bindung erfolgt wie bei `BenutzerController` (gleiche Fehlermeldung „Ungültiger Wert für dieses Feld.“ für Nicht-Zahlen). Antwort: `SeiteResponse<CoinResponse>`. Keine Logik im Controller.
- **Breaking Change** (Entscheidung F7): `GET /api/coins` liefert statt eines Arrays ein Seiten-Objekt. Der einzige Client ist das eigene Frontend; es wird im selben Branch angepasst.

### 5.2 Routing (`app/router`)
```
shell
├── /                 StartSeite
├── /coins            CoinListeRoute     validateSearch: { suche?: string (≤100), seite?: number (≥1) }
├── /coins/neu        CoinAnlegenRoute   beforeLoad: erfordertBerechtigung('coins.write')
├── /coins/$coinId    CoinDetailRoute    params.coinId (GUID-Prüfung in der Route-Komponente bzw. per params.parse)
├── /kein-zugriff     KeinZugriffRoute   validateSearch: { grund?: 'berechtigung' }
└── /benutzerverwaltung  (unverändert, aber neues Guard-Ergebnis nach AK-11)
```
- `/coins/neu` und `/coins/$coinId` sind Geschwister von `/coins`, keine Kinder, weil `/coins` keinen `<Outlet>` hat. Statische Segmente gehen in TanStack Router vor Parametern, die Reihenfolge im Array ist also egal. Ein Vitest prüft das trotzdem (AK-7).
- `schutz.ts`: In `erfordertBerechtigung` wird der letzte Zweig zu `throw redirect({ to: ROUTEN.keinZugriff, search: { grund: 'berechtigung' }, replace: true })`. Der `/kein-zugriff`-Guard lässt Benutzer mit Rolle nur mit `grund === 'berechtigung'` durch.
- Erfolgsmeldung nach dem Anlegen: `navigate({ to: ROUTEN.coinDetail, params, replace: true, state: { coinAngelegt: 'mitBild' | 'ohneBild' } })`. `CoinDetailRoute` liest den Wert einmal und reicht ihn als Prop `meldung` an die Seite. Danach wird er so verbraucht, dass Neuladen ihn nicht erneut zeigt, z. B. per `navigate({ replace: true, state: {} })` (AK-22). Das genaue Vorgehen ist Sache des developers.
- `routen-komponenten.tsx`:
  - `CoinListeRoute`: Search lesen, `onSuche`/`onSeite` → `navigate({ search })`, `darfAnlegen = hatBerechtigung(benutzer, 'coins.write')`.
  - Neu: `CoinAnlegenRoute` und `CoinDetailRoute`.
  - `KeinZugriffRoute`: zusätzlich Grund `keineBerechtigung`.
- `benutzer-kontext.ts`/`use-benutzer.ts`: `erfassen` und der Typ `Erfassen` entfallen. Die Berechtigung kommt direkt aus `hatBerechtigung(benutzer, 'coins.write')`.

### 5.3 Frontend-Slices (FSD, Public API je `index.ts`)
```
shared/config/routen.ts      + coinNeu: '/coins/neu', coinDetail: '/coins/$coinId'
shared/api                   unverändert (Seite<T>, ApiErgebnis vorhanden)
shared/ui                    vorhanden: button (buttonVariants), input, label, table, blaettern, card, skeleton
                             – keine neuen shadcn-Komponenten
shared/lib/guid.ts (neu)     istGuid(text) für AK-8  · index.ts
entities/coin/
  api/coins.ts               ladeCoins({ suche, seite, groesse }): ApiErgebnis<Seite<Coin>> (ersetzt die Array-Variante),
                             ladeCoin(id): ApiErgebnis<Coin> (404 → nichtGefunden); legeCoinAn, ladeBildHoch unverändert
  ui/CoinListe.tsx           Name als Link (to=ROUTEN.coinDetail, params), Zeile klickbar (Maus), sr-only-Caption „Coins“
  ui/CoinStammdaten.tsx      neu: <dl> mit Herausgeber, Auflage, Erfasst am, Beschreibung; Motivbild (AK-18)
  index.ts                   + ladeCoin, CoinStammdaten
features/coin-anlegen/
  ui/CoinFormular.tsx        Prop onAngelegt(coin, { bild: 'gespeichert' | 'ohne' }) statt onGespeichert; wird erst
                             aufgerufen, wenn nichts mehr offen ist (AK-22/AK-23); Button „Ohne Bild fortfahren“
  index.ts                   CoinFormular, CoinFormularProps
widgets/coin-katalog/ (neu)  ui/CoinKatalog.tsx: Suchformular, Statuszeile, CoinListe, Blaettern, Lade-/Fehlerzustand;
                             Props { suche, seite, onSuche, onSeite }; lädt über ladeCoins, verwirft veraltete Antworten
                             index.ts: CoinKatalog
pages/coin-liste/            CoinListeSeite { suche, seite, darfAnlegen, onSuche, onSeite }: h1 „Katalog“,
                             Link „Coin hinzufügen“ nur bei darfAnlegen, darunter CoinKatalog. Kein Formular-Import mehr.
                             index.ts: CoinListeSeite (Typ Erfassen entfällt)
pages/coin-detail/ (neu)     CoinDetailSeite { coinId, meldung? }: lädt ladeCoin, h1 (fokussierbar), CoinStammdaten,
                             Abschnitt „Verleihungen“ (statischer Platzhalter, AK-19), „Zurück zum Katalog“, 404-/Fehlerzustand
                             index.ts: CoinDetailSeite
pages/coin-anlegen/ (neu)    CoinAnlegenSeite { onAngelegt }: h1 „Coin hinzufügen“, CoinFormular, Link „Abbrechen“
                             index.ts: CoinAnlegenSeite
pages/kein-zugriff/          Grund 'keineBerechtigung' (ohne onErneutPruefen), Text nach AK-10
pages/start/                 Linktext „Zum Katalog“
widgets/app-shell/           AppSidebar: Titel „Katalog“; aktiv bei pfad === '/coins' || pfad.startsWith('/coins/')
app/router/                  siehe 5.2
```
Importrichtung: `pages/coin-liste` → `widgets/coin-katalog` → `entities/coin` → `shared`. `pages/coin-anlegen` → `features/coin-anlegen` → `entities/coin`. `pages/coin-detail` → `entities/coin`. Die Liste liegt in einem Widget, damit die Seite schlank bleibt und der Zustand aus Suche, Laden und Blättern für sich testbar ist (Muster `widgets/benutzer-tabelle`).

`CoinListe` in `entities/coin` verwendet den Router-`Link` mit `ROUTEN.coinDetail`, wie schon `pages/start` und `pages/kein-zugriff`. Das ist ein Import aus einer externen Bibliothek und aus `shared`, kein Querimport.

## 6. Tests
| Ebene | Inhalt |
|---|---|
| xUnit Unit | `Seitenabfrage`-Validierung (Grenzen, Trimmen, 100/101 Zeichen); `CoinKatalogService.SuchenAsync` mit Fake-Repository (Fehler gesammelt, leere Suche → `null`, Standardwerte). Die bestehenden Benutzerverwaltungs-Tests bleiben grün. |
| xUnit Integration | Neu `Coins/CoinSucheTests` für AK-1 bis AK-5: Format, Standardwerte, Teilstring in Name/Herausgeber, Groß-/Kleinschreibung, `%`/`_`/`\` wörtlich, Sortierung mit Tie-Break über `id`, Seite hinter dem Ende, alle `400`-Fälle, anonym = ungültiges Token = deaktiviert. **Anzupassen:** `CoinLesenTests` auf das Seiten-Format. `LogTests` erweitert: `GET /api/coins?suche=geheim` → Route `/api/coins`, kein `geheim` im Log. `EndpunktTabelleTests`/`EndpunktInventarTests` bleiben unverändert grün (AK-6). |
| Vitest | **Neu:** <ul><li>`ladeCoins` (Query-Encoding, leere Suche nicht senden), `ladeCoin` (404), `istGuid`</li><li>`CoinListe` (Name-Link mit `href`, Caption)</li><li>`CoinKatalog` (Suche mit Enter, Statustexte inkl. Singular, Leer-/Kein-Treffer-Text, Blättern, veraltete Antwort verworfen)</li><li>`CoinListeSeite` (kein `form` außer der Suche, Link „Coin hinzufügen“ nur bei `darfAnlegen`)</li><li>`CoinDetailSeite`: Felder, „unbekannt“, „Keine Beschreibung“, Zeilenumbrüche, Bild/kein Bild, 404, Fehler, Abschnitt „Verleihungen“ mit genau dem Platzhaltertext, ohne Ziffern und ohne das Wort „Ausgaben“, kein zusätzlicher Request, keine Bearbeiten-Elemente, Meldung und Fokus auf `h1`</li><li>`CoinFormular` (`onAngelegt` genau einmal, nicht bei Teilerfolg, „Ohne Bild fortfahren“), `CoinAnlegenSeite`</li><li>`KeinZugriffSeite` mit Grund `keineBerechtigung`</li><li>`App.*.test.tsx`: `/coins/neu` für Admin, Sachbearbeiter, Betrachter, ohne Rolle, deaktiviert und anonym; `/coins/neu` ruft nie `GET /api/coins/neu` auf; `/coins/abc` ohne API-Aufruf; Anlegen → Detailseite mit Meldung, Neuladen ohne Meldung; Sidebar „Katalog“ aktiv auf Unterseiten; Englisch-Prüfung</li></ul>**Anzupassen wegen F1 (AK-11):** <ul><li>`app/router/schutz.test.ts` „leitet den Betrachter für users.manage zur Startseite“ → `/kein-zugriff?grund=berechtigung`</li><li>`app/App.benutzerverwaltung.test.tsx` „leitet %s zur Startseite“ (Betrachter, Sachbearbeiter) → „Kein Zugriff“ mit dem Text aus AK-10</li></ul>Unverändert bleiben `App.anmeldung.test.tsx` „leitet Benutzer mit Rolle zur Startseite“ (`/kein-zugriff` ohne Parameter) und die Tests zu „Erneut prüfen“ → Startseite. **Anzupassen wegen F4 und dem entfallenen Formular:** `CoinListeSeite.erfassen.test.tsx` (entfällt bzw. ersetzt), die Teile zu „Neuen Coin erfassen“/`erfassen` und „Coins erfassen können nur …“ in `App.anmeldung.test.tsx` und `App.benutzerverwaltung.test.tsx`, die Namen „Coin-Liste“/„Coin-Katalog“/„Zur Coin-Liste“ in `App.test.tsx`, `App.anmeldung.test.tsx` und `StartSeite.test.tsx`. |
| UI-Test `web/ui-tests/katalog-seiten.spec.ts` (gemockte API und IdP, Muster `meldeAnAls`) | **Neu:** <ul><li>Admin: Katalog → „Coin hinzufügen“ → Formular per Tastatur ausfüllen → Enter → POST-Body geprüft → URL `/coins/{id}`, Status „Coin wurde angelegt.“, Fokus auf `h1`. Die Zurück-Taste führt nicht zum Formular.</li><li>Betrachter: kein „Coin hinzufügen“. Direktaufruf von `/coins/neu` → „Kein Zugriff“ mit dem Text aus AK-10, kein POST.</li><li>Anonym: Direktaufruf startet die Anmeldung mit Rückkehrziel.</li><li>Suche und Blättern mit Mock (`seite`/`suche` in Request und URL). „Zurück“ von der Detailseite stellt Suche und Seite wieder her.</li><li>Tastatur: Tab bis zum Namens-Link, Enter öffnet die Detailseite.</li><li>Sichtbarer Fokus an Suche, Namens-Link, Blättern, „Coin hinzufügen“ und „Zurück zum Katalog“.</li><li>404-Detailseite; Abschnitt „Verleihungen“ anonym ohne zusätzlichen Request.</li><li>Teilerfolg beim Bild (Mock 415) → „Ohne Bild fortfahren“.</li></ul>**Anzupassen:** `benutzerverwaltung.spec.ts` „Direktaufruf von /benutzerverwaltung als Betrachter führt zur Startseite“ → „Kein Zugriff“ (F1). Die Sidebar-Namen in `app-shell.spec.ts`, `anmeldung.spec.ts` und `benutzerverwaltung.spec.ts` auf „Katalog“ umstellen (F4). |
| Systemtest `e2e/` | **Neu:** `tests/katalog-seiten.spec.ts` nach AK-28. Weil sich die Tests eines Laufs die Datenbank teilen, findet der Test seinen Coin über die Suche, nicht über die erste Seite. **Anzupassen:** <ul><li>`coin-katalog.spec.ts` auf `/coins/neu` und die Detailseite umstellen (Anlegen, Duplikat, Pflichtfeld, Bild sichtbar auf der Detailseite).</li><li>`anmeldung.spec.ts (c)` und `benutzerverwaltung.spec.ts` Schritt 4: Statt des entfallenen Hinweistexts prüfen sie das Fehlen von „Coin hinzufügen“; Sidebar-Link „Katalog“ statt „Coin-Liste“.</li></ul> |

## 7. Sicherheit und Datenschutz
- Die Absicherung bleibt im Backend: `POST /api/coins` verlangt weiter `coins.write`. Button und Route-Guard blenden nur aus und leiten weiter (AK-9, AK-24).
- Der öffentliche Such-Endpunkt ist begrenzt: Suchbegriff höchstens 100 Zeichen, höchstens 100 Einträge je Seite, parametrisiertes `ILIKE` mit maskierten Platzhaltern (keine SQL-Injection, kein Wildcard-Missbrauch). Ein Rate-Limit gibt es wie bei den übrigen öffentlichen GETs nicht (Annahme A3).
- Das Coin-DTO bleibt ohne Personendaten. `gesamt` verrät nur die Anzahl öffentlicher Coins.
- Verleihungen (Personendaten): Der Platzhalter ist statischer Text ohne Daten und ohne Request (AK-19). Die öffentliche Detailseite verrät also weder, ob es zu einem Coin Verleihungen gibt, noch wie viele oder an wen. Verleihungsdaten dürfen künftig nie in das öffentliche Coin-DTO, sondern nur über einen eigenen geschützten Endpunkt kommen (ADR-0014, Annahme A6).
- `suche` landet nicht im Request-Log (nur das Routen-Template, ADR-0019). Das Frontend schreibt `suche` in die URL. Das ist unkritisch, weil Coin-Namen öffentlich sind und keine Personendaten gesucht werden.
- Das Motivbild auf der Detailseite kommt über den bestehenden öffentlichen Endpunkt mit `nosniff` und CSP-Sandbox. Es gibt keinen neuen Upload-Pfad.
- Die Navigation mit `state` überträgt nur einen festen Meldungsschlüssel, keine Daten aus der Eingabe.
- `/kein-zugriff?grund=berechtigung` gibt keine Information preis, die der Benutzer nicht ohnehin hat. Der Parameter gewährt nichts: Er wählt nur den Text für Benutzer mit Rolle.

## 8. Doku-Bedarf
- `docs/api.md`: `GET /api/coins` mit `suche`/`seite`/`groesse`, Seiten-Format, `400`-Fälle, Hinweis auf den Breaking Change. Fehlerschlüssel `suche`/`seite`/`groesse` auch für die Coin-Liste. „Keine Paginierung“ streichen.
- `docs/berechtigungen.md`: keine Änderung an den Tabellen.
- `docs/requirements.md`:
  - Funktion 1 „Liste mit Suche“ und Funktion 5 „Detailansicht“ als teilweise umgesetzt markieren (ohne Filter, Bearbeiten und Verleihungshistorie).
  - Entscheidungen vom 2026-10-06 festhalten (Abschnitt 1).
  - Für Verleihungen vermerken: Lesen braucht eine eigene Berechtigung, siehe A6. Welche Rollen sie erhalten, bleibt eine offene Frage für das nächste Feature; die Zeile zum Betrachter ist bereits mit [?] markiert.
- `docs/benutzer/coin-katalog.md`: Katalog suchen und blättern, Detailseite, „Coin hinzufügen“ (nur Administrator/Sachbearbeiter), Weiterleitung nach dem Speichern.
- `docs/benutzer/anmeldung.md` bzw. `benutzerverwaltung.md`: „Kein Zugriff“ auch bei fehlender Berechtigung für eine Seite.
- `docs/features/rollen-benutzerverwaltung.md` AK-25: Hinweis „geändert durch katalog-seiten AK-11 (Rolle ohne Berechtigung → Kein Zugriff)“. `docs/features/coin-katalog.md`: Hinweis „Formular auf eigener Seite (katalog-seiten)“.
- ADR-0010, Abschnitt Entscheidung: Die Routenliste ist nur beispielhaft. Eine Ergänzung um `/coins/neu` und `/coins/$coinId` ist optional, ein neues ADR ist nicht nötig.
- `CLAUDE.md` „Aktueller Stand“ (nur mit Freigabe des Menschen): Katalogseiten (Liste mit Suche/Paginierung, Detail, Coin hinzufügen).

## 9. Annahmen
- A1: Gesucht wird in Name und Herausgeber, nicht in der Beschreibung.
- A2: Ohne zusätzlichen Index ist die Suche bei der erwarteten Katalogmenge (hunderte bis wenige tausend Coins) schnell genug.
- A3: Für öffentliche GETs ist kein Rate-Limit nötig. Das bleibt eine Betriebsfrage, solange der Betriebsort offen ist (`requirements.md`).
- A4: Suche und Seite gehören in die URL, damit „Zurück“ von der Detailseite funktioniert. Das ist nicht ausdrücklich verlangt, aber für „Klick öffnet die Detailseite“ nötig.
- A5: Im Systemtest ist `admin@test.local` die berechtigte Rolle. Der Sachbearbeiter wird im Vitest und im UI-Test abgedeckt, damit der Systemtest keine weitere Rollenvergabe braucht.
- A6: **Sichtbarkeit des Platzhalters „Verleihungen“** (Entscheidung F5):

  | Option | Bewertung |
  |---|---|
  | a) nur mit passender Berechtigung | Es gibt noch keine: `coins.read` meint den Katalog, `coins.write` das Ändern. Eine dieser Berechtigungen als Ersatz zu nehmen, würde eine falsche Rechtezuordnung festschreiben, die das nächste Feature wieder lösen müsste. |
  | b) nur für Angemeldete bzw. mit Rolle | auch eine Ersatzregel ohne fachliche Grundlage; schützt nichts, weil der Platzhalter keine Daten enthält |
  | **c) neutraler Platzhalter für alle (gewählt)** | Er enthält keine Daten, keine Zahlen und keine Personenhinweise, es gibt also nichts zu schützen. Keine Ersatzberechtigung, keine Vorentscheidung über die Rechte. |

  **Vermerk für das Feature Verleihungen:**
  - Eine neue Berechtigung (z. B. `verleihungen.read`, ggf. `verleihungen.write`) kommt in die Rechtematrix (ADR-0016, `docs/berechtigungen.md`). Welche Rollen sie bekommen, entscheidet der Auftraggeber; zum Betrachter ist das in `requirements.md` noch offen [?].
  - Der Abschnitt „Verleihungen“ erscheint dann nur mit dieser Berechtigung. Ohne sie (auch anonym) fehlt er im DOM, und der Platzhalter für alle entfällt.
  - Die Daten kommen aus einem eigenen geschützten Endpunkt, nie aus dem öffentlichen Coin-DTO.

## 10. Offene Fragen
Keine. F1 bis F7 hat der Auftraggeber am 2026-10-06 entschieden (Abschnitt 1).

## 11. Abweichungen und Ergänzungen aus dem Review
Umgesetzt wie entworfen, mit diesen Ergänzungen:

- **Seite hinter dem Ende** (z. B. `/coins?seite=9` bei zwei Seiten): Der Katalog zeigt „Auf dieser Seite gibt es keine Coins.“ und das Blättern. „Vorherige Seite“ führt dann auf die letzte vorhandene Seite statt auf `seite - 1`.
- **Auflage** erscheint in Liste und Detailseite im Format `de-DE` (z. B. „1.000“), sonst „unbekannt“.
- **Blättern ohne Aushängen:** Beim Blättern bleibt die vorige Seite (Tabelle und Blättern) stehen, bis die Antwort da ist. Das gilt für Katalog, Benutzertabelle und Audit-Log.
- **`Blaettern`** (`shared/ui/blaettern.tsx`):
  - Neue Prop `laedt`: Während des Ladens sind die Buttons per `aria-disabled` gesperrt (nicht nativ) und ignorieren Klicks, damit der Fokus nicht verloren geht.
  - Führt ein Klick an den Rand, wandert der Fokus vorher auf den anderen Button bzw. auf die `<nav>` (`tabIndex={-1}`, sichtbarer Fokusring) und nach dem Laden zurück.
  - Details in ADR-0009.
- **Kein Scroll-Reset beim Blättern im Katalog** (`resetScroll: false`), damit der fokussierte Button sichtbar bleibt.
- **Mehrfachklick-Schutz:** Ein Folgeklick einer Mehrfachklick-Serie (`event.detail >= 2`) auf eine Zeile oder einen Namens-Link öffnet keine Detailseite, z. B. bei einem Doppelklick auf „Vorherige Seite“, während die Tabelle darunter wächst. Enter, Tippen und die Aktivierung durch Hilfstechnik (`detail` 0 bzw. 1) sind nicht betroffen.
- **Zusatztasten:** Strg-, Cmd-, Umschalt- oder Alt-Klick auf eine Zeile navigiert nicht. Auf dem Namens-Link gilt das normale Link-Verhalten des Browsers. Markierter Text in der Zeile löst ebenfalls keine Navigation aus.
- **Fokus bei Ladefehler beim Blättern:** Fällt das Blättern durch einen Ladefehler weg und lag der Fokus darin, setzt `useFokusBeiLadefehler` (`shared/lib/hooks`) den Fokus auf den Alarm (`tabIndex={-1}`). Der Hook gilt für Katalog, Benutzertabelle und Audit-Log.
- **Erneute Suche nach einem Ladefehler** lädt neu, auch wenn sich die URL nicht ändert (gleicher Begriff, schon Seite 1).
- **`seite` über 2147483647** in der URL gilt wie andere ungültige Werte als Seite 1 (AK-14).

Bekannte Hinweise und Folgepunkte (nicht blockierend):

- In der Benutzertabelle bleiben die Aktionen der vorigen Seite während des Ladens bedienbar. Eine Fehlbedienung ist dadurch nicht möglich, es betrifft nur den Komfort.
- `useFokusBeiLadefehler` setzt den Fokus auch dann auf den Alarm, wenn der Benutzer während des Ladens woanders hingeklickt hat.
- Der UI-Test zum Mehrfachklick-Schutz (W1) prüft seine Layout-Vorbedingungen nicht ausdrücklich.
