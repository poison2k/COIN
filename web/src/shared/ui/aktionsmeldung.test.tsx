import { render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { Aktionsmeldung } from './aktionsmeldung'

// Feature nacharbeiten-audit-filter, AK-26 (Abschnitt 4.8, ADR-0047 Punkt 1): Baustein `Aktionsmeldung` auf Basis von
// `Alert`. `fehler`/`warnung` als Banner `destructive`/`warning` mit role="alert", beim Erscheinen eingefügt;
// `erfolg`/`hinweis` als Banner `success`/`info` in einem dauerhaft vorhandenen role="status"-Container, das Banner selbst
// mit role="none" (keine zweite Live-Region). Icon aria-hidden, Bedeutung im Text. `ref`/`fokussierbar` für das Banner.

type Art = 'fehler' | 'warnung' | 'erfolg' | 'hinweis'

/** Icon je Art wie in `Alert` (destructive, warning, success, info). */
const ICON: Readonly<Record<Art, string>> = {
  fehler: 'lucide-circle-alert',
  warnung: 'lucide-triangle-alert',
  erfolg: 'lucide-circle-check',
  hinweis: 'lucide-info',
}

function banner(text: string): HTMLElement {
  return screen.getByText(text).closest('[data-slot="alert"]') as HTMLElement
}

describe('Fehler und Warnung (AK-26)', () => {
  it.each(['fehler', 'warnung'] as const)('zeigt „%s“ mit role="alert"', (art) => {
    render(<Aktionsmeldung meldung={{ art, text: 'Speichern fehlgeschlagen.' }} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen.')
  })

  it.each(['fehler', 'warnung'] as const)('steckt „%s“ nicht in einer Status-Region', (art) => {
    render(<Aktionsmeldung meldung={{ art, text: 'Speichern fehlgeschlagen.' }} />)

    expect(screen.getByRole('alert').closest('[role="status"]')).toBeNull()
  })

  it('zeigt ohne Meldung keinen Alarm', () => {
    render(<Aktionsmeldung meldung={null} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('fügt den Alarm erst beim Erscheinen ein', () => {
    const { rerender } = render(<Aktionsmeldung meldung={null} />)

    rerender(<Aktionsmeldung meldung={{ art: 'fehler', text: 'Download fehlgeschlagen.' }} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Download fehlgeschlagen.')
  })
})

describe('Erfolg und Hinweis (AK-26)', () => {
  it.each(['erfolg', 'hinweis'] as const)('zeigt „%s“ in einem Container mit role="status"', (art) => {
    render(<Aktionsmeldung meldung={{ art, text: 'Gespeichert.' }} />)

    expect(screen.getByRole('status')).toHaveTextContent('Gespeichert.')
  })

  it.each(['erfolg', 'hinweis'] as const)('zeigt „%s“ nicht als Alarm', (art) => {
    render(<Aktionsmeldung meldung={{ art, text: 'Gespeichert.' }} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('gibt dem Banner im Status-Container role="none"', () => {
    render(<Aktionsmeldung meldung={{ art: 'erfolg', text: 'Gespeichert.' }} />)

    expect(banner('Gespeichert.')).toHaveAttribute('role', 'none')
  })

  it('hat im Status-Container keine zweite Live-Region', () => {
    render(<Aktionsmeldung meldung={{ art: 'erfolg', text: 'Gespeichert.' }} />)

    const status = screen.getByRole('status')
    expect(status.querySelectorAll('[role="status"], [role="alert"], [aria-live]')).toHaveLength(0)
  })

  it('hält den Status-Container auch ohne Meldung bereit', () => {
    render(<Aktionsmeldung meldung={null} />)

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('behält denselben Status-Container, wenn eine Erfolgsmeldung erscheint', () => {
    const { rerender } = render(<Aktionsmeldung meldung={null} />)
    const vorher = screen.getByRole('status')

    rerender(<Aktionsmeldung meldung={{ art: 'erfolg', text: 'Gespeichert.' }} />)

    expect(screen.getByRole('status')).toBe(vorher)
  })
})

describe('Darstellung (AK-26)', () => {
  it.each(Object.entries(ICON) as Array<[Art, string]>)(
    'zeigt „%s“ mit dem Icon der passenden Variante',
    (art, icon) => {
      render(<Aktionsmeldung meldung={{ art, text: 'Meldungstext' }} />)

      const svg = banner('Meldungstext').querySelector('svg')
      expect(svg?.getAttribute('class') ?? '').toContain(icon)
    },
  )

  it.each(Object.keys(ICON) as Art[])('blendet das Icon bei „%s“ für Screenreader aus', (art) => {
    render(<Aktionsmeldung meldung={{ art, text: 'Meldungstext' }} />)

    const icons = [...banner('Meldungstext').querySelectorAll('svg')]
    expect(icons.filter((icon) => icon.closest('[aria-hidden="true"]') === null)).toEqual([])
  })

  it('zeigt den Titel vor dem Text', () => {
    render(<Aktionsmeldung meldung={{ art: 'fehler', titel: 'Upload abgelehnt', text: 'Die Datei ist zu groß.' }} />)

    expect(screen.getByRole('alert').textContent).toMatch(/Upload abgelehnt.*Die Datei ist zu groß\./)
  })

  it('zeigt weitere Bedienelemente aus aktion im Banner', () => {
    render(
      <Aktionsmeldung
        meldung={{ art: 'fehler', text: 'Die Startseite wurde inzwischen geändert.' }}
        aktion={<button type="button">Neu laden</button>}
      />,
    )

    expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Neu laden' })).toBeInTheDocument()
  })

  it('übernimmt den Text wortgleich', () => {
    render(<Aktionsmeldung meldung={{ art: 'erfolg', text: 'Motivbild gespeichert.' }} />)

    expect(screen.getByRole('status').textContent?.trim()).toBe('Motivbild gespeichert.')
  })
})

describe('Fokus (AK-26)', () => {
  it('lässt das Banner mit fokussierbar per Skript fokussieren', () => {
    const ref = createRef<HTMLDivElement>()
    render(<Aktionsmeldung ref={ref} fokussierbar meldung={{ art: 'fehler', text: 'Upload abgelehnt.' }} />)

    ref.current?.focus()

    expect(banner('Upload abgelehnt.')).toHaveFocus()
  })

  it('macht das fokussierbare Banner nicht zu einem Tab-Stopp', () => {
    render(<Aktionsmeldung fokussierbar meldung={{ art: 'fehler', text: 'Upload abgelehnt.' }} />)

    expect(banner('Upload abgelehnt.')).toHaveAttribute('tabindex', '-1')
  })

  it('zeigt am fokussierbaren Banner einen sichtbaren Fokusring', () => {
    render(<Aktionsmeldung fokussierbar meldung={{ art: 'fehler', text: 'Upload abgelehnt.' }} />)

    expect(banner('Upload abgelehnt.').className).toMatch(/focus-visible:ring/)
  })

  it('fokussiert auch eine Erfolgsmeldung über ref (Banner, nicht Container)', () => {
    const ref = createRef<HTMLDivElement>()
    render(<Aktionsmeldung ref={ref} fokussierbar meldung={{ art: 'erfolg', text: 'Gespeichert.' }} />)

    ref.current?.focus()

    expect(banner('Gespeichert.')).toHaveFocus()
  })

  it('ist ohne fokussierbar nicht fokussierbar', () => {
    render(<Aktionsmeldung meldung={{ art: 'fehler', text: 'Upload abgelehnt.' }} />)

    expect(banner('Upload abgelehnt.')).not.toHaveAttribute('tabindex')
  })
})
