import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'

// Prüfhilfen für die UI-Tests des Features design-fundament (ADR-0037): axe ohne serious/critical, sichtbarer Fokus
// (AK-5) und Klickflächen ≥ 40 × 40 px (AK-34).

/** axe mit WCAG 2.0/2.1 A und AA; Fehler sind Verstöße mit impact serious oder critical. Keine Regel wird abgeschaltet. */
export async function axeVerstoesse(page: Page): Promise<string[]> {
  const ergebnis = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  // Nur Regel-Id, Selektor und Hilfe-URL, nie Seiteninhalte (ADR-0037 Punkt 1).
  return ergebnis.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}) ${n.target.join(' ')} – ${v.helpUrl}`))
}

export async function erwarteKeineAxeVerstoesse(page: Page): Promise<void> {
  expect(await axeVerstoesse(page), 'axe-Verstöße (serious/critical)').toEqual([])
}

/**
 * Fokusindikator des fokussierten Elements (AK-5): berechneter outline-width ≥ 2 px (outline-style ≠ none) oder
 * box-shadow ≠ none. Liefert eine Beschreibung des Elements, wenn kein Indikator sichtbar ist, sonst null.
 */
export async function fehlenderFokusIndikator(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return 'kein fokussiertes Element'
    const stil = getComputedStyle(el)
    const outline = stil.outlineStyle !== 'none' && parseFloat(stil.outlineWidth) >= 2
    const schatten = stil.boxShadow !== 'none' && stil.boxShadow !== ''
    if (outline || schatten) return null
    const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? ''
    return `${el.tagName.toLowerCase()} „${name}“: outline ${stil.outlineStyle} ${stil.outlineWidth}, box-shadow ${stil.boxShadow}`
  })
}

export async function erwarteSichtbarenFokus(page: Page): Promise<void> {
  expect(await fehlenderFokusIndikator(page)).toBeNull()
}

const ROLLEN = ['button', 'link', 'checkbox', 'combobox', 'textbox', 'menuitem', 'switch', 'radio'] as const

/**
 * Klickflächen im Bereich (AK-34): sichtbare Elemente der Rollen oben sind ≥ 40 × 40 px; Checkbox und Radio gemessen an
 * der umgebenden Beschriftung (`label`). Ausgenommen: Links im Fließtext (`p a`) und der unfokussierte Skip-Link.
 * Liefert die zu kleinen Elemente.
 */
export async function zuKleineKlickflaechen(bereich: Locator): Promise<string[]> {
  const zuKlein: string[] = []
  for (const rolle of ROLLEN) {
    const elemente = await bereich.getByRole(rolle).all()
    for (const element of elemente) {
      if (!(await element.isVisible())) continue
      const mass = await element.evaluate((el, r) => {
        if (el.closest('p') && el.tagName === 'A') return null
        // D9: Textlinks in Tabellen bleiben bis zum Tabellen-Umbau ausgenommen.
        if (el.closest('td, th') && el.tagName === 'A') return null
        if (el.tagName === 'A' && el.getAttribute('href') === '#inhalt' && document.activeElement !== el) return null
        const ziel = r === 'checkbox' || r === 'radio' ? (el.closest('label') ?? el) : el
        const box = ziel.getBoundingClientRect()
        if (box.width === 0 && box.height === 0) return null
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? ''
        return { breite: box.width, hoehe: box.height, name: `${r} „${name}“` }
      }, rolle)
      if (mass && (mass.breite < 40 - 0.5 || mass.hoehe < 40 - 0.5)) {
        zuKlein.push(`${mass.name}: ${Math.round(mass.breite)} × ${Math.round(mass.hoehe)} px`)
      }
    }
  }
  return zuKlein
}
