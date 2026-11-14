import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Progress } from './progress'

// Feature formulare-detailseiten, AK-21 und AK-35 (Abschnitt 4.8): Fortschrittsbalken aus der shadcn-CLI (Base UI
// Progress), nachbearbeitet: `cn` aus `@/shared/lib/cn`, keine englischen Texte. Props `value`, `max`, `aria-label`,
// `aria-valuetext`.

const quelle =
  import.meta.glob<string>('/src/shared/ui/progress.tsx', { query: '?raw', import: 'default', eager: true })[
    '/src/shared/ui/progress.tsx'
  ] ?? ''

function zeige(props: { value?: number; max?: number; text?: string } = {}) {
  const { value = 30, max = 40, text = '30 von 40 verfügbar (75 %)' } = props
  render(<Progress value={value} max={max} aria-label="Verfügbar" aria-valuetext={text} />)
  return screen.getByRole('progressbar', { name: 'Verfügbar' })
}

describe('Fortschrittsbalken (AK-21)', () => {
  it('hat die Rolle progressbar mit dem zugänglichen Namen aus aria-label', () => {
    expect(zeige()).toBeInTheDocument()
  })

  it('setzt aria-valuenow auf den Wert', () => {
    expect(zeige({ value: 12 })).toHaveAttribute('aria-valuenow', '12')
  })

  it('setzt aria-valuemax auf das Maximum', () => {
    expect(zeige({ max: 150 })).toHaveAttribute('aria-valuemax', '150')
  })

  it('übernimmt den übergebenen aria-valuetext', () => {
    expect(zeige({ text: '147 von 150 verfügbar (98 %)' })).toHaveAttribute(
      'aria-valuetext',
      '147 von 150 verfügbar (98 %)',
    )
  })

  it('zeigt keine englischen Texte im DOM', () => {
    zeige()

    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'aria-valuetext', 'title'].map((a) => el.getAttribute(a) ?? ''),
    )
    expect([document.body.textContent ?? '', ...attribute].join(' ')).not.toMatch(/\b(Progress|Loading|of)\b/i)
  })

  // Regression (Review-Runde 3): Im Textinhalt des Balkens stand ein loses „x“.
  it('enthält im Textinhalt des Balkens kein loses „x“', () => {
    expect(zeige().textContent ?? '').not.toMatch(/\bx\b/i)
  })
})

describe('Nachbearbeitung der CLI-Komponente (AK-35, ADR-0009)', () => {
  it('liegt in shared/ui/progress.tsx', () => {
    expect(quelle).not.toBe('')
  })

  it('importiert cn aus @/shared/lib/cn', () => {
    expect(quelle).toMatch(/from ['"]@\/shared\/lib\/cn['"]/)
  })

  it('importiert cn nicht aus @/lib/utils', () => {
    expect(quelle).not.toMatch(/@\/lib\/utils/)
  })

  it('nutzt Base UI als Grundlage', () => {
    expect(quelle).toMatch(/@base-ui\/react/)
  })
})
