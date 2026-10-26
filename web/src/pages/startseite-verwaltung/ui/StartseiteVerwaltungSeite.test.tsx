import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import { erstelleFakeApi, offeneAntwort, problemAntwort, testDatei, type FakeApi } from '../../../../test/fakeApi'
import { seitentext } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import {
  BLOCK_NAMEN,
  gespeicherteKonfiguration,
  konfigurationAus,
  STANDARD_INFOTEXT,
  teileVon,
  testKonfiguration,
  testLogoMeta,
  type BlockArt,
} from '../../../../test/startseite'
import { StartseiteVerwaltungSeite } from '../index'

// Feature startseite, AK-7, AK-8, AK-10, AK-27 bis AK-31 und AK-33: Konfigurationsseite „Startseite verwalten“ mit den
// Tabs „Bearbeiten“ und „Vorschau“. Je Block eine Karte mit h2, Switch „{Block} anzeigen“ und Verschieben-Buttons;
// Kopfbereich mit Titel, Untertitel und zwei Logo-Plätzen; Infotext mit Zähler; Anzahl je Liste; Vorschau ohne
// Speichern; Client-Vorprüfung und Abbildung der Serverfehler. Die Seite ist frei von Router-Hooks (onGeaendert als Prop).

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], { me: ME.admin })
  vi.stubGlobal('fetch', api.fetch)
})

function zeige(onGeaendert = vi.fn()) {
  const user = userEvent.setup({ applyAccept: false })
  zeigeMitRouter(() => <StartseiteVerwaltungSeite onGeaendert={onGeaendert} />)
  return { user, onGeaendert }
}

/** Wartet, bis die Konfiguration geladen ist (Karte „Kopfbereich“ sichtbar). */
async function geladen(): Promise<void> {
  await screen.findByRole('switch', { name: 'Kopfbereich anzeigen' })
}

/** Kleinster Bereich, der die h2 des Blocks und seinen Switch enthält (die Karte). */
function karte(art: BlockArt): HTMLElement {
  const name = BLOCK_NAMEN[art]
  const ueberschrift = screen.getByRole('heading', { level: 2, name })
  let element: HTMLElement | null = ueberschrift.parentElement
  while (element && !within(element).queryByRole('switch', { name: `${name} anzeigen` }))
    element = element.parentElement
  if (!element) throw new Error(`Karte „${name}“ nicht gefunden.`)
  return element
}

/** Kleinster Bereich mit der Beschriftung des Logo-Platzes und genau einem Dateifeld. */
function logoBereich(platz: 'bereitsteller' | 'software'): HTMLElement {
  const name = platz === 'bereitsteller' ? 'Logo des Bereitstellers' : 'Logo der Software'
  const beschriftung = screen.getAllByText(name, { exact: true })[0]
  let element: HTMLElement | null = beschriftung.parentElement
  while (element && within(element).queryAllByLabelText('Logo auswählen').length !== 1) element = element.parentElement
  if (!element) throw new Error(`Bereich „${name}“ nicht gefunden.`)
  return element
}

/** h2-Überschriften der Karten im Tab „Bearbeiten“ in DOM-Reihenfolge. */
function kartenReihenfolge(): string[] {
  const namen = Object.values(BLOCK_NAMEN) as string[]
  return screen
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.textContent?.trim() ?? '')
    .filter((t) => namen.includes(t))
}

function puts() {
  return api.anfragenMit('PUT', /^\/api\/startseite\/konfiguration$/)
}

function istGesperrt(element: HTMLElement): boolean {
  return element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true'
}

/** Alle Eingaben und Buttons im Formular „Bearbeiten“. */
function bedienelemente(): HTMLElement[] {
  const formular = screen.getByRole('button', { name: 'Speichern' }).closest('form')
  if (!formular) throw new Error('Formular nicht gefunden.')
  const bereich = within(formular)
  return [
    ...bereich.getAllByRole('textbox'),
    ...bereich.getAllByRole('switch'),
    ...bereich.getAllByRole('combobox'),
    ...bereich.getAllByRole('button'),
    ...bereich.getAllByLabelText('Logo auswählen'),
  ]
}

function beschreibe(element: HTMLElement): string {
  return element.getAttribute('aria-label') ?? (element.textContent?.trim() || element.id || element.tagName)
}

/** Status-Bereich (role="status"), dessen Text genau `text` ist. */
function statusMit(text: string): HTMLElement | undefined {
  return screen.getAllByRole('status').find((s) => s.textContent?.trim() === text)
}

/** Textknoten im Element, der `text` enthält (zeigt, ob eine Ansage neu gesetzt wurde). */
function textknoten(element: HTMLElement | undefined, text: string): Node | null {
  if (!element) return null
  const laeufer = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let knoten = laeufer.nextNode(); knoten; knoten = laeufer.nextNode())
    if (knoten.textContent?.includes(text)) return knoten
  return null
}

const KONFIGURATION_PFAD = /^\/api\/startseite\/konfiguration$/

async function speichern(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Speichern' }))
}

// ---------- AK-27: Aufbau ----------

describe('Aufbau (AK-27)', () => {
  it('hat genau ein h1 „Startseite verwalten“', async () => {
    zeige()
    await geladen()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Startseite verwalten' })).toBeInTheDocument()
  })

  it('lädt GET /api/startseite/konfiguration', async () => {
    zeige()
    await geladen()

    expect(api.anfragenMit('GET', /^\/api\/startseite\/konfiguration$/)).toHaveLength(1)
  })

  it('hat die Tabs „Bearbeiten“ und „Vorschau“, „Bearbeiten“ ist ausgewählt', async () => {
    zeige()
    await geladen()

    expect(screen.getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual(['Bearbeiten', 'Vorschau'])
    expect(screen.getByRole('tab', { name: 'Bearbeiten' })).toHaveAttribute('aria-selected', 'true')
  })

  it('zeigt je Block eine Karte mit h2 in der Reihenfolge der Konfiguration', async () => {
    api.startseite.konfiguration = testKonfiguration({
      reihenfolge: ['neueste', 'kopf', 'infotext', 'kennzahlen', 'meistausgegeben'],
    })
    zeige()
    await geladen()

    expect(kartenReihenfolge()).toEqual([
      'Neueste Coins',
      'Kopfbereich',
      'Infotext',
      'Kennzahlen',
      'Meistausgegebene Coins',
    ])
  })

  it.each(Object.values(BLOCK_NAMEN))('hat für „%s“ einen Switch „… anzeigen“', async (name) => {
    zeige()
    await geladen()

    expect(screen.getByRole('switch', { name: `${name} anzeigen` })).toBeInTheDocument()
  })

  it('zeigt die Schalter laut Konfiguration (Kopfbereich aus, Infotext an)', async () => {
    zeige()
    await geladen()

    expect(screen.getByRole('switch', { name: 'Kopfbereich anzeigen' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Infotext anzeigen' })).toHaveAttribute('aria-checked', 'true')
  })

  it.each(Object.values(BLOCK_NAMEN))('hat für „%s“ Buttons zum Verschieben nach oben und unten', async (name) => {
    zeige()
    await geladen()

    expect(screen.getByRole('button', { name: `${name} nach oben verschieben` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `${name} nach unten verschieben` })).toBeInTheDocument()
  })

  it('hat im Kopfbereich die Felder Titel und Untertitel mit den Werten der Konfiguration', async () => {
    zeige()
    await geladen()

    expect(within(karte('kopf')).getByRole('textbox', { name: /^Titel/ })).toHaveValue('C.O.I.N.')
    expect(within(karte('kopf')).getByRole('textbox', { name: /^Untertitel/ })).toHaveValue(
      'Certified Official Issue Numbering',
    )
  })

  it.each(['bereitsteller', 'software'] as const)(
    'hat für das Logo (%s) Dateifeld, Alternativtext und Entfernen',
    async (platz) => {
      api.startseite.konfiguration = gespeicherteKonfiguration({
        kopf: {
          aktiv: true,
          titel: 'T',
          untertitel: '',
          logoBereitsteller: testLogoMeta('bereitsteller'),
          logoSoftware: testLogoMeta('software'),
        },
      })
      zeige()
      await geladen()

      const bereich = logoBereich(platz)
      expect(within(bereich).getByLabelText('Logo auswählen')).toHaveAttribute(
        'accept',
        'image/png,image/jpeg,image/webp',
      )
      expect(within(bereich).getByRole('textbox', { name: /^Alternativtext/ })).toBeInTheDocument()
      expect(within(bereich).getByRole('button', { name: 'Logo entfernen' })).toBeInTheDocument()
    },
  )

  it('zeigt ein vorhandenes Logo mit seinem Alternativtext', async () => {
    api.startseite.konfiguration = gespeicherteKonfiguration({
      kopf: {
        aktiv: true,
        titel: 'T',
        untertitel: '',
        logoBereitsteller: testLogoMeta('bereitsteller'),
        logoSoftware: null,
      },
    })
    zeige()
    await geladen()

    const bild = within(logoBereich('bereitsteller')).getByRole('img', { name: 'Wappen des Testverbands' })
    expect(bild).toHaveAttribute('src', '/api/startseite/logos/bereitsteller?v=0123456789abcdef')
  })

  it.each([
    'PNG, JPEG oder WebP, höchstens 2 MB und 2048 × 2048 Pixel. SVG und animierte Bilder sind nicht erlaubt.',
    'Bitte nur Bilder ohne personenbezogene Metadaten hochladen.',
    'Kopfbereich und Logos sind auch ohne Anmeldung sichtbar.',
  ])('zeigt im Kopfbereich den Hinweis „%s“', async (hinweis) => {
    zeige()
    await geladen()

    expect(within(karte('kopf')).getAllByText(hinweis).length).toBeGreaterThan(0)
  })

  it('hat ein Textfeld „Infotext“ mit dem Text der Konfiguration', async () => {
    zeige()
    await geladen()

    expect(screen.getByRole('textbox', { name: /^Infotext/ })).toHaveValue(STANDARD_INFOTEXT)
  })

  it('zeigt am Infotext den Zähler „{n} von 5.000 Zeichen“', async () => {
    zeige()
    await geladen()

    expect(within(karte('infotext')).getByText(`${STANDARD_INFOTEXT.length} von 5.000 Zeichen`)).toBeInTheDocument()
  })

  it('verknüpft die Formatierungshilfe per aria-describedby mit dem Infotext', async () => {
    zeige()
    await geladen()

    expect(screen.getByRole('textbox', { name: /^Infotext/ })).toHaveAccessibleDescription(
      /Formatierung: \*\*fett\*\*, \*kursiv\*, Listen mit „- “ oder „1\. “, Links als \[Text\]\(https:\/\/…\)\. HTML wird nicht angezeigt\. Bitte keine personenbezogenen Daten eintragen\./,
    )
  })

  it('aktualisiert den Zähler beim Tippen', async () => {
    const { user } = zeige()
    await geladen()
    const feld = screen.getByRole('textbox', { name: /^Infotext/ })

    await user.clear(feld)
    await user.type(feld, 'Hallo')

    expect(within(karte('infotext')).getByText('5 von 5.000 Zeichen')).toBeInTheDocument()
  })

  it.each([
    ['neueste', 6],
    ['meistausgegeben', 5],
  ] as const)('hat für „%s“ eine Auswahl „Anzahl“ mit dem Wert %i', async (art, wert) => {
    zeige()
    await geladen()

    expect(within(karte(art)).getByRole('combobox', { name: /Anzahl/ })).toHaveTextContent(String(wert))
  })

  it.each([
    ['neueste', ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12']],
    ['meistausgegeben', ['3', '4', '5', '6', '7', '8', '9', '10']],
  ] as const)('bietet für „%s“ die Anzahlen %j an', async (art, werte) => {
    const { user } = zeige()
    await geladen()

    await user.click(within(karte(art)).getByRole('combobox', { name: /Anzahl/ }))

    expect((await screen.findAllByRole('option')).map((o) => o.textContent?.trim())).toEqual(werte)
  })

  it('hat die Buttons „Speichern“ und „Änderungen verwerfen“', async () => {
    zeige()
    await geladen()

    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Änderungen verwerfen' })).toBeInTheDocument()
  })

  it('bestätigt „Änderungen verwerfen“ per AlertDialog', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))

    await user.click(screen.getByRole('button', { name: 'Änderungen verwerfen' }))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
  })

  it('zeigt bei gespeicherter Konfiguration „Zuletzt gespeichert am … von …“ (S11)', async () => {
    api.startseite.konfiguration = gespeicherteKonfiguration()
    zeige()
    await geladen()

    expect(seitentext()).toMatch(/Zuletzt gespeichert am .+ von Test Administrator/)
  })

  it('zeigt ohne gespeicherte Konfiguration kein „Zuletzt gespeichert“', async () => {
    zeige()
    await geladen()

    expect(seitentext()).not.toContain('Zuletzt gespeichert')
  })
})

// ---------- Ein/Aus ----------

describe('Ein/Aus', () => {
  it('schaltet einen Block per Leertaste aus', async () => {
    const { user } = zeige()
    await geladen()
    const schalter = screen.getByRole('switch', { name: 'Kennzahlen anzeigen' })

    schalter.focus()
    await user.keyboard(' ')

    expect(schalter).toHaveAttribute('aria-checked', 'false')
  })

  it('sendet den ausgeschalteten Block beim Speichern', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))
    await speichern(user)

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect((konfigurationAus(puts()[0].body).kennzahlen as { aktiv: boolean }).aktiv).toBe(false)
  })

  it('meldet eine Änderung über onGeaendert(true)', async () => {
    const { user, onGeaendert } = zeige()
    await geladen()

    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))

    await waitFor(() => expect(onGeaendert).toHaveBeenLastCalledWith(true))
  })
})

// ---------- AK-28: Verschieben ----------

describe('Verschieben (AK-28)', () => {
  it('verschiebt einen Block per Klick nach oben', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(screen.getByRole('button', { name: 'Infotext nach oben verschieben' }))

    expect(kartenReihenfolge()).toEqual([
      'Infotext',
      'Kopfbereich',
      'Kennzahlen',
      'Neueste Coins',
      'Meistausgegebene Coins',
    ])
  })

  it('verschiebt einen Block per Tastatur (Enter) nach unten', async () => {
    const { user } = zeige()
    await geladen()

    screen.getByRole('button', { name: 'Kennzahlen nach unten verschieben' }).focus()
    await user.keyboard('{Enter}')

    expect(kartenReihenfolge()).toEqual([
      'Kopfbereich',
      'Infotext',
      'Neueste Coins',
      'Kennzahlen',
      'Meistausgegebene Coins',
    ])
  })

  it('verschiebt einen Block per Leertaste', async () => {
    const { user } = zeige()
    await geladen()

    screen.getByRole('button', { name: 'Meistausgegebene Coins nach oben verschieben' }).focus()
    await user.keyboard(' ')

    expect(kartenReihenfolge().at(-2)).toBe('Meistausgegebene Coins')
  })

  it('behält den Fokus auf demselben Button des verschobenen Blocks', async () => {
    const { user } = zeige()
    await geladen()

    screen.getByRole('button', { name: 'Infotext nach oben verschieben' }).focus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('button', { name: 'Infotext nach oben verschieben' })).toHaveFocus()
  })

  it('meldet per role="status" „{Block} steht jetzt an Position {p} von 5.“', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(screen.getByRole('button', { name: 'Neueste Coins nach oben verschieben' }))

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('status')
          .some((s) => s.textContent?.includes('Neueste Coins steht jetzt an Position 3 von 5.')),
      ).toBe(true),
    )
  })

  it('setzt am oberen Rand aria-disabled, der Button bleibt fokussierbar', async () => {
    zeige()
    await geladen()

    const oben = screen.getByRole('button', { name: 'Kopfbereich nach oben verschieben' })
    expect(oben).toHaveAttribute('aria-disabled', 'true')
    expect(oben).not.toBeDisabled()
    oben.focus()
    expect(oben).toHaveFocus()
  })

  it('setzt am unteren Rand aria-disabled', async () => {
    zeige()
    await geladen()

    expect(screen.getByRole('button', { name: 'Meistausgegebene Coins nach unten verschieben' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('ändert am Rand die Reihenfolge nicht', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(screen.getByRole('button', { name: 'Kopfbereich nach oben verschieben' }))

    expect(kartenReihenfolge()[0]).toBe('Kopfbereich')
  })

  it('sendet die neue Reihenfolge beim Speichern', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(screen.getByRole('button', { name: 'Meistausgegebene Coins nach oben verschieben' }))
    await speichern(user)

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(konfigurationAus(puts()[0].body).reihenfolge).toEqual([
      'kopf',
      'infotext',
      'kennzahlen',
      'meistausgegeben',
      'neueste',
    ])
  })
})

// ---------- AK-29: Vorschau ----------

describe('Vorschau (AK-29)', () => {
  it('zeigt die Vorschau als Abschnitt „Vorschau der Startseite“', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(screen.getByRole('tab', { name: 'Vorschau' }))

    expect(await screen.findByRole('region', { name: 'Vorschau der Startseite' })).toBeInTheDocument()
  })

  it('wechselt die Tabs per Pfeiltaste', async () => {
    const { user } = zeige()
    await geladen()

    screen.getByRole('tab', { name: 'Bearbeiten' }).focus()
    await user.keyboard('{ArrowRight}')

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Vorschau' })).toHaveFocus())
  })

  it('behält in der Vorschau genau ein h1', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kopfbereich anzeigen' }))

    await user.click(screen.getByRole('tab', { name: 'Vorschau' }))
    const vorschau = await screen.findByRole('region', { name: 'Vorschau der Startseite' })

    expect(within(vorschau).getByRole('heading', { name: 'C.O.I.N.' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('zeigt einen geänderten Infotext ohne Speichern', async () => {
    const { user } = zeige()
    await geladen()
    const feld = screen.getByRole('textbox', { name: /^Infotext/ })
    await user.clear(feld)
    await user.type(feld, 'Neuer **Vorschautext**')

    await user.click(screen.getByRole('tab', { name: 'Vorschau' }))

    const vorschau = await screen.findByRole('region', { name: 'Vorschau der Startseite' })
    expect(within(vorschau).getByText('Vorschautext').tagName).toBe('STRONG')
    expect(puts()).toHaveLength(0)
  })

  it('lässt ausgeschaltete Blöcke in der Vorschau weg', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))

    await user.click(screen.getByRole('tab', { name: 'Vorschau' }))

    const vorschau = await screen.findByRole('region', { name: 'Vorschau der Startseite' })
    expect(within(vorschau).queryByRole('heading', { name: 'Kennzahlen' })).not.toBeInTheDocument()
    expect(within(vorschau).getByRole('heading', { name: 'Neueste Coins' })).toBeInTheDocument()
  })

  it('zeigt die Blöcke in der geänderten Reihenfolge', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('button', { name: 'Meistausgegebene Coins nach oben verschieben' }))

    await user.click(screen.getByRole('tab', { name: 'Vorschau' }))

    const vorschau = await screen.findByRole('region', { name: 'Vorschau der Startseite' })
    const namen = within(vorschau)
      .getAllByRole('heading')
      .map((h) => h.textContent?.trim())
      .filter((t) => t === 'Neueste Coins' || t === 'Meistausgegebene Coins')
    expect(namen).toEqual(['Meistausgegebene Coins', 'Neueste Coins'])
  })

  it('kürzt die Neuesten aus den Vorschaudaten auf die eingestellte Anzahl', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(screen.getByRole('tab', { name: 'Vorschau' }))

    const vorschau = await screen.findByRole('region', { name: 'Vorschau der Startseite' })
    const neueste = within(vorschau).getByRole('region', { name: 'Neueste Coins' })
    expect(within(neueste).getAllByRole('link')).toHaveLength(6)
  })

  it('übernimmt eine geänderte Anzahl in die Vorschau', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(within(karte('neueste')).getByRole('combobox', { name: /Anzahl/ }))
    await user.click(await screen.findByRole('option', { name: '3' }))

    await user.click(screen.getByRole('tab', { name: 'Vorschau' }))

    const vorschau = await screen.findByRole('region', { name: 'Vorschau der Startseite' })
    expect(within(within(vorschau).getByRole('region', { name: 'Neueste Coins' })).getAllByRole('link')).toHaveLength(3)
  })

  it('zeigt die Kennzahlen aus den Vorschaudaten', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(screen.getByRole('tab', { name: 'Vorschau' }))

    const vorschau = await screen.findByRole('region', { name: 'Vorschau der Startseite' })
    expect(within(vorschau).getByText('1.250')).toBeInTheDocument()
  })

  it('zeigt ein neu ausgewähltes Logo als Object-URL der Datei', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kopfbereich anzeigen' }))
    const bereich = logoBereich('bereitsteller')
    await user.upload(within(bereich).getByLabelText('Logo auswählen'), testDatei('image/png', 1000, 'wappen.png'))
    await user.type(within(bereich).getByRole('textbox', { name: /^Alternativtext/ }), 'Wappen Vorschau')

    await user.click(screen.getByRole('tab', { name: 'Vorschau' }))

    const vorschau = await screen.findByRole('region', { name: 'Vorschau der Startseite' })
    expect(within(vorschau).getByRole('img', { name: 'Wappen Vorschau' }).getAttribute('src')).toMatch(/^blob:/)
  })

  it('zeigt einen Infotext mit XSS-Nutzlast in der Vorschau wirkungslos', async () => {
    const { user } = zeige()
    await geladen()
    const feld = screen.getByRole('textbox', { name: /^Infotext/ })
    await user.clear(feld)
    await user.click(feld)
    await user.paste(
      '<script>window.__xss=1</script>\n\n<img src=x onerror="window.__xss=2">\n\n[a](javascript:window.__xss=3)',
    )

    await user.click(screen.getByRole('tab', { name: 'Vorschau' }))

    const vorschau = await screen.findByRole('region', { name: 'Vorschau der Startseite' })
    expect(vorschau.querySelector('script, img, a[href^="javascript"]')).toBeNull()
    expect((window as unknown as { __xss?: unknown }).__xss).toBeUndefined()
  })
})

// ---------- Logos: Upload und Entfernen (AK-10) ----------

describe('Logos (AK-10)', () => {
  it('sendet ein ausgewähltes Logo als Dateiteil logoBereitsteller mit Alternativtext', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kopfbereich anzeigen' }))
    const bereich = logoBereich('bereitsteller')
    const datei = testDatei('image/png', 1000, 'wappen.png')
    await user.upload(within(bereich).getByLabelText('Logo auswählen'), datei)
    await user.type(within(bereich).getByRole('textbox', { name: /^Alternativtext/ }), 'Wappen Test')

    await speichern(user)

    await waitFor(() => expect(puts()).toHaveLength(1))
    const body = puts()[0].body as FormData
    const teil = body.get('logoBereitsteller')
    expect(teil).toBeInstanceOf(File)
    expect((teil as File).name).toBe(datei.name)
    expect((konfigurationAus(body).kopf as Record<string, unknown>).logoBereitsteller).toEqual({
      alternativtext: 'Wappen Test',
    })
  })

  it('sendet ohne neue Datei keinen Dateiteil', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))

    await speichern(user)

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(teileVon(puts()[0].body)).toEqual(['konfiguration'])
  })

  it('sendet ein vorhandenes Logo als Objekt ohne Dateiteil', async () => {
    api.startseite.konfiguration = gespeicherteKonfiguration({
      kopf: {
        aktiv: true,
        titel: 'T',
        untertitel: '',
        logoBereitsteller: testLogoMeta('bereitsteller'),
        logoSoftware: null,
      },
    })
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))

    await speichern(user)

    await waitFor(() => expect(puts()).toHaveLength(1))
    const kopf = konfigurationAus(puts()[0].body).kopf as Record<string, unknown>
    expect(kopf.logoBereitsteller).toEqual({ alternativtext: 'Wappen des Testverbands' })
    expect(kopf.logoSoftware).toBeNull()
  })

  it('entfernt ein vorhandenes Logo per „Logo entfernen“ und sendet null', async () => {
    api.startseite.konfiguration = gespeicherteKonfiguration({
      kopf: {
        aktiv: true,
        titel: 'T',
        untertitel: '',
        logoBereitsteller: testLogoMeta('bereitsteller'),
        logoSoftware: null,
      },
    })
    const { user } = zeige()
    await geladen()

    await user.click(within(logoBereich('bereitsteller')).getByRole('button', { name: 'Logo entfernen' }))
    await speichern(user)

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect((konfigurationAus(puts()[0].body).kopf as Record<string, unknown>).logoBereitsteller).toBeNull()
    expect(teileVon(puts()[0].body)).toEqual(['konfiguration'])
  })

  it('zeigt nach „Logo entfernen“ keine Logo-Vorschau mehr', async () => {
    api.startseite.konfiguration = gespeicherteKonfiguration({
      kopf: {
        aktiv: true,
        titel: 'T',
        untertitel: '',
        logoBereitsteller: testLogoMeta('bereitsteller'),
        logoSoftware: null,
      },
    })
    const { user } = zeige()
    await geladen()

    await user.click(within(logoBereich('bereitsteller')).getByRole('button', { name: 'Logo entfernen' }))

    expect(within(logoBereich('bereitsteller')).queryByRole('img')).not.toBeInTheDocument()
  })

  // QA-Runde 1: Der Button „Logo entfernen“ verschwindet beim Entfernen; der Fokus darf nicht auf <body> fallen (AK-33).
  // Annahme: Fokus auf das Dateifeld „Logo auswählen“ desselben Platzes, Ansage „{Logo-Name} entfernt.“ per role="status".
  async function zeigeMitVorhandenemLogo() {
    api.startseite.konfiguration = gespeicherteKonfiguration({
      kopf: {
        aktiv: true,
        titel: 'T',
        untertitel: '',
        logoBereitsteller: testLogoMeta('bereitsteller'),
        logoSoftware: null,
      },
    })
    const ergebnis = zeige()
    await geladen()
    return ergebnis
  }

  it('setzt nach Klick auf „Logo entfernen“ den Fokus auf „Logo auswählen“ desselben Logos', async () => {
    const { user } = await zeigeMitVorhandenemLogo()

    await user.click(within(logoBereich('bereitsteller')).getByRole('button', { name: 'Logo entfernen' }))

    await waitFor(() => expect(within(logoBereich('bereitsteller')).getByLabelText('Logo auswählen')).toHaveFocus())
  })

  it('setzt nach „Logo entfernen“ per Enter den Fokus auf „Logo auswählen“ desselben Logos', async () => {
    const { user } = await zeigeMitVorhandenemLogo()
    within(logoBereich('bereitsteller')).getByRole('button', { name: 'Logo entfernen' }).focus()

    await user.keyboard('{Enter}')

    await waitFor(() => expect(within(logoBereich('bereitsteller')).getByLabelText('Logo auswählen')).toHaveFocus())
  })

  it('meldet „Logo des Bereitstellers entfernt.“ per role="status"', async () => {
    const { user } = await zeigeMitVorhandenemLogo()

    await user.click(within(logoBereich('bereitsteller')).getByRole('button', { name: 'Logo entfernen' }))

    await waitFor(() =>
      expect(
        screen.getAllByRole('status').some((s) => s.textContent?.trim() === 'Logo des Bereitstellers entfernt.'),
      ).toBe(true),
    )
  })

  // QA-Runde 2 (H2): Dieselbe Ansage zweimal hintereinander muss als neuer Inhalt im Live-Bereich ankommen, sonst
  // schweigt der Screenreader. Annahme: Der Textknoten der zweiten Ansage ist ein anderer DOM-Knoten als der der ersten
  // (z. B. Live-Bereich zwischendurch geleert oder Textelement per key neu erzeugt).
  it('setzt die gleiche Ansage beim zweiten Entfernen neu in den Status-Bereich', async () => {
    const { user } = await zeigeMitVorhandenemLogo()
    const text = 'Logo des Bereitstellers entfernt.'
    await user.click(within(logoBereich('bereitsteller')).getByRole('button', { name: 'Logo entfernen' }))
    const ersterKnoten = await waitFor(() => {
      const knoten = textknoten(statusMit(text), text)
      expect(knoten).not.toBeNull()
      return knoten
    })
    await user.upload(
      within(logoBereich('bereitsteller')).getByLabelText('Logo auswählen'),
      testDatei('image/png', 1000, 'wappen-neu.png'),
    )

    await user.click(within(logoBereich('bereitsteller')).getByRole('button', { name: 'Logo entfernen' }))

    await waitFor(() => {
      const zweiterKnoten = textknoten(statusMit(text), text)
      expect(zweiterKnoten).not.toBeNull()
      expect(zweiterKnoten).not.toBe(ersterKnoten)
    })
  })

  it('gibt die Object-URL beim Ersetzen der Auswahl frei', async () => {
    const { user } = zeige()
    await geladen()
    const feld = within(logoBereich('software')).getByLabelText('Logo auswählen')

    await user.upload(feld, testDatei('image/png', 100, 'a.png'))
    await user.upload(feld, testDatei('image/webp', 100, 'b.webp'))

    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vorschau-1'))
  })

  it('sendet die geladene Version mit', async () => {
    api.startseite.konfiguration = gespeicherteKonfiguration()
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))

    await speichern(user)

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(konfigurationAus(puts()[0].body).version).toBe(3)
  })
})

// ---------- AK-30: Client-Vorprüfung ----------

describe('Client-Vorprüfung (AK-30)', () => {
  it('meldet einen fehlenden Titel bei aktivem Kopfbereich am Feld und sendet nichts', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kopfbereich anzeigen' }))
    const titel = within(karte('kopf')).getByRole('textbox', { name: /^Titel/ })
    await user.clear(titel)

    await speichern(user)

    expect(titel).toHaveAttribute('aria-invalid', 'true')
    expect(titel).toHaveAccessibleDescription(/Bitte einen Titel eingeben oder den Kopfbereich ausschalten\./)
    expect(puts()).toHaveLength(0)
  })

  it('zeigt die Zusammenfassung „Bitte die markierten Eingaben prüfen.“ als alert', async () => {
    const { user } = zeige()
    await geladen()
    await user.clear(screen.getByRole('textbox', { name: /^Infotext/ }))

    await speichern(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Bitte die markierten Eingaben prüfen.')
  })

  it('setzt den Fokus auf das erste ungültige Feld', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kopfbereich anzeigen' }))
    await user.clear(within(karte('kopf')).getByRole('textbox', { name: /^Titel/ }))
    await user.clear(screen.getByRole('textbox', { name: /^Infotext/ }))

    await speichern(user)

    await waitFor(() => expect(within(karte('kopf')).getByRole('textbox', { name: /^Titel/ })).toHaveFocus())
  })

  it('meldet einen leeren aktiven Infotext', async () => {
    const { user } = zeige()
    await geladen()
    const feld = screen.getByRole('textbox', { name: /^Infotext/ })
    await user.clear(feld)

    await speichern(user)

    expect(feld).toHaveAccessibleDescription(/Bitte einen Infotext eingeben oder den Block ausschalten\./)
  })

  it('meldet einen zu langen Titel', async () => {
    const { user } = zeige()
    await geladen()
    const titel = within(karte('kopf')).getByRole('textbox', { name: /^Titel/ })
    await user.clear(titel)
    await user.click(titel)
    await user.paste('T'.repeat(101))

    await speichern(user)

    expect(titel).toHaveAccessibleDescription(/Der Titel darf höchstens 100 Zeichen lang sein\./)
  })

  it('meldet einen fehlenden Alternativtext bei ausgewähltem Logo', async () => {
    const { user } = zeige()
    await geladen()
    const bereich = logoBereich('bereitsteller')
    await user.upload(within(bereich).getByLabelText('Logo auswählen'), testDatei('image/png', 1000, 'wappen.png'))

    await speichern(user)

    expect(within(bereich).getByRole('textbox', { name: /^Alternativtext/ })).toHaveAccessibleDescription(
      /Bitte einen Alternativtext für das Logo des Bereitstellers eingeben\./,
    )
    expect(puts()).toHaveLength(0)
  })

  it('meldet ein SVG laut Browser-Typ am Logo-Feld', async () => {
    const { user } = zeige()
    await geladen()
    const bereich = logoBereich('software')

    await user.upload(within(bereich).getByLabelText('Logo auswählen'), testDatei('image/svg+xml', 100, 'logo.svg'))
    await speichern(user)

    expect(
      within(bereich).getByText('SVG-Dateien sind nicht erlaubt. Bitte das Logo als PNG, JPEG oder WebP hochladen.'),
    ).toBeInTheDocument()
    expect(puts()).toHaveLength(0)
  })

  it('meldet ein GIF als „kein Bild im Format PNG, JPEG oder WebP“', async () => {
    const { user } = zeige()
    await geladen()
    const bereich = logoBereich('software')

    await user.upload(within(bereich).getByLabelText('Logo auswählen'), testDatei('image/gif', 100, 'logo.gif'))
    await speichern(user)

    expect(within(bereich).getByText('Die Datei ist kein Bild im Format PNG, JPEG oder WebP.')).toBeInTheDocument()
  })

  it('meldet ein Logo über 2 MiB', async () => {
    const { user } = zeige()
    await geladen()
    const bereich = logoBereich('bereitsteller')

    await user.upload(
      within(bereich).getByLabelText('Logo auswählen'),
      testDatei('image/png', 2 * 1024 * 1024 + 1, 'gross.png'),
    )
    await speichern(user)

    expect(within(bereich).getByText('Das Logo des Bereitstellers darf höchstens 2 MB groß sein.')).toBeInTheDocument()
    expect(puts()).toHaveLength(0)
  })

  it('nimmt ein Logo von genau 2 MiB an', async () => {
    const { user } = zeige()
    await geladen()
    const bereich = logoBereich('bereitsteller')
    await user.upload(
      within(bereich).getByLabelText('Logo auswählen'),
      testDatei('image/png', 2 * 1024 * 1024, 'grenze.png'),
    )
    await user.type(within(bereich).getByRole('textbox', { name: /^Alternativtext/ }), 'Wappen')

    await speichern(user)

    await waitFor(() => expect(puts()).toHaveLength(1))
  })

  it('behält Eingaben und ausgewählte Dateien nach einem Fehler', async () => {
    const { user } = zeige()
    await geladen()
    const bereich = logoBereich('bereitsteller')
    await user.upload(within(bereich).getByLabelText('Logo auswählen'), testDatei('image/png', 1000, 'wappen.png'))
    await user.clear(screen.getByRole('textbox', { name: /^Infotext/ }))
    await user.type(screen.getByRole('textbox', { name: /^Infotext/ }), 'Behalten')

    await speichern(user)
    await screen.findByRole('alert')

    expect(screen.getByRole('textbox', { name: /^Infotext/ })).toHaveValue('Behalten')
    expect(within(logoBereich('bereitsteller')).getByRole('img')).toBeInTheDocument()
  })
})

// ---------- AK-30: Serverfehler ----------

describe('Serverfehler (AK-30)', () => {
  async function aendernUndSpeichern(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))
    await speichern(user)
  }

  it('zeigt 400-Feldfehler am passenden Feld (kopf.titel)', async () => {
    api.einmal(
      'PUT',
      /^\/api\/startseite\/konfiguration$/,
      problemAntwort(400, {
        title: 'Eingaben ungültig',
        errors: { 'kopf.titel': ['Der Titel darf höchstens 100 Zeichen lang sein.'] },
      }),
    )
    const { user } = zeige()
    await geladen()

    await aendernUndSpeichern(user)

    const titel = within(karte('kopf')).getByRole('textbox', { name: /^Titel/ })
    await waitFor(() => expect(titel).toHaveAttribute('aria-invalid', 'true'))
    expect(titel).toHaveAccessibleDescription(/Der Titel darf höchstens 100 Zeichen lang sein\./)
  })

  it('zeigt einen 400-Logobefund am Logo-Feld', async () => {
    api.einmal(
      'PUT',
      /^\/api\/startseite\/konfiguration$/,
      problemAntwort(400, {
        title: 'Eingaben ungültig',
        errors: { logoSoftware: ['Animierte Bilder sind nicht erlaubt.'] },
      }),
    )
    const { user } = zeige()
    await geladen()

    await aendernUndSpeichern(user)

    expect(await within(logoBereich('software')).findByText('Animierte Bilder sind nicht erlaubt.')).toBeInTheDocument()
  })

  it('zeigt 413 am Logo-Feld aus feld', async () => {
    api.einmal(
      'PUT',
      /^\/api\/startseite\/konfiguration$/,
      problemAntwort(413, {
        title: 'Datei zu groß',
        code: 'datei_zu_gross',
        feld: 'logoBereitsteller',
        detail: 'Das Logo des Bereitstellers darf höchstens 2 MB groß sein.',
      }),
    )
    const { user } = zeige()
    await geladen()

    await aendernUndSpeichern(user)

    expect(
      await within(logoBereich('bereitsteller')).findByText(
        'Das Logo des Bereitstellers darf höchstens 2 MB groß sein.',
      ),
    ).toBeInTheDocument()
  })

  it('zeigt 409 startseite_geaendert als alert mit Button „Neu laden“', async () => {
    api.einmal(
      'PUT',
      /^\/api\/startseite\/konfiguration$/,
      problemAntwort(409, {
        title: 'Speichern nicht möglich',
        code: 'startseite_geaendert',
        detail: 'Die Startseite wurde inzwischen geändert. Bitte die Seite neu laden.',
      }),
    )
    const { user } = zeige()
    await geladen()

    await aendernUndSpeichern(user)

    const meldung = await screen.findByRole('alert')
    expect(meldung).toHaveTextContent('Die Startseite wurde inzwischen geändert. Bitte die Seite neu laden.')
    expect(within(meldung).getByRole('button', { name: 'Neu laden' })).toBeInTheDocument()
  })

  it('lädt nach 409 per „Neu laden“ die Konfiguration erneut', async () => {
    api.einmal(
      'PUT',
      /^\/api\/startseite\/konfiguration$/,
      problemAntwort(409, { title: 'Speichern nicht möglich', code: 'startseite_geaendert', detail: 'x' }),
    )
    const { user } = zeige()
    await geladen()
    await aendernUndSpeichern(user)

    await user.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Neu laden' }))

    await waitFor(() => expect(api.anfragenMit('GET', /^\/api\/startseite\/konfiguration$/)).toHaveLength(2))
  })

  it('entfernt nach „Neu laden“ die Konflikt-Meldung und zeigt die neu geladenen Werte', async () => {
    api.einmal(
      'PUT',
      /^\/api\/startseite\/konfiguration$/,
      problemAntwort(409, { title: 'Speichern nicht möglich', code: 'startseite_geaendert', detail: 'x' }),
    )
    const { user } = zeige()
    await geladen()
    await aendernUndSpeichern(user)
    const meldung = await screen.findByRole('alert')
    api.startseite.konfiguration = gespeicherteKonfiguration({
      version: 7,
      infotext: { aktiv: true, text: 'Inzwischen von anderer Stelle geändert' },
    })

    await user.click(within(meldung).getByRole('button', { name: 'Neu laden' }))

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^Infotext/ })).toHaveValue('Inzwischen von anderer Stelle geändert'),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Neu laden' })).not.toBeInTheDocument()
  })

  it('behält die Eingaben nach einem Serverfehler', async () => {
    api.einmal('PUT', /^\/api\/startseite\/konfiguration$/, problemAntwort(500))
    const { user } = zeige()
    await geladen()
    await user.clear(screen.getByRole('textbox', { name: /^Infotext/ }))
    await user.type(screen.getByRole('textbox', { name: /^Infotext/ }), 'Bleibt erhalten')

    await speichern(user)
    await waitFor(() => expect(puts()).toHaveLength(1))

    expect(screen.getByRole('textbox', { name: /^Infotext/ })).toHaveValue('Bleibt erhalten')
  })
})

// ---------- QA-Runde 2: „Neu laden“ nach 409 (AK-30) ----------

describe('Neu laden nach Konflikt (AK-30)', () => {
  /** Ungespeicherte Eingabe im Infotext, Speichern scheitert mit 409; liefert den Button „Neu laden“. */
  async function nachKonflikt() {
    api.einmal(
      'PUT',
      KONFIGURATION_PFAD,
      problemAntwort(409, { title: 'Speichern nicht möglich', code: 'startseite_geaendert', detail: 'x' }),
    )
    const ergebnis = zeige()
    await geladen()
    const infotext = screen.getByRole('textbox', { name: /^Infotext/ })
    await ergebnis.user.clear(infotext)
    await ergebnis.user.type(infotext, 'Ungespeicherte Eingabe')
    await speichern(ergebnis.user)
    const neuLaden = within(await screen.findByRole('alert')).getByRole('button', { name: 'Neu laden' })
    return { ...ergebnis, neuLaden }
  }

  function gets() {
    return api.anfragenMit('GET', KONFIGURATION_PFAD)
  }

  function antwortMitKonfiguration(): Response {
    return new Response(JSON.stringify(gespeicherteKonfiguration()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // W1: Das Formular wird nach dem Neuladen frisch eingehängt, „Neu laden“ verschwindet. Annahme (gleiches Muster wie
  // die Erfolgsmeldung nach dem Speichern, AK-31): Meldung „Die Konfiguration wurde neu geladen.“ als role="status"
  // mit tabIndex=-1, der Fokus liegt darauf.
  it('meldet nach „Neu laden“ per Enter „Die Konfiguration wurde neu geladen.“ per role="status" mit Fokus darauf', async () => {
    const { user, neuLaden } = await nachKonflikt()
    neuLaden.focus()

    await user.keyboard('{Enter}')

    const meldung = await waitFor(() => {
      const treffer = statusMit('Die Konfiguration wurde neu geladen.')
      expect(treffer).toBeDefined()
      return treffer as HTMLElement
    })
    await waitFor(() => expect(meldung).toHaveFocus())
  })

  it('macht die Meldung nach „Neu laden“ per tabIndex=-1 fokussierbar', async () => {
    const { user, neuLaden } = await nachKonflikt()

    await user.click(neuLaden)

    const meldung = await waitFor(() => {
      const treffer = statusMit('Die Konfiguration wurde neu geladen.')
      expect(treffer).toBeDefined()
      return treffer as HTMLElement
    })
    expect(meldung).toHaveAttribute('tabindex', '-1')
  })

  it('lässt den Fokus nach „Neu laden“ per Enter nicht auf <body> fallen', async () => {
    const { user, neuLaden } = await nachKonflikt()
    neuLaden.focus()

    await user.keyboard('{Enter}')

    await waitFor(() => expect(gets()).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Neu laden' })).not.toBeInTheDocument())
    expect(document.activeElement).not.toBe(document.body)
  })

  // H3: Solange der GET nach „Neu laden“ läuft, gilt dieselbe Sperre wie beim Speichern.
  it('sperrt alle Eingaben und Buttons, solange der GET nach „Neu laden“ läuft', async () => {
    const { user, neuLaden } = await nachKonflikt()
    const offen = offeneAntwort()
    api.einmal('GET', KONFIGURATION_PFAD, () => offen.promise)

    await user.click(neuLaden)
    await waitFor(() => expect(gets()).toHaveLength(2))

    expect(
      bedienelemente()
        .filter((el) => !istGesperrt(el))
        .map(beschreibe),
    ).toEqual([])
    offen.aufloesen(antwortMitKonfiguration())
  })

  it('sperrt „Neu laden“, solange der GET läuft', async () => {
    const { user, neuLaden } = await nachKonflikt()
    const offen = offeneAntwort()
    api.einmal('GET', KONFIGURATION_PFAD, () => offen.promise)

    await user.click(neuLaden)
    await waitFor(() => expect(gets()).toHaveLength(2))

    expect(istGesperrt(screen.getByRole('button', { name: 'Neu laden' }))).toBe(true)
    offen.aufloesen(antwortMitKonfiguration())
  })

  // H3: Scheitert der GET nach „Neu laden“, bleiben Formular und ungespeicherte Eingaben erhalten, es erscheint eine
  // Fehlermeldung (role="alert"), und die Navigationssperre bleibt bestehen (kein onGeaendert(false)).
  it('behält Formular und ungespeicherte Eingaben, wenn der GET nach „Neu laden“ scheitert', async () => {
    const { user, neuLaden } = await nachKonflikt()
    api.einmal('GET', KONFIGURATION_PFAD, problemAntwort(500))

    await user.click(neuLaden)
    await waitFor(() => expect(gets()).toHaveLength(2))

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^Infotext/ })).toHaveValue('Ungespeicherte Eingabe'),
    )
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument()
  })

  it('zeigt eine Fehlermeldung per role="alert", wenn der GET nach „Neu laden“ scheitert', async () => {
    const { user, neuLaden } = await nachKonflikt()
    api.einmal('GET', KONFIGURATION_PFAD, problemAntwort(500))

    await user.click(neuLaden)

    await waitFor(() =>
      expect(
        screen.getAllByRole('alert').some((a) => /konnte nicht (neu )?geladen werden/.test(a.textContent ?? '')),
      ).toBe(true),
    )
  })

  it('hält die Navigationssperre, wenn der GET nach „Neu laden“ scheitert', async () => {
    const { user, neuLaden, onGeaendert } = await nachKonflikt()
    await waitFor(() => expect(onGeaendert).toHaveBeenLastCalledWith(true))
    const aufrufeVorher = onGeaendert.mock.calls.length
    api.einmal('GET', KONFIGURATION_PFAD, problemAntwort(500))

    await user.click(neuLaden)
    await waitFor(() => expect(gets()).toHaveLength(2))
    await waitFor(() => expect(screen.queryAllByRole('alert').length).toBeGreaterThan(0))

    expect(onGeaendert.mock.calls.slice(aufrufeVorher)).not.toContainEqual([false])
  })
})

// ---------- QA-Runde 1: Formular während des Speicherns gesperrt ----------

// Annahme (AK-31 regelt es nicht ausdrücklich): Solange PUT läuft, sind alle Eingaben und Buttons des Formulars
// gesperrt (disabled oder aria-disabled), damit die Antwort keine späteren Eingaben überschreibt.
describe('Formular während des Speicherns', () => {
  it('sperrt alle Eingaben und Buttons, solange PUT läuft', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', /^\/api\/startseite\/konfiguration$/, () => offen.promise)
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))

    await speichern(user)
    await waitFor(() => expect(puts()).toHaveLength(1))

    expect(
      bedienelemente()
        .filter((el) => !istGesperrt(el))
        .map(beschreibe),
    ).toEqual([])
    offen.aufloesen(
      new Response(JSON.stringify(gespeicherteKonfiguration()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('gibt Eingaben und Buttons nach der Antwort wieder frei', async () => {
    api.einmal('PUT', /^\/api\/startseite\/konfiguration$/, problemAntwort(500))
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))

    await speichern(user)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    // Nur die Randbuttons bleiben gesperrt (AK-27): oberster Block „nach oben“, unterster Block „nach unten“.
    const reihenfolge = kartenReihenfolge()
    const raender = [`${reihenfolge[0]} nach oben verschieben`, `${reihenfolge.at(-1)} nach unten verschieben`]
    const gesperrt = bedienelemente()
      .filter((el) => istGesperrt(el))
      .map(beschreibe)
      .filter((name) => !raender.includes(name))
    expect(gesperrt).toEqual([])
  })
})

// ---------- AK-31: Erfolg ----------

describe('Speichern erfolgreich (AK-31)', () => {
  it('meldet „Die Startseite wurde gespeichert.“ per role="status" und setzt den Fokus darauf', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))

    await speichern(user)

    const meldung = await waitFor(() => {
      const treffer = screen
        .getAllByRole('status')
        .find((s) => s.textContent?.includes('Die Startseite wurde gespeichert.'))
      expect(treffer).toBeDefined()
      return treffer as HTMLElement
    })
    await waitFor(() => expect(meldung).toHaveFocus())
  })

  it('übernimmt die neue Version für das nächste Speichern', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))
    await speichern(user)
    await waitFor(() => expect(puts()).toHaveLength(1))

    await user.click(screen.getByRole('switch', { name: 'Neueste Coins anzeigen' }))
    await speichern(user)

    await waitFor(() => expect(puts()).toHaveLength(2))
    expect(konfigurationAus(puts()[1].body).version).toBe(1)
  })

  it('meldet nach dem Speichern onGeaendert(false)', async () => {
    const { user, onGeaendert } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))

    await speichern(user)

    await waitFor(() => expect(onGeaendert).toHaveBeenLastCalledWith(false))
  })

  it('zeigt nach dem Speichern „Zuletzt gespeichert … von Test Administrator“', async () => {
    const { user } = zeige()
    await geladen()
    await user.click(screen.getByRole('switch', { name: 'Kennzahlen anzeigen' }))

    await speichern(user)

    await waitFor(() => expect(seitentext()).toMatch(/Zuletzt gespeichert am .+ von Test Administrator/))
  })
})

// ---------- AK-33: Barrierefreiheit und Texte ----------

describe('Barrierefreiheit und deutsche Texte (AK-33)', () => {
  const ENGLISCH =
    /\b(Save|Cancel|Upload|Remove|Preview|Edit|Loading|Error|Choose file|Browse|Move up|Move down|Show|Hide)\b/

  it('enthält keine englischen Bibliothekstexte', async () => {
    zeige()
    await geladen()

    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    expect([seitentext(), ...attribute].join(' ')).not.toMatch(ENGLISCH)
  })

  it('gibt jedem Button und jedem Eingabefeld einen zugänglichen Namen', async () => {
    zeige()
    await geladen()

    const ohneName = [
      ...screen.getAllByRole('button'),
      ...screen.getAllByRole('textbox'),
      ...screen.getAllByRole('switch'),
    ].filter(
      (el) =>
        !el.getAttribute('aria-label') &&
        !el.getAttribute('aria-labelledby') &&
        !(el as HTMLInputElement).labels?.length &&
        !el.textContent?.trim(),
    )
    expect(ohneName).toEqual([])
  })

  it('blendet die Icons der Verschieben-Buttons für Screenreader aus', async () => {
    zeige()
    await geladen()

    const button = screen.getByRole('button', { name: 'Infotext nach oben verschieben' })
    for (const svg of button.querySelectorAll('svg')) expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})
