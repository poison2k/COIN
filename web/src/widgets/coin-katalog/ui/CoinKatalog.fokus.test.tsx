import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  erstelleFakeApi,
  jsonAntwort,
  offeneAntwort,
  problemAntwort,
  seiteAntwort,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinKatalog } from '../index'

// Feature nacharbeiten-audit-filter, AK-28 (Abschnitt 4.9, ADR-0047 Punkt 2): Nach „Erneut versuchen“ im Katalog liegt
// der Fokus im Inhaltsbereich des Widgets (`data-inhaltsbereich`, eingehängt in Laden, Fehler und Inhalt), nie auf body.

const GET_LISTE = /^\/api\/coins$/
let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin()])
  vi.stubGlobal('fetch', api.fetch)
})

function imInhaltsbereich(): boolean {
  const aktiv = document.activeElement
  return aktiv !== null && aktiv !== document.body && aktiv.closest('[data-inhaltsbereich]') !== null
}

async function mitLadefehler() {
  api.einmal('GET', GET_LISTE, problemAntwort(500))
  const user = userEvent.setup()
  zeigeMitRouter(() => <CoinKatalog suche="" seite={1} onSuche={() => {}} onSeite={() => {}} />, { pfad: '/coins' })
  await screen.findByRole('button', { name: 'Erneut versuchen' })
  return user
}

describe('Fokus nach „Erneut versuchen“ im Katalog (AK-28)', () => {
  it('legt den Fokus während des Ladens in den Inhaltsbereich', async () => {
    const user = await mitLadefehler()
    const offen = offeneAntwort()
    api.einmal('GET', GET_LISTE, offen.promise)

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(imInhaltsbereich()).toBe(true)
    offen.aufloesen(jsonAntwort(200, seiteAntwort([testCoin()])))
  })

  it('lässt den Fokus nach erfolgreichem Laden im Inhaltsbereich', async () => {
    const user = await mitLadefehler()

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    await screen.findByRole('link', { name: testCoin().name })
    expect(imInhaltsbereich()).toBe(true)
  })

  it('lässt den Fokus bei erneutem Fehler auf demselben Ziel und zeigt den Alarm', async () => {
    const user = await mitLadefehler()
    api.einmal('GET', GET_LISTE, problemAntwort(503))

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    const ziel = document.activeElement

    await waitFor(() => expect(api.anfragenMit('GET', GET_LISTE).length).toBeGreaterThanOrEqual(2))
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(document.activeElement).toBe(ziel)
    expect(imInhaltsbereich()).toBe(true)
    expect(document.activeElement?.closest('[role="alert"]')).toBeNull()
  })
})
