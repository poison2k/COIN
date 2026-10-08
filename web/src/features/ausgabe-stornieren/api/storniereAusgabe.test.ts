import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ausgabeKonfliktAntwort,
  erstelleFakeApi,
  jsonAntwort,
  keinZugriffAntwort,
  problemAntwort,
  testAusgabe,
  type FakeApi,
} from '../../../../test/fakeApi'
import { storniereAusgabe } from './storniereAusgabe'

// Feature coin-ausgaben, AK-11 und AK-12: storniereAusgabe(coinId, ausgabeId, grund) ruft
// POST /api/coins/{id}/ausgaben/{ausgabeId}/storno mit { grund } auf.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const AUSGABE_ID = '0199a1b2-0000-7000-8000-00000000e001'
const PFAD = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+\/storno$/

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
})

describe('storniereAusgabe', () => {
  it('ruft POST /api/coins/{id}/ausgaben/{ausgabeId}/storno auf', async () => {
    await storniereAusgabe(COIN_ID, AUSGABE_ID, 'Falsch erfasst')

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([
      `POST /api/coins/${COIN_ID}/ausgaben/${AUSGABE_ID}/storno`,
    ])
  })

  it('sendet genau { grund } als JSON', async () => {
    await storniereAusgabe(COIN_ID, AUSGABE_ID, 'Falsch erfasst')

    expect(api.anfragen[0].body).toEqual({ grund: 'Falsch erfasst' })
    expect(api.anfragen[0].headers.get('Content-Type')).toMatch(/^application\/json/)
  })

  it('liefert ok mit der stornierten Ausgabe bei 200', async () => {
    const ausgabe = testAusgabe({
      storno: { am: '2026-10-08T10:00:00+00:00', von: { id: 'x', name: 'Test' }, grund: 'G' },
    })
    api.einmal('POST', PFAD, jsonAntwort(200, ausgabe))

    expect(await storniereAusgabe(COIN_ID, AUSGABE_ID, 'G')).toEqual({ art: 'ok', daten: ausgabe })
  })

  it('liefert validierung bei 400', async () => {
    const errors = { grund: ['Bitte einen Grund für das Storno angeben.'] }
    api.einmal('POST', PFAD, problemAntwort(400, { title: 'Eingaben ungültig', errors }))

    expect(await storniereAusgabe(COIN_ID, AUSGABE_ID, ' ')).toEqual({ art: 'validierung', fehler: errors })
  })

  it('liefert konflikt mit code bereits_storniert bei 409', async () => {
    api.einmal('POST', PFAD, ausgabeKonfliktAntwort('bereits_storniert'))

    expect(await storniereAusgabe(COIN_ID, AUSGABE_ID, 'G')).toEqual({ art: 'konflikt', code: 'bereits_storniert' })
  })

  it('liefert nichtGefunden bei 404', async () => {
    api.einmal('POST', PFAD, problemAntwort(404, { title: 'Ausgabe nicht gefunden' }))

    expect(await storniereAusgabe(COIN_ID, AUSGABE_ID, 'G')).toEqual({ art: 'nichtGefunden' })
  })

  it('liefert keinZugriff bei 403', async () => {
    api.einmal('POST', PFAD, keinZugriffAntwort('keine_berechtigung'))

    expect(await storniereAusgabe(COIN_ID, AUSGABE_ID, 'G')).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })

  it('liefert fehler bei einem Netzwerkfehler', async () => {
    api.netzwerkfehler('POST', PFAD)

    expect(await storniereAusgabe(COIN_ID, AUSGABE_ID, 'G')).toEqual({ art: 'fehler' })
  })
})
