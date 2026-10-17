# ADR-0027: Coin-Kennung und Zertifikatsnummer

Status: Angenommen, umgesetzt (Entscheidungen des Auftraggebers vom 2026-10-16, F1–F4 in `docs/features/zertifikat-erzeugen.md`; Abweichungen unter „Umsetzung“) · Datum: 2026-10-16 · Feature: [zertifikat-erzeugen](../features/zertifikat-erzeugen.md) · Ergänzt: [ADR-0020](0020-exemplare-und-ausgaben-datenmodell.md) Punkt 4, 5 und 9, [ADR-0025](0025-coin-stammdaten-bearbeiten.md)

## Kontext
Jede Ausgabe erhält bei der Erfassung einmalig eine Zertifikatsnummer im Format `<Coin-Kennung>-<Exemplarnummer, vierstellig>`, danach unveränderlich. Ist-Stand:
- `CoinTyp` hat nur `Id` (GUID v7, 36 Zeichen), `Name`, `Herausgeber`, `Auflage`, `Beschreibung`, `ErstelltAm`. Es gibt **keine kurze Kennung**.
- Name und Herausgeber sind seit ADR-0025 änderbar und nur zusammen eindeutig; die Auflage reicht bis 1.000.000 (F9 coin-ausgaben).
- Nach einem Storno wird dasselbe Exemplar wieder vergeben (ADR-0020 Punkt 7).
- `ausgabe` ist per Trigger `trg_ausgabe_nur_storno` unveränderlich bis auf das einmalige Storno (ADR-0020 Punkt 9); der partielle Index `ux_ausgabe_exemplar_aktiv` erlaubt je Exemplar höchstens eine aktive Ausgabe (Punkt 5).
- Später kommen eine öffentliche Prüfseite und Signaturen (requirements, Abschnitt „Zertifikate“). Die Nummer steht auf gedruckten Urkunden und wird von Hand eingegeben.

## Entscheidung
1. **Neue Spalte `coin_typ.kennung`** (`varchar(12)`): `C` und eine laufende Nummer mit mindestens 4 Ziffern und führenden Nullen (`C0001`, `C0042`, `C9999`), ab 10.000 ungekürzt (`C10000`). Check-Constraint `kennung ~ '^C[0-9]{4,}$'`, eindeutiger Index `ux_coin_typ_kennung` (F1).
2. **Vergabe per DB-Sequenz** `coin_kennung_seq` beim Anlegen über die Funktion `coin_kennung_neu()` (`'C' || CASE WHEN n < 10000 THEN lpad(n::text, 4, '0') ELSE n::text END`; `lpad` allein würde ab 5 Stellen kürzen). `CoinKatalogService.AnlegenAsync` holt die Kennung nach der Feldprüfung und **vor** der Duplikatprüfung über `ICoinKatalogRepository.KennungVergebenAsync` (`SELECT coin_kennung_neu()`, also `nextval`) und speichert sie mit dem Coin. Ein abgelehntes Duplikat (`409 coin_existiert`) hat damit bereits eine Nummer verbraucht. Die Funktion ist zusätzlich Spalten-Default von `coin_typ.kennung`; das Repository liest einen per Default vergebenen Wert per `RETURNING` zurück. Dieser Weg greift nur als Absicherung, z. B. bei Inserts per SQL oder einem Aufrufer ohne vorab vergebene Kennung. Kein Request-Feld, keine Eingabe durch Benutzer. **Lücken sind zulässig** (abgelehnte Duplikate, zurückgerollte Transaktionen).
3. **Unveränderlich**: Trigger `trg_coin_typ_kennung_unveraenderlich` (`BEFORE UPDATE`) bricht ab, wenn sich `kennung` ändert. `PUT /api/coins/{id}` ignoriert ein mitgesendetes `kennung`. Die Kennung hängt nicht an Name oder Herausgeber.
4. **Zertifikatsnummer** (`ausgabe.zertifikatsnummer`, `varchar(32)`, Pflicht): `<Kennung>-<Exemplar>`, Exemplar mit mindestens 4 Stellen und führenden Nullen (`C0042-0012`), ab 10.000 ungekürzt (`C0042-12345`, F3). Gebildet in `AusgabeService.ErfassenAsync` unter der Coin-Sperre; gespeichert wird der fertige Text.
5. **Wiederausgabe nach Storno: dieselbe Nummer** (F2). Die neue Ausgabe desselben Exemplars erhält wieder `C0042-0012`; die Nummer gehört damit faktisch zum Exemplar.
   - **Eindeutig unter den aktiven Ausgaben**: partieller eindeutiger Index `ux_ausgabe_zertifikatsnummer_aktiv ON ausgabe (zertifikatsnummer) WHERE storniert_am IS NULL`, angelehnt an `ux_ausgabe_exemplar_aktiv`. Verletzungen übersetzt die Anwendung wie dort in `409 exemplar_ausgegeben`.
   - **Je Ausgabe unveränderlich**: `trg_ausgabe_nur_storno` nimmt `zertifikatsnummer` in die unveränderlichen Spalten auf.
   - Eindeutig zuzuordnen ist ein Zertifikat über die `ausgabe_id`; das Download-Audit führt sie neben der Nummer (ADR-0029).
   - Bewusste Abweichung von „eindeutig“ aus dem Auftrag (Umfang Punkt 1): Der Auftraggeber hat entschieden, dass die Nummer das Exemplar bezeichnet und eine Neuausgabe sie übernimmt. Begründung: die Urkunde bleibt beim Exemplar, die Nummer ist kurz und vorhersagbar, kein Zusatz auf dem Ausdruck.
6. **Migration `Zertifikatsnummern`**: legt Sequenz und Funktion an, vergibt bestehenden Coins Kennungen nach `erstellt_am`, dann `id` (`C0001`, …), setzt die Sequenz auf den höchsten Wert und gibt jeder bestehenden Ausgabe, auch stornierten, `<Kennung>-<Exemplar>` (F4). Erst danach `NOT NULL`, Indizes und Trigger. `Down` entfernt Spalten, Indizes, Trigger, Funktion und Sequenz und stellt die alte Trigger-Funktion wieder her.
7. Die Kennung erscheint nicht im öffentlichen Coin-DTO (sieben Felder bleiben, ADR-0025 Punkt 7); die Zertifikatsnummer nur in Ausgabe-Antworten (`issues.read`/`issues.write`).

## Betrachtete Optionen
| Thema | Option | Bewertung |
|---|---|---|
| Kennung | Coin-GUID | eindeutig und stabil, aber 36 Zeichen, auf einer Urkunde unlesbar, verworfen |
| | aus dem Namen abgeleitet (Kürzel) | nicht eindeutig, ändert sich mit dem Namen (ADR-0025), verworfen |
| | von Benutzern vergeben (z. B. `EKB25`) | Pflichtfeld, Eindeutigkeitsprüfung, Eingabe-UI; Fehleingaben bleiben für immer, verworfen |
| | zufälliger Base32-Code (`7KQ2MX`) | nicht ableitbar, aber schlechter vorzulesen und zu sortieren; vom Auftraggeber verworfen (F1) |
| | **`C` + laufende Nummer (gewählt)** | kurz, lesbar, sortierbar, eindeutig per Sequenz und Index; verrät Anzahl und Reihenfolge der Coins – vom Auftraggeber akzeptiert |
| Vergabe | Anwendung ermittelt `max + 1` | braucht globale Sperre, sonst Kollisionen, verworfen |
| | **DB-Sequenz (gewählt)** | nebenläufig sicher ohne Sperre; Lücken sind zulässig |
| Wiederausgabe | Folgezusatz `-2`, `-3` | eindeutig über alle Ausgaben, aber zusätzlicher Bestandteil; vom Auftraggeber verworfen (F2) |
| | Wiederausgabe stornierter Exemplare verbieten | widerspricht ADR-0020 Punkt 7, verworfen |
| | **gleiche Nummer, eindeutig unter aktiven Ausgaben (gewählt)** | Nummer bezeichnet das Exemplar; Zuordnung über `ausgabe_id` |
| Speicherort | eigene Tabelle `zertifikat` | erst mit Signatur sinnvoll, verworfen |
| | **Spalte an `ausgabe` (gewählt)** | Unveränderlichkeit über den bestehenden Trigger |

## Folgen
- **Restrisiko für die spätere Prüfseite:** Ein Zertifikat einer stornierten Ausgabe und das der Neuausgabe tragen dieselbe Nummer. Weil Downloads stornierter Ausgaben gesperrt sind, ist künftig nur das der aktiven Ausgabe erzeugbar; ältere Ausdrucke lassen sich ohne Prüfseite (und Signatur) nicht vom aktuellen unterscheiden. Die Prüfseite muss deshalb mehr als die Nummer prüfen (z. B. Signatur über `ausgabe_id` oder Ausgabedatum) und darf eine stornierte Ausgabe nicht als gültig ausweisen.
- Über alle Ausgaben (auch stornierte) ist die Nummer nicht eindeutig; Auswertungen und Audit verwenden `ausgabe_id`.
- Die Kennung verrät, wie viele Coins angelegt wurden und in welcher Reihenfolge (akzeptiert). Lücken in der Folge sind kein Fehler.
- Nummern über 9999 haben mehr Stellen und sortieren als Text nicht numerisch; Sortierungen laufen über Exemplarnummer und Erfassungszeit.
- Die Zertifikatsnummer ist kein Echtheitsnachweis; das leistet erst die spätere Signatur.

## Umsetzung
- **Abweichung von Punkt 2 in der ersten Fassung:** Vorgesehen war die Vergabe allein über den Spalten-Default beim Einfügen. Umgesetzt vergibt der Katalog-Service die Kennung vorab (`KennungVergebenAsync`), damit AK-1 („ein `409 coin_existiert` verbraucht eine Nummer“) unabhängig davon gilt, ob die Vorabprüfung oder erst der eindeutige Index das Duplikat erkennt. Der Default bleibt als Absicherung. Punkt 2 beschreibt den umgesetzten Stand.
- Migration `20261017001806_Zertifikatsnummern` mit Check `ck_coin_typ_kennung`, Index `ux_coin_typ_kennung`, Trigger `trg_coin_typ_kennung_unveraenderlich`, Index `ux_ausgabe_zertifikatsnummer_aktiv` und erweiterter Trigger-Funktion `ausgabe_nur_storno()`; während der Befüllung bestehender Ausgaben ist `trg_ausgabe_nur_storno` kurz deaktiviert.
- Die Kennung erscheint in der Oberfläche nur als Teil der Zertifikatsnummer (Ausgabehistorie, Seite „Ausgabe“), nicht auf Katalog- oder Detailseite.
