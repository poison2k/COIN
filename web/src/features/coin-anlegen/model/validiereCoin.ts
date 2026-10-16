import { validiereBild, validiereStammdaten, type StammdatenEingaben, type StammdatenFehler } from '@/entities/coin'

export interface CoinEingaben extends StammdatenEingaben {
  bild: File | null
}

export type CoinFeld = keyof CoinEingaben
export type CoinFehler = StammdatenFehler & { bild?: string }

/** Clientseitige Prüfung aller Felder beim Anlegen (AK-31): Stammdaten und Motivbild. */
export function validiereCoin(eingaben: CoinEingaben): CoinFehler {
  const fehler: CoinFehler = validiereStammdaten(eingaben)
  if (eingaben.bild) {
    const bildFehler = validiereBild(eingaben.bild)
    if (bildFehler) fehler.bild = bildFehler
  }
  return fehler
}
