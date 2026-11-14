import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { testVorlagenVersion } from '../../../../test/fakeApi'
import { stubBreite } from '../../../../test/matchMedia'
import { VersionenTabelle } from '../index'

// Feature formulare-detailseiten, AK-29 bis AK-31 (Abschnitt 4.7.1): Vorlagenversionen sind vollständig geladen und
// clientseitig sortierbar nach „Version“, „Hochgeladen am“ und „Größe“ (Button im Spaltenkopf, aria-sort). Standard:
// Version absteigend (Reihenfolge der API). Karten unter 768 px.

const VERSIONEN = [
  testVorlagenVersion({ version: 3, groesseBytes: 2000, hochgeladenAm: '2026-10-11T09:00:00+00:00' }),
  testVorlagenVersion({ version: 2, groesseBytes: 3000, hochgeladenAm: '2026-10-09T09:00:00+00:00' }),
  testVorlagenVersion({ version: 1, groesseBytes: 1000, hochgeladenAm: '2026-10-10T09:00:00+00:00' }),
]

function zeige() {
  const user = userEvent.setup()
  render(<VersionenTabelle versionen={VERSIONEN} />)
  return user
}

const kopf = (name: string) => screen.getByRole('columnheader', { name })

/** Ziffern der Spalte „Version“ je Datenzeile. */
function versionen(): string[] {
  const position = screen.getAllByRole('columnheader').findIndex((th) => th.textContent?.trim() === 'Version')
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((zeile) => within(zeile).getAllByRole('cell')[position].textContent?.replace(/\D/g, '') ?? '')
}

describe('Sortierung der Vorlagenversionen (AK-31)', () => {
  it.each(['Version', 'Hochgeladen am', 'Größe'])(
    'hat im Spaltenkopf „%s“ einen Button mit dem Titel als Namen',
    (titel) => {
      zeige()

      expect(within(kopf(titel)).getByRole('button', { name: titel })).toBeInTheDocument()
    },
  )

  it.each(['Hochgeladen von', 'Status'])('hat im Spaltenkopf „%s“ keinen Button', (titel) => {
    zeige()

    expect(within(kopf(titel)).queryByRole('button')).not.toBeInTheDocument()
  })

  it('behält die Spaltentitel als Text der Spaltenköpfe', () => {
    zeige()

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())).toEqual([
      'Version',
      'Hochgeladen am',
      'Hochgeladen von',
      'Größe',
      'Status',
    ])
  })

  it('sortiert standardmäßig nach Version absteigend', () => {
    zeige()

    expect(kopf('Version')).toHaveAttribute('aria-sort', 'descending')
    expect(versionen()).toEqual(['3', '2', '1'])
  })

  it('wechselt per Klick auf „Version“ zu aufsteigend', async () => {
    const user = zeige()

    await user.click(within(kopf('Version')).getByRole('button', { name: 'Version' }))

    expect(kopf('Version')).toHaveAttribute('aria-sort', 'ascending')
    expect(versionen()).toEqual(['1', '2', '3'])
  })

  it('sortiert per Enter nach „Größe“', async () => {
    const user = zeige()
    within(kopf('Größe')).getByRole('button', { name: 'Größe' }).focus()

    await user.keyboard('{Enter}')

    expect(kopf('Größe')).toHaveAttribute('aria-sort', 'ascending')
    expect(versionen()).toEqual(['1', '3', '2'])
  })

  it('sortiert per Leertaste nach „Hochgeladen am“ und setzt aria-sort nur dort', async () => {
    const user = zeige()
    within(kopf('Hochgeladen am')).getByRole('button', { name: 'Hochgeladen am' }).focus()

    await user.keyboard(' ')

    expect(kopf('Hochgeladen am')).toHaveAttribute('aria-sort', 'ascending')
    expect(kopf('Version')).not.toHaveAttribute('aria-sort')
    expect(versionen()).toEqual(['2', '1', '3'])
  })

  it('wechselt beim zweiten Klick auf dieselbe Spalte die Richtung', async () => {
    const user = zeige()

    await user.click(within(kopf('Größe')).getByRole('button', { name: 'Größe' }))
    await user.click(within(kopf('Größe')).getByRole('button', { name: 'Größe' }))

    expect(kopf('Größe')).toHaveAttribute('aria-sort', 'descending')
    expect(versionen()).toEqual(['2', '3', '1'])
  })
})

describe('Kartenansicht (AK-30)', () => {
  it('zeigt bei 360 px eine Liste „Versionen der Zertifikatsvorlage“ statt der Tabelle', () => {
    stubBreite(360)
    render(<VersionenTabelle versionen={VERSIONEN} />)

    expect(screen.getByRole('list', { name: 'Versionen der Zertifikatsvorlage' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
