import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BenutzerEintrag } from '@/entities/benutzer'
import { erstelleFakeApi, konfliktAntwort, testBenutzerEintrag, type FakeApi } from '../../../../test/fakeApi'
import { StatusAendern } from '../index'

// Feature rollen-benutzerverwaltung, AK-28, AK-29, AK-35: Deaktivieren mit Dialog, Reaktivieren ohne Dialog.

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
