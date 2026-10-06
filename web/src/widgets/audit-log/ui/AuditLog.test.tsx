import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditEintrag } from '@/entities/audit'
import {
  erstelleFakeApi,
  keinZugriffAntwort,
  offeneAntwort,
  problemAntwort,
  testAuditEintrag,
  type FakeApi,
} from '../../../../test/fakeApi'
import { meldungMit } from '../../../../test/hilfen'
import { AuditLog } from '../index'

// Feature rollen-benutzerverwaltung, AK-31: Tab „Audit-Log“ – lädt Seiten, blättert, zeigt Zustände und nutzt
// AuditTabelle (Anzeige-Mapping). Daten synthetisch.

const TEXTE = {
  laden: 'Audit-Log wird geladen …',
  fehlerPraefix: 'Audit-Log konnte nicht geladen werden.',
  leer: 'Noch keine Einträge.',
} as const

let api: FakeApi

function starte(audit: AuditEintrag[]) {
  api = erstelleFakeApi([], { audit })
  vi.stubGlobal('fetch', api.fetch)
}

beforeEach(() => {
  starte([
    testAuditEintrag({ id: '0199a1b2-0000-7000-8000-00000000c002', alt: 'Betrachter', neu: 'Sachbearbeiter' }),
    testAuditEintrag({
      id: '0199a1b2-0000-7000-8000-00000000c001',
      akteur: null,
      benutzer: { id: '0199a1b2-0000-7000-8000-00000000a001', name: 'Test Administrator' },
      alt: 'keine',
      neu: 'Administrator',
    }),
  ])
})

function zeige() {
  const user = userEvent.setup()
  render(<AuditLog />)
  return { user }
}

function auditAbrufe() {
  return api.anfragenMit('GET', /^\/api\/audit$/)
}

function viele(anzahl: number): AuditEintrag[] {
  return Array.from({ length: anzahl }, (_, i) =>
    testAuditEintrag({
      id: `0199a1b2-0000-7000-8000-${String(i + 1).padStart(12, 'e')}`,
      benutzer: { id: '0199a1b2-0000-7000-8000-00000000b001', name: `Person ${String(i + 1).padStart(3, '0')}` },
    }),
  )
}

describe('Laden', () => {
  it('zeigt während des Ladens „Audit-Log wird geladen …“ als Status', async () => {
    const offen = offeneAntwort()
    api.einmal('GET', /^\/api\/audit$/, offen.promise)
    zeige()

    await waitFor(() => expect(meldungMit(TEXTE.laden)?.getAttribute('role')).toBe('status'))
  })

  it('lädt die erste Seite mit 25 Einträgen ohne Benutzerfilter', async () => {
    zeige()
    await screen.findByRole('table', { name: 'Audit-Log' })

    const query = auditAbrufe()[0].query
    expect(query.get('seite')).toBe('1')
    expect(query.get('groesse')).toBe('25')
    expect(query.get('benutzerId')).toBeNull()
  })

  it('zeigt einen Ladefehler als Alarm', async () => {
    api.einmal('GET', /^\/api\/audit$/, problemAntwort(500))
    zeige()

    await waitFor(() => expect(meldungMit(TEXTE.fehlerPraefix)?.getAttribute('role')).toBe('alert'))
  })

  it('zeigt bei 403 ebenfalls die Fehlermeldung und keine Tabelle', async () => {
    api.einmal('GET', /^\/api\/audit$/, keinZugriffAntwort('keine_berechtigung'))
    zeige()

    await waitFor(() => expect(meldungMit(TEXTE.fehlerPraefix)).toBeDefined())
    expect(screen.queryByRole('table', { name: 'Audit-Log' })).not.toBeInTheDocument()
  })

  it('zeigt bei einer leeren Liste „Noch keine Einträge.“', async () => {
    starte([])
    zeige()

    expect(await screen.findByText(TEXTE.leer)).toBeInTheDocument()
  })
})

describe('Anzeige', () => {
  it('zeigt die Einträge in einer Tabelle „Audit-Log“', async () => {
    zeige()

    const tabelle = await screen.findByRole('table', { name: 'Audit-Log' })
    expect(within(tabelle).getAllByRole('row')).toHaveLength(3)
  })

  it('zeigt akteur null als „System (Bootstrap)“', async () => {
    zeige()

    const tabelle = await screen.findByRole('table', { name: 'Audit-Log' })
    expect(within(tabelle).getByText('System (Bootstrap)')).toBeInTheDocument()
  })

  it('zeigt „keine“ als „Keine Rolle“', async () => {
    zeige()

    const tabelle = await screen.findByRole('table', { name: 'Audit-Log' })
    expect(within(tabelle).getByText('Keine Rolle')).toBeInTheDocument()
  })

  it('zeigt die Einträge in der Reihenfolge der API (neueste zuerst)', async () => {
    zeige()

    const tabelle = await screen.findByRole('table', { name: 'Audit-Log' })
    const zeilen = within(tabelle).getAllByRole('row').slice(1)
    expect(zeilen[0]).toHaveTextContent('Sachbearbeiter')
    expect(zeilen[1]).toHaveTextContent('System (Bootstrap)')
  })
})

describe('Blättern', () => {
  beforeEach(() => {
    starte(viele(30))
  })

  it('zeigt „Seite 1 von 2“ und sperrt „Vorherige Seite“', async () => {
    zeige()

    expect(await screen.findByText('Seite 1 von 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vorherige Seite' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Nächste Seite' })).toBeEnabled()
  })

  it('lädt per „Nächste Seite“ Seite 2', async () => {
    const { user } = zeige()
    await screen.findByText('Seite 1 von 2')

    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))

    expect(await screen.findByText('Seite 2 von 2')).toBeInTheDocument()
    expect(auditAbrufe().at(-1)?.query.get('seite')).toBe('2')
    expect(screen.getByText('Person 026')).toBeInTheDocument()
  })

  it('sperrt „Nächste Seite“ auf der letzten Seite', async () => {
    const { user } = zeige()
    await screen.findByText('Seite 1 von 2')

    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))
    await screen.findByText('Seite 2 von 2')

    expect(screen.getByRole('button', { name: 'Nächste Seite' })).toBeDisabled()
  })
})

describe('deutsche Texte', () => {
  const ENGLISCH = /\b(Loading|Error|Previous|Next|Page|No entries|Role|Active|Inactive|System \(bootstrap\))\b/

  function alleTexte(): string {
    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    return [document.body.textContent ?? '', ...attribute].join(' ')
  }

  it('enthält mit Einträgen keine englischen Texte', async () => {
    zeige()
    await screen.findByRole('table', { name: 'Audit-Log' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })

  it('enthält im leeren Zustand keine englischen Texte', async () => {
    starte([])
    zeige()
    await screen.findByText(TEXTE.leer)

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })
})
