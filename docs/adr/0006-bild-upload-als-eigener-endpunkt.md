# ADR-0006: Bild-Upload über eigenen Endpunkt statt multipart-Anlage

Status: Angenommen · Datum: 2026-10-05 · Feature: coin-katalog

## Kontext
Ein Coin kann ein Motivbild haben. Entweder wird der Coin samt Bild in einem `multipart/form-data`-POST angelegt (atomar), oder der Coin wird per JSON angelegt und das Bild über einen eigenen Endpunkt hochgeladen.

## Entscheidung
- `POST /api/coins` bleibt reines JSON.
- Das Bild wird über `PUT /api/coins/{id}/bild` (multipart/form-data, Feld `datei`) gesetzt oder ersetzt und über `GET /api/coins/{id}/bild` ausgeliefert.
- Die Oberfläche ruft nacheinander POST und PUT auf. Schlägt nur der Upload fehl, meldet sie den Teilerfolg und bietet „Bild erneut hochladen“ für denselben Coin an.

### Upload-Grenzen
Zu große Uploads sollen immer mit `413` als ProblemDetails beantwortet werden, nicht mit `400` oder einem Verbindungsabbruch ohne Status. Mit Model Binding bzw. `ReadFormAsync` und einem engen `[RequestSizeLimit]` war das nicht zuverlässig: Überschreitungen beim Lesen des Formulars wurden zu `400`, und bei ungelesenem Rest über dem Kestrel-Limit kann Kestrel die Verbindung ohne Antwort schließen. Deshalb:
- Die Aktion liest das Formular selbst mit `MultipartDateiLeser` (`Coin.Api/Http/MultipartDateiLeser.cs`) auf Basis von `MultipartReader`. `[FormularBindungDeaktivieren]` entfernt die Formular-Value-Provider, damit das Model Binding den Body nicht vorab liest.
- Der Leser liest höchstens 6 MiB Request-Body (`MaxRequestBytes`: 5 MiB Datei plus Overhead für Boundaries und Header). Ein `Content-Length` über 6 MiB, mehr gelesene Bytes (auch chunked) oder eine Datei über 5 MiB ergeben `413`. Danach liest er nicht weiter.
- Höchstens 16 Formularabschnitte (`MaxAbschnitte`); mehr, fehlende oder mehrere Dateien im Feld `datei` sowie abgeschnittene oder fehlerhafte Formulare ergeben `400` mit Schlüssel `datei`. Nur echte Größenüberschreitungen sind `413`.
- `[RequestSizeLimit]` der Aktion liegt bewusst höher bei 32 MiB. Nach der `413`-Antwort verwirft (drained) Kestrel den ungelesenen Rest bis zu dieser Grenze zeitlich begrenzt, sodass der Client die Antwort erhält, statt dass die Verbindung abbricht. Die fachliche 5-MiB-Grenze prüft zusätzlich die Domain (`CoinBild.MaxGroesseBytes`).

## Folgen
- Einfacher JSON-Vertrag und einfache Tests für die Coin-Anlage; Validierungsfehler von Feldern und Bild sind sauber getrennt (400 vs. 413/415).
- Der Endpunkt ist für das spätere Bearbeiten (Bild ersetzen) direkt wiederverwendbar.
- Nicht atomar: Ein Coin kann ohne Bild entstehen, wenn der Upload scheitert. Das wird durch Client-Vorprüfung (Typ, Größe) minimiert und in der UI behandelt (AK-34). Ein Coin ohne Bild ist fachlich gültig.
- Eigener Multipart-Leser bedeutet eigenen Code mit Integrationstests (abgeschnittene Formulare, viele Felder, chunked Uploads über echtes Kestrel), statt der Framework-Formularverarbeitung.
- Bis 32 MiB nimmt der Server Daten an und verwirft sie (Bandbreite, begrenzt durch Drain-Timeout). Bei Requests über 32 MiB kann der Client weiterhin einen Verbindungsabbruch statt `413` sehen; das ist akzeptiert.
