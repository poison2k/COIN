import { formatiereZeitpunkt } from '@/shared/lib/format'

/** Eine gespeicherte Version der Zertifikatsvorlage (zertifikatsvorlagen, Abschnitt 5.3). */
export interface VorlagenVersion {
  version: number
  /** Größe der bereinigten Fassung in Bytes. */
  groesseBytes: number
  /** ISO-8601-Zeitstempel. */
  hochgeladenAm: string
  hochgeladenVon: { id: string; name: string }
  aktiv: boolean
}

/** Vorlagenstatus eines Coins: Standardvorlage oder eigene Version, alle Versionen neueste zuerst. */
export interface VorlagenStatus {
  quelle: 'standard' | 'eigene'
  aktiveVersion: number | null
  versionen: VorlagenVersion[]
}

const KB_FORMAT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

/** Datum und Uhrzeit nach Europe/Berlin (`TT.MM.JJJJ, HH:MM Uhr`, R7); ungültige Werte unverändert. */
export function zeitpunktAnzeige(zeitpunkt: string): string {
  return formatiereZeitpunkt(zeitpunkt) || zeitpunkt
}

/** Größe in kB (1 kB = 1024 Bytes) im Format de-DE, z. B. „47,1 kB“. */
export function groesseAnzeige(bytes: number): string {
  return `${KB_FORMAT.format(bytes / 1024)} kB`
}
