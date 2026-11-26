import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import {
  erstelleFakeApi,
  problemAntwort,
  testAuditEintrag,
  testBenutzerEintrag,
  type FakeApi,
} from '../../../../test/fakeApi'
import { pruefeUeberschriften, ueberschriftenListe } from '../../../../test/ueberschriften'
import { BenutzerverwaltungSeite } from '../index'

// Feature startseite-listen-pruefung, AK-28, AK-31 und AK-33 (Abschnitt 4.4): Seitenkopf mit h1 „Benutzerverwaltung“
// und der Beschreibung „Rollen vergeben, Benutzer deaktivieren und Änderungen nachvollziehen.“, darunter die Reiter
// (Namen unverändert). Panel „Benutzer“ mit h2 „Benutzer“, Panel „Audit-Log“ mit h2 „Änderungsprotokoll“ und den
// Beschreibungen aus 4.4. Keine h3 direkt nach der h1. Zustände der Benutzer-Tabelle mit „Erneut versuchen“ und
// „Suche zurücksetzen“.

const BESCHREIBUNG = 'Rollen vergeben, Benutzer deaktivieren und Änderungen nachvollziehen.'
const BESCHREIBUNG_BENUTZER = 'Rollen und Status aller Benutzer, die sich schon einmal angemeldet haben.'
const BESCHREIBUNG_AUDIT =
  'Rollen- und Statusänderungen, neueste zuerst. Einträge lassen sich nicht ändern oder löschen.'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], {
    me: ME.admin,
    benutzer: [
      testBenutzerEintrag({ id: ME.admin.id, name: ME.admin.name, email: ME.admin.email, rolle: 'Administrator' }),
      testBenutzerEintrag({ name: 'Testperson Anna', email: 'anna@test.local' }),
    ],
    audit: [testAuditEintrag()],
  })
  vi.stubGlobal('fetch', api.fetch)
})

function zeige() {
  const user = userEvent.setup()
  render(<BenutzerverwaltungSeite aktuellerBenutzerId={ME.admin.id} />)
  return { user }
}

describe('Seitenkopf (AK-28)', () => {
  it('zeigt unter dem h1 die Beschreibung aus 4.4', async () => {
    zeige()

    expect(await screen.findByText(BESCHREIBUNG)).toBeInTheDocument()
  })

  it('behält die Reiter „Benutzer“ und „Audit-Log“', () => {
    zeige()

    expect(screen.getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual(['Benutzer', 'Änderungsprotokoll'])
  })
})

describe('Panels (AK-28)', () => {
  it('gibt dem Panel „Benutzer“ die h2 „Benutzer“ und die Beschreibung aus 4.4', async () => {
    zeige()

    const panel = await screen.findByRole('tabpanel', { name: 'Benutzer' })
    expect(within(panel).getByRole('heading', { level: 2, name: 'Benutzer' })).toBeInTheDocument()
    expect(within(panel).getByText(BESCHREIBUNG_BENUTZER)).toBeInTheDocument()
  })

  it('gibt dem Panel „Audit-Log“ die h2 „Änderungsprotokoll“ und die Beschreibung aus 4.4', async () => {
    const { user } = zeige()

    await user.click(screen.getByRole('tab', { name: 'Änderungsprotokoll' }))

    const panel = await screen.findByRole('tabpanel', { name: 'Änderungsprotokoll' })
    expect(within(panel).getByRole('heading', { level: 2, name: 'Änderungsprotokoll' })).toBeInTheDocument()
    expect(within(panel).getByText(BESCHREIBUNG_AUDIT)).toBeInTheDocument()
  })

  it('lässt keine h3 direkt auf die h1 folgen (Reiter „Benutzer“)', async () => {
    zeige()
    await screen.findByRole('table', { name: 'Benutzer' })

    const liste = ueberschriftenListe()
    expect(liste[0]?.ebene).toBe(1)
    expect(liste[1]?.ebene).not.toBe(3)
    pruefeUeberschriften()
  })

  it('lässt keine h3 direkt auf die h1 folgen (Reiter „Audit-Log“)', async () => {
    const { user } = zeige()

    await user.click(screen.getByRole('tab', { name: 'Änderungsprotokoll' }))
    await screen.findByRole('table', { name: 'Änderungsprotokoll' })

    pruefeUeberschriften()
  })
})

describe('Zustände der Benutzer-Tabelle (AK-31)', () => {
  it('zeigt einen Ladefehler als Alarm mit „Erneut versuchen“ und lädt damit genau einmal neu', async () => {
    api.einmal('GET', /^\/api\/benutzer$/, problemAntwort(500))
    const { user } = zeige()
    const alarm = await screen.findByRole('alert')
    expect(alarm).toHaveTextContent('Benutzer konnten nicht geladen werden. Bitte später erneut versuchen.')
    const vorher = api.anfragenMit('GET', /^\/api\/benutzer$/).length

    await user.click(within(alarm).getByRole('button', { name: 'Erneut versuchen' }))

    await screen.findByRole('table', { name: 'Benutzer' })
    expect(api.anfragenMit('GET', /^\/api\/benutzer$/)).toHaveLength(vorher + 1)
  })

  it('zeigt bei leerem Suchergebnis einen Leerzustand mit „Suche zurücksetzen“', async () => {
    const { user } = zeige()
    await screen.findByRole('table', { name: 'Benutzer' })

    await user.type(screen.getByRole('searchbox', { name: /^Benutzer suchen/ }), 'gibtesnicht')
    await user.click(screen.getByRole('button', { name: 'Suchen' }))

    expect(await screen.findByRole('button', { name: 'Suche zurücksetzen' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Benutzer' })).not.toBeInTheDocument()
  })

  it('lädt per „Suche zurücksetzen“ wieder alle Benutzer', async () => {
    const { user } = zeige()
    await screen.findByRole('table', { name: 'Benutzer' })
    await user.type(screen.getByRole('searchbox', { name: /^Benutzer suchen/ }), 'gibtesnicht')
    await user.click(screen.getByRole('button', { name: 'Suchen' }))

    await user.click(await screen.findByRole('button', { name: 'Suche zurücksetzen' }))

    await screen.findByRole('table', { name: 'Benutzer' })
    expect(
      api
        .anfragenMit('GET', /^\/api\/benutzer$/)
        .at(-1)
        ?.query.get('suche') ?? '',
    ).toBe('')
  })
})
