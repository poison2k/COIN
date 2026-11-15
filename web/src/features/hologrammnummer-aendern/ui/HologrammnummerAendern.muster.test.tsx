import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import {
  erstelleFakeApi,
  hologrammKonfliktAntwort,
  offeneAntwort,
  testAusgabe,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import {
  erwarteFeldfehler,
  erwarteKeinenFeldfehler,
  erwarteLaedt,
  erwartePflicht,
  liegtVor,
  zusammenfassung,
  zusammenfassungsLinks,
} from '../../../../test/formular'
import { gibEin } from '../../../../test/hilfen'
import { HologrammnummerAendern } from '../index'

// Feature formulare-detailseiten, AK-2 bis AK-7 und AK-10 (Abschnitt 4.1, 4.2): Formularmuster im Dialog
// „Hologrammnummer ergänzen/korrigieren“. Pflicht: Hologrammnummer, bei Korrektur „Grund der Korrektur“; Hilfetext der
// Nummer wie beim Erfassen (Normalisierung). Dialoge warnen beim Schließen nicht (A3).

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const PUT = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+\/hologrammnummer$/
const HILFE_NORMALISIERUNG =
  'Kleinbuchstaben werden zu Großbuchstaben. Erlaubt sind A–Z und 0–9, höchstens 40 Zeichen. Die Nummer darf nur einmal vergeben sein.'

const OHNE = testAusgabe({ exemplarNummer: 12, hologrammnummer: null })
const MIT = testAusgabe({ exemplarNummer: 12, hologrammnummer: 'AB 12-43' })

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID })], { ausgaben: { [COIN_ID]: [structuredClone(MIT)] } })
  vi.stubGlobal('fetch', api.fetch)
})

async function oeffne(ausgabe: Ausgabe) {
  const user = userEvent.setup()
  render(<HologrammnummerAendern coinId={COIN_ID} ausgabe={ausgabe} onGeaendert={vi.fn()} onNeuLaden={vi.fn()} />)
  const titel = ausgabe.hologrammnummer ? 'Hologrammnummer korrigieren' : 'Hologrammnummer ergänzen'
  await user.click(screen.getByRole('button', { name: titel }))
  const dialog = await screen.findByRole('dialog', { name: titel })
  return { user, dialog }
}

const nummer = (dialog: HTMLElement) => within(dialog).getByLabelText(/^Hologrammnummer/) as HTMLInputElement
const grund = (dialog: HTMLElement) => within(dialog).getByLabelText(/^Grund der Korrektur/) as HTMLTextAreaElement
const speichern = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Speichern' })

describe('Pflicht und Hilfetexte (AK-2, AK-3)', () => {
  it('kennzeichnet die Hologrammnummer als Pflicht', async () => {
    const { dialog } = await oeffne(OHNE)

    erwartePflicht(nummer(dialog))
  })

  it('kennzeichnet den Grund der Korrektur als Pflicht', async () => {
    const { dialog } = await oeffne(MIT)

    erwartePflicht(grund(dialog))
  })

  it('beschreibt die Nummer mit dem Hilfetext zur Normalisierung', async () => {
    const { dialog } = await oeffne(OHNE)

    expect(nummer(dialog)).toHaveAccessibleDescription(expect.stringContaining(HILFE_NORMALISIERUNG))
  })

  it('behält die Hinweise am Grund der Korrektur wortgleich', async () => {
    const { dialog } = await oeffne(MIT)

    const text = (grund(dialog).getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
    expect(text).toContain('Bitte keine Personendaten eintragen.')
    expect(text).toContain('Die bisherige Nummer wird dadurch wieder frei.')
  })
})

describe('Validierung beim Verlassen (AK-4, AK-5)', () => {
  it('zeigt beim Verlassen der unveränderten Nummer keinen Fehler', async () => {
    const { user, dialog } = await oeffne(OHNE)

    await user.tab()

    erwarteKeinenFeldfehler(nummer(dialog))
  })

  it('zeigt nach ungültiger Eingabe und Verlassen die Meldung am Feld', async () => {
    const { user, dialog } = await oeffne(OHNE)

    await user.type(nummer(dialog), 'AB_1')
    erwarteKeinenFeldfehler(nummer(dialog))
    await user.tab()

    erwarteFeldfehler(
      nummer(dialog),
      'Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.',
    )
  })

  it('entfernt den Fehler bei der Eingabe, sobald die Nummer gültig ist', async () => {
    const { user, dialog } = await oeffne(OHNE)
    await user.type(nummer(dialog), 'AB_1')
    await user.tab()

    await user.clear(nummer(dialog))
    await user.type(nummer(dialog), 'AB 1')

    erwarteKeinenFeldfehler(nummer(dialog))
  })

  it('lässt „Diese Hologrammnummer ist bereits vergeben.“ stehen, bis die Nummer geändert wird', async () => {
    api.einmal('PUT', PUT, hologrammKonfliktAntwort('hologrammnummer_vergeben'))
    const { user, dialog } = await oeffne(OHNE)
    await gibEin(user, nummer(dialog), 'XY 99')
    await user.click(speichern(dialog))
    await waitFor(() => erwarteFeldfehler(nummer(dialog), 'Diese Hologrammnummer ist bereits vergeben.'))

    await user.tab()
    erwarteFeldfehler(nummer(dialog), 'Diese Hologrammnummer ist bereits vergeben.')

    await user.type(nummer(dialog), '9')
    erwarteKeinenFeldfehler(nummer(dialog))
  })
})

describe('Absenden mit Fehlern (AK-6, AK-7)', () => {
  it('zeigt bei Korrektur ohne Nummer und ohne Grund die Zusammenfassung mit zwei Links', async () => {
    const { user, dialog } = await oeffne(MIT)
    await user.clear(nummer(dialog))

    await user.click(speichern(dialog))

    await waitFor(() => expect(zusammenfassung()).toBeDefined())
    expect(zusammenfassungsLinks()).toHaveLength(2)
    expect(api.anfragenMit('PUT')).toHaveLength(0)
  })

  it('stellt die Zusammenfassung vor das erste Feld und fokussiert die Nummer', async () => {
    const { user, dialog } = await oeffne(MIT)
    await user.clear(nummer(dialog))

    await user.click(speichern(dialog))

    await waitFor(() => expect(zusammenfassung()).toBeDefined())
    expect(liegtVor(zusammenfassung() as HTMLElement, nummer(dialog))).toBe(true)
    expect(nummer(dialog)).toHaveFocus()
  })

  it('zeigt bei genau einem Fehler keine Zusammenfassung', async () => {
    const { user, dialog } = await oeffne(OHNE)

    await user.click(speichern(dialog))

    await waitFor(() => erwarteFeldfehler(nummer(dialog), 'Bitte eine Hologrammnummer eingeben.'))
    expect(zusammenfassung()).toBeUndefined()
  })
})

describe('Ladezustand (AK-10)', () => {
  it('zeigt am Speichern-Button den Ladezustand und behält den Fokus', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', PUT, () => offen.promise)
    const { user, dialog } = await oeffne(OHNE)
    await gibEin(user, nummer(dialog), 'XY 99')

    await user.click(speichern(dialog))

    await waitFor(() => erwarteLaedt(speichern(dialog)))
    expect(speichern(dialog)).toHaveFocus()
    offen.aufloesen(hologrammKonfliktAntwort('hologrammnummer_vergeben'))
  })

  it('lässt das Nummernfeld während des Speicherns bedienbar', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', PUT, () => offen.promise)
    const { user, dialog } = await oeffne(OHNE)
    await gibEin(user, nummer(dialog), 'XY 99')

    await user.click(speichern(dialog))

    await waitFor(() => expect(api.anfragenMit('PUT', PUT)).toHaveLength(1))
    expect(nummer(dialog)).not.toBeDisabled()
    offen.aufloesen(hologrammKonfliktAntwort('hologrammnummer_vergeben'))
  })
})
