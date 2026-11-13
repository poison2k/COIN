import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { Seitenkopf } from './seitenkopf'

// Feature design-fundament, AK-23 (Abschnitt 5, ADR-0036 Punkt 4): Seitenkopf mit genau einem h1, Beschreibung,
// Aktionen und optionalen Brotkrumen; Wurzelelement ist kein <header>. Der Umbruch bei 360 px wird in
// responsiv.spec.ts im Browser gemessen.

describe('Seitenkopf (AK-23)', () => {
  it('rendert genau ein h1 mit dem Titel', () => {
    render(<Seitenkopf titel="Katalog" />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Katalog' })).toBeInTheDocument()
  })

  it('rendert die Beschreibung als Absatz', () => {
    render(<Seitenkopf titel="Katalog" beschreibung="Alle Coins im Überblick." />)

    expect(screen.getByText('Alle Coins im Überblick.').tagName).toBe('P')
  })

  it('rendert ohne Beschreibung keinen leeren Absatz', () => {
    const { container } = render(<Seitenkopf titel="Katalog" />)

    expect([...container.querySelectorAll('p')].filter((p) => (p.textContent ?? '').trim() === '')).toEqual([])
  })

  it('zeigt die Aktionen', () => {
    render(<Seitenkopf titel="Katalog" aktionen={<a href="/coins/neu">Coin hinzufügen</a>} />)

    expect(screen.getByRole('link', { name: 'Coin hinzufügen' })).toBeInTheDocument()
  })

  it('stellt die Aktionen hinter den Titel (DOM-Reihenfolge)', () => {
    render(<Seitenkopf titel="Katalog" aktionen={<a href="/coins/neu">Coin hinzufügen</a>} />)

    const h1 = screen.getByRole('heading', { level: 1 })
    const aktion = screen.getByRole('link', { name: 'Coin hinzufügen' })
    expect(h1.compareDocumentPosition(aktion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('zeigt die Brotkrumen vor dem Titel', () => {
    render(<Seitenkopf titel="Coin Alpha" brotkrumen={<nav aria-label="Brotkrumen">Katalog</nav>} />)

    const nav = screen.getByRole('navigation', { name: 'Brotkrumen' })
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(nav.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lässt titelRef auf das h1 zeigen', () => {
    const ref = createRef<HTMLHeadingElement>()
    render(<Seitenkopf titel="Coin Alpha" titelRef={ref} />)

    expect(ref.current).toBe(screen.getByRole('heading', { level: 1 }))
  })

  it('setzt mit titelFokussierbar tabIndex=-1 am h1', () => {
    render(<Seitenkopf titel="Coin Alpha" titelFokussierbar />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('tabindex', '-1')
  })

  it('setzt ohne titelFokussierbar kein tabIndex am h1', () => {
    render(<Seitenkopf titel="Coin Alpha" />)

    expect(screen.getByRole('heading', { level: 1 })).not.toHaveAttribute('tabindex')
  })

  it('macht das h1 mit titelFokussierbar per Skript fokussierbar', () => {
    const ref = createRef<HTMLHeadingElement>()
    render(<Seitenkopf titel="Coin Alpha" titelRef={ref} titelFokussierbar />)

    ref.current?.focus()

    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  it('verwendet kein <header> als Wurzel und enthält keines', () => {
    const { container } = render(
      <Seitenkopf titel="Katalog" beschreibung="Text" aktionen={<button type="button">Aktion</button>} />,
    )

    expect(container.firstElementChild?.tagName).not.toBe('HEADER')
    expect(container.querySelector('header')).toBeNull()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
  })

  it('setzt das h1 in den Schriftstufen text-2xl md:text-3xl font-semibold (AK-6)', () => {
    render(<Seitenkopf titel="Katalog" />)

    const klassen = screen.getByRole('heading', { level: 1 }).className.split(/\s+/)
    expect(klassen).toEqual(expect.arrayContaining(['text-2xl', 'md:text-3xl', 'font-semibold']))
  })
})
