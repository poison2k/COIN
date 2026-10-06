import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import { KeinZugriffSeite, type KeinZugriffSeiteProps } from '../index'

// Feature rollen-benutzerverwaltung Rev. 3, AK-41 und AK-42 (Seitenebene): „Erneut prüfen“ auf /kein-zugriff für
// beide Gründe. Die Seite ruft `onErneutPruefen` auf und meldet das Ergebnis selbst (Zustand lokal in der Seite).
// Der Link „Zum Coin-Katalog“ braucht einen Router-Kontext; ein minimaler Test-Router genügt.

type Ergebnis = 'unveraendert' | 'fehler' | 'geaendert'
type Grund = 'deaktiviert' | 'keineRolle'

const TEXTE = {
  weiterhinDeaktiviert: 'Ihr Benutzerkonto ist weiterhin deaktiviert.',
  weiterhinKeineRolle: 'Ihrem Benutzerkonto ist weiterhin keine Rolle zugewiesen.',
  fehlgeschlagen: 'Die Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.',
  deaktiviert: 'Ihr Benutzerkonto ist deaktiviert.',
  keineRolle: 'Ihrem Konto ist aber noch keine Rolle zugewiesen',
} as const

const WEITERHIN: Record<Grund, string> = {
  deaktiviert: TEXTE.weiterhinDeaktiviert,
  keineRolle: TEXTE.weiterhinKeineRolle,
}

const ENGLISCH = /\b(Retry|Try again|Check again|Checking|Loading|Error|Failed|Still|Disabled|Deactivated|Role)\b/

/** Ein Ergebnis, das der Test selbst auflöst (Prüfung „läuft“). */
function offenesErgebnis() {
  let aufloesen!: (ergebnis: Ergebnis) => void
  const promise = new Promise<Ergebnis>((resolve) => {
    aufloesen = resolve
  })
  return { promise, aufloesen }
}

function zeige(grund: Grund, onErneutPruefen: () => Promise<Ergebnis>) {
  const props: KeinZugriffSeiteProps =
    grund === 'deaktiviert'
      ? { grund: 'deaktiviert', onErneutPruefen }
      : { grund: 'keineRolle', benutzer: ME.keine, onErneutPruefen }
  const wurzel = createRootRoute({ component: Outlet })
  const seite = createRoute({
    getParentRoute: () => wurzel,
    path: '/kein-zugriff',
    component: () => <KeinZugriffSeite {...props} />,
  })
  const coins = createRoute({ getParentRoute: () => wurzel, path: '/coins', component: () => <p>Liste</p> })
  const router = createRouter({
    routeTree: wurzel.addChildren([seite, coins]),
    history: createMemoryHistory({ initialEntries: ['/kein-zugriff'] }),
  })
  const user = userEvent.setup()
  render(<RouterProvider router={router} />)
  return { user }
}

async function erneutPruefen(): Promise<HTMLElement> {
  return screen.findByRole('button', { name: 'Erneut prüfen' })
}

function meldungen(): HTMLElement[] {
  return [...screen.queryAllByRole('status'), ...screen.queryAllByRole('alert')]
}

function alleTexte(): string {
  const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
    ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
  )
  return [document.body.textContent ?? '', ...attribute].join(' ')
}

describe.each(['deaktiviert', 'keineRolle'] as const)('KeinZugriffSeite (%s): Erneut prüfen', (grund) => {
  // ---------- AK-41 ----------

  it('zeigt den Button „Erneut prüfen“', async () => {
    zeige(
      grund,
      vi.fn(async () => 'unveraendert' as const),
    )

    expect(await erneutPruefen()).toBeInTheDocument()
  })

  it('zeigt „Erneut prüfen“ neben „Zum Coin-Katalog“ und „Abmelden“', async () => {
    zeige(
      grund,
      vi.fn(async () => 'unveraendert' as const),
    )
    const button = await erneutPruefen()

    const gruppe = button.parentElement as HTMLElement
    expect(within(gruppe).getByRole('link', { name: 'Zum Coin-Katalog' })).toBeInTheDocument()
    expect(within(gruppe).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
  })

  it('ist per Tastatur erreichbar', async () => {
    const { user } = zeige(
      grund,
      vi.fn(async () => 'unveraendert' as const),
    )
    const button = await erneutPruefen()

    for (let i = 0; i < 6 && document.activeElement !== button; i++) await user.tab()

    expect(button).toHaveFocus()
  })

  // ---------- AK-42: Aufruf ----------

  it('ruft beim Klick onErneutPruefen genau einmal auf', async () => {
    const pruefen = vi.fn(async () => 'unveraendert' as const)
    const { user } = zeige(grund, pruefen)

    await user.click(await erneutPruefen())

    await waitFor(() => expect(pruefen).toHaveBeenCalledTimes(1))
  })

  it('ist per Enter auslösbar', async () => {
    const pruefen = vi.fn(async () => 'unveraendert' as const)
    const { user } = zeige(grund, pruefen)
    ;(await erneutPruefen()).focus()

    await user.keyboard('{Enter}')

    await waitFor(() => expect(pruefen).toHaveBeenCalledTimes(1))
  })

  // ---------- AK-42: während der Prüfung ----------

  it('zeigt während der Prüfung den Text „Wird geprüft …“', async () => {
    const offen = offenesErgebnis()
    const { user } = zeige(grund, () => offen.promise)
    const button = await erneutPruefen()

    await user.click(button)

    await waitFor(() => expect(button).toHaveTextContent('Wird geprüft …'))
    offen.aufloesen('unveraendert')
  })

  it('setzt während der Prüfung aria-disabled="true" ohne disabled-Attribut', async () => {
    const offen = offenesErgebnis()
    const { user } = zeige(grund, () => offen.promise)
    const button = await erneutPruefen()

    await user.click(button)

    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    expect(button).not.toHaveAttribute('disabled')
    offen.aufloesen('unveraendert')
  })

  it('behält während der Prüfung den Fokus auf dem Button', async () => {
    const offen = offenesErgebnis()
    const { user } = zeige(grund, () => offen.promise)
    const button = await erneutPruefen()

    await user.click(button)

    await waitFor(() => expect(button).toHaveTextContent('Wird geprüft …'))
    expect(button).toHaveFocus()
    offen.aufloesen('unveraendert')
  })

  it('lässt die Seite während der Prüfung stehen', async () => {
    const offen = offenesErgebnis()
    const { user } = zeige(grund, () => offen.promise)
    const button = await erneutPruefen()

    await user.click(button)

    await waitFor(() => expect(button).toHaveTextContent('Wird geprüft …'))
    expect(screen.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeInTheDocument()
    expect(document.body.textContent?.replace(/\s+/g, ' ')).toContain(
      grund === 'deaktiviert' ? TEXTE.deaktiviert : TEXTE.keineRolle,
    )
    offen.aufloesen('unveraendert')
  })

  it('löst bei einem zweiten Klick während der Prüfung keinen zweiten Aufruf aus', async () => {
    const offen = offenesErgebnis()
    const pruefen = vi.fn(() => offen.promise)
    const { user } = zeige(grund, pruefen)
    const button = await erneutPruefen()

    await user.click(button)
    await user.click(button)

    expect(pruefen).toHaveBeenCalledTimes(1)
    offen.aufloesen('unveraendert')
  })

  it('löst bei Enter während der Prüfung keinen zweiten Aufruf aus', async () => {
    const offen = offenesErgebnis()
    const pruefen = vi.fn(() => offen.promise)
    const { user } = zeige(grund, pruefen)
    const button = await erneutPruefen()
    button.focus()

    await user.keyboard('{Enter}')
    await user.keyboard('{Enter}')

    expect(pruefen).toHaveBeenCalledTimes(1)
    offen.aufloesen('unveraendert')
  })

  // ---------- AK-42: Ergebnis ----------

  it('meldet bei unveränderter Zugriffsklasse den Text je Grund als Status', async () => {
    const { user } = zeige(grund, async () => 'unveraendert')

    await user.click(await erneutPruefen())

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(WEITERHIN[grund]))
  })

  it('behält bei unveränderter Zugriffsklasse den Fokus auf „Erneut prüfen“', async () => {
    const { user } = zeige(grund, async () => 'unveraendert')
    const button = await erneutPruefen()

    await user.click(button)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(WEITERHIN[grund]))
    expect(screen.getByRole('button', { name: 'Erneut prüfen' })).toHaveFocus()
  })

  it('ist nach der Prüfung wieder bedienbar', async () => {
    const pruefen = vi.fn(async () => 'unveraendert' as const)
    const { user } = zeige(grund, pruefen)
    const button = await erneutPruefen()

    await user.click(button)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(WEITERHIN[grund]))
    await user.click(screen.getByRole('button', { name: 'Erneut prüfen' }))

    await waitFor(() => expect(pruefen).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'Erneut prüfen' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('meldet einen Fehler als Alarm „Die Prüfung ist fehlgeschlagen. …“', async () => {
    const { user } = zeige(grund, async () => 'fehler')

    await user.click(await erneutPruefen())

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(TEXTE.fehlgeschlagen))
  })

  it('zeigt bei einem Fehler keine Meldung „weiterhin …“', async () => {
    const { user } = zeige(grund, async () => 'fehler')

    await user.click(await erneutPruefen())

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(TEXTE.fehlgeschlagen))
    // Der feste Seitentext enthält „weiterhin“ (AK-32); geprüft werden die Meldungen und die Meldungssätze.
    expect(
      meldungen()
        .map((m) => m.textContent ?? '')
        .join(' '),
    ).not.toMatch(/weiterhin/)
    expect(document.body.textContent).not.toContain(TEXTE.weiterhinDeaktiviert)
    expect(document.body.textContent).not.toContain(TEXTE.weiterhinKeineRolle)
  })

  it('zeigt bei geänderter Zugriffsklasse keine Meldung „weiterhin …“ und keinen Fehler', async () => {
    const pruefen = vi.fn(async () => 'geaendert' as const)
    const { user } = zeige(grund, pruefen)

    await user.click(await erneutPruefen())

    await waitFor(() => expect(pruefen).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Erneut prüfen' })).toBeInTheDocument())
    expect(
      meldungen()
        .map((m) => m.textContent ?? '')
        .join(' '),
    ).not.toMatch(/weiterhin|fehlgeschlagen/)
  })

  it('enthält samt Meldungen keine englischen Texte', async () => {
    const offen = offenesErgebnis()
    const { user } = zeige(grund, () => offen.promise)
    const button = await erneutPruefen()
    expect(alleTexte()).not.toMatch(ENGLISCH)

    await user.click(button)
    await waitFor(() => expect(button).toHaveTextContent('Wird geprüft …'))
    expect(alleTexte()).not.toMatch(ENGLISCH)

    offen.aufloesen('unveraendert')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(WEITERHIN[grund]))
    expect(alleTexte()).not.toMatch(ENGLISCH)
  })
})
