import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { angemeldet, zeigeShell } from '../../../../test/shell'

// Feature design-fundament, AK-25, AK-26, AK-29 (Abschnitt 6.1): Aufbau der App-Shell mit Skip-Link, genau einem
// <header>, genau einem <main id="inhalt"> und Einklappen der Seitenleiste per Button und Strg/Cmd+B.

async function geladen(pfad = '/') {
  return screen.findByRole('heading', { level: 1, name: `Seite ${pfad}` })
}

function skipLink(): HTMLElement {
  return screen.getByRole('link', { name: 'Zum Inhalt springen' })
}

function hauptinhalt(): HTMLElement {
  const main = document.querySelector<HTMLElement>('main#inhalt')
  expect(main).not.toBeNull()
  return main as HTMLElement
}

/** Desktop-Sidebar (nicht das mobile Overlay), erkennbar an data-slot und data-state. */
function desktopSidebar(): HTMLElement {
  const sidebar = document.querySelector<HTMLElement>('[data-slot="sidebar"][data-state]')
  expect(sidebar).not.toBeNull()
  return sidebar as HTMLElement
}

function umschalter(): HTMLElement {
  return screen.getByRole('button', { name: 'Seitenleiste ein-/ausblenden' })
}

describe('Landmarks (AK-25)', () => {
  it('hat genau ein <header>', async () => {
    zeigeShell(angemeldet())
    await geladen()

    expect(document.querySelectorAll('header')).toHaveLength(1)
  })

  it('hat genau ein Landmark banner', async () => {
    zeigeShell(angemeldet())
    await geladen()

    expect(screen.getAllByRole('banner')).toHaveLength(1)
  })

  it('hat genau ein <main> und dieses hat die Id „inhalt“', async () => {
    zeigeShell(angemeldet())
    await geladen()

    expect(document.querySelectorAll('main')).toHaveLength(1)
    expect(hauptinhalt()).toBeInTheDocument()
  })

  it('macht main#inhalt per Skript fokussierbar (tabIndex -1)', async () => {
    zeigeShell(angemeldet())
    await geladen()

    expect(hauptinhalt()).toHaveAttribute('tabindex', '-1')
  })

  it('hat genau eine Navigation „Hauptnavigation“', async () => {
    zeigeShell(angemeldet())
    await geladen()

    expect(screen.getAllByRole('navigation', { name: 'Hauptnavigation' })).toHaveLength(1)
  })

  it('stellt den Seiteninhalt in main#inhalt dar', async () => {
    zeigeShell(angemeldet())
    const h1 = await geladen()

    expect(hauptinhalt()).toContainElement(h1)
  })

  it('ordnet Skip-Link, Seitenleiste, Kopfzeile und main in dieser Reihenfolge im DOM an', async () => {
    zeigeShell(angemeldet())
    await geladen()

    const reihenfolge = [
      skipLink(),
      screen.getByRole('navigation', { name: 'Hauptnavigation' }),
      screen.getByRole('banner'),
      hauptinhalt(),
    ]
    for (let i = 1; i < reihenfolge.length; i++) {
      const vorher = reihenfolge[i - 1]
      const nachher = reihenfolge[i]
      expect(vorher.compareDocumentPosition(nachher) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('setzt weder den Seiteninhalt noch die Kopfzeile in ein zweites <header>', async () => {
    zeigeShell(angemeldet())
    await geladen()

    expect(hauptinhalt().querySelector('header')).toBeNull()
  })
})

describe('Skip-Link (AK-26)', () => {
  it('ist ein Link „Zum Inhalt springen“ mit Ziel #inhalt', async () => {
    zeigeShell(angemeldet())
    await geladen()

    expect(skipLink()).toHaveAttribute('href', '#inhalt')
  })

  it('ist der erste Tab-Stopp der Seite', async () => {
    const { user } = zeigeShell(angemeldet())
    await geladen()

    await user.tab()

    expect(skipLink()).toHaveFocus()
  })

  it('setzt per Enter den Fokus auf main#inhalt', async () => {
    const { user } = zeigeShell(angemeldet())
    await geladen()
    await user.tab()

    await user.keyboard('{Enter}')

    await waitFor(() => expect(hauptinhalt()).toHaveFocus())
  })

  it('lässt Pfad, Suche und Hash der URL beim Aktivieren unverändert', async () => {
    const { user, router } = zeigeShell(angemeldet(), { start: '/coins?suche=Alpha' })
    await geladen('/coins')
    const vorher = { ...router.state.location }

    await user.click(skipLink())

    await waitFor(() => expect(hauptinhalt()).toHaveFocus())
    expect(router.state.location.pathname).toBe(vorher.pathname)
    expect(router.state.location.searchStr).toBe(vorher.searchStr)
    expect(router.state.location.hash).toBe(vorher.hash)
    expect(window.location.hash).toBe('')
  })

  it('steht auch ohne Anmeldung zur Verfügung', async () => {
    zeigeShell({ art: 'anonym' })
    await geladen()

    expect(skipLink()).toBeInTheDocument()
  })
})

describe('Seitenleiste einklappen (AK-29)', () => {
  it('setzt aria-expanded="true" am Umschalter, solange die Seitenleiste ausgeklappt ist', async () => {
    zeigeShell(angemeldet())
    await geladen()

    expect(umschalter()).toHaveAttribute('aria-expanded', 'true')
  })

  it('setzt aria-expanded="false" am Umschalter nach dem Einklappen', async () => {
    const { user } = zeigeShell(angemeldet())
    await geladen()

    await user.click(umschalter())

    await waitFor(() => expect(desktopSidebar()).toHaveAttribute('data-state', 'collapsed'))
    expect(umschalter()).toHaveAttribute('aria-expanded', 'false')
  })

  it('macht die eingeklappte Seitenleiste inert', async () => {
    const { user } = zeigeShell(angemeldet())
    await geladen()

    await user.click(umschalter())

    await waitFor(() =>
      expect(
        screen.getByRole('navigation', { name: 'Hauptnavigation', hidden: true }).closest('[inert]'),
      ).not.toBeNull(),
    )
  })

  it('schaltet per Strg+B um', async () => {
    const { user } = zeigeShell(angemeldet())
    await geladen()

    await user.keyboard('{Control>}b{/Control}')

    await waitFor(() => expect(desktopSidebar()).toHaveAttribute('data-state', 'collapsed'))
  })

  it('schaltet per Cmd+B um', async () => {
    const { user } = zeigeShell(angemeldet())
    await geladen()

    await user.keyboard('{Meta>}b{/Meta}')

    await waitFor(() => expect(desktopSidebar()).toHaveAttribute('data-state', 'collapsed'))
  })

  it('schaltet per Strg+B nicht um, solange ein Eingabefeld den Fokus hat', async () => {
    const { user } = zeigeShell(angemeldet(), { inhalt: <input aria-label="Testfeld" /> })
    await geladen()
    await user.click(screen.getByRole('textbox', { name: 'Testfeld' }))

    await user.keyboard('{Control>}b{/Control}')

    expect(desktopSidebar()).toHaveAttribute('data-state', 'expanded')
  })

  it('speichert den Zustand nicht (kein Cookie, kein Eintrag im localStorage)', async () => {
    const { user } = zeigeShell(angemeldet())
    await geladen()

    await user.click(umschalter())

    await waitFor(() => expect(desktopSidebar()).toHaveAttribute('data-state', 'collapsed'))
    expect(document.cookie).toBe('')
    expect(Object.keys(localStorage).filter((schluessel) => schluessel !== 'coin-theme')).toEqual([])
  })
})
