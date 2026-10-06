import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BenutzerEintrag } from '@/entities/benutzer'
import {
  erstelleFakeApi,
  konfliktAntwort,
  offeneAntwort,
  problemAntwort,
  testBenutzerEintrag,
  type FakeApi,
} from '../../../../test/fakeApi'
import { StatusAendern } from '../index'

// Feature rollen-benutzerverwaltung, AK-28, AK-29, AK-35: Deaktivieren mit Dialog, Reaktivieren ohne Dialog.
// Rev. 3, AK-48 und AK-49: Dialog während der Anfrage und Schutz gegen Mehrfachsendung (Abschnitt am Dateiende).

const ID = '0199a1b2-0000-7000-8000-00000000b001'
const NAME = 'Test Sachbearbeiterin'
const DIALOG_TEXT = `${NAME} kann sich danach nicht mehr in C.O.I.N. anmelden. Den öffentlichen Katalog kann er weiterhin sehen.`

let api: FakeApi
let onGeaendert: ReturnType<typeof vi.fn<(benutzer: BenutzerEintrag) => void>>
let onFehler: ReturnType<typeof vi.fn<(meldung: string) => void>>

beforeEach(() => {
  api = erstelleFakeApi([], { benutzer: [testBenutzerEintrag({ id: ID, name: NAME, rolle: 'Sachbearbeiter' })] })
  vi.stubGlobal('fetch', api.fetch)
  onGeaendert = vi.fn<(benutzer: BenutzerEintrag) => void>()
  onFehler = vi.fn<(meldung: string) => void>()
})

function zeige(aktiv = true, deaktiviert = false) {
  if (!aktiv) api.benutzer[0] = { ...api.benutzer[0], aktiv: false }
  const user = userEvent.setup()
  render(
    <StatusAendern
      benutzer={testBenutzerEintrag({ id: ID, name: NAME, rolle: 'Sachbearbeiter', aktiv })}
      deaktiviert={deaktiviert}
      onGeaendert={onGeaendert}
      onFehler={onFehler}
    />,
  )
  return { user }
}

const puts = () => api.anfragenMit('PUT')

describe('Deaktivieren', () => {
  it('zeigt für aktive Benutzer den Button „Deaktivieren“ mit aria-label „{Name} deaktivieren“', () => {
    zeige()

    const button = screen.getByRole('button', { name: `${NAME} deaktivieren` })
    expect(button).toHaveTextContent('Deaktivieren')
  })

  it('öffnet einen alertdialog „Benutzer deaktivieren?“ mit Erklärtext', async () => {
    const { user } = zeige()

    await user.click(screen.getByRole('button', { name: `${NAME} deaktivieren` }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })
    expect(dialog.textContent?.replace(/\s+/g, ' ')).toContain(DIALOG_TEXT)
  })

  it('bietet im Dialog „Deaktivieren“ und „Abbrechen“ und fokussiert „Abbrechen“', async () => {
    const { user } = zeige()

    await user.click(screen.getByRole('button', { name: `${NAME} deaktivieren` }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })
    expect(within(dialog).getByRole('button', { name: 'Deaktivieren' })).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toHaveFocus())
  })

  it('sendet vor der Bestätigung keinen Request', async () => {
    const { user } = zeige()

    await user.click(screen.getByRole('button', { name: `${NAME} deaktivieren` }))
    await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })

    expect(puts()).toHaveLength(0)
  })

  it('sendet nach Bestätigung PUT mit {"aktiv":false}', async () => {
    const { user } = zeige()
    await user.click(screen.getByRole('button', { name: `${NAME} deaktivieren` }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })

    await user.click(within(dialog).getByRole('button', { name: 'Deaktivieren' }))

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0].pfad).toBe(`/api/benutzer/${ID}/status`)
    expect(puts()[0].body).toEqual({ aktiv: false })
  })

  it('meldet den geänderten Eintrag über onGeaendert', async () => {
    const { user } = zeige()
    await user.click(screen.getByRole('button', { name: `${NAME} deaktivieren` }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })

    await user.click(within(dialog).getByRole('button', { name: 'Deaktivieren' }))

    await waitFor(() => expect(onGeaendert).toHaveBeenCalledTimes(1))
    expect(onGeaendert.mock.calls[0][0]).toMatchObject({ id: ID, aktiv: false })
  })

  it('schließt den Dialog per „Abbrechen“ ohne Request und gibt den Fokus an den Button zurück', async () => {
    const { user } = zeige()
    const ausloeser = screen.getByRole('button', { name: `${NAME} deaktivieren` })
    await user.click(ausloeser)
    const dialog = await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })

    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(puts()).toHaveLength(0)
    await waitFor(() => expect(screen.getByRole('button', { name: `${NAME} deaktivieren` })).toHaveFocus())
  })

  it('schließt den Dialog per Escape ohne Request', async () => {
    const { user } = zeige()
    await user.click(screen.getByRole('button', { name: `${NAME} deaktivieren` }))
    await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(puts()).toHaveLength(0)
  })

  it('meldet einen 409 eigenes_konto über onFehler', async () => {
    api.einmal('PUT', /\/status$/, konfliktAntwort('eigenes_konto'))
    const { user } = zeige()
    await user.click(screen.getByRole('button', { name: `${NAME} deaktivieren` }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })

    await user.click(within(dialog).getByRole('button', { name: 'Deaktivieren' }))

    await waitFor(() => expect(onFehler).toHaveBeenCalledWith('Das eigene Konto kann nicht geändert werden.'))
    expect(onGeaendert).not.toHaveBeenCalled()
  })
})

describe('Reaktivieren', () => {
  it('zeigt für deaktivierte Benutzer den Button „Reaktivieren“ mit aria-label „{Name} reaktivieren“', () => {
    zeige(false)

    expect(screen.getByRole('button', { name: `${NAME} reaktivieren` })).toHaveTextContent('Reaktivieren')
    expect(screen.queryByRole('button', { name: `${NAME} deaktivieren` })).not.toBeInTheDocument()
  })

  it('sendet sofort PUT mit {"aktiv":true} ohne Dialog', async () => {
    const { user } = zeige(false)

    await user.click(screen.getByRole('button', { name: `${NAME} reaktivieren` }))

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0].body).toEqual({ aktiv: true })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('meldet den reaktivierten Eintrag über onGeaendert', async () => {
    const { user } = zeige(false)

    await user.click(screen.getByRole('button', { name: `${NAME} reaktivieren` }))

    await waitFor(() => expect(onGeaendert).toHaveBeenCalledTimes(1))
    expect(onGeaendert.mock.calls[0][0]).toMatchObject({ id: ID, aktiv: true })
  })
})

describe('gesperrt', () => {
  it('ist mit deaktiviert=true nicht bedienbar', () => {
    zeige(true, true)

    expect(screen.getByRole('button', { name: `${NAME} deaktivieren` })).toBeDisabled()
  })

  it('ist per Tastatur bedienbar (Enter öffnet den Dialog)', async () => {
    const { user } = zeige()
    screen.getByRole('button', { name: `${NAME} deaktivieren` }).focus()

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })).toBeInTheDocument()
  })
})

// ---------- Rev. 3, AK-48 und AK-49: Dialog während der Anfrage, Schutz gegen Mehrfachsendung ----------

const SPEICHERT = 'Änderung wird gespeichert …'

/** Wartet kurz, damit ein (fälschlich) zweiter PUT sicher beim Fake-Server ankäme. */
async function kurzWarten(): Promise<void> {
  await act(async () => {
    await new Promise((aufloesen) => setTimeout(aufloesen, 20))
  })
}

/** Öffnet den Dialog, hält die PUT-Antwort zurück und bestätigt per Klick auf „Deaktivieren“. */
async function deaktivierenMitOffenerAntwort() {
  const offen = offeneAntwort()
  api.einmal('PUT', /\/status$/, () => offen.promise)
  const { user } = zeige()
  await user.click(screen.getByRole('button', { name: `${NAME} deaktivieren` }))
  const dialog = await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })
  const bestaetigen = within(dialog).getByRole('button', { name: 'Deaktivieren' })
  await user.click(bestaetigen)
  await waitFor(() => expect(puts()).toHaveLength(1))
  return { user, dialog, bestaetigen, offen }
}

function antwortDeaktiviert(): Response {
  return new Response(JSON.stringify({ ...api.benutzer[0], aktiv: false }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Dialog „Benutzer deaktivieren?“ während der Anfrage (AK-48)', () => {
  it('hält „Deaktivieren“ fokussierbar: aria-disabled="true" ohne disabled-Attribut', async () => {
    const { bestaetigen, offen } = await deaktivierenMitOffenerAntwort()

    await waitFor(() => expect(bestaetigen).toHaveAttribute('aria-disabled', 'true'))
    expect(bestaetigen).not.toHaveAttribute('disabled')
    offen.aufloesen(antwortDeaktiviert())
  })

  it('hält „Abbrechen“ fokussierbar: aria-disabled="true" ohne disabled-Attribut', async () => {
    const { dialog, offen } = await deaktivierenMitOffenerAntwort()
    const abbrechen = within(dialog).getByRole('button', { name: 'Abbrechen' })

    await waitFor(() => expect(abbrechen).toHaveAttribute('aria-disabled', 'true'))
    expect(abbrechen).not.toHaveAttribute('disabled')
    offen.aufloesen(antwortDeaktiviert())
  })

  it('behält den Fokus auf dem gedrückten Button „Deaktivieren“', async () => {
    const { bestaetigen, offen } = await deaktivierenMitOffenerAntwort()

    await waitFor(() => expect(bestaetigen).toHaveAttribute('aria-disabled', 'true'))
    expect(document.activeElement).toBe(bestaetigen)
    offen.aufloesen(antwortDeaktiviert())
  })

  it('setzt aria-busy="true" am Dialog', async () => {
    const { dialog, offen } = await deaktivierenMitOffenerAntwort()

    await waitFor(() => expect(dialog).toHaveAttribute('aria-busy', 'true'))
    offen.aufloesen(antwortDeaktiviert())
  })

  it('zeigt im Dialog den Status „Änderung wird gespeichert …“', async () => {
    const { dialog, offen } = await deaktivierenMitOffenerAntwort()

    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent(SPEICHERT))
    offen.aufloesen(antwortDeaktiviert())
  })

  it('behält die Namen der Buttons „Deaktivieren“ und „Abbrechen“', async () => {
    const { dialog, offen } = await deaktivierenMitOffenerAntwort()

    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent(SPEICHERT))
    expect(within(dialog).getByRole('button', { name: 'Deaktivieren' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
    offen.aufloesen(antwortDeaktiviert())
  })

  it('schließt sich per Escape während der Anfrage nicht', async () => {
    const { user, offen } = await deaktivierenMitOffenerAntwort()

    await user.keyboard('{Escape}')
    await kurzWarten()

    expect(screen.getByRole('alertdialog', { name: 'Benutzer deaktivieren?' })).toBeInTheDocument()
    offen.aufloesen(antwortDeaktiviert())
  })

  it('schließt sich per Klick auf „Abbrechen“ während der Anfrage nicht', async () => {
    const { user, dialog, offen } = await deaktivierenMitOffenerAntwort()

    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    await kurzWarten()

    expect(screen.getByRole('alertdialog', { name: 'Benutzer deaktivieren?' })).toBeInTheDocument()
    offen.aufloesen(antwortDeaktiviert())
  })

  it('schließt sich per Klick außerhalb während der Anfrage nicht', async () => {
    const { user, offen } = await deaktivierenMitOffenerAntwort()

    await user.click(document.body)
    await kurzWarten()

    expect(screen.getByRole('alertdialog', { name: 'Benutzer deaktivieren?' })).toBeInTheDocument()
    offen.aufloesen(antwortDeaktiviert())
  })

  it('schließt sich nach der Antwort', async () => {
    const { offen } = await deaktivierenMitOffenerAntwort()

    offen.aufloesen(antwortDeaktiviert())

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })
})

describe('Schutz gegen Mehrfachsendung (AK-49)', () => {
  it('sendet bei zwei Klicks auf „Deaktivieren“ ohne Zwischenrendern genau einen PUT', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', /\/status$/, () => offen.promise)
    const { user } = zeige()
    await user.click(screen.getByRole('button', { name: `${NAME} deaktivieren` }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })
    const bestaetigen = within(dialog).getByRole('button', { name: 'Deaktivieren' })

    // Beide Klicks im selben act: React rendert dazwischen nicht neu, nur ein synchroner Schutz (Ref) greift.
    act(() => {
      bestaetigen.click()
      bestaetigen.click()
    })
    await kurzWarten()

    expect(puts()).toHaveLength(1)
    offen.aufloesen(antwortDeaktiviert())
  })

  it('sendet bei Doppelklick auf „Deaktivieren“ genau einen PUT', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', /\/status$/, () => offen.promise)
    const { user } = zeige()
    await user.click(screen.getByRole('button', { name: `${NAME} deaktivieren` }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })

    await user.dblClick(within(dialog).getByRole('button', { name: 'Deaktivieren' }))
    await kurzWarten()

    expect(puts()).toHaveLength(1)
    offen.aufloesen(antwortDeaktiviert())
  })

  it('sendet bei zweimal Enter auf „Deaktivieren“ genau einen PUT', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', /\/status$/, () => offen.promise)
    const { user } = zeige()
    await user.click(screen.getByRole('button', { name: `${NAME} deaktivieren` }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })
    within(dialog).getByRole('button', { name: 'Deaktivieren' }).focus()

    await user.keyboard('{Enter}{Enter}')
    await kurzWarten()

    expect(puts()).toHaveLength(1)
    offen.aufloesen(antwortDeaktiviert())
  })

  it('sendet bei zwei Klicks auf „Reaktivieren“ ohne Zwischenrendern genau einen PUT', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', /\/status$/, () => offen.promise)
    zeige(false)
    const button = screen.getByRole('button', { name: `${NAME} reaktivieren` })

    act(() => {
      button.click()
      button.click()
    })
    await kurzWarten()

    expect(puts()).toHaveLength(1)
    offen.aufloesen(jsonAntwortAktiv())
  })

  it('sendet bei Doppelklick auf „Reaktivieren“ genau einen PUT', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', /\/status$/, () => offen.promise)
    const { user } = zeige(false)

    await user.dblClick(screen.getByRole('button', { name: `${NAME} reaktivieren` }))
    await kurzWarten()

    expect(puts()).toHaveLength(1)
    offen.aufloesen(jsonAntwortAktiv())
  })

  it('sendet bei zweimal Enter auf „Reaktivieren“ genau einen PUT', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', /\/status$/, () => offen.promise)
    const { user } = zeige(false)
    screen.getByRole('button', { name: `${NAME} reaktivieren` }).focus()

    await user.keyboard('{Enter}{Enter}')
    await kurzWarten()

    expect(puts()).toHaveLength(1)
    offen.aufloesen(jsonAntwortAktiv())
  })

  it('hält „Reaktivieren“ während der Anfrage mit aria-disabled="true" fokussiert', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', /\/status$/, () => offen.promise)
    const { user } = zeige(false)
    const button = screen.getByRole('button', { name: `${NAME} reaktivieren` })

    await user.click(button)

    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    expect(button).not.toHaveAttribute('disabled')
    expect(document.activeElement).toBe(button)
    offen.aufloesen(jsonAntwortAktiv())
  })

  it('ist nach der Antwort wieder bedienbar', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', /\/status$/, () => offen.promise)
    const { user } = zeige(false)
    const button = screen.getByRole('button', { name: `${NAME} reaktivieren` })
    await user.click(button)
    await waitFor(() => expect(puts()).toHaveLength(1))

    offen.aufloesen(problemAntwort(500))

    await waitFor(() => expect(onFehler).toHaveBeenCalledTimes(1))
    expect(button).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(button)
    await waitFor(() => expect(puts()).toHaveLength(2))
  })
})

function jsonAntwortAktiv(): Response {
  return new Response(JSON.stringify({ ...api.benutzer[0], aktiv: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
