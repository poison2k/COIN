import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import {
  erstelleFakeApi,
  hologrammKonfliktAntwort,
  jsonAntwort,
  keinZugriffAntwort,
  problemAntwort,
  testAusgabe,
  type FakeApi,
} from '../../../../test/fakeApi'
import { aendereHologrammnummer } from './aendereHologrammnummer'

// Feature hologrammnummer, AK-10, AK-11 und AK-27 (Abschnitt 5.2): aendereHologrammnummer(coinId, ausgabeId,
// { hologrammnummer, grund, bisherige }) ruft PUT /api/coins/{id}/ausgaben/{ausgabeId}/hologrammnummer mit JSON auf
// und liefert die Ausgabe (200); 409 wird mit `code` abgebildet.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const AUSGABE_ID = '0199a1b2-0000-7000-8000-0000000000e7'
const PFAD = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+\/hologrammnummer$/
const DATEN = { hologrammnummer: 'AB 12-34', grund: 'Tippfehler bei der Erfassung', bisherige: 'AB 12-43' }

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
})

afterEach(() => {
  setzeTokenQuelle(null)
})

describe('aendereHologrammnummer', () => {
  it('sendet PUT auf …/ausgaben/{ausgabeId}/hologrammnummer', async () => {
    api.einmal('PUT', PFAD, jsonAntwort(200, testAusgabe({ id: AUSGABE_ID })))

    await aendereHologrammnummer(COIN_ID, AUSGABE_ID, DATEN)

    expect(api.anfragenMit('PUT').map((a) => a.pfad)).toEqual([
      `/api/coins/${COIN_ID}/ausgaben/${AUSGABE_ID}/hologrammnummer`,
    ])
  })

  it('sendet hologrammnummer, grund und bisherige als JSON', async () => {
    api.einmal('PUT', PFAD, jsonAntwort(200, testAusgabe({ id: AUSGABE_ID })))

    await aendereHologrammnummer(COIN_ID, AUSGABE_ID, DATEN)

    const anfrage = api.anfragenMit('PUT', PFAD)[0]
    expect(anfrage.headers.get('Content-Type')).toBe('application/json')
    expect(anfrage.body).toEqual(DATEN)
  })

  it('sendet das Token als Bearer-Header', async () => {
    setzeTokenQuelle(() => 'token-hologramm')
    api.einmal('PUT', PFAD, jsonAntwort(200, testAusgabe({ id: AUSGABE_ID })))

    await aendereHologrammnummer(COIN_ID, AUSGABE_ID, DATEN)

    expect(api.anfragenMit('PUT', PFAD)[0].headers.get('Authorization')).toBe('Bearer token-hologramm')
  })

  it('liefert bei 200 die Ausgabe aus der Antwort', async () => {
    const ausgabe = testAusgabe({ id: AUSGABE_ID, hologrammnummer: 'AB 12-34' })
    api.einmal('PUT', PFAD, jsonAntwort(200, ausgabe))

    expect(await aendereHologrammnummer(COIN_ID, AUSGABE_ID, DATEN)).toEqual({ art: 'ok', daten: ausgabe })
  })

  it.each(['hologrammnummer_vergeben', 'hologrammnummer_geaendert', 'ausgabe_storniert'] as const)(
    'bildet 409 %s mit code ab',
    async (code) => {
      api.einmal('PUT', PFAD, hologrammKonfliktAntwort(code))

      expect(await aendereHologrammnummer(COIN_ID, AUSGABE_ID, DATEN)).toMatchObject({ art: 'konflikt', code })
    },
  )

  it('bildet 400 als Validierungsfehler je Feld ab', async () => {
    const errors = { grund: ['Bitte einen Grund für die Korrektur angeben.'] }
    api.einmal('PUT', PFAD, problemAntwort(400, { title: 'Eingaben ungültig', errors }))

    expect(await aendereHologrammnummer(COIN_ID, AUSGABE_ID, DATEN)).toEqual({ art: 'validierung', fehler: errors })
  })

  it('bildet 404 auf nichtGefunden ab', async () => {
    api.einmal('PUT', PFAD, problemAntwort(404, { title: 'Ausgabe nicht gefunden' }))

    expect(await aendereHologrammnummer(COIN_ID, AUSGABE_ID, DATEN)).toEqual({ art: 'nichtGefunden' })
  })

  it('bildet 403 auf keinZugriff ab', async () => {
    api.einmal('PUT', PFAD, keinZugriffAntwort('keine_berechtigung'))

    expect(await aendereHologrammnummer(COIN_ID, AUSGABE_ID, DATEN)).toEqual({
      art: 'keinZugriff',
      grund: 'keineBerechtigung',
    })
  })

  it('kodiert die Ids im Pfad', async () => {
    api.einmal('PUT', /hologrammnummer$/, jsonAntwort(200, testAusgabe()))

    await aendereHologrammnummer('a/b', 'c?d', DATEN)

    expect(api.anfragenMit('PUT')[0].pfad).toBe('/api/coins/a%2Fb/ausgaben/c%3Fd/hologrammnummer')
  })
})
