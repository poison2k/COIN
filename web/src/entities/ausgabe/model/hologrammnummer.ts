/** Höchstlänge der Anzeigeform einer Hologrammnummer (hologrammnummer, Abschnitt 4.1). */
export const HOLOGRAMMNUMMER_MAX = 40

/** Rohe Eingaben über dieser Länge werden nicht weiter verarbeitet (Längenfehler). */
const ROH_MAX = 200

const MELDUNG_ZEICHEN =
  'Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.'
const MELDUNG_LAENGE = `Die Hologrammnummer darf höchstens ${HOLOGRAMMNUMMER_MAX} Zeichen lang sein.`
const MELDUNG_OHNE_ZEICHEN = 'Die Hologrammnummer muss mindestens einen Buchstaben oder eine Ziffer enthalten.'

/** Ergebnis von `pruefeHologrammnummer`. */
export type HologrammnummerPruefung =
  { art: 'leer' } | { art: 'ok'; anzeige: string; normalform: string } | { art: 'fehler'; meldung: string }

const LEERRAUM = /^\p{White_Space}$/u
const STRICH = /^\p{Pd}$/u
const FORMAT = /^\p{Cf}$/u
const ERLAUBT = /^[A-Z0-9 -]*$/

/** Großbuchstabe wie `ToUpperInvariant` im Backend: nur 1:1-Abbildungen (ß bleibt ß). */
function gross(zeichen: string): string {
  const ergebnis = zeichen.toUpperCase()
  return ergebnis.length === 1 ? ergebnis : zeichen
}

/**
 * Normalisiert und prüft eine Hologrammnummer wie `Hologrammnummer.Pruefen` im Backend (ADR-0033 Punkt 4): leer → keine
 * Nummer; mehr als 200 Zeichen roh → Längenfehler; NFKC; Leerraum → Leerzeichen, Striche (Pd, U+2212) → `-`,
 * Formatzeichen (Cf) entfallen; trimmen, Leerzeichen zusammenfassen, Großbuchstaben → Anzeigeform; nur A–Z, 0–9,
 * Leerzeichen und `-`, höchstens 40 Zeichen; Normalform ohne Leerzeichen und `-`, nicht leer.
 */
export function pruefeHologrammnummer(eingabe: string | null | undefined): HologrammnummerPruefung {
  // Wie string.IsNullOrWhiteSpace: nur Leerraum, nicht trim() (das auch U+FEFF entfernt).
  if (eingabe == null || /^\p{White_Space}*$/u.test(eingabe)) return { art: 'leer' }
  if (eingabe.length > ROH_MAX) return { art: 'fehler', meldung: MELDUNG_LAENGE }

  // Zeichenweise über UTF-16-Einheiten wie im Backend.
  const nfkc = eingabe.normalize('NFKC')
  let zeichen = ''
  for (let i = 0; i < nfkc.length; i++) {
    const z = nfkc[i]
    if (LEERRAUM.test(z)) zeichen += ' '
    else if (STRICH.test(z) || z === '−') zeichen += '-'
    else if (!FORMAT.test(z)) zeichen += z
  }

  let anzeige = ''
  for (const z of zeichen.replace(/^ +| +$/g, '')) {
    if (z === ' ' && anzeige.endsWith(' ')) continue
    anzeige += gross(z)
  }

  if (!ERLAUBT.test(anzeige)) return { art: 'fehler', meldung: MELDUNG_ZEICHEN }
  if (anzeige.length > HOLOGRAMMNUMMER_MAX) return { art: 'fehler', meldung: MELDUNG_LAENGE }
  const normalform = anzeige.replace(/[ -]/g, '')
  if (normalform.length === 0) return { art: 'fehler', meldung: MELDUNG_OHNE_ZEICHEN }
  return { art: 'ok', anzeige, normalform }
}
