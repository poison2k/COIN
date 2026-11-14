import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import { erstelleFakeApi, offeneAntwort, problemAntwort, type FakeApi } from '../../../../test/fakeApi'
import {
  erwarteFeldfehler,
  erwarteKeinenFeldfehler,
  erwarteLaedt,
  erwarteMeldungOben,
  erwarteOptional,
  erwartePflicht,
  ersterAbschnitt,
  liegtVor,
  zusammenfassung,
  zusammenfassungsLinks,
} from '../../../../test/formular'
import { formularFelder, gibEin, TEXTE } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinFormular } from './CoinFormular'

// Feature formulare-detailseiten, AK-1 bis AK-8, AK-10 und AK-12 (Abschnitt 4.1, 4.2): Formularmuster für
// „Coin anlegen“. Abschnitte „Stammdaten“ (Name, Herausgeber, Auflage, Beschreibung) und „Motivbild“; Pflicht: Name,
// Herausgeber. Die Seite liefert „Abbrechen“; hier wird das Formular selbst geprüft (im Router, falls es Links rendert).

type OnAngelegt = (coin: Coin, ergebnis: { bild: 'gespeichert' | 'ohne' }) => void

const HILFE_AUFLAGE = 'Ganze Zahl von 1 bis 1.000.000. Ohne Angabe sind noch keine Ausgaben möglich.'
const HILFE_BESCHREIBUNG = 'Höchstens 2.000 Zeichen.'

let api: FakeApi
let onAngelegt: ReturnType<typeof vi.fn<OnAngelegt>>

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
  onAngelegt = vi.fn<OnAngelegt>()
})

async function zeige() {
  const user = userEvent.setup({ applyAccept: false })
  zeigeMitRouter(() => <CoinFormular onAngelegt={onAngelegt} />, { pfad: '/coins/neu' })
  await screen.findByRole('button', { name: 'Coin anlegen' })
  return user
}

describe('Abschnitte (AK-1)', () => {
  it('gliedert Name, Herausgeber, Auflage und Beschreibung in den Abschnitt „Stammdaten“', async () => {
    await zeige()

    const gruppe = screen.getByRole('group', { name: 'Stammdaten' })
    const f = formularFelder()
    for (const feld of [f.name, f.herausgeber, f.auflage, f.beschreibung]) expect(gruppe).toContainElement(feld)
  })

  it('stellt das Motivbild in den Abschnitt „Motivbild“', async () => {
    await zeige()

    expect(screen.getByRole('group', { name: 'Motivbild' })).toContainElement(formularFelder().motivbild)
  })

  it('gibt jedem Abschnitt eine Überschrift', async () => {
    await zeige()

    for (const name of ['Stammdaten', 'Motivbild']) {
      expect(within(screen.getByRole('group', { name })).getByRole('heading', { name })).toBeInTheDocument()
    }
  })
})

describe('Pflicht und optional (AK-2)', () => {
  it('kennzeichnet Name und Herausgeber als Pflicht', async () => {
    await zeige()

    erwartePflicht(formularFelder().name)
    erwartePflicht(formularFelder().herausgeber)
  })

  it('kennzeichnet Auflage, Beschreibung und Motivbild als optional', async () => {
    await zeige()

    erwarteOptional(formularFelder().auflage)
    erwarteOptional(formularFelder().beschreibung)
    erwarteOptional(formularFelder().motivbild)
  })
})

describe('Hilfetexte (AK-3)', () => {
  it('beschreibt die Auflage mit dem neuen Hilfetext', async () => {
    await zeige()

    expect(formularFelder().auflage).toHaveAccessibleDescription(expect.stringContaining(HILFE_AUFLAGE))
  })

  it('beschreibt die Beschreibung mit „Höchstens 2.000 Zeichen.“', async () => {
    await zeige()

    expect(formularFelder().beschreibung).toHaveAccessibleDescription(expect.stringContaining(HILFE_BESCHREIBUNG))
  })

  it('behält den bestehenden Hinweis zu Bild-Metadaten wortgleich', async () => {
    await zeige()

    expect(formularFelder().motivbild).toHaveAccessibleDescription(expect.stringContaining(TEXTE.exifHinweis))
  })
})

describe('Validierung beim Verlassen (AK-4, AK-5)', () => {
  it('zeigt beim Verlassen des leeren, unberührten Namens keinen Fehler', async () => {
    const user = await zeige()

    await user.click(formularFelder().name)
    await user.tab()

    erwarteKeinenFeldfehler(formularFelder().name)
  })

  it('zeigt vor dem Verlassen keinen Fehler, auch wenn die Auflage schon ungültig ist', async () => {
    const user = await zeige()

    await user.type(formularFelder().auflage, 'abc')

    erwarteKeinenFeldfehler(formularFelder().auflage)
  })

  it('zeigt nach ungültiger Auflage und Verlassen „Auflage muss eine ganze Zahl sein.“', async () => {
    const user = await zeige()

    await user.type(formularFelder().auflage, 'abc')
    await user.tab()

    erwarteFeldfehler(formularFelder().auflage, 'Auflage muss eine ganze Zahl sein.')
  })

  it('entfernt den Fehler bei der Eingabe, sobald die Auflage gültig ist', async () => {
    const user = await zeige()
    await user.type(formularFelder().auflage, 'abc')
    await user.tab()

    await user.clear(formularFelder().auflage)
    await user.type(formularFelder().auflage, '100')

    erwarteKeinenFeldfehler(formularFelder().auflage)
  })

  it('lässt einen Server-Feldfehler stehen, bis das Feld geändert wird', async () => {
    api.einmal(
      'POST',
      /^\/api\/coins$/,
      problemAntwort(400, { title: 'Eingaben ungültig', errors: { name: ['Name ist zu lang.'] } }),
    )
    const user = await zeige()
    await gibEin(user, formularFelder().name, 'Coin Alpha')
    await gibEin(user, formularFelder().herausgeber, 'Herausgeber Beta')
    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))
    await waitFor(() => erwarteFeldfehler(formularFelder().name, 'Name ist zu lang.'))

    await user.click(formularFelder().herausgeber)
    await user.click(formularFelder().name)
    await user.tab()
    erwarteFeldfehler(formularFelder().name, 'Name ist zu lang.')

    await user.type(formularFelder().name, 'X')
    erwarteKeinenFeldfehler(formularFelder().name)
  })
})

describe('Absenden mit Fehlern (AK-6, AK-7)', () => {
  it('sendet beim leeren Absenden keinen Request', async () => {
    const user = await zeige()

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    expect(api.anfragenMit('POST')).toHaveLength(0)
  })

  it('fokussiert das erste fehlerhafte Feld (Name)', async () => {
    const user = await zeige()

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    await waitFor(() => expect(formularFelder().name).toHaveFocus())
  })

  it('fokussiert in Formularreihenfolge (Herausgeber, wenn der Name gültig ist)', async () => {
    const user = await zeige()
    await gibEin(user, formularFelder().name, 'Coin Alpha')

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    await waitFor(() => expect(formularFelder().herausgeber).toHaveFocus())
  })

  it('fokussiert nach einem Server-Feldfehler (400) das Feld', async () => {
    api.einmal(
      'POST',
      /^\/api\/coins$/,
      problemAntwort(400, { title: 'Eingaben ungültig', errors: { herausgeber: ['Herausgeber ist zu lang.'] } }),
    )
    const user = await zeige()
    await gibEin(user, formularFelder().name, 'Coin Alpha')
    await gibEin(user, formularFelder().herausgeber, 'Herausgeber Beta')

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    await waitFor(() => expect(formularFelder().herausgeber).toHaveFocus())
  })

  it('zeigt ab zwei Feldfehlern die Zusammenfassung mit je einem Link „<Label>: <Meldung>“', async () => {
    const user = await zeige()

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    await waitFor(() => expect(zusammenfassung()).toBeDefined())
    const links = zusammenfassungsLinks()
    expect(links).toHaveLength(2)
    expect(links[0]).toMatch(/^Name\b.*: Name ist erforderlich\.$/)
    expect(links[1]).toMatch(/^Herausgeber\b.*: Herausgeber ist erforderlich\.$/)
  })

  it('stellt die Zusammenfassung vor den ersten Abschnitt', async () => {
    const user = await zeige()

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    await waitFor(() => expect(zusammenfassung()).toBeDefined())
    expect(liegtVor(zusammenfassung() as HTMLElement, ersterAbschnitt(formularFelder().name))).toBe(true)
  })

  it('fokussiert über den Link der Zusammenfassung das Feld', async () => {
    const user = await zeige()
    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))
    await waitFor(() => expect(zusammenfassung()).toBeDefined())

    await user.click(within(zusammenfassung() as HTMLElement).getAllByRole('link')[1])

    expect(formularFelder().herausgeber).toHaveFocus()
  })

  it('zeigt bei genau einem Feldfehler keine Zusammenfassung', async () => {
    const user = await zeige()
    await gibEin(user, formularFelder().name, 'Coin Alpha')

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    await waitFor(() => erwarteFeldfehler(formularFelder().herausgeber, 'Herausgeber ist erforderlich.'))
    expect(zusammenfassung()).toBeUndefined()
  })
})

describe('Formularmeldungen oben (AK-8)', () => {
  it('zeigt den Konflikt mit unverändertem Text oben im Formular', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(409, { title: 'Konflikt' }))
    const user = await zeige()
    await gibEin(user, formularFelder().name, 'Coin Alpha')
    await gibEin(user, formularFelder().herausgeber, 'Herausgeber Beta')

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    await waitFor(() => erwarteMeldungOben(TEXTE.konflikt, formularFelder().name))
  })

  it('behält nach dem Konflikt die Eingaben', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(409, { title: 'Konflikt' }))
    const user = await zeige()
    await gibEin(user, formularFelder().name, 'Coin Alpha')
    await gibEin(user, formularFelder().herausgeber, 'Herausgeber Beta')

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    await waitFor(() => expect(screen.getByText(TEXTE.konflikt)).toBeInTheDocument())
    expect(formularFelder().name).toHaveValue('Coin Alpha')
    expect(formularFelder().herausgeber).toHaveValue('Herausgeber Beta')
  })
})

describe('Ladezustand und Doppelklick (AK-10)', () => {
  it('zeigt beim Speichern den Ladezustand, Name und Fokus bleiben', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', /^\/api\/coins$/, () => offen.promise)
    const user = await zeige()
    await gibEin(user, formularFelder().name, 'Coin Alpha')
    await gibEin(user, formularFelder().herausgeber, 'Herausgeber Beta')

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    const knopf = screen.getByRole('button', { name: 'Coin anlegen' })
    await waitFor(() => erwarteLaedt(knopf))
    expect(knopf).toHaveFocus()
    offen.aufloesen(problemAntwort(409))
  })

  it('blendet den Spinner für Screenreader aus', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', /^\/api\/coins$/, () => offen.promise)
    const user = await zeige()
    await gibEin(user, formularFelder().name, 'Coin Alpha')
    await gibEin(user, formularFelder().herausgeber, 'Herausgeber Beta')

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    const knopf = screen.getByRole('button', { name: 'Coin anlegen' })
    await waitFor(() => expect(knopf).toHaveAttribute('aria-busy', 'true'))
    expect([...knopf.querySelectorAll('svg')].every((s) => s.closest('[aria-hidden="true"]') !== null)).toBe(true)
    offen.aufloesen(problemAntwort(409))
  })

  it('sendet bei zweimal Enter genau einen Request', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', /^\/api\/coins$/, () => offen.promise)
    const user = await zeige()
    await gibEin(user, formularFelder().name, 'Coin Alpha')
    await gibEin(user, formularFelder().herausgeber, 'Herausgeber Beta')

    await user.click(formularFelder().herausgeber)
    await user.keyboard('{Enter}{Enter}')

    await waitFor(() => expect(api.anfragenMit('POST')).toHaveLength(1))
    offen.aufloesen(problemAntwort(409))
    await waitFor(() => expect(screen.getByText(TEXTE.konflikt)).toBeInTheDocument())
    expect(api.anfragenMit('POST')).toHaveLength(1)
  })

  it('lässt die Felder während des Sendens bedienbar (nicht gesperrt)', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', /^\/api\/coins$/, () => offen.promise)
    const user = await zeige()
    await gibEin(user, formularFelder().name, 'Coin Alpha')
    await gibEin(user, formularFelder().herausgeber, 'Herausgeber Beta')

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    await waitFor(() => expect(api.anfragenMit('POST')).toHaveLength(1))
    expect(formularFelder().name).not.toBeDisabled()
    offen.aufloesen(problemAntwort(409))
  })
})

describe('Fachverhalten unverändert (AK-12)', () => {
  it('sendet für dieselben Eingaben denselben POST-Body', async () => {
    const user = await zeige()
    await gibEin(user, formularFelder().name, '  Coin Alpha ')
    await gibEin(user, formularFelder().herausgeber, 'Herausgeber Beta')
    await gibEin(user, formularFelder().auflage, '250')
    await gibEin(user, formularFelder().beschreibung, 'Text')

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    await waitFor(() => expect(onAngelegt).toHaveBeenCalledTimes(1))
    expect(api.anfragenMit('POST', /^\/api\/coins$/)[0].body).toEqual({
      name: 'Coin Alpha',
      herausgeber: 'Herausgeber Beta',
      auflage: 250,
      beschreibung: 'Text',
    })
  })
})
