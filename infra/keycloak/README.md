# Test-Keycloak: `coin-realm.json`

> **Achtung: NUR TESTDATEN.** `coin-realm.json` enthält Testbenutzer mit einem bekannten Testpasswort.
> Die Datei ist nur für die lokale Entwicklung und die Systemtests da. **Nie produktiv verwenden.**
> In Produktion wird kein Realm aus diesem Repository importiert. Dort konfiguriert man nur die Adresse
> des echten Keycloak (`Oidc:Authority`, `Oidc:Audience`, `Oidc:ClientId`, siehe ADR-0012).

## Zweck

Die Datei enthält ausschließlich Testdaten und beschreibt den Realm des lokalen Test-Keycloak:

- Realm `coin` (Anzeigename „C.O.I.N. – NUR LOKALE TESTUMGEBUNG“), nur Deutsch, ohne Selbstregistrierung
- öffentlicher Client `coin-web` (Authorization Code Flow mit PKCE `S256`, kein Client-Secret).
  Rücksprungadressen sind nur `http://localhost:5173` (Entwicklung) und `http://localhost:5183` (Systemtests).
- Audience `coin-api` im Access-Token (Client-Scope `coin-api-audience`)

Zwei Stellen importieren die Datei:

| Verwendung | Start | Adresse |
|---|---|---|
| Lokale Entwicklung | `docker compose up -d` (`compose.yaml`, Service `keycloak`) | http://localhost:8180 |
| Systemtests | automatisch per Testcontainers (`e2e/scripts/e2e-umgebung.mjs`, ADR-0015) | http://localhost:5184 |

## Testbenutzer

| Benutzer | Passwort |
|---|---|
| `admin@test.local` | `nur-lokal-testpasswort` |
| `sachbearbeiter@test.local` | `nur-lokal-testpasswort` |
| `betrachter@test.local` | `nur-lokal-testpasswort` |
| `neu@test.local` | `nur-lokal-testpasswort` |

Keycloak vergibt **keine Rollen**. Die Namen deuten nur an, wofür der Benutzer in Tests gedacht ist.
Die Rollen verwaltet die Anwendung selbst in ihrer eigenen Datenbank (ADR-0013).
`admin@test.local` wird beim ersten Aufruf per `Bootstrap:AdminEmails` Administrator. Alle anderen Testbenutzer haben zunächst keine Rolle; ein Administrator vergibt sie in der App unter **Benutzerverwaltung**. Der Systemtest `e2e/tests/benutzerverwaltung.spec.ts` gibt `betrachter@test.local` die Rolle Betrachter; `neu@test.local` bleibt ohne Rolle.

## Datei ändern

`--import-realm` überspringt einen bereits vorhandenen Realm. Nach Änderungen den Container neu erzeugen:

```
docker compose up -d --force-recreate keycloak
```

## Admin-Konsole

- Adresse: http://localhost:8180/admin
- Benutzer: `admin`
- Passwort: `COIN_KEYCLOAK_ADMIN_PASSWORD` aus `.env` (Vorlage: `.env.example`)

Dieses Konto hat nichts mit dem Testbenutzer `admin@test.local` zu tun.
