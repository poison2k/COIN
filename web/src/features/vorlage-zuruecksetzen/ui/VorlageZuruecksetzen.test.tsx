import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VorlagenStatus } from '@/entities/zertifikatsvorlage'
import {
  erstelleFakeApi,
  offeneAntwort,
  problemAntwort,
  testCoin,
  testVorlagenStatus,
  testVorlagenVersion,
  type FakeApi,
} from '../../../../test/fakeApi'
import { seitentext } from '../../../../test/hilfen'
import { VorlageZuruecksetzen } from '../index'

// Feature zertifikatsvorlagen, AK-20, AK-30 und AK-33: Button „Auf Standardvorlage zurücksetzen“ öffnet einen
// AlertDialog mit Text, „Zurücksetzen“ und „Abbrechen“ (Fokusfalle, Escape, Fokus-Rückgabe).
// Props { coinId, onZurueckgesetzt(status) }.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000a1'
const POST = /^\/api\/coins\/[^/]+\/zertifikatsvorlage\/zuruecksetzen$/
const TITEL = 'Auf Standardvorlage zurücksetzen?'
const TEXT = 'Die eigene Vorlage bleibt als Version gespeichert. Künftig wird die Standardvorlage verwendet.'

let api: FakeApi
let onZurueckgesetzt: ReturnType<typeof vi.fn<(status: VorlagenStatus) => void>>

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID })], {
    vorlagen: { [COIN_ID]: testVorlagenStatus([testVorlagenVersion({ version: 1 })], 1) },
  })
  vi.stubGlobal('fetch', api.fetch)
  onZurueckgesetzt = vi.fn<(status: VorlagenStatus) => void>()
})

function zeige() {
  const user = userEvent.setup()
  render(<VorlageZuruecksetzen coinId={COIN_ID} onZurueckgesetzt={onZurueckgesetzt} />)
  return { user }
}

const ausloeser = () => screen.getByRole('button', { name: 'Auf Standardvorlage zurücksetzen' })

async function oeffne(user: ReturnType<typeof userEvent.setup>) {
  await user.click(ausloeser())
  return screen.findByRole('alertdialog', { name: TITEL })
}

describe('Dialog', () => {
  it('öffnet einen AlertDialog „Auf Standardvorlage zurücksetzen?“', async () => {
    const { user } = zeige()

    expect(await oeffne(user)).toBeInTheDocument()
  })

  it('sendet beim Öffnen keinen Request', async () => {
    const { user } = zeige()

    await oeffne(user)

    expect(api.anfragen).toHaveLength(0)
  })

  it('erklärt, dass die eigene Vorlage als Version gespeichert bleibt', async () => {
    const { user } = zeige()

    const dialog = await oeffne(user)

    expect(dialog).toHaveTextContent(TEXT)
  })

  it('bietet „Zurücksetzen“ und „Abbrechen“', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    expect(within(dialog).getByRole('button', { name: 'Zurücksetzen' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
  })

  it('öffnet per Tastatur (Enter)', async () => {
    const { user } = zeige()

    ausloeser().focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('alertdialog', { name: TITEL })).toBeInTheDocument()
  })

  it('hält den Fokus im Dialog (Fokusfalle)', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    for (let i = 0; i < 4; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('schließt mit Escape ohne Request und gibt den Fokus an den Auslöser zurück', async () => {
    const { user } = zeige()
    await oeffne(user)

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(ausloeser()).toHaveFocus()
    expect(api.anfragen).toHaveLength(0)
  })

  it('schließt mit „Abbrechen“ ohne Request und gibt den Fokus an den Auslöser zurück', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(ausloeser()).toHaveFocus()
    expect(api.anfragen).toHaveLength(0)
  })

  it('zeigt keine englischen Texte', async () => {
    const { user } = zeige()
    await oeffne(user)

    expect(seitentext()).not.toMatch(/\b(Reset|Cancel|Close|Confirm|Continue)\b/)
  })
})

describe('Zurücksetzen', () => {
  it('sendet genau einen POST …/zuruecksetzen', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Zurücksetzen' }))

    await waitFor(() => expect(api.anfragenMit('POST', POST)).toHaveLength(1))
  })

  it('meldet den neuen Status an onZurueckgesetzt und schließt den Dialog', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Zurücksetzen' }))

    await waitFor(() => expect(onZurueckgesetzt).toHaveBeenCalledTimes(1))
    expect(onZurueckgesetzt.mock.calls[0][0]).toMatchObject({ quelle: 'standard', aktiveVersion: null })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('sendet bei Doppelklick nur einmal', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)
    const { user } = zeige()
    const dialog = await oeffne(user)
    const bestaetigen = within(dialog).getByRole('button', { name: 'Zurücksetzen' })

    await user.click(bestaetigen)
    await user.click(bestaetigen)

    expect(api.anfragenMit('POST', POST)).toHaveLength(1)
    offen.aufloesen(problemAntwort(500))
  })

  it('zeigt bei einem Fehler einen Alarm und ruft onZurueckgesetzt nicht auf', async () => {
    api.einmal('POST', POST, problemAntwort(500))
    const { user } = zeige()
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Zurücksetzen' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onZurueckgesetzt).not.toHaveBeenCalled()
  })
})
