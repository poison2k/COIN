import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  erstelleFakeApi,
  jsonAntwort,
  offeneAntwort,
  problemAntwort,
  testAuditEintrag,
  type FakeApi,
} from '../../../../test/fakeApi'
import { AuditLog } from '../index'

// Feature nacharbeiten-audit-filter, AK-28 (Abschnitt 4.9, ADR-0047 Punkt 2): Nach „Erneut versuchen“ liegt der Fokus
// nicht auf body, sondern im Inhaltsbereich des Widgets (Wurzel mit `data-inhaltsbereich`), der in Laden, Fehler und
// Inhalt eingehängt bleibt – auch nach erfolgreichem Laden. Bei erneutem Fehler bleibt er dort, der Alarm ist sichtbar.

const AUDIT = /^\/api\/audit$/
let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], { audit: [testAuditEintrag()] })
  vi.stubGlobal('fetch', api.fetch)
})

function imInhaltsbereich(): boolean {
  const aktiv = document.activeElement
  return aktiv !== null && aktiv !== document.body && aktiv.closest('[data-inhaltsbereich]') !== null
}

async function mitLadefehler() {
  api.einmal('GET', AUDIT, problemAntwort(500))
  const user = userEvent.setup()
  render(<AuditLog />)
  await screen.findByRole('button', { name: 'Erneut versuchen' })
  return user
}

describe('Fokus nach „Erneut versuchen“ im Änderungsprotokoll (AK-28)', () => {
  it('legt den Fokus während des Ladens in den Inhaltsbereich', async () => {
    const user = await mitLadefehler()
    const offen = offeneAntwort()
    api.einmal('GET', AUDIT, offen.promise)

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(imInhaltsbereich()).toBe(true)
    offen.aufloesen(jsonAntwort(200, { eintraege: [], gesamt: 0, seite: 1, groesse: 25 }))
  })

  it('lässt den Fokus nach erfolgreichem Laden im Inhaltsbereich', async () => {
    const user = await mitLadefehler()

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    await screen.findByRole('table', { name: 'Änderungsprotokoll' })
    expect(imInhaltsbereich()).toBe(true)
  })

  it('lässt den Fokus bei erneutem Fehler auf demselben Ziel und zeigt den Alarm', async () => {
    const user = await mitLadefehler()
    api.einmal('GET', AUDIT, problemAntwort(503))

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    const ziel = document.activeElement

    await waitFor(() => expect(api.anfragenMit('GET', AUDIT).length).toBeGreaterThanOrEqual(2))
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(document.activeElement).toBe(ziel)
    expect(imInhaltsbereich()).toBe(true)
    expect(document.activeElement?.closest('[role="alert"]')).toBeNull()
  })

  it('wirkt auch per Enter', async () => {
    const user = await mitLadefehler()
    screen.getByRole('button', { name: 'Erneut versuchen' }).focus()

    await user.keyboard('{Enter}')

    await screen.findByRole('table', { name: 'Änderungsprotokoll' })
    expect(imInhaltsbereich()).toBe(true)
  })
})
