import { UserManager, WebStorageStateStore } from 'oidc-client-ts'
import { ROUTEN, type OidcKonfig } from '@/shared/config'

/**
 * UserManager für den öffentlichen Client (ADR-0012): Authorization Code Flow mit PKCE (S256), kein Secret.
 * User und State nur in sessionStorage (AK-25). Erneuerung per Refresh-Token ohne iframe (AK-26).
 */
export function erstelleUserManager(konfig: OidcKonfig, origin: string = window.location.origin): UserManager {
  return new UserManager({
    authority: konfig.authority,
    client_id: konfig.clientId,
    redirect_uri: `${origin}${ROUTEN.anmeldungRueckruf}`,
    post_logout_redirect_uri: `${origin}${ROUTEN.abgemeldet}`,
    // Kein iframe: Ohne Angabe nutzt oidc-client-ts die redirect_uri. Erneuert wird nur per Refresh-Token.
    silent_redirect_uri: '',
    response_type: 'code',
    scope: 'openid profile email',
    disablePKCE: false,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: true,
    monitorSession: false,
    loadUserInfo: false,
  })
}
