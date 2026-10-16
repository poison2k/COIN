import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import {
  erstelleFakeApi,
  jsonAntwort,
  problemAntwort,
  testCoin,
  testDatei,
  testVorlagenStatus,
  testVorlagenVersion,
  type FakeApi,
} from '../../../../test/fakeApi'
import { ladeVorlageHoch } from './ladeVorlageHoch'

// Feature zertifikatsvorlagen, AK-7 bis AK-10 und Abschnitt 7: ladeVorlageHoch(coinId, datei) sendet
// POST /api/coins/{id}/zertifikatsvorlage/versionen als multipart mit genau einer Datei im Feld „datei“.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000a1'
const PFAD = /^\/api\/coins\/[^/]+\/zertifikatsvorlage\/versionen$/
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID })])
  vi.stubGlobal('fetch', api.fetch)
  setzeTokenQuelle(() => 'token-upload')
})

afterEach(() => {
  setzeTokenQuelle(null)
})

describe('ladeVorlageHoch', () => {
  it('ruft POST /api/coins/{id}/zertifikatsvorlage/versionen mit Token auf', async () => {
    await ladeVorlageHoch(COIN_ID, testDatei(DOCX, 100, 'urkunde.docx'))

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([
      `POST /api/coins/${COIN_ID}/zertifikatsvorlage/versionen`,
    ])
    expect(api.anfragen[0].headers.get('Authorization')).toBe('Bearer token-upload')
  })

  it('sendet FormData mit genau der Datei im Feld „datei“', async () => {
    const datei = testDatei(DOCX, 100, 'urkunde.docx')

    await ladeVorlageHoch(COIN_ID, datei)

    const body = api.anfragen[0].body
    expect(body).toBeInstanceOf(FormData)
    const formular = body as FormData
    expect([...formular.keys()]).toEqual(['datei'])
    expect((formular.get('datei') as File).name).toBe('urkunde.docx')
  })

  it('setzt keinen eigenen Content-Type (Boundary setzt der Browser)', async () => {
    await ladeVorlageHoch(COIN_ID, testDatei(DOCX, 100, 'urkunde.docx'))

    expect(api.anfragen[0].headers.has('Content-Type')).toBe(false)
  })

  it('liefert bei 201 den Vorlagenstatus', async () => {
    const status = testVorlagenStatus([testVorlagenVersion({ version: 1 })], 1)
    api.einmal('POST', PFAD, jsonAntwort(201, status))

    expect(await ladeVorlageHoch(COIN_ID, testDatei(DOCX, 100, 'urkunde.docx'))).toEqual({ art: 'ok', daten: status })
  })

  it('liefert bei 400 alle Meldungen unter errors.datei', async () => {
    const errors = {
      datei: [
        'Es fehlen Pflichtplatzhalter: {{Zertifikat.Nummer}}.',
        'Unbekannte Platzhalter: {{Empfaenger.Nam}}. Erlaubt sind nur die Platzhalter aus der Standardvorlage.',
      ],
    }
    api.einmal('POST', PFAD, problemAntwort(400, { title: 'Eingaben ungültig', errors }))

    expect(await ladeVorlageHoch(COIN_ID, testDatei(DOCX, 100, 'urkunde.docx'))).toEqual({
      art: 'validierung',
      fehler: errors,
    })
  })

  it('liefert bei 413 zuGross', async () => {
    api.einmal('POST', PFAD, problemAntwort(413, { title: 'Vorlage zu groß' }))

    expect(await ladeVorlageHoch(COIN_ID, testDatei(DOCX, 100, 'urkunde.docx'))).toEqual({ art: 'zuGross' })
  })

  it('liefert bei unbekanntem Coin nichtGefunden', async () => {
    expect(await ladeVorlageHoch('0199a1b2-0000-7000-8000-0000000000ff', testDatei(DOCX, 100, 'urkunde.docx'))).toEqual(
      {
        art: 'nichtGefunden',
      },
    )
  })
})
