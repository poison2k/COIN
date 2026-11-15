# ADR-0042: Detailseiten mit Reitern per URL-Suchparameter, Kennzahlen im Kopf

Status: Angenommen (Entscheidungen des Auftraggebers vom 2026-11-14, formulare-detailseiten F1–F5) · Datum: 2026-11-14 · Feature: [formulare-detailseiten](../features/formulare-detailseiten.md) · Ergänzt: [ADR-0010](0010-tanstack-router-code-basiert.md), [ADR-0021](0021-rechte-fuer-exemplare-und-ausgaben.md)

## Kontext
Die Coin-Detailseite stapelt Stammdaten, Exemplare (mit Kennzahlen und Aktionen) und Ausgabehistorie untereinander. Die Zertifikatsvorlage liegt auf „Coin bearbeiten“. Gefordert sind: ein Kopf mit Status-Chips und gebündelten Aktionen, Kennzahlenkarten mit Fortschrittsbalken und Reiter „Stammdaten“, „Exemplare“, „Ausgaben“, „Zertifikatsvorlage“. Die Seite ist teils öffentlich (ADR-0014). Exemplare verlangen `coins.read`, Ausgaben `issues.read` (Personendaten), Vorlagen `coins.write`. Exemplar-Filter und -Seite stehen schon in der URL.

## Entscheidung
1. **Reiter** mit shadcn `tabs` (Base UI), manuelle Aktivierung. Inhalte nicht gewählter Reiter werden nicht gerendert, ihre Anfragen laufen erst beim Öffnen. Personendaten der Historie lädt die Seite also nur, wenn sie gezeigt werden.
2. **URL:**
   - Der Reiter steht im Suchparameter `reiter` (`stammdaten|exemplare|ausgaben|vorlage`) und wird in `coinDetailSuche` geprüft. Unbekannte oder nicht erlaubte Werte gelten als Standard, ohne Fehler und ohne Weiterleitung.
   - Ein Wechsel ersetzt den Verlaufseintrag und behält `status`/`seite`.
   - Nach dem Erfassen einer Ausgabe öffnet die Seite „Ausgaben“ über den vorhandenen History-State, ohne die URL zu ändern.
3. **Sichtbarkeit nur aus `berechtigungen`.** Eine Reiterleiste gibt es erst ab zwei sichtbaren Reitern, ohne `coins.read` bleibt die Seite wie bisher ohne Reiter. Standardreiter mit `coins.read` ist „Exemplare“ (F1), „Stammdaten“ bleibt erster Reiter.
4. **Kennzahlen im Kopf:**
   - Die Seite lädt `GET …/exemplare` einmal je Filter/Seite und gibt die Antwort an die Kennzahlenkarten und an den Reiter „Exemplare“ weiter (`CoinExemplare` kontrolliert). Es bleibt bei genau einer Anfrage.
   - Die Status-Chips werden nur aus Coin und Kennzahlen abgeleitet, ohne neue Fachregel: „Auflage unbekannt“, „Exemplare verfügbar“, „Alle Exemplare ausgegeben“ (F4).
5. **Aktionen** (Auflage ändern, Bearbeiten, Ausgabe erfassen) stehen nur im Seitenkopf. „Ausgabe erfassen“ erscheint nur bei bekannter Auflage und freiem Exemplar (F4). Widgets behalten ihre bisherigen Aktions-Props für andere Verwendungen, die Seite schaltet sie ab.
6. **Zertifikatsvorlage:** Die Verwaltung (`ZertifikatsvorlageVerwalten`) wird Reiter der Detailseite (`coins.write`). „Coin bearbeiten“ enthält nur noch Stammdaten und Motivbild (F2, Variante A).
7. Die Ausgabe-Seite folgt demselben Kopfmuster:
   - Status-Chip, Aktionen „Zertifikat herunterladen“ und „Stornieren“, Abschnitte als Karten.
   - Verlauf als Zeitleiste nur aus vorhandenen Feldern („erfasst“, „storniert“; Hologramm-Korrekturen erst mit Lese-Endpunkt, F3).
   - Bestätigungstexte bleiben wortgleich (F5).

## Betrachtete Alternativen
- **Reiter nur im Komponentenzustand:** kein Direktaufruf, kein Erhalt beim Neuladen, nicht verlinkbar. Verworfen.
- **Alle Reiter gemountet und versteckt (`keepMounted`):** lädt Personendaten ohne Anzeige und hält versteckte Tabellen im DOM. Verworfen.
- **Reiterwechsel als neuer Verlaufseintrag (`push`):** „Zurück“ würde durch Reiter statt Seiten führen. Verworfen.
- **Kennzahlen per eigener Anfrage:** zwei Anfragen auf `…/exemplare` je Aufruf. Verworfen.
- **Standardreiter „Stammdaten“:** entspricht eher der Erwartung „erster Reiter offen“, macht aber deutlich mehr bestehende Tests rot. Verworfen (F1).
- **Zertifikatsvorlage an beiden Orten (Variante B):** keine Testkollision, aber zwei Orte für dieselbe Aufgabe. Verworfen (F2).

## Folgen
- Tests, die Ausgabehistorie und Exemplare gleichzeitig erwarten, öffnen künftig den Reiter (freigegeben, formulare-detailseiten Abschnitt 11, K1–K5).
- Weitere Detailseiten (z. B. eine künftige Benutzer- oder Ausgaben-Übersicht) nutzen dasselbe Muster mit `reiter`.

## Nachtrag (Umsetzung)
- Der Fortschrittsbalken der Kennzahlkarte „Verfügbar“ steht nicht in der `dd`, sondern als zweite Definition des Begriffs in einem `div role="definition"` innerhalb der `dl` (`shared/ui/kennzahl-karte.tsx`). Die `dd` enthält so nur die Zahl, und axe meldet keinen Verstoß gegen „definition-list“, der bei einem weiteren Element ohne Rolle in der `dl` entstünde.
