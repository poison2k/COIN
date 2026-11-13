import { describe, expect, it } from 'vitest'

// Feature design-fundament, AK-9, AK-43: Screenreader-Texte in shared/ui und widgets/app-shell sind deutsch. Geprüft
// werden aria-label-Werte, title-Werte und sr-only-Texte im Quelltext (die gerenderten Texte prüfen die
// Komponententests und BausteineSeite.test.tsx).

const quellen = import.meta.glob<string>(['/src/shared/ui/**/*.tsx', '/src/widgets/app-shell/**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const produktiv = Object.entries(quellen).filter(([pfad]) => !/\.test\.tsx?$/.test(pfad))

/** Typische englische Texte aus shadcn-, Base-UI- und Router-Vorlagen. */
const ENGLISCH =
  /\b(Loading|Close|Toggle|Sidebar|More|Breadcrumb|Notifications?|Dismiss|Previous|Next|Search|Menu|Open|Select|Go to|Page|Pagination|Remove|Clear|Error|Success|Warning)\b/i

/** aria-label="…", aria-label={'…'}, title="…" (nur Literale). */
const ATTRIBUT = /\b(?:aria-label|title)=(?:"([^"]*)"|\{\s*['`"]([^'`"]*)['`"]\s*\})/g
/** Text eines Elements mit der Klasse sr-only (einfaches Literal, keine Ausdrücke). */
const SR_ONLY = /className="[^"]*\bsr-only\b[^"]*"[^>]*>([^<{]+)</g

function texte(inhalt: string): string[] {
  const attribute = [...inhalt.matchAll(ATTRIBUT)].map((t) => t[1] ?? t[2] ?? '')
  const srOnly = [...inhalt.matchAll(SR_ONLY)].map((t) => t[1])
  return [...attribute, ...srOnly].map((t) => t.trim()).filter(Boolean)
}

describe('Deutsche Screenreader-Texte (AK-43)', () => {
  it('findet Komponenten in shared/ui und widgets/app-shell', () => {
    expect(produktiv.length).toBeGreaterThan(20)
  })

  it('findet aria-label- und sr-only-Texte (Selbsttest)', () => {
    expect(texte('<span className="sr-only">Schließen</span>')).toEqual(['Schließen'])
    expect(texte('<nav aria-label="Brotkrumen">')).toEqual(['Brotkrumen'])
    expect(texte("<div aria-label={'Benachrichtigungen'}>")).toEqual(['Benachrichtigungen'])
  })

  it('verwendet in aria-label, title und sr-only-Texten keine englischen Wörter', () => {
    const treffer = produktiv.flatMap(([pfad, inhalt]) =>
      texte(inhalt)
        .filter((text) => ENGLISCH.test(text))
        .map((text) => `${pfad}: ${text}`),
    )

    expect(treffer).toEqual([])
  })

  it.each([
    ['/src/shared/ui/breadcrumb.tsx', 'Brotkrumen'],
    ['/src/shared/ui/breadcrumb.tsx', 'Weitere Seiten'],
    ['/src/shared/ui/spinner.tsx', 'Wird geladen'],
    ['/src/shared/ui/toast.tsx', 'Benachrichtigungen'],
    ['/src/shared/ui/toast.tsx', 'Meldung schließen'],
  ])('enthält in %s den Text „%s“', (pfad, text) => {
    expect(quellen[pfad] ?? '').toContain(text)
  })
})
