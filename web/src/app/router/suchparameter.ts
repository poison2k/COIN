import { istGuid } from '@/shared/lib/guid'

/** Höchstlänge des Suchbegriffs wie in der API (katalog-seiten, AK-4). */
const SUCHE_MAX_LAENGE = 100
/** Höchste Seite, die die API annimmt (int32); größere Werte gelten als Seite 1. */
const SEITE_MAX = 2_147_483_647

/** Suchparameter von /coins. Fehlende Werte heißen: keine Suche bzw. Seite 1. */
export interface KatalogSuche {
  suche?: string
  seite?: number
}

/** Suchparameter von /kein-zugriff; nur der bekannte Grund wird übernommen (katalog-seiten, AK-10). */
export interface KeinZugriffSuche {
  grund?: 'berechtigung'
}

/**
 * Liest Suche und Seite aus der URL, ohne je einen Fehler zu werfen (katalog-seiten, AK-14): Die Seite gilt nur als
 * ganze Zahl von 1 bis 2147483647 (sonst Seite 1), die Suche wird auf 100 Zeichen gekürzt (leer = keine Suche).
 * Beide Schlüssel stehen immer im Ergebnis, weil der Router das Ergebnis über die ungeprüften Werte legt.
 */
export function katalogSuche(roh: Record<string, unknown>): KatalogSuche {
  const text = alsText(roh.suche)?.slice(0, SUCHE_MAX_LAENGE)
  const zahl = typeof roh.seite === 'string' && /^\d+$/.test(roh.seite) ? Number(roh.seite) : roh.seite
  return {
    suche: text !== undefined && text.trim() !== '' ? text : undefined,
    seite: typeof zahl === 'number' && Number.isInteger(zahl) && zahl > 1 && zahl <= SEITE_MAX ? zahl : undefined,
  }
}

/** Reiter der Detailseite (formulare-detailseiten, ADR-0042). */
export type CoinDetailReiterWert = 'stammdaten' | 'exemplare' | 'ausgaben' | 'vorlage'

const REITER: ReadonlyArray<CoinDetailReiterWert> = ['stammdaten', 'exemplare', 'ausgaben', 'vorlage']

/** Suchparameter der Detailseite: Filter und Seite der Exemplare (coin-ausgaben AK-20), Reiter (ADR-0042). */
export interface CoinDetailSuche {
  status?: 'verfuegbar' | 'ausgegeben'
  seite?: number
  reiter?: CoinDetailReiterWert
}

/**
 * Ungültiger Status gilt als „Alle“, ungültige Seite als Seite 1 (AK-20), unbekannter Reiter als Standard
 * (formulare-detailseiten AK-23); wirft nie.
 */
export function coinDetailSuche(roh: Record<string, unknown>): CoinDetailSuche {
  const zahl = typeof roh.seite === 'string' && /^\d+$/.test(roh.seite) ? Number(roh.seite) : roh.seite
  const reiter = REITER.find((wert) => wert === roh.reiter)
  return {
    status: roh.status === 'verfuegbar' || roh.status === 'ausgegeben' ? roh.status : undefined,
    seite: typeof zahl === 'number' && Number.isInteger(zahl) && zahl > 1 && zahl <= SEITE_MAX ? zahl : undefined,
    reiter,
  }
}

/** Suchparameter von /benutzerverwaltung (nacharbeiten-audit-filter 4.4, ADR-0045 Punkt 4). */
export interface BenutzerverwaltungSuche {
  reiter?: 'aenderungsprotokoll'
  /** Kalendertag JJJJ-MM-TT; die Gültigkeit prüft die API. */
  von?: string
  bis?: string
  /** Aktionen kommagetrennt, nur Buchstaben, ohne Doppelte. */
  aktion?: string
  /** GUID des geänderten Benutzers, nie der Name (F1). */
  benutzer?: string
  seite?: number
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/
const AKTION = /^[A-Za-z]+$/

/**
 * Reiter und Filter des Änderungsprotokolls aus der URL; ungültige Werte entfallen, wirft nie. Ob ein Datum gültig ist,
 * ob `von` ≤ `bis` gilt und ob eine Aktion bekannt ist, prüft die API (A4).
 */
export function benutzerverwaltungSuche(roh: Record<string, unknown>): BenutzerverwaltungSuche {
  const datum = (wert: unknown) => (typeof wert === 'string' && DATUM.test(wert) ? wert : undefined)
  const aktionen =
    typeof roh.aktion === 'string' ? [...new Set(roh.aktion.split(',').filter((wert) => AKTION.test(wert)))] : []
  const zahl = typeof roh.seite === 'string' && /^\d+$/.test(roh.seite) ? Number(roh.seite) : roh.seite
  return {
    reiter: roh.reiter === 'aenderungsprotokoll' ? 'aenderungsprotokoll' : undefined,
    von: datum(roh.von),
    bis: datum(roh.bis),
    aktion: aktionen.length > 0 ? aktionen.join(',') : undefined,
    benutzer: typeof roh.benutzer === 'string' && istGuid(roh.benutzer) ? roh.benutzer : undefined,
    seite: typeof zahl === 'number' && Number.isInteger(zahl) && zahl > 1 && zahl <= SEITE_MAX ? zahl : undefined,
  }
}

export function keinZugriffSuche(roh: Record<string, unknown>): KeinZugriffSuche {
  return { grund: roh.grund === 'berechtigung' ? 'berechtigung' : undefined }
}

/** Die URL-Auswertung macht aus „123“ oder „true“ Zahlen bzw. Wahrheitswerte; als Suchbegriff zählt der Text. */
function alsText(wert: unknown): string | undefined {
  if (typeof wert === 'string') return wert
  if (typeof wert === 'number' || typeof wert === 'boolean') return String(wert)
  return undefined
}
