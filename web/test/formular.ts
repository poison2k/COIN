import { screen, within } from '@testing-library/react'
import { expect } from 'vitest'

// Testhilfen für das Formularmuster (Feature formulare-detailseiten, Abschnitt 4.1, ADR-0039): Abschnitte als Gruppen,
// Pflichtkennzeichnung, Fehlerzusammenfassung oben im Formular, Formularmeldungen oben.

/** Titel der Fehlerzusammenfassung (Text der Startseite). */
export const ZUSAMMENFASSUNG_TITEL = 'Bitte die markierten Eingaben prüfen.'

/** Liefert die Fehlerzusammenfassung (role="alert" mit dem Titel) oder `undefined`. */
export function zusammenfassung(): HTMLElement | undefined {
  return screen.queryAllByRole('alert').find((el) => el.textContent?.includes(ZUSAMMENFASSUNG_TITEL))
}

/** Texte der Links in der Fehlerzusammenfassung (Leerraum zusammengefasst). */
export function zusammenfassungsLinks(): string[] {
  const alarm = zusammenfassung()
  expect(alarm, 'Fehlerzusammenfassung fehlt').toBeDefined()
  return within(alarm as HTMLElement)
    .getAllByRole('link')
    .map((l) => l.textContent?.replace(/\s+/g, ' ').trim() ?? '')
}

/** Liegt `a` im Dokument vor `b`? */
export function liegtVor(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

/** Erste Gruppe (Formularabschnitt) im Formular des Elements. */
export function ersterAbschnitt(element: Element): HTMLElement {
  const form = element.closest('form') ?? document.body
  const gruppe = within(form as HTMLElement).getAllByRole('group')[0]
  expect(gruppe, 'Formular ohne Abschnitt').toBeDefined()
  return gruppe
}

/** Prüft die Pflichtkennzeichnung eines Felds (AK-2): required, „(Pflichtfeld)“ im Namen, „(Pflicht)“ sichtbar. */
export function erwartePflicht(feld: HTMLElement): void {
  expect(feld).toBeRequired()
  expect(feld).toHaveAccessibleName(/\(Pflichtfeld\)/)
  const label = document.querySelector(`label[for="${feld.id}"]`)
  expect(label?.textContent ?? '').toContain('(Pflicht)')
}

/** Prüft ein optionales Feld (AK-2): kein required, kein „Pflicht“ im Namen, „(optional)“ im Label. */
export function erwarteOptional(feld: HTMLElement): void {
  expect(feld).not.toBeRequired()
  expect(feld).not.toHaveAccessibleName(/Pflicht/)
  expect(feld).toHaveAccessibleName(/\(optional\)/)
}

/** Prüft den Fehlertext am Feld (AK-5): aria-invalid und Meldung in der zugänglichen Beschreibung. */
export function erwarteFeldfehler(feld: HTMLElement, meldung: string): void {
  expect(feld).toHaveAttribute('aria-invalid', 'true')
  expect(feld).toHaveAccessibleDescription(expect.stringContaining(meldung))
}

/** Prüft, dass das Feld keinen Fehler zeigt (AK-4). */
export function erwarteKeinenFeldfehler(feld: HTMLElement): void {
  expect(feld).not.toHaveAttribute('aria-invalid', 'true')
  expect(feld).not.toHaveAccessibleDescription(/Fehler:/)
}

/** Meldung oben im Formular (AK-8): Alarm mit dem Text, vor dem ersten Abschnitt. */
export function erwarteMeldungOben(text: string, feldImFormular: HTMLElement): void {
  const alarm = screen.queryAllByRole('alert').find((el) => el.textContent?.includes(text))
  expect(alarm, `Alarm „${text}“ fehlt`).toBeDefined()
  expect(liegtVor(alarm as HTMLElement, ersterAbschnitt(feldImFormular))).toBe(true)
}

/** Prüft den Ladezustand eines Buttons (AK-10). */
export function erwarteLaedt(knopf: HTMLElement): void {
  expect(knopf).toHaveAttribute('aria-busy', 'true')
  expect(knopf).toHaveAttribute('aria-disabled', 'true')
  expect(knopf).not.toBeDisabled()
}
