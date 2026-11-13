import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, Toaster, useToast } from './toast'

// Feature design-fundament, AK-22 (ADR-0038): Toast mit Base UI. `zeige` blendet Titel und Beschreibung in der Region
// „Benachrichtigungen“ ein; fehler/warnung bleiben, erfolg/info verschwinden nach 6 s (außer bei Hover/Fokus);
// höchstens 3 sichtbar; die Art steht als sr-only-Text. Timer sind gefälscht.

type Art = 'erfolg' | 'info' | 'warnung' | 'fehler'

const PRAEFIX: Readonly<Record<Art, string>> = {
  erfolg: 'Erfolg:',
  info: 'Hinweis:',
  warnung: 'Warnung:',
  fehler: 'Fehler:',
}

let zaehler = 0

function Ausloeser({ art, beschreibung }: { art: Art; beschreibung?: string }) {
  const { zeige } = useToast()
  return (
    <button type="button" onClick={() => zeige({ titel: `Meldung ${++zaehler}`, beschreibung, art })}>
      {`Zeige ${art}`}
    </button>
  )
}

function zeigeMit(...arten: Art[]) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(
    <ToastProvider>
      {arten.map((art) => (
        <Ausloeser key={art} art={art} beschreibung={`Beschreibung ${art}`} />
      ))}
      <Toaster />
    </ToastProvider>,
  )
  return user
}

function region(): HTMLElement {
  return screen.getByRole('region', { name: 'Benachrichtigungen' })
}

/** Schließen-Buttons der Toasts, die nicht per Limit ausgeblendet (inert) sind. */
function sichtbareToasts(): HTMLElement[] {
  return within(region())
    .queryAllByRole('button', { name: 'Meldung schließen' })
    .filter((b) => b.closest('[inert]') === null && b.closest('[data-limited]') === null)
}

async function warte(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  zaehler = 0
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Anzeige (AK-22)', () => {
  it('stellt die Region „Benachrichtigungen“ bereit', () => {
    zeigeMit('info')

    expect(region()).toBeInTheDocument()
  })

  it('blendet Titel und Beschreibung in der Region ein', async () => {
    const user = zeigeMit('info')

    await user.click(screen.getByRole('button', { name: 'Zeige info' }))

    expect(await within(region()).findByText('Meldung 1')).toBeInTheDocument()
    expect(within(region()).getByText('Beschreibung info')).toBeInTheDocument()
  })

  it('hat je Toast einen Button „Meldung schließen“', async () => {
    const user = zeigeMit('info', 'fehler')

    await user.click(screen.getByRole('button', { name: 'Zeige info' }))
    await user.click(screen.getByRole('button', { name: 'Zeige fehler' }))

    await waitFor(() => expect(within(region()).getAllByRole('button', { name: 'Meldung schließen' })).toHaveLength(2))
  })

  it('schließt den Toast über „Meldung schließen“', async () => {
    const user = zeigeMit('fehler')
    await user.click(screen.getByRole('button', { name: 'Zeige fehler' }))
    await within(region()).findByText('Meldung 1')

    await user.click(within(region()).getByRole('button', { name: 'Meldung schließen' }))

    await waitFor(() => expect(within(region()).queryByText('Meldung 1')).not.toBeInTheDocument())
  })

  it.each(Object.entries(PRAEFIX) as Array<[Art, string]>)('nennt die Art „%s“ als Text „%s“', async (art, praefix) => {
    const user = zeigeMit(art)

    await user.click(screen.getByRole('button', { name: `Zeige ${art}` }))

    await waitFor(() => expect(region()).toHaveTextContent(praefix))
  })

  it('blendet Icons im Toast für Screenreader aus', async () => {
    const user = zeigeMit('erfolg')
    await user.click(screen.getByRole('button', { name: 'Zeige erfolg' }))
    await within(region()).findByText('Meldung 1')

    const icons = [...region().querySelectorAll('svg')]
    expect(icons.length).toBeGreaterThan(0)
    expect(icons.filter((icon) => icon.closest('[aria-hidden="true"]') === null)).toEqual([])
  })

  it('enthält keine englischen Texte', async () => {
    const user = zeigeMit('fehler')
    await user.click(screen.getByRole('button', { name: 'Zeige fehler' }))
    await within(region()).findByText('Meldung 1')

    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title'].map((a) => el.getAttribute(a) ?? ''),
    )
    expect([document.body.textContent, ...attribute].join(' ')).not.toMatch(/\b(Notifications|Close|Dismiss)\b/i)
  })
})

describe('Dauer (AK-22)', () => {
  it.each(['erfolg', 'info'] as const)('lässt „%s“ nach 6 s verschwinden', async (art) => {
    const user = zeigeMit(art)
    await user.click(screen.getByRole('button', { name: `Zeige ${art}` }))
    await within(region()).findByText('Meldung 1')

    await warte(6500)

    await waitFor(() => expect(within(region()).queryByText('Meldung 1')).not.toBeInTheDocument())
  })

  it.each(['erfolg', 'info'] as const)('zeigt „%s“ nach 5 s noch an', async (art) => {
    const user = zeigeMit(art)
    await user.click(screen.getByRole('button', { name: `Zeige ${art}` }))
    await within(region()).findByText('Meldung 1')

    await warte(5000)

    expect(within(region()).getByText('Meldung 1')).toBeInTheDocument()
  })

  it.each(['fehler', 'warnung'] as const)('lässt „%s“ stehen', async (art) => {
    const user = zeigeMit(art)
    await user.click(screen.getByRole('button', { name: `Zeige ${art}` }))
    await within(region()).findByText('Meldung 1')

    await warte(30_000)

    expect(within(region()).getByText('Meldung 1')).toBeInTheDocument()
  })

  it('pausiert „erfolg“, solange der Mauszeiger über der Meldung steht', async () => {
    const user = zeigeMit('erfolg')
    await user.click(screen.getByRole('button', { name: 'Zeige erfolg' }))
    const titel = await within(region()).findByText('Meldung 1')

    await user.hover(titel)
    await warte(10_000)

    expect(within(region()).getByText('Meldung 1')).toBeInTheDocument()
  })

  it('pausiert „erfolg“, solange die Meldung den Fokus hat', async () => {
    const user = zeigeMit('erfolg')
    await user.click(screen.getByRole('button', { name: 'Zeige erfolg' }))
    await within(region()).findByText('Meldung 1')

    act(() => within(region()).getByRole('button', { name: 'Meldung schließen' }).focus())
    await warte(10_000)

    expect(within(region()).getByText('Meldung 1')).toBeInTheDocument()
  })
})

describe('Anzahl (AK-22)', () => {
  it('zeigt höchstens 3 Meldungen gleichzeitig', async () => {
    const user = zeigeMit('fehler')

    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: 'Zeige fehler' }))

    await waitFor(() => expect(sichtbareToasts()).toHaveLength(3))
  })

  it('zeigt bei 4 Meldungen die drei neuesten', async () => {
    const user = zeigeMit('fehler')

    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: 'Zeige fehler' }))

    await waitFor(() => expect(sichtbareToasts()).toHaveLength(3))
    const aelteste = within(region()).queryByText('Meldung 1')
    expect(aelteste === null || aelteste.closest('[inert], [data-limited]') !== null).toBe(true)
    expect(within(region()).getByText('Meldung 4').closest('[inert], [data-limited]')).toBeNull()
  })
})

// QA-Runde 2 (ADR-0038 Punkt 2): dauerhafte, unsichtbare Ansage-Region ohne Rolle neben dem Viewport. Angesagt wird nur
// beim Hinzufügen; Schließen oder Ablaufen ändern die Region nicht; jede neue Meldung ist ein neuer Knoten.

/** Die einzige Live-Region `[aria-live="polite"][aria-atomic="true"]` außerhalb des Viewports. */
function ansage(): HTMLElement {
  const kandidaten = [...document.querySelectorAll<HTMLElement>('[aria-live="polite"][aria-atomic="true"]')].filter(
    (el) => !region().contains(el),
  )
  expect(kandidaten).toHaveLength(1)
  return kandidaten[0]
}

/** Schließen-Button der Meldung mit dem Titel (kleinster Vorfahr, der genau einen Schließen-Button enthält). */
function schliessenVon(titel: string): HTMLElement {
  let knoten: HTMLElement | null = within(region()).getByText(titel)
  while (knoten && within(knoten).queryAllByRole('button', { name: 'Meldung schließen' }).length !== 1) {
    knoten = knoten.parentElement
  }
  expect(knoten).not.toBeNull()
  return within(knoten as HTMLElement).getByRole('button', { name: 'Meldung schließen' })
}

function GleicherAusloeser() {
  const { zeige } = useToast()
  return (
    <button type="button" onClick={() => zeige({ titel: 'Gespeichert', art: 'erfolg' })}>
      Zeige gleich
    </button>
  )
}

describe('Ansage-Region (ADR-0038 Punkt 2)', () => {
  it('ist ohne Meldung im DOM, nicht ausgeblendet und ohne Rolle', () => {
    zeigeMit('erfolg')

    const el = ansage()
    expect(el).not.toHaveAttribute('role')
    expect(el.closest('[hidden]')).toBeNull()
    expect(getComputedStyle(el).display).not.toBe('none')
    expect(el.textContent?.trim()).toBe('')
  })

  it('setzt bei einer neuen Meldung den Inhalt mit Präfix', async () => {
    const user = zeigeMit('erfolg')

    await user.click(screen.getByRole('button', { name: 'Zeige erfolg' }))

    await waitFor(() => expect(ansage()).toHaveTextContent(/^Erfolg: Meldung 1/))
  })

  it('ändert den Inhalt nicht, wenn die neueste Meldung geschlossen wird und eine ältere sichtbar bleibt', async () => {
    const user = zeigeMit('fehler')
    await user.click(screen.getByRole('button', { name: 'Zeige fehler' }))
    await user.click(screen.getByRole('button', { name: 'Zeige fehler' }))
    await waitFor(() => expect(ansage()).toHaveTextContent(/^Fehler: Meldung 2/))
    const vorher = ansage().textContent

    await user.click(schliessenVon('Meldung 2'))
    await waitFor(() => expect(within(region()).queryByText('Meldung 2')).not.toBeInTheDocument())

    expect(within(region()).getByText('Meldung 1')).toBeInTheDocument()
    expect(ansage().textContent).toBe(vorher)
  })

  it('ersetzt bei einer zweiten gleichen Meldung den Kindknoten durch einen neuen Knoten', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <ToastProvider>
        <GleicherAusloeser />
        <Toaster />
      </ToastProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Zeige gleich' }))
    await waitFor(() => expect(ansage()).toHaveTextContent('Gespeichert'))
    const ersterKnoten = ansage().firstChild

    await user.click(screen.getByRole('button', { name: 'Zeige gleich' }))
    await waitFor(() => expect(within(region()).getAllByText('Gespeichert')).toHaveLength(2))

    expect(ansage()).toHaveTextContent('Gespeichert')
    expect(ansage().firstChild).not.toBe(ersterKnoten)
  })

  it('stellt den Viewport auf aria-live="off"', () => {
    zeigeMit('info')

    expect(region()).toHaveAttribute('aria-live', 'off')
  })
})
