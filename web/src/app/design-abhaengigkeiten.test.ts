import { describe, expect, it } from 'vitest'

// Feature design-fundament, AK-9, AK-44 (ADR-0037 Punkt 1, ADR-0038): Neu ist nur @axe-core/playwright als
// devDependency; kein sonner, kein @stack-lib/*, keine neue Laufzeitabhängigkeit für Bausteine oder Toast.

const roh = import.meta.glob<string>('/package.json', { query: '?raw', import: 'default', eager: true })[
  '/package.json'
]
const paket = JSON.parse(roh) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
const laufzeit = Object.keys(paket.dependencies ?? {})
const entwicklung = Object.keys(paket.devDependencies ?? {})

describe('Abhängigkeiten für das Design-Fundament (AK-44)', () => {
  it('führt @axe-core/playwright als devDependency', () => {
    expect(entwicklung).toContain('@axe-core/playwright')
  })

  it('führt @axe-core/playwright nicht als Laufzeitabhängigkeit', () => {
    expect(laufzeit).not.toContain('@axe-core/playwright')
  })

  it('enthält kein sonner', () => {
    expect([...laufzeit, ...entwicklung]).not.toContain('sonner')
  })

  it('enthält keine Toast-, Storybook- oder weitere UI-Bibliothek', () => {
    const verdaechtig =
      /toast|sonner|storybook|radix|headlessui|mui|chakra|mantine|jest-axe|vitest-axe|axe-playwright$/i
    expect([...laufzeit, ...entwicklung].filter((name) => verdaechtig.test(name))).toEqual([])
  })

  it('enthält keine @stack-lib-Pakete', () => {
    expect([...laufzeit, ...entwicklung].filter((name) => name.startsWith('@stack-lib/'))).toEqual([])
  })

  it('verwendet Base UI als einzige Primitive-Bibliothek (Toast aus @base-ui/react)', () => {
    expect(laufzeit).toContain('@base-ui/react')
  })
})
