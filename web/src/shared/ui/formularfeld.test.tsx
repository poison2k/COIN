import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Formularfeld } from './formularfeld'
import { Input } from './input'

// Feature design-fundament, AK-13 (Abschnitt 5): Formularfeld verknüpft Label, Hilfetext und Fehler mit dem Feld.

interface Optionen {
  hilfetext?: string
  fehler?: string
  pflicht?: boolean
}

function zeige({ hilfetext, fehler, pflicht }: Optionen = {}) {
  render(
    <Formularfeld label="Name" hilfetext={hilfetext} fehler={fehler} pflicht={pflicht}>
      {(feld) => <Input {...feld} />}
    </Formularfeld>,
  )
  return screen.getByRole('textbox')
}

/** Texte der in aria-describedby referenzierten Elemente in Reihenfolge. */
function beschreibungen(feld: HTMLElement): string[] {
  return (feld.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? `<fehlt: ${id}>`)
}

describe('Label (AK-13)', () => {
  it('verknüpft das Label mit dem Feld (zugänglicher Name = Label)', () => {
    zeige()

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
  })

  it('verknüpft Label und Feld über for/id', () => {
    const feld = zeige()

    expect(feld.id).not.toBe('')
    expect(document.querySelector(`label[for="${feld.id}"]`)).not.toBeNull()
  })

  it('vergibt bei zwei Feldern unterschiedliche Ids', () => {
    render(
      <>
        <Formularfeld label="Name">{(feld) => <Input {...feld} />}</Formularfeld>
        <Formularfeld label="Herausgeber">{(feld) => <Input {...feld} />}</Formularfeld>
      </>,
    )

    const [a, b] = screen.getAllByRole('textbox')
    expect(a.id).not.toBe(b.id)
    expect(screen.getByRole('textbox', { name: 'Herausgeber' })).toBe(b)
  })
})

describe('Hilfetext (AK-13)', () => {
  it('verweist per aria-describedby auf den Hilfetext', () => {
    const feld = zeige({ hilfetext: 'Wie auf dem Coin geprägt.' })

    expect(beschreibungen(feld)).toEqual(['Wie auf dem Coin geprägt.'])
  })

  it('setzt ohne Fehler kein aria-invalid="true"', () => {
    const feld = zeige({ hilfetext: 'Wie auf dem Coin geprägt.' })

    expect(feld).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('setzt ohne Hilfetext und Fehler kein leeres aria-describedby', () => {
    const feld = zeige()

    expect(beschreibungen(feld)).toEqual([])
  })
})

describe('Fehler (AK-13)', () => {
  it('setzt aria-invalid="true"', () => {
    const feld = zeige({ fehler: 'Bitte einen Namen angeben.' })

    expect(feld).toHaveAttribute('aria-invalid', 'true')
  })

  it('nennt in aria-describedby zuerst den Fehler, dann den Hilfetext', () => {
    const feld = zeige({ hilfetext: 'Wie auf dem Coin geprägt.', fehler: 'Bitte einen Namen angeben.' })

    const texte = beschreibungen(feld)
    expect(texte).toHaveLength(2)
    expect(texte[0]).toContain('Bitte einen Namen angeben.')
    expect(texte[1]).toBe('Wie auf dem Coin geprägt.')
  })

  it('beginnt den Fehlertext für Screenreader mit „Fehler:“', () => {
    const feld = zeige({ fehler: 'Bitte einen Namen angeben.' })

    expect(feld).toHaveAccessibleDescription(/^Fehler:\s*Bitte einen Namen angeben\.$/)
  })

  it('zeigt den Fehlertext sichtbar an', () => {
    zeige({ fehler: 'Bitte einen Namen angeben.' })

    expect(screen.getByText('Bitte einen Namen angeben.', { exact: false })).toBeVisible()
  })

  it('blendet das Fehler-Icon für Screenreader aus', () => {
    const feld = zeige({ fehler: 'Bitte einen Namen angeben.' })

    const fehlerId = (feld.getAttribute('aria-describedby') ?? '').split(/\s+/)[0]
    const icons = [...(document.getElementById(fehlerId)?.querySelectorAll('svg') ?? [])]
    expect(icons.length).toBeGreaterThan(0)
    expect(icons.filter((icon) => icon.closest('[aria-hidden="true"]') === null)).toEqual([])
  })
})

describe('Pflichtfeld (AK-13)', () => {
  it('setzt required am Feld', () => {
    const feld = zeige({ pflicht: true })

    expect(feld).toBeRequired()
  })

  it('zeigt den sichtbaren Text „(Pflicht)“', () => {
    zeige({ pflicht: true })

    expect(screen.getByText('(Pflicht)', { exact: false })).toBeVisible()
  })

  it('beginnt den zugänglichen Namen mit dem Label', () => {
    const feld = zeige({ pflicht: true })

    expect(feld).toHaveAccessibleName(/^Name\b/)
  })

  it('setzt ohne pflicht kein required', () => {
    const feld = zeige()

    expect(feld).not.toBeRequired()
  })

  it('kennzeichnet Pflicht nicht nur mit „*“', () => {
    zeige({ pflicht: true })

    const label = document.querySelector('label')
    expect(label?.textContent?.replace(/\s+/g, ' ').trim()).not.toMatch(/^Name\s*\*$/)
  })
})

// ---------- formulare-detailseiten, AK-2 (Abschnitt 4.1, ADR-0039 Punkt 3) ----------
// Sichtbar „(Pflicht)“ (aria-hidden), für Screenreader „(Pflichtfeld)“ (sr-only); neu: `onBlur` wird über `feld` an das
// Eingabeelement weitergegeben (Validierung beim Verlassen).

describe('Pflichtkennzeichnung (formulare-detailseiten, AK-2)', () => {
  it('nennt „(Pflichtfeld)“ im zugänglichen Namen', () => {
    const feld = zeige({ pflicht: true })

    expect(feld).toHaveAccessibleName(/^Name\b.*\(Pflichtfeld\)/)
  })

  it('nennt „(Pflicht)“ nicht als eigenes Wort im zugänglichen Namen', () => {
    const feld = zeige({ pflicht: true })

    expect(feld).not.toHaveAccessibleName(/\(Pflicht\)/)
  })

  it('blendet das sichtbare „(Pflicht)“ für Screenreader aus', () => {
    zeige({ pflicht: true })

    const sichtbar = screen.getByText('(Pflicht)')
    expect(sichtbar.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('nennt ohne pflicht kein „Pflicht“ im zugänglichen Namen', () => {
    const feld = zeige()

    expect(feld).not.toHaveAccessibleName(/Pflicht/)
  })
})

describe('onBlur (formulare-detailseiten, AK-4)', () => {
  it('gibt onBlur über feld an das Eingabeelement weiter', () => {
    const onBlur = vi.fn()
    render(
      <Formularfeld label="Name" onBlur={onBlur}>
        {(feld) => <Input {...feld} />}
      </Formularfeld>,
    )
    const feld = screen.getByRole('textbox', { name: 'Name' })

    feld.focus()
    feld.blur()

    expect(onBlur).toHaveBeenCalledTimes(1)
  })
})
