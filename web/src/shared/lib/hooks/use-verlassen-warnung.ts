import { useBlocker, useRouter } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Warnung bei ungespeicherten Änderungen (formulare-detailseiten, Abschnitt 4.3, ADR-0040 Punkt 1): blockiert, solange
// `aktiv`, Wechsel des Pfads (TanStack Router `useBlocker`, ohne eingebautes beforeunload) und registriert einen eigenen
// `beforeunload`-Listener. `blockiere(von, nach)` erweitert die Prüfung (z. B. Reiterwechsel per Suchparameter).
// Gespeichert wird nichts.
//
// - Push/Replace (Links, Sidebar, „Abbrechen“): Blocker mit Resolver, die Navigation wartet auf „Bleiben“/„Verlassen“.
// - Zurück/Vor im Verlauf: Ein zweiter Blocker nimmt den Schritt sofort zurück (die URL bleibt stehen) und öffnet den
//   Dialog; „Verlassen“ wiederholt den Schritt ohne Blocker. Historien, die Blocker bei Zurück/Vor gar nicht fragen
//   (Memory-History), melden den Schritt nur nachträglich; dann geht der Hook ihn selbst zurück.

/** Ort einer Navigation, wie ihn `blockiere` sieht. */
export interface NavigationsOrt {
  pathname: string
  search: Record<string, unknown>
}

export interface VerlassenWarnungOptionen {
  aktiv: boolean
  blockiere?: (von: NavigationsOrt, nach: NavigationsOrt) => boolean
}

type Schritt = { art: 'BACK' } | { art: 'FORWARD' } | { art: 'GO'; um: number }

interface Ort {
  pathname: string
  search: unknown
}

function mussBlockieren(
  aktiv: boolean,
  blockiere: VerlassenWarnungOptionen['blockiere'],
  current: Ort,
  next: Ort,
): boolean {
  if (!aktiv) return false
  if (current.pathname !== next.pathname) return true
  return (
    blockiere?.(
      { pathname: current.pathname, search: current.search as Record<string, unknown> },
      { pathname: next.pathname, search: next.search as Record<string, unknown> },
    ) ?? false
  )
}

/** Verlaufsschritt aus der Aktion und dem Abstand der State-Indizes (`__TSR_index`); `GO` über mehrere Schritte bleibt `GO`. */
function schrittFuer(action: 'BACK' | 'FORWARD' | 'GO', delta: number): Schritt {
  if (action === 'FORWARD') return { art: 'FORWARD' }
  if (action === 'BACK') return { art: 'BACK' }
  if (!Number.isFinite(delta) || delta === 0) return { art: 'BACK' }
  return { art: 'GO', um: delta }
}

export function useVerlassenWarnung({ aktiv, blockiere }: VerlassenWarnungOptionen) {
  const router = useRouter()
  const aktivRef = useRef(aktiv)
  const blockiereRef = useRef(blockiere)
  // Layout-Effekt: ein Zurücksetzen per flushSync (nach dem Speichern) wirkt vor der anschließenden Navigation.
  useLayoutEffect(() => {
    aktivRef.current = aktiv
    blockiereRef.current = blockiere
  })

  /** Ein Blocker wurde für die laufende Navigation gefragt (dann braucht es keinen Rückfall). */
  const blockerGefragt = useRef(false)
  /** Ein Verlaufsschritt, den der Hook selbst ausführt (Rückgängig bzw. „Verlassen“). */
  const eigenerSchritt = useRef(false)
  const [offenerSchritt, setOffenerSchritt] = useState<Schritt | null>(null)

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next, action }) => {
      blockerGefragt.current = true
      if (action !== 'PUSH' && action !== 'REPLACE') return false
      return mussBlockieren(aktivRef.current, blockiereRef.current, current, next)
    },
    enableBeforeUnload: false,
    withResolver: true,
  })

  // Zweiter Blocker direkt an der History: Nur sie liefert den Verlaufs-State (`__TSR_index`), aus dem sich die Weite
  // eines `GO`-Sprungs ergibt (`useBlocker` reicht ihn nicht durch).
  useEffect(() => {
    const ort = (location: Parameters<typeof router.parseLocation>[0]): Ort => {
      const geparst = router.parseLocation(location)
      return { pathname: geparst.pathname, search: geparst.search }
    }
    return router.history.block({
      blockerFn: ({ currentLocation, nextLocation, action }) => {
        blockerGefragt.current = true
        if (action === 'PUSH' || action === 'REPLACE' || eigenerSchritt.current) return false
        if (!mussBlockieren(aktivRef.current, blockiereRef.current, ort(currentLocation), ort(nextLocation))) {
          return false
        }
        const delta = nextLocation.state.__TSR_index - currentLocation.state.__TSR_index
        setOffenerSchritt(schrittFuer(action, delta))
        return true
      },
      enableBeforeUnload: false,
    })
  }, [router])

  useEffect(() => {
    let letzterPfad = router.history.location.pathname
    return router.history.subscribe(({ location, action }) => {
      const vorher = letzterPfad
      letzterPfad = location.pathname
      const gefragt = blockerGefragt.current
      blockerGefragt.current = false
      if (eigenerSchritt.current) {
        eigenerSchritt.current = false
        return
      }
      if (gefragt || !aktivRef.current || vorher === location.pathname) return
      if (action.type !== 'BACK' && action.type !== 'FORWARD' && action.type !== 'GO') return
      const schritt: Schritt = action.type === 'GO' ? { art: 'GO', um: action.index } : { art: action.type }
      eigenerSchritt.current = true
      letzterPfad = vorher
      if (schritt.art === 'BACK') router.history.forward({ ignoreBlocker: true })
      else if (schritt.art === 'FORWARD') router.history.back({ ignoreBlocker: true })
      else router.history.go(-schritt.um, { ignoreBlocker: true })
      setOffenerSchritt(schritt)
    })
  }, [router])

  useEffect(() => {
    if (!aktiv) return undefined
    const warnen = (ereignis: BeforeUnloadEvent) => {
      ereignis.preventDefault()
    }
    window.addEventListener('beforeunload', warnen)
    return () => window.removeEventListener('beforeunload', warnen)
  }, [aktiv])

  return {
    blockiert: blocker.status === 'blocked' || offenerSchritt !== null,
    bleiben: () => {
      // Ein blockierter Push erreicht den Verlauf nie; die Markierung darf nicht in den nächsten Schritt hineinwirken.
      blockerGefragt.current = false
      if (offenerSchritt) setOffenerSchritt(null)
      else blocker.reset?.()
    },
    verlassen: () => {
      if (!offenerSchritt) {
        blocker.proceed?.()
        return
      }
      const schritt = offenerSchritt
      setOffenerSchritt(null)
      eigenerSchritt.current = true
      if (schritt.art === 'BACK') router.history.back({ ignoreBlocker: true })
      else if (schritt.art === 'FORWARD') router.history.forward({ ignoreBlocker: true })
      else router.history.go(schritt.um, { ignoreBlocker: true })
    },
  }
}
