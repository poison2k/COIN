# ADR-0001: Controller statt Minimal API

Status: Angenommen (umgesetzt im Coin-Katalog-Pilot) · Datum: 2026-10-05 · Feature: coin-katalog

## Kontext
Die API wird mit ASP.NET Core (.NET 10) gebaut. Zur Wahl stehen Controller (`[ApiController]`) und Minimal APIs. CLAUDE.md formuliert bereits die Konvention „keine Logik in Controllern“. Es folgen viele Ressourcen (Coins, Exemplare, Verleihungen, Zertifikate) mit Rollen-Policies und einheitlichen Fehlerantworten.

## Entscheidung
Wir verwenden Controller mit `[ApiController]` unter `Coin.Api/Controllers`, eine Klasse pro Ressource. Controller-Aktionen bilden nur DTOs auf Domain-Service-Aufrufe und Ergebnisse auf HTTP-Statuscodes ab. Fachlogik liegt in `Coin.Domain`.

## Folgen
- Passt zur bestehenden Konvention in CLAUDE.md; für Agenten und Reviewer eindeutige Struktur.
- `[ApiController]` liefert automatische `ValidationProblemDetails` bei Bindungsfehlern (kaputtes JSON, falsche Typen). Die Antwort wird über eine eigene `InvalidModelStateResponseFactory` (`Coin.Api/Http/UngueltigeAnfrageAntwort.cs`) vereinheitlicht: Titel „Eingaben ungültig“, camelCase-Feldnamen statt JSON-Pfaden, keine technischen Meldungen; nicht zuordenbare Fehler unter dem Schlüssel `anfrage`.
- Autorisierung später einfach per `[Authorize(Policy = ...)]` pro Controller/Aktion.
- Etwas mehr Overhead als Minimal API; für diesen Umfang unerheblich.
