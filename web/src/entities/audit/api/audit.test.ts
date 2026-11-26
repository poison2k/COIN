import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  erstelleFakeApi,
  jsonAntwort,
  keinZugriffAntwort,
  problemAntwort,
  testAuditEintrag,
  type FakeApi,
} from '../../../../test/fakeApi'
import { ladeAuditAktionen, ladeAuditLog } from '../index'

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

// Feature nacharbeiten-audit-filter, AK-14 (Abschnitt 4.4 „Requests“, 4.12): `ladeAuditLog` mit `von`, `bis` und
// `aktionen` (je Aktion ein Parameter `aktion`), nur gesetzte Filter; `ladeAuditAktionen()` für GET /api/audit/aktionen.

describe('ladeAuditLog mit Zeitraum und Aktionen (AK-14)', () => {
  it('sendet von und bis, wenn angegeben', async () => {
    await ladeAuditLog({ von: '2026-10-01', bis: '2026-10-31', seite: 1, groesse: 25 })

    expect(api.anfragen.at(-1)?.query.get('von')).toBe('2026-10-01')
    expect(api.anfragen.at(-1)?.query.get('bis')).toBe('2026-10-31')
  })

  it('sendet je Aktion einen Parameter aktion in der übergebenen Reihenfolge', async () => {
    await ladeAuditLog({ aktionen: ['Rolle', 'Status'], seite: 1, groesse: 25 })

    expect(api.anfragen.at(-1)?.query.getAll('aktion')).toEqual(['Rolle', 'Status'])
  })

  it('sendet keine kommagetrennte Aktionsliste', async () => {
    await ladeAuditLog({ aktionen: ['Rolle', 'Status'], seite: 1, groesse: 25 })

    expect(api.anfragen.at(-1)?.query.getAll('aktion')).not.toContain('Rolle,Status')
  })

  it('sendet ohne Filter weder von noch bis noch aktion', async () => {
    await ladeAuditLog({ seite: 1, groesse: 25 })

    const query = api.anfragen.at(-1)!.query
    expect([query.has('von'), query.has('bis'), query.has('aktion')]).toEqual([false, false, false])
  })

  it('sendet mit leerer Aktionsliste keinen Parameter aktion', async () => {
    await ladeAuditLog({ aktionen: [], seite: 1, groesse: 25 })

    expect(api.anfragen.at(-1)?.query.has('aktion')).toBe(false)
  })

  it('sendet genau die Parameter von, bis, aktion, benutzerId, seite und groesse', async () => {
    await ladeAuditLog({
      von: '2026-10-01',
      bis: '2026-10-31',
      aktionen: ['Status'],
      benutzerId: '0199a1b2-0000-7000-8000-00000000b001',
      seite: 2,
      groesse: 25,
    })

    expect([...new Set(api.anfragen.at(-1)!.query.keys())].sort()).toEqual([
      'aktion',
      'benutzerId',
      'bis',
      'groesse',
      'seite',
      'von',
    ])
  })

  it('liefert bei 400 die Feldfehler von, bis und aktion', async () => {
    api.einmal(
      'GET',
      /^\/api\/audit$/,
      problemAntwort(400, {
        title: 'Ungültige Anfrage',
        errors: {
          bis: ['Das Datum „bis“ darf nicht vor dem Datum „von“ liegen.'],
          aktion: ['Unbekannte Aktion. Erlaubt sind: Rolle, Status.'],
        },
      }),
    )

    const ergebnis = await ladeAuditLog({
      von: '2026-10-31',
      bis: '2026-10-01',
      aktionen: ['x'],
      seite: 1,
      groesse: 25,
    })

    expect(ergebnis).toMatchObject({
      art: 'validierung',
      fehler: {
        bis: ['Das Datum „bis“ darf nicht vor dem Datum „von“ liegen.'],
        aktion: ['Unbekannte Aktion. Erlaubt sind: Rolle, Status.'],
      },
    })
  })
})

describe('ladeAuditAktionen (AK-7, AK-13)', () => {
  it('ruft GET /api/audit/aktionen auf', async () => {
    await ladeAuditAktionen()

    expect(api.anfragen.at(-1)?.methode).toBe('GET')
    expect(api.anfragen.at(-1)?.pfad).toBe('/api/audit/aktionen')
  })

  it('liefert bei 200 die Liste mit wert und bezeichnung', async () => {
    expect(await ladeAuditAktionen()).toEqual({
      art: 'ok',
      daten: [
        { wert: 'Rolle', bezeichnung: 'Rolle' },
        { wert: 'Status', bezeichnung: 'Status' },
      ],
    })
  })

  it('übernimmt Bezeichnungen aus der API unverändert', async () => {
    api.einmal('GET', /^\/api\/audit\/aktionen$/, jsonAntwort(200, [{ wert: 'Rolle', bezeichnung: 'Rollenänderung' }]))

    expect(await ladeAuditAktionen()).toEqual({ art: 'ok', daten: [{ wert: 'Rolle', bezeichnung: 'Rollenänderung' }] })
  })

  it('liefert bei 403 keinZugriff', async () => {
    api.einmal('GET', /^\/api\/audit\/aktionen$/, keinZugriffAntwort('keine_berechtigung'))

    expect((await ladeAuditAktionen()).art).toBe('keinZugriff')
  })

  it('liefert bei Netzwerkfehler fehler', async () => {
    api.netzwerkfehler('GET', /^\/api\/audit\/aktionen$/)

    expect((await ladeAuditAktionen()).art).toBe('fehler')
  })
})
