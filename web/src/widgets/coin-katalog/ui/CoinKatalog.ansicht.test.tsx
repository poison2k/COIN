import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import { erstelleFakeApi, problemAntwort, testCoin, type FakeApi } from '../../../../test/fakeApi'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinKatalog } from '../index'

// Feature startseite-listen-pruefung, AK-11 bis AK-18 (Abschnitt 4.2, ADR-0043 Punkt 2, ADR-0044): Ansichtsumschalter
// „Ansicht“ (Tabelle/Karten, Standard Tabelle), Speicherung in localStorage['coin-katalog-ansicht'] (ungültig → Tabelle,
// werfender Speicher ohne Fehler), kein Request beim Wechsel, Chip „Suche: …“ mit Entfernen, Leer- und Fehlerzustände
// mit „Erneut versuchen“. Suche und Seite sind Props (sie stehen in der URL); die Test-Steuerung übernimmt die Route.

const SCHLUESSEL = 'coin-katalog-ansicht'
const GET_LISTE = /^\/api\/coins$/

let api: FakeApi

function coinNr(nr: number, teil: Partial<Coin> = {}): Coin {
  return testCoin({
    id: `0199a1b2-0000-7000-8000-${String(nr).padStart(12, '0')}`,
    name: `Coin ${String(nr).padStart(3, '0')}`,
    herausgeber: `Herausgeber ${nr}`,
    ...teil,
  })
}

function starte(coins: Coin[] = [coinNr(1), coinNr(2, { auflage: null })]) {
  api = erstelleFakeApi(coins)
  vi.stubGlobal('fetch', api.fetch)
}

beforeEach(() => {
  starte()
})

function zeige({ suche = '', seite = 1 }: { suche?: string; seite?: number } = {}) {
  const onSuche = vi.fn<(suche: string) => void>()
  const onSeite = vi.fn<(seite: number) => void>()
  function Steuerung() {
    const [zustand, setZustand] = useState({ suche, seite })
    return (
      <CoinKatalog
        suche={zustand.suche}
        seite={zustand.seite}
        onSuche={(neu) => {
          onSuche(neu)
          setZustand({ suche: neu.trim(), seite: 1 })
        }}
        onSeite={(neu) => {
          onSeite(neu)
          setZustand((alt) => ({ ...alt, seite: neu }))
        }}
      />
    )
  }
  const user = userEvent.setup()
  const ansicht = zeigeMitRouter(() => <Steuerung />, { pfad: '/coins' })
  return { user, onSuche, onSeite, ...ansicht }
}

const gruppe = () => screen.getByRole('group', { name: 'Ansicht' })
const knopf = (name: 'Tabelle' | 'Karten') => within(gruppe()).getByRole('button', { name })
const abrufe = () => api.anfragenMit('GET', GET_LISTE)
const suchfeld = () => screen.getByRole('searchbox', { name: 'Coins suchen' })

async function geladen(): Promise<void> {
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/gefunden/))
}

// ---------- AK-12: Ansichtsumschalter ----------

describe('Ansichtsumschalter (AK-12)', () => {
  it('hat eine Gruppe „Ansicht“ mit den Elementen „Tabelle“ und „Karten“', async () => {
    zeige()
    await geladen()

    expect(
      within(gruppe())
        .getAllByRole('button')
        .map((b) => b.textContent?.trim()),
    ).toEqual(['Tabelle', 'Karten'])
  })

  it('aktiviert ohne gespeicherte Wahl „Tabelle“', async () => {
    zeige()
    await geladen()

    expect(knopf('Tabelle')).toHaveAttribute('aria-pressed', 'true')
    expect(knopf('Karten')).toHaveAttribute('aria-pressed', 'false')
  })

  it('zeigt ohne gespeicherte Wahl die Tabelle „Coins“', async () => {
    zeige()

    expect(await screen.findByRole('table', { name: 'Coins' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Coins' })).not.toBeInTheDocument()
  })

  it('wechselt per Klick auf „Karten“ zur Liste „Coins“ und setzt aria-pressed', async () => {
    const { user } = zeige()
    await screen.findByRole('table', { name: 'Coins' })

    await user.click(knopf('Karten'))

    expect(await screen.findByRole('list', { name: 'Coins' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Coins' })).not.toBeInTheDocument()
    expect(knopf('Karten')).toHaveAttribute('aria-pressed', 'true')
    expect(knopf('Tabelle')).toHaveAttribute('aria-pressed', 'false')
  })

  it('wechselt per Enter auf dem fokussierten Element', async () => {
    const { user } = zeige()
    await screen.findByRole('table', { name: 'Coins' })
    knopf('Karten').focus()

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('list', { name: 'Coins' })).toBeInTheDocument()
  })

  it('wechselt per Leertaste auf dem fokussierten Element', async () => {
    const { user } = zeige()
    await screen.findByRole('table', { name: 'Coins' })
    knopf('Karten').focus()

    await user.keyboard(' ')

    expect(await screen.findByRole('list', { name: 'Coins' })).toBeInTheDocument()
  })

  it('nennt die Elemente mit ihrem sichtbaren Text (Icons aria-hidden)', async () => {
    zeige()
    await geladen()

    for (const name of ['Tabelle', 'Karten'] as const) {
      expect(knopf(name)).toHaveAccessibleName(name)
      for (const svg of knopf(name).querySelectorAll('svg')) expect(svg).toHaveAttribute('aria-hidden', 'true')
    }
  })
})

// ---------- AK-13: Wechsel ohne Request, Speicherung ----------

describe('Speicherung der Ansicht (AK-13, ADR-0044)', () => {
  it('löst beim Wechsel der Ansicht keinen Request aus', async () => {
    const { user } = zeige()
    await screen.findByRole('table', { name: 'Coins' })
    const vorher = abrufe().length

    await user.click(knopf('Karten'))
    await screen.findByRole('list', { name: 'Coins' })
    await user.click(knopf('Tabelle'))
    await screen.findByRole('table', { name: 'Coins' })

    expect(abrufe()).toHaveLength(vorher)
    expect(api.anfragen.filter((a) => a.methode !== 'GET' || !GET_LISTE.test(a.pfad))).toEqual([])
  })

  it('meldet beim Wechsel weder eine neue Suche noch eine neue Seite', async () => {
    const { user, onSuche, onSeite } = zeige({ suche: 'Coin', seite: 1 })
    await screen.findByRole('table', { name: 'Coins' })

    await user.click(knopf('Karten'))

    expect(onSuche).not.toHaveBeenCalled()
    expect(onSeite).not.toHaveBeenCalled()
  })

  it('schreibt „karten“ bzw. „tabelle“ unter coin-katalog-ansicht in den localStorage', async () => {
    const { user } = zeige()
    await screen.findByRole('table', { name: 'Coins' })

    await user.click(knopf('Karten'))
    expect(localStorage.getItem(SCHLUESSEL)).toBe('karten')

    await user.click(knopf('Tabelle'))
    expect(localStorage.getItem(SCHLUESSEL)).toBe('tabelle')
  })

  it('zeigt mit gespeicherter Wahl „karten“ sofort die Karten', async () => {
    localStorage.setItem(SCHLUESSEL, 'karten')
    zeige()

    expect(await screen.findByRole('list', { name: 'Coins' })).toBeInTheDocument()
    expect(knopf('Karten')).toHaveAttribute('aria-pressed', 'true')
  })

  it.each(['kacheln', 'KARTEN', '', '{"ansicht":"karten"}'])(
    'zeigt bei ungültigem gespeichertem Wert „%s“ die Tabelle ohne Fehler',
    async (wert) => {
      localStorage.setItem(SCHLUESSEL, wert)
      zeige()

      expect(await screen.findByRole('table', { name: 'Coins' })).toBeInTheDocument()
      expect(knopf('Tabelle')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('schaltet auch bei werfendem localStorage um, ohne Fehler', async () => {
    const gesperrt = () => {
      throw new DOMException('Der Zugriff auf den Speicher ist gesperrt.', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(gesperrt)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(gesperrt)
    const { user } = zeige()
    expect(await screen.findByRole('table', { name: 'Coins' })).toBeInTheDocument()

    await user.click(knopf('Karten'))

    expect(await screen.findByRole('list', { name: 'Coins' })).toBeInTheDocument()
    expect(knopf('Karten')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('legt außer der Ansicht nichts im Browser-Speicher ab, auch nicht den Suchbegriff', async () => {
    const { user } = zeige({ suche: 'Geheimbegriff' })
    await geladen()

    await user.click(knopf('Karten'))

    expect(Object.keys(localStorage)).toEqual([SCHLUESSEL])
    expect(Object.keys(sessionStorage)).toEqual([])
    expect(JSON.stringify({ ...localStorage })).not.toContain('Geheimbegriff')
  })
})

// ---------- AK-11: Chip „Suche“ ----------

describe('Chip „Suche“ (AK-11)', () => {
  it('zeigt bei aktivem Suchbegriff genau einen Chip „Suche: {Begriff}“ in „Aktive Filter“', async () => {
    zeige({ suche: 'Coin' })
    await geladen()

    const chips = within(screen.getByRole('list', { name: 'Aktive Filter' })).getAllByRole('listitem')

    expect(chips).toHaveLength(1)
    expect(chips[0]).toHaveTextContent('Suche: Coin')
  })

  it('zeigt ohne Suchbegriff keine Chip-Liste', async () => {
    zeige()
    await geladen()

    expect(screen.queryByRole('list', { name: 'Aktive Filter' })).not.toBeInTheDocument()
  })

  it('setzt beim Entfernen des Chips die Suche zurück (leerer Begriff)', async () => {
    const { user, onSuche } = zeige({ suche: 'Coin' })
    await geladen()

    await user.click(screen.getByRole('button', { name: 'Filter „Suche: Coin“ entfernen' }))

    expect(onSuche).toHaveBeenCalledTimes(1)
    expect(onSuche.mock.calls[0][0].trim()).toBe('')
  })

  it('lädt nach dem Entfernen genau einmal ohne Suchbegriff', async () => {
    const { user } = zeige({ suche: 'Coin' })
    await geladen()
    const vorher = abrufe().length

    await user.click(screen.getByRole('button', { name: 'Filter „Suche: Coin“ entfernen' }))

    await waitFor(() => expect(abrufe()).toHaveLength(vorher + 1))
    expect(abrufe().at(-1)?.query.get('suche') ?? '').toBe('')
    expect(abrufe().at(-1)?.query.get('seite') ?? '1').toBe('1')
  })

  it('leert nach dem Entfernen das Suchfeld und fokussiert es', async () => {
    const { user } = zeige({ suche: 'Coin' })
    await geladen()

    await user.click(screen.getByRole('button', { name: 'Filter „Suche: Coin“ entfernen' }))

    await waitFor(() => expect(suchfeld()).toHaveFocus())
    expect(suchfeld()).toHaveValue('')
    expect(screen.queryByRole('list', { name: 'Aktive Filter' })).not.toBeInTheDocument()
  })
})

// ---------- AK-15/AK-16: Karten und Blättern ----------

describe('Karten und Blättern (AK-15, AK-16)', () => {
  beforeEach(() => {
    starte(Array.from({ length: 30 }, (_, i) => coinNr(i + 1)))
  })

  it('zeigt in der Kartenansicht eine Karte je Coin der Seite', async () => {
    localStorage.setItem(SCHLUESSEL, 'karten')
    zeige()

    const liste = await screen.findByRole('list', { name: 'Coins' })

    expect(within(liste).getAllByRole('listitem')).toHaveLength(25)
  })

  it('behält die Kartenansicht beim Blättern', async () => {
    localStorage.setItem(SCHLUESSEL, 'karten')
    const { user } = zeige()
    await screen.findByRole('list', { name: 'Coins' })

    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))

    await waitFor(() => expect(screen.getByText('Seite 2 von 2')).toBeInTheDocument())
    const liste = await screen.findByRole('list', { name: 'Coins' })
    expect(within(liste).getAllByRole('listitem')).toHaveLength(5)
    expect(knopf('Karten')).toHaveAttribute('aria-pressed', 'true')
  })

  it('wechselt beim Wechsel der Ansicht nie die Seite', async () => {
    const { user } = zeige({ seite: 2 })
    await screen.findByRole('table', { name: 'Coins' })

    await user.click(knopf('Karten'))

    expect(screen.getByText('Seite 2 von 2')).toBeInTheDocument()
    expect(abrufe().every((a) => a.query.get('seite') === '2')).toBe(true)
  })
})

// ---------- AK-17: Leerzustände ----------

describe('Leerzustände (AK-17)', () => {
  it('zeigt ohne Coins die Überschrift h2 „Noch keine Coins erfasst.“', async () => {
    starte([])
    zeige()

    expect(await screen.findByRole('heading', { level: 2, name: 'Noch keine Coins erfasst.' })).toBeInTheDocument()
  })

  it('zeigt im Leerzustand ohne Coins keinen Link „Coin hinzufügen“ (er steht im Seitenkopf)', async () => {
    starte([])
    zeige()
    await screen.findByRole('heading', { level: 2, name: 'Noch keine Coins erfasst.' })

    expect(screen.queryByRole('link', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
  })

  it('zeigt mit Suchbegriff ohne Treffer h2 „Keine Coins gefunden.“ mit Beschreibung', async () => {
    zeige({ suche: 'gibtesnicht' })

    expect(await screen.findByRole('heading', { level: 2, name: 'Keine Coins gefunden.' })).toBeInTheDocument()
    expect(
      screen.getByText('Prüfen Sie die Schreibweise oder suchen Sie nach einem anderen Begriff.'),
    ).toBeInTheDocument()
  })

  it('setzt per „Suche zurücksetzen“ die Suche zurück und lädt ohne Suchbegriff', async () => {
    const { user, onSuche } = zeige({ suche: 'gibtesnicht' })
    await screen.findByRole('heading', { level: 2, name: 'Keine Coins gefunden.' })
    const vorher = abrufe().length

    await user.click(screen.getByRole('button', { name: 'Suche zurücksetzen' }))

    expect(onSuche.mock.calls.at(-1)?.[0].trim()).toBe('')
    await waitFor(() => expect(abrufe()).toHaveLength(vorher + 1))
    expect(abrufe().at(-1)?.query.get('suche') ?? '').toBe('')
    expect(await screen.findByRole('table', { name: 'Coins' })).toBeInTheDocument()
  })

  it('fokussiert nach „Suche zurücksetzen“ das Suchfeld', async () => {
    const { user } = zeige({ suche: 'gibtesnicht' })
    await screen.findByRole('heading', { level: 2, name: 'Keine Coins gefunden.' })

    await user.click(screen.getByRole('button', { name: 'Suche zurücksetzen' }))

    await waitFor(() => expect(suchfeld()).toHaveFocus())
  })

  it('zeigt hinter dem Ende h2 „Auf dieser Seite gibt es keine Coins.“ mit Blättern', async () => {
    zeige({ seite: 9 })

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Auf dieser Seite gibt es keine Coins.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vorherige Seite' })).toBeInTheDocument()
  })

  it('zeigt die Leerzustände auch in der Kartenansicht', async () => {
    localStorage.setItem(SCHLUESSEL, 'karten')
    starte([])
    zeige()

    expect(await screen.findByRole('heading', { level: 2, name: 'Noch keine Coins erfasst.' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Coins' })).not.toBeInTheDocument()
  })
})

// ---------- AK-18: Ladefehler ----------

describe('Ladefehler (AK-18)', () => {
  const TEXT = 'Coins konnten nicht geladen werden. Bitte später erneut versuchen.'

  it('zeigt den Fehler als Alarm mit dem Button „Erneut versuchen“', async () => {
    api.einmal('GET', GET_LISTE, problemAntwort(500))
    zeige()

    const alarm = await screen.findByRole('alert')

    expect(alarm).toHaveTextContent(TEXT)
    expect(within(alarm).getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
  })

  it('lädt per „Erneut versuchen“ genau einmal mit gleicher Suche und Seite neu', async () => {
    starte(Array.from({ length: 30 }, (_, i) => coinNr(i + 1)))
    api.einmal('GET', GET_LISTE, problemAntwort(500))
    const { user } = zeige({ suche: 'Coin', seite: 2 })
    await screen.findByRole('alert')
    const vorher = abrufe().length

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    await waitFor(() => expect(abrufe()).toHaveLength(vorher + 1))
    expect(abrufe().at(-1)?.query.get('suche')).toBe('Coin')
    expect(abrufe().at(-1)?.query.get('seite')).toBe('2')
    expect(await screen.findByRole('table', { name: 'Coins' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('meldet bei „Erneut versuchen“ weder neue Suche noch neue Seite', async () => {
    api.einmal('GET', GET_LISTE, problemAntwort(500))
    const { user, onSuche, onSeite } = zeige()
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    await screen.findByRole('table', { name: 'Coins' })
    expect(onSuche).not.toHaveBeenCalled()
    expect(onSeite).not.toHaveBeenCalled()
  })
})
