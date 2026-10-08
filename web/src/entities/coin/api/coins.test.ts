import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  erstelleFakeApi,
  jsonAntwort,
  problemAntwort,
  seiteAntwort,
  testCoin,
  testDatei,
  type FakeApi,
} from '../../../../test/fakeApi'
import { ladeBildHoch, ladeCoin, ladeCoins, legeCoinAn } from './coins'

// Abbildung der HTTP-Statuscodes auf typisierte Ergebnisse (Abschnitt 6 des Entwurfs, AK-12 bis AK-25).

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
})

const neuerCoin = { name: 'Coin Alpha', herausgeber: 'Herausgeber Beta', auflage: null, beschreibung: null }
const COIN_ID = '0199a1b2-0000-7000-8000-000000000001'

// Feature katalog-seiten, AK-1 und AK-2 (Entscheidung F7): ladeCoins({ suche, seite, groesse }) liefert eine Seite.
const ALLE = { suche: '', seite: 1, groesse: 25 }

describe('ladeCoins', () => {
  it('ruft GET /api/coins auf', async () => {
    await ladeCoins(ALLE)

    expect(api.anfragen).toHaveLength(1)
    expect(api.anfragen[0].methode).toBe('GET')
    expect(api.anfragen[0].pfad).toBe('/api/coins')
  })

  it('sendet seite und groesse als Query-Parameter', async () => {
    await ladeCoins({ suche: '', seite: 3, groesse: 10 })

    expect(api.anfragen[0].query.get('seite')).toBe('3')
    expect(api.anfragen[0].query.get('groesse')).toBe('10')
  })

  it('sendet die Suche URL-kodiert', async () => {
    await ladeCoins({ suche: 'a&b=c %_\\ ä#?', seite: 1, groesse: 25 })

    expect(api.anfragen[0].query.get('suche')).toBe('a&b=c %_\\ ä#?')
  })

  it('sendet eine leere Suche nicht', async () => {
    await ladeCoins(ALLE)

    expect(api.anfragen[0].query.has('suche')).toBe(false)
  })

  it('sendet eine Suche nur aus Leerzeichen nicht', async () => {
    await ladeCoins({ suche: '   ', seite: 1, groesse: 25 })

    expect(api.anfragen[0].query.has('suche')).toBe(false)
  })

  it('liefert ok mit der Seite bei 200', async () => {
    const coin = testCoin()
    api.einmal('GET', /^\/api\/coins$/, jsonAntwort(200, seiteAntwort([coin], { gesamt: 1 })))

    const ergebnis = await ladeCoins(ALLE)

    expect(ergebnis).toEqual({ art: 'ok', daten: { eintraege: [coin], gesamt: 1, seite: 1, groesse: 25 } })
  })

  it('liefert validierung bei 400', async () => {
    const errors = { seite: ['Die Seite muss mindestens 1 sein.'] }
    api.einmal('GET', /^\/api\/coins$/, problemAntwort(400, { title: 'Eingaben ungültig', errors }))

    expect(await ladeCoins(ALLE)).toEqual({ art: 'validierung', fehler: errors })
  })

  it('liefert fehler bei 500', async () => {
    api.einmal('GET', /^\/api\/coins$/, problemAntwort(500))

    expect((await ladeCoins(ALLE)).art).toBe('fehler')
  })

  it('liefert fehler bei Netzwerkfehler statt eine Ausnahme zu werfen', async () => {
    api.netzwerkfehler('GET', /^\/api\/coins$/)

    expect((await ladeCoins(ALLE)).art).toBe('fehler')
  })
})

// Feature katalog-seiten, AK-17: ladeCoin(id) für die Detailseite.
describe('ladeCoin', () => {
  it('ruft GET /api/coins/{id} auf', async () => {
    api.coins.push(testCoin({ id: COIN_ID }))

    await ladeCoin(COIN_ID)

    expect(api.anfragen).toHaveLength(1)
    expect(api.anfragen[0].methode).toBe('GET')
    expect(api.anfragen[0].pfad).toBe(`/api/coins/${COIN_ID}`)
  })

  it('liefert ok mit dem Coin bei 200', async () => {
    const coin = testCoin({ id: COIN_ID, beschreibung: 'Text' })
    api.coins.push(coin)

    expect(await ladeCoin(COIN_ID)).toEqual({ art: 'ok', daten: coin })
  })

  it('liefert nichtGefunden bei 404', async () => {
    expect((await ladeCoin(COIN_ID)).art).toBe('nichtGefunden')
  })

  it('liefert fehler bei 500', async () => {
    api.einmal('GET', /^\/api\/coins\/[^/]+$/, problemAntwort(500))

    expect((await ladeCoin(COIN_ID)).art).toBe('fehler')
  })

  it('liefert fehler bei Netzwerkfehler', async () => {
    api.netzwerkfehler('GET', /^\/api\/coins\/[^/]+$/)

    expect((await ladeCoin(COIN_ID)).art).toBe('fehler')
  })

  it('kodiert die id im Pfad', async () => {
    await ladeCoin('a/b')

    expect(api.anfragen[0].pfad).toBe('/api/coins/a%2Fb')
  })
})

describe('legeCoinAn', () => {
  it('sendet POST /api/coins mit JSON-Body', async () => {
    await legeCoinAn({ ...neuerCoin, auflage: 250, beschreibung: 'Text' })

    const [anfrage] = api.anfragenMit('POST')
    expect(anfrage.pfad).toBe('/api/coins')
    expect(anfrage.headers.get('Content-Type')).toMatch(/^application\/json/)
    expect(anfrage.body).toEqual({
      name: 'Coin Alpha',
      herausgeber: 'Herausgeber Beta',
      auflage: 250,
      beschreibung: 'Text',
    })
  })

  it('liefert ok mit dem angelegten Coin bei 201', async () => {
    const ergebnis = await legeCoinAn(neuerCoin)

    expect(ergebnis.art).toBe('ok')
    if (ergebnis.art === 'ok') {
      expect(ergebnis.daten.name).toBe('Coin Alpha')
      expect(ergebnis.daten.bildUrl).toBeNull()
    }
  })

  it('liefert validierung mit den Feldfehlern bei 400', async () => {
    const errors = { name: ['Name ist erforderlich.'], auflage: ['Auflage muss zwischen 1 und 1000000 liegen.'] }
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(400, { title: 'Eingaben ungültig', errors }))

    const ergebnis = await legeCoinAn(neuerCoin)

    expect(ergebnis).toEqual({ art: 'validierung', fehler: errors })
  })

  it('liefert konflikt bei 409', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(409, { title: 'Coin existiert bereits' }))

    expect((await legeCoinAn(neuerCoin)).art).toBe('konflikt')
  })

  it('liefert fehler bei 500', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(500))

    expect((await legeCoinAn(neuerCoin)).art).toBe('fehler')
  })

  it('liefert fehler bei Netzwerkfehler', async () => {
    api.netzwerkfehler('POST', /^\/api\/coins$/)

    expect((await legeCoinAn(neuerCoin)).art).toBe('fehler')
  })
})

describe('ladeBildHoch', () => {
  beforeEach(() => {
    api.coins.push(testCoin({ id: COIN_ID }))
  })

  it('sendet PUT /api/coins/{id}/bild', async () => {
    await ladeBildHoch(COIN_ID, testDatei())

    const [anfrage] = api.anfragenMit('PUT')
    expect(anfrage.pfad).toBe(`/api/coins/${COIN_ID}/bild`)
  })

  it('sendet die Datei als FormData im Feld datei', async () => {
    const datei = testDatei('image/webp', 4321, 'motiv.webp')

    await ladeBildHoch(COIN_ID, datei)

    const [anfrage] = api.anfragenMit('PUT')
    expect(anfrage.body).toBeInstanceOf(FormData)
    const formData = anfrage.body as FormData
    expect(formData.getAll('datei')).toHaveLength(1)
    const gesendet = formData.get('datei') as File
    expect(gesendet).toBeInstanceOf(File)
    expect(gesendet.type).toBe('image/webp')
    expect(gesendet.name).toBe('motiv.webp')
  })

  it('setzt keinen eigenen Content-Type-Header (Boundary setzt der Browser)', async () => {
    await ladeBildHoch(COIN_ID, testDatei())

    const [anfrage] = api.anfragenMit('PUT')
    expect(anfrage.headers.has('Content-Type')).toBe(false)
  })

  it('liefert ok mit dem aktualisierten Coin bei 200', async () => {
    const ergebnis = await ladeBildHoch(COIN_ID, testDatei())

    expect(ergebnis.art).toBe('ok')
    if (ergebnis.art === 'ok') {
      expect(ergebnis.daten.bildUrl).toMatch(new RegExp(`^/api/coins/${COIN_ID}/bild\\?v=`))
    }
  })

  it('liefert zuGross bei 413', async () => {
    api.einmal('PUT', /\/bild$/, problemAntwort(413))

    expect((await ladeBildHoch(COIN_ID, testDatei())).art).toBe('zuGross')
  })

  it('liefert formatUngueltig bei 415', async () => {
    api.einmal('PUT', /\/bild$/, problemAntwort(415))

    expect((await ladeBildHoch(COIN_ID, testDatei())).art).toBe('formatUngueltig')
  })

  it('liefert nichtGefunden bei 404', async () => {
    api.einmal('PUT', /\/bild$/, problemAntwort(404))

    expect((await ladeBildHoch(COIN_ID, testDatei())).art).toBe('nichtGefunden')
  })

  it('liefert validierung mit Fehler für datei bei 400', async () => {
    const errors = { datei: ['Bitte genau eine Datei auswählen.'] }
    api.einmal('PUT', /\/bild$/, problemAntwort(400, { errors }))

    expect(await ladeBildHoch(COIN_ID, testDatei())).toEqual({ art: 'validierung', fehler: errors })
  })

  it('liefert fehler bei 500', async () => {
    api.einmal('PUT', /\/bild$/, problemAntwort(500))

    expect((await ladeBildHoch(COIN_ID, testDatei())).art).toBe('fehler')
  })

  it('liefert fehler bei Netzwerkfehler', async () => {
    api.netzwerkfehler('PUT', /\/bild$/)

    expect((await ladeBildHoch(COIN_ID, testDatei())).art).toBe('fehler')
  })
})
