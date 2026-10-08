import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ausgabeKonfliktAntwort,
  erstelleFakeApi,
  jsonAntwort,
  keinZugriffAntwort,
  problemAntwort,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { aendereAuflage } from '../index'

// Feature coin-ausgaben, AK-17 und AK-25 (Entscheidung F3): aendereAuflage(id, auflage) ruft
// PUT /api/coins/{id}/auflage mit { auflage } auf.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const PFAD = /^\/api\/coins\/[^/]+\/auflage$/

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID, auflage: 150 })])
  vi.stubGlobal('fetch', api.fetch)
})

describe('aendereAuflage', () => {
  it('ruft PUT /api/coins/{id}/auflage auf', async () => {
    await aendereAuflage(COIN_ID, 200)

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([`PUT /api/coins/${COIN_ID}/auflage`])
  })

  it('sendet genau { auflage } als JSON', async () => {
    await aendereAuflage(COIN_ID, 200)

    expect(api.anfragen[0].body).toEqual({ auflage: 200 })
    expect(api.anfragen[0].headers.get('Content-Type')).toMatch(/^application\/json/)
  })

  it('liefert ok mit dem Coin bei 200', async () => {
    const coin = testCoin({ id: COIN_ID, auflage: 200 })
    api.einmal('PUT', PFAD, jsonAntwort(200, coin))

    expect(await aendereAuflage(COIN_ID, 200)).toEqual({ art: 'ok', daten: coin })
  })

  it('liefert validierung mit den Feldfehlern bei 400', async () => {
    const errors = { auflage: ['Auflage muss zwischen 1 und 1000000 liegen.'] }
    api.einmal('PUT', PFAD, problemAntwort(400, { title: 'Eingaben ungültig', errors }))

    expect(await aendereAuflage(COIN_ID, 0)).toEqual({ art: 'validierung', fehler: errors })
  })

  it('liefert konflikt mit code auflage_zu_klein bei 409', async () => {
    api.einmal('PUT', PFAD, ausgabeKonfliktAntwort('auflage_zu_klein'))

    expect(await aendereAuflage(COIN_ID, 5)).toEqual({ art: 'konflikt', code: 'auflage_zu_klein' })
  })

  it('liefert keinZugriff bei 403', async () => {
    api.einmal('PUT', PFAD, keinZugriffAntwort('keine_berechtigung'))

    expect(await aendereAuflage(COIN_ID, 5)).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })

  it('liefert nichtGefunden bei 404', async () => {
    api.einmal('PUT', PFAD, problemAntwort(404))

    expect(await aendereAuflage(COIN_ID, 5)).toEqual({ art: 'nichtGefunden' })
  })

  it('liefert fehler bei einem Netzwerkfehler', async () => {
    api.netzwerkfehler('PUT', PFAD)

    expect(await aendereAuflage(COIN_ID, 5)).toEqual({ art: 'fehler' })
  })
})
