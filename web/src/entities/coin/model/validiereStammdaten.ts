/** Grenzwerte wie in der Domain (katalog-seiten AK-31, zertifikatsvorlagen AK-22). Maßgeblich bleibt der Server. */
export const NAME_MAX = 200
export const HERAUSGEBER_MAX = 200
export const BESCHREIBUNG_MAX = 2000
export const AUFLAGE_MIN = 1
export const AUFLAGE_MAX = 1_000_000

/** Eingaben der Stammdaten als Formulartext (Auflage als Text, leer = keine Auflage). */
export interface StammdatenEingaben {
  name: string
  herausgeber: string
  auflage: string
  beschreibung: string
}

export type StammdatenFeld = keyof StammdatenEingaben
export type StammdatenFehler = Partial<Record<StammdatenFeld, string>>

export interface StammdatenOptionen {
  /** Auflage ist Pflicht (Bearbeiten eines Coins, der bereits eine Auflage hat; zertifikatsvorlagen AK-22). */
  auflagePflicht?: boolean
}

/** Wandelt die Eingabe der Auflage in eine Zahl um; leer → null, ungültig → undefined. */
export function parseAuflage(auflage: string): number | null | undefined {
  const text = auflage.trim()
  if (text === '') return null
  if (!/^-?\d+$/.test(text)) return undefined
  return Number(text)
}

/**
 * Clientseitige Prüfung der Stammdaten für „Coin hinzufügen“ und „Coin bearbeiten“ (gleiche Texte wie der Server).
 * Liefert nur Einträge für ungültige Felder.
 */
export function validiereStammdaten(eingaben: StammdatenEingaben, optionen: StammdatenOptionen = {}): StammdatenFehler {
  const fehler: StammdatenFehler = {}

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
  } else if (auflage === null) {
    if (optionen.auflagePflicht) fehler.auflage = 'Auflage ist erforderlich.'
  } else if (auflage < AUFLAGE_MIN || auflage > AUFLAGE_MAX) {
    fehler.auflage = `Auflage muss zwischen ${AUFLAGE_MIN} und ${AUFLAGE_MAX} liegen.`
  }

  if (eingaben.beschreibung.trim().length > BESCHREIBUNG_MAX)
    fehler.beschreibung = `Beschreibung darf höchstens ${BESCHREIBUNG_MAX} Zeichen lang sein.`

  return fehler
}
