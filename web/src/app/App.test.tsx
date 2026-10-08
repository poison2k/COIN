import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { erstelleTestAnmeldung, ME, type TestBenutzer } from '../../test/anmeldung'
import { erstelleFakeApi } from '../../test/fakeApi'
import { TEXTE } from '../../test/hilfen'
import { DUNKEL_QUERY, stubMatchMedia } from '../../test/matchMedia'
import App from './App'
import { erstelleRouter } from './router/router'

// AK-13 bis AK-17, AK-21: Verdrahtung von Router, App-Shell (Sidebar) und Theme.
// Der Router wird mit Memory-History erzeugt (Abschnitt 4.4 des Entwurfs).
// Feature anmeldung-keycloak: Die App läuft standardmäßig mit angemeldetem Administrator (Abschnitt 6.2),
// damit die bestehenden Assertions gelten. Feature katalog-seiten (AK-12, AK-25, Entscheidung F4): Benennung „Katalog“,
// kein Formular mehr unter /coins.

const THEME_SCHLUESSEL = 'coin-theme'

let als: TestBenutzer = 'admin'

beforeEach(() => {
  als = 'admin'
  vi.stubGlobal('fetch', erstelleFakeApi([], { me: ME[als] }).fetch)
})

function zeigeApp(pfad: string) {
  const user = userEvent.setup()
  const router = erstelleRouter(createMemoryHistory({ initialEntries: [pfad] }))
  const anmeldung = erstelleTestAnmeldung('angemeldet', ME[als].name)
  render(<App router={router} userManager={anmeldung.userManager} />)
  return { user, router }
}

function html(): HTMLElement {
  return document.documentElement
}

/** Navigationseintrag der Sidebar (exakter Name, damit „Zum Katalog“ nicht mitzählt). */
function sidebarLink(name: 'Startseite' | 'Katalog'): HTMLElement {
  return screen.getByRole('link', { name })
}

async function waehleFarbschema(user: ReturnType<typeof userEvent.setup>, eintrag: 'Hell' | 'Dunkel' | 'System') {
  await user.click(screen.getByRole('button', { name: 'Farbschema wählen' }))
  await user.click(await screen.findByRole('menuitem', { name: eintrag }))
}

describe('App – Katalog unter /coins', () => {
  it('zeigt unter /coins die Katalogliste', async () => {
    zeigeApp('/coins')

    expect(await screen.findByText(TEXTE.leereListe)).toBeInTheDocument()
  })

  // katalog-seiten, AK-12/AK-13: Das Formular liegt auf /coins/neu; /coins zeigt dem Administrator nur den Link.
  it('zeigt unter /coins dem Administrator den Link „Coin hinzufügen“ statt des Formulars', async () => {
    zeigeApp('/coins')

    expect(await screen.findByRole('link', { name: 'Coin hinzufügen' })).toHaveAttribute('href', '/coins/neu')
    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
  })

  it('zeigt unter /coins die Überschrift „Katalog“', async () => {
    zeigeApp('/coins')

    expect(await screen.findByRole('heading', { level: 1, name: 'Katalog' })).toBeInTheDocument()
  })

  it('enthält keine Inhalte des Vite-Templates mehr', async () => {
    zeigeApp('/coins')
    await screen.findByText(TEXTE.leereListe)

    expect(screen.queryByText(/Get started|count is/i)).not.toBeInTheDocument()
  })
})

describe('App – Startseite unter /', () => {
  it('zeigt die Überschrift „Willkommen bei C.O.I.N.“ als Ebene 1', async () => {
    zeigeApp('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
  })

  it('zeigt den Link „Zum Katalog“ mit Ziel /coins', async () => {
    zeigeApp('/')

    expect(await screen.findByRole('link', { name: 'Zum Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('zeigt auf der Startseite weder Katalogliste noch Formular', async () => {
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(screen.queryByRole('heading', { name: 'Katalog' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
  })

  it('führt über den Link „Zum Katalog“ zum Katalog', async () => {
    const { user, router } = zeigeApp('/')

    await user.click(await screen.findByRole('link', { name: 'Zum Katalog' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Katalog' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/coins')
  })

  it('enthält keine Inhalte des Vite-Templates', async () => {
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(screen.queryByText(/Get started|count is|Vite|React logo/i)).not.toBeInTheDocument()
  })
})

describe('App – Sidebar', () => {
  it('zeigt den Titel „C.O.I.N.“', async () => {
    zeigeApp('/')

    expect(await screen.findByText('C.O.I.N.')).toBeInTheDocument()
  })

  it('verlinkt „Startseite“ auf / und „Katalog“ auf /coins', async () => {
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(sidebarLink('Startseite')).toHaveAttribute('href', '/')
    expect(sidebarLink('Katalog')).toHaveAttribute('href', '/coins')
  })

  it('markiert auf / den Eintrag „Startseite“ als aktiv', async () => {
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(sidebarLink('Startseite')).toHaveAttribute('aria-current', 'page')
    expect(sidebarLink('Katalog')).not.toHaveAttribute('aria-current')
  })

  it('markiert auf /coins den Eintrag „Katalog“ als aktiv', async () => {
    zeigeApp('/coins')
    await screen.findByRole('heading', { level: 1, name: 'Katalog' })

    expect(sidebarLink('Katalog')).toHaveAttribute('aria-current', 'page')
    expect(sidebarLink('Startseite')).not.toHaveAttribute('aria-current')
  })

  it('führt per Klick auf „Katalog“ zum Katalog', async () => {
    const { user, router } = zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    await user.click(sidebarLink('Katalog'))

    expect(await screen.findByText(TEXTE.leereListe)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/coins')
  })

  it('verschiebt die Markierung nach dem Klick auf „Katalog“', async () => {
    const { user } = zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    await user.click(sidebarLink('Katalog'))

    await waitFor(() => expect(sidebarLink('Katalog')).toHaveAttribute('aria-current', 'page'))
    expect(sidebarLink('Startseite')).not.toHaveAttribute('aria-current')
  })

  it('führt per Klick auf „Startseite“ vom Katalog zurück zur Startseite', async () => {
    const { user, router } = zeigeApp('/coins')
    await screen.findByRole('heading', { level: 1, name: 'Katalog' })

    await user.click(sidebarLink('Startseite'))

    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('hat in der Kopfzeile den Button „Seitenleiste ein-/ausblenden“', async () => {
    zeigeApp('/')

    expect(await screen.findByRole('button', { name: 'Seitenleiste ein-/ausblenden' })).toBeInTheDocument()
  })

  it('setzt beim Ein-/Ausklappen der Sidebar kein Cookie', async () => {
    const { user } = zeigeApp('/')

    await user.click(await screen.findByRole('button', { name: 'Seitenleiste ein-/ausblenden' }))

    expect(document.cookie).not.toContain('sidebar_state')
  })
})

/** Desktop-Sidebar (nicht das mobile Overlay), erkennbar an data-slot und data-state. */
function desktopSidebar(): HTMLElement {
  const sidebar = document.querySelector<HTMLElement>('[data-slot="sidebar"][data-state]')
  expect(sidebar).not.toBeNull()
  return sidebar as HTMLElement
}

/** Per Tastatur erreichbar: nicht in einem inert-/hidden-Container und nicht aus dem Tab-Fluss genommen. */
function istPerTabErreichbar(element: HTMLElement): boolean {
  return element.closest('[inert]') === null && element.closest('[hidden]') === null && element.tabIndex >= 0
}

describe('App – Sidebar ein-/ausklappen (Desktop)', () => {
  it('ist beim Start ausgeklappt', async () => {
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(desktopSidebar()).toHaveAttribute('data-state', 'expanded')
  })

  it('klappt per Button „Seitenleiste ein-/ausblenden“ ein', async () => {
    const { user } = zeigeApp('/')

    await user.click(await screen.findByRole('button', { name: 'Seitenleiste ein-/ausblenden' }))

    await waitFor(() => expect(desktopSidebar()).toHaveAttribute('data-state', 'collapsed'))
  })

  it('klappt per zweitem Klick auf den Button wieder aus', async () => {
    const { user } = zeigeApp('/')
    const button = await screen.findByRole('button', { name: 'Seitenleiste ein-/ausblenden' })

    await user.click(button)
    await user.click(button)

    await waitFor(() => expect(desktopSidebar()).toHaveAttribute('data-state', 'expanded'))
  })

  it('lässt die Sidebar-Links im ausgeklappten Zustand per Tab erreichen', async () => {
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(istPerTabErreichbar(sidebarLink('Startseite'))).toBe(true)
    expect(istPerTabErreichbar(sidebarLink('Katalog'))).toBe(true)
  })

  it('nimmt die Sidebar-Links im eingeklappten Zustand aus dem Tab-Fluss', async () => {
    const { user } = zeigeApp('/')
    await user.click(await screen.findByRole('button', { name: 'Seitenleiste ein-/ausblenden' }))
    await waitFor(() => expect(desktopSidebar()).toHaveAttribute('data-state', 'collapsed'))

    const links = within(desktopSidebar()).getAllByRole('link', { hidden: true })
    expect(links.length).toBeGreaterThan(0)
    expect(links.filter(istPerTabErreichbar).map((l) => l.textContent?.trim())).toEqual([])
  })

  it('macht die Sidebar-Links nach erneutem Ausklappen wieder per Tab erreichbar', async () => {
    const { user } = zeigeApp('/')
    const button = await screen.findByRole('button', { name: 'Seitenleiste ein-/ausblenden' })

    await user.click(button)
    await user.click(button)
    await waitFor(() => expect(desktopSidebar()).toHaveAttribute('data-state', 'expanded'))

    expect(istPerTabErreichbar(sidebarLink('Startseite'))).toBe(true)
    expect(istPerTabErreichbar(sidebarLink('Katalog'))).toBe(true)
  })
})

describe('App – Sidebar als Overlay (schmaler Bildschirm)', () => {
  const urspruenglicheBreite = window.innerWidth

  beforeEach(() => {
    // use-mobile wertet window.innerWidth (< 768) aus und abonniert matchMedia (max-width: 767px).
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
    stubMatchMedia((query) => query.includes('max-width'))
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: urspruenglicheBreite })
  })

  async function oeffneOverlay() {
    const ergebnis = zeigeApp('/')
    await ergebnis.user.click(await screen.findByRole('button', { name: 'Seitenleiste ein-/ausblenden' }))
    const dialog = await screen.findByRole('dialog', { name: 'Seitenleiste' })
    return { ...ergebnis, dialog }
  }

  it('zeigt die Sidebar-Links vor dem Öffnen nicht an', async () => {
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(screen.queryByRole('link', { name: 'Katalog' })).not.toBeInTheDocument()
  })

  it('öffnet per Button ein Overlay als Dialog mit dem Namen „Seitenleiste“', async () => {
    const { dialog } = await oeffneOverlay()

    expect(dialog).toBeInTheDocument()
  })

  it('gibt dem Overlay eine deutsche Beschreibung', async () => {
    const { dialog } = await oeffneOverlay()

    expect(dialog).toHaveAccessibleDescription()
    const beschreibung = document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent ?? ''
    expect(beschreibung).not.toMatch(/\b(Displays|mobile|Sidebar)\b/)
  })

  it('zeigt im Overlay die Einträge „Startseite“ und „Katalog“', async () => {
    const { dialog } = await oeffneOverlay()

    expect(within(dialog).getByRole('link', { name: 'Startseite' })).toHaveAttribute('href', '/')
    expect(within(dialog).getByRole('link', { name: 'Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('schließt das Overlay nach Klick auf „Katalog“ und zeigt die Liste', async () => {
    const { user, router, dialog } = await oeffneOverlay()

    await user.click(within(dialog).getByRole('link', { name: 'Katalog' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Seitenleiste' })).not.toBeInTheDocument())
    expect(await screen.findByText(TEXTE.leereListe)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/coins')
  })
})

describe('App – Farbschema', () => {
  it('bietet im Menü „Farbschema wählen“ die Einträge Hell, Dunkel und System an', async () => {
    const { user } = zeigeApp('/')

    await user.click(await screen.findByRole('button', { name: 'Farbschema wählen' }))

    const eintraege = (await screen.findAllByRole('menuitem')).map((e) => e.textContent?.trim())
    expect(eintraege).toEqual(['Hell', 'Dunkel', 'System'])
  })

  it('setzt bei „Dunkel“ die Klasse dark auf <html>', async () => {
    const { user } = zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    await waehleFarbschema(user, 'Dunkel')

    await waitFor(() => expect(html()).toHaveClass('dark'))
    expect(html()).not.toHaveClass('light')
  })

  it('speichert „Dunkel“ unter dem Schlüssel coin-theme', async () => {
    const { user } = zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    await waehleFarbschema(user, 'Dunkel')

    await waitFor(() => expect(localStorage.getItem(THEME_SCHLUESSEL)).toBe('dark'))
  })

  it('setzt bei „Hell“ die Klasse light auf <html> und speichert light', async () => {
    stubMatchMedia((query) => query === DUNKEL_QUERY)
    const { user } = zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    await waehleFarbschema(user, 'Hell')

    await waitFor(() => expect(html()).toHaveClass('light'))
    expect(html()).not.toHaveClass('dark')
    expect(localStorage.getItem(THEME_SCHLUESSEL)).toBe('light')
  })

  it('folgt bei „System“ der Systemvorgabe und speichert system', async () => {
    localStorage.setItem(THEME_SCHLUESSEL, 'light')
    stubMatchMedia((query) => query === DUNKEL_QUERY)
    const { user } = zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    await waehleFarbschema(user, 'System')

    await waitFor(() => expect(html()).toHaveClass('dark'))
    expect(localStorage.getItem(THEME_SCHLUESSEL)).toBe('system')
  })

  it('wendet ohne gespeicherten Wert das helle System-Schema an', async () => {
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    await waitFor(() => expect(html()).toHaveClass('light'))
    expect(html()).not.toHaveClass('dark')
  })

  it('wendet ohne gespeicherten Wert das dunkle System-Schema an', async () => {
    stubMatchMedia((query) => query === DUNKEL_QUERY)
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    await waitFor(() => expect(html()).toHaveClass('dark'))
    expect(html()).not.toHaveClass('light')
  })

  it('schreibt beim Start ohne Auswahl nichts in den localStorage', async () => {
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(localStorage.getItem(THEME_SCHLUESSEL)).toBeNull()
  })

  it('wendet einen gespeicherten Wert beim Start an', async () => {
    localStorage.setItem(THEME_SCHLUESSEL, 'dark')
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    await waitFor(() => expect(html()).toHaveClass('dark'))
  })
})

describe('App – unbekannte Pfade', () => {
  it('zeigt „Seite nicht gefunden.“ für einen unbekannten Pfad', async () => {
    zeigeApp('/gibt-es-nicht')

    expect(await screen.findByText('Seite nicht gefunden.')).toBeInTheDocument()
  })

  it('zeigt auf der 404-Seite den Link „Zur Startseite“ mit Ziel /', async () => {
    zeigeApp('/gibt-es-nicht')

    expect(await screen.findByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '/')
  })

  it('führt von der 404-Seite über „Zur Startseite“ zur Startseite', async () => {
    const { user } = zeigeApp('/gibt-es-nicht')

    await user.click(await screen.findByRole('link', { name: 'Zur Startseite' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
  })
})

describe('App – deutsche Texte', () => {
  // Typische englische Texte aus Router- und shadcn-Vorlagen (AK-17).
  const ENGLISCH = /\b(Toggle|Sidebar|Not Found|Light|Dark|Theme|Close|Something went wrong|Go back|Home)\b/i

  /** Sichtbarer Text samt sr-only-Texten sowie aria-label, title, alt und placeholder aller Elemente. */
  function alleTexte(wurzel: HTMLElement): string {
    const attribute = [...wurzel.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    return [wurzel.textContent ?? '', ...attribute].join(' ')
  }

  it('enthält auf der Startseite samt Sidebar und Kopfzeile keine englischen Texte', async () => {
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(alleTexte(document.body)).not.toMatch(ENGLISCH)
  })

  it('enthält im geöffneten Farbschema-Menü keine englischen Texte', async () => {
    const { user } = zeigeApp('/')
    await user.click(await screen.findByRole('button', { name: 'Farbschema wählen' }))
    await screen.findAllByRole('menuitem')

    expect(alleTexte(document.body)).not.toMatch(ENGLISCH)
  })

  it('enthält auf der 404-Seite keine englischen Texte', async () => {
    zeigeApp('/gibt-es-nicht')
    await screen.findByText('Seite nicht gefunden.')

    expect(alleTexte(document.body)).not.toMatch(ENGLISCH)
  })
})
