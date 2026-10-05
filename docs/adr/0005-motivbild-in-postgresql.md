# ADR-0005: Motivbilder als bytea in PostgreSQL

Status: Angenommen · Datum: 2026-10-05 · Feature: coin-katalog

## Kontext
Coins erhalten ein optionales Motivbild (JPEG/PNG/WebP, max. 5 MiB). Speicheroptionen: Spalte `bytea` in PostgreSQL, lokales Dateisystem oder Blob-Speicher (z. B. S3-kompatibel). Der Betriebsort ist laut `docs/requirements.md` noch offen (lokal, Intranet, Cloud). Die Anzahl der Coin-Typen ist überschaubar (Katalog, nicht Massendaten).

## Entscheidung
- Bilder werden als `bytea` in einer eigenen Tabelle `coin_bild` (1:0..1 zu `coin_typ`, Cascade Delete) gespeichert, zusammen mit erkanntem Format, SHA-256 und Größe.
- Listen- und Einzelabfragen lesen nur Metadaten, nie die Bildbytes. Die Bytes liefert ausschließlich `GET /api/coins/{id}/bild`.
- Kein Dateisystem- oder Blob-Speicher im Pilot.

## Folgen
- Keine zusätzliche Infrastruktur und keine Vorentscheidung zum Betriebsort; Backup und Transaktionen umfassen Bilder automatisch; keine verwaisten Dateien.
- Integrationstests mit Testcontainers decken die Bildspeicherung vollständig ab.
- Kein Pfad aus Benutzereingaben, keine Dateiausführung möglich.
- Die DB wächst um die Bildgrößen; bei 5 MiB pro Coin und einem Katalog im Bereich von Tausenden Einträgen vertretbar. Wird es zu groß oder kommen viele Bilder hinzu, lässt sich die Speicherung hinter der Repository-Schnittstelle in einen Blob-Speicher verlagern, ohne API oder Domain zu ändern.
- Auslieferung über die API (kein CDN); durch versionierte URLs (`?v=<hash>`) und `Cache-Control: immutable` bleibt die Last gering.
