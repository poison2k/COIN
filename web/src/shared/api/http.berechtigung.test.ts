import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  erstelleFakeApi,
  keinZugriffAntwort,
  konfliktAntwort,
  problemAntwort,
  type FakeApi,
} from '../../../test/fakeApi'
import * as apiModul from './index'
import { sende } from './index'

// Feature rollen-benutzerverwaltung, AK-34: 403 → { art: 'keinZugriff', grund }, 409 → { art: 'konflikt', code },
// Callback setzeBeiDeaktiviert (analog zu setzeBeiNichtAngemeldet).

let api: FakeApi

/** setzeBeiDeaktiviert aus der Public API (fehlt sie, scheitern nur die Tests, die sie brauchen). */
function setzeBeiDeaktiviert(callback: (() => void) | null): void {
  const funktion = (apiModul as Record<string, unknown>).setzeBeiDeaktiviert
  if (typeof funktion !== 'function') throw new Error('shared/api exportiert setzeBeiDeaktiviert nicht.')
  ;(funktion as (cb: (() => void) | null) => void)(callback)
}

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
})

afterEach(() => {
  if (typeof (apiModul as Record<string, unknown>).setzeBeiDeaktiviert === 'function') setzeBeiDeaktiviert(null)
})

function postCoin() {
  return sende('/api/coins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, [201])
}

function putRolle() {
  return sende(
    '/api/benutzer/0199a1b2-0000-7000-8000-00000000b001/rolle',
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"rolle":"Betrachter"}' },
    [200],
  )
}

describe('403 mit grund', () => {
  it('liefert bei code benutzer_deaktiviert den grund deaktiviert', async () => {
    api.einmal('POST', /^\/api\/coins$/, keinZugriffAntwort('benutzer_deaktiviert'))

    expect(await postCoin()).toEqual({ art: 'keinZugriff', grund: 'deaktiviert' })
  })

  it('liefert bei code keine_berechtigung den grund keineBerechtigung', async () => {
    api.einmal('POST', /^\/api\/coins$/, keinZugriffAntwort('keine_berechtigung'))

    expect(await postCoin()).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })

  it('liefert ohne code den grund keineBerechtigung', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(403, { title: 'Kein Zugriff' }))

    expect(await postCoin()).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })

  it('liefert bei 403 ohne lesbaren Body den grund keineBerechtigung', async () => {
    api.einmal('POST', /^\/api\/coins$/, new Response('kein json', { status: 403 }))

    expect(await postCoin()).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })

  it('wertet code aus und nicht den deutschen Text', async () => {
    api.einmal(
      'POST',
      /^\/api\/coins$/,
      problemAntwort(403, {
        title: 'Kein Zugriff',
        detail: 'Ihr Benutzerkonto ist deaktiviert.',
        code: 'keine_berechtigung',
      }),
    )

    expect(await postCoin()).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })
})

describe('409 mit code', () => {
  it.each(['letzter_administrator', 'eigenes_konto'] as const)('liefert code %s', async (code) => {
    api.einmal('PUT', /\/rolle$/, konfliktAntwort(code))

    expect(await putRolle()).toEqual({ art: 'konflikt', code })
  })

  it('liefert code null, wenn die Antwort keinen code hat', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(409, { title: 'Konflikt' }))

    expect(await postCoin()).toEqual({ art: 'konflikt', code: null })
  })

  it('liefert code null bei 409 ohne lesbaren Body', async () => {
    api.einmal('POST', /^\/api\/coins$/, new Response('', { status: 409 }))

    expect(await postCoin()).toEqual({ art: 'konflikt', code: null })
  })
})

describe('setzeBeiDeaktiviert', () => {
  it('wird von shared/api exportiert', () => {
    expect(typeof (apiModul as Record<string, unknown>).setzeBeiDeaktiviert).toBe('function')
  })

  it('ruft den Callback bei 403 benutzer_deaktiviert auf einen schreibenden Aufruf auf', async () => {
    const beiDeaktiviert = vi.fn()
    setzeBeiDeaktiviert(beiDeaktiviert)
    api.einmal('POST', /^\/api\/coins$/, keinZugriffAntwort('benutzer_deaktiviert'))

    await postCoin()

    expect(beiDeaktiviert).toHaveBeenCalledTimes(1)
  })

  it('ruft den Callback bei 403 benutzer_deaktiviert auf einen lesenden Aufruf auf', async () => {
    const beiDeaktiviert = vi.fn()
    setzeBeiDeaktiviert(beiDeaktiviert)
    api.einmal('GET', /^\/api\/benutzer$/, keinZugriffAntwort('benutzer_deaktiviert'))

    await sende('/api/benutzer', { method: 'GET' }, [200])

    expect(beiDeaktiviert).toHaveBeenCalledTimes(1)
  })

  it('ruft den Callback bei 403 keine_berechtigung nicht auf', async () => {
    const beiDeaktiviert = vi.fn()
    setzeBeiDeaktiviert(beiDeaktiviert)
    api.einmal('POST', /^\/api\/coins$/, keinZugriffAntwort('keine_berechtigung'))

    await postCoin()

    expect(beiDeaktiviert).not.toHaveBeenCalled()
  })

  it('ruft den Callback bei 401 nicht auf', async () => {
    const beiDeaktiviert = vi.fn()
    setzeBeiDeaktiviert(beiDeaktiviert)
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(401))

    await postCoin()

    expect(beiDeaktiviert).not.toHaveBeenCalled()
  })

  it('ruft nach dem Entfernen (null) nichts mehr auf', async () => {
    const beiDeaktiviert = vi.fn()
    setzeBeiDeaktiviert(beiDeaktiviert)
    setzeBeiDeaktiviert(null)
    api.einmal('POST', /^\/api\/coins$/, keinZugriffAntwort('benutzer_deaktiviert'))

    await postCoin()

    expect(beiDeaktiviert).not.toHaveBeenCalled()
  })
})
