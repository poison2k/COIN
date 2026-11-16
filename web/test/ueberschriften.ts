import { expect } from 'vitest'

// Testhilfe (startseite-listen-pruefung, AK-33, Regel R2): Auf jeder Seite gibt es nach dem Laden genau ein h1, und
// keine Überschrift springt mehr als eine Ebene tiefer als die vorherige (h1 → h2 → h3). Geprüft werden die sichtbaren
// Überschriften (h1–h6 und role="heading" mit aria-level) im Bereich in DOM-Reihenfolge.

/** Überschriften des Bereichs als „h{Ebene} Text“ in DOM-Reihenfolge. */
export function ueberschriftenListe(bereich: ParentNode = document.body): Array<{ ebene: number; text: string }> {
  const elemente = [...bereich.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, [role="heading"]')]
  return elemente
    .filter((el) => !el.closest('[hidden], [aria-hidden="true"]'))
    .map((el) => {
      const ariaLevel = el.getAttribute('aria-level')
      const ebene = ariaLevel ? Number(ariaLevel) : Number(el.tagName.slice(1))
      return { ebene, text: el.textContent?.replace(/\s+/g, ' ').trim() ?? '' }
    })
}

/** Sprünge um mehr als eine Ebene („h1 „A“ → h3 „B““). */
export function ueberschriftenSpruenge(bereich: ParentNode = document.body): string[] {
  const liste = ueberschriftenListe(bereich)
  const spruenge: string[] = []
  for (let i = 1; i < liste.length; i++) {
    const vorher = liste[i - 1]
    const jetzt = liste[i]
    if (jetzt.ebene > vorher.ebene + 1) {
      spruenge.push(`h${vorher.ebene} „${vorher.text}“ → h${jetzt.ebene} „${jetzt.text}“`)
    }
  }
  return spruenge
}

/** Prüft genau ein h1 und keine Sprünge (AK-33). */
export function pruefeUeberschriften(bereich: ParentNode = document.body): void {
  const liste = ueberschriftenListe(bereich)
  const h1 = liste.filter((u) => u.ebene === 1)
  expect(
    h1.map((u) => u.text),
    'genau ein h1',
  ).toHaveLength(1)
  expect(liste[0]?.ebene, 'die erste Überschrift ist das h1').toBe(1)
  expect(ueberschriftenSpruenge(bereich), 'Überschriften ohne Sprung').toEqual([])
}
