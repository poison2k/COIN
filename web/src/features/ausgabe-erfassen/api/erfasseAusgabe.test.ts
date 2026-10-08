import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ausgabeKonfliktAntwort,
  erstelleFakeApi,
  jsonAntwort,
  keinZugriffAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { erfasseAusgabe } from './erfasseAusgabe'

// Feature coin-ausgaben, AK-6 bis AK-8: erfasseAusgabe(coinId, daten) ruft POST /api/coins/{id}/ausgaben mit dem
// Request-Format aus Abschnitt 5.2 auf; 409 wird mit `code` abgebildet.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const PFAD = /^\/api\/coins\/[^/]+\/ausgaben$/

const DATEN = {
  exemplarNummer: null,
  empfaengerName: 'Max Beispiel',
  empfaengerDienstgrad: 'Hauptmann',
  empfaengerDienststelle: null,
  datum: '2026-10-01',
  gelegenheit: 'Truppenbesuch',
  begruendung: 'Herausragende Leistung',
  ausgebendeStelle: 'Kommandeur Beispielbataillon 1',
}

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID, auflage: 150 })])
  vi.stubGlobal('fetch', api.fetch)
})

describe('erfasseAusgabe', () => {
  it('ruft POST /api/coins/{id}/ausgaben auf', async () => {
    await erfasseAusgabe(COIN_ID, DATEN)

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([`POST /api/coins/${COIN_ID}/ausgaben`])
  })

  it('sendet die Daten unverändert als JSON', async () => {
    await erfasseAusgabe(COIN_ID, DATEN)

    expect(api.anfragen[0].body).toEqual(DATEN)
    expect(api.anfragen[0].headers.get('Content-Type')).toMatch(/^application\/json/)
  })

  it('liefert ok mit der Ausgabe bei 201', async () => {
    const ausgabe = testAusgabe({ exemplarNummer: 12 })
    api.einmal('POST', PFAD, jsonAntwort(201, ausgabe))

    expect(await erfasseAusgabe(COIN_ID, DATEN)).toEqual({ art: 'ok', daten: ausgabe })
  })

  it('liefert validierung mit den Feldfehlern bei 400', async () => {
    const errors = { datum: ['Das Datum darf nicht in der Zukunft liegen.'] }
    api.einmal('POST', PFAD, problemAntwort(400, { title: 'Eingaben ungültig', errors }))

    expect(await erfasseAusgabe(COIN_ID, DATEN)).toEqual({ art: 'validierung', fehler: errors })
  })

  it.each(['auflage_unbekannt', 'exemplar_ausgegeben', 'kein_exemplar_frei'] as const)(
    'liefert konflikt mit code %s bei 409',
    async (code) => {
      api.einmal('POST', PFAD, ausgabeKonfliktAntwort(code))

      expect(await erfasseAusgabe(COIN_ID, DATEN)).toEqual({ art: 'konflikt', code })
    },
  )

  it('liefert keinZugriff bei 403', async () => {
    api.einmal('POST', PFAD, keinZugriffAntwort('keine_berechtigung'))

    expect(await erfasseAusgabe(COIN_ID, DATEN)).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })

  it('liefert nichtAngemeldet bei 401', async () => {
    api.einmal('POST', PFAD, problemAntwort(401))

    expect(await erfasseAusgabe(COIN_ID, DATEN)).toEqual({ art: 'nichtAngemeldet' })
  })

  it('liefert nichtGefunden bei 404', async () => {
    api.einmal('POST', PFAD, problemAntwort(404))

    expect(await erfasseAusgabe(COIN_ID, DATEN)).toEqual({ art: 'nichtGefunden' })
  })

  it('liefert fehler bei einem Netzwerkfehler', async () => {
    api.netzwerkfehler('POST', PFAD)

    expect(await erfasseAusgabe(COIN_ID, DATEN)).toEqual({ art: 'fehler' })
  })
})
