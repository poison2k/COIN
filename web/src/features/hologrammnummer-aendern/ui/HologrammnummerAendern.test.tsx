import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import {
  erstelleFakeApi,
  hologrammKonfliktAntwort,
  jsonAntwort,
  offeneAntwort,
  testAusgabe,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { gibEin, meldungMit } from '../../../../test/hilfen'
import { HologrammnummerAendern } from '../index'

// Feature hologrammnummer, AK-27 und AK-33: Button „Hologrammnummer ergänzen“ bzw. „… korrigieren“ mit Dialog
// (Titel wie Button), Pflichtfeld „Hologrammnummer“ (vorbelegt), bei Korrektur Pflichtfeld „Grund der Korrektur“ mit
// den Hinweisen; Speichern sendet `bisherige`. Props { coinId, ausgabe, onGeaendert(ausgabe), onNeuLaden() }.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const PUT = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+\/hologrammnummer$/
const HINWEIS_PERSONEN = 'Bitte keine Personendaten eintragen.'
const HINWEIS_FREI = 'Die bisherige Nummer wird dadurch wieder frei.'
const TEXT_GEAENDERT = 'Die Hologrammnummer wurde inzwischen geändert. Die Seite wurde neu geladen.'
const TEXT_STORNIERT = 'Die Ausgabe wurde inzwischen storniert. Die Hologrammnummer kann nicht mehr geändert werden.'
const TEXT_VERGEBEN = 'Diese Hologrammnummer ist bereits vergeben.'

const OHNE = testAusgabe({ exemplarNummer: 12, hologrammnummer: null })
const MIT = testAusgabe({ exemplarNummer: 12, hologrammnummer: 'AB 12-43' })

let api: FakeApi
let onGeaendert: ReturnType<typeof vi.fn<(ausgabe: Ausgabe) => void>>
let onNeuLaden: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID })], { ausgaben: { [COIN_ID]: [structuredClone(OHNE)] } })
  vi.stubGlobal('fetch', api.fetch)
  onGeaendert = vi.fn<(ausgabe: Ausgabe) => void>()
  onNeuLaden = vi.fn<() => void>()
})

function zeige(ausgabe: Ausgabe = OHNE) {
  const user = userEvent.setup()
  render(
    <HologrammnummerAendern coinId={COIN_ID} ausgabe={ausgabe} onGeaendert={onGeaendert} onNeuLaden={onNeuLaden} />,
  )
  return { user }
}

async function oeffne(user: ReturnType<typeof userEvent.setup>, titel: string) {
  await user.click(screen.getByRole('button', { name: titel }))
  return screen.findByRole('dialog', { name: titel })
}

const nummernFeld = (dialog: HTMLElement) => within(dialog).getByLabelText(/^Hologrammnummer/) as HTMLInputElement
const grundFeld = (dialog: HTMLElement) => within(dialog).getByLabelText(/^Grund der Korrektur/) as HTMLTextAreaElement
const speichern = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: /Speichern/ })

/** Text der per aria-describedby verbundenen Elemente. */
function beschreibung(feld: HTMLElement): string {
  return (feld.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

function normalform(wert: unknown): string {
  return String(wert ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase()
}

// ---------- Button ----------

describe('Button', () => {
  it('heißt ohne Nummer „Hologrammnummer ergänzen“', () => {
    zeige(OHNE)

    expect(screen.getByRole('button', { name: 'Hologrammnummer ergänzen' })).toBeInTheDocument()
  })

  it('heißt mit Nummer „Hologrammnummer korrigieren“', () => {
    zeige(MIT)

    expect(screen.getByRole('button', { name: 'Hologrammnummer korrigieren' })).toBeInTheDocument()
  })

  it('fehlt bei einer stornierten Ausgabe', () => {
    zeige({ ...MIT, storno: { am: '2026-10-08T10:00:00+00:00', von: { id: 'x', name: 'Test Admin' }, grund: 'Test' } })

    expect(screen.queryByRole('button', { name: /Hologrammnummer/ })).not.toBeInTheDocument()
  })

  it('öffnet per Tastatur (Enter) den Dialog', async () => {
    const { user } = zeige(OHNE)
    screen.getByRole('button', { name: 'Hologrammnummer ergänzen' }).focus()

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('dialog', { name: 'Hologrammnummer ergänzen' })).toBeInTheDocument()
  })

  it('bietet keinen Button zum Entfernen der Nummer an', async () => {
    const { user } = zeige(MIT)
    const dialog = await oeffne(user, 'Hologrammnummer korrigieren')

    expect(within(dialog).queryByRole('button', { name: /entfernen|löschen/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /entfernen|löschen/i })).not.toBeInTheDocument()
  })
})

// ---------- Dialog: Ergänzen ----------

describe('Dialog „Hologrammnummer ergänzen“', () => {
  it('hat ein leeres Pflichtfeld „Hologrammnummer“', async () => {
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')

    expect(nummernFeld(dialog)).toHaveValue('')
    expect(nummernFeld(dialog)).toHaveAccessibleName(/\(Pflichtfeld\)/)
  })

  it('begrenzt die Nummer auf 40 Zeichen ohne Autovervollständigung und Rechtschreibprüfung', async () => {
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')

    expect(nummernFeld(dialog)).toHaveAttribute('maxlength', '40')
    expect(nummernFeld(dialog)).toHaveAttribute('autocomplete', 'off')
    expect(nummernFeld(dialog)).toHaveAttribute('spellcheck', 'false')
  })

  it('hat kein Feld „Grund der Korrektur“', async () => {
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')

    expect(within(dialog).queryByLabelText(/^Grund der Korrektur/)).not.toBeInTheDocument()
  })

  it('setzt den Fokus beim Öffnen in das Nummernfeld', async () => {
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')

    await waitFor(() => expect(nummernFeld(dialog)).toHaveFocus())
  })

  it('sendet die Nummer ohne bisherige', async () => {
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')
    await gibEin(user, nummernFeld(dialog), 'ab 12-34')

    await user.click(speichern(dialog))

    await waitFor(() => expect(api.anfragenMit('PUT', PUT)).toHaveLength(1))
    const body = api.anfragenMit('PUT', PUT)[0].body as Record<string, unknown>
    expect(normalform(body.hologrammnummer)).toBe('AB1234')
    expect([null, undefined, '']).toContain(body.bisherige)
  })

  it('sendet mit Enter im Nummernfeld', async () => {
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')
    await gibEin(user, nummernFeld(dialog), 'AB1234')

    await user.keyboard('{Enter}')

    await waitFor(() => expect(api.anfragenMit('PUT', PUT)).toHaveLength(1))
  })

  it('sendet ohne Nummer nichts und meldet „Bitte eine Hologrammnummer eingeben.“', async () => {
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')

    await user.click(speichern(dialog))

    expect(await within(dialog).findByText('Bitte eine Hologrammnummer eingeben.')).toBeInTheDocument()
    expect(api.anfragenMit('PUT')).toHaveLength(0)
  })

  it('meldet ungültige Zeichen am Feld mit aria-invalid und aria-describedby, ohne zu senden', async () => {
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')
    await gibEin(user, nummernFeld(dialog), 'AB/1234')

    await user.click(speichern(dialog))

    await waitFor(() => expect(nummernFeld(dialog)).toHaveAttribute('aria-invalid', 'true'))
    expect(beschreibung(nummernFeld(dialog))).toContain(
      'Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.',
    )
    expect(api.anfragenMit('PUT')).toHaveLength(0)
  })

  it('schließt mit Escape ohne zu senden', async () => {
    const { user } = zeige(OHNE)
    await oeffne(user, 'Hologrammnummer ergänzen')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.anfragenMit('PUT')).toHaveLength(0)
  })
})

// ---------- Dialog: Korrigieren ----------

describe('Dialog „Hologrammnummer korrigieren“', () => {
  it('belegt das Nummernfeld mit der aktuellen Nummer vor', async () => {
    const { user } = zeige(MIT)
    const dialog = await oeffne(user, 'Hologrammnummer korrigieren')

    expect(nummernFeld(dialog)).toHaveValue('AB 12-43')
  })

  it('hat ein Pflichtfeld „Grund der Korrektur“ mit höchstens 500 Zeichen', async () => {
    const { user } = zeige(MIT)
    const dialog = await oeffne(user, 'Hologrammnummer korrigieren')

    expect(grundFeld(dialog)).toHaveAccessibleName(/\(Pflichtfeld\)/)
    expect(grundFeld(dialog)).toHaveAttribute('maxlength', '500')
  })

  it.each([HINWEIS_PERSONEN, HINWEIS_FREI])('verbindet den Hinweis „%s“ mit dem Grund', async (hinweis) => {
    const { user } = zeige(MIT)
    const dialog = await oeffne(user, 'Hologrammnummer korrigieren')

    expect(beschreibung(grundFeld(dialog))).toContain(hinweis)
  })

  it('sendet neue Nummer, Grund und die bisherige Nummer', async () => {
    const { user } = zeige(MIT)
    const dialog = await oeffne(user, 'Hologrammnummer korrigieren')
    await user.clear(nummernFeld(dialog))
    await gibEin(user, nummernFeld(dialog), 'AB 12-34')
    await gibEin(user, grundFeld(dialog), 'Tippfehler bei der Erfassung')

    await user.click(speichern(dialog))

    await waitFor(() => expect(api.anfragenMit('PUT', PUT)).toHaveLength(1))
    expect(api.anfragenMit('PUT', PUT)[0].body).toMatchObject({
      grund: 'Tippfehler bei der Erfassung',
      bisherige: 'AB 12-43',
    })
    expect(normalform((api.anfragenMit('PUT', PUT)[0].body as Record<string, unknown>).hologrammnummer)).toBe('AB1234')
  })

  it('verlangt den Grund und sendet ohne ihn nichts', async () => {
    const { user } = zeige(MIT)
    const dialog = await oeffne(user, 'Hologrammnummer korrigieren')
    await user.clear(nummernFeld(dialog))
    await gibEin(user, nummernFeld(dialog), 'AB1234')

    await user.click(speichern(dialog))

    expect(await within(dialog).findByText('Bitte einen Grund für die Korrektur angeben.')).toBeInTheDocument()
    expect(api.anfragenMit('PUT')).toHaveLength(0)
  })

  it('setzt bei fehlendem Grund den Fokus auf das Feld „Grund der Korrektur“', async () => {
    const { user } = zeige(MIT)
    const dialog = await oeffne(user, 'Hologrammnummer korrigieren')
    await user.clear(nummernFeld(dialog))
    await gibEin(user, nummernFeld(dialog), 'AB1234')

    await user.click(speichern(dialog))

    await waitFor(() => expect(grundFeld(dialog)).toHaveFocus())
    expect(grundFeld(dialog)).toHaveAttribute('aria-invalid', 'true')
  })

  it('lässt ein leeres Nummernfeld nicht zu (kein Entfernen)', async () => {
    const { user } = zeige(MIT)
    const dialog = await oeffne(user, 'Hologrammnummer korrigieren')
    await user.clear(nummernFeld(dialog))
    await gibEin(user, grundFeld(dialog), 'Entfernen')

    await user.click(speichern(dialog))

    expect(await within(dialog).findByText('Bitte eine Hologrammnummer eingeben.')).toBeInTheDocument()
    expect(api.anfragenMit('PUT')).toHaveLength(0)
  })
})

// ---------- Ergebnis ----------

describe('nach dem Speichern', () => {
  it('schließt den Dialog und meldet die Ausgabe aus der Antwort', async () => {
    const neu = testAusgabe({ ...OHNE, hologrammnummer: 'AB 12-34' })
    api.einmal('PUT', PUT, jsonAntwort(200, neu))
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')
    await gibEin(user, nummernFeld(dialog), 'ab 12-34')

    await user.click(speichern(dialog))

    await waitFor(() => expect(onGeaendert).toHaveBeenCalledWith(neu))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('gibt den Fokus an den Button zurück', async () => {
    api.einmal('PUT', PUT, jsonAntwort(200, testAusgabe({ ...OHNE, hologrammnummer: 'AB 12-34' })))
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')
    await gibEin(user, nummernFeld(dialog), 'AB1234')

    await user.click(speichern(dialog))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Hologrammnummer (ergänzen|korrigieren)$/ })).toHaveFocus(),
    )
  })

  it('sperrt den Button während des Speicherns und sendet bei doppeltem Absenden nur einmal', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', PUT, offen.promise)
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')
    await gibEin(user, nummernFeld(dialog), 'AB1234')

    await user.keyboard('{Enter}')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(api.anfragenMit('PUT', PUT)).toHaveLength(1))
    offen.aufloesen(jsonAntwort(200, testAusgabe({ ...OHNE, hologrammnummer: 'AB1234' })))
    await waitFor(() => expect(onGeaendert).toHaveBeenCalledTimes(1))
  })

  it('zeigt 409 hologrammnummer_vergeben am Feld und lässt den Dialog offen', async () => {
    api.einmal('PUT', PUT, hologrammKonfliktAntwort('hologrammnummer_vergeben'))
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')
    await gibEin(user, nummernFeld(dialog), 'AB1234')

    await user.click(speichern(dialog))

    await waitFor(() => expect(beschreibung(nummernFeld(dialog))).toContain(TEXT_VERGEBEN))
    expect(nummernFeld(dialog)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('dialog', { name: 'Hologrammnummer ergänzen' })).toBeInTheDocument()
    expect(onGeaendert).not.toHaveBeenCalled()
  })

  it('setzt bei 409 hologrammnummer_vergeben den Fokus auf das Nummernfeld', async () => {
    api.einmal('PUT', PUT, hologrammKonfliktAntwort('hologrammnummer_vergeben'))
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')
    await gibEin(user, nummernFeld(dialog), 'AB1234')

    await user.click(speichern(dialog))

    await waitFor(() => expect(nummernFeld(dialog)).toHaveFocus())
  })

  it('meldet 409 hologrammnummer_geaendert als Alarm und lädt neu', async () => {
    api.einmal('PUT', PUT, hologrammKonfliktAntwort('hologrammnummer_geaendert'))
    const { user } = zeige(MIT)
    const dialog = await oeffne(user, 'Hologrammnummer korrigieren')
    await user.clear(nummernFeld(dialog))
    await gibEin(user, nummernFeld(dialog), 'AB1234')
    await gibEin(user, grundFeld(dialog), 'Tippfehler')

    await user.click(speichern(dialog))

    await waitFor(() => expect(meldungMit(TEXT_GEAENDERT)?.getAttribute('role')).toBe('alert'))
    expect(onNeuLaden).toHaveBeenCalledTimes(1)
  })

  it('meldet 409 ausgabe_storniert als Alarm und lädt neu', async () => {
    api.einmal('PUT', PUT, hologrammKonfliktAntwort('ausgabe_storniert'))
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')
    await gibEin(user, nummernFeld(dialog), 'AB1234')

    await user.click(speichern(dialog))

    await waitFor(() => expect(meldungMit(TEXT_STORNIERT)?.getAttribute('role')).toBe('alert'))
    expect(onNeuLaden).toHaveBeenCalledTimes(1)
  })

  it('ruft bei 409 vergeben nicht onNeuLaden auf', async () => {
    api.einmal('PUT', PUT, hologrammKonfliktAntwort('hologrammnummer_vergeben'))
    const { user } = zeige(OHNE)
    const dialog = await oeffne(user, 'Hologrammnummer ergänzen')
    await gibEin(user, nummernFeld(dialog), 'AB1234')

    await user.click(speichern(dialog))

    await waitFor(() => expect(beschreibung(nummernFeld(dialog))).toContain(TEXT_VERGEBEN))
    expect(onNeuLaden).not.toHaveBeenCalled()
  })
})

// ---------- AK-33: deutsche Texte ----------

describe('Texte', () => {
  it('enthält im geöffneten Dialog keine englischen Texte, auch nicht in Attributen', async () => {
    const { user } = zeige(MIT)
    await oeffne(user, 'Hologrammnummer korrigieren')

    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    expect([document.body.textContent ?? '', ...attribute].join(' ')).not.toMatch(
      /\b(Save|Submit|Cancel|Close|Required|Reason|Number|Loading|Error|Remove|Delete)\b/,
    )
  })
})
