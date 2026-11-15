import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { erstelleFakeApi, testBenutzerEintrag, type FakeApi } from '../../../../test/fakeApi'
import { stubBreite } from '../../../../test/matchMedia'
import { BenutzerTabelle } from '../index'

// Feature formulare-detailseiten, AK-3, AK-29 bis AK-31 und AK-33 (Abschnitt 4.2, 4.7) für die Benutzertabelle:
// Hilfetext der Suche, Suche als Chip „Suche: {Wert}“, feste Sortierung „Name“ aufsteigend per aria-sort, Karten unter
// 768 px. Bestehende Suche, Statuszeile und Blättern bleiben (BenutzerTabelle.test.tsx).

const ICH = testBenutzerEintrag({
  id: '0199a1b2-0000-7000-8000-00000000a001',
  name: 'Test Administrator',
  email: 'admin@test.local',
  rolle: 'Administrator',
})
const ANNA = testBenutzerEintrag({
  id: '0199a1b2-0000-7000-8000-00000000b001',
  name: 'Anna Probe',
  email: 'anna@test.local',
})

const GET = /^\/api\/benutzer$/

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], { benutzer: [ICH, ANNA] })
  vi.stubGlobal('fetch', api.fetch)
})

function zeige() {
  const user = userEvent.setup()
  render(<BenutzerTabelle aktuellerBenutzerId={ICH.id} />)
  return user
}

async function suche(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByRole('searchbox', { name: 'Benutzer suchen' }), text)
  await user.click(screen.getByRole('button', { name: 'Suchen' }))
}

describe('Suche (AK-3, AK-33)', () => {
  it('beschreibt die Suche mit „Sucht in Name und E-Mail.“', async () => {
    zeige()
    await screen.findByRole('table', { name: 'Benutzer' })

    expect(screen.getByRole('searchbox', { name: 'Benutzer suchen' })).toHaveAccessibleDescription(
      expect.stringContaining('Sucht in Name und E-Mail.'),
    )
  })

  it('zeigt ohne Suche keine Liste „Aktive Filter“', async () => {
    zeige()
    await screen.findByRole('table', { name: 'Benutzer' })

    expect(screen.queryByRole('list', { name: 'Aktive Filter' })).not.toBeInTheDocument()
  })

  it('zeigt nach der Suche den Chip „Suche: {Wert}“', async () => {
    const user = zeige()
    await screen.findByRole('table', { name: 'Benutzer' })

    await suche(user, 'anna')

    expect(await screen.findByRole('list', { name: 'Aktive Filter' })).toHaveTextContent('Suche: anna')
  })

  it('lädt nach dem Entfernen des Chips ohne Suche ab Seite 1', async () => {
    const user = zeige()
    await screen.findByRole('table', { name: 'Benutzer' })
    await suche(user, 'anna')
    await screen.findByRole('list', { name: 'Aktive Filter' })

    await user.click(screen.getByRole('button', { name: 'Filter „Suche: anna“ entfernen' }))

    await waitFor(() => expect(api.anfragenMit('GET', GET).at(-1)?.query.get('suche') ?? '').toBe(''))
    expect(api.anfragenMit('GET', GET).at(-1)?.query.get('seite') ?? '1').toBe('1')
  })

  it('setzt nach dem Entfernen den Fokus auf das Suchfeld', async () => {
    const user = zeige()
    await screen.findByRole('table', { name: 'Benutzer' })
    await suche(user, 'anna')
    await screen.findByRole('list', { name: 'Aktive Filter' })

    await user.click(screen.getByRole('button', { name: 'Filter „Suche: anna“ entfernen' }))

    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Benutzer suchen' })).toHaveFocus())
  })

  it('meldet das Ergebnis weiterhin in der Statuszeile', async () => {
    const user = zeige()
    await screen.findByRole('table', { name: 'Benutzer' })

    await suche(user, 'anna')

    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent?.includes('1 Benutzer gefunden'))).toBe(true),
    )
  })
})

describe('Sortierung (AK-31)', () => {
  it('zeigt die feste Sortierung „Name“ aufsteigend per aria-sort ohne Sortier-Button', async () => {
    zeige()
    const tabelle = await screen.findByRole('table', { name: 'Benutzer' })

    const name = within(tabelle).getByRole('columnheader', { name: 'Name' })
    expect(name).toHaveAttribute('aria-sort', 'ascending')
    expect(within(name).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('Kartenansicht (AK-30)', () => {
  it('zeigt bei 360 px statt der Tabelle eine Liste „Benutzer“ mit Karten', async () => {
    stubBreite(360)
    zeige()

    const liste = await screen.findByRole('list', { name: 'Benutzer' })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(
      within(liste)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent?.trim()),
      // Reihenfolge wie von der API geliefert (fest nach Name sortiert).
    ).toEqual(['Anna Probe', 'Test Administrator'])
  })

  it('zeigt in der Karte Rolle und Aktionen', async () => {
    stubBreite(360)
    zeige()

    const liste = await screen.findByRole('list', { name: 'Benutzer' })
    // Anna Probe steht nach der Namenssortierung der API in der ersten Karte.
    const karte = within(liste).getAllByRole('listitem')[0]
    expect(within(karte).getByRole('combobox', { name: 'Rolle von Anna Probe' })).toBeInTheDocument()
    expect(within(karte).getByRole('button', { name: 'Anna Probe deaktivieren' })).toBeInTheDocument()
  })
})
