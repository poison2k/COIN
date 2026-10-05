/** Liefert das aktuelle Access-Token oder `null` (anonym). Wird pro API-Aufruf neu gefragt (AK-26). */
export type TokenQuelle = () => string | null | undefined | Promise<string | null | undefined>

let quelle: TokenQuelle | null = null

/** Registriert die Token-Quelle (die Anmeldung); `null` = keine Anmeldung. */
export function setzeTokenQuelle(neu: TokenQuelle | null): void {
  quelle = neu
}

/** Aktuelles Access-Token für den Authorization-Header; bei Fehlern `null` (dann anonym). */
export async function holeToken(): Promise<string | null> {
  if (!quelle) return null
  try {
    return (await quelle()) || null
  } catch {
    return null
  }
}
