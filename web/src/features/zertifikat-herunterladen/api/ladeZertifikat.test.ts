import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import {
  erstelleFakeApi,
  keinZugriffAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  zertifikatKonfliktAntwort,
  type FakeApi,
} from '../../../../test/fakeApi'
import { ladeZertifikat } from './ladeZertifikat'

// Feature zertifikat-erzeugen, AK-25 und AK-26: ladeZertifikat(coinId, ausgabeId) lädt
// GET /api/coins/{id}/ausgaben/{ausgabeId}/zertifikat per fetch mit Token (nie in der URL) und bildet die Fehler ab;
// bei 409 mit code und detail (vorlage_zu_viele_platzhalter zeigt den Text aus detail).

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const AUSGABE_ID = '0199a1b2-0000-7000-8000-0000000000e7'
const PFAD = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+\/zertifikat$/
const ZU_VIELE = 'Die aktive Vorlage enthält mehr als 200 Platzhalter. Bitte eine angepasste Vorlage hochladen.'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID })], {
    ausgaben: { [COIN_ID]: [testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12 })] },
  })
  vi.stubGlobal('fetch', api.fetch)
  setzeTokenQuelle(() => 'token-zertifikat')
})

afterEach(() => {
  setzeTokenQuelle(null)
})

describe('ladeZertifikat', () => {
  it('ruft GET …/ausgaben/{ausgabeId}/zertifikat auf', async () => {
    await ladeZertifikat(COIN_ID, AUSGABE_ID)

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([
      `GET /api/coins/${COIN_ID}/ausgaben/${AUSGABE_ID}/zertifikat`,
    ])
  })

  it('sendet das Token im Authorization-Header und nicht in der URL', async () => {
    await ladeZertifikat(COIN_ID, AUSGABE_ID)

    expect(api.anfragen[0].headers.get('Authorization')).toBe('Bearer token-zertifikat')
    expect(api.anfragen[0].query.toString()).toBe('')
    expect(api.anfragen[0].pfad).not.toContain('token')
  })

  it('kodiert beide Ids im Pfad', async () => {
    await ladeZertifikat('a/b', 'c/d')

    expect(api.anfragen[0].pfad).toBe('/api/coins/a%2Fb/ausgaben/c%2Fd/zertifikat')
  })

  it('liefert bei 200 die Datei mit dem Namen aus Content-Disposition', async () => {
    const ergebnis = await ladeZertifikat(COIN_ID, AUSGABE_ID)

    expect(ergebnis.art).toBe('ok')
    if (ergebnis.art !== 'ok') return
    expect(ergebnis.daten.dateiname).toBe('Zertifikat_C0042-0012.docx')
    expect(await ergebnis.daten.blob.text()).toBe('PK-zertifikat-C0042-0012')
  })

  it('liefert bei 409 ausgabe_storniert einen Konflikt mit diesem code', async () => {
    api.einmal('GET', PFAD, zertifikatKonfliktAntwort('ausgabe_storniert'))

    const ergebnis = await ladeZertifikat(COIN_ID, AUSGABE_ID)

    expect(ergebnis.art === 'konflikt' && ergebnis.code).toBe('ausgabe_storniert')
  })

  it('liefert bei 409 vorlage_zu_viele_platzhalter den Text aus detail', async () => {
    api.einmal('GET', PFAD, zertifikatKonfliktAntwort('vorlage_zu_viele_platzhalter'))

    expect(await ladeZertifikat(COIN_ID, AUSGABE_ID)).toEqual({
      art: 'konflikt',
      code: 'vorlage_zu_viele_platzhalter',
      detail: ZU_VIELE,
    })
  })

  it('liefert keinZugriff bei 403', async () => {
    api.einmal('GET', PFAD, keinZugriffAntwort('keine_berechtigung'))

    expect(await ladeZertifikat(COIN_ID, AUSGABE_ID)).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })

  it('liefert nichtGefunden bei 404', async () => {
    api.einmal('GET', PFAD, problemAntwort(404, { title: 'Ausgabe nicht gefunden' }))

    expect(await ladeZertifikat(COIN_ID, AUSGABE_ID)).toEqual({ art: 'nichtGefunden' })
  })

  it('liefert fehler bei 500', async () => {
    api.einmal('GET', PFAD, problemAntwort(500, { code: 'zertifikat_fehler' }))

    expect(await ladeZertifikat(COIN_ID, AUSGABE_ID)).toEqual({ art: 'fehler' })
  })

  it('liefert fehler bei einem Netzwerkfehler', async () => {
    api.netzwerkfehler('GET', PFAD)

    expect(await ladeZertifikat(COIN_ID, AUSGABE_ID)).toEqual({ art: 'fehler' })
  })

  it('liefert ok auch bei einer 200 ohne Content-Disposition (Name dann null)', async () => {
    api.einmal(
      'GET',
      PFAD,
      new Response(new TextEncoder().encode('PK-ohne-name'), { status: 200, headers: { 'Content-Type': 'x' } }),
    )

    const ergebnis = await ladeZertifikat(COIN_ID, AUSGABE_ID)

    expect(ergebnis.art === 'ok' && ergebnis.daten.dateiname).toBeNull()
  })
})
