import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import {
  erstelleFakeApi,
  offeneAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { zeigeMitRouter } from '../../../../test/router'
import { AusgabeDetailSeite } from '../index'

// Feature nacharbeiten-audit-filter, QA-Runde 1 W1 (AK-28, ADR-0047 Punkt 2): Nach „Erneut versuchen“ fällt der Fokus
// nicht auf body, weder während des Ladens noch nach erfolgreichem Laden. Seiten fallen auf `main#inhalt` zurück; das
// Ziel muss in Laden, Fehler und Inhalt eingehängt bleiben (4.9 Punkt 3). Die Seite steht wie in der App in
// `<main id="inhalt">`.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const AUSGABE_ID = '0199a1b2-0000-7000-8000-0000000000e7'
const AUSGABE = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+$/

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID, name: 'Coin Alpha', auflage: 150 })], {
    ausgaben: { [COIN_ID]: [testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12 })] },
  })
  vi.stubGlobal('fetch', api.fetch)
  setzeTokenQuelle(() => 'token-seite')
})

afterEach(() => {
  setzeTokenQuelle(null)
})

function zeige() {
  const user = userEvent.setup()
  zeigeMitRouter(
    () => (
      <main id="inhalt">
        <AusgabeDetailSeite coinId={COIN_ID} ausgabeId={AUSGABE_ID} darfZertifikat />
      </main>
    ),
    { pfad: '/coins/$coinId/ausgaben/$ausgabeId', start: `/coins/${COIN_ID}/ausgaben/${AUSGABE_ID}` },
  )
  return user
}

/** Fokus liegt nicht auf body, sondern in main#inhalt (main selbst oder ein Element darin). */
function imHauptbereich(): boolean {
  const aktiv = document.activeElement
  return aktiv !== null && aktiv !== document.body && aktiv.closest('main#inhalt') !== null
}

async function mitLadefehler() {
  api.einmal('GET', AUSGABE, problemAntwort(500))
  const user = zeige()
  await screen.findByRole('button', { name: 'Erneut versuchen' })
  return user
}

describe('Fokus nach „Erneut versuchen“ (W1, AK-28)', () => {
  it('lässt den Fokus während des Ladens nicht auf body fallen', async () => {
    const user = await mitLadefehler()
    const offen = offeneAntwort()
    api.einmal('GET', AUSGABE, offen.promise)

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(imHauptbereich()).toBe(true)
    offen.aufloesen(problemAntwort(500))
  })

  it('lässt den Fokus nach erfolgreichem Laden im Hauptbereich', async () => {
    const user = await mitLadefehler()

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 12' })).toBeInTheDocument()
    expect(imHauptbereich()).toBe(true)
  })

  it('lässt den Fokus per Enter nach erfolgreichem Laden im Hauptbereich', async () => {
    const user = await mitLadefehler()
    screen.getByRole('button', { name: 'Erneut versuchen' }).focus()

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 12' })).toBeInTheDocument()
    expect(imHauptbereich()).toBe(true)
  })
})
