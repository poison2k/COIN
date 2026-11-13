import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SaveIcon } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button'

// Feature design-fundament, AK-10 (Abschnitt 5): Button mit `laedt`. Größen ≥ 40 × 40 px misst bausteine.spec.ts im
// Browser (jsdom berechnet kein Layout).

function knopf(name = 'Speichern'): HTMLElement {
  return screen.getByRole('button', { name })
}

describe('Varianten (AK-10)', () => {
  it.each(['default', 'outline', 'destructive', 'ghost', 'secondary', 'link'] as const)(
    'rendert die Variante „%s“ als Button mit Beschriftung',
    (variant) => {
      render(<Button variant={variant}>Speichern</Button>)

      expect(knopf()).toBeInTheDocument()
    },
  )

  it('füllt die Variante „destructive“ (gefährlich) mit der Fehlerfarbe', () => {
    render(<Button variant="destructive">Löschen</Button>)

    expect(knopf('Löschen').className).toMatch(/(^|\s)bg-destructive(\s|$)/)
    expect(knopf('Löschen').className).toMatch(/(^|\s)text-destructive-foreground(\s|$)/)
  })

  it.each(['sm', 'default', 'lg', 'icon', 'xs', 'icon-xs', 'icon-sm', 'icon-lg'] as const)(
    'akzeptiert die Größe „%s“',
    (size) => {
      render(
        <Button size={size} aria-label="Speichern">
          <SaveIcon />
        </Button>,
      )

      expect(knopf()).toBeInTheDocument()
    },
  )

  it('verwendet für den Fokusring keine Deckkraftreduktion', () => {
    render(<Button>Speichern</Button>)

    expect(knopf().className).not.toMatch(/\b(?:ring|outline)-ring\/\d+/)
  })
})

describe('Ladezustand „laedt“ (AK-10)', () => {
  it('behält den zugänglichen Namen bei', () => {
    render(<Button laedt>Speichern</Button>)

    expect(knopf()).toHaveAccessibleName('Speichern')
  })

  it('setzt aria-busy="true"', () => {
    render(<Button laedt>Speichern</Button>)

    expect(knopf()).toHaveAttribute('aria-busy', 'true')
  })

  it('setzt aria-disabled="true"', () => {
    render(<Button laedt>Speichern</Button>)

    expect(knopf()).toHaveAttribute('aria-disabled', 'true')
  })

  it('bleibt fokussierbar (kein natives disabled)', () => {
    render(<Button laedt>Speichern</Button>)

    expect(knopf()).not.toHaveAttribute('disabled')
  })

  it('löst onClick bei einem Klick nicht aus', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button laedt onClick={onClick}>
        Speichern
      </Button>,
    )

    await user.click(knopf())

    expect(onClick).not.toHaveBeenCalled()
  })

  it('löst onClick bei Enter nicht aus', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button laedt onClick={onClick}>
        Speichern
      </Button>,
    )
    knopf().focus()

    await user.keyboard('{Enter}')

    expect(onClick).not.toHaveBeenCalled()
  })

  it('behält den Fokus, wenn der Button nach dem Klick in den Ladezustand wechselt', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Button>Speichern</Button>)
    await user.click(knopf())
    expect(knopf()).toHaveFocus()

    rerender(<Button laedt>Speichern</Button>)

    expect(knopf()).toHaveFocus()
  })

  it('zeigt einen Spinner, der für Screenreader ausgeblendet ist', () => {
    render(<Button laedt>Speichern</Button>)

    const icons = [...knopf().querySelectorAll('svg')]
    expect(icons.length).toBeGreaterThan(0)
    expect(icons.filter((icon) => icon.closest('[aria-hidden="true"]') === null)).toEqual([])
  })

  it('kündigt im Button keinen zusätzlichen Status an', () => {
    render(<Button laedt>Speichern</Button>)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('ersetzt das Start-Icon durch den Spinner', () => {
    render(
      <Button laedt>
        <SaveIcon data-testid="start-icon" />
        Speichern
      </Button>,
    )

    expect(screen.queryByTestId('start-icon')).not.toBeInTheDocument()
    expect(knopf().querySelector('svg')).not.toBeNull()
  })

  it('löst ohne laedt onClick wie bisher aus', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Speichern</Button>)

    await user.click(knopf())

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(knopf()).not.toHaveAttribute('aria-busy', 'true')
  })
})
