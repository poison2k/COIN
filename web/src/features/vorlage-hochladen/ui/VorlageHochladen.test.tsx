import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VorlagenStatus } from '@/entities/zertifikatsvorlage'
import {
  erstelleFakeApi,
  keinZugriffAntwort,
  offeneAntwort,
  problemAntwort,
  testCoin,
  testDatei,
  type FakeApi,
} from '../../../../test/fakeApi'
import { seitentext } from '../../../../test/hilfen'
import { VorlageHochladen } from '../index'

// Feature zertifikatsvorlagen, AK-30 und AK-33: Dateifeld „Word-Vorlage (.docx)“ mit Hinweisen, Button
// „Vorlage hochladen“ (Sende-Sperre), clientseitige Vorprüfung (Endung, Größe) ohne Request, Ablehnung als Alarm mit
// Liste aller Meldungen (als Text) und Fokus darauf. Props { coinId, onHochgeladen(status) }.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000a1'
const POST = /^\/api\/coins\/[^/]+\/zertifikatsvorlage\/versionen$/
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const HINWEIS_DATEI =
  'Nur Word-Dokumente (.docx) ohne Makros, Kommentare und nachverfolgte Änderungen, höchstens 5 MB. Alle Pflichtplatzhalter müssen enthalten sein.'
const HINWEIS_BEREINIGUNG = 'Autor und weitere Dokumenteigenschaften werden beim Hochladen entfernt.'
const ABGELEHNT = 'Die Vorlage wurde nicht übernommen:'

let api: FakeApi
let onHochgeladen: ReturnType<typeof vi.fn<(status: VorlagenStatus) => void>>

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID })])
  vi.stubGlobal('fetch', api.fetch)
  onHochgeladen = vi.fn<(status: VorlagenStatus) => void>()
})

function zeige() {
  // applyAccept: false, damit auch unpassende Dateien im Feld landen (wie bei „Alle Dateien“ im Dateidialog).
  const user = userEvent.setup({ applyAccept: false })
  render(<VorlageHochladen coinId={COIN_ID} onHochgeladen={onHochgeladen} />)
  return { user }
}

const feld = () => screen.getByLabelText('Word-Vorlage (.docx)') as HTMLInputElement
const knopf = () => screen.getByRole('button', { name: 'Vorlage hochladen' }) as HTMLButtonElement
const uploads = () => api.anfragenMit('POST', POST)

async function hochladen(user: ReturnType<typeof userEvent.setup>, datei = testDatei(DOCX, 2048, 'urkunde.docx')) {
  await user.upload(feld(), datei)
  await user.click(knopf())
}

describe('Aufbau', () => {
  it('hat ein Dateifeld mit dem sichtbaren Label „Word-Vorlage (.docx)“', () => {
    zeige()

    expect(feld()).toHaveAttribute('type', 'file')
  })

  it('nimmt laut accept nur .docx an', () => {
    zeige()

    expect(feld()).toHaveAttribute('accept', ACCEPT)
  })

  it('beschreibt das Dateifeld mit dem Hinweis zu Format, Größe und Platzhaltern', () => {
    zeige()

    expect(feld()).toHaveAccessibleDescription(expect.stringContaining(HINWEIS_DATEI))
  })

  it('beschreibt das Dateifeld mit dem Hinweis zur Bereinigung', () => {
    zeige()

    expect(feld()).toHaveAccessibleDescription(expect.stringContaining(HINWEIS_BEREINIGUNG))
  })

  it('hat den Button „Vorlage hochladen“', () => {
    zeige()

    expect(knopf()).toBeInTheDocument()
  })

  it('erreicht Dateifeld und Button per Tastatur in dieser Reihenfolge', async () => {
    const { user } = zeige()

    await user.tab()
    expect(feld()).toHaveFocus()
    await user.tab()
    expect(knopf()).toHaveFocus()
  })

  it('zeigt keine englischen Texte', () => {
    zeige()

    expect(seitentext()).not.toMatch(/\b(Upload|Browse|Choose|No file|Submit|Template)\b/)
  })
})

describe('Erfolg', () => {
  it('sendet genau einen Upload mit der gewählten Datei', async () => {
    const { user } = zeige()

    await hochladen(user)

    await waitFor(() => expect(uploads()).toHaveLength(1))
    expect(((uploads()[0].body as FormData).get('datei') as File).name).toBe('urkunde.docx')
  })

  it('meldet den neuen Status an onHochgeladen', async () => {
    const { user } = zeige()

    await hochladen(user)

    await waitFor(() => expect(onHochgeladen).toHaveBeenCalledTimes(1))
    expect(onHochgeladen.mock.calls[0][0]).toMatchObject({ quelle: 'eigene', aktiveVersion: 1 })
  })

  it('leert das Dateifeld nach dem Upload', async () => {
    const { user } = zeige()

    await hochladen(user)

    await waitFor(() => expect(onHochgeladen).toHaveBeenCalled())
    expect(feld().value).toBe('')
    expect(feld().files?.length ?? 0).toBe(0)
  })

  it('sperrt den Button während des Hochladens und sendet bei Doppelklick nur einmal', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)
    const { user } = zeige()
    await user.upload(feld(), testDatei(DOCX, 2048, 'urkunde.docx'))

    await user.click(knopf())
    await user.click(knopf())

    expect(knopf().disabled || knopf().getAttribute('aria-disabled') === 'true').toBe(true)
    expect(uploads()).toHaveLength(1)
    offen.aufloesen(problemAntwort(400, { errors: { datei: ['x'] } }))
  })
})

describe('clientseitige Vorprüfung (kein Request)', () => {
  it.each([
    ['urkunde.pdf', 2048, 'Die Datei ist kein Word-Dokument im Format .docx.'],
    ['urkunde.doc', 2048, 'Die Datei ist kein Word-Dokument im Format .docx.'],
    ['urkunde.docx', 5_242_881, 'Die Vorlage darf höchstens 5 MB groß sein.'],
  ])('meldet für %s (%i Bytes) „%s“ ohne Request', async (name, groesse, meldung) => {
    const { user } = zeige()

    await hochladen(user, testDatei(DOCX, groesse, name))

    await waitFor(() => expect(seitentext()).toContain(meldung))
    expect(uploads()).toHaveLength(0)
  })

  it('markiert das Dateifeld bei einem Fehler mit aria-invalid und beschreibt den Fehler', async () => {
    const { user } = zeige()

    await hochladen(user, testDatei('application/pdf', 2048, 'urkunde.pdf'))

    await waitFor(() => expect(feld()).toHaveAttribute('aria-invalid', 'true'))
    expect(feld()).toHaveAccessibleDescription(
      expect.stringContaining('Die Datei ist kein Word-Dokument im Format .docx.'),
    )
  })

  it('sendet ohne gewählte Datei keinen Request', async () => {
    const { user } = zeige()

    await user.click(knopf())

    expect(uploads()).toHaveLength(0)
    expect(onHochgeladen).not.toHaveBeenCalled()
  })
})

describe('Ablehnung durch den Server', () => {
  const MELDUNGEN = [
    'Es fehlen Pflichtplatzhalter: {{Zertifikat.Nummer}}.',
    'Unbekannte Platzhalter: {{Empfaenger.Nam}}. Erlaubt sind nur die Platzhalter aus der Standardvorlage.',
  ]

  async function ablehnen(meldungen: string[] = MELDUNGEN) {
    api.einmal('POST', POST, problemAntwort(400, { title: 'Eingaben ungültig', errors: { datei: meldungen } }))
    const { user } = zeige()
    await hochladen(user)
    return screen.findByRole('alert')
  }

  it('zeigt einen Alarm mit „Die Vorlage wurde nicht übernommen:“', async () => {
    const alarm = await ablehnen()

    expect(alarm).toHaveTextContent(ABGELEHNT)
  })

  it('listet alle Meldungen aus errors.datei als Liste', async () => {
    const alarm = await ablehnen()

    const eintraege = within(within(alarm).getByRole('list')).getAllByRole('listitem')
    expect(eintraege.map((li) => li.textContent?.trim())).toEqual(MELDUNGEN)
  })

  it('setzt den Fokus auf den Alarm', async () => {
    const alarm = await ablehnen()

    await waitFor(() => expect(alarm).toHaveFocus())
  })

  it('rendert Meldungen als Text, nie als HTML', async () => {
    const alarm = await ablehnen(['Unvollständige Platzhalter: „<img src=x onerror=alert(1)>“.'])

    expect(alarm).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(alarm.querySelector('img')).toBeNull()
  })

  it('ruft onHochgeladen nicht auf', async () => {
    await ablehnen()

    expect(onHochgeladen).not.toHaveBeenCalled()
  })

  it('zeigt bei 413 „Die Vorlage darf höchstens 5 MB groß sein.“', async () => {
    api.einmal('POST', POST, problemAntwort(413, { title: 'Vorlage zu groß' }))
    const { user } = zeige()

    await hochladen(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Die Vorlage darf höchstens 5 MB groß sein.')
  })

  it('zeigt bei 403 für Deaktivierte „Ihr Benutzerkonto ist deaktiviert.“', async () => {
    api.einmal('POST', POST, keinZugriffAntwort('benutzer_deaktiviert'))
    const { user } = zeige()

    await hochladen(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Ihr Benutzerkonto ist deaktiviert.')
  })

  it('gibt den Button nach der Ablehnung wieder frei', async () => {
    await ablehnen()

    await waitFor(() => expect(knopf().disabled || knopf().getAttribute('aria-disabled') === 'true').toBe(false))
  })
})

// Rev. 3, AK-30: onUploadBeginnt() wird beim Absenden aufgerufen, bevor der Request startet, damit das Widget alte
// Meldungen entfernt. Die Prop wird lose übergeben, damit der Test schon vor der Umsetzung übersetzt wird.
describe('onUploadBeginnt (Rev. 3)', () => {
  function zeigeMitBeginn(onUploadBeginnt: () => void) {
    const user = userEvent.setup({ applyAccept: false })
    const props = { coinId: COIN_ID, onHochgeladen, onUploadBeginnt } as unknown as ComponentProps<
      typeof VorlageHochladen
    >
    render(<VorlageHochladen {...props} />)
    return { user }
  }

  it('ruft onUploadBeginnt beim Absenden auf, bevor die Antwort da ist', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)
    const onUploadBeginnt = vi.fn()
    const { user } = zeigeMitBeginn(onUploadBeginnt)

    await hochladen(user)

    await waitFor(() => expect(onUploadBeginnt).toHaveBeenCalledTimes(1))
    expect(onHochgeladen).not.toHaveBeenCalled()
    offen.aufloesen(problemAntwort(500))
  })

  it('ruft onUploadBeginnt vor dem Request auf', async () => {
    const reihenfolge: string[] = []
    const onUploadBeginnt = vi.fn(() => reihenfolge.push('beginnt'))
    const fetchOriginal = api.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn((...argumente: Parameters<typeof fetch>) => {
        reihenfolge.push('request')
        return fetchOriginal(...argumente)
      }),
    )
    const { user } = zeigeMitBeginn(onUploadBeginnt)

    await hochladen(user)

    await waitFor(() => expect(reihenfolge).toContain('request'))
    expect(reihenfolge[0]).toBe('beginnt')
  })

  it('entfernt die Fehlerliste eines früheren Uploads beim Absenden, bevor die neue Antwort da ist', async () => {
    api.einmal(
      'POST',
      POST,
      problemAntwort(400, {
        errors: { datei: ['Die Datei enthält Makros. Bitte als Word-Dokument ohne Makros (.docx) speichern.'] },
      }),
    )
    const { user } = zeigeMitBeginn(vi.fn())
    await hochladen(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(ABGELEHNT)
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)

    await hochladen(user, testDatei(DOCX, 2048, 'zweite.docx'))

    await waitFor(() => expect(seitentext()).not.toContain(ABGELEHNT))
    offen.aufloesen(problemAntwort(500))
  })
})
