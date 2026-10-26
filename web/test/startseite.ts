import type { KopfAnsicht, Konfiguration, StartseiteAnsicht } from '@/entities/startseite'

// Testhilfen Feature startseite (Abschnitt 5.2, 5.2a, 5.3): synthetische Antworten der Startseiten-API, ohne echte
// Personendaten. Die Typen kommen aus entities/startseite (nur Typen, zur Laufzeit entfernt).

/** Ein Block aus `GET /api/startseite`. */
export type Block = StartseiteAnsicht['bloecke'][number]

export const STANDARD_TITEL = 'C.O.I.N.'
export const STANDARD_UNTERTITEL = 'Certified Official Issue Numbering'
export const STANDARD_INFOTEXT =
  'C.O.I.N. verwaltet die Gedenk-Coins der Bundeswehr: den Katalog der Coins, ihre nummerierten Exemplare und die Echtheitszertifikate.'

/** Deutsche Blocknamen (AK-21, AK-27, BLOCK_NAMEN). */
export const BLOCK_NAMEN = {
  kopf: 'Kopfbereich',
  infotext: 'Infotext',
  kennzahlen: 'Kennzahlen',
  neueste: 'Neueste Coins',
  meistausgegeben: 'Meistausgegebene Coins',
} as const

export type BlockArt = keyof typeof BLOCK_NAMEN

export const STANDARD_REIHENFOLGE: BlockArt[] = ['kopf', 'infotext', 'kennzahlen', 'neueste', 'meistausgegeben']

/** Logo-Angaben im Format von 5.2/5.2a. */
export function testLogo(platz: 'bereitsteller' | 'software', teil: Record<string, unknown> = {}) {
  return {
    url: `/api/startseite/logos/${platz}?v=0123456789abcdef`,
    alternativtext: platz === 'bereitsteller' ? 'Wappen des Testverbands' : 'Logo der Testsoftware',
    breite: 400,
    hoehe: 200,
    ...teil,
  }
}

/** Logo-Metadaten im Format von 5.3. */
export function testLogoMeta(platz: 'bereitsteller' | 'software', teil: Record<string, unknown> = {}) {
  return { ...testLogo(platz), format: 'png', groesseBytes: 51234, ...teil }
}

export function kopfBlock(teil: Record<string, unknown> = {}): Block {
  return {
    art: 'kopf',
    titel: STANDARD_TITEL,
    untertitel: STANDARD_UNTERTITEL,
    logoBereitsteller: null,
    logoSoftware: null,
    ...teil,
  } as unknown as Block
}

export function infotextBlock(text = STANDARD_INFOTEXT): Block {
  return { art: 'infotext', text } as unknown as Block
}

export function kennzahlenBlock(
  teil: Partial<Record<'coins' | 'exemplare' | 'ausgegeben' | 'verfuegbar', number>> = {},
): Block {
  return { art: 'kennzahlen', coins: 3, exemplare: 450, ausgegeben: 12, verfuegbar: 438, ...teil } as unknown as Block
}

/** Synthetischer Eintrag für „Neueste Coins“ (Id endet auf die Nummer). */
export function neuerCoin(nummer: number, teil: Record<string, unknown> = {}) {
  return {
    id: `0199a1b2-0000-7000-8000-${String(nummer).padStart(12, '0')}`,
    name: `Coin Neu ${nummer}`,
    herausgeber: `Herausgeber ${nummer}`,
    bildUrl: null,
    ...teil,
  }
}

/** Synthetischer Eintrag für „Meistausgegebene Coins“. */
export function topCoin(nummer: number, ausgegeben: number, teil: Record<string, unknown> = {}) {
  return {
    id: `0199a1b2-0000-7000-8000-${String(nummer).padStart(12, '9')}`,
    name: `Coin Top ${nummer}`,
    herausgeber: `Herausgeber ${nummer}`,
    ausgegeben,
    ...teil,
  }
}

export function neuesteBlock(eintraege = [neuerCoin(1), neuerCoin(2)]): Block {
  return { art: 'neueste', eintraege } as unknown as Block
}

export function meistausgegebenBlock(eintraege = [topCoin(1, 7), topCoin(2, 5)]): Block {
  return { art: 'meistausgegeben', eintraege } as unknown as Block
}

/** Antwort von `GET /api/startseite`; ohne Angabe die Standardblöcke (AK-1) mit Testdaten. */
export function testStartseite(bloecke?: Block[]): StartseiteAnsicht {
  return {
    bloecke: bloecke ?? [infotextBlock(), kennzahlenBlock(), neuesteBlock(), meistausgegebenBlock()],
  } as StartseiteAnsicht
}

/** Antwort von `GET /api/startseite/kopf` (5.2a); ohne Angabe inaktiv an Position 1. */
export function testKopf(teil: Record<string, unknown> = {}): KopfAnsicht {
  return { aktiv: false, position: 1, ...teil } as unknown as KopfAnsicht
}

/** Aktiver Kopf (5.2a). */
export function aktiverKopf(teil: Record<string, unknown> = {}): KopfAnsicht {
  return testKopf({
    aktiv: true,
    titel: 'Testverband Gedenkmünzen',
    untertitel: 'Untertitel des Testverbands',
    logoBereitsteller: testLogo('bereitsteller'),
    logoSoftware: null,
    ...teil,
  })
}

/** Antwort von `GET /api/startseite/konfiguration` (5.3); ohne Angabe die Standardkonfiguration. */
export function testKonfiguration(teil: Record<string, unknown> = {}): Konfiguration {
  return {
    version: 0,
    standard: true,
    geaendertAm: null,
    geaendertVon: null,
    reihenfolge: [...STANDARD_REIHENFOLGE],
    kopf: {
      aktiv: false,
      titel: STANDARD_TITEL,
      untertitel: STANDARD_UNTERTITEL,
      logoBereitsteller: null,
      logoSoftware: null,
    },
    infotext: { aktiv: true, text: STANDARD_INFOTEXT },
    kennzahlen: { aktiv: true },
    neueste: { aktiv: true, anzahl: 6 },
    meistausgegeben: { aktiv: true, anzahl: 5 },
    daten: {
      kennzahlen: { coins: 14, exemplare: 1250, ausgegeben: 37, verfuegbar: 1213 },
      neueste: Array.from({ length: 12 }, (_, i) => neuerCoin(i + 1)),
      meistausgegeben: Array.from({ length: 10 }, (_, i) => topCoin(i + 1, 20 - i)),
    },
    ...teil,
  } as unknown as Konfiguration
}

/** Gespeicherte Konfiguration (Version 3) mit `geaendertAm`/`geaendertVon`. */
export function gespeicherteKonfiguration(teil: Record<string, unknown> = {}): Konfiguration {
  return testKonfiguration({
    version: 3,
    standard: false,
    geaendertAm: '2026-10-19T08:00:00Z',
    geaendertVon: 'Test Administrator',
    ...teil,
  })
}

/** Die vom Formular gesendete Konfiguration (Teil `konfiguration` des FormData, 5.4). */
export function konfigurationAus(body: unknown): Record<string, unknown> {
  if (!(body instanceof FormData)) throw new Error('Der Request-Body ist kein FormData.')
  const teil = body.get('konfiguration')
  const text = typeof teil === 'string' ? teil : null
  if (text === null) throw new Error('Teil „konfiguration“ fehlt oder ist kein Text.')
  return JSON.parse(text) as Record<string, unknown>
}

/** Die Namen aller Teile eines FormData in Reihenfolge. */
export function teileVon(body: unknown): string[] {
  if (!(body instanceof FormData)) throw new Error('Der Request-Body ist kein FormData.')
  return [...body.keys()]
}
