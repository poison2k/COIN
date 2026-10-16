import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  erstelleFakeApi,
  keinZugriffAntwort,
  testCoin,
  testVorlagenStatus,
  testVorlagenVersion,
  type FakeApi,
} from '../../../../test/fakeApi'
import { setzeVorlageZurueck } from './setzeVorlageZurueck'

// Feature zertifikatsvorlagen, AK-20 und Abschnitt 7: setzeVorlageZurueck(coinId) ruft
// POST /api/coins/{id}/zertifikatsvorlage/zuruecksetzen ohne Body auf und liefert den Vorlagenstatus.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000a1'
const PFAD = /^\/api\/coins\/[^/]+\/zertifikatsvorlage\/zuruecksetzen$/

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID })], {
    vorlagen: { [COIN_ID]: testVorlagenStatus([testVorlagenVersion({ version: 1 })], 1) },
  })
  vi.stubGlobal('fetch', api.fetch)
})

describe('setzeVorlageZurueck', () => {
  it('ruft POST …/zertifikatsvorlage/zuruecksetzen auf', async () => {
    await setzeVorlageZurueck(COIN_ID)

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([
      `POST /api/coins/${COIN_ID}/zertifikatsvorlage/zuruecksetzen`,
    ])
  })

  it('sendet keinen Body', async () => {
    await setzeVorlageZurueck(COIN_ID)

    expect(api.anfragen[0].body).toBeNull()
  })

  it('liefert den Status mit Standardvorlage und erhaltenen Versionen', async () => {
    const ergebnis = await setzeVorlageZurueck(COIN_ID)

    expect(ergebnis).toEqual({
      art: 'ok',
      daten: testVorlagenStatus([testVorlagenVersion({ version: 1, aktiv: false })], null),
    })
  })

  it('liefert keinZugriff bei 403', async () => {
    api.einmal('POST', PFAD, keinZugriffAntwort('keine_berechtigung'))

    expect(await setzeVorlageZurueck(COIN_ID)).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })
})
