import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  erstelleFakeApi,
  jsonAntwort,
  keinZugriffAntwort,
  problemAntwort,
  type FakeApi,
} from '../../../../test/fakeApi'
import { ladeExemplare } from '../index'

// Feature coin-ausgaben, AK-3 und AK-20: ladeExemplare(coinId, { status, seite }) ruft
// GET /api/coins/{id}/exemplare auf und bildet die Antworten typisiert ab.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const PFAD = /^\/api\/coins\/[^/]+\/exemplare$/

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
})

const antwort = {
  kennzahlen: { auflage: 150, ausgegeben: 3, verfuegbar: 147 },
  eintraege: [
    { nummer: 1, status: 'ausgegeben' },
    { nummer: 2, status: 'verfuegbar' },
  ],
  gesamt: 150,
  seite: 1,
  groesse: 25,
}

describe('ladeExemplare', () => {
  it('ruft GET /api/coins/{id}/exemplare auf', async () => {
    await ladeExemplare(COIN_ID, { seite: 1 })

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([`GET /api/coins/${COIN_ID}/exemplare`])
  })

  it('sendet die Seite als Query-Parameter', async () => {
    await ladeExemplare(COIN_ID, { seite: 3 })

    expect(api.anfragen[0].query.get('seite')).toBe('3')
  })

  it('verwendet 25 Einträge je Seite', async () => {
    await ladeExemplare(COIN_ID, { seite: 1 })

    expect(api.anfragen[0].query.get('groesse') ?? '25').toBe('25')
  })

  it('sendet den Status-Filter', async () => {
    await ladeExemplare(COIN_ID, { status: 'ausgegeben', seite: 1 })

    expect(api.anfragen[0].query.get('status')).toBe('ausgegeben')
  })

  it('sendet ohne Filter keinen Status', async () => {
    await ladeExemplare(COIN_ID, { seite: 1 })

    expect(api.anfragen[0].query.has('status')).toBe(false)
  })

  it('kodiert die Coin-Id im Pfad', async () => {
    await ladeExemplare('a/b?c', { seite: 1 })

    expect(api.anfragen[0].pfad).toBe('/api/coins/a%2Fb%3Fc/exemplare')
  })

  it('liefert ok mit Kennzahlen und Einträgen bei 200', async () => {
    api.einmal('GET', PFAD, jsonAntwort(200, antwort))

    expect(await ladeExemplare(COIN_ID, { seite: 1 })).toEqual({ art: 'ok', daten: antwort })
  })

  it('liefert nichtGefunden bei 404', async () => {
    api.einmal('GET', PFAD, problemAntwort(404, { title: 'Coin nicht gefunden' }))

    expect(await ladeExemplare(COIN_ID, { seite: 1 })).toEqual({ art: 'nichtGefunden' })
  })

  it('liefert keinZugriff bei 403', async () => {
    api.einmal('GET', PFAD, keinZugriffAntwort('keine_berechtigung'))

    expect(await ladeExemplare(COIN_ID, { seite: 1 })).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })

  it('liefert fehler bei 500', async () => {
    api.einmal('GET', PFAD, problemAntwort(500))

    expect(await ladeExemplare(COIN_ID, { seite: 1 })).toEqual({ art: 'fehler' })
  })

  it('liefert fehler bei einem Netzwerkfehler', async () => {
    api.netzwerkfehler('GET', PFAD)

    expect(await ladeExemplare(COIN_ID, { seite: 1 })).toEqual({ art: 'fehler' })
  })
})
