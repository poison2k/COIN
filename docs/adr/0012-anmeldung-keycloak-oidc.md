# ADR-0012: Anmeldung über Keycloak (OIDC), JWT-Bearer in der API, PKCE im Frontend

Status: Angenommen (Einzelentscheidungen vom Auftraggeber am 2026-10-05 bestätigt, umgesetzt) · Datum: 2026-10-05 · Feature: anmeldung-keycloak · Löst ab: [ADR-0004](0004-pilot-ohne-authentifizierung.md)

## Kontext
Laut Vorgabe melden sich Benutzer mit E-Mail und Passwort an einem Keycloak an. In Produktion ist er ein Sprungpunkt zum AD, für C.O.I.N. nur lesend nutzbar und nur über seine Adresse konfiguriert. Lokal läuft ein Test-Keycloak. Es gibt keine Registrierung und kein Passwort-Handling in der App. Die Prüfung von Issuer und Audience darf nicht abschaltbar sein. ADR-0004 verlangt vor jedem Betrieb ein Auth-Feature.

## Entscheidung
1. **Protokoll**: OpenID Connect, Authorization Code Flow mit PKCE (S256), öffentlicher Client `coin-web` ohne Secret. Kein Implicit Flow, kein Password-Grant.
2. **API**: ASP.NET Core JWT-Bearer gegen `Oidc:Authority` (Discovery, JWKS).
   - Die Konfiguration steht in der eigenen Sektion `Oidc` (`Authority`, `Audience`, `ClientId`). Den Abschnitt `Authentication:Schemes:Bearer` bindet das Framework automatisch, er darf die Prüfung nicht beeinflussen.
   - Ein `PostConfigure` setzt fest:
     - alle `Validate*` = `true`,
     - `ValidIssuers` = [Authority], `ValidAudiences` = [Audience],
     - `ValidAlgorithms` = [RS256], `ValidTypes` = [`JWT`, `at+jwt`], `ClockSkew` = 30 s,
     - `sub` Pflicht, `azp` = ClientId (vom Auftraggeber bestätigt),
     - `MapInboundClaims=false`, `IncludeErrorDetails=false`, `SaveToken=false`,
     - `ConfigurationManager` neu aus der festen `MetadataAddress` `{Authority}/.well-known/openid-configuration`, `Configuration=null`.
   - HTTPS für Authority und Metadaten ist Pflicht. Die einzige Ausnahme sind die Hosts `localhost`, `127.0.0.1` und `::1` (nicht ganz `127.0.0.0/8`). Das wird aus der URI abgeleitet und nicht konfiguriert. Fehlende oder unsichere Werte brechen den Start ab.
3. **Standardmäßig geschützt**:
   - Die `FallbackPolicy` verlangt einen angemeldeten Benutzer.
   - Öffentlich ist nur, was ausdrücklich `[AllowAnonymous]` trägt: die drei Lese-Endpunkte des Coin-Katalogs (ADR-0014) und `/openapi/v1.json`, Letzteres nur in Development.
   - Ein Test über alle Endpunkte stellt sicher, dass es genau diese sind.
   - Pfade ohne Endpunkt liefern `404` statt `401` (`AutorisierungsErgebnisBehandlung`); dahinter folgt nur das Endpunkt-Routing.
   - `401` und `403` kommen vor `400`, `404` und `415`. Deshalb prüft ein Resource-Filter `[Inhaltstyp]` den Content-Type nach der Autorisierung; `[Consumes]` wirkt schon beim Routing und hätte `415` vor `403` geliefert.
4. **Keycloak lokal**:
   - `quay.io/keycloak/keycloak:26.8.0` (exakter Tag), `start-dev --import-realm`, `127.0.0.1:8180`.
   - Realm `coin` aus `infra/keycloak/coin-realm.json`.
   - Audience-Mapper `aud=coin-api`, ohne Scope `roles`.
   - Das Passwort der Admin-Konsole kommt aus `.env`. Testbenutzer und Testpasswörter sind als Testdaten gekennzeichnet.
5. **Frontend**: `oidc-client-ts` mit `react-oidc-context`.
   - User und State liegen in `sessionStorage`.
   - Erneuerung über den Refresh-Token (`automaticSilentRenew`, kein iframe, `monitorSession=false`).
   - Abmelden über den `end_session_endpoint` mit `id_token_hint` und `client_id` (per `extraQueryParams`).
   - Das Bearer-Token geht nur an Pfade unter `/api/` derselben Origin.
   - Konfiguration über `VITE_OIDC_AUTHORITY` und `VITE_OIDC_CLIENT_ID`.
   - Die Anmeldung startet auf Wunsch (Button „Anmelden“) oder über eine Route, die Anmeldung verlangt. Der Katalog bleibt anonym lesbar.
6. **CORS**: nur für `Frontend:Ursprung`, ohne Credentials.
7. **Nicht verwendet**:
   - `@stack-lib/*`: nicht in `web/package.json`, `@stack-lib/jwt-utils` liefert npm 404 (private Registry).
   - `srts-netlayer`: steht nicht in `web/package.json`. Ein gleichnamiges öffentliches npm-Paket (0.1.8) existiert, ist aber ungeprüft. Es zu installieren wäre ein Supply-Chain-Risiko, denn ein Name, der einem internen Paket gleicht, ist ein typisches Dependency-Confusion-Muster. Gemäß Vorgabe wird es nicht genutzt.

## Betrachtete Optionen
| Thema | Option | Bewertung |
|---|---|---|
| Token-Speicherung | `sessionStorage` (gewählt) | übersteht Neuladen im Tab, endet mit dem Tab, nicht tabübergreifend; per XSS lesbar |
| | In-Memory | Redirect bei jedem Neuladen, Refresh-Token geht verloren; gegen XSS kaum besser, weil Schadcode ohnehin im Seitenkontext API-Aufrufe absetzen kann |
| | `localStorage` | dauerhaft und tabübergreifend, größte Angriffsfläche, verworfen |
| | BFF mit HttpOnly-Cookie | robust gegen Token-Diebstahl, braucht aber Server-Sessions, Confidential Client mit Secret und CSRF-Schutz; für die Vorgabe (öffentlicher Client, kein Secret) zu groß |
| Erneuerung | Refresh-Token (gewählt) | ohne Third-Party-Cookies und ohne iframe, mit Rotation |
| | Silent Renew per iframe | scheitert an blockierten Third-Party-Cookies |
| Konfig-Sektion | `Oidc` (gewählt) | keine Kollision mit `Authentication:Schemes` |
| | `Authentication:Schemes:Bearer` | über Konfiguration aufweichbar (`ValidIssuers`, `RequireHttpsMetadata`) |

## Folgen
- Weil das `PostConfigure` den `ConfigurationManager` selbst aus der festen Metadaten-Adresse baut, können weder Konfiguration noch ein vorher registrierter Manager eine andere Schlüsselquelle unterschieben. Schlüssel kommen nur aus der JWKS der eigenen Authority. Wer den Manager austauschen will (z. B. Caching-Strategie), muss diesen Code ändern.
- Integrationstests nutzen selbst signierte Tokens und einen Test-Identitätsanbieter im Testhost, ohne Keycloak. Ersetzt wird nur der `BackchannelHttpHandler` (per `Configure`, also vor dem `PostConfigure`), den der Produktionscode in seinen Manager übernimmt.
- Der Realm rotiert Refresh-Tokens (`revokeRefreshToken=true`, `refreshTokenMaxReuse=0`). Zusammen mit `sessionStorage` pro Tab kann ein Tab bei gleichzeitiger Nutzung mehrerer Tabs nach einer Erneuerung als „nicht angemeldet“ erscheinen. Entschieden vom Auftraggeber (QA-Hinweis H6): Die Rotation bleibt aktiv, weil sie sicherer ist. Die Einschränkung ist in `docs/benutzer/anmeldung.md` für Anwender beschrieben.
- Systemtests brauchen einen echten Test-Keycloak (ADR-0015).
- CSRF ist bei reiner Bearer-Authentifizierung ohne Cookies nicht relevant. Damit ist der offene Punkt aus ADR-0004 erledigt.
- In Produktion richtet der Betreiber am Keycloak den Client `coin-web` (exakte URIs, PKCE), den Audience-Mapper und „Trust Email“ am AD-Provider ein. Das Frontend braucht bis zu einem Deployment-Feature einen Build je Umgebung.
- Sicherheitsrelevante Prüfparameter lassen sich nur per Code-Änderung mit Review ändern.
