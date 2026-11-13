import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { erstelleTestAnmeldung, ME } from '../../../test/anmeldung'
import { erstelleFakeApi, type FakeApi } from '../../../test/fakeApi'
import App from '../App'
import { erstelleRouter } from './router'

// Feature design-fundament, AK-38, AK-39 (ADR-0036 Punkt 8): Die Bausteinseite /entwicklung/bausteine gibt es nur in
// der Entwicklungsumgebung (Vitest läuft mit import.meta.env.DEV = true). Mit `entwicklung: false` stellt der Test den
// Produktionsfall nach: dann zeigt der Pfad die 404-Ansicht. Ohne Anmeldung erreichbar, ohne Sidebar-Eintrag und ohne
// API-Aufrufe der Seite selbst.

const PFAD = '/entwicklung/bausteine'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], { me: null })
  vi.stubGlobal('fetch', api.fetch)
})

function zeige(optionen?: { entwicklung: boolean }, angemeldet = false) {
  const history = createMemoryHistory({ initialEntries: [PFAD] })
  const router = optionen ? erstelleRouter(history, optionen) : erstelleRouter(history)
  if (angemeldet) api.setzeMe(ME.admin)
  const anmeldung = erstelleTestAnmeldung(angemeldet ? 'angemeldet' : 'anonym')
  render(<App router={router} userManager={anmeldung.userManager} />)
  return router
}

describe('Bausteinseite in der Entwicklung (AK-38)', () => {
  it('läuft im Test mit import.meta.env.DEV = true', () => {
    expect(import.meta.env.DEV).toBe(true)
  })

  it('zeigt ohne Anmeldung die Überschrift „Bausteinübersicht“', async () => {
    zeige()

    expect(await screen.findByRole('heading', { level: 1, name: 'Bausteinübersicht' })).toBeInTheDocument()
  })

  it('zeigt die Seite mit entwicklung: true', async () => {
    zeige({ entwicklung: true })

    expect(await screen.findByRole('heading', { level: 1, name: 'Bausteinübersicht' })).toBeInTheDocument()
  })

  it('zeigt die Seite in der App-Shell (Hauptnavigation und Kopfzeile)', async () => {
    zeige()
    await screen.findByRole('heading', { level: 1, name: 'Bausteinübersicht' })

    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(document.querySelector('main#inhalt')).toContainElement(
      screen.getByRole('heading', { level: 1, name: 'Bausteinübersicht' }),
    )
  })

  it('hat keinen Eintrag in der Hauptnavigation (auch nicht als Administrator)', async () => {
    zeige(undefined, true)
    await screen.findByRole('heading', { level: 1, name: 'Bausteinübersicht' })

    const links = within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getAllByRole('link')
    expect(links.filter((link) => link.getAttribute('href')?.startsWith('/entwicklung'))).toEqual([])
  })

  it('löst ohne Anmeldung keinen API-Aufruf aus', async () => {
    zeige()
    await screen.findByRole('heading', { level: 1, name: 'Bausteinübersicht' })

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([])
  })

  it('löst angemeldet außer /api/me keinen API-Aufruf aus', async () => {
    zeige(undefined, true)
    await screen.findByRole('heading', { level: 1, name: 'Bausteinübersicht' })

    expect(api.anfragen.filter((a) => a.pfad !== '/api/me').map((a) => `${a.methode} ${a.pfad}`)).toEqual([])
  })
})

describe('Bausteinseite in Produktion (AK-39)', () => {
  it('zeigt mit entwicklung: false die 404-Ansicht', async () => {
    zeige({ entwicklung: false })

    expect(await screen.findByText('Seite nicht gefunden.')).toBeInTheDocument()
  })

  it('zeigt mit entwicklung: false nicht die Bausteinübersicht', async () => {
    zeige({ entwicklung: false })
    await screen.findByText('Seite nicht gefunden.')

    expect(screen.queryByText('Bausteinübersicht')).not.toBeInTheDocument()
  })

  it('zeigt mit entwicklung: false den Link „Zur Startseite“', async () => {
    zeige({ entwicklung: false })

    expect(await screen.findByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '/')
  })

  it('lässt die übrigen Routen mit entwicklung: false unverändert', async () => {
    const history = createMemoryHistory({ initialEntries: ['/coins'] })
    const router = erstelleRouter(history, { entwicklung: false })
    render(<App router={router} userManager={erstelleTestAnmeldung('anonym').userManager} />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Katalog' })).toBeInTheDocument()
  })
})
