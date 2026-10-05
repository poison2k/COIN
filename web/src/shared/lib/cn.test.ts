import { describe, expect, it } from 'vitest'
import { cn } from './cn'

// AK-11: cn() fügt Klassen zusammen (clsx) und löst Tailwind-Konflikte auf (tailwind-merge).

describe('cn – Zusammenfügen', () => {
  it('fügt mehrere Klassen mit Leerzeichen zusammen', () => {
    expect(cn('flex', 'items-center', 'gap-2')).toBe('flex items-center gap-2')
  })

  it('liefert ohne Argumente eine leere Zeichenkette', () => {
    expect(cn()).toBe('')
  })

  it('übernimmt eine einzelne Klasse unverändert', () => {
    expect(cn('font-bold')).toBe('font-bold')
  })
})

describe('cn – falsy-Werte', () => {
  it('ignoriert false', () => {
    expect(cn('flex', false, 'gap-2')).toBe('flex gap-2')
  })

  it('ignoriert null', () => {
    expect(cn('flex', null, 'gap-2')).toBe('flex gap-2')
  })

  it('ignoriert undefined', () => {
    expect(cn('flex', undefined, 'gap-2')).toBe('flex gap-2')
  })

  it('ignoriert die leere Zeichenkette', () => {
    expect(cn('flex', '', 'gap-2')).toBe('flex gap-2')
  })

  it('liefert nur aus falsy-Werten eine leere Zeichenkette', () => {
    expect(cn(false, null, undefined, '')).toBe('')
  })
})

describe('cn – Bedingungen', () => {
  it('übernimmt aus einem Objekt nur Klassen mit wahrem Wert', () => {
    expect(cn({ 'font-bold': true, italic: false, underline: true })).toBe('font-bold underline')
  })

  it('löst Arrays auf', () => {
    expect(cn(['flex', 'gap-2'], 'p-2')).toBe('flex gap-2 p-2')
  })

  it('löst verschachtelte Arrays mit Objekten und falsy-Werten auf', () => {
    expect(cn(['flex', [null, { 'gap-2': true, 'gap-4': false }]])).toBe('flex gap-2')
  })

  it('übernimmt eine Klasse aus einem wahren Ausdruck „bedingung && klasse“', () => {
    const aktiv = true
    expect(cn('rounded', aktiv && 'ring-2')).toBe('rounded ring-2')
  })

  it('lässt eine Klasse aus einem falschen Ausdruck „bedingung && klasse“ weg', () => {
    const aktiv = false
    expect(cn('rounded', aktiv && 'ring-2')).toBe('rounded')
  })
})

describe('cn – Tailwind-Konflikte', () => {
  it('lässt bei p-2 und p-4 die spätere Klasse gewinnen', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('lässt bei px-2 und px-4 die spätere Klasse gewinnen', () => {
    expect(cn('px-2 px-4')).toBe('px-4')
  })

  it('ersetzt text-sm durch text-lg, wenn die Bedingung wahr ist', () => {
    const gross = true
    expect(cn('text-sm', gross && 'text-lg')).toBe('text-lg')
  })

  it('behält text-sm, wenn die Bedingung falsch ist', () => {
    const gross = false
    expect(cn('text-sm', gross && 'text-lg')).toBe('text-sm')
  })

  it('behält nicht konkurrierende Klassen und ersetzt nur die konkurrierende', () => {
    expect(cn('p-2 font-bold', 'p-4')).toBe('font-bold p-4')
  })

  it('lässt p-4 nach px-2 die Achsenklasse überschreiben', () => {
    expect(cn('px-2', 'p-4')).toBe('p-4')
  })

  it('behält px-2 nach p-4, weil die Achsenklasse spezifischer ist', () => {
    expect(cn('p-4', 'px-2')).toBe('p-4 px-2')
  })

  it('behält Farbe und Größe von text-* nebeneinander', () => {
    expect(cn('text-sm', 'text-destructive')).toBe('text-sm text-destructive')
  })

  it('löst Konflikte auch innerhalb einer Variante wie hover: auf', () => {
    expect(cn('hover:bg-muted', 'hover:bg-accent')).toBe('hover:bg-accent')
  })

  it('lässt Klassen verschiedener Varianten nebeneinander bestehen', () => {
    expect(cn('bg-muted', 'dark:bg-accent')).toBe('bg-muted dark:bg-accent')
  })
})
