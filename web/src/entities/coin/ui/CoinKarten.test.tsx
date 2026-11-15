import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Coin } from '@/entities/coin'
import { testCoin } from '../../../../test/fakeApi'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinKarten } from '../index'

// Feature startseite-listen-pruefung, AK-15 (Abschnitt 4.2 „Kartenansicht“): `CoinKarten({ coins })` zeigt eine Liste
// „Coins“ mit einer Karte je Coin in API-Reihenfolge. Je Karte h3 mit Link auf /coins/{id}, Herausgeber, „Auflage“ und
// „Erfasst am“ als dl, Bild mit alt „Motiv: {Name}“ oder „Kein Bild“, bei auflage = null der Chip „Auflage unbekannt“.
// Ein Mausklick in die Karte öffnet die Detailseite; Tab-Stopp je Karte ist nur der Link.

const ALPHA = testCoin({
  id: '0199a1b2-0000-7000-8000-0000000000a1',
  name: 'Coin Alpha',
  herausgeber: 'Herausgeber Nord',
  auflage: 1500,
  erstelltAm: '2026-10-05T12:00:00+00:00',
  bildUrl: '/api/coins/0199a1b2-0000-7000-8000-0000000000a1/bild?v=aaaaaaaaaaaaaaaa',
})
const BETA = testCoin({
  id: '0199a1b2-0000-7000-8000-0000000000b2',
  name: 'Coin Beta',
  herausgeber: 'Herausgeber Süd',
  auflage: null,
  erstelltAm: '2026-01-31T23:30:00+00:00',
  bildUrl: null,
})

function zeige(coins: Coin[] = [ALPHA, BETA]) {
  const user = userEvent.setup()
  const ansicht = zeigeMitRouter(() => <CoinKarten coins={coins} />, { pfad: '/test' })
  return { user, ...ansicht }
}

async function karten(): Promise<HTMLElement[]> {
  const liste = await screen.findByRole('list', { name: 'Coins' })
  return within(liste).getAllByRole('listitem')
}

/** Wert zu einem Begriff in der dl einer Karte. */
function wert(karte: HTMLElement, begriff: string): string | undefined {
  const dt = [...karte.querySelectorAll('dt')].find((el) => el.textContent?.trim() === begriff)
  const dd = dt?.parentElement?.tagName === 'DL' ? dt.nextElementSibling : dt?.parentElement?.querySelector('dd')
  return dd?.textContent?.trim()
}

describe('Liste und Reihenfolge (AK-15)', () => {
  it('zeigt eine Liste „Coins“ mit einer Karte je Coin', async () => {
    zeige()

    expect(await karten()).toHaveLength(2)
  })

  it('behält die Reihenfolge der API', async () => {
    zeige([BETA, ALPHA])

    const titel = (await karten()).map((k) => within(k).getByRole('heading', { level: 3 }).textContent?.trim())
    expect(titel).toEqual(['Coin Beta', 'Coin Alpha'])
  })
})

describe('Inhalt je Karte (AK-15)', () => {
  it('zeigt den Namen als h3 mit Link auf die Detailseite', async () => {
    zeige()

    const [alpha] = await karten()
    const ueberschrift = within(alpha).getByRole('heading', { level: 3, name: 'Coin Alpha' })
    expect(within(ueberschrift).getByRole('link', { name: 'Coin Alpha' })).toHaveAttribute('href', `/coins/${ALPHA.id}`)
  })

  it('zeigt den Herausgeber', async () => {
    zeige()

    const [alpha, beta] = await karten()
    expect(alpha).toHaveTextContent('Herausgeber Nord')
    expect(beta).toHaveTextContent('Herausgeber Süd')
  })

  it('zeigt „Auflage“ und „Erfasst am“ als Beschreibungsliste mit Werten in de-DE', async () => {
    zeige()

    const [alpha] = await karten()
    expect(alpha.querySelector('dl')).not.toBeNull()
    expect(wert(alpha, 'Auflage')).toBe('1.500')
    expect(wert(alpha, 'Erfasst am')).toBe('05.10.2026')
  })

  it('zeigt „Erfasst am“ nach Europe/Berlin', async () => {
    zeige()

    const [, beta] = await karten()
    expect(wert(beta, 'Erfasst am')).toBe('01.02.2026')
  })

  it('zeigt das Motivbild mit alt „Motiv: {Name}“ und lazy loading', async () => {
    zeige()

    const [alpha] = await karten()
    const bild = within(alpha).getByRole('img', { name: 'Motiv: Coin Alpha' })
    expect(bild).toHaveAttribute('src', ALPHA.bildUrl)
    expect(bild).toHaveAttribute('loading', 'lazy')
  })

  it('zeigt ohne Bild den Text „Kein Bild“ und kein img', async () => {
    zeige()

    const [, beta] = await karten()
    expect(within(beta).getByText('Kein Bild')).toBeInTheDocument()
    expect(within(beta).queryByRole('img')).not.toBeInTheDocument()
  })

  it('zeigt bei unbekannter Auflage den Chip „Auflage unbekannt“', async () => {
    zeige()

    const [, beta] = await karten()
    expect(within(beta).getByText('Auflage unbekannt', { exact: true })).toBeInTheDocument()
  })

  it('zeigt bei bekannter Auflage keinen Chip „Auflage unbekannt“', async () => {
    zeige()

    const [alpha] = await karten()
    expect(within(alpha).queryByText('Auflage unbekannt')).not.toBeInTheDocument()
  })

  it('zeigt Namen mit HTML-Zeichen als Text', async () => {
    zeige([testCoin({ ...BETA, name: '<b>Coin</b> & Co' })])

    const [karte] = await karten()
    expect(within(karte).getByRole('link', { name: '<b>Coin</b> & Co' })).toBeInTheDocument()
    expect(karte.querySelector('b')).toBeNull()
  })
})

describe('Bedienung (AK-15)', () => {
  it('öffnet per Klick in die Karte außerhalb des Links die Detailseite', async () => {
    const { user, router } = zeige()

    const [alpha] = await karten()
    await user.click(within(alpha).getByText('Herausgeber Nord'))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${ALPHA.id}`))
  })

  it('öffnet per Klick auf den Link die Detailseite', async () => {
    const { user, router } = zeige()

    await user.click(await screen.findByRole('link', { name: 'Coin Beta' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${BETA.id}`))
  })

  it('hat je Karte genau einen Tab-Stopp, den Link', async () => {
    zeige()

    for (const karte of await karten()) {
      const fokussierbar = [
        ...karte.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'),
      ].filter((el) => el.tabIndex >= 0)
      expect(fokussierbar.map((el) => el.tagName)).toEqual(['A'])
    }
  })

  it('erreicht per Tab nacheinander die Links der Karten', async () => {
    const { user } = zeige()
    await karten()

    await user.tab()
    expect(screen.getByRole('link', { name: 'Coin Alpha' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Coin Beta' })).toHaveFocus()
  })
})
