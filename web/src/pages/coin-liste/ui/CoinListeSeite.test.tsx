import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { erstelleFakeApi, testCoin, type FakeApi } from '../../../../test/fakeApi'
import { seitentext, TEXTE } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinListeSeite, type CoinListeSeiteProps } from '../index'

// Feature katalog-seiten, AK-12, AK-13, AK-26: Seite „Katalog“ (/coins) nur zum Ansehen. Kein Formular außer der Suche,
// Link „Coin hinzufügen“ nur mit `darfAnlegen`. Laden, Suche und Blättern prüft das Widget (CoinKatalog.test.tsx).
// Ersetzt die Tests zum Formular auf /coins (bisher AK-28, AK-29, AK-33, AK-34 aus coin-katalog und anmeldung-keycloak).

const ENTFALLEN = [
  'Neuen Coin erfassen',
  'Zum Erfassen von Coins melden Sie sich bitte an.',
  'Coins erfassen können nur Administratoren und Sachbearbeiter.',
]

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([
    testCoin({ name: 'Coin Alpha', bildUrl: '/api/coins/0199a1b2-0000-7000-8000-000000000001/bild?v=a' }),
  ])
  vi.stubGlobal('fetch', api.fetch)
})

function zeigeSeite(props: Partial<CoinListeSeiteProps> = {}) {
  const onSuche = vi.fn<(suche: string) => void>()
  const onSeite = vi.fn<(seite: number) => void>()
  const user = userEvent.setup()
  const { router } = zeigeMitRouter(
    () => <CoinListeSeite suche="" seite={1} darfAnlegen={false} onSuche={onSuche} onSeite={onSeite} {...props} />,
    { pfad: '/coins' },
  )
  return { user, router, onSuche, onSeite }
}

async function geladen(): Promise<void> {
  await screen.findByRole('table', { name: 'Coins' })
}

describe('Aufbau', () => {
  it('zeigt die Überschrift „Katalog“ als Ebene 1', async () => {
    zeigeSeite()

    expect(await screen.findByRole('heading', { level: 1, name: 'Katalog' })).toBeInTheDocument()
  })

  it('hat genau eine Überschrift der Ebene 1', async () => {
    zeigeSeite()
    await geladen()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('zeigt die Katalogliste mit Motivbild', async () => {
    zeigeSeite()

    const bild = await screen.findByRole('img', { name: 'Motiv: Coin Alpha' })
    expect(bild).toHaveAttribute('src', '/api/coins/0199a1b2-0000-7000-8000-000000000001/bild?v=a')
  })

  it('zeigt „Noch keine Coins erfasst.“ bei leerem Katalog', async () => {
    api.coins.splice(0)
    zeigeSeite()

    expect(await screen.findByText(TEXTE.leereListe)).toBeInTheDocument()
  })

  it('reicht Suche und Seite an den Katalog weiter', async () => {
    zeigeSeite({ suche: 'Alpha', seite: 1 })
    await geladen()

    const abruf = api.anfragenMit('GET', /^\/api\/coins$/).at(-1)
    expect(abruf?.query.get('suche')).toBe('Alpha')
    expect(abruf?.query.get('seite')).toBe('1')
  })

  it('meldet eine Suche über onSuche', async () => {
    const { user, onSuche } = zeigeSeite()
    await geladen()

    await user.type(screen.getByRole('searchbox', { name: 'Coins suchen' }), 'Beta{Enter}')

    expect(onSuche).toHaveBeenCalledWith('Beta')
  })
})

// ---------- AK-12: kein Formular ----------

describe.each([false, true])('ohne Formular (darfAnlegen = %s)', (darfAnlegen) => {
  it('enthält kein Formular außer der Suche', async () => {
    zeigeSeite({ darfAnlegen })
    await geladen()

    const formulare = [...document.querySelectorAll('form')]
    expect(formulare).toHaveLength(1)
    expect(within(formulare[0]).getByRole('searchbox', { name: 'Coins suchen' })).toBeInTheDocument()
  })

  it('enthält kein Eingabefeld außer dem Suchfeld', async () => {
    zeigeSeite({ darfAnlegen })
    await geladen()

    const felder = [...document.querySelectorAll('input, textarea, select')]
    expect(felder).toEqual([screen.getByRole('searchbox', { name: 'Coins suchen' })])
  })

  it('zeigt keinen Button „Coin anlegen“ und keinen Button „Anmelden“', async () => {
    zeigeSeite({ darfAnlegen })
    await geladen()

    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument()
  })

  it('enthält die Texte des entfallenen Erfassen-Abschnitts nicht mehr', async () => {
    zeigeSeite({ darfAnlegen })
    await geladen()

    for (const text of ENTFALLEN) expect(seitentext()).not.toContain(text)
  })
})

// ---------- AK-13: Link „Coin hinzufügen“ ----------

describe('Link „Coin hinzufügen“', () => {
  it('erscheint mit darfAnlegen als Link auf /coins/neu', async () => {
    zeigeSeite({ darfAnlegen: true })

    expect(await screen.findByRole('link', { name: 'Coin hinzufügen' })).toHaveAttribute('href', '/coins/neu')
  })

  it('ist ein Link und kein Button', async () => {
    zeigeSeite({ darfAnlegen: true })
    await screen.findByRole('link', { name: 'Coin hinzufügen' })

    expect(screen.queryByRole('button', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
  })

  it('blendet das Icon für Screenreader aus', async () => {
    zeigeSeite({ darfAnlegen: true })
    const link = await screen.findByRole('link', { name: 'Coin hinzufügen' })

    const icons = [...link.querySelectorAll('svg')]
    expect(icons.length).toBeGreaterThan(0)
    for (const svg of icons) expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('steht vor dem Katalog (neben der Überschrift)', async () => {
    zeigeSeite({ darfAnlegen: true })
    await geladen()

    const link = screen.getByRole('link', { name: 'Coin hinzufügen' })
    const suche = screen.getByRole('searchbox', { name: 'Coins suchen' })
    expect(link.compareDocumentPosition(suche) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('führt zu /coins/neu', async () => {
    const { user, router } = zeigeSeite({ darfAnlegen: true })

    await user.click(await screen.findByRole('link', { name: 'Coin hinzufügen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins/neu'))
  })

  it('fehlt ohne darfAnlegen im DOM', async () => {
    zeigeSeite({ darfAnlegen: false })
    await geladen()

    expect(screen.queryByRole('link', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
    expect(seitentext()).not.toContain('Coin hinzufügen')
  })
})

// ---------- AK-26: deutsche Texte ----------

describe('deutsche Texte', () => {
  it('zeigt keine englischen Standardtexte', async () => {
    zeigeSeite({ darfAnlegen: true })
    await geladen()

    expect(seitentext()).not.toMatch(/\b(Loading|Error|No data|Submit|Image|Created|Add|New|Search|Catalog)\b/)
  })
})
