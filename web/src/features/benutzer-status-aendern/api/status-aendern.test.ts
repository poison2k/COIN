import { beforeEach, describe, expect, it, vi } from 'vitest'
import { erstelleFakeApi, konfliktAntwort, testBenutzerEintrag, type FakeApi } from '../../../../test/fakeApi'
import { setzeStatus } from './status-aendern'

// Feature rollen-benutzerverwaltung, AK-13, AK-28: PUT /api/benutzer/{id}/status.

const ID = '0199a1b2-0000-7000-8000-00000000b001'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], { benutzer: [testBenutzerEintrag({ id: ID, rolle: 'Betrachter' })] })
  vi.stubGlobal('fetch', api.fetch)
})

describe('setzeStatus', () => {
  it('sendet PUT an /api/benutzer/{id}/status', async () => {
    await setzeStatus(ID, false)

    expect(api.anfragen.at(-1)?.methode).toBe('PUT')
    expect(api.anfragen.at(-1)?.pfad).toBe(`/api/benutzer/${ID}/status`)
  })

  it.each([true, false])('sendet den Body {"aktiv":%s} als JSON', async (aktiv) => {
    await setzeStatus(ID, aktiv)

    expect(api.anfragen.at(-1)?.body).toEqual({ aktiv })
    expect(api.anfragen.at(-1)?.headers.get('Content-Type')).toMatch(/^application\/json/)
  })

  it('liefert bei 200 den geänderten Eintrag', async () => {
    const ergebnis = await setzeStatus(ID, false)

    expect(ergebnis.art === 'ok' && ergebnis.daten.aktiv).toBe(false)
  })

  it('liefert bei 409 den code', async () => {
    api.einmal('PUT', /\/status$/, konfliktAntwort('letzter_administrator'))

    expect(await setzeStatus(ID, false)).toEqual({ art: 'konflikt', code: 'letzter_administrator' })
  })
})
