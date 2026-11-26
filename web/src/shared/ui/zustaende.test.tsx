import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InboxIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Fehlerzustand, Ladeanzeige, Leerzustand } from './zustaende'

// Feature design-fundament, AK-19 bis AK-21 (Abschnitt 5, ADR-0036 Punkt 5): einheitliche Zustände für Laden, Leer
// und Fehler.

function versteckt(element: Element): boolean {
  return element.closest('[aria-hidden="true"]') !== null
}

describe('Leerzustand (AK-19)', () => {
  it('zeigt den Titel als Überschrift der Ebene 2 (Standard)', () => {
    render(<Leerzustand titel="Noch keine Coins" />)

    expect(screen.getByRole('heading', { level: 2, name: 'Noch keine Coins' })).toBeInTheDocument()
  })

  it.each([1, 2, 3] as const)('zeigt den Titel mit titelEbene={%i} als Überschrift dieser Ebene', (ebene) => {
    render(<Leerzustand titel="Coin nicht gefunden" titelEbene={ebene} />)

    expect(screen.getByRole('heading', { level: ebene, name: 'Coin nicht gefunden' })).toBeInTheDocument()
  })

  it('zeigt die Beschreibung', () => {
    render(<Leerzustand titel="Noch keine Coins" beschreibung="Legen Sie den ersten Coin an." />)

    expect(screen.getByText('Legen Sie den ersten Coin an.')).toBeVisible()
  })

  it('zeigt eine Aktion als Link', () => {
    render(<Leerzustand titel="Coin nicht gefunden" aktion={<a href="/coins">Zum Katalog</a>} />)

    expect(screen.getByRole('link', { name: 'Zum Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('zeigt eine Aktion als Button', () => {
    render(
      <Leerzustand
        titel="Noch keine Coins"
        aktion={
          <button type="button" onClick={() => {}}>
            Coin hinzufügen
          </button>
        }
      />,
    )

    expect(screen.getByRole('button', { name: 'Coin hinzufügen' })).toBeInTheDocument()
  })

  it('kommt ohne Aktion aus', () => {
    render(<Leerzustand titel="Noch keine Coins" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('blendet das Icon für Screenreader aus', () => {
    const { container } = render(<Leerzustand titel="Noch keine Coins" icon={<InboxIcon />} />)

    const icons = [...container.querySelectorAll('svg')]
    expect(icons.length).toBeGreaterThan(0)
    expect(icons.filter((icon) => !versteckt(icon))).toEqual([])
  })
})

describe('Ladeanzeige (AK-20)', () => {
  it('hat genau ein Element mit role="status"', () => {
    render(<Ladeanzeige text="Coin wird geladen …" />)

    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('enthält den übergebenen Text als zugänglichen Inhalt des Status', () => {
    render(<Ladeanzeige text="Coin wird geladen …" />)

    expect(screen.getByRole('status')).toHaveTextContent('Coin wird geladen …')
  })

  it.each(['zeilen', 'karte', 'tabelle'] as const)('hat in der Form „%s“ genau einen Status mit dem Text', (form) => {
    render(<Ladeanzeige text="Ausgabe wird geladen …" form={form} />)

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Ausgabe wird geladen …')
  })

  it('blendet die Skeleton-Blöcke für Screenreader aus', () => {
    const { container } = render(<Ladeanzeige text="Coin wird geladen …" />)

    const bloecke = [...container.querySelectorAll('[data-slot="skeleton"]')]
    expect(bloecke.length).toBeGreaterThan(0)
    expect(bloecke.filter((block) => !versteckt(block))).toEqual([])
  })

  it('gibt keinen weiteren Text als den übergebenen an Screenreader', () => {
    const { container } = render(<Ladeanzeige text="Coin wird geladen …" />)

    const sichtbarerText = [...container.querySelectorAll('*')]
      .filter((el) => el.children.length === 0 && !versteckt(el))
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean)
    expect(sichtbarerText).toEqual(['Coin wird geladen …'])
  })
})

describe('Fehlerzustand (AK-21)', () => {
  const MELDUNG = 'Der Coin konnte nicht geladen werden. Bitte später erneut versuchen.'

  it('hat die Rolle alert mit der Meldung', () => {
    render(<Fehlerzustand meldung={MELDUNG} />)

    expect(screen.getByRole('alert')).toHaveTextContent(MELDUNG)
  })

  it('zeigt einen optionalen Titel', () => {
    render(<Fehlerzustand titel="Fehler beim Laden" meldung={MELDUNG} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Fehler beim Laden')
  })

  it('zeigt ohne onErneutVersuchen keinen Button', () => {
    render(<Fehlerzustand meldung={MELDUNG} />)

    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).not.toBeInTheDocument()
  })

  it('zeigt mit onErneutVersuchen den Button „Erneut versuchen“', () => {
    render(<Fehlerzustand meldung={MELDUNG} onErneutVersuchen={() => {}} />)

    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
  })

  it('ruft onErneutVersuchen genau einmal je Klick auf', async () => {
    const user = userEvent.setup()
    const onErneutVersuchen = vi.fn()
    render(<Fehlerzustand meldung={MELDUNG} onErneutVersuchen={onErneutVersuchen} />)

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(onErneutVersuchen).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(onErneutVersuchen).toHaveBeenCalledTimes(2)
  })

  it('verschiebt den Fokus beim Erscheinen nicht', () => {
    const { rerender } = render(
      <>
        <button type="button">Anderswo</button>
      </>,
    )
    screen.getByRole('button', { name: 'Anderswo' }).focus()

    rerender(
      <>
        <button type="button">Anderswo</button>
        <Fehlerzustand meldung={MELDUNG} onErneutVersuchen={() => {}} />
      </>,
    )

    expect(screen.getByRole('button', { name: 'Anderswo' })).toHaveFocus()
  })

  it('blendet Icons für Screenreader aus', () => {
    render(<Fehlerzustand meldung={MELDUNG} onErneutVersuchen={() => {}} />)

    const icons = [...screen.getByRole('alert').querySelectorAll('svg')]
    expect(icons.filter((icon) => !versteckt(icon))).toEqual([])
  })
})

// Feature nacharbeiten-audit-filter, AK-28 (Abschnitt 4.9, ADR-0047 Punkt 2): Fokus nach „Erneut versuchen“. Vor dem
// Aufruf von `onErneutVersuchen` fokussiert der Baustein die erste Überschrift (h1–h4, nicht im Fehlerzustand selbst)
// des Ziels, sonst das Ziel selbst (tabIndex=-1 bei Bedarf). Ziel: Prop `fokusZiel`, sonst der nächste Vorfahre mit
// `data-inhaltsbereich`, sonst `main#inhalt`.

describe('Fokus nach „Erneut versuchen“ (nacharbeiten-audit-filter, AK-28)', () => {
  const MELDUNG = 'Änderungsprotokoll konnte nicht geladen werden. Bitte später erneut versuchen.'

  it('fokussiert die erste Überschrift im Vorfahren mit data-inhaltsbereich', async () => {
    const user = userEvent.setup()
    render(
      <section data-inhaltsbereich="">
        <h2>Änderungsprotokoll</h2>
        <Fehlerzustand meldung={MELDUNG} onErneutVersuchen={() => {}} />
      </section>,
    )

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(screen.getByRole('heading', { name: 'Änderungsprotokoll' })).toHaveFocus()
  })

  it('setzt den Fokus, bevor onErneutVersuchen läuft', async () => {
    const user = userEvent.setup()
    let fokusBeimAufruf: Element | null = null
    render(
      <section data-inhaltsbereich="">
        <h2>Änderungsprotokoll</h2>
        <Fehlerzustand meldung={MELDUNG} onErneutVersuchen={() => (fokusBeimAufruf = document.activeElement)} />
      </section>,
    )

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(fokusBeimAufruf).toBe(screen.getByRole('heading', { name: 'Änderungsprotokoll' }))
  })

  it('gibt der Überschrift tabIndex=-1, wenn sie keinen hat', async () => {
    const user = userEvent.setup()
    render(
      <section data-inhaltsbereich="">
        <h3>Exemplare</h3>
        <Fehlerzustand meldung={MELDUNG} onErneutVersuchen={() => {}} />
      </section>,
    )

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(screen.getByRole('heading', { name: 'Exemplare' })).toHaveAttribute('tabindex', '-1')
  })

  it('nimmt fokusZiel vor data-inhaltsbereich', async () => {
    const user = userEvent.setup()
    function MitZiel() {
      const ziel = useRef<HTMLDivElement>(null)
      return (
        <section data-inhaltsbereich="">
          <h2>Außen</h2>
          <div ref={ziel}>
            <h3>Innen</h3>
          </div>
          <Fehlerzustand meldung={MELDUNG} fokusZiel={ziel} onErneutVersuchen={() => {}} />
        </section>
      )
    }
    render(<MitZiel />)

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(screen.getByRole('heading', { name: 'Innen' })).toHaveFocus()
  })

  it('fokussiert ohne Überschrift das Ziel selbst', async () => {
    const user = userEvent.setup()
    render(
      <div data-inhaltsbereich="" data-testid="ziel">
        <Fehlerzustand meldung={MELDUNG} onErneutVersuchen={() => {}} />
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(screen.getByTestId('ziel')).toHaveFocus()
  })

  it('fällt ohne fokusZiel und data-inhaltsbereich auf die h1 in main#inhalt zurück', async () => {
    const user = userEvent.setup()
    render(
      <main id="inhalt">
        <h1>Coin Beispiel</h1>
        <div>
          <Fehlerzustand meldung={MELDUNG} onErneutVersuchen={() => {}} />
        </div>
      </main>,
    )

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Coin Beispiel' })).toHaveFocus()
  })

  it('wählt keine Überschrift im Fehlerzustand selbst', async () => {
    const user = userEvent.setup()
    render(
      <div data-inhaltsbereich="" data-testid="ziel">
        <Fehlerzustand meldung={MELDUNG} aktion={<h4>Überschrift im Fehlerzustand</h4>} onErneutVersuchen={() => {}} />
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(screen.getByTestId('ziel')).toHaveFocus()
  })

  it('lässt den Fokus nicht auf body fallen, wenn der Fehlerzustand danach verschwindet', async () => {
    const user = userEvent.setup()
    function Wechsel() {
      const [fehler, setFehler] = useState(true)
      return (
        <section data-inhaltsbereich="">
          <h2>Coins</h2>
          {fehler ? (
            <Fehlerzustand meldung={MELDUNG} onErneutVersuchen={() => setFehler(false)} />
          ) : (
            <p>Inhalt geladen</p>
          )}
        </section>
      )
    }
    render(<Wechsel />)

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(await screen.findByText('Inhalt geladen')).toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
    expect(screen.getByRole('heading', { name: 'Coins' })).toHaveFocus()
  })

  it('wirkt auch per Enter auf „Erneut versuchen“', async () => {
    const user = userEvent.setup()
    render(
      <section data-inhaltsbereich="">
        <h2>Änderungsprotokoll</h2>
        <Fehlerzustand meldung={MELDUNG} onErneutVersuchen={() => {}} />
      </section>,
    )
    screen.getByRole('button', { name: 'Erneut versuchen' }).focus()

    await user.keyboard('{Enter}')

    expect(screen.getByRole('heading', { name: 'Änderungsprotokoll' })).toHaveFocus()
  })
})
