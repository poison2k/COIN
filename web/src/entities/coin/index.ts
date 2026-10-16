export type { Coin, CoinAendern, CoinAnlegen } from './model/types'
export { aendereAuflage, aendereCoin, ladeBildHoch, ladeCoin, ladeCoins, legeCoinAn, type CoinSuche } from './api/coins'
export {
  AUFLAGE_MAX,
  AUFLAGE_MIN,
  BESCHREIBUNG_MAX,
  HERAUSGEBER_MAX,
  NAME_MAX,
  parseAuflage,
  validiereStammdaten,
  type StammdatenEingaben,
  type StammdatenFehler,
  type StammdatenFeld,
  type StammdatenOptionen,
} from './model/validiereStammdaten'
export {
  BILD_MAX_BYTES,
  ERLAUBTE_BILDTYPEN,
  HINWEIS_BILD_FORMATE,
  HINWEIS_BILD_METADATEN,
  MELDUNG_BILD_FORMAT,
  MELDUNG_BILD_ZU_GROSS,
  validiereBild,
} from './model/validiereBild'
export { CoinListe, type CoinListeProps } from './ui/CoinListe'
export { CoinStammdaten, type CoinStammdatenProps } from './ui/CoinStammdaten'
