import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import {
  erstelleFakeApi,
  hologrammKonfliktAntwort,
  problemAntwort,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { gibEin } from '../../../../test/hilfen'
import { AusgabeFormular } from '../index'

// Feature hologrammnummer, AK-26 und AK-33: Feld „Hologrammnummer (optional)“ nach „Ausgebende Stelle oder Person“
// mit maxLength 40, autoComplete off, spellCheck false und Hinweis per aria-describedby; Clientprüfung wie AK-1;
// Serverfehler `hologrammnummer` und 409 hologrammnummer_vergeben erscheinen am Feld, Fokus auf das Feld.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const POST = /^\/api\/coins\/[^/]+\/ausgaben$/
const HINWEIS = 'Nummer des Hologramm-Stickers auf dem Zertifikat. Leerzeichen und Bindestriche sind erlaubt.'
const coin = testCoin({ id: COIN_ID, auflage: 150 })
const kennzahlen = { auflage: 150, ausgegeben: 3, verfuegbar: 147 }

let api: FakeApi
let onErfasst: ReturnType<typeof vi.fn<(ausgabe: Ausgabe) => void>>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T09:00:00Z'))
  api = erstelleFakeApi([coin])
  vi.stubGlobal('fetch', api.fetch)
  onErfasst = vi.fn<(ausgabe: Ausgabe) => void>()
})

afterEach(() => {
  vi.useRealTimers()
})

function zeige() {
  const user = userEvent.setup()
  render(<AusgabeFormular coin={coin} kennzahlen={kennzahlen} onErfasst={onErfasst} />)
  return { user }
}

const hologramm = () => screen.getByLabelText(/^Hologrammnummer/) as HTMLInputElement
const stelle = () => screen.getByLabelText(/^Ausgebende Stelle oder Person/) as HTMLInputElement
const speichern = () => screen.getByRole('button', { name: 'Ausgabe speichern' })

async function fuellePflichtfelder(user: ReturnType<typeof userEvent.setup>) {
  await gibEin(user, screen.getByLabelText(/^Name des Empfängers/), 'Max Beispiel')
  await gibEin(user, screen.getByLabelText(/^Gelegenheit/), 'Truppenbesuch')
  await gibEin(user, screen.getByLabelText(/^Begründung/), 'Herausragende Leistung')
  await gibEin(user, stelle(), 'Kommandeur Beispielbataillon 1')
}

function beschreibung(feld: HTMLElement): string {
  return (feld.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

const body = () => api.anfragenMit('POST', POST)[0].body as Record<string, unknown>

describe('Feld „Hologrammnummer (optional)“', () => {
  it('heißt „Hologrammnummer (optional)“', () => {
    zeige()

    expect(hologramm()).toHaveAccessibleName('Hologrammnummer (optional)')
  })

  it('steht nach „Ausgebende Stelle oder Person“', () => {
    zeige()

    expect(stelle().compareDocumentPosition(hologramm()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('folgt per Tab direkt auf „Ausgebende Stelle oder Person“', async () => {
    const { user } = zeige()
    stelle().focus()

    await user.tab()

    expect(hologramm()).toHaveFocus()
  })

  it.each([
    ['maxlength', '40'],
    ['autocomplete', 'off'],
    ['spellcheck', 'false'],
  ])('setzt %s="%s"', (attribut, wert) => {
    zeige()

    expect(hologramm()).toHaveAttribute(attribut, wert)
  })

  it('verbindet den Hinweis per aria-describedby', () => {
    zeige()

    expect(beschreibung(hologramm())).toContain(HINWEIS)
  })

  it('ist kein Pflichtfeld', () => {
    zeige()

    expect(hologramm()).not.toHaveAccessibleName(/Pflichtfeld/)
  })
})

describe('Absenden mit Hologrammnummer', () => {
  it('sendet die eingegebene Nummer', async () => {
    const { user } = zeige()
    await fuellePflichtfelder(user)
    await gibEin(user, hologramm(), 'ab 12-34')

    await user.click(speichern())

    await waitFor(() => expect(api.anfragenMit('POST', POST)).toHaveLength(1))
    expect(String(body().hologrammnummer).replace(/[\s-]/g, '').toUpperCase()).toBe('AB1234')
  })

  it('sendet ohne Eingabe keine Nummer', async () => {
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(speichern())

    await waitFor(() => expect(api.anfragenMit('POST', POST)).toHaveLength(1))
    expect(body().hologrammnummer ?? null).toBeNull()
  })

  it('sendet bei nur Leerzeichen keine Nummer', async () => {
    const { user } = zeige()
    await fuellePflichtfelder(user)
    await gibEin(user, hologramm(), '   ')

    await user.click(speichern())

    await waitFor(() => expect(api.anfragenMit('POST', POST)).toHaveLength(1))
    expect([null, undefined, '']).toContain(body().hologrammnummer)
  })
})

describe('Fehler am Feld', () => {
  it('meldet unerlaubte Zeichen am Feld und sendet nichts', async () => {
    const { user } = zeige()
    await fuellePflichtfelder(user)
    await gibEin(user, hologramm(), 'AB/1234')

    await user.click(speichern())

    await waitFor(() =>
      expect(beschreibung(hologramm())).toContain(
        'Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.',
      ),
    )
    expect(hologramm()).toHaveAttribute('aria-invalid', 'true')
    expect(api.anfragenMit('POST')).toHaveLength(0)
  })

  it('meldet eine Nummer nur aus Trennzeichen am Feld und sendet nichts', async () => {
    const { user } = zeige()
    await fuellePflichtfelder(user)
    await gibEin(user, hologramm(), '--')

    await user.click(speichern())

    await waitFor(() =>
      expect(beschreibung(hologramm())).toContain(
        'Die Hologrammnummer muss mindestens einen Buchstaben oder eine Ziffer enthalten.',
      ),
    )
    expect(api.anfragenMit('POST')).toHaveLength(0)
  })

  it('setzt bei einem Fehler nur an der Nummer den Fokus auf das Feld', async () => {
    const { user } = zeige()
    await fuellePflichtfelder(user)
    await gibEin(user, hologramm(), 'AB/1234')

    await user.click(speichern())

    await waitFor(() => expect(hologramm()).toHaveFocus())
  })

  it('zeigt einen Serverfehler zum Feld hologrammnummer am Feld', async () => {
    api.einmal(
      'POST',
      POST,
      problemAntwort(400, {
        title: 'Eingaben ungültig',
        errors: { hologrammnummer: ['Die Hologrammnummer darf höchstens 40 Zeichen lang sein.'] },
      }),
    )
    const { user } = zeige()
    await fuellePflichtfelder(user)
    await gibEin(user, hologramm(), 'AB1234')

    await user.click(speichern())

    await waitFor(() =>
      expect(beschreibung(hologramm())).toContain('Die Hologrammnummer darf höchstens 40 Zeichen lang sein.'),
    )
  })

  it('zeigt 409 hologrammnummer_vergeben am Feld', async () => {
    api.einmal('POST', POST, hologrammKonfliktAntwort('hologrammnummer_vergeben', 'Ausgabe nicht möglich'))
    const { user } = zeige()
    await fuellePflichtfelder(user)
    await gibEin(user, hologramm(), 'AB1234')

    await user.click(speichern())

    await waitFor(() => expect(beschreibung(hologramm())).toContain('Diese Hologrammnummer ist bereits vergeben.'))
    expect(hologramm()).toHaveAttribute('aria-invalid', 'true')
  })

  it('setzt bei 409 hologrammnummer_vergeben den Fokus auf das Feld', async () => {
    api.einmal('POST', POST, hologrammKonfliktAntwort('hologrammnummer_vergeben', 'Ausgabe nicht möglich'))
    const { user } = zeige()
    await fuellePflichtfelder(user)
    await gibEin(user, hologramm(), 'AB1234')

    await user.click(speichern())

    await waitFor(() => expect(hologramm()).toHaveFocus())
  })

  it('zeigt 409 hologrammnummer_vergeben nicht als „Alle Exemplare … ausgegeben“', async () => {
    api.einmal('POST', POST, hologrammKonfliktAntwort('hologrammnummer_vergeben', 'Ausgabe nicht möglich'))
    const { user } = zeige()
    await fuellePflichtfelder(user)
    await gibEin(user, hologramm(), 'AB1234')

    await user.click(speichern())

    await waitFor(() => expect(beschreibung(hologramm())).toContain('Diese Hologrammnummer ist bereits vergeben.'))
    expect(screen.queryByText('Alle Exemplare dieses Coins sind ausgegeben.')).not.toBeInTheDocument()
  })

  it('ruft bei 409 hologrammnummer_vergeben onErfasst nicht auf', async () => {
    api.einmal('POST', POST, hologrammKonfliktAntwort('hologrammnummer_vergeben', 'Ausgabe nicht möglich'))
    const { user } = zeige()
    await fuellePflichtfelder(user)
    await gibEin(user, hologramm(), 'AB1234')

    await user.click(speichern())

    await waitFor(() => expect(beschreibung(hologramm())).toContain('Diese Hologrammnummer ist bereits vergeben.'))
    expect(onErfasst).not.toHaveBeenCalled()
  })

  it('übergibt nach Erfolg die Ausgabe mit der Nummer aus der Antwort', async () => {
    const { user } = zeige()
    await fuellePflichtfelder(user)
    await gibEin(user, hologramm(), 'ab 12-34')

    await user.click(speichern())

    await waitFor(() => expect(onErfasst).toHaveBeenCalledTimes(1))
    expect(onErfasst.mock.calls[0][0]).toMatchObject({ hologrammnummer: 'AB 12-34' })
  })
})
