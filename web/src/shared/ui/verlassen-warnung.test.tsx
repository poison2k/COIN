import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useLocation,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { VerlassenWarnung } from './verlassen-warnung'

// Feature formulare-detailseiten, AK-13 bis AK-16 und AK-35 (Abschnitt 4.3, ADR-0040): Baustein `VerlassenWarnung`
// ({ aktiv, beschreibung, blockiere? }) mit Hook `useVerlassenWarnung`. Blockiert, solange `aktiv`, Wechsel des Pfads
// (TanStack Router `useBlocker`, `withResolver`), registriert `beforeunload` und zeigt einen Bestätigungsdialog
// „Ungespeicherte Änderungen“ mit „Bleiben“ (Anfangsfokus, auch Escape) und „Verlassen“.

const BESCHREIBUNG = 'Der neue Coin ist nicht gespeichert. Seite trotzdem verlassen?'

interface Optionen {
  aktiv?: boolean
  blockiere?: () => boolean
}

function zeige({ aktiv = true, blockiere }: Optionen = {}) {
  function Formular() {
    const [wert, setWert] = useState('')
    const geaendert = aktiv && wert !== ''
    return (
      <>
        <h1>Formular</h1>
        <label htmlFor="name">Name</label>
        <input id="name" value={wert} onChange={(e) => setWert(e.target.value)} />
        <Link to="/coins">Zum Katalog</Link>
        <VerlassenWarnung aktiv={geaendert} beschreibung={BESCHREIBUNG} blockiere={blockiere} />
      </>
    )
  }
  function Ziel() {
    const pfad = useLocation({ select: (ort) => ort.pathname })
    return <p>{`Ziel: ${pfad}`}</p>
  }
  const wurzel = createRootRoute({ component: Outlet })
  const formular = createRoute({ getParentRoute: () => wurzel, path: '/coins/neu', component: Formular })
  const ziel = createRoute({ getParentRoute: () => wurzel, path: '/coins', component: Ziel })
  const router = createRouter({
    routeTree: wurzel.addChildren([formular, ziel]),
    history: createMemoryHistory({ initialEntries: ['/coins', '/coins/neu'], initialIndex: 1 }),
  })
  const user = userEvent.setup()
  render(<RouterProvider router={router} />)
  return { user, router }
}

async function aendere(user: ReturnType<typeof userEvent.setup>, text = 'Coin Neu') {
  await user.type(await screen.findByRole('textbox', { name: 'Name' }), text)
}

function warnung(): Promise<HTMLElement> {
  return screen.findByRole('alertdialog', { name: 'Ungespeicherte Änderungen' })
}

function beforeunloadVerhindert(): boolean {
  const ereignis = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(ereignis)
  return ereignis.defaultPrevented
}

describe('ohne Änderung (AK-14)', () => {
  it('navigiert über einen Link ohne Dialog', async () => {
    const { user, router } = zeige()
    await screen.findByRole('heading', { name: 'Formular' })

    await user.click(screen.getByRole('link', { name: 'Zum Katalog' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('registriert kein beforeunload (AK-15)', async () => {
    zeige()
    await screen.findByRole('heading', { name: 'Formular' })

    expect(beforeunloadVerhindert()).toBe(false)
  })

  it('zeigt nach Rücksetzen auf den Ausgangswert keinen Dialog', async () => {
    const { user, router } = zeige()
    await aendere(user, 'X')
    await user.clear(screen.getByRole('textbox', { name: 'Name' }))

    await user.click(screen.getByRole('link', { name: 'Zum Katalog' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('mit Änderung (AK-13)', () => {
  it('öffnet beim Klick auf einen Link den Dialog „Ungespeicherte Änderungen“', async () => {
    const { user } = zeige()
    await aendere(user)

    await user.click(screen.getByRole('link', { name: 'Zum Katalog' }))

    expect(await warnung()).toBeInTheDocument()
  })

  it('beschreibt den Dialog mit der übergebenen Beschreibung', async () => {
    const { user } = zeige()
    await aendere(user)

    await user.click(screen.getByRole('link', { name: 'Zum Katalog' }))

    expect(await warnung()).toHaveAccessibleDescription(BESCHREIBUNG)
  })

  it('bietet „Bleiben“ und „Verlassen“ an und fokussiert „Bleiben“', async () => {
    const { user } = zeige()
    await aendere(user)
    await user.click(screen.getByRole('link', { name: 'Zum Katalog' }))

    const dialog = await warnung()

    expect(within(dialog).getByRole('button', { name: 'Verlassen' })).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Bleiben' })).toHaveFocus())
  })

  it('bleibt bei „Bleiben“ auf der Seite und behält die Eingabe', async () => {
    const { user, router } = zeige()
    await aendere(user)
    await user.click(screen.getByRole('link', { name: 'Zum Katalog' }))

    await user.click(within(await warnung()).getByRole('button', { name: 'Bleiben' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/coins/neu')
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Coin Neu')
  })

  it('bleibt bei Escape auf der Seite und behält die Eingabe', async () => {
    const { user, router } = zeige()
    await aendere(user)
    await user.click(screen.getByRole('link', { name: 'Zum Katalog' }))
    await warnung()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/coins/neu')
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Coin Neu')
  })

  it('navigiert bei „Verlassen“ zum Ziel', async () => {
    const { user, router } = zeige()
    await aendere(user)
    await user.click(screen.getByRole('link', { name: 'Zum Katalog' }))

    await user.click(within(await warnung()).getByRole('button', { name: 'Verlassen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
    expect(await screen.findByText('Ziel: /coins')).toBeInTheDocument()
  })

  it('fragt auch beim Zurück im Verlauf nach', async () => {
    const { user, router } = zeige()
    await aendere(user)

    router.history.back()

    expect(await warnung()).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/coins/neu')
  })

  it('registriert beforeunload (cancelable, defaultPrevented) (AK-15)', async () => {
    const { user } = zeige()
    await aendere(user)

    expect(beforeunloadVerhindert()).toBe(true)
  })

  it('entfernt beforeunload nach dem Verlassen wieder (AK-15)', async () => {
    const { user, router } = zeige()
    await aendere(user)
    await user.click(screen.getByRole('link', { name: 'Zum Katalog' }))
    await user.click(within(await warnung()).getByRole('button', { name: 'Verlassen' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))

    expect(beforeunloadVerhindert()).toBe(false)
  })
})

describe('Suchparameter (blockiere)', () => {
  it('blockiert ohne blockiere keinen Wechsel nur der Suchparameter', async () => {
    const { user, router } = zeige()
    await aendere(user)

    await router.navigate({ to: '/coins/neu', search: { reiter: 'ausgaben' } as never })

    await waitFor(() => expect(router.state.location.search).toMatchObject({ reiter: 'ausgaben' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('blockiert mit blockiere auch einen Wechsel der Suchparameter', async () => {
    const { user, router } = zeige({ blockiere: () => true })
    await aendere(user)

    void router.navigate({ to: '/coins/neu', search: { reiter: 'ausgaben' } as never })

    expect(await warnung()).toBeInTheDocument()
    expect(router.state.location.search).not.toMatchObject({ reiter: 'ausgaben' })
  })
})

describe('Datenschutz (Abschnitt 6)', () => {
  it('speichert die Eingaben weder in localStorage noch in sessionStorage', async () => {
    const { user } = zeige()
    await aendere(user, 'Testperson A')
    await user.click(screen.getByRole('link', { name: 'Zum Katalog' }))
    await warnung()

    const gespeichert = [
      ...Object.keys(localStorage).map((k) => localStorage.getItem(k)),
      ...Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k)),
    ].join(' ')
    expect(gespeichert).not.toContain('Testperson A')
  })
})
