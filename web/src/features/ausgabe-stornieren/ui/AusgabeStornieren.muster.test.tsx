import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import {
  erstelleFakeApi,
  offeneAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { erwarteFeldfehler, erwarteKeinenFeldfehler, erwarteLaedt, erwartePflicht } from '../../../../test/formular'
import { gibEin } from '../../../../test/hilfen'
import { AusgabeStornieren } from '../index'

// Feature formulare-detailseiten, AK-2 bis AK-6, AK-10, AK-17 und AK-18 (Abschnitt 4.2, 4.4): Storno über den
// `Bestaetigungsdialog` mit Pflichtgrund. Titel, Beschreibung und Buttonnamen bleiben wortgleich (F5); Hilfetext
// „Bitte keine Personendaten in den Grund schreiben.“ + „Höchstens 500 Zeichen.“.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const POST = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+\/storno$/
const ausgabe = testAusgabe({ exemplarNummer: 12 })

let api: FakeApi
let onStorniert: ReturnType<typeof vi.fn<(ausgabe: Ausgabe) => void>>

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID })], { ausgaben: { [COIN_ID]: [structuredClone(ausgabe)] } })
  vi.stubGlobal('fetch', api.fetch)
  onStorniert = vi.fn<(ausgabe: Ausgabe) => void>()
})

async function oeffne() {
  const user = userEvent.setup()
  render(<AusgabeStornieren coinId={COIN_ID} ausgabe={ausgabe} onStorniert={onStorniert} />)
  const knopf = screen.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 12 stornieren' })
  await user.click(knopf)
  const dialog = await screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })
  return { user, knopf, dialog, grund: within(dialog).getByLabelText(/^Grund/) as HTMLTextAreaElement }
}

const stornieren = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Stornieren' })

describe('Dialog (AK-17, AK-18)', () => {
  it('beschreibt die Folge wortgleich wie bisher (aria-describedby)', async () => {
    const { dialog } = await oeffne()

    expect(dialog).toHaveAccessibleDescription(
      'Die Ausgabe von Exemplar Nr. 12 bleibt in der Historie sichtbar. Das Exemplar ist danach wieder verfügbar.',
    )
  })

  it('stellt „Stornieren“ in der Variante „gefährlich“ dar', async () => {
    const { dialog } = await oeffne()

    expect(stornieren(dialog).className).toMatch(/\bbg-destructive\b/)
  })

  it('fokussiert beim Öffnen das Feld „Grund“', async () => {
    const { grund } = await oeffne()

    await waitFor(() => expect(grund).toHaveFocus())
  })

  it('sendet bei „Abbrechen“ nichts und gibt den Fokus an den Auslöser zurück', async () => {
    const { user, dialog, knopf } = await oeffne()

    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(knopf).toHaveFocus())
    expect(api.anfragenMit('POST', POST)).toHaveLength(0)
  })

  it('sendet bei Escape nichts und gibt den Fokus an den Auslöser zurück', async () => {
    const { user, knopf } = await oeffne()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(knopf).toHaveFocus())
    expect(api.anfragenMit('POST', POST)).toHaveLength(0)
  })
})

describe('Pflichtgrund (AK-2, AK-3, AK-17)', () => {
  it('kennzeichnet den Grund als Pflicht', async () => {
    const { grund } = await oeffne()

    erwartePflicht(grund)
  })

  it('beschreibt den Grund mit Datenschutz-Hinweis und „Höchstens 500 Zeichen.“', async () => {
    const { grund } = await oeffne()

    expect(grund).toHaveAccessibleDescription(
      expect.stringContaining('Bitte keine Personendaten in den Grund schreiben.'),
    )
    expect(grund).toHaveAccessibleDescription(expect.stringContaining('Höchstens 500 Zeichen.'))
  })

  it('zeigt ohne Grund den Feldfehler und sendet nichts', async () => {
    const { user, dialog, grund } = await oeffne()

    await user.click(stornieren(dialog))

    await waitFor(() => erwarteFeldfehler(grund, 'Bitte einen Grund für das Storno angeben.'))
    expect(api.anfragenMit('POST', POST)).toHaveLength(0)
  })

  it('zeigt beim Verlassen des leeren, unberührten Grunds keinen Fehler', async () => {
    const { user, grund } = await oeffne()

    await user.tab()

    erwarteKeinenFeldfehler(grund)
  })
})

describe('Während der Anfrage (AK-10, AK-17)', () => {
  it('zeigt am Bestätigungsbutton den Ladezustand', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)
    const { user, dialog, grund } = await oeffne()
    await gibEin(user, grund, 'Doppelt erfasst')

    await user.click(stornieren(dialog))

    await waitFor(() => erwarteLaedt(stornieren(dialog)))
    offen.aufloesen(problemAntwort(500))
  })

  it('schließt während der Anfrage weder per Escape noch per „Abbrechen“', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)
    const { user, dialog, grund } = await oeffne()
    await gibEin(user, grund, 'Doppelt erfasst')
    await user.click(stornieren(dialog))
    await waitFor(() => expect(api.anfragenMit('POST', POST)).toHaveLength(1))

    await user.keyboard('{Escape}')
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))

    expect(screen.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })).toBeInTheDocument()
    offen.aufloesen(problemAntwort(500))
  })

  it('sendet bei Doppelklick genau einen Request', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)
    const { user, dialog, grund } = await oeffne()
    await gibEin(user, grund, 'Doppelt erfasst')

    await user.dblClick(stornieren(dialog))

    expect(api.anfragenMit('POST', POST)).toHaveLength(1)
    offen.aufloesen(problemAntwort(500))
  })

  it('sendet nach Bestätigung den Grund wie bisher', async () => {
    const { user, dialog, grund } = await oeffne()
    await gibEin(user, grund, 'Doppelt erfasst')

    await user.click(stornieren(dialog))

    await waitFor(() => expect(onStorniert).toHaveBeenCalledTimes(1))
    expect(api.anfragenMit('POST', POST)[0].body).toEqual({ grund: 'Doppelt erfasst' })
  })
})
