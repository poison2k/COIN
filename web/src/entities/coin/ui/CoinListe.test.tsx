import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Coin } from '../model/types'
import { testCoin } from '../../../../test/fakeApi'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinListe } from './CoinListe'

// AK-28: Katalogliste als Tabelle.
// Feature katalog-seiten, AK-15: sr-only-Caption „Coins“, Name als Link zur Detailseite, ganze Zeile per Maus klickbar
// ohne zweiten Tab-Stopp. Der Link braucht einen Router-Kontext (test/router.tsx).

const ID_A = '0199a1b2-0000-7000-8000-00000000000a'
const ID_B = '0199a1b2-0000-7000-8000-00000000000b'

/** Rendert die Liste im Test-Router und wartet, bis sie (Tabelle oder Leermeldung) sichtbar ist. */
async function zeige(coins: Coin[]) {
  const user = userEvent.setup()
  const ergebnis = zeigeMitRouter(() => <CoinListe coins={coins} />)
  await waitFor(() =>
    expect(screen.queryByRole('table') ?? screen.queryByText('Noch keine Coins erfasst.')).not.toBeNull(),
  )
  return { user, ...ergebnis }
}

function zeileVon(name: string): HTMLElement {
  const zelle = screen.getByRole('cell', { name })
  const zeile = zelle.closest('tr')
  expect(zeile).not.toBeNull()
  return zeile as HTMLElement
}

describe('CoinListe', () => {
  it('zeigt eine Tabelle mit den Spalten Bild, Name, Herausgeber, Auflage, Erfasst am', async () => {
    await zeige([testCoin()])

    const kopf = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
    expect(kopf).toEqual(['Bild', 'Name', 'Herausgeber', 'Auflage', 'Erfasst am'])
  })

  it('zeigt je Coin eine Zeile mit Name und Herausgeber', async () => {
    await zeige([
      testCoin({ id: ID_A, name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' }),
      testCoin({ id: ID_B, name: 'Coin Gamma', herausgeber: 'Herausgeber Delta' }),
    ])

    expect(within(zeileVon('Coin Alpha')).getByText('Herausgeber Beta')).toBeInTheDocument()
    expect(within(zeileVon('Coin Gamma')).getByText('Herausgeber Delta')).toBeInTheDocument()
  })

  it('zeigt die Coins in der übergebenen Reihenfolge', async () => {
    await zeige([testCoin({ id: ID_A, name: 'Alpha' }), testCoin({ id: ID_B, name: 'bravo' })])

    const zeilen = screen.getAllByRole('row').slice(1)
    expect(zeilen.map((z) => within(z).queryByText(/Alpha|bravo/)?.textContent)).toEqual(['Alpha', 'bravo'])
  })

  it('zeigt die Auflage als Zahl', async () => {
    await zeige([testCoin({ auflage: 250 })])

    expect(within(zeileVon('Coin Alpha')).getByText('250')).toBeInTheDocument()
  })

  it('zeigt „unbekannt“, wenn die Auflage null ist', async () => {
    await zeige([testCoin({ auflage: null })])

    expect(within(zeileVon('Coin Alpha')).getByText('unbekannt')).toBeInTheDocument()
  })

  it('zeigt das Erfassungsdatum im deutschen Datumsformat', async () => {
    await zeige([testCoin({ erstelltAm: '2026-10-05T12:00:00+00:00' })])

    expect(within(zeileVon('Coin Alpha')).getByText(/^0?5\.10\.2026$/)).toBeInTheDocument()
  })

  it('zeigt ein Vorschaubild mit Alternativtext „Motiv: {name}“ und der bildUrl als Quelle', async () => {
    const bildUrl = '/api/coins/0199a1b2-0000-7000-8000-000000000001/bild?v=0123456789abcdef'
    await zeige([testCoin({ bildUrl })])

    const bild = within(zeileVon('Coin Alpha')).getByRole('img', { name: 'Motiv: Coin Alpha' })
    expect(bild).toHaveAttribute('src', bildUrl)
  })

  it('lädt das Vorschaubild verzögert (loading="lazy")', async () => {
    await zeige([testCoin({ bildUrl: '/api/coins/x/bild?v=1' })])

    expect(screen.getByRole('img', { name: 'Motiv: Coin Alpha' })).toHaveAttribute('loading', 'lazy')
  })

  it('zeigt „Kein Bild“ und kein img, wenn der Coin kein Bild hat', async () => {
    await zeige([testCoin({ bildUrl: null })])

    const zeile = zeileVon('Coin Alpha')
    expect(within(zeile).getByText('Kein Bild')).toBeInTheDocument()
    expect(within(zeile).queryByRole('img')).not.toBeInTheDocument()
  })

  it('zeigt „Noch keine Coins erfasst.“ bei leerer Liste', async () => {
    await zeige([])

    expect(screen.getByText('Noch keine Coins erfasst.')).toBeInTheDocument()
  })

  it('zeigt bei leerer Liste keine Datenzeilen', async () => {
    await zeige([])

    expect(screen.queryAllByRole('cell')).toHaveLength(0)
  })

  it('stellt HTML in Feldern als Text dar und führt es nicht aus', async () => {
    await zeige([testCoin({ name: '<img src=x onerror=alert(1)>' })])

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('CoinListe – Navigation zur Detailseite (katalog-seiten, AK-15)', () => {
  it('beschriftet die Tabelle mit der Caption „Coins“', async () => {
    await zeige([testCoin()])

    expect(screen.getByRole('table', { name: 'Coins' })).toBeInTheDocument()
  })

  it('blendet die Caption nur visuell aus (sr-only)', async () => {
    await zeige([testCoin()])

    const caption = screen.getByRole('table', { name: 'Coins' }).querySelector('caption')
    expect(caption).toHaveTextContent('Coins')
    expect(caption).toHaveClass('sr-only')
  })

  it('zeigt den Namen als Link auf /coins/{id}', async () => {
    await zeige([testCoin({ id: ID_A, name: 'Coin Alpha' })])

    expect(screen.getByRole('link', { name: 'Coin Alpha' })).toHaveAttribute('href', `/coins/${ID_A}`)
  })

  it('verlinkt jede Zeile auf die eigene Detailseite', async () => {
    await zeige([testCoin({ id: ID_A, name: 'Coin Alpha' }), testCoin({ id: ID_B, name: 'Coin Gamma' })])

    expect(within(zeileVon('Coin Gamma')).getByRole('link', { name: 'Coin Gamma' })).toHaveAttribute(
      'href',
      `/coins/${ID_B}`,
    )
  })

  it('enthält je Zeile genau einen Link (kein zweiter Tab-Stopp)', async () => {
    await zeige([testCoin({ id: ID_A, name: 'Coin Alpha', bildUrl: '/api/coins/x/bild?v=1' })])

    expect(within(zeileVon('Coin Alpha')).getAllByRole('link')).toHaveLength(1)
  })

  it('nimmt die Zeile selbst nicht in die Tab-Reihenfolge auf', async () => {
    await zeige([testCoin({ id: ID_A, name: 'Coin Alpha' })])

    const zeile = zeileVon('Coin Alpha')
    expect(zeile).not.toHaveAttribute('tabindex')
    expect([...zeile.querySelectorAll('[tabindex]')].filter((el) => el.getAttribute('tabindex') !== '-1')).toEqual([])
  })

  it('öffnet die Detailseite per Klick auf den Namen', async () => {
    const { user, router } = await zeige([testCoin({ id: ID_A, name: 'Coin Alpha' })])

    await user.click(screen.getByRole('link', { name: 'Coin Alpha' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${ID_A}`))
  })

  it('öffnet die Detailseite per Enter auf dem fokussierten Namen', async () => {
    const { user, router } = await zeige([testCoin({ id: ID_A, name: 'Coin Alpha' })])

    await user.tab()
    expect(screen.getByRole('link', { name: 'Coin Alpha' })).toHaveFocus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${ID_A}`))
  })

  it('öffnet die Detailseite per Mausklick auf eine andere Zelle der Zeile', async () => {
    const { user, router } = await zeige([testCoin({ id: ID_A, name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' })])

    await user.click(within(zeileVon('Coin Alpha')).getByText('Herausgeber Beta'))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${ID_A}`))
  })

  it.each(['Control', 'Meta', 'Shift', 'Alt'])(
    'navigiert bei %s-Klick auf eine andere Zelle nicht per synthetischem Klick',
    async (taste) => {
      const { user, router } = await zeige([
        testCoin({ id: ID_A, name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' }),
      ])

      await user.keyboard(`{${taste}>}`)
      await user.click(within(zeileVon('Coin Alpha')).getByText('Herausgeber Beta'))
      await user.keyboard(`{/${taste}}`)

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(router.state.location.pathname).toBe('/test')
    },
  )
})

// QA Runde 3 (W1): Beim echten Doppelklick auf „Vorherige Seite“ wächst die Tabelle zwischen beiden Klicks; der
// zweite Klick (event.detail = 2) trifft dann eine Zeile. Er darf keine Detailseite öffnen.
describe('CoinListe – zweiter Klick eines Doppelklicks (QA Runde 3, W1)', () => {
  it('navigiert bei einem Klick mit detail 2 auf eine andere Zelle der Zeile nicht', async () => {
    const { router } = await zeige([testCoin({ id: ID_A, name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' })])

    fireEvent.click(within(zeileVon('Coin Alpha')).getByText('Herausgeber Beta'), { detail: 2 })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(router.state.location.pathname).toBe('/test')
  })

  it('navigiert bei einem Klick mit detail 2 auf den Namens-Link nicht und verhindert die Standardaktion', async () => {
    const { router } = await zeige([testCoin({ id: ID_A, name: 'Coin Alpha' })])

    const nichtVerhindert = fireEvent.click(screen.getByRole('link', { name: 'Coin Alpha' }), { detail: 2 })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(router.state.location.pathname).toBe('/test')
    expect(nichtVerhindert).toBe(false)
  })

  it('öffnet die Detailseite weiterhin bei einem einfachen Klick (detail 1) auf eine andere Zelle', async () => {
    const { router } = await zeige([testCoin({ id: ID_A, name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' })])

    fireEvent.click(within(zeileVon('Coin Alpha')).getByText('Herausgeber Beta'), { detail: 1 })

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${ID_A}`))
  })
})
