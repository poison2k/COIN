import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { erstelleFakeApi, problemAntwort, testCoin, type FakeApi } from '../../../../test/fakeApi'
import { zeigeMitRouter } from '../../../../test/router'
import { AusgabeErfassenSeite } from '../index'

// Feature design-fundament, AK-35, AK-36 (Abschnitt 7 und 8): Seitenzustände von „Ausgabe erfassen“; neu ist
// „Erneut versuchen“ im Ladefehler, das genau eine neue Anfrage auslöst (D2).

const ID = '0199a1b2-0000-7000-8000-0000000000d1'
const COIN = /^\/api\/coins\/[^/]+$/
const FEHLER = 'Der Coin konnte nicht geladen werden. Bitte später erneut versuchen.'

let api: FakeApi

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T09:00:00Z'))
  api = erstelleFakeApi([testCoin({ id: ID, name: 'Coin Alpha', auflage: 150 })])
  vi.stubGlobal('fetch', api.fetch)
})

afterEach(() => {
  vi.useRealTimers()
})

function zeige() {
  const user = userEvent.setup()
  zeigeMitRouter(() => <AusgabeErfassenSeite coinId={ID} onErfasst={() => {}} />, {
    pfad: '/coins/$coinId/ausgaben/neu',
    start: `/coins/${ID}/ausgaben/neu`,
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

  it('löst mit „Erneut versuchen“ genau eine neue Anfrage für den Coin aus und zeigt dann das Formular', async () => {
    api.einmal('GET', COIN, problemAntwort(500))
    const user = zeige()
    const button = await screen.findByRole('button', { name: 'Erneut versuchen' })
    const vorher = coinAbrufe()

    await user.click(button)

    expect(await screen.findByRole('button', { name: 'Ausgabe speichern' })).toBeInTheDocument()
    expect(coinAbrufe()).toBe(vorher + 1)
    expect(screen.queryByText(FEHLER)).not.toBeInTheDocument()
  })

  it('behält im Fehlerfall das h1 „Ausgabe erfassen“ und den Link „Zurück zum Coin“', async () => {
    api.einmal('GET', COIN, problemAntwort(500))

    zeige()

    expect(await screen.findByRole('heading', { level: 1, name: 'Ausgabe erfassen' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zurück zum Coin' })).toHaveAttribute('href', `/coins/${ID}`)
  })
})

describe('Laden (AK-35)', () => {
  it('zeigt beim Laden genau einen Status „Coin wird geladen …“', async () => {
    let aufloesen!: (r: Response) => void
    api.einmal('GET', COIN, () => new Promise<Response>((r) => (aufloesen = r)))

    zeige()

    const status = await screen.findAllByRole('status')
    expect(status).toHaveLength(1)
    expect(status[0]).toHaveTextContent('Coin wird geladen …')
    aufloesen(problemAntwort(500))
  })
})
