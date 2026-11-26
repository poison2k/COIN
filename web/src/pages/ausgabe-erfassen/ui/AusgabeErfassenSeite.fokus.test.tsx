import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { erstelleFakeApi, offeneAntwort, problemAntwort, testCoin, type FakeApi } from '../../../../test/fakeApi'
import { zeigeMitRouter } from '../../../../test/router'
import { AusgabeErfassenSeite } from '../index'

// Feature nacharbeiten-audit-filter, QA-Runde 1 W1 (AK-28, ADR-0047 Punkt 2): Nach „Erneut versuchen“ fällt der Fokus
// nicht auf body, weder während des Ladens noch nach erfolgreichem Laden. Seiten fallen auf `main#inhalt` zurück; das
// Ziel muss in Laden, Fehler und Inhalt eingehängt bleiben (4.9 Punkt 3). Die Seite steht wie in der App in
// `<main id="inhalt">`.

const ID = '0199a1b2-0000-7000-8000-0000000000d1'
const COIN = /^\/api\/coins\/[^/]+$/

let api: FakeApi

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T09:00:00Z'))
  api = erstelleFakeApi([testCoin({ id: ID, name: 'Coin Alpha', auflage: 150 })])
  vi.stubGlobal('fetch', api.fetch)
})

afterEach(() => {
  vi.useRealTimers()
})

function zeige() {
  const user = userEvent.setup()
  zeigeMitRouter(
    () => (
      <main id="inhalt">
        <AusgabeErfassenSeite coinId={ID} onErfasst={() => {}} />
      </main>
    ),
    { pfad: '/coins/$coinId/ausgaben/neu', start: `/coins/${ID}/ausgaben/neu` },
  )
  return user
}

/** Fokus liegt nicht auf body, sondern in main#inhalt (main selbst oder ein Element darin). */
function imHauptbereich(): boolean {
  const aktiv = document.activeElement
  return aktiv !== null && aktiv !== document.body && aktiv.closest('main#inhalt') !== null
}

async function mitLadefehler() {
  api.einmal('GET', COIN, problemAntwort(500))
  const user = zeige()
  await screen.findByRole('button', { name: 'Erneut versuchen' })
  return user
}

describe('Fokus nach „Erneut versuchen“ (W1, AK-28)', () => {
  it('lässt den Fokus während des Ladens nicht auf body fallen', async () => {
    const user = await mitLadefehler()
    const offen = offeneAntwort()
    api.einmal('GET', COIN, offen.promise)

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(imHauptbereich()).toBe(true)
    offen.aufloesen(problemAntwort(500))
  })

  it('lässt den Fokus nach erfolgreichem Laden im Hauptbereich', async () => {
    const user = await mitLadefehler()

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Ausgabe erfassen' })).toBeInTheDocument()
    expect(imHauptbereich()).toBe(true)
  })

  it('lässt den Fokus per Enter nach erfolgreichem Laden im Hauptbereich', async () => {
    const user = await mitLadefehler()
    screen.getByRole('button', { name: 'Erneut versuchen' }).focus()

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { level: 1, name: 'Ausgabe erfassen' })).toBeInTheDocument()
    expect(imHauptbereich()).toBe(true)
  })
})
