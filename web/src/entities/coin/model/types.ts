/** Ein Coin aus dem Katalog, wie ihn die API liefert. */
export interface Coin {
  id: string
  name: string
  herausgeber: string
  auflage: number | null
  beschreibung: string | null
  /** ISO-8601-Zeitstempel in UTC. */
  erstelltAm: string
  /** Versionierte URL des Motivbilds oder null. */
  bildUrl: string | null
}

/** Daten zum Anlegen eines Coins (POST /api/coins). */
export interface CoinAnlegen {
  name: string
  herausgeber: string
  auflage: number | null
  beschreibung: string | null
}
