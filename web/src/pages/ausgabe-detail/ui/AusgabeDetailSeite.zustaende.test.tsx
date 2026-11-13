import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import { erstelleFakeApi, problemAntwort, testAusgabe, testCoin, type FakeApi } from '../../../../test/fakeApi'
import { zeigeMitRouter } from '../../../../test/router'
import { AusgabeDetailSeite } from '../index'

// Feature design-fundament, AK-35, AK-36 (Abschnitt 7 und 8): Seitenzustände der Ausgabe-Seite; neu ist „Erneut
// versuchen“ im Ladefehler, das genau eine neue Anfrage auslöst (D2).

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const AUSGABE_ID = '0199a1b2-0000-7000-8000-0000000000e7'
const AUSGABE = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+$/
const FEHLER = 'Die Ausgabe konnte nicht geladen werden. Bitte später erneut versuchen.'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID, name: 'Coin Alpha', auflage: 150 })], {
    ausgaben: { [COIN_ID]: [testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12 })] },
  })
  vi.stubGlobal('fetch', api.fetch)
  setzeTokenQuelle(() => 'token-seite')
})

afterEach(() => {
  setzeTokenQuelle(null)
})

function zeige() {
  const user = userEvent.setup()
  zeigeMitRouter(() => <AusgabeDetailSeite coinId={COIN_ID} ausgabeId={AUSGABE_ID} darfZertifikat />, {
    pfad: '/coins/$coinId/ausgaben/$ausgabeId',
    start: `/coins/${COIN_ID}/ausgaben/${AUSGABE_ID}`,
  })
  return user
}

const ausgabeAbrufe = () => api.anfragenMit('GET', AUSGABE).length

describe('Ladefehler mit „Erneut versuchen“ (AK-35)', () => {
  it('zeigt den bisherigen Fehlertext als alert', async () => {
    api.einmal('GET', AUSGABE, problemAntwort(500))

    zeige()

    expect(await screen.findByRole('alert')).toHaveTextContent(FEHLER)
  })

  it('bietet den Button „Erneut versuchen“ an', async () => {
    api.einmal('GET', AUSGABE, problemAntwort(500))

    zeige()

    expect(await screen.findByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
  })

  it('löst mit „Erneut versuchen“ genau eine neue Anfrage für die Ausgabe aus und zeigt dann die Seite', async () => {
    api.einmal('GET', AUSGABE, problemAntwort(500))
    const user = zeige()
    const button = await screen.findByRole('button', { name: 'Erneut versuchen' })
    const vorher = ausgabeAbrufe()

    await user.click(button)

    expect(await screen.findByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 12' })).toBeInTheDocument()
    expect(ausgabeAbrufe()).toBe(vorher + 1)
    expect(screen.queryByText(FEHLER)).not.toBeInTheDocument()
  })

  it('behält im Fehlerfall den Link „Zurück zum Coin“', async () => {
    api.einmal('GET', AUSGABE, problemAntwort(500))

    zeige()

    expect(await screen.findByRole('link', { name: 'Zurück zum Coin' })).toHaveAttribute('href', `/coins/${COIN_ID}`)
  })
})

describe('Laden und Aufbau (AK-35, AK-36)', () => {
  it('zeigt beim Laden genau einen Status „Ausgabe wird geladen …“', async () => {
    let aufloesen!: (r: Response) => void
    api.einmal('GET', AUSGABE, () => new Promise<Response>((r) => (aufloesen = r)))

    zeige()

    const status = await screen.findAllByRole('status')
    expect(status).toHaveLength(1)
    expect(status[0]).toHaveTextContent('Ausgabe wird geladen …')
    aufloesen(problemAntwort(500))
  })

  it('enthält kein <header>-Element', async () => {
    zeige()

    await screen.findByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 12' })
    expect(document.querySelector('header')).toBeNull()
  })
})
