import { beforeEach, describe, expect, it, vi } from 'vitest'
import { erstelleFakeApi, keinZugriffAntwort, testAuditEintrag, type FakeApi } from '../../../../test/fakeApi'
import { ladeAuditLog } from '../index'

// Feature rollen-benutzerverwaltung, AK-14, AK-31: GET /api/audit im Frontend.

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], { audit: [testAuditEintrag()] })
  vi.stubGlobal('fetch', api.fetch)
})

describe('ladeAuditLog', () => {
  it('ruft GET /api/audit auf', async () => {
    await ladeAuditLog({ seite: 1, groesse: 25 })

    expect(api.anfragen.at(-1)?.methode).toBe('GET')
    expect(api.anfragen.at(-1)?.pfad).toBe('/api/audit')
  })

  it('sendet seite und groesse als Query-Parameter', async () => {
    await ladeAuditLog({ seite: 2, groesse: 10 })

    expect(api.anfragen.at(-1)?.query.get('seite')).toBe('2')
    expect(api.anfragen.at(-1)?.query.get('groesse')).toBe('10')
  })

  it('sendet benutzerId, wenn angegeben', async () => {
    await ladeAuditLog({ benutzerId: '0199a1b2-0000-7000-8000-00000000b001', seite: 1, groesse: 25 })

    expect(api.anfragen.at(-1)?.query.get('benutzerId')).toBe('0199a1b2-0000-7000-8000-00000000b001')
  })

  it('sendet ohne benutzerId keinen Filter', async () => {
    await ladeAuditLog({ seite: 1, groesse: 25 })

    expect(api.anfragen.at(-1)?.query.has('benutzerId')).toBe(false)
  })

  it('liefert bei 200 die Seite mit den Einträgen', async () => {
    expect(await ladeAuditLog({ seite: 1, groesse: 25 })).toEqual({
      art: 'ok',
      daten: { eintraege: [testAuditEintrag()], gesamt: 1, seite: 1, groesse: 25 },
    })
  })

  it('liefert bei 403 keinZugriff', async () => {
    api.einmal('GET', /^\/api\/audit$/, keinZugriffAntwort('keine_berechtigung'))

    expect((await ladeAuditLog({ seite: 1, groesse: 25 })).art).toBe('keinZugriff')
  })

  it('liefert bei Netzwerkfehler fehler', async () => {
    api.netzwerkfehler('GET', /^\/api\/audit$/)

    expect((await ladeAuditLog({ seite: 1, groesse: 25 })).art).toBe('fehler')
  })
})
