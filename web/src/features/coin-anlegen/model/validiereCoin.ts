/** Grenzwerte wie in der Domain (AK-2 bis AK-5, AK-11). Maßgeblich bleibt der Server. */
export const NAME_MAX = 200
export const HERAUSGEBER_MAX = 200
export const BESCHREIBUNG_MAX = 2000
export const AUFLAGE_MIN = 1
export const AUFLAGE_MAX = 1_000_000
export const BILD_MAX_BYTES = 5_242_880
export const ERLAUBTE_BILDTYPEN = ['image/jpeg', 'image/png', 'image/webp'] as const

export const MELDUNG_FORMAT = 'Nur JPEG, PNG oder WebP erlaubt.'
export const MELDUNG_ZU_GROSS = 'Bild ist zu groß (max. 5 MB).'

export interface CoinEingaben {
  name: string
  herausgeber: string
  auflage: string
  beschreibung: string
  bild: File | null
}

export type CoinFeld = keyof CoinEingaben
export type CoinFehler = Partial<Record<CoinFeld, string>>

/** Prüft ein Motivbild nach Typ (laut Browser) und Größe. */
export function validiereBild(bild: File): string | undefined {
  if (!(ERLAUBTE_BILDTYPEN as readonly string[]).includes(bild.type)) return MELDUNG_FORMAT
  if (bild.size <= 0) return 'Die Bilddatei ist leer.'
  if (bild.size > BILD_MAX_BYTES) return MELDUNG_ZU_GROSS
  return undefined
}

/** Wandelt die Eingabe der Auflage in eine Zahl um; leer → null, ungültig → undefined. */
export function parseAuflage(auflage: string): number | null | undefined {
  const text = auflage.trim()
  if (text === '') return null
  if (!/^-?\d+$/.test(text)) return undefined
  return Number(text)
}

/** Clientseitige Prüfung aller Felder (AK-31). Liefert nur Einträge für ungültige Felder. */
export function validiereCoin(eingaben: CoinEingaben): CoinFehler {
  const fehler: CoinFehler = {}

  const name = eingaben.name.trim()
  if (name.length === 0) fehler.name = 'Name ist erforderlich.'
  else if (name.length > NAME_MAX) fehler.name = `Name darf höchstens ${NAME_MAX} Zeichen lang sein.`

  const herausgeber = eingaben.herausgeber.trim()
  if (herausgeber.length === 0) fehler.herausgeber = 'Herausgeber ist erforderlich.'
  else if (herausgeber.length > HERAUSGEBER_MAX)
    fehler.herausgeber = `Herausgeber darf höchstens ${HERAUSGEBER_MAX} Zeichen lang sein.`

  const auflage = parseAuflage(eingaben.auflage)
  if (auflage === undefined) {
    fehler.auflage = 'Auflage muss eine ganze Zahl sein.'
  } else if (auflage !== null && (auflage < AUFLAGE_MIN || auflage > AUFLAGE_MAX)) {
    fehler.auflage = `Auflage muss zwischen ${AUFLAGE_MIN} und ${AUFLAGE_MAX} liegen.`
  }

  if (eingaben.beschreibung.trim().length > BESCHREIBUNG_MAX)
    fehler.beschreibung = `Beschreibung darf höchstens ${BESCHREIBUNG_MAX} Zeichen lang sein.`

  if (eingaben.bild) {
    const bildFehler = validiereBild(eingaben.bild)
    if (bildFehler) fehler.bild = bildFehler
  }

  return fehler
}
