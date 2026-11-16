import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Ansichtsumschalter } from './ansichtsumschalter'

// Feature startseite-listen-pruefung, AK-12 und AK-38 (Abschnitt 4.6, ADR-0043 Punkt 2): `Ansichtsumschalter({ wert,
// onWert, beschriftung })` ist eine beschriftete Gruppe (Standard „Ansicht“) mit den Elementen „Tabelle“ und „Karten“
// (sichtbarer Text = zugänglicher Name, Icons aria-hidden). `aria-pressed` zeigt die Wahl. Gilt gleich für
// `toggle-group` und den Ersatz aus zwei Buttons.

type Wert = 'tabelle' | 'karten'

function Gesteuert({ start = 'tabelle', onWert }: { start?: Wert; onWert?: (wert: Wert) => void }) {
  const [wert, setWert] = useState<Wert>(start)
  return (
    <Ansichtsumschalter
      wert={wert}
      onWert={(neu: Wert) => {
        onWert?.(neu)
        setWert(neu)
      }}
    />
  )
}

const gruppe = () => screen.getByRole('group', { name: 'Ansicht' })
const element = (name: 'Tabelle' | 'Karten') => within(gruppe()).getByRole('button', { name })

describe('Aufbau', () => {
  it('ist eine Gruppe mit dem Namen „Ansicht“', () => {
    render(<Gesteuert />)

    expect(gruppe()).toBeInTheDocument()
  })

  it('übernimmt eine eigene Beschriftung', () => {
    render(<Ansichtsumschalter wert="tabelle" onWert={vi.fn()} beschriftung="Darstellung der Coins" />)

    expect(screen.getByRole('group', { name: 'Darstellung der Coins' })).toBeInTheDocument()
  })

  it('hat genau die Elemente „Tabelle“ und „Karten“ in dieser Reihenfolge', () => {
    render(<Gesteuert />)

    expect(
      within(gruppe())
        .getAllByRole('button')
        .map((b) => b.textContent?.trim()),
    ).toEqual(['Tabelle', 'Karten'])
  })

  it('blendet die Icons für Screenreader aus', () => {
    render(<Gesteuert />)

    const icons = gruppe().querySelectorAll('svg')
    expect(icons.length).toBeGreaterThanOrEqual(2)
    for (const icon of icons) expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('nennt jedes Element genau mit seinem sichtbaren Text', () => {
    render(<Gesteuert />)

    expect(element('Tabelle')).toHaveAccessibleName('Tabelle')
    expect(element('Karten')).toHaveAccessibleName('Karten')
  })
})

describe('Wahl', () => {
  it.each<[Wert, 'Tabelle' | 'Karten', 'Tabelle' | 'Karten']>([
    ['tabelle', 'Tabelle', 'Karten'],
    ['karten', 'Karten', 'Tabelle'],
  ])('zeigt den Wert „%s“ über aria-pressed', (wert, gedrueckt, nicht) => {
    render(<Ansichtsumschalter wert={wert} onWert={vi.fn()} />)

    expect(element(gedrueckt)).toHaveAttribute('aria-pressed', 'true')
    expect(element(nicht)).toHaveAttribute('aria-pressed', 'false')
  })

  it('meldet per Klick den neuen Wert', async () => {
    const onWert = vi.fn()
    const user = userEvent.setup()
    render(<Gesteuert onWert={onWert} />)

    await user.click(element('Karten'))

    expect(onWert).toHaveBeenLastCalledWith('karten')
    expect(element('Karten')).toHaveAttribute('aria-pressed', 'true')
  })

  it('lässt sich nicht abwählen: Ein Klick auf das gewählte Element lässt die Wahl bestehen', async () => {
    const onWert = vi.fn()
    const user = userEvent.setup()
    render(<Gesteuert onWert={onWert} />)

    await user.click(element('Tabelle'))

    expect(element('Tabelle')).toHaveAttribute('aria-pressed', 'true')
    for (const [wert] of onWert.mock.calls) expect(['tabelle', 'karten']).toContain(wert)
  })

  it('ist per Tab erreichbar und wechselt per Enter', async () => {
    const onWert = vi.fn()
    const user = userEvent.setup()
    render(<Gesteuert onWert={onWert} />)

    await user.tab()
    expect(gruppe()).toContainElement(document.activeElement as HTMLElement)
    if (document.activeElement !== element('Karten')) {
      // Ersatz aus zwei Buttons: nächster Tab-Stopp; toggle-group: Pfeiltaste (rovierender Fokus).
      await user.keyboard('{ArrowRight}')
      if (document.activeElement !== element('Karten')) await user.tab()
    }
    expect(element('Karten')).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(onWert).toHaveBeenLastCalledWith('karten')
  })

  it('wechselt per Leertaste', async () => {
    const onWert = vi.fn()
    const user = userEvent.setup()
    render(<Gesteuert start="karten" onWert={onWert} />)

    element('Tabelle').focus()
    await user.keyboard(' ')

    expect(onWert).toHaveBeenLastCalledWith('tabelle')
  })
})
