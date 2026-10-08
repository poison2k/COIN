import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import {
  ausgabeKonfliktAntwort,
  erstelleFakeApi,
  jsonAntwort,
  offeneAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { gibEin, seitentext } from '../../../../test/hilfen'
import { AusgabeStornieren } from '../index'

// Feature coin-ausgaben, AK-24 und AK-30: Button „Stornieren“ mit AlertDialog „Ausgabe stornieren?“,
// Pflichtfeld „Grund“ mit Datenschutz-Hinweis. Props { coinId, ausgabe, onStorniert }.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const POST = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+\/storno$/
const HINWEIS = 'Bitte keine Personendaten in den Grund schreiben.'

let api: FakeApi
let onStorniert: ReturnType<typeof vi.fn<(ausgabe: Ausgabe) => void>>
const ausgabe = testAusgabe({ exemplarNummer: 12 })

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID })], { ausgaben: { [COIN_ID]: [structuredClone(ausgabe)] } })
  vi.stubGlobal('fetch', api.fetch)
  onStorniert = vi.fn<(ausgabe: Ausgabe) => void>()
})

function zeige() {
  const user = userEvent.setup()
  render(<AusgabeStornieren coinId={COIN_ID} ausgabe={ausgabe} onStorniert={onStorniert} />)
  return { user }
}

const knopf = () => screen.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 12 stornieren' })

async function oeffne(user: ReturnType<typeof userEvent.setup>) {
  await user.click(knopf())
  return screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })
}

describe('Button', () => {
  it('heißt sichtbar „Stornieren“', () => {
    zeige()

    expect(knopf()).toHaveTextContent('Stornieren')
  })

  it('hat den zugänglichen Namen „Ausgabe von Exemplar Nr. {n} stornieren“', () => {
    zeige()

    expect(knopf()).toHaveAttribute('aria-label', 'Ausgabe von Exemplar Nr. 12 stornieren')
  })

  it('öffnet per Tastatur (Enter) den Dialog', async () => {
    const { user } = zeige()
    knopf().focus()

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })).toBeInTheDocument()
  })
})

describe('Dialog', () => {
  it('hat ein mehrzeiliges Pflichtfeld „Grund“ mit maxLength 500', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    const grund = within(dialog).getByLabelText(/^Grund/)
    expect(grund.tagName).toBe('TEXTAREA')
    expect(grund).toHaveAttribute('maxlength', '500')
  })

  it('verbindet den Datenschutz-Hinweis per aria-describedby mit dem Feld', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    expect(within(dialog).getByLabelText(/^Grund/)).toHaveAccessibleDescription(new RegExp(HINWEIS.replace('.', '\\.')))
  })

  it('bietet „Stornieren“ und „Abbrechen“', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    expect(within(dialog).getByRole('button', { name: 'Stornieren' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
  })

  it('sendet vor der Bestätigung keinen Request', async () => {
    const { user } = zeige()
    await oeffne(user)

    expect(api.anfragenMit('POST')).toHaveLength(0)
  })

  it('hält den Fokus im Dialog', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()

    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('zeigt keine englischen Texte', async () => {
    const { user } = zeige()
    await oeffne(user)

    expect(seitentext()).not.toMatch(/\b(Cancel|Confirm|Reason|Required|Close)\b/)
  })
})

describe('leerer Grund', () => {
  it('zeigt den Feldfehler „Bitte einen Grund für das Storno angeben.“', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    const grund = within(dialog).getByLabelText(/^Grund/)
    expect(grund).toHaveAttribute('aria-invalid', 'true')
    expect(grund).toHaveAccessibleDescription(/Bitte einen Grund für das Storno angeben\./)
  })

  it('sendet keinen Request', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)
    await user.type(within(dialog).getByLabelText(/^Grund/), '   ')

    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    expect(api.anfragenMit('POST')).toHaveLength(0)
  })

  it('lässt den Dialog offen', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    expect(screen.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })).toBeInTheDocument()
  })
})

describe('Erfolg', () => {
  it('sendet POST …/storno mit dem Grund', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)
    await gibEin(user, within(dialog).getByLabelText(/^Grund/), 'Falsches Exemplar erfasst')

    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    await waitFor(() => expect(api.anfragenMit('POST', POST)).toHaveLength(1))
    expect(api.anfragenMit('POST', POST)[0].pfad).toBe(`/api/coins/${COIN_ID}/ausgaben/${ausgabe.id}/storno`)
    expect(api.anfragenMit('POST', POST)[0].body).toEqual({ grund: 'Falsches Exemplar erfasst' })
  })

  it('meldet die stornierte Ausgabe über onStorniert', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)
    await gibEin(user, within(dialog).getByLabelText(/^Grund/), 'Falsch')

    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    await waitFor(() => expect(onStorniert).toHaveBeenCalledTimes(1))
    expect(onStorniert.mock.calls[0][0]).toMatchObject({ id: ausgabe.id, storno: { grund: 'Falsch' } })
  })

  it('schließt den Dialog', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)
    await gibEin(user, within(dialog).getByLabelText(/^Grund/), 'Falsch')

    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('sendet bei doppeltem Klick nur einmal', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)
    const { user } = zeige()
    const dialog = await oeffne(user)
    await gibEin(user, within(dialog).getByLabelText(/^Grund/), 'Falsch')

    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))
    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    expect(api.anfragenMit('POST', POST)).toHaveLength(1)
    offen.aufloesen(jsonAntwort(200, ausgabe))
  })
})

describe('Fehler', () => {
  it('zeigt 409 bereits_storniert im Dialog als Alarm', async () => {
    api.einmal('POST', POST, ausgabeKonfliktAntwort('bereits_storniert'))
    const { user } = zeige()
    const dialog = await oeffne(user)
    await gibEin(user, within(dialog).getByLabelText(/^Grund/), 'Falsch')

    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Diese Ausgabe ist bereits storniert.')
  })

  it('zeigt einen Serverfehler im Dialog als Alarm ohne technische Details', async () => {
    api.einmal('POST', POST, problemAntwort(500, { detail: 'NpgsqlException' }))
    const { user } = zeige()
    const dialog = await oeffne(user)
    await gibEin(user, within(dialog).getByLabelText(/^Grund/), 'Falsch')

    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    const alarm = await within(dialog).findByRole('alert')
    expect(alarm.textContent).not.toMatch(/Npgsql|500/)
  })

  it('ruft onStorniert bei einem Fehler nicht auf', async () => {
    api.einmal('POST', POST, problemAntwort(500))
    const { user } = zeige()
    const dialog = await oeffne(user)
    await gibEin(user, within(dialog).getByLabelText(/^Grund/), 'Falsch')

    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    await within(dialog).findByRole('alert')
    expect(onStorniert).not.toHaveBeenCalled()
  })
})

describe('Abbrechen', () => {
  it('schließt per „Abbrechen“ ohne Request und gibt den Fokus an den Button zurück', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(knopf()).toHaveFocus())
    expect(api.anfragenMit('POST')).toHaveLength(0)
  })

  it('schließt per Escape ohne Request', async () => {
    const { user } = zeige()
    await oeffne(user)

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(api.anfragenMit('POST')).toHaveLength(0)
  })
})
