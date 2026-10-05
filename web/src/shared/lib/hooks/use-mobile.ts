import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

// Angepasst gegenüber shadcn: useSyncExternalStore statt setState im Effect (react-hooks/set-state-in-effect).
function abonniere(beiAenderung: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', beiAenderung)
  return () => mql.removeEventListener('change', beiAenderung)
}

function istSchmal(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT
}

function serverWert(): boolean {
  return false
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(abonniere, istSchmal, serverWert)
}
