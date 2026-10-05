# Feature: Anmeldung über Keycloak (OIDC)

Status: umgesetzt (vom qa-reviewer freigegeben) · Entwurf Rev. 2 · Branch: `feature/anmeldung-keycloak` (basiert auf `feature/frontend-grundgeruest`) · Löst [ADR-0004](../adr/0004-pilot-ohne-authentifizierung.md) ab

Zugehörige ADRs: [0012](../adr/0012-anmeldung-keycloak-oidc.md) (Keycloak/OIDC, Token-Prüfung, Token-Speicherung), [0013](../adr/0013-benutzer-und-rollen-in-eigener-datenbank.md) (Benutzer, Rollen, Bootstrap, Autorisierung), [0014](../adr/0014-coin-katalog-oeffentlich-lesbar.md) (Katalog öffentlich lesbar), [0015](../adr/0015-systemtests-mit-test-keycloak.md) (Systemtests mit Test-Keycloak, erweitert ADR-0007)

## 1. Ziel
Benutzer melden sich mit E-Mail und Passwort an einem Keycloak an (Authorization Code Flow mit PKCE). Lokal läuft ein Test-Keycloak per `docker compose`. In Produktion wird nur dessen Adresse konfiguriert. Dort ist der Keycloak ein Sprungpunkt zum AD und für uns nur lesend nutzbar: kein Admin-API-Zugriff, keine Keycloak-Rollen, keine Registrierung.

Die API prüft JWT-Bearer-Tokens. Benutzer und Rollen führt C.O.I.N. in der eigenen Datenbank. Den Coin-Katalog kann jeder ohne Anmeldung lesen. Schreiben dürfen nur Administratoren und Sachbearbeiter. Die verbindliche Vorgabe steht im Auftrag zu diesem Branch.

### Entscheidungen des Auftraggebers (2026-10-05)
1. Sachbearbeiter und Betrachter erhalten ihre Rolle erst in einem späteren Feature (Rollen-/Rechteverwaltung). Jetzt wird nur `Administrator` per `Bootstrap:AdminEmails` vergeben. Es gibt keine weiteren Listen und keinen Seed. Das Rollen-Enum mit drei Werten wird trotzdem angelegt.
2. Betrachter darf nicht schreiben. `POST /api/coins` und `PUT /api/coins/{id}/bild` sind nur für Administrator und Sachbearbeiter erlaubt.
3. Der Coin-Katalog ist ohne Anmeldung lesbar. `GET /api/coins`, `GET /api/coins/{id}` und `GET /api/coins/{id}/bild` sind ausdrücklich öffentlich. Startseite und Coin-Liste sind ohne Login sichtbar.
4. `email_verified=true` ist Bedingung für den Bootstrap.
5. `azp` muss gleich `Oidc:ClientId` sein.

## 2. Kernentscheidungen (Begründung in den ADRs)
1. **Keycloak**: Image `quay.io/keycloak/keycloak` mit exaktem Tag (umgesetzt: `26.8.0`), `start-dev --import-realm`. Realm `coin`, öffentlicher Client `coin-web`, Audience `coin-api`. Lokal läuft er auf `127.0.0.1:8180`, für Systemtests als Wegwerf-Container auf `5184`.
2. **Konfiguration** in der eigenen Sektion `Oidc` (`Authority`, `Audience`, `ClientId`). Grund: `Authentication:Schemes:Bearer` bindet das Framework automatisch und würde die Prüfung aufweichbar machen. Die Prüfparameter stehen fest im Code.
3. **Token-Prüfung**:
   - Issuer = Authority (exakt), Audience = `Oidc:Audience`, Lebensdauer mit ClockSkew 30 s.
   - Signatur nur RS256 mit Schlüssel aus JWKS. `typ` ∈ {`JWT`, `at+jwt`}.
   - `sub` ist Pflicht, `azp` muss gleich ClientId sein.
   - `MapInboundClaims=false`, `IncludeErrorDetails=false`. Das Token wird nur aus dem `Authorization`-Header gelesen.
   - HTTPS-Metadaten sind Pflicht, außer für Loopback-Hosts.
4. **Standardmäßig geschützt**: Die `FallbackPolicy` verlangt einen angemeldeten Benutzer. Öffentlich (`[AllowAnonymous]`) sind genau die drei Lese-Endpunkte des Katalogs, dazu `/openapi/v1.json` nur in Development. Schreibende Endpunkte verlangen die Policy `KatalogSchreiben` (Rolle Administrator oder Sachbearbeiter).
5. **Benutzerabgleich** bei `/api/me` und bei schreibenden Requests: Upsert auf einen eindeutigen Index `(issuer, subject)`, nebenläufig sicher, Schreibzugriff nur bei Änderung. Die Rolle setzt nur der Bootstrap beim Anlegen.
6. **Motivbild** bleibt `<img src>` auf den öffentlichen Bild-Endpunkt. `Cache-Control` bleibt `private, max-age=31536000, immutable` (Begründung in ADR-0014).
7. **Frontend**: `oidc-client-ts` mit `react-oidc-context`, User und State in `sessionStorage`, Erneuerung per Refresh-Token. Anmeldung startet über den Button „Anmelden“ oder über eine Route, die Anmeldung verlangt. Ohne Rolle führt die Anmeldung nach `/kein-zugriff`.
8. **Nicht verwendet**: `@stack-lib/*` (nicht in `package.json`, `@stack-lib/jwt-utils` liefert npm 404) und `srts-netlayer` (nicht in `package.json`, gleichnamiges öffentliches Paket ungeprüft, Supply-Chain-Risiko).

## 3. Akzeptanzkriterien

### Lokale Umgebung (Keycloak)
- **AK-1** `compose.yaml` enthält den Service `keycloak`:
  - Image `quay.io/keycloak/keycloak:<x.y.z>` mit exaktem Tag, nicht `latest`.
  - `command: start-dev --import-realm`.
  - Port nur `127.0.0.1:8180:8080`.
  - `KC_HOSTNAME=http://localhost:8180`.
  - `./infra/keycloak/coin-realm.json` read-only nach `/opt/keycloak/data/import/` gemountet.
  - `KC_BOOTSTRAP_ADMIN_USERNAME=admin` und `KC_BOOTSTRAP_ADMIN_PASSWORD=${COIN_KEYCLOAK_ADMIN_PASSWORD:?…}` aus `.env`.
  - `.env.example` hat die leere Zeile `COIN_KEYCLOAK_ADMIN_PASSWORD=`.

  Nach `docker compose up -d` liefert `GET http://localhost:8180/realms/coin/.well-known/openid-configuration` innerhalb von 90 s `200` mit `issuer` = `http://localhost:8180/realms/coin`.
- **AK-2** Realm `coin`:
  - `displayName` enthält „NUR LOKALE TESTUMGEBUNG“.
  - Aus (`false`): `registrationAllowed`, `resetPasswordAllowed`, `rememberMe`, `editUsernameAllowed`.
  - `loginWithEmailAllowed=true`, `duplicateEmailsAllowed=false`, `bruteForceProtected=true`.
  - Sprache: `internationalizationEnabled=true`, `supportedLocales=["de"]`, `defaultLocale="de"`.
  - Lebensdauer: Access-Token 300 s, SSO-Idle 1800 s, SSO-Max 28800 s.
  - `revokeRefreshToken=true`, `refreshTokenMaxReuse=0`.
- **AK-3** Client `coin-web`:
  - `publicClient=true`, `standardFlowEnabled=true`.
  - `implicitFlowEnabled`, `directAccessGrantsEnabled` und `serviceAccountsEnabled` = `false`.
  - `consentRequired=false`, `fullScopeAllowed=false`, `pkce.code.challenge.method=S256`.
  - Redirect-URIs genau `http://localhost:5173/anmeldung/rueckruf` und `http://localhost:5183/anmeldung/rueckruf`.
  - Post-Logout-URIs genau `…:5173/abgemeldet` und `…:5183/abgemeldet`.
  - Web-Origins genau `http://localhost:5173` und `http://localhost:5183`.
  - Keine Wildcards, kein Secret.
  - Default-Client-Scopes `basic`, `profile`, `email` und `coin-api-audience`, ohne `roles`.
  - Der Audience-Mapper (`included.custom.audience=coin-api`) wirkt nur auf das Access-Token.

  Das Access-Token enthält `aud`=`coin-api`, `azp`=`coin-web`, `sub`, `email`, `email_verified` und `name`.
- **AK-4** Testbenutzer:
  - `admin@test.local`, `sachbearbeiter@test.local`, `betrachter@test.local` und `neu@test.local`.
  - Benutzername = E-Mail, `enabled`, `emailVerified=true`.
  - Vorname „Test“, Nachname „Administrator“, „Sachbearbeiter“, „Betrachter“ bzw. „Neu“.
  - Passwort `nur-lokal-testpasswort` (nicht temporär).
  - Attribut `hinweis` = „Testbenutzer – nur lokal, Passwort ist Testdatum“.
  - Keine Rollen außer den Keycloak-Standardrollen.

  Alle vier können sich anmelden. `infra/keycloak/README.md` kennzeichnet die Datei als Testdaten. In der App hat nur `admin@test.local` eine Rolle (per Bootstrap). Die anderen drei haben vorerst keine.
- **AK-5** Die Realm-Datei enthält keinen Client-Secret und keine Schlüssel: `rg -i "secret|privateKey|\"keys\"" infra/keycloak/coin-realm.json` findet nichts.

### Backend: Authentifizierung
- **AK-6** Konfiguration über `Oidc:Authority`, `Oidc:Audience` und `Oidc:ClientId`:
  - `appsettings.json` enthält dafür keine Werte.
  - `appsettings.Development.json` enthält `http://localhost:8180/realms/coin`, `coin-api` und `coin-web`.
  - Fehlt ein Wert oder ist die Authority keine absolute URI, bricht der Start mit einer deutschen Meldung ab, die den Schlüssel nennt.
  - Ebenso bei einer `http`-Authority, deren Host nicht `localhost`, `127.0.0.1` oder `::1` ist.
  - Im Code steht kein Wert fest.
- **AK-7** Ohne gültiges Token liefern `POST /api/coins`, `PUT /api/coins/{id}/bild` und `GET /api/me` `401`: ProblemDetails mit `title` „Nicht angemeldet“ und `WWW-Authenticate: Bearer` ohne `error_description`.
- **AK-8** Mit `401` abgelehnt werden (geprüft an `GET /api/me` und `POST /api/coins`):
  - (a) Token eines Fremd-Issuers (fremder Schlüssel, fremdes `iss`),
  - (b) richtiger Schlüssel, aber `iss` ≠ Authority,
  - (c) `aud` fehlt oder ≠ Audience,
  - (d) `exp` mehr als 30 s in der Vergangenheit,
  - (e) `nbf` in der Zukunft,
  - (f) `alg=none` bzw. unsigniert,
  - (g) HS256,
  - (h) `typ` `ID` oder `Refresh`,
  - (i) ohne `sub`,
  - (j) `azp` fehlt oder ≠ ClientId,
  - (k) Token nur per `?access_token=`,
  - (l) manipulierte Payload.

  Ein gültiges Token liefert `200` auf `/api/me`.
- **AK-9** Die Prüfung ist nicht abschaltbar:
  - Kein Konfigurationsschlüssel steuert `Validate*` oder `RequireHttpsMetadata`.
  - Setzt man `Authentication:Schemes:Bearer:ValidIssuers:0`, `…:ValidAudiences:0`, `…:Authority`, `…:RequireHttpsMetadata=false` und `…:TokenValidationParameters:ValidateIssuer=false` auf fremde Werte, bleiben AK-8 (a) bis (c) bei `401`.
  - In `Testing` gilt für die aufgelösten `JwtBearerOptions`: alle vier `Validate*` = `true`, `ValidIssuers` = [Authority], `ValidAudiences` = [Audience], `ValidAlgorithms` = [`RS256`].
- **AK-10** Ein Integrationstest über `EndpointDataSource` prüft: In `Testing` sind genau `GET /api/coins`, `GET /api/coins/{id}` und `GET /api/coins/{id}/bild` anonym erreichbar (`[AllowAnonymous]`). Jeder andere Endpunkt verlangt Anmeldung. In Development kommt nur `/openapi/v1.json` hinzu.
- **AK-11** Rollen aus dem Token werden ignoriert. Ein Benutzer ohne Rolle sendet ein Token mit `realm_access.roles=["Administrator"]`, `resource_access.coin-web.roles=["Administrator"]` und `roles="Administrator"`. Ergebnis: `POST /api/coins` liefert `403`, `/api/me` liefert `rolle` = `"keine"`.
- **AK-12** CORS nur für `Frontend:Ursprung` (genau ein Origin, Dev: `http://localhost:5173`):
  - Preflight von diesem Origin: `Access-Control-Allow-Origin` = Origin, Methoden `GET`, `POST`, `PUT`, Header `Authorization` und `Content-Type`, kein `Access-Control-Allow-Credentials`.
  - Ein anderer Origin bekommt keinen ACAO-Header.
  - Ohne Einstellung werden keine CORS-Header gesendet.
  - `*`, ein Wert mit Pfad oder ein ungültiger Wert bricht den Start ab.

### Benutzer in der eigenen Datenbank
- **AK-13** Der erste authentifizierte Aufruf von `/api/me` oder eines schreibenden Endpunkts mit unbekanntem (`iss`, `sub`) legt genau einen Datensatz in `benutzer` an:
  - `email` aus dem Claim `email`.
  - `anzeigename` aus `name`, sonst `preferred_username`, sonst `email`, sonst „Unbekannt“.
  - `rolle` = `NULL`.
  - `erstellt_am` = `aktualisiert_am` = jetzt (UTC, Mikrosekunden).

  Öffentliche GET-Aufrufe lösen keinen Abgleich aus, auch nicht mit Token.
- **AK-14** Weitere Aufrufe mit demselben `sub` legen keinen neuen Datensatz an. Geänderte E-Mail oder geänderter Name werden übernommen, dann wird `aktualisiert_am` neu gesetzt. Ohne Änderung wird nichts geschrieben. Der Abgleich ändert nie die Rolle.
- **AK-15** 10 parallele Erstaufrufe desselben `sub` liefern alle `200` und erzeugen genau 1 Datensatz.
- **AK-16** Bootstrap über `Bootstrap:AdminEmails` (Liste):
  - Nur beim **Anlegen** wird die Rolle `Administrator` vergeben, und nur wenn `email_verified=true` ist und die E-Mail (nach Trim, ohne Beachtung der Groß-/Kleinschreibung) in der Liste steht.
  - Keine Rolle, wenn `email_verified` `false` ist oder fehlt, wenn die Liste leer ist oder fehlt, und für bereits vorhandene Benutzer.
  - Wird eine Adresse aus der Liste entfernt, entzieht das keine Rolle.
  - Werte: Development `["admin@test.local"]`, `appsettings.json` `[]`.
  - Es gibt keinen weiteren Mechanismus zur Rollenvergabe.
- **AK-17** Ein Anzeigename über 200 Zeichen wird auf 200 gekürzt. Eine E-Mail über 320 Zeichen wird `NULL`. Kein `500`.

### Autorisierung
- **AK-18** Öffentliches Lesen:
  - `GET /api/coins`, `GET /api/coins/{id}` und `GET /api/coins/{id}/bild` liefern ohne Token dieselben Antworten wie bisher, mit identischem Status, Body und Headern, einschließlich der Bild-Header aus `docs/api.md` (`Cache-Control: private, max-age=31536000, immutable`).
  - Mit gültigem, ungültigem oder abgelaufenem Token ist die Antwort identisch (kein `401`, kein `Vary: Authorization`).
  - Coin-Antworten enthalten genau die Felder `id`, `name`, `herausgeber`, `auflage`, `beschreibung`, `erstelltAm` und `bildUrl`. Insbesondere gibt es keine Benutzer- oder Erstellerangaben. Ein Integrationstest prüft die Feldmenge.
- **AK-19** Schreiben (Policy `KatalogSchreiben`):
  - `POST /api/coins` und `PUT /api/coins/{id}/bild` sind erlaubt für `Administrator` und `Sachbearbeiter`.
  - Für `Betrachter` und Benutzer ohne Rolle: `403` (ProblemDetails, `title` „Kein Zugriff“, `detail` „Ihr Benutzerkonto ist nicht berechtigt, den Coin-Katalog zu ändern.“).
  - Ohne Token: `401` (AK-7).
  - `401` und `403` gehen vor `400`, `404` und `415`. Es wird nichts gespeichert, und der Upload-Body wird nicht gelesen.
  - Die bestehenden Integrationstests zu POST und PUT laufen als Bootstrap-Admin mit unveränderten Assertions. Für Sachbearbeiter und Betrachter setzen die Tests die Rolle direkt in der DB (nur Testdaten).

### API `GET /api/me`
- **AK-20** Antwort `200`, `Cache-Control: no-store`, Body `{ "id", "name", "email", "rolle" }`:
  - `id` ist die interne GUID, nicht `sub`.
  - `email` ist gegebenenfalls `null`.
  - `rolle` ∈ `"Administrator"`, `"Sachbearbeiter"`, `"Betrachter"`, `"keine"`.
  - Keine weiteren Felder.

  Fehler: `401`, sowie `500` ohne Details.

### Logging
- **AK-21** In den Logs stehen keine Tokens, kein Wert des `Authorization`-Headers, keine E-Mails und keine Anzeigenamen. Ein Integrationstest fängt die Logs ab `Debug` ab und sucht nach Token, Signatur, Test-E-Mail und Test-Name. `ShowPII` und `EnableSensitiveDataLogging` werden nicht aktiviert.

### Frontend
- **AK-22** dependencies: `oidc-client-ts` ^3.5.0 und `react-oidc-context` ^3.3.1. Keine `@stack-lib/*`, kein `srts-netlayer`, keine weitere Auth-Bibliothek.
- **AK-23** Konfiguration über `VITE_OIDC_AUTHORITY` und `VITE_OIDC_CLIENT_ID`, eingecheckt in `web/.env.development`:
  - In `web/src` kommen `8180`, `realms/` und `coin-web` nicht vor.
  - Redirect-URI = Origin + `/anmeldung/rueckruf`, Post-Logout-URI = Origin + `/abgemeldet`.
  - Fehlt ein Wert, bleibt der Katalog lesbar. Statt „Anmelden“ zeigt die Kopfzeile dann den Hinweis „Anmeldung ist nicht konfiguriert.“
- **AK-24** Die Anmeldung startet nur in zwei Fällen: per Button „Anmelden“ oder beim Aufruf einer Route, die Anmeldung verlangt.
  - Sie leitet zum `authorization_endpoint` mit `response_type=code`, `client_id`, exakter `redirect_uri`, `code_challenge`, `code_challenge_method=S256`, `state` und `scope` mit `openid profile email`. Kein `client_secret`.
  - Nach dem Rückruf lädt die App `/api/me`:
    - Bei `rolle` = `"keine"` geht es zu `/kein-zugriff`.
    - Sonst zurück zum Ausgangspfad inklusive Query. Ein Ziel, das kein relativer Pfad derselben Origin ist, führt zu `/`.
  - `code` und `state` werden aus der URL entfernt.
  - Anonyme Besucher werden nie automatisch zum Login geleitet, wenn sie `/` oder `/coins` öffnen.
- **AK-25** User und OIDC-State liegen nur in `sessionStorage`. `localStorage` enthält höchstens `coin-theme`. Die App setzt keine Cookies. Nach dem Abmelden gibt es keine `oidc.`-Schlüssel mehr.
- **AK-26** Erneuerung: `automaticSilentRenew` per `grant_type=refresh_token` (kein iframe, `monitorSession=false`, `loadUserInfo=false`). Danach senden API-Aufrufe das neue Token. Scheitert die Erneuerung, wird der User entfernt, und die App zeigt den Zustand „anonym“ (Button „Anmelden“).
- **AK-27** Angemeldet sendet jeder API-Aufruf über `shared/api` `Authorization: Bearer`. Das `<img>` des Motivbilds sendet keinen Header.
  - Bei `401` auf einen schreibenden Aufruf wird der User entfernt und die Anmeldung mit Rückkehr auf den aktuellen Pfad gestartet. Die Formulareingaben gehen dabei verloren; ein Hinweis davor ist nicht gefordert.
  - Bei `403` zeigt das Formular per `role="alert"` „Sie sind nicht berechtigt, Coins zu erfassen.“
- **AK-28** Routen:
  - Öffentlich: `/`, `/coins`, `/abgemeldet`, `/anmeldung/rueckruf` und unbekannte Pfade (404).
  - Nur mit Anmeldung: `/kein-zugriff`. Ohne Sitzung startet die Anmeldung mit Rückkehrziel `/kein-zugriff`.
  - Guard-Funktionen `erfordertAnmeldung` und `erfordertRolle(rollen)` liegen in `app/router/schutz.ts` und sind unit-getestet (für künftige Seiten).
  - `/api/me` wird nur angemeldet aufgerufen, einmal pro Anmeldung bzw. App-Start, nicht bei jeder Navigation. Anonym gibt es keinen Aufruf von `/api/me`.
- **AK-29** Seite „Kein Zugriff“ (`/kein-zugriff`, in der App-Shell):
  - `h1` „Kein Zugriff“.
  - Text: „Sie sind als {Name} angemeldet, Ihrem Konto ist aber noch keine Rolle zugewiesen. Den Coin-Katalog können Sie weiterhin ansehen. Für weitere Funktionen wenden Sie sich bitte an einen Administrator.“
  - Link „Zum Coin-Katalog“ (`/coins`) und Button „Abmelden“.
  - Benutzer mit Rolle werden von `/kein-zugriff` nach `/` geleitet.
- **AK-30** Kopfzeile der App-Shell:
  - Anonym: Button „Anmelden“ (lucide `LogIn`, `aria-hidden`).
  - Angemeldet: Name aus `/api/me` mit `sr-only`-Präfix „Angemeldet als“ und Button „Abmelden“ (lucide `LogOut`, `aria-hidden`).
  - Während die Sitzung geprüft wird, steht dort weder „Anmelden“ noch ein Name; die Seite selbst wird schon angezeigt.
- **AK-31** Abmelden:
  - Der lokale User wird entfernt.
  - Weiterleitung zum `end_session_endpoint` mit `id_token_hint`, `client_id` und `post_logout_redirect_uri` = Origin + `/abgemeldet`.
  - `/abgemeldet` zeigt `h1` „Abgemeldet“, „Sie wurden abgemeldet.“, den Button „Erneut anmelden“ und den Link „Zum Coin-Katalog“.
  - Danach ist `/coins` anonym lesbar. „Anmelden“ zeigt wieder das Keycloak-Formular (SSO-Sitzung beendet).
- **AK-32** Zustände:
  - Rückruf: `role="status"` „Anmeldung wird abgeschlossen …“.
  - Fehler im Rückruf (ungültiger State, `error=access_denied`, Netzwerk): `h1` „Anmeldung fehlgeschlagen“, ein Satz ohne technische Details, Button „Erneut anmelden“ und Link „Zum Coin-Katalog“.
  - `/api/me` scheitert (5xx oder Netzwerk): `role="alert"` in der Kopfzeile „Ihre Anmeldung konnte nicht geprüft werden.“ mit Button „Erneut versuchen“. Der Katalog bleibt lesbar, das Formular ist ausgeblendet.
- **AK-33** Coin-Liste `/coins`: Katalogliste und Motivbilder (`<img src={bildUrl}>`, unverändert) sieht jeder. Der Abschnitt „Neuen Coin erfassen“ hängt vom Zustand ab:
  - Administrator oder Sachbearbeiter: Formular wie bisher.
  - Anonym: Text „Zum Erfassen von Coins melden Sie sich bitte an.“ und Button „Anmelden“, kein Formular.
  - Angemeldet ohne Schreibrolle (keine Rolle, Betrachter): Text „Coins erfassen können nur Administratoren und Sachbearbeiter.“, kein Formular.

  Die Überschrift „Neuen Coin erfassen“ bleibt in allen Fällen. `CoinListe.test.tsx` bleibt unverändert.
- **AK-34** Barrierefreiheit:
  - Alle neuen Bedienelemente sind per Tastatur erreichbar und auslösbar und haben einen sichtbaren Fokus (`focus-visible`).
  - Jede neue Seite hat genau ein `h1`. Das `main` stellt die App-Shell bzw. die Rückrufseite.
  - Statusmeldungen haben `role="status"`, Fehler `role="alert"`.
  - Alle Texte sind deutsch, auch `sr-only` und `aria-label`. Die Englisch-Prüfung gilt für die neuen Seiten und die Kopfzeile (anonym und angemeldet).
- **AK-35** FSD wie in Abschnitt 5.5. `npm run lint` (ESLint und Steiger) und `npm run build` laufen ohne Befund.

### Tests und Abschluss
- **AK-36** Integrationstests laufen mit selbst signierten Test-Tokens ohne Keycloak-Container (Abschnitt 6.1) und decken AK-6 bis AK-21 ab.
- **AK-37** Systemtests mit echtem Test-Keycloak (Abschnitt 6.4):
  - (a) Anonym zeigt `/coins` die Liste und den Anmeldehinweis, aber kein Formular. Ein vorher angelegter Coin mit Bild wird samt geladenem Vorschaubild angezeigt.
  - (b) `admin@test.local` meldet sich an, der Name „Test Administrator“ erscheint, danach Abmelden → `/abgemeldet` → „Anmelden“ zeigt das Keycloak-Formular.
  - (c) `neu@test.local` landet nach dem Login auf „Kein Zugriff“. Über „Zum Coin-Katalog“ ist die Liste ohne Formular sichtbar.
  - Die 5 bestehenden Tests melden sich in `beforeEach` als Admin an. Ihre Assertions bleiben unverändert.
  - AK-1 bis AK-13 aus `e2e-testdatenbank.md` gelten weiter, auch für Keycloak und Port 5184.
- **AK-38** Diese Prüfungen sind grün bzw. ohne Warnungen: `dotnet build`, `dotnet test`, `npm test`, `npm run test:ui`, `npm run lint`, `npx playwright test` und `npm run test:skripte`. Die Doku nach Abschnitt 9 ist aktualisiert.

## 4. Abgrenzung (nicht im Umfang)
- Vergabe der Rollen Sachbearbeiter und Betrachter, Rollen- und Rechteverwaltung (Oberfläche oder API), weitere Bootstrap-Listen, Seed, Audit-Log.
- Registrierung und Passwort-Handling in der App (kein Password-Grant, kein eigenes Formular, kein Reset).
- Keycloak-Rollen, Gruppen, Admin-API, Synchronisation aus Keycloak oder AD.
- Laufzeitkonfiguration des Frontends für ein Deployment, SPA-Hosting, CSP-Header.
- Health-Endpunkt, Swagger-UI mit Login, Back-/Front-Channel-Logout, Session-Monitoring.
- Eigene Seite für „Coin anlegen“. Das Formular bleibt auf `/coins`.

## 5. Lösungsentwurf

### 5.1 Keycloak lokal
Werte siehe AK-1 bis AK-4.

- Health-Check optional per `/dev/tcp` auf den nicht veröffentlichten Management-Port 9000 (`KC_HEALTH_ENABLED=true`).
- `--import-realm` überspringt einen vorhandenen Realm. Änderungen an der Realm-Datei brauchen deshalb `docker compose up -d --force-recreate keycloak`.
- Die Admin-Konsole (`/admin`, Benutzer `admin`, Passwort aus `.env`) hat nichts mit dem Testbenutzer `admin@test.local` zu tun.

### 5.2 Backend (Coin.Api)
- `Authentifizierung/OidcOptionen.cs`: Bindung und Prüfung beim Start (AK-6).
- `Authentifizierung/AuthentifizierungRegistrierung.cs`: `AddJwtBearer()` plus `PostConfigure<JwtBearerOptions>`, das alle sicherheitsrelevanten Felder fest setzt:
  - `Authority`, `MetadataAddress`, `RequireHttpsMetadata = !IstLoopback`.
  - `MapInboundClaims=false`, `IncludeErrorDetails=false`, `SaveToken=false`.
  - Neue `TokenValidationParameters`: `ValidIssuers=[Authority]`, `ValidAudiences=[Audience]`, alle `Validate*`, `RequireSignedTokens`, `RequireExpirationTime`, `ValidAlgorithms=["RS256"]`, `ValidTypes=["JWT","at+jwt"]`, `ClockSkew=30 s`, `NameClaimType="name"`, `RoleClaimType="coin_ungenutzt"`.
  - `OnTokenValidated` prüft `sub` und `azp`.
  - `OnChallenge` und `OnForbidden` liefern die ProblemDetails aus AK-7 und AK-19.
- Autorisierung:
  - `FallbackPolicy = RequireAuthenticatedUser()`.
  - Policy `KatalogSchreiben` = angemeldet + `RolleAnforderung(Administrator, Sachbearbeiter)`. Der Handler nutzt `IAktuellerBenutzer`.
  - `CoinsController`: `Auflisten`, `Finden` und `BildAbrufen` erhalten `[AllowAnonymous]`, `Anlegen` und `BildHochladen` `[Authorize(Policy = KatalogSchreiben)]`.
  - Eine Policy `KatalogLesen` entfällt, weil Lesen öffentlich ist.
- `IAktuellerBenutzer` (scoped): liest die Claims und ruft einmal pro Request `BenutzerAbgleichService.AbgleichenAsync` auf. Das passiert nur bei Bedarf, also bei `KatalogSchreiben` und `/api/me`.
- `MeController` (`GET /api/me`): nur angemeldet, keine Rolle nötig.
- CORS (AK-12). Pipeline: `UseExceptionHandler` → `UseStatusCodePages` → `UseCors` → `UseAuthentication` → `UseAuthorization` → `MapControllers`. `MapOpenApi().AllowAnonymous()` nur in Development.
- Auf `[AllowAnonymous]`-Endpunkten führt ein ungültiges Token nicht zu `401`, die Anfrage wird anonym bedient (AK-18). Das ist das Standardverhalten von ASP.NET Core und wird per Test festgehalten.
- Die Autorisierung läuft vor der Aktion. Deshalb liest `BildHochladen` den Body bei `401` oder `403` nicht.

### 5.3 Domain und Infrastruktur
- `Coin.Domain/Benutzer/`:
  - `Rolle` (Enum mit `Administrator`, `Sachbearbeiter` und `Betrachter`; vergeben wird jetzt nur `Administrator`),
  - `Benutzer`,
  - `BenutzerIdentitaet` (Regeln für Anzeigename und Kürzung),
  - `BootstrapAdmins` (nur bei verifizierter E-Mail),
  - `Rollen.DuerfenKatalogSchreiben = {Administrator, Sachbearbeiter}`,
  - `IBenutzerRepository.AbgleichenAsync(identitaet, rolleBeiNeuanlage, jetzt, ct)`,
  - `BenutzerAbgleichService`.
- `Coin.Infrastructure/Persistenz/`: `BenutzerDatensatz`, `BenutzerKonfiguration` und `BenutzerRepository`. Das Upsert ist eine einzige SQL-Anweisung:
  ```sql
  INSERT INTO benutzer (id, issuer, subject, email, anzeigename, rolle, erstellt_am, aktualisiert_am)
  VALUES (@id, @iss, @sub, @email, @name, @rolle, @jetzt, @jetzt)
  ON CONFLICT (issuer, subject) DO UPDATE
    SET email = EXCLUDED.email, anzeigename = EXCLUDED.anzeigename, aktualisiert_am = EXCLUDED.aktualisiert_am
    WHERE benutzer.email IS DISTINCT FROM EXCLUDED.email OR benutzer.anzeigename IS DISTINCT FROM EXCLUDED.anzeigename
  RETURNING …;
  ```
  Liefert die Anweisung keine Zeile, folgt ein `SELECT`. `rolle` wird nie aktualisiert.
- Migration `Benutzer`:

| Spalte | Typ | Regel |
|---|---|---|
| `id` | `uuid` PK | `Guid.CreateVersion7()` |
| `issuer` | `varchar(500)` not null | |
| `subject` | `varchar(255)` not null | eindeutiger Index `ux_benutzer_issuer_subject (issuer, subject)` |
| `email` | `varchar(320)` null | |
| `anzeigename` | `varchar(200)` not null | |
| `rolle` | `varchar(20)` null | Check `IN ('Administrator','Sachbearbeiter','Betrachter')`, `NULL` = keine |
| `erstellt_am`, `aktualisiert_am` | `timestamptz` not null | |

### 5.4 API (für `docs/api.md`)
- Öffentlich ohne Anmeldung: `GET /api/coins`, `GET /api/coins/{id}` und `GET /api/coins/{id}/bild`. Die Antworten hängen nicht vom Token ab.
- Mit Bearer-Token: `GET /api/me`. Mit Rolle Administrator oder Sachbearbeiter: `POST /api/coins` und `PUT /api/coins/{id}/bild`.
- Fehler: `401` „Nicht angemeldet“, `403` „Kein Zugriff“.
- Pfade ohne Endpunkt liefern weiterhin `404`, auch ohne Token.
- `GET /api/me`:
  ```json
  { "id": "0199…", "name": "Test Administrator", "email": "admin@test.local", "rolle": "Administrator" }
  ```

### 5.5 Frontend (FSD, ADR-0008)
```
web/.env.development          VITE_OIDC_AUTHORITY=http://localhost:8180/realms/coin, VITE_OIDC_CLIENT_ID=coin-web
src/shared/config/oidc.ts     leseOidcKonfig(env) → Konfig | null (+ Test); routen.ts + anmeldungRueckruf, abgemeldet, keinZugriff
src/shared/lib/anmeldung/     index.ts; user-manager.ts (sessionStorage für User und State, code + PKCE, scope 'openid profile email',
                              automaticSilentRenew, monitorSession/loadUserInfo false); anmeldung-provider.tsx (AuthProvider,
                              skipSigninCallback außerhalb des Rückrufpfads, replaceState); use-anmeldung.ts
                              ({ status: 'pruefe'|'anonym'|'angemeldet'|'nichtKonfiguriert', anmelden(ziel), abmelden() });
                              token-quelle.ts (für shared/api); rueckkehr-ziel.ts (sicheresZiel, + Test)
src/shared/api/http.ts        Bearer-Header falls angemeldet; Ergebnisarten 'nichtAngemeldet' (401), 'keinZugriff' (403);
                              registrierbarer Callback beiNichtAngemeldet
src/shared/ui/                neu per shadcn-CLI: alert (vorhanden: button)
src/entities/benutzer/        index.ts; model/types.ts (Benutzer, Rolle | 'keine', darfKatalogSchreiben()); api/benutzer.ts (GET /api/me)
src/features/anmeldung/       index.ts; ui/AnmeldenButton.tsx, ui/AbmeldenButton.tsx
src/features/coin-anlegen/    unverändert (CoinFormular); 403-Meldung aus AK-27 im Formular
src/pages/coin-liste/         CoinListeSeite erhält Prop erfassen: 'erlaubt' | 'anmelden' | 'keineBerechtigung' (Default 'erlaubt',
                              bestehende Seitentests bleiben gültig); 'anmelden' rendert AnmeldenButton
src/pages/kein-zugriff/       index.ts; ui/KeinZugriffSeite.tsx (Props benutzer)
src/pages/abgemeldet/         index.ts; ui/AbgemeldetSeite.tsx
src/pages/anmeldung-rueckruf/ index.ts; ui/RueckrufSeite.tsx
src/widgets/app-shell/        AppShell Prop benutzerZustand (anonym | angemeldet mit Benutzer | Fehler | prüfe | nicht konfiguriert);
                              Kopfzeile: AnmeldenButton bzw. Name + AbmeldenButton, ThemeUmschalter
src/app/App.tsx               AnmeldungProvider → BenutzerKontext (lädt /api/me einmal, wenn angemeldet) → RouterProvider (context)
src/app/router/router.tsx     Routenbaum; schutz.ts (erfordertAnmeldung, erfordertRolle; + Test)
```
Routenbaum (code-basiert, ADR-0010):
```
wurzel (Kontext: anmeldung, benutzer)
├─ /anmeldung/rueckruf        öffentlich, ohne Shell; nach Erfolg: rolle 'keine' → /kein-zugriff, sonst sicheresZiel
└─ shell (pathless, component: <AppShell benutzerZustand><Outlet/></AppShell>)
   ├─ /                       öffentlich
   ├─ /coins                  öffentlich; Route-Komponente in app setzt erfassen aus benutzer.rolle
   ├─ /abgemeldet             öffentlich
   ├─ /kein-zugriff           beforeLoad: erfordertAnmeldung; Rolle vorhanden → redirect '/'
   └─ (404 wie bisher in der Shell)
```
Die Seiten bleiben frei von Router-Hooks. Die Benutzerdaten kommen als Props aus `app`.

Token-Speicherung in `sessionStorage`. Die Abwägung steht in ADR-0012.

## 6. Tests

### 6.1 xUnit
- **Unit**:
  - `BenutzerIdentitaet`: Fallback für den Namen, Kürzung, E-Mail länger als 320 Zeichen.
  - `BootstrapAdmins`: Trim, Groß-/Kleinschreibung, `email_verified`, leere Liste.
  - `Rollen.DuerfenKatalogSchreiben`.
  - `BenutzerAbgleichService` mit Fake.
  - Validierung von `OidcOptionen` und `Frontend:Ursprung`.
- **Integration**:
  - `Infrastruktur/TestIdentitaetsanbieter.cs`:
    - RSA-2048-Schlüssel pro Lauf, Authority `https://idp.coin-test.invalid/realms/coin-test`.
    - `HttpMessageHandler` für Discovery und JWKS.
    - `ErzeugeToken(...)` mit frei wählbaren Claims, Header, Algorithmus und Schlüssel.
    - Zweiter Anbieter als Fremd-Issuer.
  - `CoinApiFactory`:
    - setzt `Oidc:*`, `Bootstrap:AdminEmails:0=admin@coin-test.invalid` und `Frontend:Ursprung`,
    - ersetzt per `Configure<JwtBearerOptions>` nur den `BackchannelHttpHandler` (siehe Abschnitt 11).
  - `IntegrationTestBasis`:
    - `Client` sendet standardmäßig das Token des Bootstrap-Admins.
    - Hilfen `ClientOhneToken()`, `ClientMitToken(token)`, `ClientMitRolle(rolle)` (Rolle per DbContext gesetzt).
    - `DatenbankLeerenAsync` leert auch `benutzer`.
  - Neue Testklassen:
    - `Anmeldung/TokenPruefungTests` (AK-7 bis AK-10)
    - `Anmeldung/OeffentlichLesenTests` (AK-18: anonym, mit ungültigem Token, Feldmenge, Bild-Header, kein Abgleich)
    - `Anmeldung/SchreibrechteTests` (AK-11, AK-19: Admin, Sachbearbeiter, Betrachter, keine Rolle, anonym; Reihenfolge 401/403 vor 400/404/415; Body ungelesen)
    - `Benutzer/BenutzerAbgleichTests` (AK-13 bis AK-17)
    - `Benutzer/MeTests` (AK-20)
    - `Anmeldung/CorsTests` (AK-12)
    - `Anmeldung/StartKonfigurationTests` (AK-6)
    - `Anmeldung/LogTests` (AK-21)

### 6.2 Vitest (jsdom)
- Hilfe `web/test/anmeldung.tsx`: echter `UserManager` mit `InMemoryWebStorage` und gespeichertem Test-User (angemeldet, abgelaufen, anonym). `signinRedirect` und `signoutRedirect` sind Spies. Die Fake-API beantwortet `GET /api/me`.
- `App.test.tsx`: `zeigeApp(pfad, { als })` ist standardmäßig als Admin angemeldet. Die bestehenden Assertions bleiben unverändert. Neue Fälle:
  - anonym `/` und `/coins` lesbar, Hinweis und „Anmelden“ statt Formular,
  - „Anmelden“ → `signinRedirect` mit Rückkehrziel,
  - Rückruf mit `rolle` „keine“ → `/kein-zugriff`,
  - Rolle Betrachter → Hinweis statt Formular,
  - `/kein-zugriff` anonym → `signinRedirect`,
  - Kopfzeile anonym und angemeldet,
  - Abmelden,
  - `/abgemeldet`,
  - Rückruf-Fehler,
  - `/api/me` 5xx,
  - Englisch-Prüfung.
- Weitere Unit-Tests: `sicheresZiel`, `leseOidcKonfig`, `erstelleUserManager` (Einstellungen AK-24 bis AK-26), `http.ts` (Bearer nur angemeldet, 401/403), `ladeAngemeldetenBenutzer`, `darfKatalogSchreiben`, Anmelde- und Abmelde-Button, `schutz.ts`, `CoinListeSeite` mit `erfassen` = `anmelden` bzw. `keineBerechtigung`, `CoinFormular` bei 403.
- `CoinListe.test.tsx` bleibt unverändert.

### 6.3 UI-Tests (`web/ui-tests`, API und IdP gemockt)
- `webServer.env` erhält zusätzlich `VITE_OIDC_AUTHORITY=http://127.0.0.1:9/realms/coin` und `VITE_OIDC_CLIENT_ID=coin-web`. Die Catch-all-Route meldet auch Aufrufe an `127.0.0.1:9`.
- `app-shell.spec.ts` bleibt unverändert, weil alles anonym lesbar ist und anonym kein `/api/me` aufgerufen wird.
- Hilfe `meldeAnAls(page, me)`: schreibt den User per `addInitScript` in `sessionStorage` und mockt `/api/me`.
- Neue `anmeldung.spec.ts`:
  - „Anmelden“ → Authorize-Parameter (AK-24); Discovery ist gemockt, die Navigation wird abgefangen.
  - Rückruf mit gemocktem Token-Endpunkt → Zielseite bzw. `/kein-zugriff` bei `rolle` „keine“.
  - Kopfzeile anonym und angemeldet.
  - Tastatur: per Tab zu „Anmelden“ bzw. „Abmelden“, `toBeFocused`, sichtbarer Fokus, Enter.
  - Abmelden → `end_session_endpoint`-Parameter (AK-31).
  - Erneuerung per `refresh_token` (AK-26).
  - Storage nach dem Abmelden (AK-25).
  - `/api/me` genau einmal bei mehreren Navigationen.

### 6.4 Systemtests (`e2e/`, ADR-0015)
- `scripts/start-api.mjs` startet vor der API zusätzlich Keycloak per Testcontainers:
  - gleicher Image-Tag wie in `compose.yaml`,
  - Realm-Datei per Kopie, `start-dev --import-realm`,
  - fester Host-Port `5184`, `KC_HOSTNAME=http://localhost:5184`,
  - Wait auf die Discovery.
- API-Umgebung: `Oidc__Authority=http://localhost:5184/realms/coin`, `Oidc__Audience=coin-api`, `Oidc__ClientId=coin-web`, `Bootstrap__AdminEmails__0=admin@test.local`. Geerbte `Oidc__*`-, `Bootstrap__*`-, `Frontend__*`- und `Authentication__*`-Variablen werden entfernt.
- Web-webServer: `VITE_OIDC_AUTHORITY` und `VITE_OIDC_CLIENT_ID`.
- `global-setup.ts` und die Leer-Prüfung bleiben unverändert, weil `GET /api/coins` öffentlich ist.
- `tests/hilfen/anmeldung.ts`: `meldeAn(page, email)` klickt „Anmelden“, füllt `#username` und `#password` und klickt `#kc-login`. Die Zugangsdaten kommen aus `infra/keycloak/coin-realm.json`.
- `coin-katalog.spec.ts`: In `beforeEach` kommt nur die Admin-Anmeldung vor `goto('/coins')` hinzu, sonst bleibt alles gleich.
- Neue `anmeldung.spec.ts`: AK-37 (a) bis (c). Für (a) legt der Test den Coin als Admin an und prüft danach in einem neuen, anonymen Browser-Kontext.
- `scripts/*.test.mjs`: OIDC-Variablen werden überschrieben, Image-Tag stimmt mit `compose.yaml` überein.

## 7. Sicherheit und Datenschutz
- Die öffentlichen Katalog-Antworten enthalten keine Personendaten. Die Feldmenge ist durch AK-18 festgelegt. Künftige Felder mit Personenbezug (Ersteller, Verleihungen, Empfänger) gehören nicht in öffentliche DTOs, sondern in eigene, geschützte Endpunkte.
- E-Mail und Name stehen nur in `benutzer`, in `/api/me` und im Browser (ID-Token in `sessionStorage`) und werden nie geloggt (AK-21).
- Keine Tokens in Logs: `SaveToken=false`, kein HTTP-Logging von Headern, `ShowPII` aus, `IncludeErrorDetails=false`.
- Issuer- und Audience-Prüfung sind fest im Code und nicht abschaltbar, auch nicht in `Testing` (AK-9).
- Öffentlicher Client ohne Secret, PKCE S256, exakte URIs, kein Implicit- und kein Password-Grant. Ein Open Redirect über das Rückkehrziel ist ausgeschlossen.
- Die API authentifiziert nur per Bearer-Header, nicht per Cookie, daher ist CSRF nicht relevant. CORS ist auf einen Origin ohne Credentials beschränkt.
- Fail-closed:
  - Unbekannte Benutzer haben keine Rolle.
  - Token-Rollen werden ignoriert.
  - Der Bootstrap greift nur bei verifizierter E-Mail und nur beim Anlegen.
  - Schreiben ist auf zwei Rollen beschränkt.
- `Cache-Control: private` für Bilder bleibt (ADR-0014): Shared Caches speichern nichts, und eine spätere Einschränkung der Öffentlichkeit wirkt sofort.
- Lokale Testpasswörter liegen bewusst im Repo und sind gekennzeichnet. Das Passwort der Keycloak-Konsole kommt aus `.env`. Der e2e-Keycloak ist während des Laufs auf allen Interfaces erreichbar (wie die e2e-DB, ADR-0007), enthält aber nur synthetische Benutzer.
- Supply Chain: nur `oidc-client-ts` und `react-oidc-context` kommen hinzu (ADR-0012).

## 8. Annahmen
- Der Keycloak-Tag ist zum Umsetzungszeitpunkt die neueste stabile Version, mindestens 26.x (Scope `basic`, `KC_BOOTSTRAP_ADMIN_*`).
- Der Produktiv-Keycloak liefert RS256-Tokens mit `aud`, `azp`, `email`, `email_verified` und `name`. Der Betreiber richtet den Client `coin-web` und den Audience-Mapper ein. Damit der Bootstrap greift, aktiviert er am AD-Provider „Trust Email“ (Betriebsdoku).
- Das Keycloak-Formular hat die IDs `username`, `password` und `kc-login`.
- `testcontainers` (Node) kann einen festen Host-Port binden.

## 9. Doku-Bedarf (erledigt)
- `README.md`: lokale Umgebung (DB und Keycloak, beide `.env`-Werte Pflicht), Konfiguration `Oidc:*`, `Frontend:Ursprung`, `Bootstrap:AdminEmails`, Frontend-Konfiguration, Routen, Anmeldung lokal ausprobieren, Ports, Integrations- und Systemtests.
- `docs/api.md`: Abschnitt Authentifizierung (Bearer, öffentliche Endpunkte, 401/403, Reihenfolge, CORS), `GET /api/me`, Zugang pro Endpunkt.
- `docs/benutzer/anmeldung.md` (neu), Hinweise in `docs/benutzer/coin-katalog.md`.
- `docs/requirements.md`, `infra/keycloak/README.md`, ADR-0004 (abgelöst), ADR-0012 bis ADR-0015.
- Vorschlag für `CLAUDE.md`: an den Auftraggeber übergeben, nur mit Freigabe.

## 10. Offene Fragen
Keine.

Nach der Umsetzung entschieden:
- **Mehrere Tabs und Refresh-Token-Rotation (QA-Hinweis H6), entschieden vom Auftraggeber: Rotation bleibt aktiv (sicherer), die Einschränkung ist dokumentiert.** Der Realm hat `revokeRefreshToken=true` und `refreshTokenMaxReuse=0` (AK-2). User und Refresh-Token liegen pro Tab in `sessionStorage`. Meldet sich der Benutzer in einem zweiten Tab an (per SSO ohne Passwort), gehören beide Tabs zur selben Keycloak-Sitzung. Mit Rotation kann das Refresh-Token des einen Tabs ungültig werden, sobald der andere Tab erneuert hat. Der betroffene Tab entfernt dann den User und zeigt „anonym“ (AK-26), der Benutzer meldet sich erneut an. Verworfen wurde, `refreshTokenMaxReuse` bzw. `revokeRefreshToken` zu lockern. Die Einschränkung steht als „Bekannte Einschränkung: mehrere Tabs“ in `docs/benutzer/anmeldung.md`.

Alle Punkte aus Rev. 1 hat der Auftraggeber am 2026-10-05 entschieden (Abschnitt 1).

## 11. Abweichungen vom Entwurf (Umsetzung)
- **`[Inhaltstyp]` statt `[Consumes]`** (`Coin.Api/Http/InhaltstypAttribute.cs`): `[Consumes]` wirkt schon beim Endpunkt-Routing und hätte angemeldeten Benutzern ohne Schreibrolle `415` statt `403` geliefert. Der Resource-Filter prüft den Content-Type erst nach der Autorisierung und antwortet sonst mit `415` als ProblemDetails. So gilt „401/403 vor 400/404/415“ (AK-19). Für OpenAPI meldet das Attribut den Content-Type weiter.
- **`AutorisierungsErgebnisBehandlung`** (`IAuthorizationMiddlewareResultHandler`): Die `FallbackPolicy` hätte für Pfade ohne Endpunkt `401` geliefert. Ohne Endpunkt reicht die Behandlung die Anfrage weiter, sie endet mit `404` (Abschnitt 5.4). Geschützte Inhalte sind darüber nicht erreichbar, weil danach nur das Endpunkt-Routing folgt.
- **`ConfigurationManager` neu gebaut**: Das `PostConfigure` setzt nicht nur die Prüfparameter, sondern baut auch den `ConfigurationManager` aus der festen `MetadataAddress` (`{Authority}/.well-known/openid-configuration`) neu und setzt `Configuration=null`. Grund: Das Framework hätte den Manager bereits aus konfigurierbaren Werten erzeugen können; Schlüssel kommen so ausschließlich aus der JWKS der eigenen Authority. Weitere fest gesetzte Felder: `RefreshOnIssuerKeyNotFound=true`, `UseSecurityTokenValidators=false`, alle `Forward*` und `EventsType` geleert, `RequireAudience=true`.
- **Testhost ersetzt nur den `BackchannelHttpHandler`**, und zwar per `Configure` (läuft vor allen `PostConfigure`). Manager, Adresse und Prüfparameter baut ausschließlich der Produktionscode und übernimmt dabei den Handler.
- **Loopback-Ausnahme** nur für genau `localhost`, `127.0.0.1` und `::1`, nicht `Uri.IsLoopback` (das ganz `127.0.0.0/8` zulassen würde). Zusätzlich lehnt der Start eine Authority mit Benutzerangaben, Query oder Fragment ab.
- **`email_verified`** zählt nur als JSON-Boolean `true`; die Zeichenkette „true“ reicht nicht.
- **`CoinListeSeite`** hat einen vierten Wert `erfassen='unbekannt'`: Solange die Anmeldung geprüft wird oder `/api/me` gescheitert ist, zeigt der Abschnitt „Neuen Coin erfassen“ weder Formular noch Hinweis. Ohne Konfiguration gilt `'anmelden'` (Hinweis „Anmeldung ist nicht konfiguriert.“ statt Button).
- **Realm definiert die Client-Scopes selbst** (`basic`, `profile`, `email`, `coin-api-audience` in `clientScopes` und `defaultDefaultClientScopes`), statt sich auf die Standard-Scopes von Keycloak zu verlassen. `roles` fehlt bewusst.
- **Abmelden** übergibt `client_id` per `extraQueryParams` an `signoutRedirect` (zusätzlich zu `id_token_hint` und `post_logout_redirect_uri`). Scheitert die Weiterleitung, wird nur der lokale User entfernt.
- **Bearer nur an die eigene API**: `shared/api/http.ts` setzt den Header nur für Ziele derselben Origin unter `/api/`. Ein 401 löst die erneute Anmeldung nur bei schreibenden Methoden aus; lehnt die API das Token bei `/api/me` ab, wird die Sitzung verworfen und die App zeigt „anonym“.
- **`sicheresZiel`** prüft das Rückkehrziel nach der URL-Normalisierung ein zweites Mal (z. B. wird `/.//host` sonst zu `//host`) und lehnt Backslashes und Steuerzeichen ab.
- **Systemtests**: DB- und Keycloak-Container starten parallel. Geerbte `Oidc`/`Bootstrap`/`Frontend`/`Authentication`-Variablen werden auch mit Präfix `ASPNETCORE_`/`DOTNET_` entfernt (QA-Hinweis H7).
- **Keycloak-Version** `26.8.0` in `compose.yaml` und `e2e/scripts/e2e-umgebung.mjs`; ein Node-Test prüft die Gleichheit.
