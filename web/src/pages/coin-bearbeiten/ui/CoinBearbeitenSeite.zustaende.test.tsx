import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { beobachteDownloads } from '../../../../test/downloads'
import { erstelleFakeApi, problemAntwort, testCoin, type FakeApi } from '../../../../test/fakeApi'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinBearbeitenSeite } from '../index'

// Feature design-fundament, AK-35, AK-36 (Abschnitt 7 und 8): Seitenzustände von „Coin bearbeiten“ wie auf der
// Detailseite; neu ist „Erneut versuchen“ im Ladefehler, das genau eine neue Anfrage auslöst (D2).

const ID = '0199a1b2-0000-7000-8000-0000000000e1'
const COIN = /^\/api\/coins\/[^/]+$/
const FEHLER = 'Der Coin konnte nicht geladen werden. Bitte später erneut versuchen.'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: ID, name: 'Coin Bearbeitbar', auflage: 100 })])
  vi.stubGlobal('fetch', api.fetch)
  beobachteDownloads()
})

function zeige() {
  const user = userEvent.setup()
  zeigeMitRouter(() => <CoinBearbeitenSeite coinId={ID} onGespeichert={() => {}} />, {
    pfad: '/coins/$coinId/bearbeiten',
    start: `/coins/${ID}/bearbeiten`,
  })
  return user
}

const coinAbrufe = () => api.anfragenMit('GET', COIN).length

describe('Ladefehler mit „Erneut versuchen“ (AK-35)', () => {
  it('zeigt den bisherigen Fehlertext als alert', async () => {
    api.einmal('GET', COIN, problemAntwort(500))

    zeige()

    expect(await screen.findByRole('alert')).toHaveTextContent(FEHLER)
  })

  it('bietet den Button „Erneut versuchen“ an', async () => {
    api.einmal('GET', COIN, problemAntwort(500))

    zeige()

    expect(await screen.findByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
  })

  it('löst mit „Erneut versuchen“ genau eine neue Anfrage aus und zeigt dann die Seite', async () => {
    api.einmal('GET', COIN, problemAntwort(500))
    const user = zeige()
    const button = await screen.findByRole('button', { name: 'Erneut versuchen' })
    const vorher = coinAbrufe()

    await user.click(button)

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin bearbeiten' })).toBeInTheDocument()
    expect(coinAbrufe()).toBe(vorher + 1)
    expect(screen.queryByText(FEHLER)).not.toBeInTheDocument()
  })
})

describe('Laden und Aufbau (AK-35, AK-36)', () => {
  it('zeigt beim Laden genau einen Status „Coin wird geladen …“', async () => {
    let aufloesen!: (r: Response) => void
    api.einmal('GET', COIN, () => new Promise<Response>((r) => (aufloesen = r)))

    zeige()

    const status = await screen.findAllByRole('status')
    expect(status).toHaveLength(1)
    expect(status[0]).toHaveTextContent('Coin wird geladen …')
    aufloesen(problemAntwort(500))
  })

  it('zeigt für einen unbekannten Coin „Coin nicht gefunden“ wie bisher', async () => {
    api.einmal('GET', COIN, problemAntwort(404))

    zeige()

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin nicht gefunden' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zum Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('enthält kein <header>-Element', async () => {
    zeige()

    await screen.findByRole('heading', { level: 1, name: 'Coin bearbeiten' })
    expect(document.querySelector('header')).toBeNull()
  })
})
