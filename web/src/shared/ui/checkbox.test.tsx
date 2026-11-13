import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from './checkbox'

// Feature design-fundament, AK-12 (Abschnitt 5): Checkbox aus der shadcn-CLI (Base UI). Die Höhe der Klickfläche
// (≥ 40 px) misst bausteine.spec.ts im Browser.

function zeige(props: React.ComponentProps<typeof Checkbox> = {}) {
  const user = userEvent.setup()
  render(
    <label>
      <Checkbox {...props} />
      Nur aktive Coins
    </label>,
  )
  return { user, box: screen.getByRole('checkbox', { name: 'Nur aktive Coins' }) }
}

describe('Checkbox (AK-12)', () => {
  it('hat die Rolle checkbox mit der Beschriftung als Namen', () => {
    const { box } = zeige()

    expect(box).toBeInTheDocument()
  })

  it('ist ohne Angabe nicht angehakt', () => {
    const { box } = zeige()

    expect(box).not.toBeChecked()
  })

  it('ist mit defaultChecked angehakt', () => {
    const { box } = zeige({ defaultChecked: true })

    expect(box).toBeChecked()
  })

  it('schaltet per Leertaste um', async () => {
    const { user, box } = zeige()
    box.focus()

    await user.keyboard(' ')

    expect(box).toBeChecked()
  })

  it('schaltet per Klick auf die Beschriftung um', async () => {
    const { user, box } = zeige()

    await user.click(screen.getByText('Nur aktive Coins'))

    expect(box).toBeChecked()
  })

  it('meldet Änderungen über onCheckedChange', async () => {
    const onCheckedChange = vi.fn()
    const { user, box } = zeige({ onCheckedChange })

    await user.click(box)

    expect(onCheckedChange).toHaveBeenCalledTimes(1)
    expect(onCheckedChange.mock.calls[0][0]).toBe(true)
  })

  it('zeigt den Zustand „unbestimmt“ als aria-checked="mixed"', () => {
    const { box } = zeige({ indeterminate: true })

    expect(box).toHaveAttribute('aria-checked', 'mixed')
  })

  it('ist deaktiviert nicht umschaltbar', async () => {
    const { user, box } = zeige({ disabled: true })

    await user.click(box)

    expect(box).not.toBeChecked()
  })

  it('kennzeichnet den deaktivierten Zustand für Hilfstechnik', () => {
    const { box } = zeige({ disabled: true })

    expect(box.hasAttribute('disabled') || box.getAttribute('aria-disabled') === 'true').toBe(true)
  })

  it('blendet das Häkchen-Icon für Screenreader aus', () => {
    const { box } = zeige({ defaultChecked: true })

    const icons = [...box.querySelectorAll('svg')]
    expect(icons.filter((icon) => icon.closest('[aria-hidden="true"]') === null)).toEqual([])
  })
})
