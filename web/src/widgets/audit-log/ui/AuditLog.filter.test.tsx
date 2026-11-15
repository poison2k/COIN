import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  erstelleFakeApi,
  jsonAntwort,
  offeneAntwort,
  problemAntwort,
  testAuditEintrag,
  testBenutzerEintrag,
  type FakeApi,
} from '../../../../test/fakeApi'
import { AuditLog } from '../index'

// Feature startseite-listen-pruefung, AK-29 bis AK-32 (Abschnitt 4.4, F5 Variante A): Benutzerfilter (geänderter
// Benutzer) als Combobox „Benutzer“ mit Hilfetext; Suche nach 300 ms über GET /api/benutzer?suche=…&groesse=20, Treffer
// nur mit Namen; Wahl lädt GET /api/audit mit benutzerId und seite=1 und zeigt den Chip „Benutzer: {Name}“; Entfernen
// lädt ohne benutzerId ab Seite 1. Weder Name noch Id in der URL. Kein Filter nach Zeitraum oder Aktion: /api/audit nur
// mit benutzerId, seite, groesse. Zustände: Laden, Fehler mit „Erneut versuchen“, leer ohne/mit Filter.

const HILFETEXT = 'Zeigt Änderungen an diesem Benutzerkonto.'
const AUDIT = /^\/api\/audit$/
const BENUTZER = /^\/api\/benutzer$/

const PERSON_A = testBenutzerEintrag({
  id: '0199a1b2-0000-7000-8000-00000000b001',
  name: 'Testperson Anna',
  email: 'anna@test.local',
})
const PERSON_B = testBenutzerEintrag({
  id: '0199a1b2-0000-7000-8000-00000000b002',
  name: 'Testperson Bernd',
  email: 'bernd@test.local',
})

let api: FakeApi

function starte(
  audit = [
    testAuditEintrag({
      id: '0199a1b2-0000-7000-8000-00000000c001',
      benutzer: { id: PERSON_A.id, name: PERSON_A.name },
    }),
    testAuditEintrag({
      id: '0199a1b2-0000-7000-8000-00000000c002',
      benutzer: { id: PERSON_B.id, name: PERSON_B.name },
    }),
  ],
) {
  api = erstelleFakeApi([], { audit, benutzer: [PERSON_A, PERSON_B] })
  vi.stubGlobal('fetch', api.fetch)
}

beforeEach(() => {
  starte()
})

function zeige() {
  const user = userEvent.setup()
  render(<AuditLog />)
  return { user }
}

const auditAbrufe = () => api.anfragenMit('GET', AUDIT)
const suchAbrufe = () => api.anfragenMit('GET', BENUTZER)
const filterFeld = () => screen.getByRole('combobox', { name: /^Benutzer/ })

async function geladen() {
  await screen.findByRole('table', { name: 'Audit-Log' })
}

async function waehle(user: ReturnType<typeof userEvent.setup>, suche: string, name: string) {
  await user.click(filterFeld())
  await user.type(filterFeld(), suche)
  await user.click(await screen.findByRole('option', { name }))
}

describe('Benutzerfilter (AK-29)', () => {
  it('hat genau einen Filter, die Combobox „Benutzer“', async () => {
    zeige()
    await geladen()

    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(filterFeld()).toBeInTheDocument()
  })

  it('beschreibt die Combobox mit „Zeigt Änderungen an diesem Benutzerkonto.“', async () => {
    zeige()
    await geladen()

    expect(filterFeld()).toHaveAccessibleDescription(expect.stringContaining(HILFETEXT))
  })

  it('fragt beim Anzeigen keine Benutzer ab', async () => {
    zeige()
    await geladen()

    expect(suchAbrufe()).toEqual([])
  })

  it('sucht erst nach einer Verzögerung und dann genau einmal mit dem ganzen Begriff', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(filterFeld())
    await user.type(filterFeld(), 'Test')

    expect(suchAbrufe()).toEqual([])
    await waitFor(() => expect(suchAbrufe()).toHaveLength(1))
    expect(suchAbrufe()[0].query.get('suche')).toBe('Test')
  })

  it('wartet mindestens 300 ms nach der letzten Eingabe', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(filterFeld())

    await user.type(filterFeld(), 'Te')
    const ende = Date.now()

    await waitFor(() => expect(suchAbrufe()).toHaveLength(1))
    // Toleranz für die Taktung von waitFor (50 ms); ohne Verzögerung käme der Request sofort.
    expect(Date.now() - ende).toBeGreaterThanOrEqual(250)
  })

  it('fragt höchstens 20 Benutzer ab', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(filterFeld())
    await user.type(filterFeld(), 'Test')

    await waitFor(() => expect(suchAbrufe()).toHaveLength(1))
    expect(suchAbrufe()[0].query.get('groesse')).toBe('20')
  })

  it('zeigt die Treffer nur mit Namen, nie mit E-Mail', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(filterFeld())
    await user.type(filterFeld(), 'Test')

    const optionen = await screen.findAllByRole('option')
    expect(optionen.map((o) => o.textContent?.trim())).toEqual(['Testperson Anna', 'Testperson Bernd'])
    expect(document.body.textContent).not.toMatch(/@test\.local/)
  })

  it('lädt nach der Wahl GET /api/audit mit benutzerId und seite=1', async () => {
    const { user } = zeige()
    await geladen()

    await waehle(user, 'Bernd', 'Testperson Bernd')

    await waitFor(() => expect(auditAbrufe().at(-1)?.query.get('benutzerId')).toBe(PERSON_B.id))
    expect(auditAbrufe().at(-1)?.query.get('seite')).toBe('1')
  })

  it('zeigt nach der Wahl den Chip „Benutzer: {Name}“', async () => {
    const { user } = zeige()
    await geladen()

    await waehle(user, 'Bernd', 'Testperson Bernd')

    const chips = await screen.findByRole('list', { name: 'Aktive Filter' })
    expect(
      within(chips)
        .getAllByRole('listitem')
        .map((li) => li.textContent?.trim()),
    ).toEqual(['Benutzer: Testperson Bernd'])
  })

  it('zeigt nach der Wahl nur die Einträge des geänderten Benutzers', async () => {
    const { user } = zeige()
    await geladen()

    await waehle(user, 'Bernd', 'Testperson Bernd')

    await waitFor(() =>
      expect(within(screen.getByRole('table', { name: 'Audit-Log' })).queryByText('Testperson Anna')).toBeNull(),
    )
    expect(within(screen.getByRole('table', { name: 'Audit-Log' })).getByText('Testperson Bernd')).toBeInTheDocument()
  })

  it('lädt nach dem Entfernen des Chips ohne benutzerId ab Seite 1', async () => {
    const { user } = zeige()
    await geladen()
    await waehle(user, 'Bernd', 'Testperson Bernd')
    await screen.findByRole('list', { name: 'Aktive Filter' })
    const vorher = auditAbrufe().length

    await user.click(screen.getByRole('button', { name: 'Filter „Benutzer: Testperson Bernd“ entfernen' }))

    await waitFor(() => expect(auditAbrufe()).toHaveLength(vorher + 1))
    expect(auditAbrufe().at(-1)?.query.has('benutzerId')).toBe(false)
    expect(auditAbrufe().at(-1)?.query.get('seite')).toBe('1')
    expect(screen.queryByRole('list', { name: 'Aktive Filter' })).not.toBeInTheDocument()
  })

  it('setzt weder Namen noch Id in die URL', async () => {
    const vorher = window.location.href
    const { user } = zeige()
    await geladen()

    await waehle(user, 'Bernd', 'Testperson Bernd')
    await screen.findByRole('list', { name: 'Aktive Filter' })

    expect(window.location.href).toBe(vorher)
    expect(window.location.href).not.toContain(PERSON_B.id)
    expect(decodeURIComponent(window.location.href)).not.toContain('Bernd')
  })

  it('legt Filterwerte nicht im Browser-Speicher ab', async () => {
    const { user } = zeige()
    await geladen()

    await waehle(user, 'Bernd', 'Testperson Bernd')
    await screen.findByRole('list', { name: 'Aktive Filter' })

    expect(JSON.stringify([{ ...localStorage }, { ...sessionStorage }])).not.toMatch(/Bernd|b002/)
  })
})

describe('Fehler der Benutzersuche (QA-Regression)', () => {
  it('meldet in der Vorschlagsliste „Benutzer konnten nicht geladen werden.“ statt „Keine Benutzer gefunden“', async () => {
    api.einmal('GET', BENUTZER, problemAntwort(500))
    const { user } = zeige()
    await geladen()

    await user.click(filterFeld())
    await user.type(filterFeld(), 'Test')

    expect(await screen.findByText('Benutzer konnten nicht geladen werden.')).toBeInTheDocument()
    expect(screen.queryByText('Keine Benutzer gefunden')).not.toBeInTheDocument()
  })
})

describe('Kein Zeitraum- und kein Aktionsfilter (AK-32)', () => {
  it('ruft /api/audit nur mit benutzerId, seite und groesse auf', async () => {
    const { user } = zeige()
    await geladen()
    await waehle(user, 'Bernd', 'Testperson Bernd')
    await screen.findByRole('list', { name: 'Aktive Filter' })
    await user.click(screen.getByRole('button', { name: 'Filter „Benutzer: Testperson Bernd“ entfernen' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Aktive Filter' })).not.toBeInTheDocument())

    const parameter = new Set(auditAbrufe().flatMap((a) => [...a.query.keys()]))
    expect([...parameter].every((p) => ['benutzerId', 'seite', 'groesse'].includes(p))).toBe(true)
  })

  it('bietet keine Bedienelemente für Zeitraum oder Aktion', async () => {
    zeige()
    await geladen()

    for (const name of [/Zeitraum/, /^Von/, /^Bis/, /Aktion/, /^Art/, /Änderung/]) {
      expect(screen.queryByRole('combobox', { name })).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name })).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name })).not.toBeInTheDocument()
    }
  })
})

describe('Zustände (AK-31)', () => {
  it('zeigt während des Ladens „Audit-Log wird geladen …“ als Status', async () => {
    const offen = offeneAntwort()
    api.einmal('GET', AUDIT, offen.promise)
    zeige()

    const text = await screen.findByText('Audit-Log wird geladen …')

    expect(text.closest('[role="status"]')).not.toBeNull()
    offen.aufloesen(jsonAntwort(200, { eintraege: [], gesamt: 0, seite: 1, groesse: 25 }))
  })

  it('zeigt einen Ladefehler als Alarm mit „Erneut versuchen“', async () => {
    api.einmal('GET', AUDIT, problemAntwort(500))
    zeige()

    const alarm = await screen.findByRole('alert')

    expect(alarm).toHaveTextContent('Audit-Log konnte nicht geladen werden. Bitte später erneut versuchen.')
    expect(within(alarm).getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
  })

  it('lädt per „Erneut versuchen“ genau einmal neu und zeigt danach die Tabelle', async () => {
    api.einmal('GET', AUDIT, problemAntwort(500))
    const { user } = zeige()
    await screen.findByRole('alert')
    const vorher = auditAbrufe().length

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    await geladen()
    expect(auditAbrufe()).toHaveLength(vorher + 1)
  })

  it('zeigt ohne Einträge und ohne Filter h3 „Noch keine Einträge.“', async () => {
    starte([])
    zeige()

    expect(await screen.findByRole('heading', { level: 3, name: 'Noch keine Einträge.' })).toBeInTheDocument()
  })

  it('zeigt mit Filter ohne Einträge h3 „Keine Einträge für diesen Benutzer.“ mit „Filter entfernen“', async () => {
    starte([testAuditEintrag({ benutzer: { id: PERSON_A.id, name: PERSON_A.name } })])
    const { user } = zeige()
    await geladen()

    await waehle(user, 'Bernd', 'Testperson Bernd')

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Keine Einträge für diesen Benutzer.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filter entfernen' })).toBeInTheDocument()
  })

  it('lädt per „Filter entfernen“ ohne benutzerId ab Seite 1', async () => {
    starte([testAuditEintrag({ benutzer: { id: PERSON_A.id, name: PERSON_A.name } })])
    const { user } = zeige()
    await geladen()
    await waehle(user, 'Bernd', 'Testperson Bernd')
    await screen.findByRole('heading', { level: 3, name: 'Keine Einträge für diesen Benutzer.' })

    await user.click(screen.getByRole('button', { name: 'Filter entfernen' }))

    await geladen()
    expect(auditAbrufe().at(-1)?.query.has('benutzerId')).toBe(false)
    expect(auditAbrufe().at(-1)?.query.get('seite')).toBe('1')
  })
})
