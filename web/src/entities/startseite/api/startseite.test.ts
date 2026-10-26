import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import { erstelleFakeApi, problemAntwort, type FakeApi } from '../../../../test/fakeApi'
import { aktiverKopf, gespeicherteKonfiguration, testStartseite } from '../../../../test/startseite'
import { ladeKonfiguration, ladeKopf, ladeStartseite } from '../index'

// Feature startseite, Abschnitt 7 (entities/startseite/api): ladeStartseite (GET /api/startseite, coins.read),
// ladeKopf (GET /api/startseite/kopf, öffentlich) und ladeKonfiguration (GET /api/startseite/konfiguration,
// startpage.manage). Ergebnisse als ApiErgebnis ohne Ausnahmen.

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], { me: ME.admin })
  vi.stubGlobal('fetch', api.fetch)
})

describe('ladeStartseite', () => {
  it('ruft GET /api/startseite auf', async () => {
    await ladeStartseite()

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual(['GET /api/startseite'])
  })

  it('liefert die Blöcke', async () => {
    api.startseite.ansicht = testStartseite()

    expect(await ladeStartseite()).toEqual({ art: 'ok', daten: testStartseite() })
  })

  it('liefert bei 403 keinZugriff', async () => {
    api.setzeMe(ME.keine)

    expect(await ladeStartseite()).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })

  it('liefert bei einem Serverfehler fehler', async () => {
    api.einmal('GET', /^\/api\/startseite$/, problemAntwort(500))

    expect((await ladeStartseite()).art).toBe('fehler')
  })
})

describe('ladeKopf', () => {
  it('ruft GET /api/startseite/kopf auf', async () => {
    await ladeKopf()

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual(['GET /api/startseite/kopf'])
  })

  it('liefert den Kopfbereich', async () => {
    api.startseite.kopf = aktiverKopf()

    expect(await ladeKopf()).toEqual({ art: 'ok', daten: aktiverKopf() })
  })

  it('liefert den Kopfbereich auch ohne Anmeldung', async () => {
    api.setzeMe(null)
    api.startseite.kopf = aktiverKopf()

    expect((await ladeKopf()).art).toBe('ok')
  })

  it('liefert bei einem Netzwerkfehler fehler', async () => {
    api.netzwerkfehler('GET', /^\/api\/startseite\/kopf$/)

    expect((await ladeKopf()).art).toBe('fehler')
  })
})

describe('ladeKonfiguration', () => {
  it('ruft GET /api/startseite/konfiguration auf und liefert die Konfiguration', async () => {
    api.startseite.konfiguration = gespeicherteKonfiguration()

    expect(await ladeKonfiguration()).toEqual({ art: 'ok', daten: gespeicherteKonfiguration() })
    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual(['GET /api/startseite/konfiguration'])
  })

  it('liefert für Betrachter keinZugriff', async () => {
    api.setzeMe(ME.betrachter)

    expect(await ladeKonfiguration()).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })
})
