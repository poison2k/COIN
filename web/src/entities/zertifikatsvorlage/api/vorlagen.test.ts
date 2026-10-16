import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import {
  erstelleFakeApi,
  testCoin,
  testVorlagenStatus,
  testVorlagenVersion,
  type FakeApi,
} from '../../../../test/fakeApi'
import * as vorlage from '../index'
import { dateiname, ladeAktuelleVorlage, ladeStandardvorlage, ladeVorlagenStatus, ladeVorlagenVersion } from '../index'

// Feature zertifikatsvorlagen, Abschnitt 5.1, 5.2 und 7: Lese-Aufrufe der Vorlagen (alle mit Bearer-Token) und die
// Dateinamen der Downloads (identisch zu Content-Disposition, nur ASCII, keine Benutzereingaben).

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000a1'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID })], {
    vorlagen: {
      [COIN_ID]: testVorlagenStatus([testVorlagenVersion({ version: 2 }), testVorlagenVersion({ version: 1 })], 2),
    },
  })
  vi.stubGlobal('fetch', api.fetch)
  setzeTokenQuelle(() => 'token-vorlagen')
})

afterEach(() => {
  setzeTokenQuelle(null)
})

describe('ladeVorlagenStatus', () => {
  it('ruft GET /api/coins/{id}/zertifikatsvorlage mit Token auf', async () => {
    await ladeVorlagenStatus(COIN_ID)

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([`GET /api/coins/${COIN_ID}/zertifikatsvorlage`])
    expect(api.anfragen[0].headers.get('Authorization')).toBe('Bearer token-vorlagen')
  })

  it('liefert den Status mit quelle, aktiveVersion und versionen', async () => {
    const ergebnis = await ladeVorlagenStatus(COIN_ID)

    expect(ergebnis.art).toBe('ok')
    const status = ergebnis.art === 'ok' ? ergebnis.daten : null
    expect(status?.quelle).toBe('eigene')
    expect(status?.aktiveVersion).toBe(2)
    expect(status?.versionen.map((v) => v.version)).toEqual([2, 1])
  })

  it('liefert nichtGefunden für einen unbekannten Coin', async () => {
    expect(await ladeVorlagenStatus('0199a1b2-0000-7000-8000-0000000000ff')).toEqual({ art: 'nichtGefunden' })
  })
})

describe('Downloads', () => {
  it('ladeAktuelleVorlage ruft …/zertifikatsvorlage/datei mit Token auf und liefert einen Blob', async () => {
    const ergebnis = await ladeAktuelleVorlage(COIN_ID)

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([
      `GET /api/coins/${COIN_ID}/zertifikatsvorlage/datei`,
    ])
    expect(api.anfragen[0].headers.get('Authorization')).toBe('Bearer token-vorlagen')
    // Rev. 3: daten = { blob, dateiname } (lose typisiert, übersetzbar vor und nach der Umstellung).
    const daten = ergebnis.art === 'ok' ? (ergebnis.daten as unknown as { blob?: unknown; dateiname?: unknown }) : null
    expect(daten?.blob).toBeInstanceOf(Blob)
    expect(daten?.dateiname).toBe(`zertifikatsvorlage-${COIN_ID}-v2.docx`)
  })

  it('ladeVorlagenVersion ruft …/versionen/{n}/datei auf', async () => {
    await ladeVorlagenVersion(COIN_ID, 1)

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([
      `GET /api/coins/${COIN_ID}/zertifikatsvorlage/versionen/1/datei`,
    ])
  })

  it('ladeVorlagenVersion liefert nichtGefunden für eine unbekannte Version', async () => {
    expect(await ladeVorlagenVersion(COIN_ID, 9)).toEqual({ art: 'nichtGefunden' })
  })

  it('ladeStandardvorlage ruft GET /api/zertifikatsvorlagen/standard mit Token auf', async () => {
    const ergebnis = await ladeStandardvorlage()

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual(['GET /api/zertifikatsvorlagen/standard'])
    expect(api.anfragen[0].headers.get('Authorization')).toBe('Bearer token-vorlagen')
    expect(ergebnis.art).toBe('ok')
  })
})

describe('dateiname (Abschnitt 5.2)', () => {
  it('nennt die Standardvorlage zertifikatsvorlage-standard.docx', () => {
    expect(dateiname()).toBe('zertifikatsvorlage-standard.docx')
  })

  it('nennt eine Version zertifikatsvorlage-{coinId}-v{n}.docx', () => {
    expect(dateiname(COIN_ID, 3)).toBe(`zertifikatsvorlage-${COIN_ID}-v3.docx`)
  })

  it('nennt die aktive Datei ohne eigene Vorlage zertifikatsvorlage-{coinId}-standard.docx', () => {
    expect(dateiname(COIN_ID, null)).toBe(`zertifikatsvorlage-${COIN_ID}-standard.docx`)
  })

  it('enthält nur ASCII-Zeichen', () => {
    expect(dateiname(COIN_ID, 12)).toMatch(/^[\x20-\x7e]+$/)
  })
})

// Rev. 3, AK-30: dateinameAusAntwort(ausHeader, coinId?, version?) übernimmt den Namen aus Content-Disposition nur,
// wenn er dem Muster ^zertifikatsvorlage-[A-Za-z0-9-]+\.docx$ entspricht; sonst der Name nach Abschnitt 5.2.
// Über die Public API lose aufgerufen, damit die Tests vor der Umsetzung übersetzt werden.
type DateinameAusAntwort = (ausHeader: string | null | undefined, coinId?: string, version?: number | null) => string

function dateinameAusAntwort(...argumente: Parameters<DateinameAusAntwort>): string {
  const funktion = (vorlage as Record<string, unknown>).dateinameAusAntwort
  expect(funktion, 'dateinameAusAntwort fehlt in der Public API von entities/zertifikatsvorlage').toBeTypeOf('function')
  return (funktion as DateinameAusAntwort)(...argumente)
}

describe('dateinameAusAntwort (Rev. 3)', () => {
  it('übernimmt einen gültigen Namen aus dem Header', () => {
    expect(dateinameAusAntwort(`zertifikatsvorlage-${COIN_ID}-v3.docx`, COIN_ID, 2)).toBe(
      `zertifikatsvorlage-${COIN_ID}-v3.docx`,
    )
  })

  it('übernimmt den Standard-Namen aus dem Header', () => {
    expect(dateinameAusAntwort('zertifikatsvorlage-standard.docx')).toBe('zertifikatsvorlage-standard.docx')
  })

  it.each([
    ['../x.docx'],
    ['a.exe'],
    [''],
    ['zertifikatsvorlage-abc.docx.exe'],
    ['zertifikatsvorlage-../x.docx'],
    ['zertifikatsvorlage-a b.docx'],
    ['ZERTIFIKATSVORLAGE-abc.DOCX'],
  ])('fällt bei „%s“ auf den Namen nach Abschnitt 5.2 zurück', (name) => {
    expect(dateinameAusAntwort(name, COIN_ID, 2)).toBe(`zertifikatsvorlage-${COIN_ID}-v2.docx`)
  })

  it('fällt ohne Namen auf den Namen nach Abschnitt 5.2 zurück', () => {
    expect(dateinameAusAntwort(null, COIN_ID, null)).toBe(`zertifikatsvorlage-${COIN_ID}-standard.docx`)
  })

  it('fällt ohne Namen und ohne Coin auf die Standardvorlage zurück', () => {
    expect(dateinameAusAntwort(undefined)).toBe('zertifikatsvorlage-standard.docx')
  })
})
