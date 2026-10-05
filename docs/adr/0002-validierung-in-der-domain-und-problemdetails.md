# ADR-0002: Validierung in der Domain, Fehler als ProblemDetails

Status: Angenommen (umgesetzt im Coin-Katalog-Pilot) · Datum: 2026-10-05 · Feature: coin-katalog

## Kontext
Eingaben (z. B. Coin-Felder) müssen geprüft werden. Optionen: DataAnnotations an DTOs, FluentValidation in der API, oder Invarianten in der Domain. Die Domain darf keine Abhängigkeiten nach außen haben. Fehler sollen einheitlich und maschinenlesbar zurückgegeben werden.

## Entscheidung
- Fachliche Regeln (Pflichtfelder, Längen, Wertebereiche, Trimmen) leben in der Domain-Entität: Erzeugung nur über eine Fabrikmethode (z. B. `CoinTyp.Erstellen`), die ein Ergebnisobjekt mit **allen** Fehlern zurückgibt (Schlüssel = camelCase-Feldname, deutsche Meldung). Keine Exceptions für erwartbare Validierungsfehler; keine Fremdbibliothek.
- Request-DTOs haben nullable Felder ohne eigene Validierungsattribute, damit es nur eine Quelle der Regeln gibt.
- Die API gibt Fehler als RFC-9457-ProblemDetails (`application/problem+json`) zurück: 400 `ValidationProblemDetails` mit `errors` und Titel „Eingaben ungültig“, 404/409/413/415 ProblemDetails, 500 ohne interne Details (`AddProblemDetails`, `UseExceptionHandler`, `UseStatusCodePages`).
- Eindeutigkeitsregeln werden zusätzlich durch DB-Constraints abgesichert.

## Folgen
- Regeln sind ohne Infrastruktur per Unit-Test prüfbar.
- Grenzwerte als Konstanten in der Domain werden von EF-Mapping und Tests wiederverwendet.
- Das Frontend dupliziert die einfachen Regeln für sofortiges Feedback; maßgeblich bleibt der Server.
