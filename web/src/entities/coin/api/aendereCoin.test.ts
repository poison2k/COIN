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
import { aendereCoin } from '../index'

// Feature zertifikatsvorlagen, AK-22 und Abschnitt 7: aendereCoin(id, daten) ruft PUT /api/coins/{id} mit
// { name, herausgeber, auflage, beschreibung } auf. Bei 409 liefert es code und detail (auflage_zu_klein, coin_existiert).

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const PFAD = /^\/api\/coins\/[^/]+$/
const DATEN = { name: 'Coin Neu', herausgeber: 'Herausgeber Neu', auflage: 150, beschreibung: null }

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID, auflage: 150 })])
  vi.stubGlobal('fetch', api.fetch)
})

describe('aendereCoin', () => {
  it('ruft PUT /api/coins/{id} auf', async () => {
    await aendereCoin(COIN_ID, DATEN)

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([`PUT /api/coins/${COIN_ID}`])
  })

  it('sendet genau die vier Stammdaten als JSON', async () => {
    await aendereCoin(COIN_ID, DATEN)

    expect(api.anfragen[0].body).toEqual(DATEN)
    expect(api.anfragen[0].headers.get('Content-Type')).toMatch(/^application\/json/)
  })

  it('liefert ok mit dem Coin bei 200', async () => {
    const coin = testCoin({ id: COIN_ID, name: 'Coin Neu' })
    api.einmal('PUT', PFAD, jsonAntwort(200, coin))

    expect(await aendereCoin(COIN_ID, DATEN)).toEqual({ art: 'ok', daten: coin })
  })

  it('liefert validierung mit den Feldfehlern bei 400', async () => {
    const errors = { name: ['Name ist erforderlich.'], auflage: ['Auflage ist erforderlich.'] }
    api.einmal('PUT', PFAD, problemAntwort(400, { title: 'Eingaben ungültig', errors }))

    expect(await aendereCoin(COIN_ID, DATEN)).toEqual({ art: 'validierung', fehler: errors })
  })

  it('liefert bei 409 auflage_zu_klein code und detail des Servers', async () => {
    const detail = 'Die Auflage kann nicht unter 7 gesenkt werden, weil Exemplar Nr. 7 ausgegeben wurde.'
    api.einmal('PUT', PFAD, ausgabeKonfliktAntwort('auflage_zu_klein', detail))

    expect(await aendereCoin(COIN_ID, DATEN)).toEqual({ art: 'konflikt', code: 'auflage_zu_klein', detail })
  })

  it('liefert bei 409 coin_existiert code und detail', async () => {
    const detail = 'Ein Coin mit diesem Namen und Herausgeber existiert bereits.'
    api.einmal('PUT', PFAD, problemAntwort(409, { title: 'Coin existiert bereits', code: 'coin_existiert', detail }))

    expect(await aendereCoin(COIN_ID, DATEN)).toEqual({ art: 'konflikt', code: 'coin_existiert', detail })
  })

  it('liefert nichtGefunden bei 404', async () => {
    expect(await aendereCoin('0199a1b2-0000-7000-8000-0000000000ff', DATEN)).toEqual({ art: 'nichtGefunden' })
  })

  it('liefert keinZugriff bei 403', async () => {
    api.einmal('PUT', PFAD, keinZugriffAntwort('keine_berechtigung'))

    expect(await aendereCoin(COIN_ID, DATEN)).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })

  it('kodiert die Id in der URL', async () => {
    await aendereCoin('a/b', DATEN)

    expect(api.anfragen[0].pfad).toBe('/api/coins/a%2Fb')
  })
})
