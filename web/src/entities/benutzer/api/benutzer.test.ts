import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import { erstelleFakeApi, jsonAntwort, problemAntwort, type FakeApi } from '../../../../test/fakeApi'
import { ladeAngemeldetenBenutzer } from '../index'

// AK-20, AK-28, AK-32: GET /api/me im Frontend.

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], { me: ME.admin })
  vi.stubGlobal('fetch', api.fetch)
})

describe('ladeAngemeldetenBenutzer', () => {
  it('ruft GET /api/me auf', async () => {
    await ladeAngemeldetenBenutzer()

    expect(api.anfragen).toHaveLength(1)
    expect(api.anfragen[0].methode).toBe('GET')
    expect(api.anfragen[0].pfad).toBe('/api/me')
  })

  it('liefert bei 200 den Benutzer', async () => {
    expect(await ladeAngemeldetenBenutzer()).toEqual({ art: 'ok', daten: ME.admin })
  })

  it('liefert rolle „keine“ unverändert', async () => {
    api.setzeMe(ME.keine)

    const ergebnis = await ladeAngemeldetenBenutzer()

    expect(ergebnis.art === 'ok' && ergebnis.daten.rolle).toBe('keine')
  })

  it('liefert bei 401 nichtAngemeldet', async () => {
    api.setzeMe(null)

    expect((await ladeAngemeldetenBenutzer()).art).toBe('nichtAngemeldet')
  })

  it('liefert bei 500 fehler', async () => {
    api.einmal('GET', /^\/api\/me$/, problemAntwort(500))

    expect((await ladeAngemeldetenBenutzer()).art).toBe('fehler')
  })

  it('liefert bei Netzwerkfehler fehler statt eine Ausnahme zu werfen', async () => {
    api.netzwerkfehler('GET', /^\/api\/me$/)

    expect((await ladeAngemeldetenBenutzer()).art).toBe('fehler')
  })

  it('liefert bei 200 ohne JSON-Body fehler', async () => {
    api.einmal('GET', /^\/api\/me$/, jsonAntwort(200, undefined))

    expect((await ladeAngemeldetenBenutzer()).art).toBe('fehler')
  })
})
