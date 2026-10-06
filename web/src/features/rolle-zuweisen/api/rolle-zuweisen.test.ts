import { beforeEach, describe, expect, it, vi } from 'vitest'
import { erstelleFakeApi, konfliktAntwort, testBenutzerEintrag, type FakeApi } from '../../../../test/fakeApi'
import { weiseRolleZu } from './rolle-zuweisen'

// Feature rollen-benutzerverwaltung, AK-12, AK-27: PUT /api/benutzer/{id}/rolle.

const ID = '0199a1b2-0000-7000-8000-00000000b001'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], { benutzer: [testBenutzerEintrag({ id: ID })] })
  vi.stubGlobal('fetch', api.fetch)
})

describe('weiseRolleZu', () => {
  it('sendet PUT an /api/benutzer/{id}/rolle', async () => {
    await weiseRolleZu(ID, 'Betrachter')

    expect(api.anfragen.at(-1)?.methode).toBe('PUT')
    expect(api.anfragen.at(-1)?.pfad).toBe(`/api/benutzer/${ID}/rolle`)
  })

  it('sendet den Body {"rolle":"Betrachter"} als JSON', async () => {
    await weiseRolleZu(ID, 'Betrachter')

    expect(api.anfragen.at(-1)?.body).toEqual({ rolle: 'Betrachter' })
    expect(api.anfragen.at(-1)?.headers.get('Content-Type')).toMatch(/^application\/json/)
  })

  it('sendet „keine“ zum Entziehen der Rolle', async () => {
    await weiseRolleZu(ID, 'keine')

    expect(api.anfragen.at(-1)?.body).toEqual({ rolle: 'keine' })
  })

  it('kodiert die Id im Pfad', async () => {
    await weiseRolleZu('a/b', 'Betrachter')

    expect(api.anfragen.at(-1)?.pfad).toBe('/api/benutzer/a%2Fb/rolle')
  })

  it('liefert bei 200 den geänderten Eintrag', async () => {
    const ergebnis = await weiseRolleZu(ID, 'Sachbearbeiter')

    expect(ergebnis.art === 'ok' && ergebnis.daten.rolle).toBe('Sachbearbeiter')
  })

  it('liefert bei 409 den code', async () => {
    api.einmal('PUT', /\/rolle$/, konfliktAntwort('eigenes_konto'))

    expect(await weiseRolleZu(ID, 'Betrachter')).toEqual({ art: 'konflikt', code: 'eigenes_konto' })
  })
})
