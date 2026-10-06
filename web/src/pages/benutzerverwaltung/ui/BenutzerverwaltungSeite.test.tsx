import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import { erstelleFakeApi, testAuditEintrag, testBenutzerEintrag, type FakeApi } from '../../../../test/fakeApi'
import { BenutzerverwaltungSeite } from '../index'

// Feature rollen-benutzerverwaltung, AK-26, AK-31, AK-35: Seite „Benutzerverwaltung“ mit h1 und den Tabs
// „Benutzer“ und „Audit-Log“. Die Seite ist frei von Router-Hooks und bekommt die eigene Id als Prop.

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], {
    me: ME.admin,
    benutzer: [
      testBenutzerEintrag({ id: ME.admin.id, name: ME.admin.name, email: ME.admin.email, rolle: 'Administrator' }),
      testBenutzerEintrag({ name: 'Anna Probe', email: 'anna@test.local' }),
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

function auditAbrufe(): number {
  return api.anfragenMit('GET', /^\/api\/audit$/).length
}

describe('Seite', () => {
  it('hat genau ein h1 „Benutzerverwaltung“', () => {
    zeige()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Benutzerverwaltung' })).toBeInTheDocument()
  })

  it('rendert kein eigenes main (das liefert die App-Shell)', () => {
    zeige()

    expect(screen.queryByRole('main')).not.toBeInTheDocument()
  })
})

describe('Tabs', () => {
  it('hat eine tablist mit den Tabs „Benutzer“ und „Audit-Log“', () => {
    zeige()

    const tabs = screen.getAllByRole('tab')
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Benutzer', 'Audit-Log'])
  })

  it('wählt anfangs „Benutzer“ aus', () => {
    zeige()

    expect(screen.getByRole('tab', { name: 'Benutzer' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Audit-Log' })).toHaveAttribute('aria-selected', 'false')
  })

  it('zeigt anfangs die Benutzertabelle', async () => {
    zeige()

    expect(await screen.findByRole('table', { name: 'Benutzer' })).toBeInTheDocument()
  })

  it('lädt das Audit-Log erst beim Aktivieren des Tabs', async () => {
    zeige()
    await screen.findByRole('table', { name: 'Benutzer' })

    expect(auditAbrufe()).toBe(0)
  })

  it('zeigt nach Klick auf „Audit-Log“ die Audit-Tabelle', async () => {
    const { user } = zeige()

    await user.click(screen.getByRole('tab', { name: 'Audit-Log' }))

    expect(await screen.findByRole('table', { name: 'Audit-Log' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Audit-Log' })).toHaveAttribute('aria-selected', 'true')
  })

  it('ordnet den Tab seinem Panel zu (tabpanel mit Namen des Tabs)', async () => {
    const { user } = zeige()

    await user.click(screen.getByRole('tab', { name: 'Audit-Log' }))

    expect(await screen.findByRole('tabpanel', { name: 'Audit-Log' })).toBeInTheDocument()
  })

  it('lädt das Audit-Log bei jedem Aktivieren neu', async () => {
    const { user } = zeige()
    await user.click(screen.getByRole('tab', { name: 'Audit-Log' }))
    await screen.findByRole('table', { name: 'Audit-Log' })

    await user.click(screen.getByRole('tab', { name: 'Benutzer' }))
    await user.click(screen.getByRole('tab', { name: 'Audit-Log' }))

    await waitFor(() => expect(auditAbrufe()).toBe(2))
  })

  it('bewegt den Fokus per Pfeil rechts auf „Audit-Log“', async () => {
    const { user } = zeige()
    screen.getByRole('tab', { name: 'Benutzer' }).focus()

    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'Audit-Log' })).toHaveFocus()
  })

  it('aktiviert den fokussierten Tab per Pfeiltaste und Enter', async () => {
    const { user } = zeige()
    screen.getByRole('tab', { name: 'Benutzer' }).focus()

    await user.keyboard('{ArrowRight}{Enter}')

    expect(await screen.findByRole('table', { name: 'Audit-Log' })).toBeInTheDocument()
  })

  it('kehrt per Pfeil links zu „Benutzer“ zurück', async () => {
    const { user } = zeige()
    await user.click(screen.getByRole('tab', { name: 'Audit-Log' }))

    await user.keyboard('{ArrowLeft}{Enter}')

    expect(screen.getByRole('tab', { name: 'Benutzer' })).toHaveFocus()
    expect(await screen.findByRole('table', { name: 'Benutzer' })).toBeInTheDocument()
  })
})
