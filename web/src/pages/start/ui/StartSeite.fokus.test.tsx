import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import { erstelleFakeApi, offeneAntwort, problemAntwort, type FakeApi } from '../../../../test/fakeApi'
import { zeigeMitRouter } from '../../../../test/router'
import { kennzahlenBlock, neuesteBlock, testStartseite } from '../../../../test/startseite'
import { StartSeite } from '../index'

// Feature nacharbeiten-audit-filter, AK-28 (Abschnitt 4.9 Punkt 3, ADR-0047 Punkt 2): Seiten fallen auf `main#inhalt`
// zurück. Nach „Erneut versuchen“ auf der Startseite liegt der Fokus in main#inhalt (auf seiner h1 bzw. main selbst),
// auch während des Ladens und nach erfolgreichem Laden, nie auf body.

const STARTSEITE = /^\/api\/startseite$/
let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], {
    me: ME.betrachter,
    startseite: { ansicht: testStartseite([kennzahlenBlock(), neuesteBlock()]) },
  })
  vi.stubGlobal('fetch', api.fetch)
})

function imHauptbereich(): boolean {
  const aktiv = document.activeElement
  return aktiv !== null && aktiv !== document.body && aktiv.closest('main#inhalt') !== null
}

async function mitLadefehler() {
  api.einmal('GET', STARTSEITE, problemAntwort(500))
  const user = userEvent.setup()
  zeigeMitRouter(
    () => (
      <main id="inhalt">
        <StartSeite darfAnsehen />
      </main>
    ),
    { pfad: '/' },
  )
  await screen.findByRole('button', { name: 'Erneut versuchen' })
  return user
}

describe('Fokus nach „Erneut versuchen“ auf der Startseite (AK-28)', () => {
  it('lässt den Fokus während des Ladens im Hauptbereich', async () => {
    const user = await mitLadefehler()
    const offen = offeneAntwort()
    api.einmal('GET', STARTSEITE, offen.promise)

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(imHauptbereich()).toBe(true)
    offen.aufloesen(problemAntwort(500))
  })

  it('lässt den Fokus nach erfolgreichem Laden im Hauptbereich', async () => {
    const user = await mitLadefehler()

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    await screen.findByRole('region', { name: 'Kennzahlen' })
    expect(imHauptbereich()).toBe(true)
  })

  it('lässt den Fokus bei erneutem Fehler im Hauptbereich und zeigt den Alarm', async () => {
    const user = await mitLadefehler()
    api.einmal('GET', STARTSEITE, problemAntwort(503))

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    await waitFor(() => expect(api.anfragenMit('GET', STARTSEITE)).toHaveLength(2))
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(imHauptbereich()).toBe(true)
  })
})
