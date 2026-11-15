import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { stubBreite } from '../../../test/matchMedia'
import { DatenTabelle } from './daten-tabelle'

// Feature formulare-detailseiten, AK-29 bis AK-31 und AK-35 (Abschnitt 4.7, 4.8, ADR-0041): DatenTabelle<T> auf Basis
// von shadcn `table`. Angenommene Props (Entwurf 4.8): `beschriftung`, `zeilen`, `schluessel(zeile)`, `spalten`
// ({ id, titel, zelle(zeile), breite, ausrichtung?, karte ('titel'|'feld'|'aktion'|'aus'), sortierwert?(zeile) }),
// `sortierung?` ({ spalte, richtung: 'aufsteigend'|'absteigend' }), `onSortierung?`, `kartenUnter?`, `leer?`.
// Kartenansicht per Media-Query (`useMedienabfrage`, px-Breiten); in Vitest ohne Stub Desktop = Tabelle.

interface Version {
  version: number
  datum: string
  groesse: number
}

const ZEILEN: Version[] = [
  { version: 3, datum: '2026-10-11', groesse: 2000 },
  { version: 1, datum: '2026-10-09', groesse: 3000 },
  { version: 2, datum: '2026-10-10', groesse: 1000 },
]

type Sortierung = { spalte: string; richtung: 'aufsteigend' | 'absteigend' }

const SPALTEN = [
  {
    id: 'version',
    titel: 'Version',
    zelle: (z: Version) => `Version ${z.version}`,
    breite: 'schmal' as const,
    karte: 'titel' as const,
    sortierwert: (z: Version) => z.version,
  },
  {
    id: 'datum',
    titel: 'Hochgeladen am',
    zelle: (z: Version) => z.datum,
    breite: 'mittel' as const,
    karte: 'feld' as const,
    sortierwert: (z: Version) => z.datum,
  },
  {
    id: 'groesse',
    titel: 'Größe',
    zelle: (z: Version) => `${z.groesse} B`,
    breite: 'schmal' as const,
    ausrichtung: 'rechts' as const,
    karte: 'feld' as const,
    sortierwert: (z: Version) => z.groesse,
  },
  {
    id: 'intern',
    titel: 'Intern',
    zelle: () => 'nur Tabelle',
    breite: 'schmal' as const,
    karte: 'aus' as const,
  },
  {
    id: 'aktion',
    titel: 'Aktion',
    zelle: (z: Version) => <button type="button">{`Version ${z.version} herunterladen`}</button>,
    breite: 'schmal' as const,
    karte: 'aktion' as const,
  },
]

/** Sortierbare Tabelle mit eigenem Sortierzustand (wie die Vorlagenversionen). */
function SortierbareTabelle({ start }: { start: Sortierung }) {
  const [sortierung, setSortierung] = useState<Sortierung>(start)
  return (
    <DatenTabelle
      beschriftung="Versionen der Zertifikatsvorlage"
      zeilen={ZEILEN}
      schluessel={(z: Version) => String(z.version)}
      spalten={SPALTEN}
      sortierung={sortierung}
      onSortierung={setSortierung}
    />
  )
}

function zeigeSortierbar(start: Sortierung = { spalte: 'version', richtung: 'absteigend' }) {
  const user = userEvent.setup()
  render(<SortierbareTabelle start={start} />)
  return user
}

/** Tabelle mit fester Serversortierung (seitenweise Liste): `sortierung` ohne `onSortierung`. */
function zeigeFest(zeilen: Version[] = ZEILEN, leer?: string) {
  render(
    <DatenTabelle
      beschriftung="Exemplare"
      zeilen={zeilen}
      schluessel={(z: Version) => String(z.version)}
      spalten={SPALTEN.map((s) => ({ ...s, sortierwert: undefined }))}
      sortierung={{ spalte: 'version', richtung: 'aufsteigend' }}
      leer={leer}
    />,
  )
}

function ersteSpalte(): string[] {
  const tabelle = screen.getByRole('table', { name: 'Versionen der Zertifikatsvorlage' })
  return within(tabelle)
    .getAllByRole('row')
    .slice(1)
    .map((zeile) => within(zeile).getAllByRole('cell')[0].textContent?.trim() ?? '')
}

function kopf(name: string): HTMLElement {
  return screen.getByRole('columnheader', { name })
}

describe('Tabelle (AK-29)', () => {
  it('trägt die Beschriftung als zugänglichen Namen (Caption)', () => {
    zeigeFest()

    expect(screen.getByRole('table', { name: 'Exemplare' })).toBeInTheDocument()
  })

  it('zeigt die Spaltentitel als columnheader-Text', () => {
    zeigeFest()

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())).toEqual([
      'Version',
      'Hochgeladen am',
      'Größe',
      'Intern',
      'Aktion',
    ])
  })

  it('zeigt je Zeile die Zellen in Spaltenreihenfolge', () => {
    zeigeFest()

    const zeile = within(screen.getByRole('table')).getAllByRole('row')[1]
    expect(
      within(zeile)
        .getAllByRole('cell')
        .map((td) => td.textContent?.trim()),
    ).toEqual(['Version 3', '2026-10-11', '2000 B', 'nur Tabelle', 'Version 3 herunterladen'])
  })

  it('zeigt ohne Zeilen den Leertext', () => {
    zeigeFest([], 'Keine Versionen vorhanden.')

    expect(screen.getByText('Keine Versionen vorhanden.')).toBeInTheDocument()
  })

  it('zeigt in Vitest (Desktop) keine Kartenliste', () => {
    zeigeFest()

    expect(screen.queryByRole('list', { name: 'Exemplare' })).not.toBeInTheDocument()
  })
})

describe('Feste Serversortierung (AK-31, F7)', () => {
  it('setzt aria-sort an der sortierten Spalte', () => {
    zeigeFest()

    expect(kopf('Version')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('setzt aria-sort nur an der sortierten Spalte', () => {
    zeigeFest()

    const mitSortierung = screen.getAllByRole('columnheader').filter((th) => th.hasAttribute('aria-sort'))
    expect(mitSortierung).toEqual([kopf('Version')])
  })

  it('hat keinen Sortier-Button im Spaltenkopf', () => {
    zeigeFest()

    for (const th of screen.getAllByRole('columnheader')) {
      expect(within(th).queryByRole('button')).not.toBeInTheDocument()
    }
  })

  it('ändert die Reihenfolge der Zeilen nicht', () => {
    zeigeFest()

    const zeilen = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(zeilen.map((z) => within(z).getAllByRole('cell')[0].textContent?.trim())).toEqual([
      'Version 3',
      'Version 1',
      'Version 2',
    ])
  })
})

describe('Clientseitige Sortierung (AK-31)', () => {
  it('hat in sortierbaren Spalten einen Button mit dem Spaltentitel als Namen', () => {
    zeigeSortierbar()

    for (const titel of ['Version', 'Hochgeladen am', 'Größe']) {
      expect(within(kopf(titel)).getByRole('button', { name: titel })).toBeInTheDocument()
    }
  })

  it('hat in nicht sortierbaren Spalten keinen Button', () => {
    zeigeSortierbar()

    expect(within(kopf('Intern')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('behält als Text des Spaltenkopfs den Titel (Pfeil aria-hidden)', () => {
    zeigeSortierbar()

    expect(kopf('Version').textContent?.trim()).toBe('Version')
  })

  it('zeigt den Standard „Version absteigend“ per aria-sort und Reihenfolge', () => {
    zeigeSortierbar()

    expect(kopf('Version')).toHaveAttribute('aria-sort', 'descending')
    expect(ersteSpalte()).toEqual(['Version 3', 'Version 2', 'Version 1'])
  })

  it('wechselt per Klick auf dieselbe Spalte zu aufsteigend', async () => {
    const user = zeigeSortierbar()

    await user.click(within(kopf('Version')).getByRole('button', { name: 'Version' }))

    expect(kopf('Version')).toHaveAttribute('aria-sort', 'ascending')
    expect(ersteSpalte()).toEqual(['Version 1', 'Version 2', 'Version 3'])
  })

  it('sortiert nach „Größe“ aufsteigend und setzt aria-sort nur dort', async () => {
    const user = zeigeSortierbar()

    await user.click(within(kopf('Größe')).getByRole('button', { name: 'Größe' }))

    expect(kopf('Größe')).toHaveAttribute('aria-sort', 'ascending')
    expect(kopf('Version')).not.toHaveAttribute('aria-sort', 'descending')
    expect(ersteSpalte()).toEqual(['Version 2', 'Version 3', 'Version 1'])
  })

  it('sortiert nach „Hochgeladen am“ per Tastatur (Enter, dann Leertaste)', async () => {
    const user = zeigeSortierbar()
    within(kopf('Hochgeladen am')).getByRole('button', { name: 'Hochgeladen am' }).focus()

    await user.keyboard('{Enter}')
    expect(ersteSpalte()).toEqual(['Version 1', 'Version 2', 'Version 3'])

    await user.keyboard(' ')
    expect(kopf('Hochgeladen am')).toHaveAttribute('aria-sort', 'descending')
    expect(ersteSpalte()).toEqual(['Version 3', 'Version 2', 'Version 1'])
  })

  it('blendet das Pfeilsymbol für Screenreader aus', () => {
    zeigeSortierbar()

    const symbole = [...kopf('Version').querySelectorAll('svg')]
    expect(symbole.filter((s) => s.closest('[aria-hidden="true"]') === null)).toEqual([])
  })
})

describe('Kartenansicht (AK-30)', () => {
  it('zeigt bei 360 px statt der Tabelle eine Liste mit dem Caption-Namen', () => {
    stubBreite(360)
    zeigeFest()

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Exemplare' })).toBeInTheDocument()
  })

  it('zeigt je Zeile eine Karte mit dem Titel als Überschrift der Ebene 3', () => {
    stubBreite(360)
    zeigeFest()

    const liste = screen.getByRole('list', { name: 'Exemplare' })
    expect(within(liste).getAllByRole('listitem')).toHaveLength(3)
    expect(
      within(liste)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent?.trim()),
    ).toEqual(['Version 3', 'Version 1', 'Version 2'])
  })

  it('zeigt in der Karte eine dl mit den Feldern (dt = Spaltentitel), ohne Titel- und ausgeblendete Spalte', () => {
    stubBreite(360)
    zeigeFest()

    const karte = within(screen.getByRole('list', { name: 'Exemplare' })).getAllByRole('listitem')[0]
    const begriffe = [...karte.querySelectorAll('dl dt')].map((dt) => dt.textContent?.trim())
    expect(begriffe).toEqual(['Hochgeladen am', 'Größe'])
  })

  it('zeigt in der Karte die Aktionen', () => {
    stubBreite(360)
    zeigeFest()

    const karte = within(screen.getByRole('list', { name: 'Exemplare' })).getAllByRole('listitem')[0]
    expect(within(karte).getByRole('button', { name: 'Version 3 herunterladen' })).toBeInTheDocument()
  })

  it('zeigt bei 800 px mit kartenUnter="md" die Tabelle', () => {
    stubBreite(800)
    zeigeFest()

    expect(screen.getByRole('table', { name: 'Exemplare' })).toBeInTheDocument()
  })

  it('zeigt bei 800 px mit kartenUnter="lg" Karten', () => {
    stubBreite(800)
    render(
      <DatenTabelle
        beschriftung="Ausgabehistorie"
        zeilen={ZEILEN}
        schluessel={(z: Version) => String(z.version)}
        spalten={SPALTEN}
        kartenUnter="lg"
      />,
    )

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Ausgabehistorie' })).toBeInTheDocument()
  })

  it('hat immer nur eine Darstellung im DOM', () => {
    stubBreite(360)
    zeigeFest()

    expect(screen.queryAllByRole('table')).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'Version 3 herunterladen' })).toHaveLength(1)
  })
})
