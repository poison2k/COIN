---
description: Entwickelt ein Feature über die Agenten-Pipeline (Entwurf, Tests, Umsetzung, Review, Doku)
argument-hint: <Beschreibung des Features>
---
Setze das folgende Feature um: $ARGUMENTS

Arbeite die Pipeline strikt in dieser Reihenfolge ab und nutze jeweils den genannten Subagenten:

1. Lege einen neuen Git-Branch `feature/<kurzer-name>` von `develop` an (Gitflow, `docs/branching.md`). Ist ein Remote konfiguriert, vorher `develop` aktualisieren (`git switch develop`, `git pull --ff-only`). Nie von `main` abzweigen.
2. **architect**: Entwurf mit nummerierten Akzeptanzkriterien nach `docs/features/<name>.md`. Offene Fragen an mich stellen und auf Antwort warten, bevor es weitergeht.
3. **tester**: Tests zu den Akzeptanzkriterien schreiben (Unit, Integration, wo sinnvoll System). Bestätigen, dass sie aus dem richtigen Grund fehlschlagen.
4. **developer**: Implementieren, bis Build und alle Tests grün sind.
5. **qa-reviewer**: Review. Bei Findings "kritisch" oder "wichtig" zurück zu Schritt 4 (höchstens 3 Durchläufe, danach mir berichten).
6. **docs**: Dokumentation aktualisieren.
7. Alles committen (sinnvolle Commit-Nachrichten). Nicht pushen. Jeder Commit läuft durch den Pre-Commit-Hook (`web/.husky/pre-commit`: lint + test) – den Hook nie mit `--no-verify` umgehen.
8. Nicht selbst nach `develop` (oder `main`) mergen. Den fertigen Branch `feature/<kurzer-name>` übergeben; die Rückführung mit `git merge --no-ff` macht der Mensch.

Gib am Ende eine kurze Zusammenfassung: Was wurde gebaut, Teststand, offene Punkte.
