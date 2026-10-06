import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BenutzerEintrag } from '@/entities/benutzer'
import { erstelleFakeApi, konfliktAntwort, testBenutzerEintrag, type FakeApi } from '../../../../test/fakeApi'
import { RolleZuweisen } from '../index'

// Feature rollen-benutzerverwaltung, AK-27, AK-29, AK-35: Select je Zeile + Bestätigungsdialog (alertdialog).

const ID = '0199a1b2-0000-7000-8000-00000000b001'
const NAME = 'Test Neu'
const ENGLISCH = /\b(Cancel|Confirm|Close|Select|Option|Change|Role|Save|OK|Yes|No)\b/

let api: FakeApi
let onGeaendert: ReturnType<typeof vi.fn<(benutzer: BenutzerEintrag) => void>>
let onFehler: ReturnType<typeof vi.fn<(meldung: string) => void>>

beforeEach(() => {
  api = erstelleFakeApi([], { benutzer: [testBenutzerEintrag({ id: ID, name: NAME, rolle: 'keine' })] })
  vi.stubGlobal('fetch', api.fetch)
  onGeaendert = vi.fn<(benutzer: BenutzerEintrag) => void>()
  onFehler = vi.fn<(meldung: string) => void>()
})

function zeige(teil: Partial<BenutzerEintrag> = {}, deaktiviert = false) {
  const user = userEvent.setup()
  render(
    <RolleZuweisen
      benutzer={testBenutzerEintrag({ id: ID, name: NAME, rolle: 'keine', ...teil })}
      deaktiviert={deaktiviert}
      onGeaendert={onGeaendert}
      onFehler={onFehler}
    />,
  )
  return { user }
}

function auswahl(): HTMLElement {
  return screen.getByRole('combobox', { name: `Rolle von ${NAME}` })
}

async function waehle(user: UserEvent, option: string): Promise<void> {
  await user.click(auswahl())
  await user.click(await screen.findByRole('option', { name: option }))
}

function puts() {
  return api.anfragenMit('PUT')
}

describe('Auswahl', () => {
  it('hat den zugänglichen Namen „Rolle von {Name}“', () => {
    zeige()

    expect(auswahl()).toBeInTheDocument()
  })

  it('zeigt die aktuelle Rolle, „keine“ als „Keine Rolle“', () => {
    zeige()

    expect(auswahl()).toHaveTextContent('Keine Rolle')
  })

  it('zeigt eine vorhandene Rolle mit ihrem Namen', () => {
    zeige({ rolle: 'Sachbearbeiter' })

    expect(auswahl()).toHaveTextContent('Sachbearbeiter')
  })

  it('bietet genau Administrator, Sachbearbeiter, Betrachter und Keine Rolle an', async () => {
    const { user } = zeige()

    await user.click(auswahl())

    const optionen = await screen.findAllByRole('option')
    expect(optionen.map((o) => o.textContent?.trim())).toEqual([
      'Administrator',
      'Sachbearbeiter',
      'Betrachter',
      'Keine Rolle',
    ])
  })

  it('ist mit deaktiviert=true gesperrt', () => {
    zeige({}, true)

    expect(auswahl()).toBeDisabled()
  })
})

describe('Bestätigungsdialog', () => {
  it('öffnet nach der Auswahl einen alertdialog „Rolle ändern?“', async () => {
    const { user } = zeige()

    await waehle(user, 'Betrachter')

    expect(await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })).toBeInTheDocument()
  })

  it('zeigt „Rolle von {Name}: {alt} → {neu}“ mit deutschen Rollennamen', async () => {
    const { user } = zeige()

    await waehle(user, 'Betrachter')

    const dialog = await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })
    expect(dialog).toHaveTextContent(`Rolle von ${NAME}: Keine Rolle → Betrachter`)
  })

  it('bietet die Buttons „Rolle ändern“ und „Abbrechen“', async () => {
    const { user } = zeige()

    await waehle(user, 'Betrachter')

    const dialog = await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })
    expect(within(dialog).getByRole('button', { name: 'Rolle ändern' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
  })

  it('setzt den Fokus beim Öffnen auf „Abbrechen“', async () => {
    const { user } = zeige()

    await waehle(user, 'Betrachter')

    const dialog = await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toHaveFocus())
  })

  it('sendet vor der Bestätigung keinen Request', async () => {
    const { user } = zeige()

    await waehle(user, 'Betrachter')
    await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })

    expect(puts()).toHaveLength(0)
  })

  it('enthält keine englischen Texte', async () => {
    const { user } = zeige()

    await waehle(user, 'Betrachter')

    const dialog = await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })
    const attribute = [...dialog.querySelectorAll('*')].map((el) => el.getAttribute('aria-label') ?? '').join(' ')
    expect(`${dialog.textContent} ${attribute}`).not.toMatch(ENGLISCH)
  })
})

describe('Abbrechen', () => {
  it('schließt den Dialog per „Abbrechen“ ohne Request', async () => {
    const { user } = zeige()
    await waehle(user, 'Betrachter')

    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(puts()).toHaveLength(0)
  })

  it('setzt die Auswahl nach „Abbrechen“ zurück', async () => {
    const { user } = zeige()
    await waehle(user, 'Betrachter')

    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(auswahl()).toHaveTextContent('Keine Rolle'))
  })

  it('gibt den Fokus nach „Abbrechen“ an die Auswahl zurück', async () => {
    const { user } = zeige()
    await waehle(user, 'Betrachter')

    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(auswahl()).toHaveFocus())
  })

  it('schließt den Dialog per Escape ohne Request und setzt die Auswahl zurück', async () => {
    const { user } = zeige()
    await waehle(user, 'Betrachter')
    await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(puts()).toHaveLength(0)
    expect(auswahl()).toHaveTextContent('Keine Rolle')
  })

  it('gibt den Fokus nach Escape an die Auswahl zurück', async () => {
    const { user } = zeige()
    await waehle(user, 'Betrachter')
    await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })

    await user.keyboard('{Escape}')

    await waitFor(() => expect(auswahl()).toHaveFocus())
  })

  it('meldet bei Abbruch weder Änderung noch Fehler', async () => {
    const { user } = zeige()
    await waehle(user, 'Betrachter')

    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }))

    expect(onGeaendert).not.toHaveBeenCalled()
    expect(onFehler).not.toHaveBeenCalled()
  })
})

describe('Bestätigen', () => {
  it('sendet PUT mit {"rolle":"Betrachter"}', async () => {
    const { user } = zeige()
    await waehle(user, 'Betrachter')

    await user.click(await screen.findByRole('button', { name: 'Rolle ändern' }))

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0].pfad).toBe(`/api/benutzer/${ID}/rolle`)
    expect(puts()[0].body).toEqual({ rolle: 'Betrachter' })
  })

  it('sendet für „Keine Rolle“ {"rolle":"keine"}', async () => {
    const { user } = zeige({ rolle: 'Betrachter' })
    await waehle(user, 'Keine Rolle')

    await user.click(await screen.findByRole('button', { name: 'Rolle ändern' }))

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0].body).toEqual({ rolle: 'keine' })
  })

  it('meldet den geänderten Eintrag über onGeaendert', async () => {
    const { user } = zeige()
    await waehle(user, 'Sachbearbeiter')

    await user.click(await screen.findByRole('button', { name: 'Rolle ändern' }))

    await waitFor(() => expect(onGeaendert).toHaveBeenCalledTimes(1))
    expect(onGeaendert.mock.calls[0][0]).toMatchObject({ id: ID, rolle: 'Sachbearbeiter' })
  })

  it('schließt den Dialog nach Erfolg', async () => {
    const { user } = zeige()
    await waehle(user, 'Betrachter')

    await user.click(await screen.findByRole('button', { name: 'Rolle ändern' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('ist per Tastatur bestätigbar (Tab zu „Rolle ändern“, Enter)', async () => {
    const { user } = zeige()
    await waehle(user, 'Betrachter')
    const dialog = await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toHaveFocus())

    // Der Fokus bleibt im Dialog gefangen: Tab (ggf. Umschalt+Tab) erreicht „Rolle ändern“.
    const bestaetigen = within(dialog).getByRole('button', { name: 'Rolle ändern' })
    for (let i = 0; i < 4 && document.activeElement !== bestaetigen; i++) await user.tab()
    expect(bestaetigen).toHaveFocus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(puts()).toHaveLength(1))
  })

  it('hält den Fokus im Dialog gefangen', async () => {
    const { user } = zeige()
    await waehle(user, 'Betrachter')
    const dialog = await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toHaveFocus())

    for (let i = 0; i < 5; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('meldet einen 409 über onFehler mit deutschem Text und nicht über onGeaendert', async () => {
    api.einmal('PUT', /\/rolle$/, konfliktAntwort('letzter_administrator'))
    const { user } = zeige({ rolle: 'Administrator' })
    await waehle(user, 'Betrachter')

    await user.click(await screen.findByRole('button', { name: 'Rolle ändern' }))

    await waitFor(() =>
      expect(onFehler).toHaveBeenCalledWith(
        'Der letzte aktive Administrator kann weder herabgestuft noch deaktiviert werden.',
      ),
    )
    expect(onGeaendert).not.toHaveBeenCalled()
  })

  it('zeigt nach einem Fehler wieder die bisherige Rolle', async () => {
    api.einmal('PUT', /\/rolle$/, konfliktAntwort('eigenes_konto'))
    const { user } = zeige({ rolle: 'Administrator' })
    await waehle(user, 'Betrachter')

    await user.click(await screen.findByRole('button', { name: 'Rolle ändern' }))

    await waitFor(() => expect(onFehler).toHaveBeenCalled())
    expect(auswahl()).toHaveTextContent('Administrator')
  })
})
