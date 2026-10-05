/** Steuerzeichen (inkl. Tabulator und Zeilenumbruch), die Browser in URLs teils still entfernen. */
// eslint-disable-next-line no-control-regex -- Steuerzeichen sollen hier gerade erkannt werden.
const STEUERZEICHEN = /[\u0000-\u001f\u007f]/

/**
 * Rückkehrziel nach der Anmeldung (AK-24, Abschnitt 7): nur ein relativer Pfad derselben Origin, sonst `/`.
 * Verhindert Open Redirects über den OIDC-State (fremde, protokollrelative, javascript:- oder data:-URLs).
 */
export function sicheresZiel(ziel: unknown): string {
  if (typeof ziel !== 'string' || !ziel.startsWith('/') || ziel.startsWith('//')) return '/'
  if (ziel.includes('\\') || STEUERZEICHEN.test(ziel)) return '/'

  try {
    const basis = window.location.origin
    const url = new URL(ziel, basis)
    if (url.origin !== basis) return '/'
    // Nach der Normalisierung erneut prüfen: Aus '/.//host' wird sonst der protokollrelative Pfad '//host'.
    const ergebnis = `${url.pathname}${url.search}${url.hash}`
    if (!ergebnis.startsWith('/') || ergebnis.startsWith('//') || ergebnis.includes('\\')) return '/'
    if (new URL(ergebnis, basis).origin !== basis) return '/'
    return ergebnis
  } catch {
    return '/'
  }
}
