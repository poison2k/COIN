# ADR-0040: Warnung bei ungespeicherten Änderungen mit TanStack Router und `beforeunload`

Status: Angenommen (Entscheidungen des Auftraggebers vom 2026-11-14, formulare-detailseiten F1–F10) · Datum: 2026-11-14 · Feature: [formulare-detailseiten](../features/formulare-detailseiten.md) · Ergänzt: [ADR-0010](0010-tanstack-router-code-basiert.md), [ADR-0039](0039-formularmuster-und-validierung.md); verallgemeinert startseite AK-32

## Kontext
Bisher sichert nur die Startseiten-Verwaltung das Verlassen ab (`StartseiteVerwaltungRoute`: `useBlocker` mit `withResolver`, `enableBeforeUnload: false`, eigener `beforeunload`-Listener, `AlertDialog` „Ungespeicherte Änderungen“ mit „Bleiben“/„Verlassen“). Jetzt sollen alle Seitenformulare warnen. TanStack Router bietet `useBlocker`. Den Text des Browser-Dialogs beim Neuladen oder Schließen kann keine Webseite festlegen.

## Entscheidung
1. Hook `useVerlassenWarnung({ aktiv, blockiere? })` in `shared/lib/hooks` und Baustein `VerlassenWarnung({ aktiv, beschreibung, blockiere? })` in `shared/ui`.
   - Der Hook nutzt `useBlocker({ shouldBlockFn, withResolver: true, enableBeforeUnload: false })`. Er blockiert nur, solange `aktiv` gilt. Standardmäßig blockiert er nur Wechsel des Pfads, `blockiere(von, nach)` erweitert das (z. B. Reiterwechsel per Suchparameter).
   - Zusätzlich registriert er `beforeunload` (`preventDefault`) nur, solange `aktiv` gilt.
2. Der Dialog ist ein `Bestaetigungsdialog` mit Titel „Ungespeicherte Änderungen“, einer Beschreibung je Formular, „Bleiben“ (Anfangsfokus, auch Escape) und „Verlassen“.
3. `aktiv` kommt aus `useFormular().geaendert`: Mindestens ein Wert weicht vom Ausgangswert ab, eine gewählte Datei zählt als Änderung. Nach erfolgreichem Speichern setzt das Formular `geaendert` zurück, **bevor** es navigiert.
4. Dialog-Formulare (Storno, Hologrammnummer, Auflage) warnen nicht, „Abbrechen“ und Escape sind dort ausdrückliche Entscheidungen.
5. Weiterleitungen der App selbst (Anmeldung nach `401`, „Abmelden“) lösen den Browser-Dialog von `beforeunload` aus. Das ist gewollt, Eingaben können so noch gesichert werden.
6. Die Startseiten-Verwaltung nutzt den Baustein mit ihren bisherigen Texten.

## Betrachtete Alternativen
- **`useBlocker` mit `enableBeforeUnload: true`:** koppelt den Browser-Dialog an `shouldBlockFn` und lässt sich in Tests schlechter isoliert prüfen. Der bestehende, getestete Weg (eigener Listener) wird beibehalten.
- **Eingaben zwischenspeichern (`sessionStorage`) statt warnen:** Empfängerdaten würden im Browser-Speicher liegen. Das widerspricht dem Datenschutz. Verworfen.
- **Warnung auch beim Schließen von Dialogen:** zusätzliche Rückfrage ohne Nutzen. Verworfen.
- **Keine Warnung bei Abbrechen-Link:** „Abbrechen“ nach Änderungen verwirft Eingaben ebenso. Die Warnung gilt einheitlich.

## Folgen
- Neue Seitenformulare binden `VerlassenWarnung` ein. Ohne Änderung erscheint nie ein Dialog.
- Tests, die ein geändertes Formular über die App verlassen, bestätigen künftig mit „Verlassen“. Tests mit `page.goto`/`reload` aus einem geänderten Formular müssen den Browser-Dialog behandeln.

## Nachtrag (Umsetzung)
- `useBlocker` behandelt nur Push und Replace (Links, Sidebar, „Abbrechen“). Für Zurück/Vor gibt es einen zweiten Blocker direkt über `router.history.block`. Er nimmt den Schritt zurück, die URL bleibt stehen, und öffnet den Dialog. Die Weite eines `GO`-Sprungs ergibt sich aus der Differenz von `__TSR_index` im History-State, den `useBlocker` nicht durchreicht. „Verlassen“ wiederholt den Schritt mit `ignoreBlocker`.
- Die Memory-History (Tests) fragt Blocker bei Zurück/Vor nicht. Dafür abonniert der Hook die History (`history.subscribe`) und geht einen ungefragten Schritt selbst zurück.
- Der Hook hängt damit an internen Details von TanStack Router (`__TSR_index`). Ein Router-Update muss `verlassen-warnung.spec.ts` und `verlassen-warnung.test.tsx` erneut bestehen.
- Auf „Coin bearbeiten“ bleibt die Warnung nach dem Speichern der Stammdaten aktiv, solange ein gewähltes Motivbild nicht hochgeladen ist (Entscheidung des Auftraggebers, formulare-detailseiten 4.3).
