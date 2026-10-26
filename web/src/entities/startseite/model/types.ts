// Typen der Startseiten-API (Feature startseite, Abschnitt 5.2, 5.2a, 5.3). Ohne Personendaten; `geaendertVon` gibt es
// nur in der Konfiguration (startpage.manage, S11).

/** Die fünf festen Blöcke (Abschnitt 1). */
export type BlockArt = 'kopf' | 'infotext' | 'kennzahlen' | 'neueste' | 'meistausgegeben'

/** Logo-Plätze des Kopfbereichs. */
export type LogoPlatz = 'bereitsteller' | 'software'

/** Standardreihenfolge (AK-1). */
export const BLOCK_ARTEN: readonly BlockArt[] = ['kopf', 'infotext', 'kennzahlen', 'neueste', 'meistausgegeben']

export const LOGO_PLAETZE: readonly LogoPlatz[] = ['bereitsteller', 'software']

/** Deutsche Blocknamen (AK-21, AK-27). */
export const BLOCK_NAMEN: Readonly<Record<BlockArt, string>> = {
  kopf: 'Kopfbereich',
  infotext: 'Infotext',
  kennzahlen: 'Kennzahlen',
  neueste: 'Neueste Coins',
  meistausgegeben: 'Meistausgegebene Coins',
}

/** Beschriftung der Logo-Plätze (AK-27). */
export const LOGO_NAMEN: Readonly<Record<LogoPlatz, string>> = {
  bereitsteller: 'Logo des Bereitstellers',
  software: 'Logo der Software',
}

/** Logo in öffentlichen Antworten. `breite`/`hoehe` fehlen nur bei einer lokalen Vorschau (Object-URL). */
export interface Logo {
  url: string
  alternativtext: string
  breite?: number
  hoehe?: number
}

/** Logo-Metadaten in der Konfiguration (5.3). */
export interface LogoMeta extends Logo {
  format: string
  breite: number
  hoehe: number
  groesseBytes: number
}

export interface Kennzahlen {
  coins: number
  exemplare: number
  ausgegeben: number
  verfuegbar: number
}

export interface NeuerCoin {
  id: string
  name: string
  herausgeber: string
  bildUrl: string | null
}

export interface AusgegebenerCoin {
  id: string
  name: string
  herausgeber: string
  ausgegeben: number
}

export interface KopfBlock {
  art: 'kopf'
  titel: string
  untertitel: string
  logoBereitsteller: Logo | null
  logoSoftware: Logo | null
}

export interface InfotextBlock {
  art: 'infotext'
  text: string
}

export interface KennzahlenBlock extends Kennzahlen {
  art: 'kennzahlen'
}

export interface NeuesteBlock {
  art: 'neueste'
  eintraege: NeuerCoin[]
}

export interface MeistausgegebenBlock {
  art: 'meistausgegeben'
  eintraege: AusgegebenerCoin[]
}

export type Block = KopfBlock | InfotextBlock | KennzahlenBlock | NeuesteBlock | MeistausgegebenBlock

/** `GET /api/startseite` (5.2): nur aktive Blöcke in gespeicherter Reihenfolge. */
export interface StartseiteAnsicht {
  bloecke: Block[]
}

/** `GET /api/startseite/kopf` (5.2a, öffentlich): Texte und Logos nur bei aktivem Kopfbereich. */
export type KopfAnsicht =
  | {
      aktiv: true
      position: number
      titel: string
      untertitel: string
      logoBereitsteller: Logo | null
      logoSoftware: Logo | null
    }
  | { aktiv: false; position: number }

/** `GET /api/startseite/konfiguration` (5.3). */
export interface Konfiguration {
  version: number
  standard: boolean
  geaendertAm: string | null
  geaendertVon: string | null
  reihenfolge: BlockArt[]
  kopf: {
    aktiv: boolean
    titel: string
    untertitel: string
    logoBereitsteller: LogoMeta | null
    logoSoftware: LogoMeta | null
  }
  infotext: { aktiv: boolean; text: string }
  kennzahlen: { aktiv: boolean }
  neueste: { aktiv: boolean; anzahl: number }
  meistausgegeben: { aktiv: boolean; anzahl: number }
  daten: { kennzahlen: Kennzahlen; neueste: NeuerCoin[]; meistausgegeben: AusgegebenerCoin[] }
}

/** Grenzen laut Abschnitt 5.5 (S10); maßgeblich bleibt der Server. */
export const TITEL_MAX = 100
export const UNTERTITEL_MAX = 200
export const INFOTEXT_MAX = 5000
export const ALTTEXT_MAX = 200
/** 2 MiB (Annahme A1). */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_MAX_PIXEL = 2048
export const ANZAHL_GRENZEN = {
  neueste: { min: 3, max: 12 },
  meistausgegeben: { min: 3, max: 10 },
} as const
