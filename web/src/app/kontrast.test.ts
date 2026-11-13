import { describe, expect, it } from 'vitest'

// Feature design-fundament, AK-1, AK-2, AK-6, AK-8 (ADR-0035, ADR-0037 Punkt 3): Kontrasttest. Liest die Tokens aus
// src/app/styles/index.css (`:root` = hell, `.dark` = dunkel), rechnet nach WCAG 2.1 und prüft die Paare aus
// Abschnitt 4.2 des Entwurfs: Text ≥ 4,5:1, Eingaberahmen und Fokusring ≥ 3:1. Ein fehlendes Token ist ein Fehler.

const css = import.meta.glob<string>('/src/app/styles/index.css', { query: '?raw', import: 'default', eager: true })[
  '/src/app/styles/index.css'
]

/** Kommentare entfernen, damit auskommentierte Werte nicht zählen. */
const quelltext = (css ?? '').replace(/\/\*[\s\S]*?\*\//g, '')

/** Inhalt des ersten Blocks mit dem Selektor (ohne verschachtelte Blöcke). */
function block(selektor: RegExp): string {
  const treffer = selektor.exec(quelltext)
  return treffer?.[1] ?? ''
}

function variablen(inhalt: string): Map<string, string> {
  const werte = new Map<string, string>()
  for (const [, name, wert] of inhalt.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) werte.set(name, wert.trim())
  return werte
}

const HELL = variablen(block(/(?:^|\n)\s*:root[^{]*\{([^}]*)\}/))
const DUNKEL = variablen(block(/(?:^|\n)\s*\.dark\s*\{([^}]*)\}/))

type Modus = 'hell' | 'dunkel'
const MODI: Readonly<Record<Modus, Map<string, string>>> = { hell: HELL, dunkel: DUNKEL }

/** Wert eines Tokens; `var(--x)` wird aufgelöst (zuerst im Modus, dann in :root). */
function wert(modus: Modus, token: string, tiefe = 0): string | undefined {
  const roh = MODI[modus].get(token) ?? (modus === 'dunkel' ? HELL.get(token) : undefined)
  const verweis = roh ? /^var\(--([\w-]+)\)$/.exec(roh) : null
  if (verweis && tiefe < 5) return wert(modus, verweis[1], tiefe + 1)
  return roh
}

function farbe(modus: Modus, token: string): [number, number, number] {
  const hex = wert(modus, token)
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Token --${token} (${modus}) fehlt oder ist kein 6-stelliges Hex: ${hex ?? 'fehlt'}`)
  }
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

/** Relative Luminanz nach WCAG 2.1. */
function luminanz([r, g, b]: [number, number, number]): number {
  const kanal = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b)
}

function kontrast(modus: Modus, vorne: string, hinten: string): number {
  const a = luminanz(farbe(modus, vorne))
  const b = luminanz(farbe(modus, hinten))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Farbtokens aus Abschnitt 4.1 (ohne Overlay/Logo-Fläche, die eigene Formate haben). */
const FARB_TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'primary-hover',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'destructive-subtle',
  'success',
  'success-foreground',
  'success-subtle',
  'warning',
  'warning-foreground',
  'warning-subtle',
  'info',
  'info-foreground',
  'info-subtle',
  'border',
  'input',
  'ring',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
  'logo-surface',
] as const

const ALLE_TOKENS = [...FARB_TOKENS, 'overlay'] as const

/** Werte laut ADR-0035 Punkt 3 (hell, dunkel). */
const ADR_WERTE: Readonly<Record<(typeof ALLE_TOKENS)[number], [string, string]>> = {
  background: ['#ffffff', '#0f172a'],
  foreground: ['#0f172a', '#f1f5f9'],
  card: ['#ffffff', '#1e293b'],
  'card-foreground': ['#0f172a', '#f1f5f9'],
  popover: ['#ffffff', '#1e293b'],
  'popover-foreground': ['#0f172a', '#f1f5f9'],
  primary: ['#1e40af', '#93c5fd'],
  'primary-foreground': ['#ffffff', '#0f172a'],
  'primary-hover': ['#1e3a8a', '#bfdbfe'],
  secondary: ['#f1f5f9', '#1e293b'],
  'secondary-foreground': ['#0f172a', '#f1f5f9'],
  muted: ['#f1f5f9', '#1e293b'],
  'muted-foreground': ['#475569', '#94a3b8'],
  accent: ['#e2e8f0', '#334155'],
  'accent-foreground': ['#0f172a', '#f1f5f9'],
  destructive: ['#b91c1c', '#f87171'],
  'destructive-foreground': ['#ffffff', '#0f172a'],
  'destructive-subtle': ['#fef2f2', '#450a0a'],
  success: ['#15803d', '#4ade80'],
  'success-foreground': ['#ffffff', '#0f172a'],
  'success-subtle': ['#f0fdf4', '#052e16'],
  warning: ['#b45309', '#fbbf24'],
  'warning-foreground': ['#ffffff', '#0f172a'],
  'warning-subtle': ['#fffbeb', '#451a03'],
  info: ['#0369a1', '#38bdf8'],
  'info-foreground': ['#ffffff', '#0f172a'],
  'info-subtle': ['#f0f9ff', '#082f49'],
  border: ['#e2e8f0', '#334155'],
  input: ['#64748b', '#64748b'],
  ring: ['#1d4ed8', '#60a5fa'],
  sidebar: ['#f8fafc', '#0f172a'],
  'sidebar-foreground': ['#0f172a', '#f1f5f9'],
  'sidebar-primary': ['#1e40af', '#93c5fd'],
  'sidebar-primary-foreground': ['#ffffff', '#0f172a'],
  'sidebar-accent': ['#e2e8f0', '#1e293b'],
  'sidebar-accent-foreground': ['#0f172a', '#f1f5f9'],
  'sidebar-border': ['#e2e8f0', '#334155'],
  'sidebar-ring': ['#1d4ed8', '#60a5fa'],
  overlay: ['#0f172a66', '#020617a6'],
  'logo-surface': ['#ffffff', '#ffffff'],
}

type Paar = [vorne: string, hinten: string]

const auf = (vorne: string, ...hinten: string[]): Paar[] => hinten.map((h) => [vorne, h])

/** Text ≥ 4,5:1 (Abschnitt 4.2). */
const TEXT_PAARE: Paar[] = [
  ...auf('foreground', 'background', 'card', 'muted'),
  ...auf('card-foreground', 'card'),
  ...auf('popover-foreground', 'popover'),
  ...auf('muted-foreground', 'background', 'card', 'muted', 'sidebar', 'sidebar-accent'),
  ...auf('primary', 'background', 'card'),
  ...auf('primary-foreground', 'primary', 'primary-hover'),
  ...auf('secondary-foreground', 'secondary'),
  ...auf('accent-foreground', 'accent'),
  ...(['destructive', 'success', 'warning', 'info'] as const).flatMap((status) =>
    auf(status, 'background', 'card', 'muted', `${status}-subtle`),
  ),
  ...auf('destructive-foreground', 'destructive'),
  ...auf('success-foreground', 'success'),
  ...auf('warning-foreground', 'warning'),
  ...auf('info-foreground', 'info'),
  ...auf('sidebar-foreground', 'sidebar'),
  ...auf('sidebar-accent-foreground', 'sidebar-accent'),
  ...auf('sidebar-primary-foreground', 'sidebar-primary'),
]

/** Nicht-Text ≥ 3:1 (Abschnitt 4.2). */
const NICHT_TEXT_PAARE: Paar[] = [
  ...auf('input', 'background', 'card'),
  ...auf('ring', 'background', 'card', 'muted'),
  ...auf('sidebar-ring', 'sidebar'),
]

const MODUS_LISTE: Modus[] = ['hell', 'dunkel']

describe('Theme-Datei (AK-1)', () => {
  it('liest die Blöcke :root und .dark aus index.css', () => {
    expect(HELL.size).toBeGreaterThan(0)
    expect(DUNKEL.size).toBeGreaterThan(0)
  })

  describe.each(MODUS_LISTE)('%s', (modus) => {
    it.each(FARB_TOKENS.map((t) => [t]))('definiert --%s als 6-stelliges Hex', (token) => {
      expect(wert(modus, token)).toMatch(/^#[0-9a-fA-F]{6}$/)
    })

    it('definiert --overlay als 8-stelliges Hex mit Deckkraft', () => {
      expect(wert(modus, 'overlay')).toMatch(/^#[0-9a-fA-F]{8}$/)
    })

    it.each(ALLE_TOKENS.map((t) => [t]))('verwendet für --%s den Wert aus ADR-0035', (token) => {
      const erwartet = ADR_WERTE[token][modus === 'hell' ? 0 : 1]
      expect(wert(modus, token)?.toLowerCase()).toBe(erwartet)
    })
  })

  it.each(ALLE_TOKENS.map((t) => [t]))('bildet --%s im Theme als Farbklasse ab (--color-<token>)', (token) => {
    expect(quelltext).toMatch(new RegExp(`--color-${token}\\s*:\\s*var\\(--${token}\\)`))
  })

  it('schaltet die Tailwind-Standardpalette ab (--color-*: initial)', () => {
    expect(quelltext).toMatch(/--color-\*\s*:\s*initial\s*;/)
  })

  it('setzt color-scheme: light in :root', () => {
    expect(block(/(?:^|\n)\s*:root[^{]*\{([^}]*)\}/)).toMatch(/color-scheme\s*:\s*light/)
  })

  it('setzt color-scheme: dark in .dark', () => {
    expect(block(/(?:^|\n)\s*\.dark\s*\{([^}]*)\}/)).toMatch(/color-scheme\s*:\s*dark/)
  })

  it('enthält Farbwerte nur als Hex (keine oklch/rgb/hsl-Werte mehr)', () => {
    expect(quelltext.match(/\b(?:oklch|oklab|rgba?|hsla?|hwb|lab|lch)\(/g) ?? []).toEqual([])
  })
})

describe('Schrift, Radien, Breiten (AK-6, ADR-0035 Punkte 4, 6, 8)', () => {
  it('verwendet Geist Variable als Grundschrift', () => {
    expect(quelltext).toMatch(/--font-sans\s*:\s*['"]Geist Variable['"]/)
  })

  it.each(['4xl', '5xl', '6xl', '7xl', '8xl', '9xl'])('schaltet die Schriftstufe text-%s ab', (stufe) => {
    expect(quelltext).toMatch(new RegExp(`--text-${stufe}\\s*:\\s*initial`))
  })

  it.each([
    ['--radius-sm', '0.25rem'],
    ['--radius-md', '0.375rem'],
    ['--radius-lg', '0.5rem'],
    ['--radius-xl', '0.75rem'],
    ['--container-page', '72rem'],
    ['--container-reading', '45rem'],
  ])('setzt %s auf %s', (name, groesse) => {
    expect(quelltext).toMatch(new RegExp(`${name.replace(/-/g, '\\-')}\\s*:\\s*${groesse.replace('.', '\\.')}\\s*;`))
  })
})

describe('Bewegung (AK-8, ADR-0035 Punkt 10)', () => {
  it('schaltet bei prefers-reduced-motion: reduce Animationen und Übergänge ab', () => {
    const start = quelltext.search(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/)
    expect(start).toBeGreaterThanOrEqual(0)
    const regel = quelltext.slice(start, start + 800)
    expect(regel).toMatch(/animation-duration\s*:/)
    expect(regel).toMatch(/transition-duration\s*:/)
  })
})

describe.each(MODUS_LISTE)('Kontrast %s (AK-2)', (modus) => {
  it.each(TEXT_PAARE)('Text --%s auf --%s hat mindestens 4,5:1', (vorne, hinten) => {
    expect(kontrast(modus, vorne, hinten)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(NICHT_TEXT_PAARE)('Nicht-Text --%s auf --%s hat mindestens 3:1', (vorne, hinten) => {
    expect(kontrast(modus, vorne, hinten)).toBeGreaterThanOrEqual(3)
  })
})

describe('Kontrastrechnung (Selbsttest)', () => {
  it('ergibt für Schwarz auf Weiß 21:1', () => {
    const schwarz = luminanz([0, 0, 0])
    const weiss = luminanz([255, 255, 255])
    expect((weiss + 0.05) / (schwarz + 0.05)).toBeCloseTo(21, 5)
  })

  it('ergibt für #1e40af auf Weiß etwa 8,72:1 (ADR-0035)', () => {
    const blau = luminanz([0x1e, 0x40, 0xaf])
    expect((1 + 0.05) / (blau + 0.05)).toBeCloseTo(8.72, 1)
  })
})
