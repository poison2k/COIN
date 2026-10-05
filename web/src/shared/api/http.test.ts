import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import { erstelleFakeApi, jsonAntwort, problemAntwort, type FakeApi } from '../../../test/fakeApi'
import { sende, setzeBeiNichtAngemeldet } from './index'

// AK-27: Bearer-Header bei API-Aufrufen, 401 → nichtAngemeldet (+ Callback), 403 → keinZugriff.
// AK-26: Nach einer Erneuerung wird das neue Token gesendet (Token wird pro Aufruf gelesen).

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
})

afterEach(() => {
  setzeTokenQuelle(null)
  setzeBeiNichtAngemeldet(null)
})

function postCoin() {
  return sende('/api/coins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, [201])
}

describe('Bearer-Header', () => {
  it('sendet angemeldet Authorization: Bearer <Access-Token>', async () => {
    setzeTokenQuelle(() => 'token-123')

    await sende('/api/coins', { method: 'GET' }, [200])

    expect(api.anfragen[0].headers.get('Authorization')).toBe('Bearer token-123')
  })

  it('unterstützt eine asynchrone Token-Quelle', async () => {
    setzeTokenQuelle(async () => 'token-async')

    await sende('/api/coins', { method: 'GET' }, [200])

    expect(api.anfragen[0].headers.get('Authorization')).toBe('Bearer token-async')
  })

  it('sendet anonym keinen Authorization-Header', async () => {
    setzeTokenQuelle(() => null)

    await sende('/api/coins', { method: 'GET' }, [200])

    expect(api.anfragen[0].headers.has('Authorization')).toBe(false)
  })

  it('sendet ohne registrierte Token-Quelle keinen Authorization-Header', async () => {
    await sende('/api/coins', { method: 'GET' }, [200])

    expect(api.anfragen[0].headers.has('Authorization')).toBe(false)
  })

  it('behält die übrigen Header der Anfrage', async () => {
    setzeTokenQuelle(() => 'token-123')

    await sende('/api/coins', { method: 'GET', headers: { Accept: 'application/json' } }, [200])

    expect(api.anfragen[0].headers.get('Accept')).toBe('application/json')
  })

  it('sendet keinen Authorization-Header an eine fremde Origin', async () => {
    setzeTokenQuelle(() => 'token-123')

    await sende('https://fremd.example/api/coins', { method: 'GET' }, [200])

    expect(api.anfragen[0].headers.has('Authorization')).toBe(false)
  })

  it('sendet keinen Authorization-Header an eine protokollrelative URL', async () => {
    setzeTokenQuelle(() => 'token-123')

    await sende('//fremd.example/api/coins', { method: 'GET' }, [200])

    expect(api.anfragen[0].headers.has('Authorization')).toBe(false)
  })

  it('sendet keinen Authorization-Header an einen Pfad außerhalb von /api/', async () => {
    setzeTokenQuelle(() => 'token-123')

    await sende('/andere/daten', { method: 'GET' }, [200])

    expect(api.anfragen[0].headers.has('Authorization')).toBe(false)
  })

  it('sendet keinen Authorization-Header an /apix (nur Präfix /api/)', async () => {
    setzeTokenQuelle(() => 'token-123')

    await sende('/apix/coins', { method: 'GET' }, [200])

    expect(api.anfragen[0].headers.has('Authorization')).toBe(false)
  })

  it('sendet den Authorization-Header an eine absolute URL derselben Origin unter /api/', async () => {
    setzeTokenQuelle(() => 'token-123')

    await sende(`${window.location.origin}/api/coins`, { method: 'GET' }, [200])

    expect(api.anfragen[0].headers.get('Authorization')).toBe('Bearer token-123')
  })

  it('liest das Token bei jedem Aufruf neu (nach Erneuerung das neue Token)', async () => {
    const tokens = ['token-alt', 'token-neu']
    setzeTokenQuelle(() => tokens.shift() ?? null)

    await sende('/api/coins', { method: 'GET' }, [200])
    await sende('/api/coins', { method: 'GET' }, [200])

    expect(api.anfragen.map((a) => a.headers.get('Authorization'))).toEqual(['Bearer token-alt', 'Bearer token-neu'])
  })
})

describe('401 und 403', () => {
  it('liefert bei 401 die Art nichtAngemeldet', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(401, { title: 'Nicht angemeldet' }))

    expect((await postCoin()).art).toBe('nichtAngemeldet')
  })

  it('ruft bei 401 auf einen schreibenden Aufruf den registrierten Callback auf', async () => {
    const beiNichtAngemeldet = vi.fn()
    setzeBeiNichtAngemeldet(beiNichtAngemeldet)
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(401))

    await postCoin()

    expect(beiNichtAngemeldet).toHaveBeenCalledTimes(1)
  })

  it('ruft bei 401 auf PUT den registrierten Callback auf', async () => {
    const beiNichtAngemeldet = vi.fn()
    setzeBeiNichtAngemeldet(beiNichtAngemeldet)
    api.einmal('PUT', /\/bild$/, problemAntwort(401))

    await sende('/api/coins/x/bild', { method: 'PUT', body: new FormData() }, [200])

    expect(beiNichtAngemeldet).toHaveBeenCalledTimes(1)
  })

  it('ruft den Callback bei Erfolg nicht auf', async () => {
    const beiNichtAngemeldet = vi.fn()
    setzeBeiNichtAngemeldet(beiNichtAngemeldet)
    api.einmal('POST', /^\/api\/coins$/, jsonAntwort(201, { id: '1' }))

    await postCoin()

    expect(beiNichtAngemeldet).not.toHaveBeenCalled()
  })

  it('liefert bei 403 die Art keinZugriff', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(403, { title: 'Kein Zugriff' }))

    expect((await postCoin()).art).toBe('keinZugriff')
  })

  it('ruft bei 403 den Callback für 401 nicht auf', async () => {
    const beiNichtAngemeldet = vi.fn()
    setzeBeiNichtAngemeldet(beiNichtAngemeldet)
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(403))

    await postCoin()

    expect(beiNichtAngemeldet).not.toHaveBeenCalled()
  })

  it('liefert bei Netzwerkfehler weiterhin fehler, auch angemeldet', async () => {
    setzeTokenQuelle(() => 'token-123')
    api.netzwerkfehler('POST', /^\/api\/coins$/)

    expect((await postCoin()).art).toBe('fehler')
  })
})
