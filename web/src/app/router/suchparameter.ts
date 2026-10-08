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

export function keinZugriffSuche(roh: Record<string, unknown>): KeinZugriffSuche {
  return { grund: roh.grund === 'berechtigung' ? 'berechtigung' : undefined }
}

/** Die URL-Auswertung macht aus „123“ oder „true“ Zahlen bzw. Wahrheitswerte; als Suchbegriff zählt der Text. */
function alsText(wert: unknown): string | undefined {
  if (typeof wert === 'string') return wert
  if (typeof wert === 'number' || typeof wert === 'boolean') return String(wert)
  return undefined
}
