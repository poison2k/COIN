import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import { erstelleFakeApi, problemAntwort, type FakeApi } from '../../../../test/fakeApi'
import { zeigeMitRouter } from '../../../../test/router'
import { kennzahlenBlock, neuesteBlock, testStartseite } from '../../../../test/startseite'
import { StartSeite } from '../index'

// Feature startseite-listen-pruefung, AK-8 (Abschnitt 4.1 „Weiteres“): Bei einem Ladefehler mit coins.read zeigt die
// Startseite den bisherigen Fehlertext mit „Erneut versuchen“. Der Button löst genau einen weiteren
// GET /api/startseite aus; bei Erfolg erscheinen die Blöcke. Ohne coins.read gibt es keinen solchen Button.

const FEHLERTEXT = 'Die Startseite konnte nicht geladen werden. Bitte später erneut versuchen.'
const STARTSEITE = /^\/api\/startseite$/

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], {
    me: ME.betrachter,
    startseite: { ansicht: testStartseite([kennzahlenBlock(), neuesteBlock()]) },
  })
  vi.stubGlobal('fetch', api.fetch)
})

function zeige(darfAnsehen = true) {
  const user = userEvent.setup()
  const ansicht = zeigeMitRouter(() => <StartSeite darfAnsehen={darfAnsehen} />, { pfad: '/' })
  return { user, ...ansicht }
}

const abrufe = () => api.anfragenMit('GET', STARTSEITE)

describe('Ladefehler mit coins.read (AK-8)', () => {
  it('zeigt den Fehlertext als Alarm mit dem Button „Erneut versuchen“', async () => {
    api.einmal('GET', STARTSEITE, problemAntwort(500))
    zeige()

    const alarm = await screen.findByRole('alert')

    expect(alarm).toHaveTextContent(FEHLERTEXT)
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
  })

  it('lädt nach „Erneut versuchen“ genau einmal neu', async () => {
    api.einmal('GET', STARTSEITE, problemAntwort(500))
    const { user } = zeige()
    await screen.findByRole('alert')
    expect(abrufe()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    await screen.findByRole('region', { name: 'Kennzahlen' })
    expect(abrufe()).toHaveLength(2)
  })

  it('zeigt nach erfolgreichem erneutem Laden die Blöcke ohne Fehlermeldung', async () => {
    api.einmal('GET', STARTSEITE, problemAntwort(500))
    const { user } = zeige()
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(await screen.findByRole('region', { name: 'Neueste Coins' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('zeigt bei erneutem Fehler wieder den Alarm mit „Erneut versuchen“', async () => {
    api.einmal('GET', STARTSEITE, problemAntwort(500))
    api.einmal('GET', STARTSEITE, problemAntwort(503))
    const { user } = zeige()
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    await waitFor(() => expect(abrufe()).toHaveLength(2))
    expect(await screen.findByRole('alert')).toHaveTextContent(FEHLERTEXT)
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
  })

  it('behält bei einem Ladefehler die Begrüßung als einziges h1', async () => {
    api.einmal('GET', STARTSEITE, problemAntwort(500))
    zeige()
    await screen.findByRole('alert')

    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Willkommen bei C.O.I.N.'])
  })
})

describe('ohne coins.read (AK-8, startseite AK-22 unverändert)', () => {
  it('zeigt keinen Button „Erneut versuchen“, auch wenn der Kopf nicht geladen werden kann', async () => {
    api.einmal('GET', /^\/api\/startseite\/kopf$/, problemAntwort(500))
    zeige(false)

    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).not.toBeInTheDocument()
  })
})
