import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import { beobachteDownloads } from '../../../../test/downloads'
import { erstelleFakeApi, offeneAntwort, problemAntwort, docxAntwort, type FakeApi } from '../../../../test/fakeApi'
import { seitentext } from '../../../../test/hilfen'
import { StandardvorlageHerunterladen } from '../index'

// Feature zertifikatsvorlagen, AK-30 und AK-31: Button „Standardvorlage herunterladen“ lädt per fetch mit Token und
// speichert „zertifikatsvorlage-standard.docx“; währenddessen gesperrt; Fehler als Alarm. Kein Token in der URL.

const STANDARD = /^\/api\/zertifikatsvorlagen\/standard$/
const FEHLER = 'Die Vorlage konnte nicht heruntergeladen werden. Bitte später erneut versuchen.'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
  setzeTokenQuelle(() => 'token-standard')
})

afterEach(() => {
  setzeTokenQuelle(null)
})

function zeige() {
  const user = userEvent.setup()
  render(<StandardvorlageHerunterladen />)
  return { user }
}

const knopf = () => screen.getByRole('button', { name: 'Standardvorlage herunterladen' }) as HTMLButtonElement

describe('StandardvorlageHerunterladen', () => {
  it('sendet vor dem Klick keinen Request', () => {
    zeige()

    expect(api.anfragen).toHaveLength(0)
  })

  it('lädt GET /api/zertifikatsvorlagen/standard mit Bearer-Token', async () => {
    beobachteDownloads()
    const { user } = zeige()

    await user.click(knopf())

    await waitFor(() => expect(api.anfragenMit('GET', STANDARD)).toHaveLength(1))
    expect(api.anfragen[0].headers.get('Authorization')).toBe('Bearer token-standard')
    expect(api.anfragen[0].query.toString()).toBe('')
  })

  it('speichert die Datei als zertifikatsvorlage-standard.docx', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeige()

    await user.click(knopf())

    await waitFor(() => expect(downloads.map((d) => d.dateiname)).toEqual(['zertifikatsvorlage-standard.docx']))
    expect(await downloads[0].blob?.text()).toBe('PK-standard')
  })

  it('startet den Download auch per Tastatur', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeige()

    knopf().focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(downloads).toHaveLength(1))
  })

  it('sperrt den Button während des Downloads', async () => {
    beobachteDownloads()
    const offen = offeneAntwort()
    api.einmal('GET', STANDARD, () => offen.promise)
    const { user } = zeige()

    await user.click(knopf())
    await user.click(knopf())

    expect(knopf().disabled || knopf().getAttribute('aria-disabled') === 'true').toBe(true)
    expect(api.anfragenMit('GET', STANDARD)).toHaveLength(1)
    offen.aufloesen(docxAntwort('zertifikatsvorlage-standard.docx'))
    await waitFor(() => expect(knopf().disabled || knopf().getAttribute('aria-disabled') === 'true').toBe(false))
  })

  it('zeigt bei einem Fehler den Alarm und speichert nichts', async () => {
    const { downloads } = beobachteDownloads()
    api.einmal('GET', STANDARD, problemAntwort(500))
    const { user } = zeige()

    await user.click(knopf())

    expect(await screen.findByRole('alert')).toHaveTextContent(FEHLER)
    expect(downloads).toHaveLength(0)
  })

  it('zeigt bei einem Netzwerkfehler denselben Alarm', async () => {
    beobachteDownloads()
    api.netzwerkfehler('GET', STANDARD)
    const { user } = zeige()

    await user.click(knopf())

    expect(await screen.findByRole('alert')).toHaveTextContent(FEHLER)
  })

  it('zeigt keine englischen Texte', () => {
    zeige()

    expect(seitentext()).not.toMatch(/\b(Download|Template|Error)\b/)
  })
})
