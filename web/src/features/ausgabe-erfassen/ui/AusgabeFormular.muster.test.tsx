import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import {
  ausgabeKonfliktAntwort,
  erstelleFakeApi,
  offeneAntwort,
  problemAntwort,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
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
import { gibEin } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { AusgabeFormular } from '../index'

// Feature formulare-detailseiten, AK-1 bis AK-8, AK-10 und AK-12 (Abschnitt 4.1, 4.2): Formularmuster für
// „Ausgabe erfassen“. Abschnitte „Exemplar“, „Empfänger“, „Ausgabe“, „Zertifikat“; Pflicht: Name des Empfängers, Datum,
// Gelegenheit, Begründung, Ausgebende Stelle oder Person (Exemplar-Nummer bei „Bestimmte Nummer“).

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const POST = /^\/api\/coins\/[^/]+\/ausgaben$/
const coin = testCoin({ id: COIN_ID, auflage: 150 })
const kennzahlen = { auflage: 150, ausgegeben: 3, verfuegbar: 147 }
const HINWEIS_HOLOGRAMM = 'Nummer des Hologramm-Stickers auf dem Zertifikat. Leerzeichen und Bindestriche sind erlaubt.'
const HILFE_HOLOGRAMM =
  'Kleinbuchstaben werden zu Großbuchstaben. Erlaubt sind A–Z und 0–9, höchstens 40 Zeichen. Die Nummer darf nur einmal vergeben sein.'

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

async function zeige() {
  const user = userEvent.setup()
  zeigeMitRouter(() => <AusgabeFormular coin={coin} kennzahlen={kennzahlen} onErfasst={onErfasst} />, {
    pfad: '/coins/$coinId/ausgaben/neu',
    start: `/coins/${COIN_ID}/ausgaben/neu`,
  })
  await screen.findByRole('button', { name: 'Ausgabe speichern' })
  return user
}

function felder() {
  return {
    naechste: screen.getByRole('radio', { name: 'Nächstes freies Exemplar' }),
    bestimmte: screen.getByRole('radio', { name: 'Bestimmte Nummer' }),
    nummer: screen.getByLabelText(/^Exemplar-Nummer/) as HTMLInputElement,
    name: screen.getByLabelText(/^Name des Empfängers/) as HTMLInputElement,
    dienstgrad: screen.getByLabelText(/^Dienstgrad/) as HTMLInputElement,
    dienststelle: screen.getByLabelText(/^Dienststelle/) as HTMLInputElement,
    datum: screen.getByLabelText(/^Datum/) as HTMLInputElement,
    gelegenheit: screen.getByLabelText(/^Gelegenheit/) as HTMLInputElement,
    begruendung: screen.getByLabelText(/^Begründung/) as HTMLTextAreaElement,
    stelle: screen.getByLabelText(/^Ausgebende Stelle oder Person/) as HTMLInputElement,
    hologramm: screen.getByLabelText(/^Hologrammnummer/) as HTMLInputElement,
    speichern: screen.getByRole('button', { name: 'Ausgabe speichern' }) as HTMLButtonElement,
  }
}

async function fuellePflichtfelder(user: ReturnType<typeof userEvent.setup>) {
  const f = felder()
  await gibEin(user, f.name, 'Testperson A')
  await gibEin(user, f.gelegenheit, 'Truppenbesuch')
  await gibEin(user, f.begruendung, 'Herausragende Leistung')
  await gibEin(user, f.stelle, 'Dienststelle Beispiel')
}

describe('Abschnitte (AK-1)', () => {
  it.each([
    ['Exemplar', ['naechste', 'bestimmte', 'nummer']],
    ['Empfänger', ['name', 'dienstgrad', 'dienststelle']],
    ['Ausgabe', ['datum', 'gelegenheit', 'begruendung', 'stelle']],
    ['Zertifikat', ['hologramm']],
  ] as const)('gliedert die Felder des Abschnitts „%s“', async (abschnitt, namen) => {
    await zeige()

    const gruppe = screen.getByRole('group', { name: abschnitt })
    const f = felder()
    for (const name of namen) expect(gruppe).toContainElement(f[name])
  })

  it('gibt jedem Abschnitt eine Überschrift mit seinem Titel', async () => {
    await zeige()

    for (const name of ['Exemplar', 'Empfänger', 'Ausgabe', 'Zertifikat']) {
      expect(within(screen.getByRole('group', { name })).getByRole('heading', { name })).toBeInTheDocument()
    }
  })
})

describe('Pflicht und optional (AK-2)', () => {
  it('kennzeichnet Name, Datum, Gelegenheit, Begründung und Ausgebende Stelle als Pflicht', async () => {
    await zeige()

    const f = felder()
    for (const feld of [f.name, f.datum, f.gelegenheit, f.begruendung, f.stelle]) erwartePflicht(feld)
  })

  it('kennzeichnet Dienstgrad, Dienststelle und Hologrammnummer als optional', async () => {
    await zeige()

    const f = felder()
    for (const feld of [f.dienstgrad, f.dienststelle, f.hologramm]) erwarteOptional(feld)
  })

  it('kennzeichnet die Exemplar-Nummer bei „Bestimmte Nummer“ als Pflicht', async () => {
    const user = await zeige()

    await user.click(felder().bestimmte)

    erwartePflicht(felder().nummer)
  })
})

describe('Hilfetexte (AK-3)', () => {
  it('beschreibt die Exemplar-Nummer mit „Zwischen 1 und {Auflage}.“', async () => {
    const user = await zeige()
    await user.click(felder().bestimmte)

    expect(felder().nummer).toHaveAccessibleDescription(expect.stringContaining('Zwischen 1 und 150.'))
  })

  it('behält den Hinweis zur Hologrammnummer und ergänzt die Regeln', async () => {
    await zeige()

    const beschreibung = felder().hologramm.getAttribute('aria-describedby') ?? ''
    const text = beschreibung
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
    expect(text).toContain(HINWEIS_HOLOGRAMM)
    expect(text).toContain(HILFE_HOLOGRAMM)
  })

  it('behält den Hinweis „z. B. Truppenbesuch, Verabschiedung“ an der Gelegenheit', async () => {
    await zeige()

    expect(felder().gelegenheit).toHaveAccessibleDescription(
      expect.stringContaining('z. B. Truppenbesuch, Verabschiedung'),
    )
  })
})

describe('Validierung beim Verlassen (AK-4, AK-5)', () => {
  it('zeigt beim Verlassen des leeren, unberührten Namens keinen Fehler', async () => {
    const user = await zeige()

    await user.click(felder().name)
    await user.tab()

    erwarteKeinenFeldfehler(felder().name)
  })

  it('zeigt nach ungültiger Hologrammnummer und Verlassen die bestehende Meldung', async () => {
    const user = await zeige()

    await user.type(felder().hologramm, 'AB_12')
    erwarteKeinenFeldfehler(felder().hologramm)
    await user.tab()

    erwarteFeldfehler(
      felder().hologramm,
      'Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.',
    )
  })

  it('entfernt den Fehler bei der Eingabe, sobald die Hologrammnummer gültig ist', async () => {
    const user = await zeige()
    await user.type(felder().hologramm, 'AB_12')
    await user.tab()

    await user.clear(felder().hologramm)
    await user.type(felder().hologramm, 'AB 12')

    erwarteKeinenFeldfehler(felder().hologramm)
  })

  it('zeigt nach Leeren eines geänderten Pflichtfelds und Verlassen den Fehler', async () => {
    const user = await zeige()

    await user.type(felder().gelegenheit, 'X')
    await user.clear(felder().gelegenheit)
    await user.tab()

    erwarteFeldfehler(felder().gelegenheit, 'Gelegenheit ist erforderlich.')
  })
})

describe('Absenden mit Fehlern (AK-6, AK-7)', () => {
  it('fokussiert nach 409 exemplar_ausgegeben das Feld Exemplar-Nummer', async () => {
    api.einmal('POST', POST, ausgabeKonfliktAntwort('exemplar_ausgegeben', 'Exemplar Nr. 12 ist bereits ausgegeben.'))
    const user = await zeige()
    await user.click(felder().bestimmte)
    await gibEin(user, felder().nummer, '12')
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await waitFor(() => erwarteFeldfehler(felder().nummer, 'Exemplar Nr. 12 ist bereits ausgegeben.'))
    expect(felder().nummer).toHaveFocus()
  })

  it('zeigt bei leerem Absenden die Zusammenfassung oben mit je Fehler einem Link', async () => {
    const user = await zeige()

    await user.click(felder().speichern)

    await waitFor(() => expect(zusammenfassung()).toBeDefined())
    const links = zusammenfassungsLinks()
    expect(links).toHaveLength(4)
    expect(links[0]).toMatch(/^Name des Empfängers\b.*: Name des Empfängers ist erforderlich\.$/)
    expect(liegtVor(zusammenfassung() as HTMLElement, ersterAbschnitt(felder().name))).toBe(true)
  })

  it('fokussiert beim leeren Absenden den Namen des Empfängers (erstes Feld in Reihenfolge)', async () => {
    const user = await zeige()

    await user.click(felder().speichern)

    await waitFor(() => expect(felder().name).toHaveFocus())
  })

  it('fokussiert per Link der Zusammenfassung die Begründung', async () => {
    const user = await zeige()
    await user.click(felder().speichern)
    await waitFor(() => expect(zusammenfassung()).toBeDefined())

    const link = within(zusammenfassung() as HTMLElement)
      .getAllByRole('link')
      .find((l) => l.textContent?.includes('Begründung ist erforderlich.')) as HTMLElement
    await user.click(link)

    expect(felder().begruendung).toHaveFocus()
  })
})

describe('Formularmeldungen oben (AK-8)', () => {
  it('zeigt „Alle Exemplare dieses Coins sind ausgegeben.“ oben im Formular und behält die Eingaben', async () => {
    api.einmal('POST', POST, ausgabeKonfliktAntwort('kein_exemplar_frei'))
    const user = await zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await waitFor(() => erwarteMeldungOben('Alle Exemplare dieses Coins sind ausgegeben.', felder().name))
    expect(felder().name).toHaveValue('Testperson A')
  })
})

describe('Ladezustand und Doppelklick (AK-10)', () => {
  it('zeigt am Speichern-Button den Ladezustand und behält den Fokus', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)
    const user = await zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await waitFor(() => erwarteLaedt(felder().speichern))
    expect(felder().speichern).toHaveFocus()
    offen.aufloesen(problemAntwort(500))
  })

  it('sendet bei zweimal Enter genau einen POST', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)
    const user = await zeige()
    await fuellePflichtfelder(user)

    await user.type(felder().name, '{Enter}{Enter}')

    await waitFor(() => expect(api.anfragenMit('POST', POST)).toHaveLength(1))
    offen.aufloesen(problemAntwort(500))
  })
})

describe('Fachverhalten unverändert (AK-12)', () => {
  it('sendet denselben POST-Body wie bisher', async () => {
    const user = await zeige()
    await fuellePflichtfelder(user)
    await gibEin(user, felder().dienstgrad, 'Hauptmann')

    await user.click(felder().speichern)

    await waitFor(() => expect(onErfasst).toHaveBeenCalledTimes(1))
    expect(api.anfragenMit('POST', POST)[0].body).toEqual({
      exemplarNummer: null,
      empfaengerName: 'Testperson A',
      empfaengerDienstgrad: 'Hauptmann',
      empfaengerDienststelle: null,
      datum: '2026-10-08',
      gelegenheit: 'Truppenbesuch',
      begruendung: 'Herausragende Leistung',
      ausgebendeStelle: 'Dienststelle Beispiel',
    })
  })
})
