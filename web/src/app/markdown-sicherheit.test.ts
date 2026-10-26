import { describe, expect, it } from 'vitest'

// Feature startseite, AK-24 und ADR-0031 Punkt 6/7 (Code-Test nach dem Muster von abhaengigkeiten.test.ts): Im Frontend
// gibt es kein dangerouslySetInnerHTML und keine innerHTML-Zuweisung; Markdown rendert nur shared/ui/markdown.tsx mit
// react-markdown und remark-breaks, ohne rehype-raw (rohes HTML wird nie ausgeführt).

const quellen = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const roh = import.meta.glob<string>('/package.json', { query: '?raw', import: 'default', eager: true })[
  '/package.json'
]
const paket = JSON.parse(roh) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
const alle = { ...paket.dependencies, ...paket.devDependencies }

function treffer(muster: RegExp): string[] {
  return Object.entries(quellen)
    .filter(([, inhalt]) => muster.test(inhalt))
    .map(([pfad]) => pfad)
}

describe('Kein rohes HTML im Frontend (ADR-0031 Punkt 7)', () => {
  it('findet Quelldateien unter src', () => {
    expect(Object.keys(quellen).length).toBeGreaterThan(20)
  })

  it('enthält in Produktivcode kein dangerouslySetInnerHTML', () => {
    expect(treffer(/dangerouslySetInnerHTML/)).toEqual([])
  })

  it('weist in Produktivcode nie innerHTML oder outerHTML zu', () => {
    expect(treffer(/\.(inner|outer)HTML\s*=/)).toEqual([])
  })

  it('verwendet kein insertAdjacentHTML und kein document.write', () => {
    expect(treffer(/insertAdjacentHTML|document\.write/)).toEqual([])
  })
})

describe('Markdown nur an einer Stelle (ADR-0031 Punkt 6, S4)', () => {
  it('hat react-markdown als dependency', () => {
    expect(paket.dependencies?.['react-markdown']).toBeDefined()
  })

  it('hat remark-breaks als dependency', () => {
    expect(paket.dependencies?.['remark-breaks']).toBeDefined()
  })

  it('enthält kein rehype-raw', () => {
    expect(Object.keys(alle).filter((name) => name === 'rehype-raw')).toEqual([])
  })

  it('importiert react-markdown nur in shared/ui/markdown.tsx', () => {
    expect(treffer(/from ['"]react-markdown['"]/)).toEqual(['/src/shared/ui/markdown.tsx'])
  })

  it('importiert rehype-raw nirgends', () => {
    expect(treffer(/rehype-raw/)).toEqual([])
  })
})
