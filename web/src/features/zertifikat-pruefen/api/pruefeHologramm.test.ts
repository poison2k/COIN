import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import {
  erstelleFakeApi,
  jsonAntwort,
  keinZugriffAntwort,
  problemAntwort,
  testPruefErgebnis,
  zuVielePruefungenAntwort,
  type FakeApi,
} from '../../../../test/fakeApi'
import { pruefeHologramm } from './pruefeHologramm'

// Feature hologrammnummer, AK-16, AK-29, AK-31 und AK-32 (Abschnitt 8): pruefeHologramm({ hologrammnummer, coinId },
// { mitEmpfaenger }) ruft POST /api/pruefung bzw. POST /api/pruefung/mit-empfaenger auf. Die Nummer steht nur im
// Body, nie in der URL; 429 wird zu { art: 'zuVieleAnfragen', wiederholenNachSekunden }.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
})

afterEach(() => {
  setzeTokenQuelle(null)
})

describe('pruefeHologramm', () => {
  it('ruft ohne Empfänger POST /api/pruefung auf', async () => {
    api.einmal('POST', /^\/api\/pruefung$/, jsonAntwort(200, testPruefErgebnis('nichtGefunden')))

    await pruefeHologramm({ hologrammnummer: 'AB 12-34', coinId: null }, { mitEmpfaenger: false })

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual(['POST /api/pruefung'])
  })

  it('ruft mit Empfänger POST /api/pruefung/mit-empfaenger auf', async () => {
    api.einmal('POST', /^\/api\/pruefung\/mit-empfaenger$/, jsonAntwort(200, testPruefErgebnis('nichtGefunden')))

    await pruefeHologramm({ hologrammnummer: 'AB 12-34', coinId: null }, { mitEmpfaenger: true })

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual(['POST /api/pruefung/mit-empfaenger'])
  })

  it('sendet Nummer und Coin als JSON im Body', async () => {
    api.einmal('POST', /^\/api\/pruefung$/, jsonAntwort(200, testPruefErgebnis('nichtGefunden')))

    await pruefeHologramm({ hologrammnummer: 'AB 12-34', coinId: COIN_ID }, { mitEmpfaenger: false })

    const anfrage = api.anfragen[0]
    expect(anfrage.headers.get('Content-Type')).toBe('application/json')
    expect(anfrage.body).toEqual({ hologrammnummer: 'AB 12-34', coinId: COIN_ID })
  })

  it('sendet ohne Coin coinId null', async () => {
    api.einmal('POST', /^\/api\/pruefung$/, jsonAntwort(200, testPruefErgebnis('nichtGefunden')))

    await pruefeHologramm({ hologrammnummer: 'AB1234', coinId: null }, { mitEmpfaenger: false })

    expect((api.anfragen[0].body as { coinId?: unknown }).coinId ?? null).toBeNull()
  })

  it('setzt die Nummer weder in den Pfad noch in die Query', async () => {
    api.einmal('POST', /^\/api\/pruefung$/, jsonAntwort(200, testPruefErgebnis('nichtGefunden')))

    await pruefeHologramm({ hologrammnummer: 'AB 12-34', coinId: COIN_ID }, { mitEmpfaenger: false })

    expect(api.anfragen[0].query.toString()).toBe('')
    expect(api.anfragen[0].pfad).not.toMatch(/AB/i)
  })

  it('sendet das Token als Bearer-Header', async () => {
    setzeTokenQuelle(() => 'token-pruefung')
    api.einmal('POST', /^\/api\/pruefung$/, jsonAntwort(200, testPruefErgebnis('nichtGefunden')))

    await pruefeHologramm({ hologrammnummer: 'AB1234', coinId: null }, { mitEmpfaenger: false })

    expect(api.anfragen[0].headers.get('Authorization')).toBe('Bearer token-pruefung')
  })

  it('liefert bei 200 das Prüfergebnis', async () => {
    const ergebnis = testPruefErgebnis('gueltig')
    api.einmal('POST', /^\/api\/pruefung$/, jsonAntwort(200, ergebnis))

    expect(await pruefeHologramm({ hologrammnummer: 'AB1234', coinId: null }, { mitEmpfaenger: false })).toEqual({
      art: 'ok',
      daten: ergebnis,
    })
  })

  it('bildet 429 mit Retry-After ab', async () => {
    api.einmal('POST', /^\/api\/pruefung$/, zuVielePruefungenAntwort('30'))

    expect(await pruefeHologramm({ hologrammnummer: 'AB1234', coinId: null }, { mitEmpfaenger: false })).toEqual({
      art: 'zuVieleAnfragen',
      wiederholenNachSekunden: 30,
    })
  })

  it('bildet 400 als Validierungsfehler ab', async () => {
    const errors = { hologrammnummer: ['Bitte eine Hologrammnummer eingeben.'] }
    api.einmal('POST', /^\/api\/pruefung$/, problemAntwort(400, { title: 'Eingaben ungültig', errors }))

    expect(await pruefeHologramm({ hologrammnummer: '', coinId: null }, { mitEmpfaenger: false })).toEqual({
      art: 'validierung',
      fehler: errors,
    })
  })

  it('bildet 403 auf keinZugriff ab', async () => {
    api.einmal('POST', /^\/api\/pruefung\/mit-empfaenger$/, keinZugriffAntwort('keine_berechtigung'))

    expect(await pruefeHologramm({ hologrammnummer: 'AB1234', coinId: null }, { mitEmpfaenger: true })).toEqual({
      art: 'keinZugriff',
      grund: 'keineBerechtigung',
    })
  })
})
