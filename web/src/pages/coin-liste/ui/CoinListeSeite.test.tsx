import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  erstelleFakeApi,
  jsonAntwort,
  offeneAntwort,
  problemAntwort,
  testCoin,
  testDatei,
  type FakeApi,
} from '../../../../test/fakeApi'
import { formularFelder, fuelleAus, meldungMit, seitentext, TEXTE } from '../../../../test/hilfen'
import { CoinListeSeite } from './CoinListeSeite'

// AK-28, AK-29, AK-33, AK-34, AK-36: Zusammenspiel von Liste und Formular auf der Startseite.

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
})

function zeigeSeite() {
  const user = userEvent.setup({ applyAccept: false })
  render(<CoinListeSeite />)
  return { user }
}

const LADEHINWEIS = /Coins werden geladen/
const LADEFEHLER = /Coins konnten nicht geladen werden/
const GET_LISTE = /^\/api\/coins$/
const PUT_BILD = /^\/api\/coins\/[^/]+\/bild$/

async function zeileVon(name: string): Promise<HTMLElement> {
  const zelle = await screen.findByRole('cell', { name })
  return zelle.closest('tr') as HTMLElement
}

describe('AK-29: Laden der Liste', () => {
  it('zeigt einen Ladehinweis, solange die Liste lädt', async () => {
    const offen = offeneAntwort()
    api.einmal('GET', GET_LISTE, () => offen.promise)

    zeigeSeite()

    expect(await screen.findByText(LADEHINWEIS)).toBeInTheDocument()
    offen.aufloesen(jsonAntwort(200, []))
  })

  it('blendet den Ladehinweis nach dem Laden aus', async () => {
    zeigeSeite()

    await screen.findByText(TEXTE.leereListe)
    expect(screen.queryByText(LADEHINWEIS)).not.toBeInTheDocument()
  })

  it('zeigt nach dem Laden die Coins', async () => {
    api.coins.push(testCoin({ name: 'Coin Alpha' }))

    zeigeSeite()

    expect(await zeileVon('Coin Alpha')).toBeInTheDocument()
  })

  it('zeigt „Noch keine Coins erfasst.“, wenn die Liste leer ist', async () => {
    zeigeSeite()

    expect(await screen.findByText(TEXTE.leereListe)).toBeInTheDocument()
  })

  it('zeigt bei einem Serverfehler eine verständliche Fehlermeldung', async () => {
    api.einmal('GET', GET_LISTE, problemAntwort(500, { detail: 'NpgsqlException: Verbindung verweigert' }))

    zeigeSeite()

    const alarm = await screen.findByRole('alert')
    expect(alarm).toHaveTextContent(LADEFEHLER)
  })

  it('zeigt bei einem Serverfehler keine technischen Details', async () => {
    api.einmal('GET', GET_LISTE, problemAntwort(500, { detail: 'NpgsqlException: Verbindung verweigert' }))

    zeigeSeite()

    await screen.findByText(LADEFEHLER)
    expect(seitentext()).not.toMatch(/Npgsql|Verbindung verweigert|500|Internal Server Error/)
  })

  it('zeigt bei einem Netzwerkfehler die Fehlermeldung ohne technische Details', async () => {
    api.netzwerkfehler('GET', GET_LISTE)

    zeigeSeite()

    expect(await screen.findByText(LADEFEHLER)).toBeInTheDocument()
    expect(seitentext()).not.toMatch(/Failed to fetch|TypeError/)
  })

  it('zeigt im Fehlerfall weder Ladehinweis noch Leermeldung', async () => {
    api.einmal('GET', GET_LISTE, problemAntwort(500))

    zeigeSeite()

    await screen.findByText(LADEFEHLER)
    expect(screen.queryByText(LADEHINWEIS)).not.toBeInTheDocument()
    expect(screen.queryByText(TEXTE.leereListe)).not.toBeInTheDocument()
  })
})

describe('AK-33: neuer Coin erscheint ohne Neuladen in der Liste', () => {
  it('zeigt einen ohne Bild angelegten Coin mit „Kein Bild“ und „unbekannt“', async () => {
    const { user } = zeigeSeite()
    await screen.findByText(TEXTE.leereListe)
    await fuelleAus(user, { name: 'Coin Neu', herausgeber: 'Herausgeber Neu' })

    await user.click(formularFelder().absenden)

    const zeile = await zeileVon('Coin Neu')
    expect(within(zeile).getByText('Herausgeber Neu')).toBeInTheDocument()
    expect(within(zeile).getByText('Kein Bild')).toBeInTheDocument()
    expect(within(zeile).getByText('unbekannt')).toBeInTheDocument()
  })

  it('zeigt einen mit Bild angelegten Coin mit Vorschaubild', async () => {
    const { user } = zeigeSeite()
    await screen.findByText(TEXTE.leereListe)
    await fuelleAus(user, { name: 'Coin Neu', herausgeber: 'Herausgeber Neu', bild: testDatei() })

    await user.click(formularFelder().absenden)

    const bild = await screen.findByRole('img', { name: 'Motiv: Coin Neu' })
    expect(bild.getAttribute('src')).toMatch(/^\/api\/coins\/.+\/bild\?v=/)
  })

  it('entfernt die Leermeldung, sobald ein Coin angelegt ist', async () => {
    const { user } = zeigeSeite()
    await screen.findByText(TEXTE.leereListe)
    await fuelleAus(user, { name: 'Coin Neu', herausgeber: 'Herausgeber Neu' })

    await user.click(formularFelder().absenden)

    await zeileVon('Coin Neu')
    expect(screen.queryByText(TEXTE.leereListe)).not.toBeInTheDocument()
  })

  it('behält vorhandene Coins in der Liste', async () => {
    api.coins.push(testCoin({ id: 'vorhanden', name: 'Coin Alt' }))
    const { user } = zeigeSeite()
    await zeileVon('Coin Alt')
    await fuelleAus(user, { name: 'Coin Neu', herausgeber: 'Herausgeber Neu' })

    await user.click(formularFelder().absenden)

    await zeileVon('Coin Neu')
    expect(await zeileVon('Coin Alt')).toBeInTheDocument()
  })
})

describe('AK-34: Teilerfolg auf der Seite', () => {
  it('zeigt den Coin nach fehlgeschlagenem Upload ohne Bild in der Liste', async () => {
    api.einmal('PUT', PUT_BILD, problemAntwort(415))
    const { user } = zeigeSeite()
    await screen.findByText(TEXTE.leereListe)
    await fuelleAus(user, { name: 'Coin Teil', herausgeber: 'Herausgeber Teil', bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(meldungMit(TEXTE.teilerfolgPraefix)).toBeDefined())
    const zeile = await zeileVon('Coin Teil')
    expect(within(zeile).getByText('Kein Bild')).toBeInTheDocument()
  })

  it('zeigt nach erfolgreichem „Bild erneut hochladen“ das Vorschaubild ohne zweiten Coin', async () => {
    api.netzwerkfehler('PUT', PUT_BILD)
    const { user } = zeigeSeite()
    await screen.findByText(TEXTE.leereListe)
    await fuelleAus(user, { name: 'Coin Teil', herausgeber: 'Herausgeber Teil', bild: testDatei() })
    await user.click(formularFelder().absenden)

    await user.click(await screen.findByRole('button', { name: TEXTE.erneutHochladen }))

    expect(await screen.findByRole('img', { name: 'Motiv: Coin Teil' })).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: 'Coin Teil' })).toHaveLength(1)
    expect(api.anfragenMit('POST')).toHaveLength(1)
  })
})

describe('AK-36: deutsche Texte', () => {
  it('zeigt auf der Startseite keine englischen Standardtexte', async () => {
    zeigeSeite()
    await screen.findByText(TEXTE.leereListe)

    expect(seitentext()).not.toMatch(/\b(Loading|Error|No data|Submit|Image|Created)\b/)
  })
})
