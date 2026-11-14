import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VorlagenStatus } from '@/entities/zertifikatsvorlage'
import {
  erstelleFakeApi,
  offeneAntwort,
  problemAntwort,
  testCoin,
  testDatei,
  type FakeApi,
} from '../../../../test/fakeApi'
import { erwarteFeldfehler, erwarteLaedt, liegtVor } from '../../../../test/formular'
import { zeigeMitRouter } from '../../../../test/router'
import { VorlageHochladen } from '../index'

// Feature formulare-detailseiten, AK-1, AK-3, AK-5, AK-6, AK-8 und AK-10 (Abschnitt 4.1, 4.2): Formularmuster für
// „Vorlage hochladen“. Abschnitt „Neue Version hochladen“ mit dem Dateifeld „Word-Vorlage (.docx)“; bestehende Hinweise
// plus Hinweis zu Platzhaltern; Hauptaktion „Vorlage hochladen“, kein Abbrechen.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000a1'
const POST = /^\/api\/coins\/[^/]+\/zertifikatsvorlage\/versionen$/
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const HINWEIS_DATEI =
  'Nur Word-Dokumente (.docx) ohne Makros, Kommentare und nachverfolgte Änderungen, höchstens 5 MB. Alle Pflichtplatzhalter müssen enthalten sein.'
const HINWEIS_BEREINIGUNG = 'Autor und weitere Dokumenteigenschaften werden beim Hochladen entfernt.'
const HINWEIS_PLATZHALTER =
  'Platzhalter haben die Form {{Gruppe.Feld}}, z. B. {{Zertifikat.Nummer}}. Die Liste aller Platzhalter steht in der Standardvorlage.'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID })])
  vi.stubGlobal('fetch', api.fetch)
})

async function zeige() {
  const user = userEvent.setup({ applyAccept: false })
  zeigeMitRouter(
    () => <VorlageHochladen coinId={COIN_ID} onHochgeladen={vi.fn<(status: VorlagenStatus) => void>()} />,
    { pfad: '/coins/$coinId', start: `/coins/${COIN_ID}` },
  )
  await screen.findByRole('button', { name: 'Vorlage hochladen' })
  return user
}

const feld = () => screen.getByLabelText(/^Word-Vorlage \(\.docx\)/) as HTMLInputElement
const knopf = () => screen.getByRole('button', { name: 'Vorlage hochladen' })

function beschreibungstext(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

describe('Abschnitt (AK-1)', () => {
  it('stellt das Dateifeld in den Abschnitt „Neue Version hochladen“', async () => {
    await zeige()

    expect(screen.getByRole('group', { name: 'Neue Version hochladen' })).toContainElement(feld())
  })

  it('gibt dem Abschnitt eine Überschrift', async () => {
    await zeige()

    const gruppe = screen.getByRole('group', { name: 'Neue Version hochladen' })
    expect(within(gruppe).getByRole('heading', { name: 'Neue Version hochladen' })).toBeInTheDocument()
  })

  it('bietet kein „Abbrechen“ an', async () => {
    await zeige()

    expect(screen.queryByRole('link', { name: 'Abbrechen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abbrechen' })).not.toBeInTheDocument()
  })
})

describe('Hilfetexte (AK-3)', () => {
  it('behält die bestehenden Hinweise wortgleich', async () => {
    await zeige()

    const text = beschreibungstext(feld())
    expect(text).toContain(HINWEIS_DATEI)
    expect(text).toContain(HINWEIS_BEREINIGUNG)
  })

  it('ergänzt den Hinweis zu den Platzhaltern', async () => {
    await zeige()

    expect(beschreibungstext(feld())).toContain(HINWEIS_PLATZHALTER)
  })
})

describe('Validierung (AK-5, AK-6)', () => {
  it('zeigt nach Wahl einer falschen Datei und Verlassen die bestehende Meldung', async () => {
    const user = await zeige()

    await user.upload(feld(), testDatei('application/pdf', 100, 'urkunde.pdf'))
    await user.tab()

    erwarteFeldfehler(feld(), 'Die Datei ist kein Word-Dokument im Format .docx.')
  })

  it('sendet ohne Datei nichts und fokussiert das Dateifeld', async () => {
    const user = await zeige()

    await user.click(knopf())

    await waitFor(() => erwarteFeldfehler(feld(), 'Bitte eine Word-Vorlage (.docx) auswählen.'))
    expect(feld()).toHaveFocus()
    expect(api.anfragenMit('POST', POST)).toHaveLength(0)
  })
})

describe('Formularmeldung oben (AK-8)', () => {
  it('zeigt die Ablehnung des Servers oben im Formular vor dem Abschnitt', async () => {
    api.einmal(
      'POST',
      POST,
      problemAntwort(400, {
        title: 'Eingaben ungültig',
        errors: { datei: ['Es fehlen Pflichtplatzhalter: {{Zertifikat.Nummer}}.'] },
      }),
    )
    const user = await zeige()
    await user.upload(feld(), testDatei(DOCX, 2048, 'urkunde.docx'))

    await user.click(knopf())

    const alarm = await screen.findByRole('alert')
    expect(alarm).toHaveTextContent('Die Vorlage wurde nicht übernommen:')
    expect(liegtVor(alarm, screen.getByRole('group', { name: 'Neue Version hochladen' }))).toBe(true)
  })
})

describe('Ladezustand und Doppelklick (AK-10)', () => {
  it('zeigt am Button den Ladezustand und behält den Fokus', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)
    const user = await zeige()
    await user.upload(feld(), testDatei(DOCX, 2048, 'urkunde.docx'))

    await user.click(knopf())

    await waitFor(() => erwarteLaedt(knopf()))
    expect(knopf()).toHaveFocus()
    offen.aufloesen(problemAntwort(500))
  })

  it('sendet bei Doppelklick genau einen Upload', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)
    const user = await zeige()
    await user.upload(feld(), testDatei(DOCX, 2048, 'urkunde.docx'))

    await user.dblClick(knopf())

    expect(api.anfragenMit('POST', POST)).toHaveLength(1)
    offen.aufloesen(problemAntwort(500))
  })
})
