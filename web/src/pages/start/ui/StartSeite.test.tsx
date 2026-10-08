import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StartSeite } from './StartSeite'

// AK-13: Startseite mit Begrüßung, kurzem Einleitungstext und Link zum Katalog (katalog-seiten, AK-25).
// Der Link braucht einen Router-Kontext; ein minimaler Test-Router genügt (ohne App-Shell und Theme).

function zeigeStartSeite() {
  const wurzel = createRootRoute({ component: Outlet })
  const start = createRoute({ getParentRoute: () => wurzel, path: '/', component: StartSeite })
  const coins = createRoute({ getParentRoute: () => wurzel, path: '/coins', component: () => <p>Liste</p> })
  const router = createRouter({
    routeTree: wurzel.addChildren([start, coins]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
}

describe('StartSeite', () => {
  it('zeigt die Überschrift „Willkommen bei C.O.I.N.“ als Ebene 1', async () => {
    zeigeStartSeite()

    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
  })

  it('hat genau eine Überschrift der Ebene 1', async () => {
    zeigeStartSeite()
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('zeigt einen Einleitungstext unter der Überschrift', async () => {
    zeigeStartSeite()
    const ueberschrift = await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    const absatz = ueberschrift.parentElement?.querySelector('p')
    expect(absatz?.textContent?.trim().length ?? 0).toBeGreaterThan(0)
  })

  // katalog-seiten, AK-25 (Entscheidung F4): bisher „Zur Coin-Liste“.
  it('zeigt den Link „Zum Katalog“ mit Ziel /coins', async () => {
    zeigeStartSeite()

    expect(await screen.findByRole('link', { name: 'Zum Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('ruft keine API auf', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    zeigeStartSeite()
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
