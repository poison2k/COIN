import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import {
  erstelleFakeApi,
  jsonAntwort,
  keinZugriffAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { ladeAusgabe } from '../index'

// Feature zertifikat-erzeugen, AK-22 und AK-27: ladeAusgabe(coinId, ausgabeId) ruft
// GET /api/coins/{id}/ausgaben/{ausgabeId} mit Token auf und bildet die Antworten typisiert ab.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const AUSGABE_ID = '0199a1b2-0000-7000-8000-0000000000e7'
const PFAD = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+$/

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID })], {
    ausgaben: { [COIN_ID]: [testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12 })] },
  })
  vi.stubGlobal('fetch', api.fetch)
  setzeTokenQuelle(() => 'token-ausgabe')
})

afterEach(() => {
  setzeTokenQuelle(null)
})

describe('ladeAusgabe', () => {
  it('ruft GET /api/coins/{id}/ausgaben/{ausgabeId} auf', async () => {
    await ladeAusgabe(COIN_ID, AUSGABE_ID)

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([
      `GET /api/coins/${COIN_ID}/ausgaben/${AUSGABE_ID}`,
    ])
  })

  it('sendet das Token im Authorization-Header und nicht in der URL', async () => {
    await ladeAusgabe(COIN_ID, AUSGABE_ID)

    expect(api.anfragen[0].headers.get('Authorization')).toBe('Bearer token-ausgabe')
    expect(api.anfragen[0].query.toString()).toBe('')
  })

  it('kodiert beide Ids im Pfad', async () => {
    await ladeAusgabe('a/b', 'c/d')

    expect(api.anfragen[0].pfad).toBe('/api/coins/a%2Fb/ausgaben/c%2Fd')
  })

  it('liefert ok mit der Ausgabe samt Zertifikatsnummer bei 200', async () => {
    const ergebnis = await ladeAusgabe(COIN_ID, AUSGABE_ID)

    expect(ergebnis).toEqual({ art: 'ok', daten: testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12 }) })
    expect(ergebnis.art === 'ok' && ergebnis.daten.zertifikatsnummer).toBe('C0042-0012')
  })

  it('liefert nichtGefunden bei 404', async () => {
    api.einmal('GET', PFAD, problemAntwort(404, { title: 'Ausgabe nicht gefunden' }))

    expect(await ladeAusgabe(COIN_ID, AUSGABE_ID)).toEqual({ art: 'nichtGefunden' })
  })

  it('liefert keinZugriff bei 403', async () => {
    api.einmal('GET', PFAD, keinZugriffAntwort('keine_berechtigung'))

    expect(await ladeAusgabe(COIN_ID, AUSGABE_ID)).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })

  it('liefert fehler bei 500', async () => {
    api.einmal('GET', PFAD, problemAntwort(500))

    expect(await ladeAusgabe(COIN_ID, AUSGABE_ID)).toEqual({ art: 'fehler' })
  })

  it('liefert fehler bei 200 ohne JSON', async () => {
    api.einmal('GET', PFAD, jsonAntwort(200, undefined))

    expect(await ladeAusgabe(COIN_ID, AUSGABE_ID)).toEqual({ art: 'fehler' })
  })

  it('liefert fehler bei einem Netzwerkfehler', async () => {
    api.netzwerkfehler('GET', PFAD)

    expect(await ladeAusgabe(COIN_ID, AUSGABE_ID)).toEqual({ art: 'fehler' })
  })
})
