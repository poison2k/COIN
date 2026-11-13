import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './breadcrumb'

// Feature design-fundament, AK-9, AK-24 (Abschnitt 5): Brotkrumen aus der shadcn-CLI, nachbearbeitet mit deutschen
// Texten. Die Linkhöhe (≥ 40 px) misst bausteine.spec.ts im Browser.

function zeige() {
  return render(
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">Startseite</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbEllipsis />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="/coins">Katalog</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Coin Alpha</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>,
  )
}

describe('Brotkrumen (AK-24)', () => {
  it('ist eine Navigation mit dem Namen „Brotkrumen“', () => {
    zeige()

    expect(screen.getByRole('navigation', { name: 'Brotkrumen' })).toBeInTheDocument()
  })

  it('enthält eine geordnete Liste', () => {
    zeige()

    const liste = within(screen.getByRole('navigation', { name: 'Brotkrumen' })).getByRole('list')
    expect(liste.tagName).toBe('OL')
  })

  it('verlinkt die vorherigen Einträge', () => {
    zeige()

    expect(screen.getByRole('link', { name: 'Startseite' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('macht den letzten Eintrag nicht zum Link', () => {
    zeige()

    expect(screen.queryByRole('link', { name: 'Coin Alpha' })).not.toBeInTheDocument()
    expect(screen.getByText('Coin Alpha').closest('a')).toBeNull()
  })

  it('kennzeichnet den letzten Eintrag mit aria-current="page"', () => {
    zeige()

    expect(screen.getByText('Coin Alpha')).toHaveAttribute('aria-current', 'page')
  })

  it('setzt aria-current nur auf den letzten Eintrag', () => {
    const { container } = zeige()

    expect([...container.querySelectorAll('[aria-current]')].map((el) => el.textContent)).toEqual(['Coin Alpha'])
  })

  it('blendet die Trenner für Screenreader aus', () => {
    const { container } = zeige()

    const trenner = [...container.querySelectorAll('[data-slot="breadcrumb-separator"]')]
    expect(trenner).toHaveLength(3)
    expect(trenner.filter((t) => t.closest('[aria-hidden="true"]') === null)).toEqual([])
  })

  it('nennt die Auslassung „Weitere Seiten“', () => {
    zeige()

    expect(screen.getByText('Weitere Seiten')).toBeInTheDocument()
  })

  it('enthält keine englischen Texte', () => {
    const { container } = zeige()

    const attribute = [...container.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title'].map((a) => el.getAttribute(a) ?? ''),
    )
    expect([container.textContent, ...attribute].join(' ')).not.toMatch(/\b(breadcrumb|More|Home)\b/i)
  })
})
