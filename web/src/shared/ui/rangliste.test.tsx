import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Rangliste } from './rangliste'

// Feature startseite-listen-pruefung, AK-7 und AK-38 (Abschnitt 4.1 „Meistausgegebene Coins“, 4.6):
// `Rangliste({ beschriftung?, eintraege: { id, rang, inhalt, wert }[] })` ist ein <ol> ohne Browser-Nummerierung. Je
// Eintrag eine sichtbare Rangzahl mit sr-only-Präfix „Platz “, daneben der Inhalt und rechts der Wert als eigenes
// Element.

const EINTRAEGE = [
  { id: 'a', rang: 1, inhalt: <a href="/coins/a">Coin Erster</a>, wert: '1.234 ausgegeben' },
  { id: 'b', rang: 2, inhalt: <a href="/coins/b">Coin Zweiter</a>, wert: '7 ausgegeben' },
  { id: 'c', rang: 3, inhalt: <a href="/coins/c">Coin Dritter</a>, wert: '1 ausgegeben' },
]

function zeige(beschriftung?: string) {
  return render(<Rangliste beschriftung={beschriftung} eintraege={EINTRAEGE} />)
}

describe('Rangliste (AK-7)', () => {
  it('ist eine geordnete Liste <ol> mit einem Eintrag je Rang', () => {
    const { container } = zeige()

    const liste = container.querySelector('ol')
    expect(liste).not.toBeNull()
    expect(within(liste as HTMLElement).getAllByRole('listitem')).toHaveLength(3)
  })

  it('trägt die Beschriftung als zugänglichen Namen der Liste', () => {
    zeige('Meistausgegebene Coins')

    expect(screen.getByRole('list', { name: 'Meistausgegebene Coins' })).toBeInTheDocument()
  })

  it('nennt je Eintrag „Platz {rang}“ für Screenreader', () => {
    zeige()

    const eintraege = screen.getAllByRole('listitem')
    expect(eintraege.map((li) => li.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringContaining('Platz 1'),
      expect.stringContaining('Platz 2'),
      expect.stringContaining('Platz 3'),
    ])
  })

  it('zeigt die Rangzahl sichtbar ohne das Präfix (Präfix sr-only)', () => {
    zeige()

    const eintrag = screen.getAllByRole('listitem')[1]
    const praefix = [...eintrag.querySelectorAll('*')].find(
      (el) => el.children.length === 0 && el.textContent?.trim() === 'Platz',
    )
    expect(praefix, 'Präfix „Platz“ als eigenes Element').toBeDefined()
    expect((praefix as HTMLElement).className.toString()).toContain('sr-only')
    expect(eintrag.textContent).toContain('2')
  })

  it('zeigt Inhalt und Wert je Eintrag als eigene Elemente', () => {
    zeige()

    const eintrag = screen.getAllByRole('listitem')[0]
    expect(within(eintrag).getByRole('link', { name: 'Coin Erster' })).toBeInTheDocument()
    expect(within(eintrag).getByText('1.234 ausgegeben', { exact: true })).toBeInTheDocument()
  })

  it('nennt im Link nur den Inhalt, ohne Rang', () => {
    zeige()

    expect(screen.getByRole('link', { name: 'Coin Zweiter' })).toHaveAccessibleName('Coin Zweiter')
  })

  it('setzt keine Browser-Nummerierung (kein list-decimal)', () => {
    const { container } = zeige()

    const liste = container.querySelector('ol') as HTMLElement
    expect(liste.className.toString()).not.toMatch(/list-decimal/)
    expect(liste.getAttribute('style') ?? '').not.toMatch(/list-style-type:\s*decimal/)
  })

  it('übernimmt die Reihenfolge der Einträge', () => {
    zeige()

    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Coin Erster',
      'Coin Zweiter',
      'Coin Dritter',
    ])
  })
})
