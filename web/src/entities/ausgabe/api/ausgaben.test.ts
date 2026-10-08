import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  erstelleFakeApi,
  jsonAntwort,
  keinZugriffAntwort,
  problemAntwort,
  seiteAntwort,
  testAusgabe,
  type FakeApi,
} from '../../../../test/fakeApi'
import { ladeAusgaben } from '../index'

// Feature coin-ausgaben, AK-14 und AK-22: ladeAusgaben(coinId, { status, seite }) ruft
// GET /api/coins/{id}/ausgaben auf und bildet die Antworten typisiert ab.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const PFAD = /^\/api\/coins\/[^/]+\/ausgaben$/

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
})

describe('ladeAusgaben', () => {
  it('ruft GET /api/coins/{id}/ausgaben auf', async () => {
    await ladeAusgaben(COIN_ID, { seite: 1 })

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([`GET /api/coins/${COIN_ID}/ausgaben`])
  })

  it('sendet die Seite als Query-Parameter', async () => {
    await ladeAusgaben(COIN_ID, { seite: 2 })

    expect(api.anfragen[0].query.get('seite')).toBe('2')
  })

  it('sendet den Status-Filter', async () => {
    await ladeAusgaben(COIN_ID, { status: 'storniert', seite: 1 })

    expect(api.anfragen[0].query.get('status')).toBe('storniert')
  })

  it('sendet ohne Filter keinen Status', async () => {
    await ladeAusgaben(COIN_ID, { seite: 1 })

    expect(api.anfragen[0].query.has('status')).toBe(false)
  })

  it('kodiert die Coin-Id im Pfad', async () => {
    await ladeAusgaben('a/b', { seite: 1 })

    expect(api.anfragen[0].pfad).toBe('/api/coins/a%2Fb/ausgaben')
  })

  it('liefert ok mit der Seite bei 200', async () => {
    const seite = seiteAntwort([testAusgabe()])
    api.einmal('GET', PFAD, jsonAntwort(200, seite))

    expect(await ladeAusgaben(COIN_ID, { seite: 1 })).toEqual({ art: 'ok', daten: seite })
  })

  it('liefert keinZugriff bei 403 (Betrachter)', async () => {
    api.einmal('GET', PFAD, keinZugriffAntwort('keine_berechtigung'))

    expect(await ladeAusgaben(COIN_ID, { seite: 1 })).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })

  it('liefert nichtGefunden bei 404', async () => {
    api.einmal('GET', PFAD, problemAntwort(404))

    expect(await ladeAusgaben(COIN_ID, { seite: 1 })).toEqual({ art: 'nichtGefunden' })
  })

  it('liefert fehler bei 500', async () => {
    api.einmal('GET', PFAD, problemAntwort(500))

    expect(await ladeAusgaben(COIN_ID, { seite: 1 })).toEqual({ art: 'fehler' })
  })
})
