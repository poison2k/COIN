import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  erstelleFakeApi,
  jsonAntwort,
  problemAntwort,
  testAuditEintrag,
  testBenutzerEintrag,
  type FakeApi,
} from '../../../../test/fakeApi'
import { AuditLog } from '../index'

// Feature nacharbeiten-audit-filter, AK-13 bis AK-18 (Abschnitt 4.4, ADR-0045 Punkt 4): Filter des Änderungsprotokolls
// nach Zeitraum („Von“/„Bis“), Aktion (Checkboxen aus GET /api/audit/aktionen) und Benutzer (Combobox, Bestand). Jede
// Änderung lädt genau einmal GET /api/audit ab Seite 1 mit genau den gesetzten Filtern; Chips „Von: …“, „Bis: …“,
// „Aktion: …“ (API-Reihenfolge), „Benutzer: …“; „Filter zurücksetzen“ ab einem Chip; Leerzustand „Keine Einträge für
// diese Filter.“; 400-Feldfehler am Filter ohne Tabelle, Fehlerzustand und Blättern. Ohne Router-Props arbeitet das
// Widget mit eigenem Zustand, mit `abfrage`/`onAbfrage` (AuditAbfrage `{ von?, bis?, aktionen, benutzerId?, seite }`)
// kontrolliert (Route übersetzt URL ↔ Props).

const AUDIT = /^\/api\/audit$/
const AKTIONEN = /^\/api\/audit\/aktionen$/

const PERSON_A = testBenutzerEintrag({ id: '0199a1b2-0000-7000-8000-00000000b001', name: 'Testperson Anna' })
const PERSON_B = testBenutzerEintrag({ id: '0199a1b2-0000-7000-8000-00000000b002', name: 'Testperson Bernd' })

/** Einträge in Berliner Kalendertagen: 01.10. (Rolle, Anna), 15.10. (Status, Bernd), 05.11. (Status, Anna). */
const EINTRAEGE = [
  testAuditEintrag({
    id: '0199a1b2-0000-7000-8000-00000000c003',
    zeitpunkt: '2026-11-05T10:00:00Z',
    art: 'Status',
    alt: 'aktiv',
    neu: 'deaktiviert',
    benutzer: { id: PERSON_A.id, name: PERSON_A.name },
  }),
  testAuditEintrag({
    id: '0199a1b2-0000-7000-8000-00000000c002',
    zeitpunkt: '2026-10-15T10:00:00Z',
    art: 'Status',
    alt: 'aktiv',
    neu: 'deaktiviert',
    benutzer: { id: PERSON_B.id, name: PERSON_B.name },
  }),
  testAuditEintrag({
    id: '0199a1b2-0000-7000-8000-00000000c001',
    zeitpunkt: '2026-09-30T22:30:00Z',
    art: 'Rolle',
    benutzer: { id: PERSON_A.id, name: PERSON_A.name },
  }),
]

let api: FakeApi

function starte(audit = EINTRAEGE) {
  api = erstelleFakeApi([], { audit, benutzer: [PERSON_A, PERSON_B] })
  vi.stubGlobal('fetch', api.fetch)
}

beforeEach(() => {
  starte()
})

type Abfrage = NonNullable<ComponentProps<typeof AuditLog>['abfrage']>

/** Kontrollierte Nutzung wie durch die Route: hält die Abfrage im Zustand und merkt sich jede gemeldete Abfrage. */
function Kontrolliert({ start, gemeldet }: { start: Abfrage; gemeldet: Abfrage[] }) {
  const [abfrage, setAbfrage] = useState(start)
  return (
    <AuditLog
      abfrage={abfrage}
      onAbfrage={(neu) => {
        gemeldet.push(neu)
        setAbfrage(neu)
      }}
    />
  )
}

function zeige() {
  const user = userEvent.setup()
  render(<AuditLog />)
  return { user }
}

function zeigeKontrolliert(start: Abfrage) {
  const user = userEvent.setup()
  const gemeldet: Abfrage[] = []
  render(<Kontrolliert start={start} gemeldet={gemeldet} />)
  return { user, gemeldet }
}

const auditAbrufe = () => api.anfragenMit('GET', AUDIT)
const aktionsAbrufe = () => api.anfragenMit('GET', AKTIONEN)
const von = () => screen.getByLabelText(/^Von/)
const bis = () => screen.getByLabelText(/^Bis/)
const checkbox = (name: string) => screen.getByRole('checkbox', { name })
const tabelle = () => screen.queryByRole('table', { name: 'Änderungsprotokoll' })
const chips = () =>
  within(screen.getByRole('list', { name: 'Aktive Filter' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent?.trim())

async function geladen() {
  await screen.findByRole('table', { name: 'Änderungsprotokoll' })
  await screen.findByRole('checkbox', { name: 'Status' })
}

function setzeDatum(feld: HTMLElement, wert: string) {
  fireEvent.change(feld, { target: { value: wert } })
}

/** Alle Query-Parameter des letzten Abrufs, mehrfache als Liste. */
function letzteParameter(): Record<string, string[]> {
  const query = auditAbrufe().at(-1)!.query
  return Object.fromEntries([...new Set(query.keys())].sort().map((k) => [k, query.getAll(k)]))
}

describe('Bedienelemente (AK-13)', () => {
  it('hat eine Gruppe „Zeitraum“ mit den Feldern „Von“ und „Bis“', async () => {
    zeige()
    await geladen()

    const gruppe = screen.getByRole('group', { name: 'Zeitraum' })
    expect(within(gruppe).getByLabelText(/^Von/)).toBe(von())
    expect(within(gruppe).getByLabelText(/^Bis/)).toBe(bis())
  })

  it('hat eine Gruppe „Aktion“ mit je einer Checkbox aus GET /api/audit/aktionen', async () => {
    zeige()
    await geladen()

    const gruppe = screen.getByRole('group', { name: /^Aktion/ })
    expect(within(gruppe).getAllByRole('checkbox')).toEqual([checkbox('Rolle'), checkbox('Status')])
  })

  it('übernimmt die Texte der Checkboxen aus der API', async () => {
    api.einmal(
      'GET',
      AKTIONEN,
      jsonAntwort(200, [
        { wert: 'Rolle', bezeichnung: 'Rollenwechsel' },
        { wert: 'Status', bezeichnung: 'Statuswechsel' },
      ]),
    )
    zeige()

    expect(await screen.findByRole('checkbox', { name: 'Statuswechsel' })).toBeInTheDocument()
  })

  it('lädt die Aktionen genau einmal je Anzeige', async () => {
    zeige()
    await geladen()

    expect(aktionsAbrufe()).toHaveLength(1)
  })

  it('hat weiterhin genau eine Combobox, „Benutzer“', async () => {
    zeige()
    await geladen()

    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.getByRole('combobox', { name: /^Benutzer/ })).toBeInTheDocument()
  })

  it('erreicht per Tab Von, Bis, die Checkboxen und dann die Combobox in dieser Reihenfolge', async () => {
    const { user } = zeige()
    await geladen()
    von().focus()

    const reihenfolge: Array<Element | null> = [document.activeElement]
    for (let i = 0; i < 4; i++) {
      await user.tab()
      reihenfolge.push(document.activeElement)
    }

    expect(reihenfolge).toEqual([
      von(),
      bis(),
      checkbox('Rolle'),
      checkbox('Status'),
      screen.getByRole('combobox', { name: /^Benutzer/ }),
    ])
  })
})

describe('Wirkung (AK-14)', () => {
  it('lädt nach „Von“ genau einmal mit von, seite=1 und groesse=25', async () => {
    zeige()
    await geladen()
    const vorher = auditAbrufe().length

    setzeDatum(von(), '2026-10-01')

    await waitFor(() => expect(auditAbrufe()).toHaveLength(vorher + 1))
    expect(letzteParameter()).toEqual({ groesse: ['25'], seite: ['1'], von: ['2026-10-01'] })
  })

  it('lädt nach „Bis“ mit bis', async () => {
    zeige()
    await geladen()

    setzeDatum(bis(), '2026-10-31')

    await waitFor(() => expect(auditAbrufe().at(-1)?.query.get('bis')).toBe('2026-10-31'))
  })

  it('lädt nach dem Anhaken von „Status“ genau einmal mit aktion=Status', async () => {
    const { user } = zeige()
    await geladen()
    const vorher = auditAbrufe().length

    await user.click(checkbox('Status'))

    await waitFor(() => expect(auditAbrufe()).toHaveLength(vorher + 1))
    expect(letzteParameter()).toEqual({ aktion: ['Status'], groesse: ['25'], seite: ['1'] })
  })

  it('sendet bei zwei Aktionen je einen Parameter aktion', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(checkbox('Status'))
    await user.click(checkbox('Rolle'))

    await waitFor(() => expect(auditAbrufe().at(-1)?.query.getAll('aktion')).toEqual(['Rolle', 'Status']))
  })

  it('kombiniert Zeitraum und Aktion und zeigt nur passende Einträge', async () => {
    const { user } = zeige()
    await geladen()

    setzeDatum(von(), '2026-10-01')
    setzeDatum(bis(), '2026-10-31')
    await user.click(checkbox('Status'))

    await waitFor(() => expect(within(tabelle()!).getAllByRole('row')).toHaveLength(2))
    expect(within(tabelle()!).getByText('Testperson Bernd')).toBeInTheDocument()
  })

  it('setzt beim Filtern auf Seite 1 zurück', async () => {
    starte(
      Array.from({ length: 30 }, (_, i) =>
        testAuditEintrag({ id: `0199a1b2-0000-7000-8000-0000000c${String(i).padStart(4, '0')}`, art: 'Status' }),
      ),
    )
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))
    await waitFor(() => expect(auditAbrufe().at(-1)?.query.get('seite')).toBe('2'))

    await user.click(checkbox('Status'))

    await waitFor(() => expect(auditAbrufe().at(-1)?.query.get('aktion')).toBe('Status'))
    expect(auditAbrufe().at(-1)?.query.get('seite')).toBe('1')
  })

  it('behält beim Blättern die Filter', async () => {
    starte(
      Array.from({ length: 30 }, (_, i) =>
        testAuditEintrag({ id: `0199a1b2-0000-7000-8000-0000000c${String(i).padStart(4, '0')}`, art: 'Status' }),
      ),
    )
    const { user } = zeige()
    await geladen()
    await user.click(checkbox('Status'))
    await waitFor(() => expect(auditAbrufe().at(-1)?.query.get('aktion')).toBe('Status'))

    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))

    await waitFor(() => expect(auditAbrufe().at(-1)?.query.get('seite')).toBe('2'))
    expect(auditAbrufe().at(-1)?.query.get('aktion')).toBe('Status')
  })

  it('legt Filterwerte nicht im Browser-Speicher ab', async () => {
    const { user } = zeige()
    await geladen()

    setzeDatum(von(), '2026-10-01')
    await user.click(checkbox('Status'))
    await screen.findByRole('list', { name: 'Aktive Filter' })

    expect(JSON.stringify([{ ...localStorage }, { ...sessionStorage }])).not.toMatch(/2026-10-01|Status/)
  })
})

describe('Chips (AK-15)', () => {
  it('zeigt „Von: 01.10.2026“ und „Bis: 31.10.2026“ mit deutschem Datum', async () => {
    zeige()
    await geladen()

    setzeDatum(von(), '2026-10-01')
    setzeDatum(bis(), '2026-10-31')

    await waitFor(() => expect(chips()).toEqual(['Von: 01.10.2026', 'Bis: 31.10.2026']))
  })

  it('zeigt Aktionen in der Reihenfolge der API, nicht der Auswahl', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(checkbox('Status'))
    await user.click(checkbox('Rolle'))

    await waitFor(() => expect(chips()).toEqual(['Aktion: Rolle', 'Aktion: Status']))
  })

  it('ordnet die Chips Von, Bis, Aktion', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(checkbox('Status'))
    setzeDatum(bis(), '2026-10-31')
    setzeDatum(von(), '2026-10-01')

    await waitFor(() => expect(chips()).toEqual(['Von: 01.10.2026', 'Bis: 31.10.2026', 'Aktion: Status']))
  })

  it('entfernt per Chip nur diesen Filter und lädt ab Seite 1', async () => {
    const { user } = zeige()
    await geladen()
    setzeDatum(von(), '2026-10-01')
    await user.click(checkbox('Status'))
    await waitFor(() => expect(chips()).toHaveLength(2))

    await user.click(screen.getByRole('button', { name: 'Filter „Aktion: Status“ entfernen' }))

    await waitFor(() => expect(auditAbrufe().at(-1)?.query.has('aktion')).toBe(false))
    expect(letzteParameter()).toEqual({ groesse: ['25'], seite: ['1'], von: ['2026-10-01'] })
  })

  it('hakt nach dem Entfernen des Chips die Checkbox ab', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(checkbox('Status'))
    await screen.findByRole('list', { name: 'Aktive Filter' })

    await user.click(screen.getByRole('button', { name: 'Filter „Aktion: Status“ entfernen' }))

    await waitFor(() => expect(checkbox('Status')).not.toBeChecked())
  })

  it('leert nach dem Entfernen des Chips „Von“ das Feld', async () => {
    const { user } = zeige()
    await geladen()
    setzeDatum(von(), '2026-10-01')
    await screen.findByRole('list', { name: 'Aktive Filter' })

    await user.click(screen.getByRole('button', { name: 'Filter „Von: 01.10.2026“ entfernen' }))

    await waitFor(() => expect((von() as HTMLInputElement).value).toBe(''))
  })
})

describe('„Filter zurücksetzen“ (AK-15)', () => {
  it('gibt es ohne aktiven Filter nicht', async () => {
    zeige()
    await geladen()

    expect(screen.queryByRole('button', { name: 'Filter zurücksetzen' })).not.toBeInTheDocument()
  })

  it('gibt es schon ab einem Chip', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(checkbox('Status'))

    expect(await screen.findByRole('button', { name: 'Filter zurücksetzen' })).toBeInTheDocument()
  })

  it('heißt nie „Alle Filter entfernen“', async () => {
    const { user } = zeige()
    await geladen()

    setzeDatum(von(), '2026-10-01')
    await user.click(checkbox('Status'))
    await screen.findByRole('button', { name: 'Filter zurücksetzen' })

    expect(screen.queryByRole('button', { name: 'Alle Filter entfernen' })).not.toBeInTheDocument()
  })

  it('lädt ohne Filter ab Seite 1', async () => {
    const { user } = zeige()
    await geladen()
    setzeDatum(von(), '2026-10-01')
    await user.click(checkbox('Status'))
    await screen.findByRole('button', { name: 'Filter zurücksetzen' })

    await user.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }))

    await waitFor(() => expect(letzteParameter()).toEqual({ groesse: ['25'], seite: ['1'] }))
  })

  it('entfernt alle Chips und leert die Felder', async () => {
    const { user } = zeige()
    await geladen()
    setzeDatum(von(), '2026-10-01')
    await user.click(checkbox('Status'))
    await screen.findByRole('button', { name: 'Filter zurücksetzen' })

    await user.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }))

    await waitFor(() => expect(screen.queryByRole('list', { name: 'Aktive Filter' })).not.toBeInTheDocument())
    expect((von() as HTMLInputElement).value).toBe('')
    expect(checkbox('Status')).not.toBeChecked()
  })

  it('setzt danach den Fokus auf „Von“', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(checkbox('Status'))
    await screen.findByRole('button', { name: 'Filter zurücksetzen' })

    await user.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }))

    await waitFor(() => expect(von()).toHaveFocus())
  })
})

// QA-Runde 2 R2-G1: „Filter zurücksetzen“ verwirft auch einen nicht gemeldeten Zwischenwert im Feld „Von“ (Entwurf
// beim Tippen des Jahres). Ein anderer aktiver Filter sorgt dafür, dass es den Button gibt.
describe('„Filter zurücksetzen“ mit Zwischenwert im Datumsfeld (R2-G1)', () => {
  it('leert „Von“ auch dann, wenn dort nur ein Zwischenwert stand', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(checkbox('Status'))
    await screen.findByRole('button', { name: 'Filter zurücksetzen' })
    setzeDatum(von(), '0002-10-01')

    await user.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }))

    await waitFor(() => expect(screen.queryByRole('list', { name: 'Aktive Filter' })).not.toBeInTheDocument())
    expect(von()).toHaveValue('')
  })
})

describe('Leerzustand (AK-18)', () => {
  it('zeigt mit Filter ohne Treffer h3 „Keine Einträge für diese Filter.“', async () => {
    zeige()
    await geladen()

    setzeDatum(von(), '2027-01-01')

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Keine Einträge für diese Filter.' }),
    ).toBeInTheDocument()
  })

  it('bietet im Leerzustand „Filter zurücksetzen“ mit derselben Wirkung', async () => {
    const { user } = zeige()
    await geladen()
    setzeDatum(von(), '2027-01-01')
    await screen.findByRole('heading', { level: 3, name: 'Keine Einträge für diese Filter.' })

    // Der Leerzustand steht im DOM nach der Filterleiste.
    await user.click(screen.getAllByRole('button', { name: 'Filter zurücksetzen' }).at(-1)!)

    await waitFor(() => expect(letzteParameter()).toEqual({ groesse: ['25'], seite: ['1'] }))
    expect(await screen.findByRole('table', { name: 'Änderungsprotokoll' })).toBeInTheDocument()
  })

  it('setzt nach „Filter zurücksetzen“ im Leerzustand den Fokus auf „Von“', async () => {
    const { user } = zeige()
    await geladen()
    setzeDatum(von(), '2027-01-01')
    await screen.findByRole('heading', { level: 3, name: 'Keine Einträge für diese Filter.' })

    await user.click(screen.getAllByRole('button', { name: 'Filter zurücksetzen' }).at(-1)!)

    await waitFor(() => expect(von()).toHaveFocus())
  })

  it('zeigt ohne Filter und ohne Einträge weiter h3 „Noch keine Einträge.“', async () => {
    starte([])
    zeige()

    expect(await screen.findByRole('heading', { level: 3, name: 'Noch keine Einträge.' })).toBeInTheDocument()
  })
})

describe('Serverfehler 400 (AK-17)', () => {
  const BIS_FEHLER = 'Das Datum „bis“ darf nicht vor dem Datum „von“ liegen.'
  const AKTION_FEHLER = 'Unbekannte Aktion. Erlaubt sind: Rolle, Status.'

  async function mitFehler(errors: Record<string, string[]>) {
    zeige()
    await geladen()
    api.einmal('GET', AUDIT, problemAntwort(400, { title: 'Ungültige Anfrage', errors }))
    setzeDatum(von(), '2026-10-31')
  }

  it('zeigt errors.bis am Feld „Bis“ mit aria-invalid', async () => {
    await mitFehler({ bis: [BIS_FEHLER] })

    await waitFor(() => expect(bis()).toHaveAttribute('aria-invalid', 'true'))
    expect(bis()).toHaveAccessibleDescription(expect.stringContaining(BIS_FEHLER))
  })

  it('zeigt errors.aktion an der Gruppe „Aktion“', async () => {
    await mitFehler({ aktion: [AKTION_FEHLER] })

    expect(await within(screen.getByRole('group', { name: /^Aktion/ })).findByText(AKTION_FEHLER)).toBeInTheDocument()
  })

  it('zeigt bei 400 keine Tabelle', async () => {
    await mitFehler({ bis: [BIS_FEHLER] })

    await waitFor(() => expect(bis()).toHaveAttribute('aria-invalid', 'true'))
    expect(tabelle()).not.toBeInTheDocument()
  })

  it('zeigt bei 400 keinen Fehlerzustand', async () => {
    await mitFehler({ bis: [BIS_FEHLER] })

    await waitFor(() => expect(bis()).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('zeigt bei 400 kein Blättern', async () => {
    await mitFehler({ bis: [BIS_FEHLER] })

    await waitFor(() => expect(bis()).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.queryByRole('button', { name: /Seite/ })).not.toBeInTheDocument()
  })

  it('nimmt den Feldfehler nach der nächsten erfolgreichen Abfrage zurück', async () => {
    await mitFehler({ bis: [BIS_FEHLER] })
    await waitFor(() => expect(bis()).toHaveAttribute('aria-invalid', 'true'))

    setzeDatum(von(), '2026-10-01')

    await waitFor(() => expect(bis()).not.toHaveAttribute('aria-invalid', 'true'))
  })
})

describe('Aktionsliste nicht ladbar (AK-17)', () => {
  it('zeigt in der Gruppe „Aktionen konnten nicht geladen werden.“', async () => {
    api.einmal('GET', AKTIONEN, problemAntwort(500))
    zeige()

    const gruppe = await screen.findByRole('group', { name: /^Aktion/ })
    expect(await within(gruppe).findByText('Aktionen konnten nicht geladen werden.')).toBeInTheDocument()
  })

  it('zeigt die Einträge trotzdem', async () => {
    api.einmal('GET', AKTIONEN, problemAntwort(500))
    zeige()

    expect(await screen.findByRole('table', { name: 'Änderungsprotokoll' })).toBeInTheDocument()
  })

  it('lässt den Zeitraumfilter weiter wirken', async () => {
    api.einmal('GET', AKTIONEN, problemAntwort(500))
    zeige()
    await screen.findByText('Aktionen konnten nicht geladen werden.')

    setzeDatum(von(), '2026-10-01')

    await waitFor(() => expect(auditAbrufe().at(-1)?.query.get('von')).toBe('2026-10-01'))
  })
})

describe('Kontrolliert über abfrage/onAbfrage (AK-16)', () => {
  const START: Abfrage = { von: '2026-10-01', bis: '2026-10-31', aktionen: ['Status'], seite: 1 }

  it('lädt genau mit den Parametern der Abfrage', async () => {
    zeigeKontrolliert(START)

    await waitFor(() => expect(auditAbrufe()).toHaveLength(1))
    expect(letzteParameter()).toEqual({
      aktion: ['Status'],
      bis: ['2026-10-31'],
      groesse: ['25'],
      seite: ['1'],
      von: ['2026-10-01'],
    })
  })

  it('zeigt die Werte der Abfrage in Feldern und Checkboxen', async () => {
    zeigeKontrolliert(START)
    await screen.findByRole('checkbox', { name: 'Status' })

    expect([(von() as HTMLInputElement).value, (bis() as HTMLInputElement).value]).toEqual(['2026-10-01', '2026-10-31'])
    expect(checkbox('Status')).toBeChecked()
    expect(checkbox('Rolle')).not.toBeChecked()
  })

  it('zeigt die Chips der Abfrage', async () => {
    zeigeKontrolliert(START)

    await waitFor(() => expect(chips()).toEqual(['Von: 01.10.2026', 'Bis: 31.10.2026', 'Aktion: Status']))
  })

  it('zeigt eine Aktion aus der Abfrage als Chip, auch wenn die Aktionsliste nicht lädt', async () => {
    api.einmal('GET', AKTIONEN, problemAntwort(500))
    zeigeKontrolliert({ aktionen: ['Status'], seite: 1 })

    await waitFor(() => expect(chips()).toEqual(['Aktion: Status']))
  })

  it('meldet eine Filteränderung mit Seite 1 an onAbfrage', async () => {
    const { user, gemeldet } = zeigeKontrolliert({ ...START, seite: 3 })
    await screen.findByRole('checkbox', { name: 'Rolle' })

    await user.click(checkbox('Rolle'))

    await waitFor(() => expect(gemeldet.at(-1)).toEqual({ ...START, aktionen: ['Rolle', 'Status'], seite: 1 }))
  })

  it('meldet „Filter zurücksetzen“ als Abfrage ohne Filter auf Seite 1', async () => {
    const { user, gemeldet } = zeigeKontrolliert(START)
    await screen.findByRole('button', { name: 'Filter zurücksetzen' })

    await user.click(screen.getAllByRole('button', { name: 'Filter zurücksetzen' })[0])

    await waitFor(() => expect(gemeldet.at(-1)).toEqual({ aktionen: [], seite: 1 }))
  })

  it('nennt im Chip „Benutzer“ den Namen des ersten geladenen Eintrags', async () => {
    zeigeKontrolliert({ aktionen: [], benutzerId: PERSON_B.id, seite: 1 })

    await waitFor(() => expect(chips()).toEqual(['Benutzer: Testperson Bernd']))
  })

  it('zeigt denselben Namen in der Combobox „Benutzer“', async () => {
    zeigeKontrolliert({ aktionen: [], benutzerId: PERSON_B.id, seite: 1 })
    await waitFor(() => expect(chips()).toEqual(['Benutzer: Testperson Bernd']))

    expect(screen.getByRole('combobox', { name: /^Benutzer/ })).toHaveValue('Testperson Bernd')
  })

  it('nennt den Benutzer ohne Einträge „unbekannt“', async () => {
    zeigeKontrolliert({ aktionen: [], benutzerId: '0199a1b2-0000-7000-8000-00000000beef', seite: 1 })

    await waitFor(() => expect(chips()).toEqual(['Benutzer: unbekannt']))
  })

  it('lädt mit benutzerId aus der Abfrage', async () => {
    zeigeKontrolliert({ aktionen: [], benutzerId: PERSON_B.id, seite: 1 })

    await waitFor(() => expect(auditAbrufe().at(-1)?.query.get('benutzerId')).toBe(PERSON_B.id))
  })

  it('lädt die Seite aus der Abfrage', async () => {
    zeigeKontrolliert({ aktionen: [], seite: 2 })

    await waitFor(() => expect(auditAbrufe().at(-1)?.query.get('seite')).toBe('2'))
  })
})
