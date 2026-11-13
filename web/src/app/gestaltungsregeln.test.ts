import { describe, expect, it } from 'vitest'

// Feature design-fundament, AK-3, AK-4, AK-5, AK-32 (ADR-0037 Punkt 2): Code-Test „Gestaltungsregeln“.
// Durchsucht alle Quelldateien unter web/src (ohne Testdateien) nach hartkodierten Farben, beliebigen Abständen,
// Fokusringen mit Deckkraft und einem eigenen Seitenrahmen `max-w-5xl` in Seiten und Router. Farben dürfen nur in
// src/app/styles/index.css stehen. Muster laut ADR-0037; ein Selbsttest prüft sie an Positiv- und Negativbeispielen.

const quellen = import.meta.glob<string>('/src/**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true })

const THEME_DATEI = '/src/app/styles/index.css'
const istTestdatei = (pfad: string) => /\.test\.tsx?$/.test(pfad)

/**
 * Begründete Ausnahmen `{ datei, muster, begruendung }`. Zu Beginn leer (ADR-0037 Punkt 2); jede neue Ausnahme braucht
 * eine Begründung und das Review.
 */
const AUSNAHMEN: ReadonlyArray<{ datei: string; muster: string; begruendung: string }> = []

const PRAEFIXE =
  '(?:bg|text|border(?:-[xytrblse])?|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|divide|shadow|inset-shadow|accent|caret|placeholder)'
const PALETTE =
  '(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe)'

/** Hartkodierte Farben (AK-3). */
const FARBMUSTER: Readonly<Record<string, RegExp>> = {
  hex: /(?<![\w&/])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/,
  farbfunktion: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/,
  palettenklasse: new RegExp(`${PRAEFIXE}-${PALETTE}-\\d{2,3}\\b`),
  schwarzWeiss: new RegExp(`${PRAEFIXE}-(?:black|white)\\b`),
  beliebigerFarbwert: /-\[(?:#|rgba?\(|hsla?\(|oklch\(|color-mix\()/,
}

/** Fokusring mit Deckkraft (AK-5), gilt auch für index.css. */
const FOKUS_MIT_DECKKRAFT = /\b(?:ring|outline)-ring\/\d+/

/** Beliebige Abstandswerte (AK-4). */
const ABSTAND =
  /\b-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end)-\[/

interface Treffer {
  datei: string
  zeile: number
  muster: string
  text: string
}

function finde(dateien: Array<[string, string]>, muster: Readonly<Record<string, RegExp>>): Treffer[] {
  return dateien.flatMap(([datei, inhalt]) =>
    inhalt.split('\n').flatMap((text, i) =>
      Object.entries(muster)
        .filter(([, regex]) => regex.test(text))
        .filter(([name]) => !AUSNAHMEN.some((a) => a.datei === datei && a.muster === name))
        .map(([name]) => ({ datei, zeile: i + 1, muster: name, text: text.trim() })),
    ),
  )
}

const bericht = (treffer: Treffer[]) => treffer.map((t) => `${t.datei}:${t.zeile} [${t.muster}] ${t.text}`)

const produktiv = Object.entries(quellen).filter(([pfad]) => !istTestdatei(pfad))
const ohneTheme = produktiv.filter(([pfad]) => pfad !== THEME_DATEI)

describe('Gestaltungsregeln – Grundlagen', () => {
  it('findet Quelldateien unter src (ts, tsx und css)', () => {
    expect(produktiv.length).toBeGreaterThan(50)
    expect(produktiv.some(([pfad]) => pfad.endsWith('.css'))).toBe(true)
  })

  it('findet die Theme-Datei src/app/styles/index.css', () => {
    expect(Object.keys(quellen)).toContain(THEME_DATEI)
  })

  it('liest den Inhalt der Theme-Datei (CSS per ?raw freigegeben, vitest.config.ts)', () => {
    expect(quellen[THEME_DATEI]).toMatch(/--background\s*:/)
  })

  it('führt jede Ausnahme mit Begründung', () => {
    expect(AUSNAHMEN.filter((a) => a.begruendung.trim().length < 10)).toEqual([])
  })
})

describe('Musterselbsttest (ADR-0037 Punkt 2)', () => {
  const alleMuster: Record<string, RegExp> = { ...FARBMUSTER, fokus: FOKUS_MIT_DECKKRAFT, abstand: ABSTAND }
  const findetEtwas = (text: string) => Object.values(alleMuster).some((regex) => regex.test(text))

  it.each([
    'bg-red-500',
    'hover:text-white',
    'dark:bg-black/10',
    'border-x-slate-200',
    'bg-[#fff]',
    'text-[rgb(0,0,0)]',
    'color: #1e40af;',
    'background: oklch(1 0 0);',
    'bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]',
    'p-[13px]',
    'gap-[0.3rem]',
    '-top-[2px]',
    'left-[calc(var(--sidebar-width)*-1)]',
    'space-x-[3px]',
    'ring-ring/50',
    'focus-visible:outline-ring/50',
  ])('findet „%s“', (beispiel) => {
    expect(findetEtwas(beispiel)).toBe(true)
  })

  it.each([
    'bg-primary',
    'text-destructive',
    'bg-overlay',
    'bg-logo-surface',
    'text-success-foreground',
    'bg-warning-subtle',
    'href="#inhalt"',
    'size-[18px]',
    'grid-cols-[12rem_1fr]',
    'ring-2 ring-ring ring-offset-2 ring-offset-background',
    'outline-2 outline-offset-2 outline-ring',
    'max-w-page',
    'p-4 md:p-6',
    'data-[side=left]:left-0',
  ])('findet „%s“ nicht', (beispiel) => {
    expect(findetEtwas(beispiel)).toBe(false)
  })
})

describe('Keine hartkodierten Farben außerhalb von index.css (AK-3)', () => {
  it('findet 0 Hex-Farben, Farbfunktionen, Palettenklassen und beliebige Farbwerte', () => {
    expect(bericht(finde(ohneTheme, FARBMUSTER))).toEqual([])
  })
})

describe('Keine beliebigen Abstände (AK-4)', () => {
  it('findet 0 beliebige Abstandswerte (p-[…], m-[…], gap-[…], inset-[…], top-[…] …)', () => {
    expect(bericht(finde(produktiv, { abstand: ABSTAND }))).toEqual([])
  })
})

describe('Fokus ohne Deckkraftreduktion (AK-5)', () => {
  it('findet in src (einschließlich index.css) kein ring-ring/NN und kein outline-ring/NN', () => {
    expect(bericht(finde(produktiv, { fokus: FOKUS_MIT_DECKKRAFT }))).toEqual([])
  })
})

describe('Kein eigener Seitenrahmen (AK-32)', () => {
  it('enthält unter src/pages und src/app/router kein max-w-5xl', () => {
    const dateien = produktiv.filter(([pfad]) => pfad.startsWith('/src/pages/') || pfad.startsWith('/src/app/router/'))
    expect(dateien.length).toBeGreaterThan(10)
    expect(bericht(finde(dateien, { maxW5xl: /\bmax-w-5xl\b/ }))).toEqual([])
  })
})
