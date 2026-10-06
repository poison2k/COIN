# Feature: Rollen- und Benutzerverwaltung

Status: Rev. 3 umgesetzt (vom qa-reviewer freigegeben, Nacharbeiten in Abschnitt 12) · Abweichungen und Grenzen: Abschnitt 11 · Branch: `feature/rollen-benutzerverwaltung` (basiert auf `feature/anmeldung-keycloak`) · ADRs: [0016](../adr/0016-berechtigungen-im-code-und-deaktivierte-benutzer.md) (Berechtigungen, Deaktivierung), [0017](../adr/0017-audit-log-fuer-rollen-und-status.md) (Audit-Log), [0018](../adr/0018-schutzregel-letzter-administrator-mit-sperre.md) (Schutzregel, Nebenläufigkeit), [0019](../adr/0019-request-protokoll-ohne-personendaten.md) (Request-Protokoll)

## 1. Ziel
Administratoren vergeben in C.O.I.N. die festen Rollen (Administrator, Sachbearbeiter, Betrachter) und deaktivieren oder reaktivieren Benutzer, denn der Keycloak ist nur lesend nutzbar. Rechte sind Berechtigungen im Code und werden serverseitig über Policies durchgesetzt. Jede Rollen- und Statusänderung landet unveränderlich im Audit-Log. Die verbindliche Vorgabe steht im Auftrag zu diesem Branch.

Weiter gelten (Keycloak-Feature): Der Katalog ist ohne Anmeldung lesbar. Die Rolle kommt nie aus dem Token, und der Login-Abgleich überschreibt sie nie. Der Bootstrap per `Bootstrap:AdminEmails` greift nur bei Neuanlage mit `email_verified=true`.

### Entscheidungen des Auftraggebers (2026-10-05)
1. **Deaktivierte Benutzer und öffentliche Endpunkte:** Öffentlich bleibt öffentlich. Die Katalog-GETs (`GET /api/coins`, `/api/coins/{id}`, `/api/coins/{id}/bild`) liefern auch mit dem Token eines Deaktivierten `200`. `403` gibt es nur auf Endpunkten, die eine Anmeldung verlangen, einschließlich `/api/me` (ADR-0016 Punkt 8).
2. **Aufbewahrung des Audit-Logs:** Die Einträge werden vorerst unbegrenzt aufbewahrt. Das Löschkonzept kommt als eigenes späteres Feature (ADR-0017 Punkt 6).

## 2. Kernentscheidungen
1. Berechtigungen `coins.read`, `coins.write`, `users.manage` und `audit.read` sowie die Rechtematrix stehen fest im Domain-Code. Es gibt eine Policy je Berechtigung, `KatalogSchreiben` entfällt (ADR-0016).
2. `coins.read` ist definiert und wird ausgeliefert, aber nicht durchgesetzt, solange der Katalog öffentlich ist (ADR-0014).
3. Deaktivierte Benutzer erhalten auf **jedem Endpunkt, der eine Anmeldung verlangt**, `403` mit `code=benutzer_deaktiviert`, auch auf `/api/me`. Öffentliche GETs bleiben tokenunabhängig (`200`). Das hat der Auftraggeber bestätigt (Abschnitt 1).
4. Die Schutzregeln liegen in der Domain. Sie laufen in einer Transaktion mit `pg_advisory_xact_lock`, und das Recht des Akteurs wird innerhalb der Sperre erneut geprüft. Verstöße liefern `409` (ADR-0018).
5. Selbstschutz: Ein Administrator kann sich weder selbst die Administratorrolle entziehen noch sich selbst deaktivieren.
6. Audit-Log in der Tabelle `benutzer_audit`, in derselben Transaktion geschrieben, per Trigger gegen UPDATE und DELETE geschützt. Auch der Bootstrap-Administrator wird protokolliert, mit Akteur „System“. Die Einträge werden unbegrenzt aufbewahrt (ADR-0017).
7. Das Frontend steuert Sichtbarkeit nur über `berechtigungen` aus `/api/me`, nie über Rollennamen.
8. Unter der „Bearbeiten-Schaltfläche“ der Vorgabe wird der heutige Abschnitt „Neuen Coin erfassen“ mit dem Button „Coin anlegen“ verstanden. Eine Bearbeitungsfunktion gibt es noch nicht.

## 3. Akzeptanzkriterien

### Berechtigungsmodell
- **AK-1** `Coin.Domain/Benutzer/Berechtigungen` enthält genau `coins.read`, `coins.write`, `users.manage` und `audit.read`. `Rechtematrix.Von(rolle)` liefert genau die Matrix aus Abschnitt 5.1, für `null` (keine Rolle) die leere Menge. Ein Unit-Test prüft jede Zelle.
- **AK-2** `docs/berechtigungen.md` enthält die Rollenmatrix (5.1) und die Endpunkttabelle (5.2) zwischen den Markern `<!-- rechtematrix:start/ende -->` und `<!-- endpunkte:start/ende -->`. Ein Unit-Test vergleicht die Rollenmatrix mit `Rechtematrix`, ein Integrationstest die Endpunkttabelle mit `EndpointDataSource`: Jeder Endpunkt steht genau einmal darin, mit `öffentlich`, `angemeldet` oder genau einer Berechtigung. Weicht etwas ab, schlagen die Tests fehl.
- **AK-3** Für jede Berechtigung gibt es eine Policy gleichen Namens. Die Policy `KatalogSchreiben` und `Rollen.DuerfenKatalogSchreiben` gibt es nicht mehr. `POST /api/coins` und `PUT /api/coins/{id}/bild` verlangen `coins.write`. Kein Endpunkt verwendet `Roles=`.
- **AK-4** Default- und Fallback-Policy verlangen „angemeldet und aktiv“. Öffentlich (`[AllowAnonymous]`) sind weiterhin genau die drei Katalog-GETs (Keycloak-Feature AK-10 bleibt grün).
- **AK-5 Rollen-Endpunkt-Matrix (Integrationstest je Rolle).** Erwartete Status, Daten gültig, Ziel-Ids existieren:

  | Endpunkt | Admin | Sachb. | Betr. | keine | deaktiviert¹ | anonym |
  |---|---|---|---|---|---|---|
  | `GET /api/coins`, `GET /api/coins/{id}`, `GET /api/coins/{id}/bild` | 200 | 200 | 200 | 200 | 200² | 200 |
  | `POST /api/coins` | 201 | 201 | 403 | 403 | 403 | 401 |
  | `PUT /api/coins/{id}/bild` | 200 | 200 | 403 | 403 | 403 | 401 |
  | `GET /api/me` | 200 | 200 | 200 | 200 | 403 | 401 |
  | `GET /api/benutzer` | 200 | 403 | 403 | 403 | 403 | 401 |
  | `PUT /api/benutzer/{id}/rolle` | 200 | 403 | 403 | 403 | 403 | 401 |
  | `PUT /api/benutzer/{id}/status` | 200 | 403 | 403 | 403 | 403 | 401 |
  | `GET /api/audit` | 200 | 403 | 403 | 403 | 403 | 401 |

  ¹ Deaktiviert mit Rolle Administrator, damit nur der Status den Ausschlag gibt. ² Vom Auftraggeber entschieden: Die Antwort ist identisch mit der anonymen.

  Je Spalte gibt es eine Testmethode (Theory über die Zeilen). Bei `403` wird nichts gespeichert, und es entsteht kein Audit-Eintrag.
- **AK-6** 403-Antworten sind ProblemDetails mit `title` „Kein Zugriff“ und `code`:
  - Deaktiviert: `code=benutzer_deaktiviert`, `detail` „Ihr Benutzerkonto ist deaktiviert.“ Diese Prüfung geht der Berechtigungsprüfung vor.
  - Fehlende Berechtigung: `code=keine_berechtigung` mit diesem `detail`:
    - `coins.write`: „Ihr Benutzerkonto ist nicht berechtigt, den Coin-Katalog zu ändern.“ (unverändert)
    - `users.manage`: „Ihr Benutzerkonto ist nicht berechtigt, Benutzer zu verwalten.“
    - `audit.read`: „Ihr Benutzerkonto ist nicht berechtigt, das Audit-Log einzusehen.“

  Die Reihenfolge `401` → `403` → `400`/`404`/`409`/`415` bleibt. Bei `403` wird der Upload-Body nicht gelesen.
- **AK-7** Rollen- und Statusänderungen wirken ab dem nächsten Request, ohne neues Token. Test: Sachbearbeiter → `POST /api/coins` `201`. Ein Admin setzt ihn auf Betrachter. Derselbe Token bekommt danach `403`.
- **AK-8** Ein unbekannter Pfad mit gültigem Token liefert `404` und legt keinen Benutzer an.

### Benutzerstatus
- **AK-9** `benutzer.aktiv` (`boolean not null default true`). Bestehende und neue Benutzer sind aktiv. Der Login-Abgleich ändert weder `aktiv` noch `rolle`. Test: Einen Benutzer deaktivieren, dann `/api/me` mit geändertem `name` aufrufen. Ergebnis: `403`, `anzeigename` aktualisiert, `aktiv=false` und `rolle` unverändert.
- **AK-10** `GET /api/me` liefert `{ id, name, email, rolle, berechtigungen }`. `berechtigungen` ist ordinal sortiert, für „keine“ `[]`, für den Administrator `["audit.read","coins.read","coins.write","users.manage"]`. Keine weiteren Felder. Deaktiviert: `403` wie in AK-6.

### API Benutzerverwaltung (nur `users.manage` bzw. `audit.read`)
- **AK-11** `GET /api/benutzer?suche=&seite=1&groesse=25`:
  - Antwort `200`, `Cache-Control: no-store`, Body `{ eintraege: [{ id, name, email, rolle, aktiv, erstelltAm }], gesamt, seite, groesse }`.
  - `suche` (getrimmt, leer = alle) findet Teilstrings in Anzeigename oder E-Mail ohne Beachtung der Groß-/Kleinschreibung. `%`, `_` und `\` gelten wörtlich.
  - Sortierung: Anzeigename (case-insensitiv), dann `id`.
  - Keine `issuer`- und `subject`-Felder.
  - `400` (ValidationProblem, deutsche Meldungen) bei `seite < 1`, `groesse` außerhalb 1–100 oder `suche` mit mehr als 100 Zeichen.
- **AK-12** `PUT /api/benutzer/{id}/rolle`, Body `{ "rolle": "Administrator" | "Sachbearbeiter" | "Betrachter" | "keine" }`:
  - `200` mit dem geänderten Eintrag (Form wie in AK-11). „keine“ entzieht die Rolle (`NULL`).
  - Unbekannte oder fehlende Rolle: `400`, `errors.rolle` „Bitte eine gültige Rolle wählen.“
  - Unbekannte Id: `404` „Benutzer nicht gefunden“.
  - Gleicher Wert: `200` ohne Schreiben und ohne Audit-Eintrag.
- **AK-13** `PUT /api/benutzer/{id}/status`, Body `{ "aktiv": true | false }`. Ergebnisse wie AK-12 (`400` bei fehlendem `aktiv`, `errors.aktiv` „Bitte angeben, ob der Benutzer aktiv ist.“). Ein Deaktivieren entzieht keine Rolle.
- **AK-14** `GET /api/audit?benutzerId=&seite=1&groesse=25` (`audit.read`):
  - Antwort `200`, `no-store`, `{ eintraege: [{ id, zeitpunkt, akteur: { id, name } | null, benutzer: { id, name }, art: "Rolle" | "Status", alt, neu }], gesamt, seite, groesse }`.
  - Sortierung: `zeitpunkt` absteigend, dann `id` absteigend.
  - `benutzerId` filtert auf den Zielbenutzer. Eine unbekannte Id liefert eine leere Liste, eine ungültige GUID `400`. Paging-Validierung wie AK-11.
  - `akteur=null` bedeutet System (Bootstrap). Keine E-Mails.

### Schutzregeln
- **AK-15** Den letzten aktiven Administrator kann niemand herabstufen (Rolle ≠ Administrator) oder deaktivieren. Antwort `409` mit `code=letzter_administrator`, `title` „Änderung nicht möglich“, `detail` „Der letzte aktive Administrator kann weder herabgestuft noch deaktiviert werden.“ Es wird nichts geschrieben, kein Audit-Eintrag. Ein deaktivierter Administrator zählt nicht als aktiv.
- **AK-16** Selbstschutz: Ein Administrator, der sich selbst die Administratorrolle entzieht oder sich selbst deaktiviert, erhält `409` mit `code=eigenes_konto` und `detail` „Sie können sich nicht selbst die Administratorrolle entziehen oder Ihr eigenes Konto deaktivieren.“ Das gilt auch, wenn weitere Administratoren existieren. AK-16 wird vor AK-15 geprüft.
- **AK-17** Nebenläufigkeit, geprüft per direktem API-Aufruf: Es gibt genau zwei aktive Administratoren A und B. A stuft B herab, und gleichzeitig stuft B A herab (bzw. deaktiviert). Das läuft per `Task.WhenAll` in 20 Durchläufen, mit DB-Reset je Durchlauf. Ergebnis jedes Durchlaufs: genau eine Antwort `200`, die andere `403` (`keine_berechtigung`, Akteur innerhalb der Sperre nicht mehr Admin) oder `409`. Danach gibt es genau einen aktiven Administrator und genau einen Audit-Eintrag.
- **AK-18** Ein Administrator kann einen anderen Administrator herabstufen oder deaktivieren, solange danach mindestens ein aktiver Administrator bleibt. Die Reaktivierung eines deaktivierten Administrators stellt ihn als aktiven Administrator wieder her.

### Audit-Log
- **AK-19** Jede wirksame Änderung (AK-12, AK-13) schreibt in derselben Transaktion genau einen Eintrag mit Akteur-Id, Zeitpunkt (UTC, Mikrosekunden, `TimeProvider`), Ziel-Id, `art`, `alt` und `neu`. Test: Rollenwechsel `keine → Betrachter` durch Admin X. `GET /api/audit` enthält dann den Eintrag mit `akteur.name` = Name von X und `zeitpunkt` im Testzeitfenster. Scheitert das Schreiben des Audits (Test: Fehler-Injektion im Repository), bleibt auch die Rolle unverändert.
- **AK-20** Bootstrap: Die Neuanlage eines Bootstrap-Admins erzeugt genau einen Eintrag `Rolle: keine → Administrator` mit `akteur=null`. Weitere Logins erzeugen keinen. Zehn parallele Erstaufrufe erzeugen 1 Benutzer und 1 Eintrag.
- **AK-21** Unveränderlich: `UPDATE benutzer_audit …` und `DELETE FROM benutzer_audit …` per SQL in der Test-DB schlagen mit einer Exception fehl, die Zeilen bleiben unverändert. Es gibt keinen Endpunkt mit PUT, PATCH oder DELETE auf Audit-Daten (Inventartest). Es gibt keine automatische Löschung oder Bereinigung, die Aufbewahrung ist unbegrenzt.
- **AK-22** Logs enthalten weder E-Mails noch Anzeigenamen noch Audit-Inhalte. Erlaubt sind Ids und Ergebnisarten. Das ist eine Erweiterung des LogTests aus dem Keycloak-Feature (AK-21) um die neuen Endpunkte.

### Frontend
- **AK-23** `entities/benutzer`:
  - `Benutzer` hat `berechtigungen: Berechtigung[]`.
  - `hatBerechtigung(benutzer | null, b)`: `false` für `null`.
  - `darfKatalogSchreiben` entfällt. Kein Code in `web/src` vergleicht Rollennamen, um Rechte abzuleiten (Ausnahme: Anzeige und Auswahl der Rolle). Ein ESLint-/Vitest-Grep prüft `rolle ===` außerhalb von `features/rolle-zuweisen`, `pages/kein-zugriff` und `app/router`.
- **AK-24** Sidebar: Der Eintrag „Benutzerverwaltung“ (lucide `UsersIcon`, `aria-hidden`) erscheint nur mit `users.manage`. Anonym, als Betrachter, Sachbearbeiter, ohne Rolle oder deaktiviert gibt es ihn nicht im DOM.
- **AK-25** Route `/benutzerverwaltung`, `beforeLoad: erfordertBerechtigung('users.manage')`:
  - Anonym: Die Anmeldung startet mit Rückkehrziel.
  - Ohne Rolle oder deaktiviert: Weiterleitung nach `/kein-zugriff`.
  - Mit Rolle ohne Berechtigung: Weiterleitung nach `/`.
  - `erfordertRolle` wird durch `erfordertBerechtigung` ersetzt (Unit-Test).
- **AK-26** Seite „Benutzerverwaltung“:
  - Ein `h1` „Benutzerverwaltung“ und Tabs „Benutzer“ und „Audit-Log“ (Pfeiltasten-Navigation, `role="tablist"`).
  - Tab „Benutzer“:
    - Suchfeld mit Label „Benutzer suchen“ (`type="search"`) und Button „Suchen“, Enter löst die Suche aus.
    - `role="status"` meldet „{n} Benutzer gefunden“.
    - Tabelle mit sr-only-Caption „Benutzer“ und den Spalten Name, E-Mail, Rolle, Status, Aktion.
    - Blättern über „Vorherige Seite“ und „Nächste Seite“ mit dem Text „Seite x von y“. Die Buttons sind am Rand `disabled`.
    - Laden: `role="status"` „Benutzer werden geladen …“. Fehler: `role="alert"` „Benutzer konnten nicht geladen werden. Bitte später erneut versuchen.“
- **AK-27** Rolle ändern:
  - Pro Zeile ein Select mit dem Namen „Rolle von {Name}“ und den Optionen „Administrator“, „Sachbearbeiter“, „Betrachter“ und „Keine Rolle“.
  - Eine Auswahl öffnet einen Bestätigungsdialog (`alertdialog`): Titel „Rolle ändern?“, Text „Rolle von {Name}: {alt} → {neu}“, Buttons „Rolle ändern“ und „Abbrechen“.
  - Abbrechen oder Escape setzt die Auswahl zurück, es gibt keinen Request, und der Fokus kehrt zum Select zurück.
  - Erfolg: `role="status"` „Die Rolle von {Name} wurde auf {neu} geändert.“
- **AK-28** Deaktivieren und Reaktivieren:
  - Button „Deaktivieren“ bzw. „Reaktivieren“ mit `aria-label` „{Name} deaktivieren“ bzw. „{Name} reaktivieren“.
  - Deaktivieren öffnet einen Bestätigungsdialog („Benutzer deaktivieren?“, „{Name} kann sich danach nicht mehr in C.O.I.N. anmelden. Den öffentlichen Katalog kann er weiterhin sehen.“, Buttons „Deaktivieren“ und „Abbrechen“). Reaktivieren läuft ohne Dialog.
  - Der Status erscheint als Badge „Aktiv“ bzw. „Deaktiviert“ (Text, nicht nur Farbe).
- **AK-29** Eigene Zeile: Beim angemeldeten Admin sind Select und Status-Button `disabled`. Hinweis „(Sie)“ am Namen, `aria-describedby` „Das eigene Konto kann nicht geändert werden.“ Die eigentliche Prüfung liegt im Backend (AK-16).
- **AK-30** Fehler aus Rolle oder Status per `role="alert"` an der Tabelle, abgeleitet aus `code`:
  - `letzter_administrator`: „Der letzte aktive Administrator kann weder herabgestuft noch deaktiviert werden.“
  - `eigenes_konto`: „Das eigene Konto kann nicht geändert werden.“
  - `404`: „Der Benutzer wurde nicht gefunden.“
  - `403 keine_berechtigung`: „Sie sind nicht berechtigt, Benutzer zu verwalten.“
  - Sonst: „Die Änderung konnte nicht gespeichert werden. Bitte später erneut versuchen.“

  Die Zeile zeigt danach wieder den Serverstand.
- **AK-31** Tab „Audit-Log“ lädt beim Aktivieren neu:
  - Tabelle mit Caption „Audit-Log“ und den Spalten Zeitpunkt (`de-DE`, Datum und Uhrzeit), Geändert von, Benutzer, Änderung („Rolle“ / „Status“), Vorher, Nachher.
  - Anzeige der Werte: `keine` → „Keine Rolle“, `aktiv` → „Aktiv“, `deaktiviert` → „Deaktiviert“, `akteur=null` → „System (Bootstrap)“.
  - Blättern und Zustände wie in AK-26, Texte „Audit-Log wird geladen …“, „Audit-Log konnte nicht geladen werden. …“ und „Noch keine Einträge.“
- **AK-32** Deaktiviert:
  - `/api/me` mit `403 benutzer_deaktiviert` führt zum Zustand `deaktiviert`. Nach dem Rückruf geht es nach `/kein-zugriff`.
  - Die Seite zeigt `h1` „Kein Zugriff“ und „Ihr Benutzerkonto ist deaktiviert. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.“, dazu Link „Zum Coin-Katalog“ und „Abmelden“.
  - Die Kopfzeile zeigt „Abmelden“, aber keinen Namen.
  - Der Katalog auf `/coins` bleibt lesbar (Entscheidung 1).
  - Antwortet ein anderer API-Aufruf während der Sitzung mit `403 benutzer_deaktiviert`, lädt die App `/api/me` neu und wechselt in diesen Zustand.
- **AK-33** Coin-Seiten auf Berechtigungen:
  - `erfassen` = `erlaubt` genau bei `coins.write`. Texte aus dem Keycloak-Feature (AK-33) bleiben unverändert, ebenso `CoinListe.test.tsx`.
  - `CoinFormular` zeigt bei `403 benutzer_deaktiviert` „Ihr Benutzerkonto ist deaktiviert.“, bei `keine_berechtigung` den bisherigen Text.
- **AK-34** `shared/api`:
  - `403` → `{ art: 'keinZugriff', grund: 'deaktiviert' | 'keineBerechtigung' }`.
  - `409` → `{ art: 'konflikt', code: string | null }`.
  - Callback `setzeBeiDeaktiviert` analog zu `setzeBeiNichtAngemeldet`.
  - Bestehende Aufrufer bleiben typkorrekt.
- **AK-35** Barrierefreiheit:
  - Alle Bedienelemente (Suche, Select, Buttons, Dialog, Tabs, Blättern) sind per Tastatur bedienbar und haben einen sichtbaren Fokus (`focus-visible`).
  - Dialoge fangen den Fokus. Beim Öffnen liegt er auf „Abbrechen“, beim Schließen kehrt er zum Auslöser zurück.
  - Alle Texte sind deutsch, auch `sr-only`, `aria-label` und `aria-describedby`. Die Englisch-Prüfung läuft für die Seite (beide Tabs, beide Dialoge).
- **AK-36** FSD nach 5.6 und Steiger ohne Befund. Neue shadcn-Komponenten (Base UI) kommen per CLI nach `shared/ui`: `select`, `alert-dialog`, `badge`, `tabs`. Keine Eigenbauten dafür.

### Tests und Abschluss
- **AK-37** Systemtest `e2e/tests/benutzerverwaltung.spec.ts` mit echtem Keycloak:
  1. `betrachter@test.local` meldet sich in einem eigenen Browser-Kontext an. Er ist damit in der App angelegt und hat keine Rolle.
  2. `admin@test.local` öffnet über die Sidebar „Benutzerverwaltung“, sucht „betrachter@test.local“, wählt „Betrachter“ und bestätigt.
  3. Im Tab „Audit-Log“ steht oben ein Eintrag „Test Administrator“ / „Test Betrachter“ / „Rolle“ / „Keine Rolle“ / „Betrachter“ mit Zeitpunkt.
  4. `betrachter@test.local` meldet sich in einem neuen Kontext an. `/coins` zeigt die Liste und „Coins erfassen können nur Administratoren und Sachbearbeiter.“, aber keinen Button „Coin anlegen“. Die Sidebar hat keinen Eintrag „Benutzerverwaltung“.

  Der Test ist im selben Lauf wiederholbar: Hat der Benutzer schon „Betrachter“, setzt er ihn zuerst auf „Keine Rolle“. Die bestehenden e2e-Tests bleiben unverändert grün (`neu@test.local` behält keine Rolle).
- **AK-38** `dotnet build` (ohne Warnungen), `dotnet test`, `npm test`, `npm run test:ui`, `npm run lint` und `npx playwright test` sind grün. Die Doku nach Abschnitt 9 ist nachgezogen.

## 4. Abgrenzung
- Nicht im Umfang: frei konfigurierbare Rechte, Gruppen, Benutzer manuell anlegen oder löschen, Änderungen im Keycloak, Rollen aus Token oder AD.
- Mehrere Rollen pro Benutzer: Es gibt genau eine Rolle oder keine.
- Audit für andere Daten (Coins, Verleihungen), Export des Audit-Logs.
- Löschkonzept und Aufbewahrungsfrist für das Audit-Log: eigenes späteres Feature (Entscheidung 2).
- Benachrichtigung betroffener Benutzer. Sofortiges Abmelden laufender Sitzungen entfällt ebenfalls: Die API sperrt beim nächsten Request, das Frontend aktualisiert die Rechte beim nächsten Laden von `/api/me`.
- Filter nach Rolle oder Status in der Benutzerliste, Audit-Filter im UI (die API kann nach `benutzerId` filtern).
- Eigene DB-Rolle ohne UPDATE/DELETE auf dem Audit (ADR-0017, Betriebsthema).

## 5. Lösungsentwurf

### 5.1 Rechtematrix (Inhalt für `docs/berechtigungen.md`)
| Berechtigung | Bedeutung | Administrator | Sachbearbeiter | Betrachter | keine Rolle |
|---|---|---|---|---|---|
| `coins.read` | Katalog lesen (zurzeit öffentlich, nicht durchgesetzt) | ✓ | ✓ | ✓ | – |
| `coins.write` | Coins anlegen, Motivbild hochladen | ✓ | ✓ | – | – |
| `users.manage` | Benutzer auflisten, Rolle und Status ändern | ✓ | – | – | – |
| `audit.read` | Audit-Log lesen | ✓ | – | – | – |

Deaktivierte Benutzer haben unabhängig von der Rolle keine Berechtigung, lesen aber wie alle anderen die öffentlichen Endpunkte. Anonyme Besucher lesen nur die öffentlichen Endpunkte.

### 5.2 Endpunkttabelle (Inhalt für `docs/berechtigungen.md`)
| Endpunkt | Zugriff |
|---|---|
| `GET /api/coins`, `GET /api/coins/{id}`, `GET /api/coins/{id}/bild` | öffentlich |
| `POST /api/coins`, `PUT /api/coins/{id}/bild` | `coins.write` |
| `GET /api/me` | angemeldet |
| `GET /api/benutzer`, `PUT /api/benutzer/{id}/rolle`, `PUT /api/benutzer/{id}/status` | `users.manage` |
| `GET /api/audit` | `audit.read` |

### 5.3 Domain (`Coin.Domain/Benutzer/`)
- `Berechtigungen` (Konstanten, `Alle`), `Rechtematrix.Von(Rolle?) : IReadOnlySet<string>`, `Rechtematrix.Hat(Benutzer, string)` (berücksichtigt `Aktiv`).
- `Benutzer` + `bool Aktiv`.
- `BenutzerverwaltungService(IBenutzerverwaltungRepository, TimeProvider)`:
  - `RolleZuweisenAsync(akteurId, zielId, Rolle?, ct)` und `StatusSetzenAsync(akteurId, zielId, bool, ct)` liefern `AenderungErgebnis` mit den Fällen `Geaendert(Benutzer)`, `Unveraendert(Benutzer)`, `NichtGefunden`, `AkteurNichtBerechtigt`, `EigenesKonto` und `LetzterAdministrator`.
  - Die Regeln stehen in einer reinen Funktion `Schutzregeln.Pruefen(akteur, ziel, aenderung, anzahlAktiverAdmins)` (Reihenfolge laut ADR-0018).
  - `AuflistenAsync(suche, seite, groesse)` und `AuditLesenAsync(benutzerId?, seite, groesse)` liefern `Seite<T>`.
- `IBenutzerverwaltungRepository`:
  - `InSperreAsync<T>(Func<IBenutzerverwaltungSitzung, Task<T>>, ct)` mit Transaktion und Advisory Lock.
  - Die Sitzung bietet `LadenAsync(id)`, `AnzahlAktiverAdministratorenAsync()` und `SpeichernAsync(Benutzer, AuditEintrag)`.
  - Außerdem `SuchenAsync` und `AuditSeiteAsync`.
- `AuditEintrag` (Record), `AuditArt { Rolle, Status }`, Wertdarstellung `RolleWert(Rolle?)` → `"keine"` und `StatusWert(bool)`.

### 5.4 Infrastruktur
Migration `Benutzerverwaltung`:
- `benutzer`: `aktiv boolean not null default true`.
- `benutzer_audit`:

| Spalte | Typ | Regel |
|---|---|---|
| `id` | `uuid` PK | GUID v7 |
| `zeitpunkt` | `timestamptz` not null | |
| `akteur_id` | `uuid` null | FK `benutzer(id)` `ON DELETE RESTRICT`, `NULL` = System |
| `benutzer_id` | `uuid` not null | FK `benutzer(id)` `ON DELETE RESTRICT` |
| `art` | `varchar(10)` not null | `ck_benutzer_audit_werte`: `Rolle` mit `alt`/`neu` ∈ {Administrator, Sachbearbeiter, Betrachter, keine} oder `Status` mit ∈ {aktiv, deaktiviert}; `alt <> neu` |
| `alt`, `neu` | `varchar(20)` not null | |

- Indizes: `ix_benutzer_audit_zeitpunkt (zeitpunkt DESC, id DESC)` und `ix_benutzer_audit_benutzer (benutzer_id, zeitpunkt DESC)`.
- Funktion `benutzer_audit_unveraenderlich()` mit `RAISE EXCEPTION 'benutzer_audit ist unveränderlich'`, dazu der Trigger `BEFORE UPDATE OR DELETE FOR EACH ROW`. `Down` entfernt alles wieder.

Weitere Änderungen:
- `BenutzerRepository.AbgleichenAsync`: Das Upsert wird in ein CTE eingebettet (`WITH ergebnis AS (INSERT … RETURNING …, (xmax = 0) AS neu), audit AS (INSERT INTO benutzer_audit … SELECT … FROM ergebnis WHERE neu AND rolle IS NOT NULL) SELECT … FROM ergebnis`). `aktiv` und `rolle` kommen nie im `DO UPDATE` vor.
- `BenutzerverwaltungRepository`:
  - `InSperreAsync` öffnet `BeginTransactionAsync` (`READ COMMITTED`) und führt `SELECT pg_advisory_xact_lock(@schluessel)` aus. Der Schlüssel ist eine feste `long`-Konstante.
  - Die Suche nutzt `ILIKE @muster ESCAPE '\'` mit escaptem Muster, parametrisiert.
  - Audit-Lesen per Join auf `benutzer` für Namen.

### 5.5 API (`Coin.Api`)
- `Authentifizierung/BerechtigungAutorisierung.cs`:
  - `BerechtigungAnforderung(string?)` und Handler. Ohne Endpunkt kein Abgleich, sonst `IAktuellerBenutzer`. Das Ergebnis ist `Fail(new AuthorizationFailureReason(this, "benutzer_deaktiviert" | "keine_berechtigung"))`.
  - Policies werden per Schleife über `Berechtigungen.Alle` registriert. Default- und Fallback-Policy erhalten `BerechtigungAnforderung(null)`.
  - `[AllowAnonymous]`-Endpunkte laufen nie durch den Handler, deshalb gibt es dort keinen Abgleich und keine Deaktiviert-Prüfung (Entscheidung 1).
- `AutorisierungsErgebnisBehandlung`: Bei `Forbidden` schreibt sie die ProblemDetails aus AK-6, mit `detail` je Policy-Name aus einer Tabelle in der Api. `JwtBearerEvents.OnForbidden` entfällt.
- `IAktuellerBenutzer` liefert zusätzlich die Id für den Akteur.
- `BenutzerController` (`api/benutzer`, `[Authorize(Policy = users.manage)]`) mit `Auflisten`, `RolleZuweisen` und `StatusSetzen`. Er bildet nur `AenderungErgebnis` auf HTTP ab: `AkteurNichtBerechtigt` → 403 `keine_berechtigung`, `EigenesKonto` und `LetzterAdministrator` → 409.
- `AuditController` (`api/audit`, `audit.read`), `Cache-Control: no-store` auf allen Antworten beider Controller.
- Contracts:
  - `BenutzerEintragResponse`, `SeiteResponse<T>`, `RolleZuweisenRequest(string? Rolle)` (eigene Validierung statt Enum-Binding, damit die Meldung deutsch ist), `StatusSetzenRequest(bool? Aktiv)`, `AuditEintragResponse`.
  - `MeResponse` + `Berechtigungen`.
- CORS: keine Änderung (GET und PUT sind bereits erlaubt).

### 5.6 Frontend (FSD, Public API je Slice über `index.ts`)
```
shared/ui/                        neu per shadcn-CLI (Base UI): select, alert-dialog, badge, tabs
shared/api/http.ts                403 grund aus problem.code; 409 code; setzeBeiDeaktiviert (+ Tests)
shared/api/problem-details.ts     + code?: string
shared/config/routen.ts           + benutzerverwaltung: '/benutzerverwaltung'
entities/benutzer/                model: Berechtigung, Benutzer.berechtigungen, hatBerechtigung, BenutzerEintrag, Seite<T>,
                                  ROLLEN_ANZEIGE (Rolle → deutscher Text); api: ladeAngemeldetenBenutzer (403 → deaktiviert),
                                  ladeBenutzerliste({ suche, seite, groesse }); ui: StatusBadge
                                  model/fehlertext.ts: aenderungFehlertext(ergebnis) (Rev. 3, AK-50)
                                  index.ts: Typen, hatBerechtigung, ROLLEN_ANZEIGE, ladeAngemeldetenBenutzer, ladeBenutzerliste,
                                  StatusBadge, aenderungFehlertext
entities/audit/                   model: AuditEintrag; api: ladeAuditLog({ benutzerId?, seite, groesse }); ui: AuditTabelle
                                  index.ts: AuditEintrag, ladeAuditLog, AuditTabelle
features/rolle-zuweisen/          ui: RolleZuweisen ({ benutzer, deaktiviert, onGeaendert, onFehler }) = Select + AlertDialog;
                                  api: weiseRolleZu(id, rolle)  · index.ts: RolleZuweisen
features/benutzer-status-aendern/ ui: StatusAendern ({ benutzer, deaktiviert, onGeaendert, onFehler }) = Button + AlertDialog;
                                  api: setzeStatus(id, aktiv)  · index.ts: StatusAendern
widgets/benutzer-tabelle/         ui: BenutzerTabelle ({ aktuellerBenutzerId }): Suche, Tabelle, Blättern, Meldungen;
                                  setzt RolleZuweisen und StatusAendern ein  · index.ts: BenutzerTabelle
widgets/audit-log/                ui: AuditLog: lädt Seiten, Blättern, Zustände, nutzt AuditTabelle  · index.ts: AuditLog
widgets/app-shell/                AppSidebar: NavEintrag.berechtigung?; Filter über hatBerechtigung(benutzerZustand);
                                  Kopfzeile: Zustand 'deaktiviert' (nur Abmelden)
pages/benutzerverwaltung/         ui: BenutzerverwaltungSeite ({ aktuellerBenutzerId }): h1, Tabs → BenutzerTabelle | AuditLog
                                  index.ts: BenutzerverwaltungSeite
pages/kein-zugriff/               KeinZugriffSeite + Prop grund: 'keineRolle' | 'deaktiviert'
app/anmeldung/use-benutzer.ts     403 deaktiviert → zustand 'deaktiviert'; erfassen aus hatBerechtigung(…,'coins.write');
                                  setzeBeiDeaktiviert → /api/me neu laden
app/router/schutz.ts              erfordertBerechtigung(b) ersetzt erfordertRolle; SchutzKontext + deaktiviert
app/router/router.tsx             Route /benutzerverwaltung (in shell) mit Guard; /kein-zugriff erlaubt auch deaktiviert
app/router/routen-komponenten.tsx BenutzerverwaltungRoute (reicht benutzer.id durch), Rückruf: deaktiviert → /kein-zugriff
```
Importe nur nach unten: Die Widgets nutzen Features und Entities, die Page nutzt zwei Widgets, `app` nutzt die Page. Es gibt keine Querimporte zwischen Features; die gemeinsame Fehlertext-Funktion `aenderungFehlertext` liegt in `entities/benutzer` (Rev. 3, AK-50). Die Seiten bleiben frei von Router-Hooks.

## 6. Tests

### 6.1 xUnit Unit (`tests/Coin.UnitTests/Benutzer/`)
- `RechtematrixTests`: jede Zelle, `null`, deaktiviert ohne Rechte.
- `BerechtigungsDokuTests`: parst `docs/berechtigungen.md` zwischen den Markern und vergleicht mit `Rechtematrix` (AK-2).
- `SchutzregelnTests`: Reihenfolge und alle Ergebnisarten (AK-15, AK-16, AK-18).
- `BenutzerverwaltungServiceTests` mit Fake-Repository: Audit-Inhalt, Unverändert ohne Audit, Zeit über `FakeTimeProvider`.
- `RollenTests` entfällt bzw. wird durch `RechtematrixTests` ersetzt.

### 6.2 xUnit Integration
- Infrastruktur:
  - `BenutzerTabelle` + `StatusSetzenAsync`, `AuditTabelle` (lesen, Roh-UPDATE/DELETE).
  - `IntegrationTestBasis`: `ClientMitRolleAsync(rolle, aktiv = true)` und `ZweiterAdminAsync()`. `DatenbankLeerenAsync` bleibt bei `TRUNCATE coin_typ, benutzer CASCADE` (leert das Audit mit).
- Testklassen:
  - `Berechtigungen/RollenEndpunktMatrixTests`: eine Methode je Spalte aus AK-5 (Spalte „deaktiviert“ inklusive öffentlicher GETs = `200`, identisch mit anonym), plus AK-6 (Bodies) und AK-7.
  - `Berechtigungen/EndpunktTabelleTests`: AK-2 (Doku ↔ `EndpointDataSource`), AK-3, AK-4, AK-21 (keine schreibenden Audit-Pfade).
  - `Benutzer/BenutzerListeTests` (AK-11), `Benutzer/RolleZuweisenTests` (AK-12, AK-15, AK-16, AK-18), `Benutzer/StatusSetzenTests` (AK-9, AK-13).
  - `Benutzer/SchutzregelNebenlaeufigkeitTests` (AK-17).
  - `Audit/AuditTests` (AK-14, AK-19, AK-20, AK-21).
  - `Benutzer/MeTests` erweitert (AK-10).
  - `Anmeldung/LogTests` erweitert (AK-22).
- Anzupassen: `EndpunktInventarTests` (Policy `coins.write` statt `KatalogSchreiben`), `SchreibrechteTests` (Policy-Namen, Bodies mit `code`), `MeTests` (Feldmenge).

### 6.3 Vitest
- Unit:
  - `hatBerechtigung`, `erfordertBerechtigung` (anonym, keine Rolle, deaktiviert, ohne und mit Berechtigung).
  - `http.ts`: 403 `grund`, 409 `code`, `setzeBeiDeaktiviert`.
  - `ladeBenutzerliste` und `ladeAuditLog` (Query-Parameter, Encoding), `weiseRolleZu`, `setzeStatus`, `fehlertext`.
- Komponenten:
  - `RolleZuweisen`: Dialog, Abbrechen ohne Request, Fokus-Rückgabe, `disabled`.
  - `StatusAendern`: Dialog nur beim Deaktivieren.
  - `BenutzerTabelle`: Suche, Statusmeldung, Blättern, eigene Zeile, Fehler-Alerts AK-30.
  - `AuditTabelle` und `AuditLog`: Anzeige-Mapping, „System (Bootstrap)“, leer, Fehler.
  - `BenutzerverwaltungSeite`: Tabs.
  - `AppSidebar`: Eintrag nur mit `users.manage`.
  - `KeinZugriffSeite` mit `grund` „deaktiviert“.
- `App.test.tsx`/`App.anmeldung.test.tsx`: `/benutzerverwaltung` als Admin, Betrachter, anonym und deaktiviert; `/api/me` 403 deaktiviert → `/kein-zugriff`, `/coins` bleibt lesbar; `erfassen` aus Berechtigungen; Englisch-Prüfung.
- `web/test/anmeldung.tsx`: Die Test-Benutzer erhalten `berechtigungen`, `fakeApi` die neuen Endpunkte.
- Der Grep-Test aus AK-23 gehört zu `abhaengigkeiten.test.ts`.

### 6.4 UI-Tests (`web/ui-tests/benutzerverwaltung.spec.ts`, API und IdP gemockt, `meldeAnAls`)
- Sidebar-Eintrag als Admin sichtbar, als Betrachter nicht. Direktaufruf als Betrachter führt nach `/`.
- Tastatur-Durchgang: Tab zur Suche, Eingabe, Enter. Tab zum Select, Öffnen per Tastatur, Option wählen. Im Dialog liegt der Fokus auf „Abbrechen“. Tab und Enter auf „Rolle ändern“ senden den PUT-Body `{"rolle":"Betrachter"}`. Statusmeldung erscheint, der Fokus liegt wieder am Select. Escape-Variante ohne Request.
- 409 `letzter_administrator` und `eigenes_konto` → Alert-Texte. Deaktivieren-Dialog → PUT `{"aktiv":false}`, Badge „Deaktiviert“, Button „Reaktivieren“.
- Audit-Tab: Pfeiltasten wechseln den Tab, Einträge und Blättern.
- Sichtbarer Fokus (Outline/Ring vorhanden) an Suche, Select, Buttons und Tabs. Englisch-Prüfung.
- `/api/me` 403 `benutzer_deaktiviert` → Seite „Kein Zugriff“ mit Deaktiviert-Text.

### 6.5 Systemtests (`e2e/`)
- Neu: `tests/benutzerverwaltung.spec.ts` (AK-37), Hilfe `meldeAnInNeuemKontext(browser, email)` in `tests/hilfen/anmeldung.ts`.
- `betrachter@test.local` statt `neu@test.local`, damit `anmeldung.spec.ts (c)` unabhängig von der Reihenfolge bleibt. Beide Dateien teilen die Wegwerf-DB eines Laufs.

## 7. Sicherheit und Datenschutz
- Jede Prüfung läuft serverseitig: Policies an jedem Endpunkt und Schutzregeln innerhalb der Sperre, mit erneuter Prüfung des Akteurs. Das Frontend blendet nur aus.
- Fail-closed:
  - Policies werden nur aus `Berechtigungen.Alle` registriert. Ein Endpunkt mit unbekanntem Policy-Namen scheitert nicht beim Start, sondern erst beim Request mit `500`. Abgesichert ist das durch die Inventartests (`EndpunktTabelleTests`, `EndpunktInventarTests`).
  - Deaktiviert geht vor Berechtigung.
  - Eine unbekannte Rolle in der DB führt zu `500` (wie bisher).
- Öffentliche Katalog-Antworten bleiben auch für Deaktivierte tokenunabhängig (Entscheidung 1). Sie enthalten keine Personendaten, der Benutzer bekommt also nichts, was nicht ohnehin anonym abrufbar ist (ADR-0014).
- Personendaten (Name, E-Mail) gibt nur `users.manage` heraus. Das Audit zeigt nur Namen, keine E-Mails, und nur mit `audit.read`. Beide Antworten tragen `Cache-Control: no-store`. `issuer` und `subject` verlassen die API nie.
- Keine Personendaten und keine Audit-Inhalte in Logs (AK-22).
- Die Suche ist parametrisiert, `%`/`_` sind escaped, und die Länge ist begrenzt (keine SQL-Injection, kein teurer Wildcard-Missbrauch).
- Das Audit ist im Code und in der DB unveränderlich. Restrisiko DB-Eigentümer siehe ADR-0017. Die Aufbewahrung ist vorerst unbegrenzt (Entscheidung 2), die Datenschutzbewertung der Frist folgt mit dem Löschkonzept.
- Selbstaussperren ist ausgeschlossen (AK-15 bis AK-17). Notfall bei verlorenem Admin-Zugang: `Bootstrap:AdminEmails` wirkt nur bei Neuanlage. Der Weg bleibt dann ein dokumentierter SQL-Eingriff (Betriebsdoku).

## 8. Annahmen
- Ein Benutzer erscheint in der Verwaltung erst nach seiner ersten Anmeldung, weil manuelles Anlegen ausgeschlossen ist. Die Benutzerdoku sagt das so.
- „Rolle zuweisen oder entziehen“ heißt genau eine Rolle oder „keine“.
- „Bearbeiten-Schaltfläche“ meint den Abschnitt „Neuen Coin erfassen“ mit dem Button „Coin anlegen“ (Kernentscheidung 8). Künftige Bearbeiten-Funktionen verlangen `coins.write`.
- Das Advisory Lock und Trigger-Funktionen sind auf dem Ziel-PostgreSQL (17) verfügbar.
- Die shadcn-Registry liefert `select`, `alert-dialog`, `badge` und `tabs` in der Base-UI-Variante (ADR-0009).

## 9. Doku-Bedarf (erledigt bis auf `infra/keycloak/README.md` und `CLAUDE.md`, siehe Abschnitt 11)
- **`docs/berechtigungen.md` (neu)**: Inhalte aus 5.1 und 5.2 mit Markern (AK-2), Hinweis auf ADR-0016.
- **`docs/requirements.md`**:
  - Rollen-Abschnitt auf die Matrix verweisen. Ein Betrachter liest heute dasselbe wie die Öffentlichkeit.
  - Funktion „Benutzer- und Rollenverwaltung mit Audit-Log“ ergänzen.
  - NFA „Audit-Log“ als für Rollen und Status umgesetzt markieren.
  - Entscheidungen vom 2026-10-05 festhalten: öffentliche Katalog-GETs auch für Deaktivierte; Audit vorerst unbegrenzt aufbewahren, Löschkonzept als späteres Feature.
- **`docs/api.md`**: Abschnitt Autorisierung (Berechtigungen, 403 mit `code`, Deaktiviert, öffentliche GETs unabhängig vom Status), `GET /api/me` mit `berechtigungen`, neue Endpunkte (`/api/benutzer`, `/api/audit`) mit Beispielen und Fehlern (400/403/404/409).
- **`docs/features/anmeldung-keycloak.md`**: Hinweis „AK-10/AK-19/AK-20/AK-29/AK-33 erweitert durch rollen-benutzerverwaltung“. Policy `KatalogSchreiben` → `coins.write`.
- **ADRs**: `0013` Status „teilweise abgelöst durch ADR-0016“ (Punkt 4 letzter Satz, Punkt 5). `0014` Folgen-Satz zu Betrachter mit Verweis auf `coins.read`, dazu der Satz „gilt auch für deaktivierte Benutzer“.
- **`docs/benutzer/benutzerverwaltung.md` (neu)**: Rollen und Rechte, Benutzer finden (erst nach erster Anmeldung sichtbar), Rolle ändern, Deaktivieren, Audit-Log, Schutzregeln. **`docs/benutzer/anmeldung.md`** um „Konto deaktiviert“ ergänzen (Katalog bleibt lesbar).
- **`README.md`**: Rollen werden in der App vergeben (Benutzerverwaltung). Notfall „letzter Admin verloren“ als SQL-Hinweis für den Betrieb. Das Audit ist unveränderlich (Trigger) und wird unbegrenzt aufbewahrt.
- **`infra/keycloak/README.md`**: Hinweis, dass Rollen der Testbenutzer in der App per Benutzerverwaltung vergeben werden (e2e nutzt `betrachter@test.local`).
- **Vorschlag `CLAUDE.md`** (nur mit Freigabe): unter Sicherheit „Endpunkte verlangen eine Berechtigung (`docs/berechtigungen.md`), nie eine Rolle; neue Endpunkte in die Endpunkttabelle eintragen“ sowie „Audit-Einträge sind unveränderlich“.

## 10. Offene Fragen
Keine. Beide Punkte aus Rev. 1 (F1 deaktivierte Benutzer auf öffentlichen Endpunkten, F2 Aufbewahrung des Audit-Logs) hat der Auftraggeber am 2026-10-05 entschieden (Abschnitt 1). Die Fragen F1 bis F4 aus Rev. 3 hat er am 2026-10-06 entschieden (Abschnitt 12.8).

## 11. Umsetzung: Abweichungen vom Entwurf und bekannte Grenzen
- **Schutzregel „letzter Administrator“ (AK-15)** ist über die API nicht erreichbar: Der Akteur muss aktiver Administrator sein (`Rechtematrix.Hat(akteur, users.manage)`), und ist er der einzige, greift vorher die Selbstprüfung (AK-16, `eigenes_konto`). Die Regel ist Absicherung in der Tiefe und nur per Unit-Test (`SchutzregelnTests`) belegt. Im Nebenläufigkeitstest (AK-17) endet der unterlegene Request mit `403 keine_berechtigung` (ADR-0018).
- **Unbekannte Policy-Namen** scheitern erst beim Request (`500`), nicht beim Start (Abschnitt 7 korrigiert).
- **Logs (AK-22, AK-46, AK-47)**: Vier Framework-Kategorien mit Request-Daten haben feste Mindeststufen, die ein Wrapper um die `ILoggerFactory` unabhängig von der Konfiguration erzwingt; die Hosting-Diagnose zusätzlich ohne Scope (ADR-0019 Punkt 5). Methode, Route, Status und Dauer liefert das eigene Request-Protokoll `AnfrageProtokoll`.
- **403-Texte**: Zusätzlich zu AK-6 gibt es ein `detail` für `coins.read` („… den Coin-Katalog einzusehen.“) und einen allgemeinen Text („Ihr Benutzerkonto ist für diese Aktion nicht berechtigt.“) für Policies ohne eigenen Text. Beide werden heute an keinem Endpunkt ausgelöst.
- **Datenbank**: Der Index `ix_benutzer_audit_zeitpunkt` liegt aufsteigend auf `(zeitpunkt, id)`; PostgreSQL liest ihn für die absteigende Sortierung rückwärts. Zusätzlich gibt es `ix_benutzer_audit_akteur_id` (FK-Index).
- **Frontend**:
  - `Seite<T>` liegt in `shared/api` (von `entities/benutzer` re-exportiert), das Blättern als eigene Komponente in `shared/ui/blaettern.tsx` (für beide Tabs).
  - `StatusAendern` ist ein einziger Button für „Deaktivieren“/„Reaktivieren“, damit der Fokus nach dem Wechsel erhalten bleibt; während der Anfrage bleibt er per `focusableWhenDisabled` fokussierbar. Erfolgsmeldung: „{Name} wurde deaktiviert.“ bzw. „{Name} wurde reaktiviert.“
  - Fehlertexte (AK-30) zusätzlich: `403 benutzer_deaktiviert` → „Ihr Benutzerkonto ist deaktiviert.“
  - shadcn-Nacharbeiten an `alert-dialog.tsx` (eigene Tab-Falle, `AlertDialogCancel` reicht `focusableWhenDisabled` durch) und `select.tsx` (Pfeiltasten-Umlauf), App-Shell mit eigenem `<header>` neben `<main>`; Details und Grenzen in ADR-0009.
- **Bekannte Grenze**: Ein Rollenwechsel bei Benutzern, die bereits eine Rolle haben, wird im Frontend erst nach dem Neuladen sichtbar; die API wendet ihn sofort an (Entscheidung F2 in 12.8).
- **Nicht nachgezogen** (fehlende Schreibrechte des docs-Agenten): `infra/keycloak/README.md` (Hinweis aus Abschnitt 9) und der Vorschlag für `CLAUDE.md`.

## 12. Nacharbeiten (Rev. 3, umgesetzt)

Auftrag des Auftraggebers vom 2026-10-06: offene Punkte aus Umsetzung und QA-Review lösen. Nicht im Umfang: Löschkonzept für das Audit-Log (bleibt späteres Feature, Entscheidung 2). Die AK-1 bis AK-38 gelten weiter, soweit unten nichts anderes steht.

### 12.1 Schutzregeln: Akteur zuerst (ADR-0018, geändert)
- **AK-39** Neue Reihenfolge in `Schutzregeln.Pruefen`: **AkteurNichtBerechtigt → NichtGefunden → Unveraendert → EigenesKonto → LetzterAdministrator → Erlaubt.** `AkteurNichtBerechtigt` gilt, wenn `akteur` `null` ist oder `Rechtematrix.Hat(akteur, users.manage)` `false` liefert (Rolle ohne Recht, keine Rolle, deaktiviert). Der Doc-Kommentar in `Schutzregeln.cs` nennt die neue Reihenfolge. Unit-Tests in `SchutzregelnTests`, jeweils mit Akteur Betrachter, ohne Rolle, deaktivierter Administrator und `null`:
  - Ziel unverändert (gleiche Rolle bzw. gleicher Status) → `AkteurNichtBerechtigt` (bisher `Unveraendert`).
  - Ziel `null` → `AkteurNichtBerechtigt` (bisher `NichtGefunden`).
  - Mit berechtigtem Akteur bleiben `NichtGefunden`, `Unveraendert`, `EigenesKonto` und `LetzterAdministrator` wie bisher (bestehende Tests grün).
- **AK-40** Integrationstest gegen PostgreSQL auf Service-Ebene (`BenutzerverwaltungService` mit echtem Repository, weil die Policy den Fall über HTTP vorher abfängt): Akteur ist Betrachter bzw. deaktivierter Administrator. `RolleZuweisenAsync` mit der aktuellen Rolle des Ziels und `StatusSetzenAsync` mit dem aktuellen Status des Ziels liefern `AkteurNichtBerechtigt`, nicht `Unveraendert`. Es wird nichts geschrieben, kein Audit-Eintrag. Der Controller bildet das wie bisher auf `403 keine_berechtigung` ab; der Body enthält weder Name noch E-Mail des Ziels (Controller-Test oder Integrationstest mit präpariertem Service). AK-17 bleibt unverändert grün.

### 12.2 Reaktivierung und Rollenvergabe während der Sitzung (Frontend)
Begriffe: Die **Zugriffsklasse** ist aus dem Benutzerzustand abgeleitet: `deaktiviert` (Zustand „deaktiviert“), `ohneRolle` (Zustand „angemeldet“, `rolle = 'keine'`) oder `mitRolle` (Zustand „angemeldet“ mit Rolle). `/kein-zugriff` zeigt für `deaktiviert` den Grund „deaktiviert“ und für `ohneRolle` den Grund „keineRolle“ (bestehende Prop `grund`).

- **AK-41** `/kein-zugriff` zeigt bei beiden Gründen („deaktiviert“ und „keineRolle“) zusätzlich einen Button „Erneut prüfen“ (shadcn `Button`, Variante `outline`) neben „Zum Coin-Katalog“ und „Abmelden“. Er ist per Tastatur erreichbar und hat einen sichtbaren Fokus.
- **AK-42** „Erneut prüfen“ lädt `GET /api/me` genau einmal neu:
  - Während der Prüfung bleibt die Seite stehen (kein Zwischenzustand „pruefe“, kein Ausblenden, kein Warten der Guards). Der Button bleibt fokussierbar (`aria-disabled="true"`, kein `disabled`-Attribut), behält den Fokus und zeigt den Text „Wird geprüft …“; weitere Klicks oder Enter lösen keinen zweiten Request aus.
  - Zugriffsklasse unverändert: Die Seite bleibt, der Fokus bleibt auf dem Button, und `role="status"` meldet
    - bei „deaktiviert“: „Ihr Benutzerkonto ist weiterhin deaktiviert.“
    - bei „keineRolle“: „Ihrem Benutzerkonto ist weiterhin keine Rolle zugewiesen.“
  - Netzwerk- oder Serverfehler: Die Seite bleibt mit dem bisherigen Zustand, `role="alert"` meldet „Die Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.“
  - `401`: wie bisher (Sitzung verwerfen, Zustand „anonym“).
  - Wechsel zwischen „keineRolle“ und „deaktiviert“ (z. B. ein Benutzer ohne Rolle wurde inzwischen deaktiviert): Die Seite zeigt den neuen Grund mit dessen Text. Der Fokus bleibt auf „Erneut prüfen“.
  - Zugriffsklasse wird `mitRolle`: weiter mit AK-43.
- **AK-43** Wird die Zugriffsklasse `mitRolle` (Reaktivierung eines Benutzers mit Rolle oder Rollenvergabe an einen Benutzer ohne Rolle), führt die App `router.invalidate()` genau einmal aus. Der Guard von `/kein-zugriff` leitet zur Startseite `/` weiter (Entscheidung F3). Kopfzeile und Sidebar zeigen Namen und Einträge gemäß `berechtigungen`. Wird ein deaktivierter Benutzer ohne Rolle reaktiviert, bleibt er auf `/kein-zugriff` und sieht den Text für „keine Rolle“.
- **AK-44** Fensterfokus: Nur in den Zugriffsklassen `deaktiviert` und `ohneRolle` löst das Zurückkehren in das Fenster (`visibilitychange` auf `visible` oder `focus` des Fensters) eine stille Prüfung wie in AK-42 aus, ohne Status- oder Fehlermeldung. Das gilt unabhängig von der aktuellen Seite; eine Weiterleitung nach `/` gibt es nur, wenn der Benutzer auf `/kein-zugriff` steht (Guard). Regeln:
  - Höchstens eine Prüfung je 30 Sekunden und nie parallel zu einer laufenden (auch nicht zu „Erneut prüfen“).
  - In allen anderen Zuständen kein Request bei Fensterfokus: anonym, Fehler und **angemeldet mit Rolle** (Entscheidung F2).
  - Kein Timer, kein Intervall, keine Polling-Schleife (Vitest mit Fake-Timern: 5 Minuten ohne Ereignis → 0 Aufrufe von `/api/me`).
  - Die Listener werden beim Wechsel nach `mitRolle` oder anonym und beim Unmount entfernt.
- **AK-45** Guard-Neulauf nur bei echten Übergängen (QA-Punkt 4d): Maßgeblich ist die Zugriffsklasse des letzten festen Zustands (alles außer „pruefe“). `router.invalidate()` läuft genau dann, wenn sie sich zwischen zwei festen Zuständen ändert, also z. B. `mitRolle` → `deaktiviert`, `deaktiviert` → `mitRolle`, `ohneRolle` → `mitRolle` oder `ohneRolle` → `deaktiviert`. Beim ersten Laden (Start in „pruefe“, danach erste feste Zugriffsklasse) gibt es kein `invalidate`. Der Vergleich `rolle === 'keine'` für die Zugriffsklasse liegt in `app/anmeldung`; die Ausnahmeliste des Grep-Tests aus AK-23 wird um `app/anmeldung` erweitert. Tests (Vitest, `App.anmeldung.test.tsx`):
  - Erstaufruf von `/benutzerverwaltung` als Deaktivierter: Der `beforeLoad`-Guard läuft genau einmal (Spy auf `schutz()` oder gezählte `/kein-zugriff`-Navigationen), Ergebnis `/kein-zugriff`.
  - Erstaufruf als Admin und als Benutzer ohne Rolle: kein `invalidate`.
  - Während der Sitzung `403 benutzer_deaktiviert` auf einen anderen Aufruf (AK-32): genau ein `invalidate`, Ergebnis `/kein-zugriff`. Das erneute Laden von `/api/me` (`neuLaden`) behält dabei den letzten Zustand bis zur Antwort (kein Zwischenzustand „pruefe“, `bereit` bleibt `true`).
  - Prüfung ohne Änderung der Zugriffsklasse (z. B. weiterhin deaktiviert): kein `invalidate`.

### 12.3 Request-Protokoll ohne Personendaten (ADR-0019, neu; ADR-0017 angepasst)
- **AK-46** Eine eigene Middleware `AnfrageProtokoll` (`src/Coin.Api/Http/AnfrageProtokoll.cs`, registriert als erste Middleware vor `UseExceptionHandler`) schreibt für **jeden** Request genau einen Log-Eintrag. Das gilt ausdrücklich auch für die öffentlichen Katalog-GETs und den Bild-Endpunkt (Entscheidung F4); es gibt keine Ausnahmeliste im Code.
  - Kategorie `Coin.Api.Http.AnfrageProtokoll`, Level `Information`, `EventId` 4601 (`AnfrageBeendet`), Nachrichtenvorlage `HTTP {Methode} {Route} antwortete {Status} in {DauerMs} ms`.
  - `Methode`: eine aus GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, sonst `ANDERE` (keine freien Werte aus dem Request).
  - `Route`: Routen-Template des getroffenen Endpunkts mit führendem `/` (z. B. `/api/benutzer/{id}/rolle`), gebaut aus `RoutePattern.PathSegments`, ohne Constraints und Defaults (nicht `RawText`), ohne Query und ohne Parameterwerte. Ohne Endpunkt (404, 405, Fehler vor dem Routing): `(keine Route)`, nie der rohe Pfad.
  - `Status`: der tatsächlich gesendete Statuscode, auch für 401, 403, 404, 415 und 500. Bei Ausnahme nach Antwortbeginn der begonnene Status, bei Client-Abbruch vor Antwortbeginn 499, sonst 500 (Abbrüche vor Antwortbeginn fängt meist schon `UseExceptionHandler` mit 499 ab).
  - `DauerMs`: Dauer bis Ende der Antwort, gemessen über `TimeProvider` (Timestamp), gerundet auf ganze Millisekunden.
  - Absenken oder Abschalten nur über die Log-Level-Konfiguration `Logging:LogLevel:Coin.Api.Http.AnfrageProtokoll`. Inhalt und erfasste Endpunkte sind nicht konfigurierbar.
- **AK-47** Datenschutz (Erweiterung `Anmeldung/LogTests`, AK-22): Bei `GET /api/benutzer?suche=geheim.person@test.local`, `PUT /api/benutzer/{id}/rolle` mit Token und Body und `GET /api/unbekannt/max.mustermann@test.local` enthält kein Log-Eintrag (alle Kategorien, inklusive Scopes und strukturierter Werte) die Zeichenkette `geheim.person`, `max.mustermann`, `?suche`, die Ziel-Id, den Request-Body, den Authorization-Header, das Token, Namen oder E-Mails des Akteurs. Positiv geprüft: je Request genau ein `AnfrageProtokoll`-Eintrag mit erwarteter Methode, Route (`/api/benutzer`, `/api/benutzer/{id}/rolle`, `(keine Route)`) und Status; außerdem anonym `GET /api/coins/{id}/bild` → ein Eintrag mit Route `/api/coins/{id}/bild` und Level `Information`. Methode `FOO` → `ANDERE`. Die Hosting-Diagnose bleibt fest ab `Warning`. Umgesetzt mit Erweiterung von `Protokollierung.cs` (ADR-0019 Punkt 5): Der `ILoggerFactory`-Wrapper `MitFestenStufen` erzwingt feste Mindeststufen unabhängig von Konfigurationsregeln (auch Wildcards und empfängerspezifisch) für `Microsoft.AspNetCore.Hosting.Diagnostics` (`Warning`, zusätzlich keine Scopes, weil der Scope den rohen Pfad trug), `Routing.Matching.DfaMatcher` (`Warning`), `Mvc.Infrastructure.ControllerActionInvoker` (`Debug`) und `Server.Kestrel.BadRequests` (`Warning`); Filterregeln sind die zweite Linie. Die Kategorien werden exakt verglichen, gegen Umbenennung durch .NET-Updates sichern die Leak-Tests in `LogTests` ab; `Aufgeloeste_LoggerFactory_*` schlagen an, wenn die Fabrik (z. B. durch Serilog) ersetzt wird. `TraceId`/`SpanId` (ActivityTracking) ersetzen die frühere RequestId-Korrelation.

### 12.4 Frontend-Nacharbeiten aus dem QA-Review
- **AK-48** Bestätigungsdialoge während der Anfrage (`StatusAendern` und, gleiches Muster, `RolleZuweisen`):
  - „Abbrechen“ und der Bestätigen-Button („Deaktivieren“ bzw. „Rolle ändern“) bleiben fokussierbar (`focusableWhenDisabled`, `aria-disabled="true"`, kein `disabled`-Attribut). Der Fokus bleibt auf dem gedrückten Button, er fällt nicht auf `body`.
  - Der Dialog-Inhalt trägt `aria-busy="true"` und zeigt einen sichtbaren Hinweis in `role="status"`: „Änderung wird gespeichert …“. Die Namen der Buttons bleiben unverändert.
  - Escape, Klick auf „Abbrechen“ und Klick außerhalb schließen den Dialog während der Anfrage nicht.
  - Falls `AlertDialogCancel` in `shared/ui/alert-dialog.tsx` `focusableWhenDisabled` nicht durchreicht, wird die Komponente angepasst (Nacharbeit nach ADR-0009, dort vermerken).
- **AK-49** Schutz gegen Mehrfachsendung, unabhängig vom Render-Zeitpunkt (synchroner Schutz, z. B. `useRef`, nicht nur State): Doppelklick und mehrfaches Enter auf „Deaktivieren“, „Rolle ändern“ und „Reaktivieren“ (ohne Dialog) während `sendet` lösen genau einen PUT aus. Vitest mit zurückgehaltener Antwort (Deferred-Promise): zwei Klicks bzw. zwei Enter in Folge → genau ein Aufruf; während der Anfrage `aria-disabled="true"` und `document.activeElement` ist der Button; nach der Antwort wieder bedienbar.
- **AK-50** Die Fehlertext-Funktion liegt einmal in `entities/benutzer/model/fehlertext.ts` als `aenderungFehlertext(ergebnis)` (Texte unverändert nach AK-30 plus `benutzer_deaktiviert`) und wird über `entities/benutzer/index.ts` exportiert. `features/rolle-zuweisen/model/fehlertext.ts` und `features/benutzer-status-aendern/model/fehlertext.ts` samt Tests entfallen; der Test zieht nach `entities/benutzer/model/fehlertext.test.ts`. Steiger und `npm run lint` ohne Befund; keine Querimporte zwischen Features.

### 12.5 Abschluss
- **AK-51** `dotnet build` ohne Warnungen, `dotnet test`, `npm test`, `npm run test:ui`, `npm run lint` und `npx playwright test` grün. Doku nach 12.7 nachgezogen.

### 12.6 Lösungsentwurf und Zuordnung
**Backend**
- `Coin.Domain/Benutzer/Schutzregeln.cs`: Akteur-Prüfung an den Anfang; `BenutzerverwaltungService` unverändert (bildet nur ab). Keine API-Vertragsänderung; `docs/api.md` nur Hinweis, dass bei fehlendem Recht `403` vor `404` kommt.
- `Coin.Api/Http/AnfrageProtokoll.cs`: Middleware mit `ILogger<AnfrageProtokoll>`, `TimeProvider`, `LoggerMessage`-Quellgenerator. Liest den Endpunkt nach `await next()` über `HttpContext.GetEndpoint()`, ersatzweise aus `IExceptionHandlerFeature`. Loggt im `finally` (Status siehe AK-46). Keine Scopes mit Request-Daten. Registrierung in `Program.cs` vor `UseExceptionHandler`.
- `Coin.Api/Http/Protokollierung.cs`: erweitert um `MitFestenStufen` und ActivityTracking (AK-47, ADR-0019 Punkt 5).

**Frontend (FSD)**
```
entities/benutzer/model/fehlertext.ts   aenderungFehlertext(ergebnis) · index.ts: + aenderungFehlertext
features/rolle-zuweisen/                ui: RolleZuweisen nutzt aenderungFehlertext, Sende-Sperre per Ref, Dialog aria-busy/Status
features/benutzer-status-aendern/       ui: StatusAendern dito; model/ entfällt
shared/ui/alert-dialog.tsx              AlertDialogCancel reicht focusableWhenDisabled durch (ADR-0009)
pages/kein-zugriff/                     KeinZugriffSeite: für beide Gründe Prop
                                        onErneutPruefen: () => Promise<'unveraendert' | 'fehler' | 'geaendert'>;
                                        Button „Erneut prüfen“, Status-/Alert-Meldung je Grund (Zustand lokal in der Seite)
app/anmeldung/use-benutzer.ts           erneutPruefen(): lädt /api/me, behält den letzten Zustand bis zur Antwort
                                        (auch für neuLaden), meldet dem Aufrufer, ob sich die Zugriffsklasse geändert hat;
                                        Sperre gegen parallele Prüfung
app/anmeldung/zugriffsklasse.ts         neu: zugriffsklasse(zustand) → 'deaktiviert' | 'ohneRolle' | 'mitRolle' | null (+ Test)
app/anmeldung/use-pruefen-bei-fokus.ts  neu: Listener visibilitychange/focus nur bei 'deaktiviert' und 'ohneRolle', 30-s-Sperre
app/anmeldung/benutzer-kontext.ts       BenutzerKontextWert + erneutPruefen
app/router/routen-komponenten.tsx       KeinZugriffRoute reicht erneutPruefen für beide Gründe an die Seite
app/App.tsx                             invalidate nach AK-45 (Wechsel der Zugriffsklasse), nutzt use-pruefen-bei-fokus
```
Shadcn: keine neuen Komponenten (`Button`, `AlertDialog` vorhanden). Seiten bleiben frei von Router-Hooks; die Navigation nach Reaktivierung oder Rollenvergabe erledigt der Guard nach `invalidate`. Abschnitt 5.6, Satz „die Fehlertexte liegen je Feature“, ist damit überholt.

**Tests**
| Ebene | Inhalt |
|---|---|
| xUnit Unit | `SchutzregelnTests` (AK-39) |
| xUnit Integration | Service-Test AK-40, `LogTests` erweitert (AK-46, AK-47) |
| Vitest | `KeinZugriffSeite` für beide Gründe (AK-41, AK-42: Texte, `aria-disabled`, Fokus, Einmal-Request, Grundwechsel), `zugriffsklasse`, `use-pruefen-bei-fokus` bzw. `App.anmeldung.test.tsx` (AK-43 bis AK-45, Fake-Timer, kein Request bei „angemeldet mit Rolle“), `StatusAendern`/`RolleZuweisen` (AK-48, AK-49), `fehlertext.test.ts` in `entities/benutzer` (AK-50), Grep-Test AK-23 mit erweiterter Ausnahmeliste, Englisch-Prüfung der neuen Texte |
| UI-Test (`web/ui-tests`, gemockt) | `/kein-zugriff` deaktiviert → Tastatur zu „Erneut prüfen“, Enter; Mock liefert erst 403, dann 200 → Startseite; sichtbarer Fokus am Button. Dasselbe für „keine Rolle“: erst `rolle: 'keine'` (Meldung „weiterhin keine Rolle“), dann `Betrachter` → Startseite. Dialog „Deaktivieren“ mit verzögerter Antwort: Fokus bleibt auf dem Button, „Änderung wird gespeichert …“ sichtbar, zweites Enter ohne zweiten PUT |
| Systemtest (`e2e/`) | `benutzerverwaltung.spec.ts` erweitert: Admin deaktiviert `betrachter@test.local`; Betrachter (eigener Kontext) landet auf „Kein Zugriff“; Admin reaktiviert; Betrachter klickt „Erneut prüfen“ und sieht die Startseite. Endet mit aktivem Betrachter (wiederholbar). Die Rollenvergabe an „ohne Rolle“ wird nur im UI-Test geprüft, damit `neu@test.local` ohne Rolle bleibt |

### 12.7 Doku-Bedarf (docs-Agent, erledigt)
- `docs/adr/0018` und `0017` angepasst, `0019` neu und an die Umsetzung angeglichen.
- `docs/api.md`: Reihenfolge `403` vor `404` bei `PUT /api/benutzer/{id}/…` für Akteure ohne Recht; Abschnitt Protokollierung (Felder des Request-Logs).
- `README.md` (Betrieb): Request-Log-Kategorie, Felder, alle Requests auf `Information`, Absenken per `Logging:LogLevel`.
- `docs/benutzer/anmeldung.md`: „Konto deaktiviert“ und „Noch keine Rolle“ um „Erneut prüfen“ und die Prüfung beim Zurückkehren ins Fenster ergänzen.
- `docs/requirements.md`: Entscheidungen vom 2026-10-06 (12.8) festhalten.
- Abschnitt 11 dieses Entwurfs: erledigte Grenzen streichen; ADR-0009 um die `AlertDialogCancel`-Nacharbeit ergänzen.
- `docs/benutzer/benutzerverwaltung.md`: Hinweis „Änderung wird gespeichert …“.

### 12.8 Entscheidungen des Auftraggebers (2026-10-06), Annahmen
Entscheidungen:
- **F1 ja:** „Erneut prüfen“ und die Prüfung bei Fensterfokus gelten auch für Benutzer ohne Rolle (AK-41 bis AK-45).
- **F2 nein:** Kein Neuladen von `/api/me` bei Fensterfokus für angemeldete Benutzer mit Rolle (AK-44). Rollenwechsel bei diesen Benutzern werden weiter erst nach dem Neuladen sichtbar (Abschnitt 11).
- **F3 Startseite:** Nach Reaktivierung oder Rollenvergabe geht es zur Startseite. Ein früheres Ziel wird nicht gespeichert (AK-43).
- **F4 ja:** Alle Requests, auch die öffentlichen Katalog-GETs und der Bild-Endpunkt, werden auf `Information` protokolliert. Absenken nur per Log-Level-Konfiguration (AK-46, ADR-0019).

Annahmen:
- A1: Die Akteur-Prüfung steht auch vor `NichtGefunden`, nicht nur vor `Unveraendert`. So erfährt ein Akteur ohne Recht auch nicht, ob eine Id existiert. Über HTTP ändert sich dadurch nur das sehr kurze TOCTOU-Fenster.
- A2: AK-48/AK-49 gelten auch für `RolleZuweisen`, weil dort dasselbe Muster und dasselbe Problem vorliegen.
- A4: 30 Sekunden Mindestabstand für die Prüfung bei Fensterfokus.

Offene Fragen: keine (alle Fragen am 2026-10-06 entschieden, siehe oben).
