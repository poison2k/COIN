import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { erstelleFakeApi, problemAntwort, testCoin, type FakeApi } from '../../../../test/fakeApi'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinDetailSeite, type CoinDetailSeiteProps } from '../index'

// Feature design-fundament, AK-35, AK-36 (Abschnitt 7 und 8): einheitliche Seitenzustände der Detailseite. Texte und
// Rollen wie bisher; neu ist „Erneut versuchen“ im Ladefehler, das genau eine neue Anfrage auslöst (D2).

const ID = '0199a1b2-0000-7000-8000-0000000000d1'
const COIN = /^\/api\/coins\/[^/]+$/
const FEHLER = 'Der Coin konnte nicht geladen werden. Bitte später erneut versuchen.'

const KEINE_RECHTE: CoinDetailSeiteProps['berechtigungen'] = {
  exemplare: false,
  historie: false,
  erfassen: false,
  auflage: false,
  bearbeiten: false,
}

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: ID, name: 'Coin Alpha' })])
  vi.stubGlobal('fetch', api.fetch)
})

function zeige(berechtigungen = KEINE_RECHTE) {
  const user = userEvent.setup()
  zeigeMitRouter(
    () => (
      <CoinDetailSeite coinId={ID} berechtigungen={berechtigungen} seite={1} onStatus={() => {}} onSeite={() => {}} />
    ),
    { pfad: '/coins/$coinId', start: `/coins/${ID}` },
  )
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

  it('löst mit „Erneut versuchen“ genau eine neue Anfrage aus', async () => {
    api.einmal('GET', COIN, problemAntwort(500))
    const user = zeige()
    const button = await screen.findByRole('button', { name: 'Erneut versuchen' })
    const vorher = coinAbrufe()

    await user.click(button)
    await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })

    expect(coinAbrufe()).toBe(vorher + 1)
  })

  it('zeigt nach erfolgreichem erneutem Versuch die Seite ohne Fehler', async () => {
    api.einmal('GET', COIN, problemAntwort(500))
    const user = zeige()

    await user.click(await screen.findByRole('button', { name: 'Erneut versuchen' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })).toBeInTheDocument()
    expect(screen.queryByText(FEHLER)).not.toBeInTheDocument()
  })

  it('zeigt bei einem Netzwerkfehler ebenfalls „Erneut versuchen“', async () => {
    api.netzwerkfehler('GET', COIN)

    zeige()

    expect(await screen.findByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
  })
})

describe('Laden und nicht gefunden (AK-35)', () => {
  it('zeigt beim Laden genau einen Status „Coin wird geladen …“', async () => {
    let aufloesen!: (r: Response) => void
    api.einmal('GET', COIN, () => new Promise<Response>((r) => (aufloesen = r)))

    zeige()

    const status = await screen.findAllByRole('status')
    expect(status).toHaveLength(1)
    expect(status[0]).toHaveTextContent('Coin wird geladen …')
    aufloesen(problemAntwort(500))
  })

  it('zeigt für einen unbekannten Coin das h1 „Coin nicht gefunden“ mit Link „Zum Katalog“', async () => {
    api.einmal('GET', COIN, problemAntwort(404))

    zeige()

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin nicht gefunden' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zum Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('bietet für einen unbekannten Coin kein „Erneut versuchen“', async () => {
    api.einmal('GET', COIN, problemAntwort(404))

    zeige()

    await screen.findByRole('heading', { level: 1, name: 'Coin nicht gefunden' })
    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).not.toBeInTheDocument()
  })
})

describe('Seitenkopf (AK-36)', () => {
  it('hat genau ein h1 mit dem Namen des Coins', async () => {
    zeige()

    await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('enthält kein <header>-Element', async () => {
    zeige()

    await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })
    expect(document.querySelector('header')).toBeNull()
  })

  it('macht das h1 für den Fokus nach Meldungen per Skript fokussierbar', async () => {
    zeige()

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })).toHaveAttribute('tabindex', '-1')
  })
})
