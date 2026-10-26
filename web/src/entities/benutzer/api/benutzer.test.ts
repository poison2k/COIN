import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import {
  erstelleFakeApi,
  jsonAntwort,
  keinZugriffAntwort,
  problemAntwort,
  testBenutzerEintrag,
  type FakeApi,
} from '../../../../test/fakeApi'
import { ladeAngemeldetenBenutzer, ladeBenutzerliste } from '../index'

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

// ---------- Feature rollen-benutzerverwaltung ----------

describe('ladeAngemeldetenBenutzer bei deaktiviertem Konto (AK-32, AK-34)', () => {
  it('liefert bei 403 benutzer_deaktiviert keinZugriff mit grund deaktiviert', async () => {
    api.setzeMe('deaktiviert')

    expect(await ladeAngemeldetenBenutzer()).toEqual({ art: 'keinZugriff', grund: 'deaktiviert' })
  })

  it('liefert berechtigungen unverändert', async () => {
    const ergebnis = await ladeAngemeldetenBenutzer()

    expect(ergebnis.art === 'ok' && ergebnis.daten.berechtigungen).toEqual([
      'audit.read',
      'coins.read',
      'coins.write',
      'issues.read',
      'issues.write',
      // startseite (AK-15): ME.admin hat zusätzlich startpage.manage.
      'startpage.manage',
      'users.manage',
    ])
  })
})

describe('ladeBenutzerliste (AK-11)', () => {
  it('ruft GET /api/benutzer auf', async () => {
    await ladeBenutzerliste({ suche: '', seite: 1, groesse: 25 })

    expect(api.anfragen.at(-1)?.methode).toBe('GET')
    expect(api.anfragen.at(-1)?.pfad).toBe('/api/benutzer')
  })

  it('sendet seite und groesse als Query-Parameter', async () => {
    await ladeBenutzerliste({ suche: '', seite: 3, groesse: 10 })

    const query = api.anfragen.at(-1)?.query
    expect(query?.get('seite')).toBe('3')
    expect(query?.get('groesse')).toBe('10')
  })

  it('sendet die Suche URL-kodiert', async () => {
    await ladeBenutzerliste({ suche: 'a&b=c %_\\ ä@test.local', seite: 1, groesse: 25 })

    expect(api.anfragen.at(-1)?.query.get('suche')).toBe('a&b=c %_\\ ä@test.local')
  })

  it('sendet eine leere Suche nicht als Filter', async () => {
    await ladeBenutzerliste({ suche: '', seite: 1, groesse: 25 })

    expect(api.anfragen.at(-1)?.query.get('suche') ?? '').toBe('')
  })

  it('liefert bei 200 die Seite', async () => {
    const eintrag = testBenutzerEintrag({ name: 'Test Liste' })
    api.benutzer.push(eintrag)

    expect(await ladeBenutzerliste({ suche: '', seite: 1, groesse: 25 })).toEqual({
      art: 'ok',
      daten: { eintraege: [eintrag], gesamt: 1, seite: 1, groesse: 25 },
    })
  })

  it('sendet das Access-Token nicht an fremde Ziele (nur eigene API)', async () => {
    await ladeBenutzerliste({ suche: '', seite: 1, groesse: 25 })

    expect(api.anfragen.at(-1)?.pfad.startsWith('/api/')).toBe(true)
  })

  it('liefert bei 403 keinZugriff', async () => {
    api.einmal('GET', /^\/api\/benutzer$/, keinZugriffAntwort('keine_berechtigung'))

    expect((await ladeBenutzerliste({ suche: '', seite: 1, groesse: 25 })).art).toBe('keinZugriff')
  })

  it('liefert bei Netzwerkfehler fehler', async () => {
    api.netzwerkfehler('GET', /^\/api\/benutzer$/)

    expect((await ladeBenutzerliste({ suche: '', seite: 1, groesse: 25 })).art).toBe('fehler')
  })
})
