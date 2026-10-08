import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** Feste UI-Texte aus dem Entwurf (AK-31, AK-32, AK-34). */
export const TEXTE = {
  formatUngueltig: 'Nur JPEG, PNG oder WebP erlaubt.',
  zuGross: 'Bild ist zu groß (max. 5 MB).',
  konflikt: 'Ein Coin mit diesem Namen und Herausgeber existiert bereits.',
  erfolg: 'Coin wurde angelegt.',
  teilerfolgPraefix: 'Coin wurde angelegt, das Bild konnte nicht gespeichert werden:',
  erneutHochladen: 'Bild erneut hochladen',
  bildEntfernen: 'Bild entfernen',
  vorschauAlt: 'Vorschau des Motivbilds',
  exifHinweis: 'Bitte nur Bilder ohne personenbezogene Metadaten hochladen.',
  leereListe: 'Noch keine Coins erfasst.',
} as const

/** Die Formularfelder, gefunden über ihre Beschriftung (AK-30). */
export function formularFelder() {
  return {
    name: screen.getByLabelText(/^Name/) as HTMLInputElement,
    herausgeber: screen.getByLabelText(/^Herausgeber/) as HTMLInputElement,
    auflage: screen.getByLabelText(/^Auflage/) as HTMLInputElement,
    beschreibung: screen.getByLabelText(/^Beschreibung/) as HTMLTextAreaElement,
    motivbild: screen.getByLabelText(/^Motivbild/) as HTMLInputElement,
    absenden: screen.getByRole('button', { name: 'Coin anlegen' }) as HTMLButtonElement,
  }
}

export interface Eingaben {
  name?: string
  herausgeber?: string
  auflage?: string
  beschreibung?: string
  bild?: File
}

/** Füllt das Formular aus; nicht angegebene Felder bleiben leer. */
export async function fuelleAus(user: UserEvent, eingaben: Eingaben): Promise<void> {
  const felder = formularFelder()
  if (eingaben.name) await user.type(felder.name, eingaben.name)
  if (eingaben.herausgeber) await user.type(felder.herausgeber, eingaben.herausgeber)
  if (eingaben.auflage) await user.type(felder.auflage, eingaben.auflage)
  if (eingaben.beschreibung) await user.type(felder.beschreibung, eingaben.beschreibung)
  if (eingaben.bild) await user.upload(felder.motivbild, eingaben.bild)
}

/**
 * Gibt einen Text schnell in ein Feld ein: Klick (Fokus) und Einfügen in einem Schritt statt Taste für Taste.
 * Für längere Texte, bei denen das Tippen selbst nicht geprüft wird (vermeidet langsame Tests und Eingaben,
 * die nach einem Timeout in den nächsten Test laufen). Wird vollständig abgewartet.
 */
export async function gibEin(user: UserEvent, feld: HTMLElement, text: string): Promise<void> {
  await user.click(feld)
  await user.paste(text)
}

/** Sucht eine Meldung mit role="status" oder role="alert", die den Text enthält. */
export function meldungMit(text: string): HTMLElement | undefined {
  const kandidaten = [...screen.queryAllByRole('status'), ...screen.queryAllByRole('alert')]
  return kandidaten.find((el) => el.textContent?.includes(text))
}

/** Gesamter sichtbarer Text der Seite. */
export function seitentext(): string {
  return document.body.textContent ?? ''
}
