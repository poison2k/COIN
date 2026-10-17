import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import { ME, erstelleTestAnmeldung, type TestAnmeldung, type TestBenutzer } from '../../test/anmeldung'
import { erstelleFakeApi, testAusgabe, testCoin, type FakeApi } from '../../test/fakeApi'
import App from './App'
import { erstelleRouter } from './router/router'

// Feature zertifikat-erzeugen im Zusammenspiel von App, Router, Guards und Seiten: AK-24 (Spalte „Zertifikat“ je
// Berechtigung), AK-27 (Guard der Ausgabe-Seite mit issues.read), AK-29 (keine …/zertifikat-Requests ohne
// issues.write, keine …/ausgaben-Requests ohne issues.read), AK-30 (deutsche Texte, genau ein h1).

const TEXTE = {
  ohneBerechtigung:
    'Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.',
  deaktiviert: 'Ihr Benutzerkonto ist deaktiviert.',
  keineRolle: 'Ihrem Konto ist aber noch keine Rolle zugewiesen',
} as const

const ENGLISCH =
  /\b(Sign ?in|Sign ?out|Loading|Error|Unauthorized|Forbidden|Not Found|Not found|Back|Certificate|Download|Recipient|Reason|Occasion|Issued|Issue|Show|View|Cancelled|disabled)\b/

const ALPHA = testCoin({ id: '0199a1b2-0000-7000-8000-0000000000a1', name: 'Coin Alpha', auflage: 150 })
const AUSGABE_ID = '0199a1b2-0000-7000-8000-0000000000e7'
const AUSGABEN: Ausgabe[] = [testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12 })]
const SEITE = `/coins/${ALPHA.id}/ausgaben/${AUSGABE_ID}`
const DETAIL = `/coins/${ALPHA.id}`
const ZERTIFIKAT = /\/zertifikat$/

let api: FakeApi

function zeigeApp(pfad: string, als: TestBenutzer | 'deaktiviert' | 'anonym' = 'sachbearbeiter') {
  const me = als === 'deaktiviert' ? 'deaktiviert' : als === 'anonym' ? null : ME[als]
  api = erstelleFakeApi([ALPHA], { me, ausgaben: { [ALPHA.id]: AUSGABEN.map((a) => structuredClone(a)) } })
  vi.stubGlobal('fetch', api.fetch)
  const anmeldung: TestAnmeldung = erstelleTestAnmeldung(
    als === 'anonym' ? 'anonym' : 'angemeldet',
    als === 'deaktiviert' || als === 'anonym' ? ME.admin.name : ME[als].name,
  )
  const user = userEvent.setup()
  const router = erstelleRouter(createMemoryHistory({ initialEntries: [pfad] }))
  render(<App router={router} userManager={anmeldung.userManager} />)
  return { user, router, anmeldung }
}

function seitenText(): string {
  return document.body.textContent?.replace(/\s+/g, ' ') ?? ''
}

function alleTexte(): string {
  const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
    ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
  )
  return [document.body.textContent ?? '', ...attribute].join(' ')
}

function zielAus(anmeldung: TestAnmeldung): unknown {
  const args = anmeldung.signinRedirect.mock.calls.at(-1)?.[0] as { state?: { ziel?: unknown } } | undefined
  return args?.state?.ziel
}

const ueberschrift = () => screen.findByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 12' })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T09:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------- AK-27: Guard der Ausgabe-Seite ----------

describe('/coins/{id}/ausgaben/{ausgabeId} – Zugriff', () => {
  it.each(['admin', 'sachbearbeiter'] as const)('zeigt %s die Seite „Ausgabe“', async (als) => {
    zeigeApp(SEITE, als)

    expect(await ueberschrift()).toBeInTheDocument()
  })

  it('leitet den Betrachter nach /kein-zugriff?grund=berechtigung', async () => {
    const { router } = zeigeApp(SEITE, 'betrachter')

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    expect(router.state.location.search).toEqual({ grund: 'berechtigung' })
  })

  it('zeigt dem Betrachter „Kein Zugriff“ mit dem Text für fehlende Berechtigung', async () => {
    zeigeApp(SEITE, 'betrachter')

    expect(await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeInTheDocument()
    await waitFor(() => expect(seitenText()).toContain(TEXTE.ohneBerechtigung))
  })

  it('sendet als Betrachter keinen Request auf …/ausgaben', async () => {
    zeigeApp(SEITE, 'betrachter')
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    expect(api.anfragen.filter((a) => a.pfad.includes('/ausgaben'))).toEqual([])
  })

  it('leitet Benutzer ohne Rolle nach /kein-zugriff mit dem Text für „keine Rolle“', async () => {
    const { router } = zeigeApp(SEITE, 'keine')

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    await waitFor(() => expect(seitenText()).toContain(TEXTE.keineRolle))
  })

  it('leitet Deaktivierte nach /kein-zugriff mit dem Deaktiviert-Text', async () => {
    const { router } = zeigeApp(SEITE, 'deaktiviert')

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    await waitFor(() => expect(seitenText()).toContain(TEXTE.deaktiviert))
  })

  it('startet anonym die Anmeldung mit Rückkehrziel', async () => {
    const { anmeldung } = zeigeApp(SEITE, 'anonym')

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
    expect(zielAus(anmeldung)).toBe(SEITE)
  })

  it('zeigt für eine Ausgabe-Id ohne GUID-Format „Ausgabe nicht gefunden“ ohne API-Aufruf auf die Ausgabe', async () => {
    zeigeApp(`/coins/${ALPHA.id}/ausgaben/keine-guid`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Ausgabe nicht gefunden' })).toBeInTheDocument()
    expect(api.anfragen.filter((a) => a.pfad.includes('/ausgaben/'))).toEqual([])
  })

  it('lässt /coins/{id}/ausgaben/neu die Seite „Ausgabe erfassen“', async () => {
    zeigeApp(`/coins/${ALPHA.id}/ausgaben/neu`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Ausgabe erfassen' })).toBeInTheDocument()
    expect(api.anfragen.filter((a) => a.pfad === `/api/coins/${ALPHA.id}/ausgaben/neu`)).toEqual([])
  })

  it('hat genau eine Überschrift der Ebene 1', async () => {
    zeigeApp(SEITE)
    await ueberschrift()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('zeigt keine englischen Texte, auch nicht in Attributen', async () => {
    zeigeApp(SEITE)
    await ueberschrift()
    await screen.findByRole('button', { name: /Zertifikat.*herunterladen/ })

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })
})

// ---------- AK-24, AK-29: Detailseite je Berechtigung ----------

describe('Detailseite – Spalte „Zertifikat“', () => {
  it.each(['admin', 'sachbearbeiter'] as const)('zeigt %s Link und Button je Ausgabe', async (als) => {
    zeigeApp(DETAIL, als)

    const tabelle = await screen.findByRole('table', { name: 'Ausgabehistorie' })
    expect(within(tabelle).getByRole('link', { name: 'Ausgabe C0042-0012 anzeigen' })).toBeInTheDocument()
    expect(within(tabelle).getByRole('button', { name: 'Zertifikat C0042-0012 herunterladen' })).toBeInTheDocument()
  })

  it('führt über den Link zur Ausgabe-Seite', async () => {
    const { user, router } = zeigeApp(DETAIL)
    const tabelle = await screen.findByRole('table', { name: 'Ausgabehistorie' })

    await user.click(within(tabelle).getByRole('link', { name: 'Ausgabe C0042-0012 anzeigen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(SEITE))
    expect(await ueberschrift()).toBeInTheDocument()
  })

  it('sendet als Betrachter weder Requests auf …/ausgaben noch auf …/zertifikat', async () => {
    zeigeApp(DETAIL, 'betrachter')
    await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })

    expect(api.anfragen.filter((a) => a.pfad.includes('/ausgaben') || ZERTIFIKAT.test(a.pfad))).toEqual([])
    expect(screen.queryByRole('button', { name: /Zertifikat/ })).not.toBeInTheDocument()
  })

  it('sendet beim Anzeigen der Detailseite keinen Request auf …/zertifikat', async () => {
    zeigeApp(DETAIL)
    await screen.findByRole('table', { name: 'Ausgabehistorie' })

    expect(api.anfragen.filter((a) => ZERTIFIKAT.test(a.pfad))).toEqual([])
  })

  it('zeigt auf der Detailseite keine englischen Texte, auch nicht in Attributen', async () => {
    zeigeApp(DETAIL)
    await screen.findByRole('table', { name: 'Ausgabehistorie' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })
})
