# Branch-Modell (Gitflow)

C.O.I.N. arbeitet nach Gitflow mit reinem Git (ohne die Erweiterung `git-flow`).
Eingeführt am 2026-10-27; der frühere Hauptbranch `master` heißt seitdem `main`.

## Branches

| Branch | Zweig von | Zweck | Rückführung |
|---|---|---|---|
| `main` | – | ausschließlich freigegebene Stände; jeder Stand ist ein Release mit Tag `vX.Y.Z` (SemVer) | – |
| `develop` | `main` | Integrationsbranch; hier landen fertige Features | per Release nach `main` |
| `feature/<name>` | `develop` | ein Feature (Pipeline `/feature`) | `git merge --no-ff` nach `develop` |
| `release/X.Y.Z` | `develop` | nur Fehlerkorrekturen und Versionsnummer | nach `main` mit Tag `vX.Y.Z`, danach zurück nach `develop` |
| `hotfix/<name>` | `main` | dringende Korrektur eines Release | nach `main` mit Tag, danach zurück nach `develop` |

Sonstige Umbauten ohne Fachfunktion (Werkzeuge, Arbeitsweise) laufen wie Features auf einem eigenen
Branch von `develop`, z. B. `chore/<name>`.

## Regeln

- Direkte Commits auf `main` und `develop` sind nicht erlaubt. Der Pre-Commit-Hook
  (`web/.husky/pre-commit`) lehnt sie ab; Merge-Commits (laufender Merge, `MERGE_HEAD` vorhanden)
  sind ausgenommen. Den Hook nie mit `--no-verify` umgehen.
- Rückführungen immer mit `git merge --no-ff`, damit jeder Feature-, Release- und Hotfix-Branch als
  Merge-Commit sichtbar bleibt.
- Release und Hotfix führt ausschließlich ein Mensch durch. Agenten arbeiten nur auf `feature/*`
  (bzw. `chore/*`), mergen nicht selbst nach `develop` und übergeben den fertigen Branch.
- `git push` ist für Agenten gesperrt (`.claude/settings.json`).

## Abläufe (Mensch)

Feature übernehmen:

```sh
git switch develop
git merge --no-ff feature/<name>
```

Release:

```sh
git switch -c release/X.Y.Z develop
# nur Fehlerkorrekturen und Versionsnummer committen
git switch main
git merge --no-ff release/X.Y.Z
git tag -a vX.Y.Z -m "Release X.Y.Z"
git switch develop
git merge --no-ff release/X.Y.Z
```

Hotfix:

```sh
git switch -c hotfix/<name> main
# Korrektur committen, Versionsnummer (Patch) erhöhen
git switch main
git merge --no-ff hotfix/<name>
git tag -a vX.Y.Z -m "Hotfix X.Y.Z"
git switch develop
git merge --no-ff hotfix/<name>
```

Mit Remote vor dem Abzweigen den Ausgangsbranch aktualisieren (`git switch develop` und
`git pull --ff-only`) und danach `main`, `develop` und die Tags pushen (`git push origin main develop --tags`).
