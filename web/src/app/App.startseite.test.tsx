import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Benutzer } from '@/entities/benutzer'
import { ME, erstelleTestAnmeldung, type SitzungsZustand, type TestBenutzer } from '../../test/anmeldung'
import { erstelleFakeApi, type FakeApi } from '../../test/fakeApi'
import { aktiverKopf, kennzahlenBlock, kopfBlock, testStartseite } from '../../test/startseite'
import App from './App'
import { erstelleRouter } from './router/router'

// Feature startseite, AK-20, AK-22, AK-25, AK-26, AK-32 und AK-34 im Zusammenspiel von App, Router, App-Shell und
// Seiten: Sidebar-Eintrag „Startseite verwalten“ nur mit startpage.manage (aus /api/me), Guard der Route
// /verwaltung/startseite, Startseite mit bzw. ohne coins.read, Rückfrage bei ungespeicherten Änderungen.

let api: FakeApi

interface Optionen {
  als?: TestBenutzer | Benutzer | 'deaktiviert'
  zustand?: SitzungsZustand
  einrichten?: (api: FakeApi) => void
}

function zeigeApp(pfad: string, { als = 'admin', zustand = 'angemeldet', einrichten }: Optionen = {}) {
  const me = als === 'deaktiviert' ? 'deaktiviert' : typeof als === 'string' ? ME[als] : als
  api = erstelleFakeApi([], { me: zustand === 'anonym' ? null : me })
  einrichten?.(api)
  vi.stubGlobal('fetch', api.fetch)
  const anmeldung = erstelleTestAnmeldung(zustand, me === 'deaktiviert' ? 'Test Administrator' : me.name)
  const user = userEvent.setup()
  const router = erstelleRouter(createMemoryHistory({ initialEntries: [pfad] }))
  render(<App router={router} userManager={anmeldung.userManager} />)
  return { user, router, anmeldung }
}

/** Hauptnavigation der Sidebar (wartet, bis die App-Shell gerendert ist). */
function navigation(): Promise<HTMLElement> {
  return screen.findByRole('navigation', { name: 'Hauptnavigation' })
}

function startseitenAufrufe(): string[] {
  return api.anfragen.filter((a) => a.pfad.startsWith('/api/startseite')).map((a) => `${a.methode} ${a.pfad}`)
}

// ---------- AK-25: Sidebar ----------

describe('Sidebar-Eintrag „Startseite verwalten“ (AK-25)', () => {
  it('zeigt dem Administrator den Eintrag mit Ziel /verwaltung/startseite', async () => {
    zeigeApp('/')

    expect(await within(await navigation()).findByRole('link', { name: 'Startseite verwalten' })).toHaveAttribute(
      'href',
      '/verwaltung/startseite',
    )
  })

  it('steht nach „Benutzerverwaltung“', async () => {
    zeigeApp('/')
    await within(await navigation()).findByRole('link', { name: 'Startseite verwalten' })

    const namen = within(await navigation())
      .getAllByRole('link')
      .map((l) => l.textContent?.trim())
    expect(namen.indexOf('Startseite verwalten')).toBe(namen.indexOf('Benutzerverwaltung') + 1)
  })

  it('blendet das Icon für Screenreader aus', async () => {
    zeigeApp('/')

    const link = await within(await navigation()).findByRole('link', { name: 'Startseite verwalten' })
    for (const svg of link.querySelectorAll('svg')) expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('leitet die Sichtbarkeit nur aus berechtigungen ab (Betrachter mit startpage.manage sieht den Eintrag)', async () => {
    zeigeApp('/', { als: { ...ME.betrachter, berechtigungen: ['coins.read', 'startpage.manage'] } as Benutzer })

    expect(await within(await navigation()).findByRole('link', { name: 'Startseite verwalten' })).toBeInTheDocument()
  })

  it.each(['betrachter', 'sachbearbeiter', 'keine'] as const)('blendet den Eintrag für %s aus', async (als) => {
    zeigeApp('/', { als })
    await within(await navigation()).findByRole('link', { name: 'Katalog' })
    await waitFor(() => expect(api.anfragenMit('GET', /^\/api\/me$/)).toHaveLength(1))

    expect(within(await navigation()).queryByRole('link', { name: 'Startseite verwalten' })).not.toBeInTheDocument()
  })

  it('blendet den Eintrag für einen Administrator ohne startpage.manage in /api/me aus', async () => {
    zeigeApp('/', { als: { ...ME.admin, berechtigungen: ['audit.read', 'coins.read', 'users.manage'] } as Benutzer })
    await within(await navigation()).findByRole('link', { name: 'Benutzerverwaltung' })

    expect(within(await navigation()).queryByRole('link', { name: 'Startseite verwalten' })).not.toBeInTheDocument()
  })

  it('blendet den Eintrag für anonyme Besucher aus', async () => {
    zeigeApp('/', { zustand: 'anonym' })
    await within(await navigation()).findByRole('link', { name: 'Katalog' })

    expect(within(await navigation()).queryByRole('link', { name: 'Startseite verwalten' })).not.toBeInTheDocument()
  })

  it('führt per Klick zur Seite „Startseite verwalten“', async () => {
    const { user, router } = zeigeApp('/')

    await user.click(await within(await navigation()).findByRole('link', { name: 'Startseite verwalten' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Startseite verwalten' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/verwaltung/startseite')
  })
})

// ---------- AK-26: Route und Guard ----------

describe('Route /verwaltung/startseite (AK-26)', () => {
  it('zeigt dem Administrator die Seite mit genau einem h1', async () => {
    zeigeApp('/verwaltung/startseite')

    expect(await screen.findByRole('heading', { level: 1, name: 'Startseite verwalten' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it.each(['betrachter', 'sachbearbeiter'] as const)('leitet %s nach /kein-zugriff?grund=berechtigung', async (als) => {
    const { router } = zeigeApp('/verwaltung/startseite', { als })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    expect(router.state.location.search).toEqual({ grund: 'berechtigung' })
  })

  it('leitet Benutzer ohne Rolle nach /kein-zugriff', async () => {
    const { router } = zeigeApp('/verwaltung/startseite', { als: 'keine' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    expect(router.state.location.search).toEqual({})
  })

  it('leitet deaktivierte Benutzer nach /kein-zugriff', async () => {
    const { router } = zeigeApp('/verwaltung/startseite', { als: 'deaktiviert' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
  })

  it('startet anonym die Anmeldung mit Rückkehr auf /verwaltung/startseite', async () => {
    const { anmeldung } = zeigeApp('/verwaltung/startseite', { zustand: 'anonym' })

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
    const args = anmeldung.signinRedirect.mock.calls.at(-1)?.[0] as { state?: { ziel?: unknown } } | undefined
    expect(args?.state?.ziel).toBe('/verwaltung/startseite')
  })

  it.each(['betrachter', 'sachbearbeiter', 'keine'] as const)('ruft für %s die Konfiguration nicht ab', async (als) => {
    const { router } = zeigeApp('/verwaltung/startseite', { als })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    expect(api.anfragenMit('GET', /^\/api\/startseite\/konfiguration$/)).toHaveLength(0)
  })
})

// ---------- AK-20, AK-22: Startseite je Besuchergruppe ----------

describe('Startseite / je Besuchergruppe (AK-20, AK-22)', () => {
  it('lädt mit coins.read nur GET /api/startseite', async () => {
    zeigeApp('/', { als: 'betrachter' })

    await screen.findByRole('region', { name: 'Kennzahlen' })
    expect(startseitenAufrufe()).toEqual(['GET /api/startseite'])
  })

  it('zeigt dem Betrachter die Kennzahlen', async () => {
    zeigeApp('/', {
      als: 'betrachter',
      einrichten: (a) => (a.startseite.ansicht = testStartseite([kennzahlenBlock({ coins: 3 })])),
    })

    expect(await screen.findByRole('region', { name: 'Kennzahlen' })).toBeInTheDocument()
  })

  it('zeigt dem Betrachter den aktiven Kopf als einziges h1', async () => {
    zeigeApp('/', {
      als: 'betrachter',
      einrichten: (a) =>
        (a.startseite.ansicht = testStartseite([kopfBlock({ titel: 'Kopf für alle' }), kennzahlenBlock()])),
    })

    expect(await screen.findByRole('heading', { level: 1, name: 'Kopf für alle' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('ruft anonym genau GET /api/startseite/kopf auf, nie GET /api/startseite', async () => {
    zeigeApp('/', { zustand: 'anonym', einrichten: (a) => (a.startseite.kopf = aktiverKopf()) })

    await screen.findByRole('heading', { level: 1, name: 'Testverband Gedenkmünzen' })
    expect(startseitenAufrufe()).toEqual(['GET /api/startseite/kopf'])
  })

  it('zeigt anonym bei inaktivem Kopf „Willkommen bei C.O.I.N.“ ohne Kennzahlen', async () => {
    zeigeApp('/', { zustand: 'anonym' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Kennzahlen' })).not.toBeInTheDocument()
  })

  it('ruft ohne Rolle nie GET /api/startseite auf', async () => {
    zeigeApp('/', { als: 'keine', einrichten: (a) => (a.startseite.kopf = aktiverKopf()) })

    await screen.findByRole('heading', { level: 1, name: 'Testverband Gedenkmünzen' })
    await waitFor(() => expect(api.anfragenMit('GET', /^\/api\/me$/)).toHaveLength(1))
    expect(startseitenAufrufe()).not.toContain('GET /api/startseite')
  })

  it('ruft für Deaktivierte nie GET /api/startseite auf', async () => {
    zeigeApp('/', { als: 'deaktiviert', einrichten: (a) => (a.startseite.kopf = aktiverKopf()) })

    await waitFor(() => expect(api.anfragenMit('GET', /^\/api\/me$/).length).toBeGreaterThan(0))
    await waitFor(() => expect(startseitenAufrufe()).toContain('GET /api/startseite/kopf'))
    expect(startseitenAufrufe()).not.toContain('GET /api/startseite')
  })

  it('zeigt anonym weder Infotext noch Coin-Listen, auch wenn sie konfiguriert sind', async () => {
    zeigeApp('/', { zustand: 'anonym', einrichten: (a) => (a.startseite.kopf = aktiverKopf()) })

    await screen.findByRole('heading', { level: 1, name: 'Testverband Gedenkmünzen' })
    expect(screen.queryByRole('region', { name: 'Information' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Neueste Coins' })).not.toBeInTheDocument()
  })
})

// ---------- AK-32: ungespeicherte Änderungen ----------

describe('Ungespeicherte Änderungen (AK-32)', () => {
  it('fragt beim Verlassen über die Sidebar per AlertDialog nach', async () => {
    const { user } = zeigeApp('/verwaltung/startseite')
    await user.click(await screen.findByRole('switch', { name: 'Kennzahlen anzeigen' }))

    await user.click(within(await navigation()).getByRole('link', { name: 'Katalog' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Ungespeicherte Änderungen' })
    expect(dialog).toHaveTextContent(
      'Die Änderungen an der Startseite sind nicht gespeichert. Seite trotzdem verlassen?',
    )
    expect(within(dialog).getByRole('button', { name: 'Verlassen' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Bleiben' })).toBeInTheDocument()
  })

  it('bleibt nach „Bleiben“ auf der Seite', async () => {
    const { user, router } = zeigeApp('/verwaltung/startseite')
    await user.click(await screen.findByRole('switch', { name: 'Kennzahlen anzeigen' }))
    await user.click(within(await navigation()).getByRole('link', { name: 'Katalog' }))

    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Bleiben' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/verwaltung/startseite')
    expect(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' })).toHaveAttribute('aria-checked', 'false')
  })

  it('verlässt die Seite nach „Verlassen“', async () => {
    const { user, router } = zeigeApp('/verwaltung/startseite')
    await user.click(await screen.findByRole('switch', { name: 'Kennzahlen anzeigen' }))
    await user.click(within(await navigation()).getByRole('link', { name: 'Katalog' }))

    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Verlassen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
  })

  it('fragt ohne Änderungen nicht nach', async () => {
    const { user, router } = zeigeApp('/verwaltung/startseite')
    await screen.findByRole('switch', { name: 'Kennzahlen anzeigen' })

    await user.click(within(await navigation()).getByRole('link', { name: 'Katalog' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('sichert Neuladen und Schließen per beforeunload ab', async () => {
    const { user } = zeigeApp('/verwaltung/startseite')
    await user.click(await screen.findByRole('switch', { name: 'Kennzahlen anzeigen' }))

    const ereignis = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ereignis)

    expect(ereignis.defaultPrevented).toBe(true)
  })

  it('fragt nach dem Speichern nicht mehr nach', async () => {
    const { user, router } = zeigeApp('/verwaltung/startseite')
    await user.click(await screen.findByRole('switch', { name: 'Kennzahlen anzeigen' }))
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(api.anfragenMit('PUT', /^\/api\/startseite\/konfiguration$/)).toHaveLength(1))
    await screen.findByText('Die Startseite wurde gespeichert.')

    await user.click(within(await navigation()).getByRole('link', { name: 'Katalog' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
  })
})
