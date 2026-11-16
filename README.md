# C.O.I.N. – Coin Organisation, Inventarisierung und Nachverfolgung

Webanwendung zur Verwaltung von Gedenk-Coins. Umgesetzt sind bisher:

- **Coin-Katalog**: Coins mit Name, Herausgeber, optionaler Auflage, Beschreibung und Motivbild
  auf einer eigenen Seite anlegen und auf der Seite „Coin bearbeiten“ ändern (Stammdaten, Motivbild;
  ADR-0025); Katalog mit Suche (Name, Herausgeber) und Blättern sowie eine Detailseite je Coin. Lesen
  ist ohne Anmeldung möglich (ADR-0014).
- **Anmeldung über Keycloak (OIDC)**: Anmeldung mit E-Mail und Passwort am Keycloak. Benutzer und
  Rollen führt C.O.I.N. in der eigenen Datenbank (ADR-0012, ADR-0013). Den ersten Administrator
  legt `Bootstrap:AdminEmails` fest.
- **Rollen- und Benutzerverwaltung**: Administratoren vergeben in der App die Rollen Administrator,
  Sachbearbeiter und Betrachter und deaktivieren oder reaktivieren Benutzer. Endpunkte prüfen
  Berechtigungen (`coins.read`, `coins.write`, `issues.read`, `issues.write`, `users.manage`,
  `audit.read`, `startpage.manage`) aus einer festen Rechtematrix im Code
  ([docs/berechtigungen.md](docs/berechtigungen.md), ADR-0016, ADR-0021). Jede Rollen- und
  Statusänderung steht unveränderlich im Audit-Log (ADR-0017). Der letzte aktive Administrator ist
  geschützt (ADR-0018).
- **Exemplare und Ausgaben**: Jeder Coin mit Auflage hat die Exemplare 1 bis Auflage. Auf der
  Detailseite sehen angemeldete Benutzer mit Rolle Kennzahlen und Status der Exemplare;
  Sachbearbeiter und Administratoren erfassen Ausgaben (wer, wann, Gelegenheit, Begründung,
  ausgebende Stelle), stornieren sie mit Grund und ändern die Auflage. Ausgaben und ihr Audit sind
  unveränderlich (ADR-0020, ADR-0021).
- **Zertifikatsvorlagen**: Je Coin eine Word-Vorlage (.docx) für das Echtheitszertifikat.
  Sachbearbeiter und Administratoren laden die vom Server erzeugte Standardvorlage herunter, gestalten
  sie in Word und laden sie wieder hoch. Der Server prüft die Datei als nicht vertrauenswürdig
  (Platzhalter, höchstens 200 Vorkommen, Makros, externe Inhalte, Namespace-Positivliste), entfernt
  persönliche Dokumenteigenschaften und speichert sie als neue, sofort aktive Version; frühere
  Versionen bleiben abrufbar, Zurücksetzen auf die Standardvorlage ist möglich (ADR-0022 bis ADR-0024,
  ADR-0026, [docs/platzhalter.md](docs/platzhalter.md), [docs/word-namespaces.md](docs/word-namespaces.md)).
- **Zertifikat erzeugen**: Jeder Coin hat eine unveränderliche Kennung (`C0042`), jede Ausgabe eine
  unveränderliche Zertifikatsnummer `<Kennung>-<Exemplar>` (`C0042-0012`; eine Neuausgabe desselben
  Exemplars nach Storno erhält dieselbe Nummer). Mit `issues.write` laden Sachbearbeiter und
  Administratoren zu jeder aktiven Ausgabe das Zertifikat als `Zertifikat_<Nummer>.docx` herunter,
  aus der Ausgabehistorie oder von der neuen Seite einer einzelnen Ausgabe (`issues.read`). Der Server
  ersetzt die Platzhalter der aktiven Vorlage nur im Speicher; jeder Download steht unveränderlich im
  Audit `zertifikat_audit` (ADR-0027 bis ADR-0029).
- **Startseite**: `/` zeigt bis zu fünf Blöcke (Kopfbereich mit Titel, Untertitel und zwei Logos,
  Infotext in eingeschränktem Markdown, Kennzahlen, neueste und meistausgegebene Coins).
  Administratoren pflegen Blöcke, Reihenfolge, Texte, Anzahlen und Logos auf
  `/verwaltung/startseite` mit Vorschau (`startpage.manage`). Den Kopfbereich sehen alle Besucher
  ohne Anmeldung, die übrigen Blöcke nur mit `coins.read`. Logos werden am Inhalt geprüft (PNG,
  JPEG, WebP bis 2 MB und 2048 × 2048 Pixel, kein SVG); jede Änderung steht unveränderlich im Audit
  `startseite_audit` (ADR-0030 bis ADR-0032).
- **Hologrammnummer und Prüfung**: Jede Ausgabe kann die Nummer des Hologramm-Stickers ihres
  gedruckten Zertifikats tragen (beim Erfassen oder nachträglich, Korrektur mit Grund, `issues.write`),
  eindeutig über alle Coins nach Normalform („ab 12-34“ = „AB1234“). Auf `/pruefung` prüfen alle
  Benutzer mit Rolle (`coins.read`), ob eine Nummer zu einem gültigen Zertifikat gehört;
  Empfängerdaten sehen nur Benutzer mit `issues.read`. Höchstens 20 Prüfungen je Minute und Benutzer;
  Setzen, Korrigieren und Prüfen stehen unveränderlich in `hologramm_audit` bzw. `pruefung_audit`
  (ADR-0033, ADR-0034).
- **Einheitliches Erscheinungsbild**: Gestaltung nur über Theme-Tokens (Marineblau, Statusfarben,
  Schriftskala, Raster; hell und dunkel mit geprüften Kontrasten), Bausteine in `web/src/shared/ui`,
  App-Layout mit gruppierter Seitenleiste, Kopfzeile mit Name und Rolle, Skip-Link „Zum Inhalt
  springen“ und Mobilmenü unter 768 px; automatische Prüfung mit axe (ADR-0035 bis ADR-0038,
  [docs/features/design-fundament.md](docs/features/design-fundament.md)).
- **Formulare und Detailseiten**: Formulare mit Abschnitten, Pflichtkennzeichnung, Hilfetexten,
  Prüfung beim Verlassen eines Felds, Fehlerzusammenfassung, Aktionsleiste mit Ladezustand und
  Warnung bei ungespeicherten Änderungen; Coin-Detailseite mit Status-Chips, Aktionen im Kopf,
  Kennzahlenkarten und Reitern (`?reiter=`), Ausgabe-Seite mit Verlauf und „Stornieren“;
  Bestätigungsdialoge; Tabellen mit Filter-Chips und Kartenansicht auf kleinen Bildschirmen
  (ADR-0039 bis ADR-0042, [docs/features/formulare-detailseiten.md](docs/features/formulare-detailseiten.md)).
- **Startseite, Listen und Prüfmaske**: Startseite im Zeilenraster ohne Lücken (Kopffläche,
  Kennzahlkarten, Kacheln, Rangliste); Katalog mit Filterleiste, Suche als Chip und umschaltbarer
  Tabellen- oder Kartenansicht (Wahl im `localStorage`); Prüfmaske als zentrierte Arbeitsseite mit
  Ergebniskarte, Fokus nach jeder Prüfung im Nummernfeld; Audit-Log mit Benutzerfilter und Zeitpunkten
  in Europe/Berlin; einheitliche Lade-, Leer- und Fehlerzustände (ADR-0043, ADR-0044,
  [docs/features/startseite-listen-pruefung.md](docs/features/startseite-listen-pruefung.md)).

Noch offen sind Signatur, PDF, QR-Code und öffentliche Prüfseite der Zertifikate.

- API: [docs/api.md](docs/api.md), Berechtigungen: [docs/berechtigungen.md](docs/berechtigungen.md)
- Anleitung für Anwender: [docs/benutzer/bedienung.md](docs/benutzer/bedienung.md),
  [docs/benutzer/anmeldung.md](docs/benutzer/anmeldung.md),
  [docs/benutzer/coin-katalog.md](docs/benutzer/coin-katalog.md),
  [docs/benutzer/ausgaben.md](docs/benutzer/ausgaben.md),
  [docs/benutzer/zertifikat-pruefen.md](docs/benutzer/zertifikat-pruefen.md),
  [docs/benutzer/zertifikatsvorlagen.md](docs/benutzer/zertifikatsvorlagen.md),
  [docs/benutzer/benutzerverwaltung.md](docs/benutzer/benutzerverwaltung.md),
  [docs/benutzer/startseite.md](docs/benutzer/startseite.md)
- Architekturentscheidungen: [docs/adr/](docs/adr/)
- Anforderungen: [docs/requirements.md](docs/requirements.md)
- Test-Keycloak: [infra/keycloak/README.md](infra/keycloak/README.md)

## Voraussetzungen

- .NET 10 SDK
- Node.js mit npm (für die Systemtests ≥ 22.18)
- Docker (lokale PostgreSQL-Datenbank und Test-Keycloak, Integrations- und Systemtests mit Testcontainers)

## Projektstruktur

| Ordner | Inhalt |
|---|---|
| `src/Coin.Domain` | Fachlogik, Entitäten, Validierung (u. a. `Katalog/`, `Ausgaben/`, `Benutzer/`, `Vorlagen/` mit Platzhalterkatalog und Namespace-Positivliste, `Zertifikate/` mit Zertifikatsnummer, Werten und Platzhalterersetzung, `Startseite/` mit Konfiguration, Logoprüfung und Audit-Änderungen, `Pruefung/` mit der Hologrammprüfung; Normalisierung der Hologrammnummer in `Ausgaben/`) |
| `src/Coin.Infrastructure` | EF Core, PostgreSQL, Migrationen (`Persistenz/Migrationen`), Prüfung, Bereinigung und Standardvorlage für Word-Dateien (`Vorlagen/`, NuGet `DocumentFormat.OpenXml`), Zertifikatserzeugung im Speicher (`Zertifikate/`) |
| `src/Coin.Api` | ASP.NET Core Web API (Controller, DTOs, `Authentifizierung/`, `Http/` u. a. mit `MultipartDateiLeser`, `MultipartFormularLeser` und `Ratenbegrenzung`) |
| `tests/Coin.UnitTests`, `tests/Coin.IntegrationTests` | xUnit-Tests |
| `web/` | React-Frontend (Vite, TypeScript, Feature-Sliced Design), UI-Tests in `web/ui-tests` |
| `e2e/` | Systemtests (Playwright, echte API, Wegwerf-Datenbank und Wegwerf-Keycloak) |
| `infra/keycloak/` | Realm-Datei des Test-Keycloak (nur Testdaten) |
| `docs/` | Dokumentation |

## Lokale Umgebung (Datenbank und Test-Keycloak)

`compose.yaml` startet zwei Dienste:

| Dienst | Adresse | Zweck |
|---|---|---|
| `db` | `127.0.0.1:5432` | PostgreSQL 17, Datenbank und Benutzer `coin` |
| `keycloak` | `http://localhost:8180` | Test-Keycloak `quay.io/keycloak/keycloak:26.8.0`, Realm `coin` aus `infra/keycloak/coin-realm.json` |

Beide Passwörter stehen in der Datei `.env`, die nicht eingecheckt wird. **Beide** Werte sind
Pflicht. Fehlt einer, bricht jedes `docker compose up` mit einer Meldung ab, auch wenn nur ein
Dienst gestartet werden soll.

```powershell
Copy-Item .env.example .env      # danach in .env beide Passwörter eintragen:
                                 #   COIN_DB_PASSWORD=<eigenes Passwort>
                                 #   COIN_KEYCLOAK_ADMIN_PASSWORD=<eigenes Passwort>
docker compose up -d
```

Test-Keycloak:

- Realm `coin`, öffentlicher Client `coin-web` (PKCE, ohne Secret), Audience `coin-api`.
- Testbenutzer (`admin@test.local`, `sachbearbeiter@test.local`, `betrachter@test.local`,
  `neu@test.local`) und ihr Testpasswort stehen in [infra/keycloak/README.md](infra/keycloak/README.md).
  Keycloak vergibt keine Rollen; außer `admin@test.local` (Bootstrap) erhalten sie ihre Rolle in der
  App über die Benutzerverwaltung.
- Admin-Konsole: `http://localhost:8180/admin`, Benutzer `admin`, Passwort
  `COIN_KEYCLOAK_ADMIN_PASSWORD` aus `.env`. Dieses Konto hat nichts mit `admin@test.local` zu tun.
- `--import-realm` überspringt einen vorhandenen Realm. Nach Änderungen an der Realm-Datei:
  `docker compose up -d --force-recreate keycloak`.
- Der Start dauert etwa 10–30 s. Bereit ist der Keycloak, wenn
  `http://localhost:8180/realms/coin/.well-known/openid-configuration` antwortet.

Connection-String als User-Secret der API setzen (Passwort wie in `.env`):

```powershell
dotnet user-secrets set "ConnectionStrings:CoinDb" "Host=localhost;Port=5432;Database=coin;Username=coin;Password=<aus .env>" --project src/Coin.Api
```

Alternativ die Umgebungsvariable `ConnectionStrings__CoinDb` setzen. Fehlt der Connection-String,
bricht die API beim Start mit einer Meldung ab. Connection-Strings gehören nie in `appsettings*.json`.

## API starten

```powershell
dotnet tool restore              # stellt dotnet-ef aus .config/dotnet-tools.json bereit
dotnet run --project src/Coin.Api
```

Die API lauscht auf `http://localhost:5172` (Profil `http`, Standard) bzw. zusätzlich
`https://localhost:7176` (Profil `https`, `--launch-profile https`). Beide Profile laufen in der
Umgebung `Development`.

Migrationen werden nur in den Umgebungen `Development` und `Testing` beim Start automatisch
angewendet. In Development ist das OpenAPI-Dokument unter `/openapi/v1.json` abrufbar.

### Konfiguration der Anmeldung

| Schlüssel | Development (`appsettings.Development.json`) | Bedeutung |
|---|---|---|
| `Oidc:Authority` | `http://localhost:8180/realms/coin` | Issuer des Keycloak; Tokens müssen genau diesen `iss` haben |
| `Oidc:Audience` | `coin-api` | erwartete `aud` im Access-Token |
| `Oidc:ClientId` | `coin-web` | erwarteter `azp` (Client des Frontends) |
| `Frontend:Ursprung` | `http://localhost:5173` | einziger für CORS zugelassener Origin; ohne Wert keine CORS-Header |
| `Bootstrap:AdminEmails` | `["admin@test.local"]` | E-Mails, die beim ersten Aufruf die Rolle Administrator erhalten |

- `appsettings.json` enthält für `Oidc:*` keine Werte und eine leere `Bootstrap:AdminEmails`.
- Fehlt ein `Oidc:*`-Wert, ist die Authority keine absolute Adresse oder ist sie `http` mit einem
  anderen Host als `localhost`, `127.0.0.1` oder `::1`, bricht die API beim Start mit einer
  deutschen Meldung ab, die den Schlüssel nennt. Ebenso bei einem ungültigen `Frontend:Ursprung`
  (`*`, mit Pfad oder abschließendem `/`).
- Die Prüfparameter der Tokens (Issuer, Audience, RS256, Lebensdauer, `sub`, `azp`) stehen fest im
  Code. Einstellungen unter `Authentication:Schemes:Bearer` wirken nicht.
- Bootstrap: Nur beim **ersten** Aufruf eines Benutzers, nur bei `email_verified=true` und nur wenn
  die E-Mail (ohne Groß-/Kleinschreibung) in der Liste steht. Eine spätere Änderung der Liste
  vergibt oder entzieht keine Rollen. Rollen aus dem Token werden nie ausgewertet. Der Bootstrap
  schreibt einen Audit-Eintrag `keine → Administrator` mit Akteur „System“.
- Produktion: Kein Realm aus dem Repository. Konfiguriert wird nur die Adresse des echten Keycloak
  (`https`) sowie Audience und ClientId, z. B. per Umgebungsvariablen `Oidc__Authority`,
  `Oidc__Audience`, `Oidc__ClientId`, `Frontend__Ursprung`, `Bootstrap__AdminEmails__0`. Der
  Betreiber richtet am Keycloak den Client (exakte URIs, PKCE) und den Audience-Mapper ein und
  aktiviert am AD-Provider „Trust Email“, damit Tokens `email_verified=true` tragen. Sonst greift
  der Bootstrap nicht.

### Hinweise für den Betrieb

- **Audit-Log** (Tabelle `benutzer_audit`): Einträge sind unveränderlich. Der Trigger
  `trg_benutzer_audit_unveraenderlich` bricht jedes `UPDATE` und `DELETE` ab; `TRUNCATE` ist
  bewusst nicht gesperrt (Tests, Betrieb). Die Einträge werden vorerst unbegrenzt aufbewahrt, ein
  Löschkonzept folgt als eigenes Feature (ADR-0017).
- **Ausgaben** (Tabellen `ausgabe`, `ausgabe_audit`, ADR-0020): Der Trigger `trg_ausgabe_nur_storno`
  verbietet `DELETE` und jedes `UPDATE` außer dem einmaligen Storno, `trg_ausgabe_audit_unveraenderlich`
  jedes `UPDATE` und `DELETE` im Audit; `TRUNCATE` bleibt möglich. Ausgaben samt Empfängerdaten und
  Audit werden vorerst unbegrenzt aufbewahrt (F10), ein Löschkonzept folgt als eigenes Feature.
- **Zertifikatsvorlagen** (Tabellen `zertifikat_vorlage`, `vorlage_audit`, ADR-0023): Die Trigger
  `trg_zertifikat_vorlage_unveraenderlich` und `trg_vorlage_audit_unveraenderlich` brechen jedes `UPDATE`
  und `DELETE` ab; `TRUNCATE` bleibt möglich. Versionen und Audit werden vorerst unbegrenzt aufbewahrt.
  Die Dateien liegen als `bytea` in der Datenbank, nie im Dateisystem.
- **Coin-Kennung und Zertifikatsnummer** (ADR-0027): `coin_typ.kennung` kommt aus der Sequenz
  `coin_kennung_seq` (Funktion `coin_kennung_neu()`); der Trigger `trg_coin_typ_kennung_unveraenderlich`
  verbietet jede Änderung. `ausgabe.zertifikatsnummer` ist über `trg_ausgabe_nur_storno` geschützt und
  nur unter aktiven Ausgaben eindeutig (`ux_ausgabe_zertifikatsnummer_aktiv`). Lücken in der Kennungsfolge
  (z. B. nach abgelehnten Duplikaten) sind normal. Inserts in `coin_typ` per SQL erhalten die Kennung
  über den Spalten-Default.
- **Zertifikat-Downloads** (Tabelle `zertifikat_audit`, ADR-0029): ein Eintrag je erfolgreichem
  Download (`zeitpunkt`, `akteur_id`, `ausgabe_id`, `coin_id`, `zertifikatsnummer`, `vorlage_version`,
  `NULL` = Standardvorlage), ohne Empfängerdaten. `trg_zertifikat_audit_unveraenderlich` bricht jedes
  `UPDATE` und `DELETE` ab; `TRUNCATE` bleibt möglich; Aufbewahrung vorerst unbegrenzt. Einen
  Lese-Endpunkt gibt es nicht, ausgewertet wird per SQL. Weil eine Neuausgabe nach Storno dieselbe
  Nummer trägt, Downloads über `ausgabe_id` unterscheiden:

  ```sql
  SELECT z.zeitpunkt, b.anzeigename, z.ausgabe_id, z.vorlage_version
  FROM zertifikat_audit z JOIN benutzer b ON b.id = z.akteur_id
  WHERE z.zertifikatsnummer = 'C0042-0012' ORDER BY z.zeitpunkt;
  ```

  Erzeugte Zertifikate werden nirgends gespeichert; je Prozess laufen höchstens 2 Erzeugungen gleichzeitig.
- **Startseite** (Tabellen `startseite_konfiguration`, `startseite_logo`, `startseite_audit`,
  ADR-0030): höchstens eine Konfigurationszeile (`id = 1`) und je Logo-Platz eine Logozeile, Logos als
  `bytea` in der Datenbank. `startseite_audit` enthält je Änderung Art, Ziel, Akteur, Zeitpunkt und
  Version, bei Logos nur den SHA-256, nie Textinhalte; `trg_startseite_audit_unveraenderlich` bricht
  jedes `UPDATE` und `DELETE` ab, `TRUNCATE` bleibt möglich; Aufbewahrung vorerst unbegrenzt, kein
  Lese-Endpunkt. Ohne Konfigurationszeile gilt die Standardkonfiguration aus dem Code. Kopfbereich und
  Logos sind öffentlich abrufbar, gespeicherte Logos auch bei ausgeschaltetem Kopfbereich (ADR-0032).
- **Hologrammnummern** (Tabellen `ausgabe_hologramm`, `hologramm_audit`, `pruefung_audit`, ADR-0033,
  ADR-0034, Migration `Hologrammnummern`): Eine Korrektur ändert keine Zeile, sondern setzt
  `abgeloest_am` an der bisherigen Zuordnung und legt eine neue an; `trg_ausgabe_hologramm_nur_abloesen`
  verbietet `DELETE` und jedes andere `UPDATE`. Die Normalform berechnet die Datenbank (generierte Spalte
  `nummer_normalisiert`), eindeutig unter den nicht abgelösten Zeilen (`ux_ausgabe_hologramm_nummer`).
  `trg_hologramm_audit_unveraenderlich` und `trg_pruefung_audit_unveraenderlich` brechen jedes `UPDATE`
  und `DELETE` ab; `TRUNCATE` bleibt möglich. Aufbewahrung vorerst unbegrenzt, kein Lese-Endpunkt;
  `pruefung_audit` wächst mit jeder Prüfung. `ausgabe` und `trg_ausgabe_nur_storno` sind unverändert.
- **Ratenbegrenzung der Prüfung** (ADR-0034): 20 Prüfungen je Benutzer und 60 s, fest im Code, im
  Speicher **je API-Instanz**. Bei mehreren Instanzen hinter einem Lastverteiler vervielfacht sich das
  Kontingent; ein Neustart setzt es zurück. Abgelehnte Prüfungen (`429`) stehen nur im Request-Protokoll.
- **Warnung 2501**: Schlägt die Erzeugung eines Zertifikats fehl (`500 zertifikat_fehler`), schreibt die
  Kategorie `Coin.Api.Http.ZertifikatProtokoll` genau eine Warnung `ZertifikatErzeugungFehlgeschlagen`
  mit fester Meldung, ohne Ausnahme, Werte oder Dateiinhalt. Gehäufte Einträge deuten auf eine
  gespeicherte Vorlage, die sich nicht verarbeiten lässt; Abhilfe ist ein neuer Upload der Vorlage.
- **Arbeitsspeicher beim Vorlagen-Upload** (ADR-0024 Punkt 7): Prüfung und Bereinigung brauchen je
  Upload im ungünstigsten Fall etwa 200 MiB Working Set; je Prozess laufen höchstens 2 gleichzeitig,
  weitere warten (gemessene Spitze bei 8 parallelen Uploads etwa 518 MiB). Dafür Arbeitsspeicher
  einplanen. Einen Virenscan macht die App nicht (Betriebsthema).
- **Abgelehnte Word-Erweiterungen** (ADR-0026 Punkt 7): Lehnt der Server eine echte Word-Datei mit
  „nicht unterstützte Word-Erweiterungen“ ab, wird der betroffene Namespace nicht geloggt. Nachtrag nur
  über den Nachtragsprozess (Datei ohne Personendaten bereitstellen, Bewertung, Eintrag in
  `WordNamespaces` und [docs/word-namespaces.md](docs/word-namespaces.md)); die Liste ist nicht
  konfigurierbar.
- **Warnungen der Vorlagenbereinigung**: Schlägt die Bereinigung oder die Nachprüfung einer
  hochgeladenen Vorlage fehl, schreibt die Kategorie `Coin.Api.Http.VorlagenProtokoll` eine Warnung
  `2401` bzw. `2402` mit fester Meldung (ohne Dateiinhalt). Gehäufte Einträge deuten auf Word-Dateien
  hin, die das OpenXML SDK nicht sauber schreibt.
- **Migration `20261008100432_Exemplare`** erzeugt für jeden bestehenden Coin mit Auflage die
  Exemplare 1 bis Auflage in einem Statement. Bei vielen oder großen Auflagen (bis 1.000.000 je Coin)
  für die Migration ein Timeout von mindestens 120 s einplanen.
- **Lange Befehle**: Das Erzeugen und Löschen von Exemplaren (Coin anlegen, Auflage ändern, Coin bearbeiten) läuft mit
  einem Befehls-Timeout von 120 s. Ein vorgelagerter Proxy mit kürzerem Timeout (z. B. nginx mit
  60 s) kann solche Anfragen vorher abbrechen; sein Timeout entsprechend setzen.
- **`Include Error Detail` nie setzen** (Npgsql-Option im Connection-String): Sie brächte
  Parameterwerte, also Empfängerdaten, in Fehlermeldungen und Logs. Tests in
  `KonfigurationsdateienTests` prüfen Konfigurationsdateien und Backend-Code darauf.
- **Notfall „kein aktiver Administrator mehr“**: Über die App ist das ausgeschlossen (ADR-0018).
  Geht der Zugang trotzdem verloren (z. B. Konto im AD gelöscht), hilft `Bootstrap:AdminEmails`
  nur bei einem noch nie angemeldeten Konto. Sonst per SQL auf der Datenbank, für ein Konto, das
  sich schon einmal angemeldet hat:

  ```sql
  UPDATE benutzer SET rolle = 'Administrator', aktiv = true, aktualisiert_am = now()
  WHERE lower(email) = lower('<e-mail>');
  ```

  Der Eingriff umgeht die Schutzregeln und erzeugt keinen Audit-Eintrag. Er ist außerhalb der App
  zu dokumentieren.
- **Request-Protokoll** (ADR-0019): Jeder Request, auch öffentliche Katalog- und Bildabrufe, ergibt
  genau einen Eintrag der Kategorie `Coin.Api.Http.AnfrageProtokoll` auf `Information`, EventId
  `4601`, mit den Feldern `Methode`, `Route` (Routen-Template, nie roher Pfad oder Query; ohne
  Endpunkt `(keine Route)`), `Status` (`499` bei Client-Abbruch vor Antwortbeginn) und `DauerMs`.
  Korreliert wird über `TraceId` und `SpanId` im Scope. Absenken oder Abschalten nur über das
  Log-Level `Logging:LogLevel:Coin.Api.Http.AnfrageProtokoll` (z. B. `Warning`); Felder und erfasste
  Endpunkte sind nicht konfigurierbar. Details in [docs/api.md](docs/api.md#protokollierung).
- **Framework-Logs mit Request-Daten**: `src/Coin.Api/Http/Protokollierung.cs` erzwingt feste
  Mindeststufen, die keine Konfiguration (auch keine Wildcard- oder empfängerspezifische Regel)
  aufhebt: `Microsoft.AspNetCore.Hosting.Diagnostics` ab `Warning` (ohne Scope),
  `Microsoft.AspNetCore.Routing.Matching.DfaMatcher` ab `Warning`,
  `Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker` ab `Debug`,
  `Microsoft.AspNetCore.Server.Kestrel.BadRequests` ab `Warning`. Wer die `ILoggerFactory` ersetzt
  (z. B. durch Serilog), hebelt das aus; die Tests `Aufgeloeste_LoggerFactory_*` in `LogTests`
  schlagen dann an.

Neue Migration anlegen:

```powershell
dotnet ef migrations add <Name> --project src/Coin.Infrastructure --startup-project src/Coin.Api --output-dir Persistenz/Migrationen
```

Lokale Dev-DB, auf die die Migration `Exemplare` schon vor dem Nachtrag des Index
`ix_ausgabe_exemplar` angewendet wurde: einmal zurück- und wieder vorrollen. Das Zurückrollen löscht
die Tabellen `exemplar`, `ausgabe` und `ausgabe_audit` samt Inhalt.

```powershell
dotnet ef database update 20261006053745_Benutzerverwaltung --project src/Coin.Infrastructure --startup-project src/Coin.Api
dotnet ef database update --project src/Coin.Infrastructure --startup-project src/Coin.Api
```

## Frontend (`web/`)

Technik: React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui in der Base-UI-Variante
(`@base-ui/react`, Icons `lucide-react`) und TanStack Router mit code-basiertem Routenbaum
(ADR-0009, ADR-0010).

```powershell
cd web
npm install                      # richtet auch den Git-Hook ein (siehe unten)
npm run dev
```

Der Vite-Dev-Server läuft auf `http://localhost:5173` und leitet `/api` an
`http://localhost:5172` weiter. Ein anderes Ziel lässt sich per Umgebungsvariable
`VITE_API_PROXY_TARGET` setzen. Die API muss für das Frontend laufen. Nur im Dev-Server gibt es
die Bausteinübersicht unter `http://localhost:5173/entwicklung/bausteine` (ohne Anmeldung, ohne API).

Anmeldung: `oidc-client-ts` mit `react-oidc-context` (Authorization Code Flow mit PKCE). Die
Konfiguration steht eingecheckt in `web/.env.development`:

| Variable | Wert lokal |
|---|---|
| `VITE_OIDC_AUTHORITY` | `http://localhost:8180/realms/coin` |
| `VITE_OIDC_CLIENT_ID` | `coin-web` |

Fehlt ein Wert, bleibt der Katalog lesbar. Statt „Anmelden“ steht dann „Anmeldung ist nicht
konfiguriert.“ Die Werte werden beim Build eingebettet, ein anderes Ziel braucht also einen eigenen
Build. Tokens liegen nur im `sessionStorage` des Tabs. Ein Bearer-Token geht nur an Pfade unter
`/api/` derselben Origin.

Routen:

| Pfad | Zugang | Inhalt |
|---|---|---|
| `/` | öffentlich | Startseite: mit `coins.read` alle aktiven Blöcke (`GET /api/startseite`), sonst nur der öffentliche Kopfbereich (`GET /api/startseite/kopf`) bzw. die statische Begrüßung „Willkommen bei C.O.I.N.“; „Zum Katalog“ immer |
| `/coins` | öffentlich | Katalog mit Suche (Chip „Suche: …“), Ansicht „Tabelle“/„Karten“ und Blättern; Suchparameter `suche` (≤ 100 Zeichen) und `seite` in der URL, die Ansicht nur im `localStorage` (`coin-katalog-ansicht`, ADR-0044); Link „Coin hinzufügen“ nur mit `coins.write` |
| `/coins/neu` | `coins.write` | Seite „Coin hinzufügen“ (Formular inkl. Motivbild, darunter „Standardvorlage herunterladen“); danach `replace` auf die Detailseite |
| `/coins/$coinId` | öffentlich | Detailseite; keine GUID → „Coin nicht gefunden“ ohne API-Aufruf. Kopf mit Status-Chips und Aktionen („Auflage ändern“, „Bearbeiten“ mit `coins.write`, „Ausgabe erfassen“ mit `issues.write` bei freiem Exemplar), Kennzahlen mit `coins.read`. Reiter im Suchparameter `reiter` (`stammdaten`, `exemplare` mit `coins.read`, `ausgaben` mit `issues.read`, `vorlage` mit `coins.write`; Wechsel per `replace`, unbekannt/nicht erlaubt = Standard „Exemplare“ bzw. ohne `coins.read` Stammdaten ohne Reiterleiste). Exemplare mit Suchparametern `status` (`verfuegbar`/`ausgegeben`) und `seite`; Ausgabehistorie mit Statusfilter (nicht in der URL), Zeilenklick zur Ausgabe-Seite, „Stornieren“/„Zertifikat herunterladen“ mit `issues.write` |
| `/coins/$coinId/bearbeiten` | `coins.write` | Seite „Coin bearbeiten“: Stammdaten und Motivbild (die Zertifikatsvorlage steht im Reiter „Zertifikatsvorlage“ der Detailseite); nach dem Speichern der Stammdaten `replace` auf die Detailseite |
| `/coins/$coinId/ausgaben/neu` | `issues.write` | Seite „Ausgabe erfassen“; danach `replace` auf die Detailseite |
| `/coins/$coinId/ausgaben/$ausgabeId` | `issues.read` | Seite „Ausgabe“ (`ROUTEN.ausgabeDetail`): Status-Chip, Abschnitte „Zertifikat“, „Empfängerdaten“, „Ausgabedaten“ und „Verlauf“; „Hologrammnummer ergänzen/korrigieren“, „Zertifikat herunterladen“ und „Stornieren“ (nur aktive Ausgaben) mit `issues.write`; `coinId` oder `ausgabeId` keine GUID → „Ausgabe nicht gefunden“ ohne API-Aufruf |
| `/pruefung` | `coins.read` | Seite „Zertifikat prüfen“ (`ROUTEN.pruefung`) in zentrierter Spalte (ADR-0043): Coin-Auswahl (optional), Hologrammnummer, Ergebniskarte; mit `issues.read` über `POST /api/pruefung/mit-empfaenger` samt Empfängerdaten. Nach jeder Prüfung Fokus im Nummernfeld, Inhalt markiert. Die Nummer steht nie in der URL |
| `/benutzerverwaltung` | `users.manage` | Tabs „Benutzer“ und „Audit-Log“ (Karte „Änderungsprotokoll“ mit Benutzerfilter über `GET /api/benutzer?suche` und `GET /api/audit?benutzerId`; Filter nur im Zustand, nie in der URL) |
| `/verwaltung/startseite` | `startpage.manage` | Seite „Startseite verwalten“ (`ROUTEN.startseiteVerwaltung`): Tabs „Bearbeiten“ und „Vorschau“; Verlassen mit ungespeicherten Änderungen fragt per Dialog nach (`VerlassenWarnung`), Neuladen/Schließen per `beforeunload` |
| `/anmeldung/rueckruf` | öffentlich | Rückkehr vom Keycloak (ohne App-Shell) |
| `/abgemeldet` | öffentlich | Bestätigung nach dem Abmelden |
| `/kein-zugriff` | nur angemeldet | Hinweis für Benutzer ohne Rolle, mit deaktiviertem Konto oder (mit `?grund=berechtigung`) mit Rolle ohne die nötige Berechtigung; alle anderen werden nach `/` geleitet |
| `/entwicklung/bausteine` | nur Dev-Server, ohne Anmeldung | „Bausteinübersicht“ mit allen Bausteinen aus `shared/ui`, Farben und Schriftstufen (nur synthetische Daten, kein API-Aufruf, kein Sidebar-Eintrag). Die Route gibt es nur bei `import.meta.env.DEV`; im Produktions-Build zeigt der Pfad „Seite nicht gefunden.“ (ADR-0036) |

`/coins/neu` und `/coins/$coinId` sind Geschwister von `/coins`; das statische Segment `neu` geht
vor dem Parameter. `/coins/$coinId/ausgaben/neu`, `/coins/$coinId/ausgaben/$ausgabeId` und
`/coins/$coinId/bearbeiten` sind ebenfalls Geschwister; `neu` geht auch hier vor `$ausgabeId`. Ungültige
Suchparameter (`seite=0`, `seite=abc`, Seite über 2147483647, unbekannter `status`) gelten als
Seite 1 bzw. „Alle“, ein zu langer Suchbegriff wird gekürzt; die URL führt also nie zu einem `400`.
Die Erfolgsmeldungen nach dem Anlegen und Bearbeiten eines Coins und nach dem Erfassen einer Ausgabe
(nur die Exemplar-Nummer, nie der Empfänger) reisen im History-State und werden einmal verbraucht.

Unbekannte Pfade zeigen „Seite nicht gefunden.“ Die Guards `erfordertAnmeldung` und
`erfordertBerechtigung(b)` liegen in `src/app/router/schutz.ts`. `erfordertBerechtigung` startet
ohne Sitzung die Anmeldung, leitet ohne Rolle oder deaktiviert nach `/kein-zugriff` und mit Rolle,
aber ohne Berechtigung, nach `/kein-zugriff?grund=berechtigung`. Sichtbarkeit (Sidebar-Einträge, Links) richtet sich nur nach
`berechtigungen` aus `/api/me`, nie nach dem Rollennamen; ein Test in `abhaengigkeiten.test.ts`
verbietet Rollenvergleiche außerhalb von `features/rolle-zuweisen`, `pages/kein-zugriff`,
`app/router` und `app/anmeldung` (Zugriffsklasse).

Auf `/kein-zugriff` lädt „Erneut prüfen“ `/api/me` neu; deaktiviert oder ohne Rolle prüft die App
außerdem still beim Zurückkehren ins Fenster (höchstens alle 30 s, kein Polling). Ändert sich die
Zugriffsklasse (`deaktiviert`, `ohneRolle`, `mitRolle`), laufen die Guards einmal neu
(`router.invalidate()`); wer eine Rolle hat, landet so auf `/`.

### Anmeldung lokal ausprobieren

1. `docker compose up -d`, API und `npm run dev` starten.
2. `http://localhost:5173/coins` öffnen: Der Katalog ist ohne Anmeldung sichtbar, der Link
   „Coin hinzufügen“ nicht.
3. „Anmelden“ → Keycloak-Formular → `admin@test.local` mit dem Testpasswort aus
   [infra/keycloak/README.md](infra/keycloak/README.md). Per Bootstrap wird dieser Benutzer
   Administrator und sieht „Coin hinzufügen“.
4. `neu@test.local` (ebenso `sachbearbeiter@test.local` und `betrachter@test.local`) hat in der
   App zunächst keine Rolle und landet nach der Anmeldung auf „Kein Zugriff“.
5. Als `admin@test.local` in der Sidebar **Benutzerverwaltung** öffnen. Dort erscheinen alle
   Benutzer, die sich schon einmal angemeldet haben; Rolle wählen und bestätigen. Die Änderung wirkt
   beim nächsten API-Aufruf. Ein Benutzer auf „Kein Zugriff“ kommt per „Erneut prüfen“ weiter; bei
   Benutzern, die schon eine Rolle haben, zeigt das Frontend den Wechsel erst nach dem Neuladen.

Rollen und Status stehen in der Tabelle `benutzer`, das Audit-Log in `benutzer_audit` der
Entwicklungs-DB.

### Struktur (Feature-Sliced Design, ADR-0008)

`src/` enthält nur die Schichten `app`, `pages`, `widgets`, `features`, `entities` und `shared`.
Importe zeigen nur nach unten, nie nach oben und nie quer zwischen Slices derselben Schicht.

- Jeder Slice hat eine `index.ts` als Public API. Von außen wird nur über `@/<schicht>/<slice>`
  importiert, innerhalb eines Slices relativ.
- Einziger Alias ist `@/` → `src/` (in `tsconfig.json`, `tsconfig.app.json`, `vite.config.ts`).
- `shared/ui` enthält die Bausteine (ADR-0036): shadcn-Komponenten und eigene Zusammensetzungen
  `formularfeld.tsx` (`Formularfeld`), `seitenkopf.tsx` (`Seitenkopf`), `zustaende.tsx`
  (`Ladeanzeige`, `Leerzustand`, `Fehlerzustand`) und `toast.tsx` (Base UI Toast, `useToast().zeige`,
  ADR-0038), dazu für Formulare und Detailseiten `formular-abschnitt.tsx`, `fehlerzusammenfassung.tsx`,
  `aktionsleiste.tsx` (ADR-0039), `verlassen-warnung.tsx` (ADR-0040), `bestaetigungsdialog.tsx`,
  `daten-tabelle.tsx` und `filterleiste.tsx` (ADR-0041), `kennzahl-karte.tsx` (`KennzahlRaster` mit
  `spalten` 3/4, `KennzahlKarte` mit `groesse`), `progress.tsx` (shadcn, nachbearbeitet) und
  `zeitleiste.tsx` (ADR-0042), dazu `ansichtsumschalter.tsx`, `rangliste.tsx` und `ergebniskarte.tsx`
  (ADR-0043). Neue Seiten nutzen `Seitenkopf` und `Card` ohne eigenen Seitenrand und ohne eigene
  Maximalbreite; den Container stellt `widgets/app-shell` (Skip-Link, Seitenleiste mit Gruppen,
  Kopfzeile als einziges `<header>`, `main#inhalt`). `pages/entwicklung-bausteine` ist die
  Bausteinübersicht. `shared/lib` enthält u. a. `cn()`, das Farbschema, `istGuid`
  (`shared/lib/guid`), Zahl- und Datumsformate (`shared/lib/format.ts`: `de-DE`, Europe/Berlin,
  Zeitpunkte als „TT.MM.JJJJ, HH:MM Uhr“, `formatiereZeitpunktMitSekunden`, `heuteInBerlin`; einzige
  Datei mit `Intl.DateTimeFormat`, geprüft in `src/app/konsistenz.test.ts`), Hooks (`shared/lib/hooks`:
  `useIsMobile`, `useFokusBeiLadefehler`, `useMedienabfrage`, `useZeilenklick`, `useVerlassenWarnung`,
  `useLokaleWahl` für Bedienvorlieben im `localStorage` mit fester Werteliste, ADR-0044), den Formular-Hook (`shared/lib/formular`:
  `useFormular`, `useSendeSperre`, `pruefeNachZeigerklick`; `zeiger.ts` registriert beim Import globale
  Listener, ADR-0039) und die
  Anmeldung (`shared/lib/anmeldung`: UserManager, Provider, `useAnmeldung`, `sicheresZiel`),
  `shared/api` den generischen HTTP-Teil (inkl. Bearer-Header; Option `konfliktDetail` übernimmt bei
  `409` auch `detail`; Datei-Downloads mit Token als Blob samt Dateiname aus `Content-Disposition`),
  `shared/lib/datei` das Speichern eines Blobs als Datei (Object-URL erst nach 40 s freigegeben),
  `shared/config` die Routenpfade, die OIDC-Konfiguration und die Speicherschlüssel (`speicher.ts`:
  `SPEICHER_KATALOG_ANSICHT`).
- Anmeldung im Überblick: `entities/benutzer` (`GET /api/me`, Benutzerliste, `hatBerechtigung`,
  `StatusBadge`), `features/anmeldung` (Buttons „Anmelden“/„Abmelden“), `pages/kein-zugriff`,
  `pages/abgemeldet`, `pages/anmeldung-rueckruf`. `app` lädt `/api/me` einmal pro Anmeldung und
  reicht Benutzer und Anmeldezustand als Props an Widgets und Seiten weiter. Liefert `/api/me` oder
  ein anderer Aufruf `403 benutzer_deaktiviert`, wechselt `app` in den Zustand „deaktiviert“.
- Katalog: `entities/coin` (API `ladeCoins`/`ladeCoin`/`legeCoinAn`/`aendereCoin`/`ladeBildHoch`/
  `aendereAuflage`, gemeinsame Feldprüfung `validiereStammdaten` und `validiereBild` für Anlegen und
  Bearbeiten, `CoinListe` als Tabelle, `CoinKarten` als Kartenansicht, `CoinStammdaten`),
  `features/coin-anlegen` (`CoinFormular`), `features/coin-bearbeiten` (`CoinBearbeitenFormular`),
  `features/motivbild-hochladen`, `widgets/coin-katalog` (Filterleiste mit Suche, Chip und
  Ansichtsumschalter, Statuszeile, Tabelle oder Karten, Zustände, Blättern), `pages/coin-liste`, `pages/coin-detail`,
  `pages/coin-anlegen`, `pages/coin-bearbeiten`.
- Zertifikatsvorlagen: `entities/zertifikatsvorlage` (Status, Downloads, `VersionenTabelle`,
  Dateiname aus der Antwort), `features/standardvorlage-herunterladen`, `features/vorlage-hochladen`
  (Dateifeld mit Vorprüfung auf `.docx` und Größe), `features/vorlage-zuruecksetzen` (Button mit
  Bestätigungsdialog), `widgets/zertifikatsvorlage` (Reiter „Zertifikatsvorlage“ der Detailseite).
- Exemplare und Ausgaben: `entities/exemplar` (`ladeExemplare`, `Kennzahlen` als Karten,
  `BestandChips`, `ExemplarTabelle`, Status-Badge), `entities/ausgabe` (`ladeAusgaben`, `ladeAusgabe`,
  `AusgabenTabelle` mit optionaler Render-Prop `zertifikat` für die Spalte „Zertifikat“,
  `AusgabeDetails` in Abschnitten, `AusgabeVerlauf`, `AusgabeStatusChip`), `features/ausgabe-erfassen`
  (`AusgabeFormular`), `features/ausgabe-stornieren` (Button mit Bestätigungsdialog),
  `features/zertifikat-herunterladen` (`ZertifikatHerunterladen`: Download per `ladeDatei`, Dateiname
  nur nach Muster `Zertifikat_C….docx`, gesperrt per `aria-disabled` und dadurch fokussierbar, Alarm bei
  Fehlern), `features/auflage-aendern` (Button mit Dialog), `widgets/coin-exemplare` (Kennzahlen,
  Filter mit Chip, Tabelle, Blättern, „Ausgabe erfassen“, „Auflage ändern“; auf der Detailseite
  kontrolliert über `daten` und ohne Kennzahlen und Aktionen), `widgets/ausgaben-historie`
  (Historie mit Statusfilter, Storno, Zeilenklick zur Ausgabe-Seite und Zertifikat-Download),
  `pages/ausgabe-erfassen`, `pages/ausgabe-detail` (Props `darfZertifikat`, `darfHologramm`,
  `darfStornieren`). `pages/coin-detail` setzt Kopf, Kennzahlen und Reiter nach Berechtigung zusammen
  und lädt `…/exemplare` einmal für Kennzahlen und Reiter.
- Hologrammnummer und Prüfung: `entities/ausgabe` enthält die Normalisierung `pruefeHologrammnummer`
  (gleiche Regeln und Testvektoren wie die Domain) und `HOLOGRAMMNUMMER_MAX`, weil beide Features sie
  brauchen; `features/hologrammnummer-aendern` (`HologrammnummerAendern`: Button mit Dialog, `PUT` mit
  `bisherige`), `features/zertifikat-pruefen` (`pruefeHologramm`, `CoinAuswahl` als Combobox mit
  verzögerter Suche über `ladeCoins`, `PruefFormular`, `PruefErgebnisAnzeige`), `pages/pruefung`
  (`PruefungSeite`, Prop `darfEmpfaenger`). `shared/api` bildet `429` auf
  `{ art: 'zuVieleAnfragen', wiederholenNachSekunden }` ab (`Retry-After`, sonst `null`).
  Seiten nutzen keine Router-Hooks; Suche, Seite, Parameter und Navigation reicht
  `app/router/routen-komponenten.tsx` als Props durch.
- Benutzerverwaltung: `entities/audit` (`AuditTabelle`, `GET /api/audit`), `features/rolle-zuweisen`
  und `features/benutzer-status-aendern` (je Auswahl bzw. Button mit Bestätigungsdialog),
  `features/audit-filtern` (`BenutzerFilter`: Combobox „Benutzer“, Suche über `ladeBenutzerliste`, nur
  Namen), `widgets/benutzer-tabelle`, `widgets/audit-log` (Benutzerfilter mit Chip),
  `pages/benutzerverwaltung`.
- Startseite: `entities/startseite` (Typen, Grenzen, `ladeStartseite`/`ladeKopf`/`ladeKonfiguration`,
  `useDateiUrl` für Object-URLs der Logo-Vorschau, Block-Komponenten `Kopfbereich`, `InfotextBlock`,
  `KennzahlenBlock`, `NeuesteCoinsBlock`, `MeistausgegebeneBlock`), `widgets/startseite`
  (`StartseiteBloecke`: Blöcke in Reihenfolge, Zeilen aus `bildeZeilen` nach ADR-0043,
  Überschriftenebene 1 auf `/`, 2 in der Vorschau),
  `features/startseite-konfigurieren` (`StartseiteFormular`, Blockkarten mit Schalter und
  Verschieben-Buttons, Logo-Felder, Vorprüfung, Speichern als `multipart/form-data`), `pages/start`,
  `pages/startseite-verwaltung`.
- Markdown: `shared/ui/markdown.tsx` (`MarkdownText`) ist die einzige Stelle, die vom Benutzer
  formatierten Text darstellt (`react-markdown` mit `remark-breaks`, nur `p`, `br`, `strong`, `em`,
  `ul`, `ol`, `li`, `a`; rohes HTML entfernt, Links nur `http`, `https`, `mailto` und `/…`;
  ADR-0031). `dangerouslySetInnerHTML` ist im Frontend verboten (Code-Test).
- Das Blättern (`shared/ui/blaettern.tsx`) ist eine eigene Komponente, keine shadcn-Komponente;
  Katalog, Benutzertabelle, Audit-Log, Exemplare und Ausgabehistorie nutzen sie gemeinsam
  (Fokusregeln in ADR-0009).
- Testhilfen (Fake-API, Setup) liegen außerhalb der Schichten in `web/test/`.
- Steiger prüft die Regeln (`npm run lint:fsd`, Konfiguration `steiger.config.ts`).

### Skripte (in `web/`)

| Skript | Zweck |
|---|---|
| `npm run dev` | Vite-Dev-Server (Port 5173) |
| `npm run build` | ESLint, TypeScript-Prüfung (`tsc -b`), Produktions-Build nach `dist/` und `scripts/pruefe-produktionsbuild.mjs` (scheitert, wenn eine Datei in `dist/` „Bausteinübersicht“ enthält, die Entwicklungsseite also im Bundle gelandet ist) |
| `npm run lint` | ESLint und Steiger; keine Warnungen erlaubt, jeder Befund ist ein Fehler |
| `npm run lint:fix` | ESLint mit automatischer Korrektur |
| `npm run lint:fsd` | nur Steiger (FSD-Regeln für `src/`) |
| `npm run format` | Prettier formatiert alle `ts`, `tsx`, `js`, `jsx`, `json` und `css`-Dateien |
| `npm test` | Vitest, einmaliger Lauf (`src/**/*.test.ts(x)`, jsdom) |
| `npm run test:dev` | Vitest im Watch-Modus |
| `npm run test:ui` | Playwright-UI-Tests aus `ui-tests/` (Chromium, Port 5193) |
| `npm run tsc` | TypeScript-Prüfung aller Projekte (`tsc -b`: `src`, `test`, `ui-tests`, Konfigurationsdateien) |
| `npm run preview` | Vorschau des Produktions-Builds |
| `npm run prepare` | richtet Husky ein; läuft automatisch bei `npm install` |
| `npm run install-browser` | einmalig: Chromium für Playwright installieren |

### Pre-Commit-Hook (Husky)

`npm install` in `web/` setzt `git config core.hooksPath` auf `web/.husky/_`. Danach führt
`web/.husky/pre-commit` bei jedem Commit im gesamten Repo, auch bei reinen Backend-Änderungen,
in `web/` `npm run lint` und `npm test` aus. Schlägt einer davon fehl, wird der Commit abgelehnt.
Vorher lehnt er direkte Commits auf `main` und `develop` ab (Gitflow, `docs/branching.md`);
Merge-Commits sind ausgenommen.

Der Hook prüft den Arbeitsstand auf der Platte, nicht nur den Index (es gibt kein lint-staged).
Nicht gestagte Änderungen fließen also in das Ergebnis ein: Ein fehlerhafter, nicht gestagter
Stand blockiert auch einen sauberen Commit, und ein Fehler, der nur im Index steht, kann
unbemerkt bleiben, wenn der Arbeitsstand ihn schon behoben hat. Zuverlässig ist das Ergebnis
nur, wenn Index und Arbeitsstand übereinstimmen.

### Zwei Arten von Browser-Tests

| | `web/ui-tests` (`npm run test:ui`) | `e2e/` (`npx playwright test`) |
|---|---|---|
| Zweck | App-Shell, Anmeldung, Benutzerverwaltung, Katalog-Seiten, Ausgaben, Zertifikatsvorlagen, Zertifikat-Download, Startseite (inkl. XSS-Nutzlasten im echten Chromium), Hologrammnummer und Prüfseite: Routing, Seitenleiste, Tastaturbedienung, Darstellung; dazu Barrierefreiheit mit axe (`barrierefreiheit.spec.ts`), 360/768/1280 px (`responsiv.spec.ts`), Tastatur (`tastatur.spec.ts`), Bausteinseite (`bausteine.spec.ts`), reduzierte Bewegung (`bewegung.spec.ts`), Formulare (`formulare.spec.ts`), Verlassen-Warnung (`verlassen-warnung.spec.ts`), Bestätigungsdialoge (`bestaetigungen.spec.ts`), Detailseite je Rolle (`coin-detail-rollen.spec.ts`), Tabellen (`tabellen.spec.ts`), Startseitenraster (`startseite-raster.spec.ts`), Katalogansichten (`katalog-ansicht.spec.ts`), Prüfmaske (`pruefmaske.spec.ts`), Verwaltungsseiten (`verwaltung.spec.ts`), unveränderte Rechte je Rolle (`rechte-unveraendert.spec.ts`) und Screenshots (`screenshots.spec.ts`, `screenshots-formulare.spec.ts`, `screenshots-uebersicht.spec.ts`, `vergleich-startseite.spec.ts`) | fachliche Abläufe über alle Schichten; `design-fundament.spec.ts` prüft die Hauptseiten mit echten Daten per axe und auf horizontales Scrollen bei 360 px, `formulare-detailseiten.spec.ts` Tastaturbedienung, Reiter und Storno auf der Ausgabe-Seite, `startseite-listen-pruefung.spec.ts` Startseite ohne Lücken, gemerkte Katalogansicht und Serienprüfung nur per Tastatur |
| API | gemockt per `page.route`; Proxy-Ziel absichtlich unerreichbar; jeder nicht gemockte `/api`-Aufruf lässt den Test scheitern | echte API (Release-Build) mit Wegwerf-PostgreSQL |
| Anmeldung | Identitätsanbieter gemockt (`VITE_OIDC_AUTHORITY=http://127.0.0.1:9/realms/coin`) | echter Wegwerf-Keycloak |
| Voraussetzungen | nur Node.js und Chromium | Docker, .NET 10 SDK, Node.js ≥ 22.18 |
| Port | 5193 | 5183 (Frontend), 5182 (API), 5184 (Keycloak) |

Ports im Überblick: 5172 API, 5173 Dev-Server, 8180 Dev-Keycloak, 5182/5183/5184 Systemtests,
5193 UI-Tests. Die Server werden nie wiederverwendet; ist ein Port belegt, bricht der Lauf ab. Die
Browser-Installation teilen sich beide Projekte.

Barrierefreiheit: Beide Projekte nutzen `@axe-core/playwright` (devDependency) mit den Tags WCAG 2.0/2.1
A und AA; Verstöße der Stufen `serious` und `critical` lassen den Test scheitern (ADR-0037). Neue
Seiten gehören in `barrierefreiheit.spec.ts` und `responsiv.spec.ts`.

Screenshots für die Sichtprüfung (6 Seiten × 360/768/1280 px × hell/dunkel = 36 Dateien, gemockte,
synthetische Daten) liegen eingecheckt in `docs/design/ablage/<seite>_<breite>_<hell|dunkel>.png`.
Neu erzeugen nur bei Bedarf (in `web/`):

```powershell
$env:COIN_SCREENSHOTS = "1"; npx playwright test screenshots.spec.ts; Remove-Item Env:COIN_SCREENSHOTS
```

Ohne die Variable prüft `screenshots.spec.ts` nur, dass genau die 36 Dateien vorhanden sind.

Screenshots der Formulare, Detailseiten und Dialoge (je 360/768/1280 px, hell/dunkel) entstehen nur
lokal und werden nicht eingecheckt:

```powershell
$env:COIN_SCREENSHOTS = "1"; npx playwright test screenshots-formulare.spec.ts; Remove-Item Env:COIN_SCREENSHOTS
```

Die Bilder liegen unter `web/test-results/screenshots-formulare/<ansicht>_<breite>_<hell|dunkel>.png`
(per `.gitignore` ausgeschlossen). Playwright leert `test-results` zu Beginn jedes Laufs, also direkt
danach ansehen. Ohne die Variable wird die Spec übersprungen. Ebenso nur lokal entstehen die Bilder von
Startseite, Katalog, Prüfmaske und Verwaltung (`screenshots-uebersicht.spec.ts`, nach
`web/test-results/screenshots-uebersicht/`); diese Spec einzeln aufrufen, sonst überschreibt
`screenshots.spec.ts` die eingecheckten Bilder.

Eingecheckt ist der Vorher-Nachher-Vergleich der Startseite: 24 Bilder (6 Fälle × 1280/360 px, hell,
je `vorher_` und `nachher_`) in `docs/design/vergleich-startseite/`. Erzeugt werden sie mit
`vergleich-startseite.spec.ts` und der Variable `COIN_VERGLEICH=vorher` bzw. `nachher`; ohne sie wird
die Spec übersprungen.

### shadcn-Komponenten

Die Komponenten liegen in `src/shared/ui` (Konfiguration `components.json`) und wurden nach dem
Erzeugen angepasst (ADR-0009). Nach einem erneuten `npx shadcn add` immer den Diff prüfen:
Die CLI erzeugt `import { cn } from "cn"` statt `@/shared/lib/cn` und überschreibt Anpassungen,
u. a. das entfernte Sidebar-Cookie, die deutschen Texte, `inert` an der eingeklappten
Seitenleiste, die Ausnahme für Strg+B in Eingabefeldern, die Tab-Falle in `alert-dialog.tsx` und
`dialog.tsx`, „Schließen“ in `dialog.tsx` und den Pfeiltasten-Umlauf in `select.tsx` (vollständige
Liste in ADR-0009). Seit coin-ausgaben gehören auch `radio-group` und `dialog` dazu, seit startseite
`switch`, seit hologrammnummer `combobox` und ihre Abhängigkeit `input-group` (deutsche `sr-only`-Namen
der Icon-Buttons in `combobox.tsx`; seit startseite-listen-pruefung hat der Trigger „Vorschläge
anzeigen“ `tabIndex={-1}`, ADR-0043), seit design-fundament `checkbox`, `field`, `breadcrumb` („Brotkrumen“,
„Weitere Seiten“), `empty` und `spinner` („Wird geladen“). Danach `npm run format` und `npm run lint` ausführen.

Gestaltungsregeln (ADR-0035): Farbwerte stehen nur in `src/app/styles/index.css` (Hex, `:root` hell und
`.dark`), die Tailwind-Standardpalette ist abgeschaltet (`--color-*: initial`), ebenso Schriftstufen über
`text-3xl` und Schatten außer `xs`/`sm`/`md`. Komponenten verwenden nur Token-Klassen (`bg-primary`,
`text-muted-foreground`, `bg-overlay`, `bg-logo-surface` …), keine Hex-/Farbfunktionen, keine
Palettenklassen wie `bg-white` und keine beliebigen Abstände (`p-[13px]`); Fokusringe ohne Deckkraft
(`ring-ring`, nicht `ring-ring/50`). Das prüfen `src/app/gestaltungsregeln.test.ts` und der Kontrasttest
`src/app/kontrast.test.ts` (alle Textpaare ≥ 4,5:1, Nicht-Text ≥ 3:1, hell und dunkel). CLI-Komponenten
nach `npx shadcn add` darauf anpassen.

## Build und Tests

```powershell
dotnet build
dotnet test                                                     # Unit- und Integrationstests
dotnet test --filter "FullyQualifiedName~CoinAnlegenTests"      # Auswahl von Tests
dotnet test --filter "Kategorie!=Langsam"                       # ohne die langsamen Tests
```

Die Integrationstests enthalten langsame Tests mit Auflage 1.000.000 (`GrosseAuflageTests`, xUnit-Trait
`[Trait("Kategorie", "Langsam")]`, zusammen etwa 1 Minute). Sie laufen im normalen `dotnet test` mit;
der Filter `Kategorie!=Langsam` klammert sie aus.

Die Integrationstests starten per Testcontainers einen eigenen PostgreSQL-Container
(`postgres:17`); Docker muss laufen. Die lokale Umgebung aus `compose.yaml` wird dafür nicht benötigt.
Einen Keycloak brauchen sie nicht: Ein Test-Identitätsanbieter im Testhost signiert eigene
Test-Tokens (RSA-Schlüssel pro Lauf) und liefert Discovery und JWKS. Ersetzt wird dafür nur der
`BackchannelHttpHandler`, die Prüfparameter bleiben die des Produktionscodes.

Frontend (in `web/`, alle Skripte siehe Abschnitt „Frontend“):

```powershell
npm test         # Vitest
npm run lint     # ESLint und Steiger
npm run test:ui  # Playwright-UI-Tests mit gemockter API
npm run build    # ESLint, TypeScript-Prüfung, Produktions-Build und Prüfung auf die Bausteinseite
```

`npm test` und `npm run test:ui` nicht gleichzeitig starten: Unter sehr hoher Last laufen einzelne
Vitest-Tests sonst in Timeouts.

### Systemtests (in `e2e/`)

Voraussetzungen: Docker läuft, Node.js ≥ 22.18, .NET 10 SDK, `npm install` in `web/` und `e2e/`.
Compose-Umgebung (DB, Keycloak), `.env` und User-Secrets sind nicht nötig.

```powershell
cd e2e
npm install
npm run install-browser          # einmalig: Chromium für Playwright
npx playwright test
```

Ablauf pro Lauf (ADR-0007, ADR-0015):

- `scripts/start-api.mjs` startet per Testcontainers zwei Wegwerf-Container:
  - `postgres:17` (Datenbank `coin_e2e`, zufälliges Passwort),
  - Keycloak mit demselben Image-Tag wie `compose.yaml` und der Realm-Datei
    `infra/keycloak/coin-realm.json` auf dem festen Port `5184` (`http://localhost:5184/realms/coin`,
    ohne Admin-Konsolen-Konto).
- Danach startet die API als Release-Build in der Umgebung `Testing` ohne Launch-Profil auf
  `http://localhost:5182`, mit `Oidc:*` des Systemtest-Keycloaks und
  `Bootstrap:AdminEmails` = `admin@test.local`. Die Migrationen laufen beim Start.
- Das Frontend läuft über Vite auf `http://localhost:5183` (Proxy `/api` → 5182,
  `VITE_OIDC_AUTHORITY` → 5184).
- Schreibende Tests melden sich über das echte Keycloak-Formular als `admin@test.local` an.
  `benutzerverwaltung.spec.ts` vergibt `betrachter@test.local` die Rolle Betrachter und prüft
  Audit-Log und Sichtbarkeit, deaktiviert und reaktiviert ihn dann und prüft „Erneut prüfen“;
  `neu@test.local` behält keine Rolle. `katalog-seiten.spec.ts` legt einen Coin an, findet ihn über
  die Suche und prüft als Betrachter und anonym, dass „Coin hinzufügen“ fehlt.
  `coin-ausgaben.spec.ts` vergibt `sachbearbeiter@test.local` und `betrachter@test.local` ihre Rollen,
  legt einen Coin mit Auflage 150 an, erfasst als Sachbearbeiter eine Ausgabe, prüft als Betrachter
  Kennzahlen und Status ohne Ausgabehistorie und storniert die Ausgabe.
  `zertifikatsvorlagen.spec.ts` lädt als Sachbearbeiter auf „Coin hinzufügen“ die Standardvorlage
  herunter, legt einen Coin an, lädt die Datei auf „Coin bearbeiten“ zweimal hoch (Version 1 und 2),
  lädt Version 1 herunter, prüft die Ablehnung einer umbenannten Textdatei und als Betrachter, dass
  „Bearbeiten“ und die Vorlagen-Bedienelemente fehlen.
  `zertifikat-erzeugen.spec.ts` legt als Sachbearbeiter einen Coin mit Auflage 5 an, erfasst eine
  Ausgabe mit Umlauten im Empfängernamen, lädt das Zertifikat aus der Historie und von der Seite
  „Ausgabe“ herunter, prüft den Dateinamen und den Inhalt von `word/document.xml` (Name und Nummer
  vorhanden, kein `{{`; Hilfe `tests/hilfen/docx.ts`), storniert die Ausgabe (Button danach gesperrt)
  und prüft als Betrachter, dass Button und Ausgabe-Seite nicht zugänglich sind.
  `startseite.spec.ts` prüft als Betrachter die Standardblöcke, lädt als Administrator ein im Test
  erzeugtes PNG-Logo (Hilfe `tests/hilfen/png.ts`) mit Alternativtext hoch, schaltet den Kopfbereich
  ein und ändert den Infotext; Betrachter und ein anonymer Besucher sehen Titel und Logo, nur der
  Betrachter auch den Infotext. Danach schaltet er „Kennzahlen“ aus, verschiebt „Meistausgegebene
  Coins“, prüft die Ablehnung einer SVG-Datei und dass der Betrachter keinen Zugang zur Verwaltung
  hat. Am Ende stellt er die Standardwerte wieder her, damit spätere Specs „Willkommen bei C.O.I.N.“ sehen.
  `design-fundament.spec.ts` legt als Administrator einen Coin und eine Ausgabe an und prüft sieben
  Hauptseiten hell und dunkel bei 1280 und 360 px mit axe und auf horizontales Scrollen.
- Die Tests laufen nacheinander (`workers: 1`): Die Specs teilen sich Datenbank und Testkonten,
  `benutzerverwaltung.spec.ts`, `katalog-seiten.spec.ts`, `coin-ausgaben.spec.ts`,
  `zertifikatsvorlagen.spec.ts`, `zertifikat-erzeugen.spec.ts` und `startseite.spec.ts` brauchen `betrachter@test.local`
  (einmal entzogen/deaktiviert, einmal als aktiver Betrachter), und die oberste Audit-Zeile würde
  durch parallele Rollenvergaben verfälscht. Ein Lauf dauert etwa 2 Minuten.
- Laufende Server werden nie wiederverwendet. Ist Port 5182, 5183 oder 5184 belegt, bricht der Lauf ab.
- `global-setup.ts` prüft vor dem ersten Test, dass die Datenbank leer ist (`GET /api/coins` liefert
  eine Seite mit `gesamt: 0` und leeren `eintraege`), sonst bricht der Lauf ab.
- Die Entwicklungsumgebung (DB, Keycloak 8180) und die Dev-Server (5172/5173) bleiben unberührt und
  dürfen parallel laufen. In der Shell gesetzte `ConnectionStrings__CoinDb`, `ASPNETCORE_ENVIRONMENT`
  oder `ASPNETCORE_URLS` werden für die e2e-API überschrieben. Geerbte Variablen der Sektionen
  `Oidc`, `Bootstrap`, `Frontend` und `Authentication` werden in jeder Schreibweise entfernt, auch
  mit Präfix `ASPNETCORE_` oder `DOTNET_`.
- Keycloak braucht im Dev-Modus etwa 10–30 s zum Start, der Lauf dauert entsprechend länger.
- Nach dem Lauf werden die Container gestoppt. Unter Windows wird der API-Prozessbaum per `taskkill`
  beendet; den Container räumt dann in der Praxis Ryuk nach etwa 25 s auf. Bis dahin ist Port 5184
  noch belegt: Vor einem zweiten Lauf direkt danach warten, bis der Port frei ist, sonst bricht der
  Lauf ab.
- Bei der ersten Migration erscheint einmalig ein Logeintrag `fail: …` zu `__ef_migrations_history`
  (die Tabelle existiert in der frischen Datenbank noch nicht). Das ist erwartet und kein Fehler.

Weitere Befehle (in `e2e/`):

```powershell
npm run test:skripte                         # node --test für die Hilfsskripte in scripts/ und die Keycloak-Dateien (compose.yaml, Realm)
node scripts/abnahme-dev-db-unberuehrt.mjs   # Abnahme: Dev-DB vor und nach einem Lauf gleich
```

Das Abnahmeskript braucht die laufende Compose-DB (Container `coin-db-1`), liest dort nur die
Zeilenzahlen von `coin_typ` und `coin_bild` und startet dazwischen einen vollständigen
Playwright-Lauf (Option `--ci` setzt `CI=1`). Es prüft außerdem, dass danach kein
Systemtest-Container mehr läuft und die Ausgabe kein Passwort enthält.
