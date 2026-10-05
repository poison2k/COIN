/** Anmeldung über OpenID Connect (ADR-0012): Adresse des Identitätsanbieters und öffentlicher Client. */
export interface OidcKonfig {
  authority: string
  clientId: string
}

/** Relevanter Ausschnitt aus `import.meta.env`. */
export interface OidcUmgebung {
  VITE_OIDC_AUTHORITY?: string
  VITE_OIDC_CLIENT_ID?: string
}

/**
 * Liest die Anmeldekonfiguration aus den Vite-Umgebungsvariablen (AK-23). Fehlt ein Wert oder ist die Authority
 * keine absolute http(s)-URL, ist die Anmeldung nicht konfiguriert (`null`); der Katalog bleibt lesbar.
 */
export function leseOidcKonfig(env: OidcUmgebung): OidcKonfig | null {
  const authority = env.VITE_OIDC_AUTHORITY?.trim()
  const clientId = env.VITE_OIDC_CLIENT_ID?.trim()
  if (!authority || !clientId) return null

  let url: URL
  try {
    url = new URL(authority)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  return { authority: authority.replace(/\/+$/, ''), clientId }
}

declare global {
  /** Vite-Umgebungsvariablen der Anmeldung (web/.env.development, AK-23). */
  interface ImportMetaEnv {
    readonly VITE_OIDC_AUTHORITY?: string
    readonly VITE_OIDC_CLIENT_ID?: string
  }
}
