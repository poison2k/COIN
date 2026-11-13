import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@/shared/lib/theme'
import { ToastProvider, Toaster } from '@/shared/ui/toast'
import { zeigeMitRouter } from '../../../../test/router'
import { BausteineSeite } from '../index'

// Feature design-fundament, AK-38, AK-43 (Abschnitt 9): Bausteinseite mit h1 „Bausteinübersicht“, je Baustein ein
// Abschnitt mit h2 in der Reihenfolge von Abschnitt 5, davor „Farben“ und „Schrift“; alle Zustände; nur deutsche
// Texte; kein API-Aufruf. Toast-Provider und Toaster stellt sonst die App-Shell bereit.

/** h2-Abschnitte in Reihenfolge (Abschnitt 5 und 9). Namen beginnen mit dem Bausteinnamen. */
const ABSCHNITTE: ReadonlyArray<[string, RegExp]> = [
  ['Farben', /^Farben\b/],
  ['Schrift', /^Schrift\b/],
  ['Button', /^Button\b/],
  ['Eingabefeld', /^Eingabefeld\b/],
  ['Textbereich', /^Textbereich\b/],
  ['Auswahl', /^Auswahl\b/],
  ['Checkbox', /^Checkbox\b/],
  ['Formularfeld', /^Formularfeld\b/],
  ['Karte', /^Karte\b/],
  ['Tabelle', /^Tabelle\b/],
  ['Badge / Status-Chip', /^(Badge|Status-Chip)\b/],
  ['Dialog', /^Dialog\b/],
  ['Hinweisbanner', /^Hinweisbanner\b/],
  ['Leerzustand', /^Leerzustand\b/],
  ['Ladeanzeige', /^Ladeanzeige\b/],
  ['Fehlerzustand', /^Fehlerzustand\b/],
  ['Spinner', /^Spinner\b/],
  ['Toast', /^Toast\b/],
  ['Seitenkopf', /^Seitenkopf\b/],
  ['Brotkrumen', /^Brotkrumen\b/],
]

/** Farbtokens aus Abschnitt 4.1. */
const TOKENS = [
  'background',
  'foreground',
  'card',
  'popover',
  'primary',
  'primary-foreground',
  'primary-hover',
  'secondary',
  'muted',
  'muted-foreground',
  'accent',
  'destructive',
  'destructive-subtle',
  'success',
  'success-subtle',
  'warning',
  'warning-subtle',
  'info',
  'info-subtle',
  'border',
  'input',
  'ring',
  'sidebar',
  'overlay',
  'logo-surface',
] as const

const SCHRIFTSTUFEN = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl'] as const

/** Englische Texte, die nicht im DOM stehen dürfen (AK-38). */
const ENGLISCH = /\b(Loading|Close|Toggle|More|breadcrumb|Notifications)\b/i

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn(() => Promise.reject(new Error('Kein API-Aufruf erwartet')))
  vi.stubGlobal('fetch', fetchSpy)
})

async function zeige() {
  const user = userEvent.setup()
  zeigeMitRouter(
    () => (
      <ThemeProvider defaultTheme="light" storageKey="coin-theme">
        <ToastProvider>
          <BausteineSeite />
          <Toaster />
        </ToastProvider>
      </ThemeProvider>
    ),
    { pfad: '/entwicklung/bausteine' },
  )
  await screen.findByRole('heading', { level: 1, name: 'Bausteinübersicht' })
  return user
}

/** h2-Überschriften in DOM-Reihenfolge. */
function h2Namen(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.trim() ?? '')
}

/** h2 eines Abschnitts der Seite (erste Überschrift, deren Name zum Muster passt). */
function abschnittUeberschrift(muster: RegExp): HTMLElement {
  const h2 = screen.getAllByRole('heading', { level: 2 }).find((h) => muster.test(h.textContent?.trim() ?? ''))
  expect(h2, `Abschnitt ${muster} fehlt`).toBeDefined()
  return h2 as HTMLElement
}

/** Abschnitts-Überschriften der Seite (h2, deren Name zu einem Muster aus ABSCHNITTE passt), in DOM-Reihenfolge. */
function grenzen(): HTMLElement[] {
  return screen
    .getAllByRole('heading', { level: 2 })
    .filter((h) => ABSCHNITTE.some(([, muster]) => muster.test(h.textContent?.trim() ?? '')))
}

/** Elemente, die im Dokument zwischen der Überschrift des Abschnitts und der nächsten Abschnitts-Überschrift liegen. */
function imAbschnitt<T extends Element>(muster: RegExp, elemente: T[]): T[] {
  const start = abschnittUeberschrift(muster)
  const alle = grenzen()
  const ende = alle[alle.indexOf(start) + 1]
  return elemente.filter(
    (el) =>
      (el as Element) !== start &&
      (start.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
      (!ende || (el.compareDocumentPosition(ende) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
  )
}

/** Elemente einer Rolle im Abschnitt. */
function rollen(muster: RegExp, rolle: string, optionen: { name?: string } = {}): HTMLElement[] {
  return imAbschnitt(muster, screen.queryAllByRole(rolle, optionen))
}

/** Texte der Blattelemente im Abschnitt. */
function blattTexte(muster: RegExp): string[] {
  return imAbschnitt(muster, [...document.body.querySelectorAll('*')])
    .filter((el) => el.children.length === 0)
    .map((el) => el.textContent?.trim() ?? '')
    .filter(Boolean)
}

/** Text samt aria-label, title, alt und placeholder aller Elemente. */
function alleTexte(wurzel: HTMLElement): string {
  const attribute = [...wurzel.querySelectorAll('*')].flatMap((el) =>
    ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
  )
  return [wurzel.textContent ?? '', ...attribute].join(' ')
}

describe('Aufbau (AK-38)', () => {
  it('hat die Überschrift „Bausteinübersicht“ als Ebene 1', async () => {
    await zeige()

    expect(screen.getByRole('heading', { level: 1, name: 'Bausteinübersicht' })).toBeInTheDocument()
  })

  it.each(ABSCHNITTE.map(([name, muster]) => [name, muster]))(
    'hat einen Abschnitt „%s“ als Ebene 2',
    async (_, muster) => {
      await zeige()

      expect(abschnittUeberschrift(muster as RegExp)).toBeInTheDocument()
    },
  )

  it('ordnet die Abschnitte wie in Abschnitt 5 an, „Farben“ und „Schrift“ vorneweg', async () => {
    await zeige()

    const namen = h2Namen()
    const positionen = ABSCHNITTE.map(([, muster]) => namen.findIndex((n) => muster.test(n)))
    expect(positionen.every((p) => p >= 0)).toBe(true)
    expect([...positionen].sort((a, b) => a - b)).toEqual(positionen)
  })
})

describe('Farben und Schrift (AK-38)', () => {
  it.each(TOKENS.map((t) => [t]))('zeigt im Abschnitt „Farben“ das Token „%s“', async (token) => {
    await zeige()

    const texte = blattTexte(/^Farben\b/)
    expect(texte.some((t) => new RegExp(`^(--|bg-)?${token}$`).test(t))).toBe(true)
  })

  it('verwendet für die Farbfelder keine Inline-Farben', async () => {
    await zeige()

    const mitStil = imAbschnitt(/^Farben\b/, [...document.body.querySelectorAll('[style]')]).filter((el) =>
      /#[0-9a-f]{3,8}|rgb|hsl|oklch/i.test(el.getAttribute('style') ?? ''),
    )
    expect(mitStil).toEqual([])
  })

  it.each(SCHRIFTSTUFEN.map((s) => [s]))('zeigt im Abschnitt „Schrift“ die Stufe „%s“', async (stufe) => {
    await zeige()

    expect(blattTexte(/^Schrift\b/).join(' ')).toMatch(new RegExp(`(^|[^\\w-])(text-)?${stufe}\\b`))
  })
})

describe('Varianten und Zustände (AK-38)', () => {
  it('zeigt einen Button im Zustand „lädt“ (aria-busy)', async () => {
    await zeige()

    const buttons = rollen(/^Button\b/, 'button')
    expect(buttons.some((b) => b.getAttribute('aria-busy') === 'true')).toBe(true)
  })

  it('zeigt einen deaktivierten Button', async () => {
    await zeige()

    const buttons = rollen(/^Button\b/, 'button')
    expect(buttons.some((b) => b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true')).toBe(true)
  })

  it('zeigt mindestens sieben Buttons (vier Varianten, Größen, Zustände)', async () => {
    await zeige()

    expect(rollen(/^Button\b/, 'button').length).toBeGreaterThanOrEqual(7)
  })

  it('zeigt ein Eingabefeld mit Fehler (aria-invalid)', async () => {
    await zeige()

    const felder = rollen(/^Eingabefeld\b/, 'textbox')
    expect(felder.some((f) => f.getAttribute('aria-invalid') === 'true')).toBe(true)
  })

  it('zeigt ein deaktiviertes Eingabefeld', async () => {
    await zeige()

    expect(rollen(/^Eingabefeld\b/, 'textbox').some((f) => f.hasAttribute('disabled'))).toBe(true)
  })

  it('zeigt Checkboxen an, aus, unbestimmt und deaktiviert', async () => {
    await zeige()

    const boxen = rollen(/^Checkbox\b/, 'checkbox')
    const zustaende = boxen.map((b) => b.getAttribute('aria-checked'))
    expect(zustaende).toEqual(expect.arrayContaining(['true', 'false', 'mixed']))
    expect(boxen.some((b) => b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true')).toBe(true)
  })

  it('zeigt ein Formularfeld mit Fehler, Hilfetext und „(Pflicht)“', async () => {
    await zeige()

    expect(blattTexte(/^Formularfeld\b/).join(' ')).toContain('(Pflicht)')
    expect(rollen(/^Formularfeld\b/, 'textbox').some((f) => f.getAttribute('aria-invalid') === 'true')).toBe(true)
  })

  it('zeigt eine Beispieltabelle', async () => {
    await zeige()

    expect(rollen(/^Tabelle\b/, 'table').length).toBeGreaterThan(0)
  })

  it('zeigt mindestens vier Hinweisbanner (info, success, warning, destructive)', async () => {
    await zeige()

    const banner = [...rollen(/^Hinweisbanner\b/, 'alert'), ...rollen(/^Hinweisbanner\b/, 'status')]
    expect(banner.length).toBeGreaterThanOrEqual(4)
  })

  it('zeigt einen Fehlerzustand mit „Erneut versuchen“', async () => {
    await zeige()

    expect(rollen(/^Fehlerzustand\b/, 'button', { name: 'Erneut versuchen' }).length).toBeGreaterThan(0)
  })

  it('zeigt eine Ladeanzeige als Status', async () => {
    await zeige()

    expect(rollen(/^Ladeanzeige\b/, 'status').length).toBeGreaterThan(0)
  })

  it('zeigt einen Spinner „Wird geladen“', async () => {
    await zeige()

    expect(rollen(/^Spinner\b/, 'status', { name: 'Wird geladen' }).length).toBeGreaterThan(0)
  })

  it('zeigt Brotkrumen als Navigation „Brotkrumen“', async () => {
    await zeige()

    expect(rollen(/^Brotkrumen\b/, 'navigation', { name: 'Brotkrumen' }).length).toBeGreaterThan(0)
  })

  it('öffnet den Dialog per Button', async () => {
    const user = await zeige()

    await user.click(rollen(/^Dialog\b/, 'button')[0])

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('zeigt einen Toast per Button in der Region „Benachrichtigungen“', async () => {
    const user = await zeige()

    await user.click(rollen(/^Toast\b/, 'button')[0])

    const region = screen.getByRole('region', { name: 'Benachrichtigungen' })
    expect(await within(region).findByRole('button', { name: 'Meldung schließen' })).toBeInTheDocument()
  })
})

describe('Deutsche Texte und Daten (AK-38, AK-43)', () => {
  it('enthält keine englischen Texte', async () => {
    await zeige()

    expect(alleTexte(document.body)).not.toMatch(ENGLISCH)
  })

  it('enthält mit geöffnetem Dialog keine englischen Texte', async () => {
    const user = await zeige()
    await user.click(rollen(/^Dialog\b/, 'button')[0])
    await screen.findByRole('dialog')

    expect(alleTexte(document.body)).not.toMatch(ENGLISCH)
  })

  it('nennt den Schließen-Button des Dialogs „Schließen“', async () => {
    const user = await zeige()
    await user.click(rollen(/^Dialog\b/, 'button')[0])

    expect(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Schließen' })).toBeInTheDocument()
  })

  it('gibt allen Icon-Buttons einen zugänglichen Namen', async () => {
    await zeige()

    const ohneName = screen
      .getAllByRole('button')
      .filter(
        (b) =>
          (b.textContent ?? '').trim() === '' && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'),
      )
    expect(ohneName.map((b) => b.outerHTML.slice(0, 80))).toEqual([])
  })

  it('löst keinen API-Aufruf aus', async () => {
    await zeige()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('enthält keine E-Mail-Adressen (nur synthetische Daten)', async () => {
    await zeige()

    expect(document.body.textContent).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
  })
})
