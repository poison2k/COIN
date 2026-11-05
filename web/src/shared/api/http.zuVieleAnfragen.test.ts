import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import { erstelleFakeApi, zuVielePruefungenAntwort, type FakeApi } from '../../../test/fakeApi'
import { bildeAb, sende, setzeBeiNichtAngemeldet } from './index'

// Feature hologrammnummer, AK-32 (Abschnitt 8): ApiErgebnis kennt 429 als
// { art: 'zuVieleAnfragen'; wiederholenNachSekunden: number | null } mit den Sekunden aus `Retry-After`.

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
})

afterEach(() => {
  setzeTokenQuelle(null)
  setzeBeiNichtAngemeldet(null)
})

function pruefe() {
  return sende(
    '/api/pruefung',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"hologrammnummer":"AB1234"}' },
    [200],
  )
}

describe('429 Zu viele Anfragen', () => {
  it('bildet 429 mit Retry-After auf zuVieleAnfragen mit den Sekunden ab', async () => {
    api.einmal('POST', /^\/api\/pruefung$/, zuVielePruefungenAntwort('30'))

    expect(await pruefe()).toEqual({ art: 'zuVieleAnfragen', wiederholenNachSekunden: 30 })
  })

  it('liefert ohne Retry-After wiederholenNachSekunden null', async () => {
    api.einmal('POST', /^\/api\/pruefung$/, zuVielePruefungenAntwort())

    expect(await pruefe()).toEqual({ art: 'zuVieleAnfragen', wiederholenNachSekunden: null })
  })

  it('liefert bei einem nicht lesbaren Retry-After wiederholenNachSekunden null', async () => {
    api.einmal('POST', /^\/api\/pruefung$/, zuVielePruefungenAntwort('bald'))

    expect(await pruefe()).toEqual({ art: 'zuVieleAnfragen', wiederholenNachSekunden: null })
  })

  it('übernimmt eine einstellige Sekundenangabe', async () => {
    api.einmal('POST', /^\/api\/pruefung$/, zuVielePruefungenAntwort('1'))

    expect(await pruefe()).toEqual({ art: 'zuVieleAnfragen', wiederholenNachSekunden: 1 })
  })

  it('bildet 429 auch über bildeAb ab', async () => {
    expect(await bildeAb(zuVielePruefungenAntwort('60'), [200])).toEqual({
      art: 'zuVieleAnfragen',
      wiederholenNachSekunden: 60,
    })
  })

  it('löst bei 429 keine Anmeldung aus', async () => {
    const callback = vi.fn()
    setzeBeiNichtAngemeldet(callback)
    api.einmal('POST', /^\/api\/pruefung$/, zuVielePruefungenAntwort('30'))

    await pruefe()

    expect(callback).not.toHaveBeenCalled()
  })

  it('bildet einen anderen Fehlerstatus weiterhin auf fehler ab', async () => {
    api.einmal('POST', /^\/api\/pruefung$/, new Response(null, { status: 503 }))

    expect(await pruefe()).toEqual({ art: 'fehler' })
  })
})
