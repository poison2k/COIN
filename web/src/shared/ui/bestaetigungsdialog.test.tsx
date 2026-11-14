import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Bestaetigungsdialog } from './bestaetigungsdialog'

// Feature formulare-detailseiten, AK-17, AK-18 und AK-35 (Abschnitt 4.4, 4.8): Bestätigungsdialog auf Basis von
// AlertDialog. Props `offen`, `onOffenAendern`, `titel`, `folge`, `bestaetigen`, `variante` ('gefaehrlich' | 'primaer'),
// `laedt`, `fehler?`, `onBestaetigen`, `children?`, `ausloeserRef?`. Anfangsfokus auf „Abbrechen“, bei Feldern auf dem
// ersten Feld; Fokus zurück zum Auslöser; während der Anfrage schließen weder Escape noch „Abbrechen“.

const TITEL = 'Benutzer deaktivieren?'
const FOLGE = 'Der Benutzer kann sich danach nicht mehr anmelden.'

interface Optionen {
  laedt?: boolean
  fehler?: string
  variante?: 'gefaehrlich' | 'primaer'
  felder?: ReactNode
  onBestaetigen?: () => void
  onOffenAendern?: (offen: boolean) => void
}

function zeige({
  laedt = false,
  fehler,
  variante = 'gefaehrlich',
  felder,
  onBestaetigen,
  onOffenAendern,
}: Optionen = {}) {
  const bestaetigt = onBestaetigen ?? vi.fn()
  const offenAendern = onOffenAendern ?? vi.fn()
  function Test() {
    const [offen, setOffen] = useState(false)
    const ausloeser = useRef<HTMLButtonElement>(null)
    return (
      <>
        <button ref={ausloeser} type="button" onClick={() => setOffen(true)}>
          Deaktivieren
        </button>
        <Bestaetigungsdialog
          offen={offen}
          onOffenAendern={(neu: boolean) => {
            offenAendern(neu)
            setOffen(neu)
          }}
          titel={TITEL}
          folge={FOLGE}
          bestaetigen="Deaktivieren"
          variante={variante}
          laedt={laedt}
          fehler={fehler}
          onBestaetigen={bestaetigt}
          ausloeserRef={ausloeser}
        >
          {felder}
        </Bestaetigungsdialog>
      </>
    )
  }
  const user = userEvent.setup()
  render(<Test />)
  return { user, bestaetigt, offenAendern }
}

async function oeffne(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: 'Deaktivieren' }))
  return screen.findByRole('alertdialog', { name: TITEL })
}

describe('Aufbau (AK-18)', () => {
  it('ist ein alertdialog mit dem Titel als Namen', async () => {
    const { user } = zeige()

    expect(await oeffne(user)).toBeInTheDocument()
  })

  it('beschreibt den Dialog per aria-describedby mit der Folge', async () => {
    const { user } = zeige()

    expect(await oeffne(user)).toHaveAccessibleDescription(FOLGE)
  })

  it('zeigt „Abbrechen“ und den Bestätigungsbutton', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Deaktivieren' })).toBeInTheDocument()
  })

  it('stellt die gefährliche Aktion in der Variante „gefährlich“ dar', async () => {
    const { user } = zeige({ variante: 'gefaehrlich' })
    const dialog = await oeffne(user)

    expect(within(dialog).getByRole('button', { name: 'Deaktivieren' }).className).toMatch(/\bbg-destructive\b/)
  })

  it('stellt die Variante „primär“ nicht gefährlich dar', async () => {
    const { user } = zeige({ variante: 'primaer' })
    const dialog = await oeffne(user)

    const knopf = within(dialog).getByRole('button', { name: 'Deaktivieren' })
    expect(knopf.className).toMatch(/\bbg-primary\b/)
    expect(knopf.className).not.toMatch(/\bbg-destructive\b/)
  })

  it('zeigt eine Fehlermeldung als Alarm im Dialog', async () => {
    const { user } = zeige({ fehler: 'Der Benutzer konnte nicht deaktiviert werden.' })
    const dialog = await oeffne(user)

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Der Benutzer konnte nicht deaktiviert werden.')
  })

  it('enthält keine englischen Texte', async () => {
    const { user } = zeige()
    await oeffne(user)

    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title'].map((a) => el.getAttribute(a) ?? ''),
    )
    expect([document.body.textContent ?? '', ...attribute].join(' ')).not.toMatch(
      /\b(Cancel|Confirm|Close|OK|Continue)\b/,
    )
  })
})

describe('Fokus (AK-17)', () => {
  it('fokussiert beim Öffnen „Abbrechen“', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toHaveFocus())
  })

  it('fokussiert beim Öffnen mit Feldern das erste Feld', async () => {
    const { user } = zeige({
      felder: (
        <>
          <label htmlFor="grund">Grund</label>
          <textarea id="grund" />
        </>
      ),
    })
    const dialog = await oeffne(user)

    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: 'Grund' })).toHaveFocus())
  })

  it('gibt den Fokus nach „Abbrechen“ an den Auslöser zurück', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deaktivieren' })).toHaveFocus())
  })

  it('gibt den Fokus nach Escape an den Auslöser zurück', async () => {
    const { user } = zeige()
    await oeffne(user)

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deaktivieren' })).toHaveFocus())
  })
})

describe('Abbrechen und Bestätigen (AK-17)', () => {
  it('schließt bei „Abbrechen“, ohne zu bestätigen', async () => {
    const { user, bestaetigt, offenAendern } = zeige()
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))

    expect(offenAendern).toHaveBeenLastCalledWith(false)
    expect(bestaetigt).not.toHaveBeenCalled()
  })

  it('schließt bei Escape, ohne zu bestätigen', async () => {
    const { user, bestaetigt, offenAendern } = zeige()
    await oeffne(user)

    await user.keyboard('{Escape}')

    expect(offenAendern).toHaveBeenLastCalledWith(false)
    expect(bestaetigt).not.toHaveBeenCalled()
  })

  it('ruft onBestaetigen beim Bestätigungsbutton genau einmal auf', async () => {
    const { user, bestaetigt } = zeige()
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Deaktivieren' }))

    expect(bestaetigt).toHaveBeenCalledTimes(1)
  })
})

describe('Während der Anfrage (AK-17)', () => {
  it('zeigt am Bestätigungsbutton den Ladezustand (aria-busy, aria-disabled)', async () => {
    const { user } = zeige({ laedt: true })
    const dialog = await oeffne(user)

    const knopf = within(dialog).getByRole('button', { name: 'Deaktivieren' })
    expect(knopf).toHaveAttribute('aria-busy', 'true')
    expect(knopf).toHaveAttribute('aria-disabled', 'true')
  })

  it('schließt bei Escape nicht', async () => {
    const { user, offenAendern } = zeige({ laedt: true })
    await oeffne(user)

    await user.keyboard('{Escape}')

    expect(offenAendern).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('alertdialog', { name: TITEL })).toBeInTheDocument()
  })

  it('schließt bei „Abbrechen“ nicht', async () => {
    const { user, offenAendern } = zeige({ laedt: true })
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))

    expect(offenAendern).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('alertdialog', { name: TITEL })).toBeInTheDocument()
  })

  it('verwirft weitere Klicks auf den Bestätigungsbutton', async () => {
    const { user, bestaetigt } = zeige({ laedt: true })
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Deaktivieren' }))

    expect(bestaetigt).not.toHaveBeenCalled()
  })
})
