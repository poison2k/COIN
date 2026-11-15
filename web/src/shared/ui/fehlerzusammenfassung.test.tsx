import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Fehlerzusammenfassung } from './fehlerzusammenfassung'

// Feature formulare-detailseiten, AK-7 und AK-35 (Abschnitt 4.1, 4.8): Zusammenfassung oben im Formular mit
// role="alert", Titel „Bitte die markierten Eingaben prüfen.“ und je Fehler einem Link „<Label>: <Meldung>“, der das Feld
// fokussiert, ohne die URL zu ändern. Props `titel?`, `fehler: {feldId, label, text}[]`, `weitere?: string[]`.

const FEHLER = [
  { feldId: 'feld-name', label: 'Name', text: 'Name ist erforderlich.' },
  { feldId: 'feld-herausgeber', label: 'Herausgeber', text: 'Herausgeber ist erforderlich.' },
]

function zeige(props: { titel?: string; weitere?: string[] } = {}) {
  const user = userEvent.setup()
  render(
    <form>
      <Fehlerzusammenfassung fehler={FEHLER} {...props} />
      <label htmlFor="feld-name">Name</label>
      <input id="feld-name" />
      <label htmlFor="feld-herausgeber">Herausgeber</label>
      <input id="feld-herausgeber" />
    </form>,
  )
  return user
}

function zusammenfassung(): HTMLElement {
  const alarm = screen
    .getAllByRole('alert')
    .find((el) => el.textContent?.includes('Bitte die markierten Eingaben prüfen.'))
  expect(alarm, 'Zusammenfassung mit role="alert" fehlt').toBeDefined()
  return alarm as HTMLElement
}

describe('Aufbau (AK-7)', () => {
  it('ist ein Alarm mit dem Standardtitel „Bitte die markierten Eingaben prüfen.“', () => {
    zeige()

    expect(zusammenfassung()).toBeInTheDocument()
  })

  it('übernimmt einen eigenen Titel', () => {
    zeige({ titel: 'Bitte die Angaben prüfen.' })

    expect(screen.getByRole('alert')).toHaveTextContent('Bitte die Angaben prüfen.')
  })

  it('zeigt je Fehler einen Link „<Label>: <Meldung>“', () => {
    zeige()

    const links = within(zusammenfassung())
      .getAllByRole('link')
      .map((l) => l.textContent?.replace(/\s+/g, ' ').trim())
    expect(links).toEqual(['Name: Name ist erforderlich.', 'Herausgeber: Herausgeber ist erforderlich.'])
  })

  it('zeigt Befunde ohne Feldbezug als Text ohne Link', () => {
    zeige({ weitere: ['Die Eingaben wurden vom Server abgelehnt. Bitte prüfen.'] })

    const alarm = zusammenfassung()
    expect(alarm).toHaveTextContent('Die Eingaben wurden vom Server abgelehnt. Bitte prüfen.')
    expect(within(alarm).getAllByRole('link')).toHaveLength(2)
  })

  it('verweist in den Links nur auf Feld-Ids, nie auf Label oder Meldung', () => {
    zeige()

    for (const link of within(zusammenfassung()).getAllByRole('link')) {
      const href = link.getAttribute('href') ?? ''
      expect(href).not.toMatch(/erforderlich|Name:|Herausgeber:/)
    }
  })
})

describe('Links fokussieren das Feld (AK-7)', () => {
  it('fokussiert per Klick das zugehörige Feld', async () => {
    const user = zeige()

    await user.click(screen.getByRole('link', { name: 'Herausgeber: Herausgeber ist erforderlich.' }))

    expect(screen.getByRole('textbox', { name: 'Herausgeber' })).toHaveFocus()
  })

  it('fokussiert per Enter das zugehörige Feld', async () => {
    const user = zeige()
    screen.getByRole('link', { name: 'Name: Name ist erforderlich.' }).focus()

    await user.keyboard('{Enter}')

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
  })

  it('lässt die URL unverändert', async () => {
    const user = zeige()
    const vorher = window.location.href

    await user.click(screen.getByRole('link', { name: 'Name: Name ist erforderlich.' }))

    expect(window.location.href).toBe(vorher)
  })
})

describe('Deutsche Texte (AK-35)', () => {
  it('enthält keine englischen Texte', () => {
    zeige()

    expect(document.body.textContent).not.toMatch(/\b(Error|Errors|Please|There is a problem)\b/i)
  })
})
