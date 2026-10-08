import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { zeigeMitRouter } from '../../../../test/router'
import { KeinZugriffSeite } from '../index'

// Feature katalog-seiten, AK-10 (Entscheidung F1): „Kein Zugriff“ mit dem Grund keineBerechtigung für angemeldete
// Benutzer mit Rolle, denen die Berechtigung für die aufgerufene Seite fehlt. Ohne „Erneut prüfen“ (Rev. 3, F2).

const TEXT =
  'Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.'

const ENGLISCH = /\b(Access denied|Forbidden|Unauthorized|Not allowed|Permission|Retry|Back|Home|Sign out|Logout)\b/i

function zeige() {
  const user = userEvent.setup()
  const ergebnis = zeigeMitRouter(() => <KeinZugriffSeite grund="keineBerechtigung" />, { pfad: '/kein-zugriff' })
  return { user, ...ergebnis }
}

function seitenText(): string {
  return document.body.textContent?.replace(/\s+/g, ' ') ?? ''
}

describe('KeinZugriffSeite (keineBerechtigung)', () => {
  it('zeigt die Überschrift „Kein Zugriff“ als Ebene 1', async () => {
    zeige()

    expect(await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeInTheDocument()
  })

  it('hat genau eine Überschrift der Ebene 1', async () => {
    zeige()
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('zeigt den Text für fehlende Berechtigung', async () => {
    zeige()
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    expect(seitenText()).toContain(TEXT)
  })

  it('zeigt weder den Text für Deaktivierte noch den für „ohne Rolle“', async () => {
    zeige()
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    expect(seitenText()).not.toContain('Ihr Benutzerkonto ist deaktiviert.')
    expect(seitenText()).not.toContain('noch keine Rolle zugewiesen')
  })

  it('verlinkt „Zum Coin-Katalog“ auf /coins', async () => {
    zeige()

    expect(await screen.findByRole('link', { name: 'Zum Coin-Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('bietet den Button „Abmelden“', async () => {
    zeige()
    const link = await screen.findByRole('link', { name: 'Zum Coin-Katalog' })

    const gruppe = link.parentElement as HTMLElement
    expect(within(gruppe).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
  })

  it('bietet kein „Erneut prüfen“', async () => {
    zeige()
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    expect(screen.queryByRole('button', { name: 'Erneut prüfen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Wird geprüft …' })).not.toBeInTheDocument()
  })

  it('führt über „Zum Coin-Katalog“ zu /coins', async () => {
    const { user, router } = zeige()

    await user.click(await screen.findByRole('link', { name: 'Zum Coin-Katalog' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
  })

  it('erreicht „Zum Coin-Katalog“ und „Abmelden“ per Tastatur', async () => {
    const { user } = zeige()
    const link = await screen.findByRole('link', { name: 'Zum Coin-Katalog' })
    const abmelden = screen.getByRole('button', { name: 'Abmelden' })

    await user.tab()
    expect(link).toHaveFocus()
    await user.tab()
    expect(abmelden).toHaveFocus()
  })

  it('enthält keine englischen Texte', async () => {
    zeige()
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    expect([seitenText(), ...attribute].join(' ')).not.toMatch(ENGLISCH)
  })
})
