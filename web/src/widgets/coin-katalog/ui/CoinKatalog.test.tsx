import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import {
  erstelleFakeApi,
  jsonAntwort,
  offeneAntwort,
  problemAntwort,
  seiteAntwort,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { meldungMit, seitentext } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinKatalog } from '../index'

// Feature katalog-seiten, AK-14 bis AK-16: Widget „Coin-Katalog“ mit Suche, Statuszeile, Tabelle und Blättern.
// Suche und Seite sind Props (sie stehen in der URL); die Test-Steuerung unten übernimmt die Rolle der Route.

const TEXTE = {
  laden: 'Coins werden geladen …',
  ladeFehler: 'Coins konnten nicht geladen werden. Bitte später erneut versuchen.',
  leer: 'Noch keine Coins erfasst.',
  keineTreffer: 'Keine Coins gefunden.',
} as const

const GET_LISTE = /^\/api\/coins$/

let api: FakeApi

function coinNr(nr: number, teil: Partial<Coin> = {}): Coin {
  return testCoin({
    id: `0199a1b2-0000-7000-8000-${String(nr).padStart(12, '0')}`,
    name: `Coin ${String(nr).padStart(3, '0')}`,
    ...teil,
  })
}

/** Zwei Coins, bei denen „beta“ nur im Namen von „Coin Beta“ vorkommt (AK-2 sucht auch im Herausgeber). */
function alphaUndBeta(): Coin[] {
  return [
    coinNr(1, { name: 'Coin Alpha', herausgeber: 'Herausgeber Nord' }),
    coinNr(2, { name: 'Coin Beta', herausgeber: 'Herausgeber Nord' }),
  ]
}

function starte(coins: Coin[] = []) {
  api = erstelleFakeApi(coins)
  vi.stubGlobal('fetch', api.fetch)
}

beforeEach(() => {
  starte()
})

interface Aufrufe {
  onSuche: ReturnType<typeof vi.fn<(suche: string) => void>>
  onSeite: ReturnType<typeof vi.fn<(seite: number) => void>>
}

/**
 * Hält Suche und Seite wie die Route (eine neue Suche beginnt auf Seite 1) und zeichnet die Aufrufe auf.
 * Mit `steuern: false` bleiben die Props unverändert (nur Aufrufe prüfen).
 */
function zeige({ suche = '', seite = 1, steuern = true }: { suche?: string; seite?: number; steuern?: boolean } = {}) {
  const aufrufe: Aufrufe = { onSuche: vi.fn<(suche: string) => void>(), onSeite: vi.fn<(seite: number) => void>() }
  function Steuerung() {
    const [zustand, setZustand] = useState({ suche, seite })
    return (
      <CoinKatalog
        suche={zustand.suche}
        seite={zustand.seite}
        onSuche={(neu) => {
          aufrufe.onSuche(neu)
          if (steuern) setZustand({ suche: neu, seite: 1 })
        }}
        onSeite={(neu) => {
          aufrufe.onSeite(neu)
          if (steuern) setZustand((alt) => ({ ...alt, seite: neu }))
        }}
      />
    )
  }
  const user = userEvent.setup()
  zeigeMitRouter(() => <Steuerung />, { pfad: '/coins' })
  return { user, ...aufrufe }
}

function listenAbrufe() {
  return api.anfragenMit('GET', GET_LISTE)
}

function suchfeld(): HTMLInputElement {
  return screen.getByRole('searchbox', { name: 'Coins suchen' }) as HTMLInputElement
}

async function tabelle(): Promise<HTMLElement> {
  return screen.findByRole('table', { name: 'Coins' })
}

function namenInTabelle(): string[] {
  return within(screen.getByRole('table', { name: 'Coins' }))
    .getAllByRole('link')
    .map((l) => l.textContent?.trim() ?? '')
}

// ---------- AK-16: Laden und Fehler ----------

describe('Laden', () => {
  it('zeigt während des Ladens „Coins werden geladen …“ als Status', async () => {
    const offen = offeneAntwort()
    api.einmal('GET', GET_LISTE, () => offen.promise)

    zeige()

    await waitFor(() => expect(meldungMit(TEXTE.laden)?.getAttribute('role')).toBe('status'))
    offen.aufloesen(jsonAntwort(200, seiteAntwort([])))
  })

  it('blendet den Ladehinweis nach dem Laden aus', async () => {
    zeige()

    await screen.findByText(TEXTE.leer)
    expect(screen.queryByText(TEXTE.laden)).not.toBeInTheDocument()
  })

  it('lädt ohne Suche die erste Seite mit 25 Einträgen', async () => {
    zeige()

    await waitFor(() => expect(listenAbrufe()).toHaveLength(1))
    const query = listenAbrufe()[0].query
    expect(query.get('seite')).toBe('1')
    expect(query.get('groesse')).toBe('25')
    expect(query.has('suche')).toBe(false)
  })

  it('lädt mit Suche und Seite aus den Props', async () => {
    starte(Array.from({ length: 30 }, (_, i) => coinNr(i + 1)))

    zeige({ suche: 'Coin', seite: 2 })

    await waitFor(() => expect(listenAbrufe()).toHaveLength(1))
    expect(listenAbrufe()[0].query.get('suche')).toBe('Coin')
    expect(listenAbrufe()[0].query.get('seite')).toBe('2')
  })

  it('zeigt einen Ladefehler als Alarm', async () => {
    api.einmal('GET', GET_LISTE, problemAntwort(500, { detail: 'NpgsqlException: Verbindung verweigert' }))

    zeige()

    await waitFor(() => expect(meldungMit(TEXTE.ladeFehler)?.getAttribute('role')).toBe('alert'))
  })

  it('zeigt bei einem Serverfehler keine technischen Details', async () => {
    api.einmal('GET', GET_LISTE, problemAntwort(500, { detail: 'NpgsqlException: Verbindung verweigert' }))

    zeige()

    await screen.findByText(TEXTE.ladeFehler)
    expect(seitentext()).not.toMatch(/Npgsql|Verbindung verweigert|500|Internal Server Error/)
  })

  it('zeigt bei einem Netzwerkfehler die Fehlermeldung ohne technische Details', async () => {
    api.netzwerkfehler('GET', GET_LISTE)

    zeige()

    expect(await screen.findByText(TEXTE.ladeFehler)).toBeInTheDocument()
    expect(seitentext()).not.toMatch(/Failed to fetch|TypeError/)
  })

  it('zeigt im Fehlerfall weder Ladehinweis noch Leermeldung', async () => {
    api.einmal('GET', GET_LISTE, problemAntwort(500))

    zeige()

    await screen.findByText(TEXTE.ladeFehler)
    expect(screen.queryByText(TEXTE.laden)).not.toBeInTheDocument()
    expect(screen.queryByText(TEXTE.leer)).not.toBeInTheDocument()
  })
})

// ---------- AK-14: Statuszeile und Leermeldungen ----------

describe('Statuszeile', () => {
  it('meldet „{n} Coins gefunden“ als Status', async () => {
    starte([coinNr(1), coinNr(2), coinNr(3)])

    zeige()

    await waitFor(() => expect(meldungMit('3 Coins gefunden')?.getAttribute('role')).toBe('status'))
  })

  it('meldet einen einzelnen Treffer als „1 Coin gefunden“', async () => {
    starte([coinNr(1)])

    zeige()

    await waitFor(() => expect(meldungMit('1 Coin gefunden')?.getAttribute('role')).toBe('status'))
    expect(seitentext()).not.toContain('1 Coins gefunden')
  })

  it('zählt alle Treffer (gesamt), nicht nur die Einträge der Seite', async () => {
    starte(Array.from({ length: 30 }, (_, i) => coinNr(i + 1)))

    zeige()

    await waitFor(() => expect(meldungMit('30 Coins gefunden')).toBeDefined())
  })

  it('zeigt bei leerem Katalog ohne Suchbegriff „Noch keine Coins erfasst.“', async () => {
    zeige()

    expect(await screen.findByText(TEXTE.leer)).toBeInTheDocument()
    expect(screen.queryByText(TEXTE.keineTreffer)).not.toBeInTheDocument()
  })

  it('zeigt ohne Treffer zum Suchbegriff „Keine Coins gefunden.“', async () => {
    starte([coinNr(1)])

    zeige({ suche: 'Gibtesnicht' })

    expect(await screen.findByText(TEXTE.keineTreffer)).toBeInTheDocument()
    expect(screen.queryByText(TEXTE.leer)).not.toBeInTheDocument()
  })

  it('zeigt ohne Treffer keine Tabelle', async () => {
    starte([coinNr(1)])

    zeige({ suche: 'Gibtesnicht' })

    await screen.findByText(TEXTE.keineTreffer)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

// ---------- AK-14: Suche ----------

describe('Suche', () => {
  it('hat ein Suchfeld vom Typ search mit dem Label „Coins suchen“', async () => {
    zeige()

    const feld = await screen.findByRole('searchbox', { name: 'Coins suchen' })
    expect(feld).toHaveAttribute('type', 'search')
  })

  it('begrenzt das Suchfeld auf 100 Zeichen', async () => {
    zeige()

    expect(await screen.findByRole('searchbox', { name: 'Coins suchen' })).toHaveAttribute('maxLength', '100')
  })

  it('hat einen Button „Suchen“', async () => {
    zeige()

    expect(await screen.findByRole('button', { name: 'Suchen' })).toBeInTheDocument()
  })

  it('zeigt den Suchbegriff aus den Props im Suchfeld', async () => {
    zeige({ suche: 'Alpha' })

    await waitFor(() => expect(suchfeld()).toHaveValue('Alpha'))
  })

  it('sucht per Button „Suchen“ mit dem eingegebenen Text', async () => {
    const { user, onSuche } = zeige({ steuern: false })
    await screen.findByText(TEXTE.leer)

    await user.type(suchfeld(), 'Alpha')
    await user.click(screen.getByRole('button', { name: 'Suchen' }))

    expect(onSuche).toHaveBeenCalledWith('Alpha')
  })

  it('sucht per Enter im Suchfeld', async () => {
    const { user, onSuche } = zeige({ steuern: false })
    await screen.findByText(TEXTE.leer)

    await user.type(suchfeld(), 'Alpha{Enter}')

    expect(onSuche).toHaveBeenCalledTimes(1)
    expect(onSuche).toHaveBeenCalledWith('Alpha')
  })

  it('sucht nicht schon bei jeder Eingabe', async () => {
    const { user, onSuche } = zeige({ steuern: false })
    await screen.findByText(TEXTE.leer)

    await user.type(suchfeld(), 'Alpha')

    expect(onSuche).not.toHaveBeenCalled()
    expect(listenAbrufe()).toHaveLength(1)
  })

  it('lädt nach der Suche die Treffer mit dem Suchbegriff', async () => {
    starte(alphaUndBeta())
    const { user } = zeige()
    await tabelle()

    await user.type(suchfeld(), 'beta{Enter}')

    await waitFor(() => expect(namenInTabelle()).toEqual(['Coin Beta']))
    expect(listenAbrufe().at(-1)?.query.get('suche')).toBe('beta')
  })

  it('meldet nach der Suche die Trefferzahl', async () => {
    starte(alphaUndBeta())
    const { user } = zeige()
    await tabelle()

    await user.type(suchfeld(), 'beta{Enter}')

    await waitFor(() => expect(meldungMit('1 Coin gefunden')).toBeDefined())
  })

  it('beginnt eine neue Suche auf Seite 1', async () => {
    starte(Array.from({ length: 30 }, (_, i) => coinNr(i + 1)))
    const { user } = zeige({ seite: 2 })
    await tabelle()

    await user.type(suchfeld(), 'Coin{Enter}')

    await waitFor(() => expect(listenAbrufe().at(-1)?.query.get('suche')).toBe('Coin'))
    expect(listenAbrufe().at(-1)?.query.get('seite')).toBe('1')
  })

  it('liegt in einem Formular (Enter sendet die Suche ab)', async () => {
    zeige()

    const feld = await screen.findByRole('searchbox', { name: 'Coins suchen' })
    expect(feld.closest('form')).not.toBeNull()
  })
})

// ---------- AK-15: Tabelle und Blättern ----------

describe('Tabelle und Blättern', () => {
  beforeEach(() => {
    starte(Array.from({ length: 30 }, (_, i) => coinNr(i + 1)))
  })

  it('zeigt die Coins der Seite als Tabelle „Coins“ mit Namens-Links', async () => {
    zeige()

    await tabelle()
    expect(namenInTabelle()).toHaveLength(25)
    expect(namenInTabelle()[0]).toBe('Coin 001')
  })

  it('zeigt „Seite 1 von 2“', async () => {
    zeige()
    await tabelle()

    expect(screen.getByText('Seite 1 von 2')).toBeInTheDocument()
  })

  it('sperrt „Vorherige Seite“ auf der ersten Seite', async () => {
    zeige()
    await tabelle()

    expect(screen.getByRole('button', { name: 'Vorherige Seite' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Nächste Seite' })).toBeEnabled()
  })

  it('meldet per „Nächste Seite“ die Seite 2', async () => {
    const { user, onSeite } = zeige({ steuern: false })
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))

    expect(onSeite).toHaveBeenCalledWith(2)
  })

  it('lädt nach „Nächste Seite“ die zweite Seite', async () => {
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))

    await waitFor(() => expect(namenInTabelle()[0]).toBe('Coin 026'))
    expect(listenAbrufe().at(-1)?.query.get('seite')).toBe('2')
    expect(screen.getByText('Seite 2 von 2')).toBeInTheDocument()
  })

  it('sperrt „Nächste Seite“ auf der letzten Seite', async () => {
    zeige({ seite: 2 })
    await waitFor(() => expect(screen.getByText('Seite 2 von 2')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: 'Nächste Seite' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Vorherige Seite' })).toBeEnabled()
  })

  it('meldet per „Vorherige Seite“ die Seite 1', async () => {
    const { user, onSeite } = zeige({ seite: 2, steuern: false })
    await waitFor(() => expect(screen.getByText('Seite 2 von 2')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Vorherige Seite' }))

    expect(onSeite).toHaveBeenCalledWith(1)
  })

  it('sperrt bei nur einer Seite beide Buttons', async () => {
    starte([coinNr(1), coinNr(2)])
    zeige()
    await tabelle()

    expect(screen.getByText('Seite 1 von 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vorherige Seite' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Nächste Seite' })).toBeDisabled()
  })
})

// ---------- AK-15: Seite hinter dem Ende ----------

describe('Seite hinter dem Ende', () => {
  beforeEach(() => {
    starte(Array.from({ length: 60 }, (_, i) => coinNr(i + 1)))
  })

  it('meldet per „Vorherige Seite“ die letzte vorhandene Seite statt seite − 1', async () => {
    const { user, onSeite } = zeige({ seite: 99, steuern: false })
    await screen.findByText('Auf dieser Seite gibt es keine Coins.')

    await user.click(screen.getByRole('button', { name: 'Vorherige Seite' }))

    expect(onSeite).toHaveBeenCalledWith(3)
  })

  it('lädt nach „Vorherige Seite“ die letzte vorhandene Seite', async () => {
    const { user } = zeige({ seite: 99 })
    await screen.findByText('Auf dieser Seite gibt es keine Coins.')

    await user.click(screen.getByRole('button', { name: 'Vorherige Seite' }))

    await waitFor(() => expect(listenAbrufe().at(-1)?.query.get('seite')).toBe('3'))
  })
})

// ---------- AK-16: erneute Suche nach einem Ladefehler ----------

describe('erneute Suche nach einem Ladefehler', () => {
  it('lädt bei erneuter Suche mit demselben Begriff neu', async () => {
    starte(alphaUndBeta())
    api.einmal('GET', GET_LISTE, problemAntwort(500))
    const { user } = zeige({ suche: 'beta' })
    await screen.findByText(TEXTE.ladeFehler)

    await user.click(screen.getByRole('button', { name: 'Suchen' }))

    await waitFor(() => expect(listenAbrufe()).toHaveLength(2))
    expect(listenAbrufe()[1].query.get('suche')).toBe('beta')
  })

  it('zeigt nach erfolgreicher erneuter Suche die Treffer statt des Fehlers', async () => {
    starte(alphaUndBeta())
    api.netzwerkfehler('GET', GET_LISTE)
    const { user } = zeige({ suche: 'beta' })
    await screen.findByText(TEXTE.ladeFehler)

    await user.type(suchfeld(), '{Enter}')

    await waitFor(() => expect(namenInTabelle()).toEqual(['Coin Beta']))
    expect(screen.queryByText(TEXTE.ladeFehler)).not.toBeInTheDocument()
  })
})

// ---------- AK-16: veraltete Antworten ----------

describe('veraltete Antworten', () => {
  it('überschreibt die Treffer einer neuen Suche nicht mit einer späten älteren Antwort', async () => {
    starte(alphaUndBeta())
    const offen = offeneAntwort()
    api.einmal('GET', GET_LISTE, () => offen.promise)
    const { user } = zeige()
    await waitFor(() => expect(listenAbrufe()).toHaveLength(1))

    await user.type(suchfeld(), 'beta{Enter}')
    await waitFor(() => expect(namenInTabelle()).toEqual(['Coin Beta']))
    offen.aufloesen(jsonAntwort(200, seiteAntwort([coinNr(1, { name: 'Coin Alpha' })], { gesamt: 1 })))

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(namenInTabelle()).toEqual(['Coin Beta'])
  })

  it('überschreibt eine neuere Seite nicht mit einer späten Antwort der vorherigen Seite', async () => {
    starte(Array.from({ length: 30 }, (_, i) => coinNr(i + 1)))
    const offen = offeneAntwort()
    api.einmal('GET', GET_LISTE, () => offen.promise)
    const { user } = zeige()
    await waitFor(() => expect(listenAbrufe()).toHaveLength(1))
    // Solange die erste Seite lädt, ist Blättern nicht möglich; deshalb wird über die Suche neu geladen.
    await user.type(suchfeld(), 'Coin 02{Enter}')
    await waitFor(() => expect(namenInTabelle()[0]).toBe('Coin 020'))

    offen.aufloesen(jsonAntwort(200, seiteAntwort([coinNr(1)], { gesamt: 30 })))

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(namenInTabelle()[0]).toBe('Coin 020')
    expect(meldungMit('30 Coins gefunden')).toBeUndefined()
  })
})

// ---------- AK-26: deutsche Texte ----------

describe('deutsche Texte', () => {
  it('enthält mit Tabelle und Blättern keine englischen Standardtexte', async () => {
    starte(Array.from({ length: 30 }, (_, i) => coinNr(i + 1)))
    zeige()
    await tabelle()

    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    expect([seitentext(), ...attribute].join(' ')).not.toMatch(
      /\b(Search|Previous|Next|Page|Loading|Error|No results|No data|found|Image)\b/,
    )
  })
})
