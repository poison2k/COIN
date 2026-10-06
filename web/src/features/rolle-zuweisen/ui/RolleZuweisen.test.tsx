import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BenutzerEintrag } from '@/entities/benutzer'
import {
  erstelleFakeApi,
  konfliktAntwort,
  offeneAntwort,
  testBenutzerEintrag,
  type FakeApi,
} from '../../../../test/fakeApi'
import { RolleZuweisen } from '../index'

// Feature rollen-benutzerverwaltung, AK-27, AK-29, AK-35: Select je Zeile + Bestätigungsdialog (alertdialog).
// Rev. 3, AK-48 und AK-49: Dialog während der Anfrage und Schutz gegen Mehrfachsendung (Abschnitt am Dateiende).

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

// ---------- Rev. 3, AK-48 und AK-49 (Annahme A2): Dialog während der Anfrage, Schutz gegen Mehrfachsendung ----------

const SPEICHERT = 'Änderung wird gespeichert …'

/** Wartet kurz, damit ein (fälschlich) zweiter PUT sicher beim Fake-Server ankäme. */
async function kurzWarten(): Promise<void> {
  await act(async () => {
    await new Promise((aufloesen) => setTimeout(aufloesen, 20))
  })
}

function antwortBetrachter(): Response {
  return new Response(JSON.stringify({ ...api.benutzer[0], rolle: 'Betrachter' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Wählt „Betrachter“, hält die PUT-Antwort zurück und bestätigt per Klick auf „Rolle ändern“. */
async function bestaetigenMitOffenerAntwort() {
  const offen = offeneAntwort()
  api.einmal('PUT', /\/rolle$/, () => offen.promise)
  const { user } = zeige()
  await waehle(user, 'Betrachter')
  const dialog = await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })
  const bestaetigen = within(dialog).getByRole('button', { name: 'Rolle ändern' })
  await user.click(bestaetigen)
  await waitFor(() => expect(puts()).toHaveLength(1))
  return { user, dialog, bestaetigen, offen }
}

describe('Dialog „Rolle ändern?“ während der Anfrage (AK-48)', () => {
  it('hält „Rolle ändern“ fokussierbar: aria-disabled="true" ohne disabled-Attribut', async () => {
    const { bestaetigen, offen } = await bestaetigenMitOffenerAntwort()

    await waitFor(() => expect(bestaetigen).toHaveAttribute('aria-disabled', 'true'))
    expect(bestaetigen).not.toHaveAttribute('disabled')
    offen.aufloesen(antwortBetrachter())
  })

  it('hält „Abbrechen“ fokussierbar: aria-disabled="true" ohne disabled-Attribut', async () => {
    const { dialog, offen } = await bestaetigenMitOffenerAntwort()
    const abbrechen = within(dialog).getByRole('button', { name: 'Abbrechen' })

    await waitFor(() => expect(abbrechen).toHaveAttribute('aria-disabled', 'true'))
    expect(abbrechen).not.toHaveAttribute('disabled')
    offen.aufloesen(antwortBetrachter())
  })

  it('behält den Fokus auf dem gedrückten Button „Rolle ändern“', async () => {
    const { bestaetigen, offen } = await bestaetigenMitOffenerAntwort()

    await waitFor(() => expect(bestaetigen).toHaveAttribute('aria-disabled', 'true'))
    expect(document.activeElement).toBe(bestaetigen)
    offen.aufloesen(antwortBetrachter())
  })

  it('setzt aria-busy="true" am Dialog', async () => {
    const { dialog, offen } = await bestaetigenMitOffenerAntwort()

    await waitFor(() => expect(dialog).toHaveAttribute('aria-busy', 'true'))
    offen.aufloesen(antwortBetrachter())
  })

  it('zeigt im Dialog den Status „Änderung wird gespeichert …“ und behält die Button-Namen', async () => {
    const { dialog, offen } = await bestaetigenMitOffenerAntwort()

    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent(SPEICHERT))
    expect(within(dialog).getByRole('button', { name: 'Rolle ändern' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
    offen.aufloesen(antwortBetrachter())
  })

  it('schließt sich per Escape während der Anfrage nicht', async () => {
    const { user, offen } = await bestaetigenMitOffenerAntwort()

    await user.keyboard('{Escape}')
    await kurzWarten()

    expect(screen.getByRole('alertdialog', { name: 'Rolle ändern?' })).toBeInTheDocument()
    offen.aufloesen(antwortBetrachter())
  })

  it('schließt sich per Klick auf „Abbrechen“ während der Anfrage nicht', async () => {
    const { user, dialog, offen } = await bestaetigenMitOffenerAntwort()

    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    await kurzWarten()

    expect(screen.getByRole('alertdialog', { name: 'Rolle ändern?' })).toBeInTheDocument()
    offen.aufloesen(antwortBetrachter())
  })

  it('schließt sich per Klick außerhalb während der Anfrage nicht', async () => {
    const { user, offen } = await bestaetigenMitOffenerAntwort()

    await user.click(document.body)
    await kurzWarten()

    expect(screen.getByRole('alertdialog', { name: 'Rolle ändern?' })).toBeInTheDocument()
    offen.aufloesen(antwortBetrachter())
  })
})

describe('Schutz gegen Mehrfachsendung (AK-49)', () => {
  it('sendet bei zwei Klicks auf „Rolle ändern“ ohne Zwischenrendern genau einen PUT', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', /\/rolle$/, () => offen.promise)
    const { user } = zeige()
    await waehle(user, 'Betrachter')
    const dialog = await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })
    const bestaetigen = within(dialog).getByRole('button', { name: 'Rolle ändern' })

    // Beide Klicks im selben act: React rendert dazwischen nicht neu, nur ein synchroner Schutz (Ref) greift.
    act(() => {
      bestaetigen.click()
      bestaetigen.click()
    })
    await kurzWarten()

    expect(puts()).toHaveLength(1)
    offen.aufloesen(antwortBetrachter())
  })

  it('sendet bei Doppelklick auf „Rolle ändern“ genau einen PUT', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', /\/rolle$/, () => offen.promise)
    const { user } = zeige()
    await waehle(user, 'Betrachter')
    const dialog = await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })

    await user.dblClick(within(dialog).getByRole('button', { name: 'Rolle ändern' }))
    await kurzWarten()

    expect(puts()).toHaveLength(1)
    offen.aufloesen(antwortBetrachter())
  })

  it('sendet bei zweimal Enter auf „Rolle ändern“ genau einen PUT', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', /\/rolle$/, () => offen.promise)
    const { user } = zeige()
    await waehle(user, 'Betrachter')
    const dialog = await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })
    within(dialog).getByRole('button', { name: 'Rolle ändern' }).focus()

    await user.keyboard('{Enter}{Enter}')
    await kurzWarten()

    expect(puts()).toHaveLength(1)
    offen.aufloesen(antwortBetrachter())
  })

  it('ist nach einer fehlgeschlagenen Antwort wieder bedienbar', async () => {
    const { user, offen } = await bestaetigenMitOffenerAntwort()

    offen.aufloesen(konfliktAntwort('letzter_administrator'))
    await waitFor(() => expect(onFehler).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waehle(user, 'Sachbearbeiter')
    await user.click(await screen.findByRole('button', { name: 'Rolle ändern' }))

    await waitFor(() => expect(puts()).toHaveLength(2))
  })
})
