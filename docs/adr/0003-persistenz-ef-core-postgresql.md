# ADR-0003: Persistenz mit EF Core und PostgreSQL, Konfiguration ohne Secrets

Status: Angenommen (umgesetzt im Coin-Katalog-Pilot) · Datum: 2026-10-05 · Feature: coin-katalog

## Kontext
CLAUDE.md legt EF Core und PostgreSQL fest. Offen sind Projektzuordnung, Namenskonvention, Migrationsstrategie und wie der Connection-String bereitgestellt wird, ohne Secrets ins Repo zu legen.

## Entscheidung
- `CoinDbContext`, Mappings (`IEntityTypeConfiguration`), Repositories und Migrationen liegen in `Coin.Infrastructure` (Provider `Npgsql.EntityFrameworkCore.PostgreSQL`). Repository-Schnittstellen liegen in `Coin.Domain`.
- Tabellen und Spalten in snake_case (`EFCore.NamingConventions`).
- Code-First-Migrationen mit `dotnet-ef` (Tool-Manifest). Automatisches `MigrateAsync` beim Start nur in den Umgebungen `Development` und `Testing` (Testhost); andere Umgebungen später per Skript/Bundle. Für `dotnet ef migrations add` erzeugt eine Design-Time-Factory den Kontext ohne Zugangsdaten.
- Connection-String `ConnectionStrings:CoinDb` kommt aus User-Secrets oder Umgebungsvariable (`ConnectionStrings__CoinDb`), nie aus eingecheckten `appsettings*.json`. Lokale DB per `compose.yaml`, Passwort aus gitignorierter `.env`.
- Integrationstests nutzen Testcontainers (PostgreSQL), keine In-Memory-Provider.
- Zeitstempel (`erstelltAm`, `hochgeladenAm`) werden in UTC erzeugt und bewusst auf Mikrosekunden gekürzt (`CoinKatalogService`). Grund: `timestamptz` speichert nur Mikrosekunden, .NET rechnet in 100-ns-Ticks. Ohne Kürzung enthielte die Antwort auf `POST` einen genaueren Zeitstempel als ein späteres `GET` desselben Coins.

## Folgen
- Tests laufen gegen dieselbe Datenbank-Engine wie der Betrieb (Constraints, Collation, Ausdrucksindizes).
- Docker ist für Integrations- und Systemtests Voraussetzung.
- Ausdrucksindizes (z. B. `lower(name)`) werden per `migrationBuilder.Sql` angelegt.
- API-Zeitstempel haben höchstens Mikrosekunden-Genauigkeit; POST- und GET-Antworten für denselben Coin sind identisch.
