import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Kopfbereich, ladeKopf, ladeStartseite, type KopfAnsicht, type StartseiteAnsicht } from '@/entities/startseite'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'
import { BEGRUESSUNG, StartseiteBloecke } from '@/widgets/startseite'

const EINLEITUNG =
  'C.O.I.N. verwaltet die Gedenk-Coins der Bundeswehr: den Katalog der Coins, ihre nummerierten Exemplare und die Echtheitszertifikate.'

const FEHLERTEXT = 'Die Startseite konnte nicht geladen werden. Bitte später erneut versuchen.'

export interface StartSeiteProps {
  /**
   * Mit `coins.read` (aus `berechtigungen` von /api/me): alle aktiven Blöcke über GET /api/startseite (AK-20).
   * Ohne (anonym, ohne Rolle, deaktiviert): nur der öffentliche Kopfbereich über GET /api/startseite/kopf (AK-22).
   */
  darfAnsehen?: boolean
  /** `false`, solange die Anmeldung noch geprüft wird: nur der Ladestatus, noch kein Aufruf (AK-21). */
  bereit?: boolean
}

type Laden<T> = { art: 'laedt' } | { art: 'ok'; daten: T } | { art: 'fehler' }

/** Lädt einmal beim Einhängen; spätere Antworten nach dem Aushängen werden verworfen. */
function useLaden<T>(laden: () => Promise<{ art: string; daten?: T }>): Laden<T> {
  const [zustand, setZustand] = useState<Laden<T>>({ art: 'laedt' })
  useEffect(() => {
    let aktiv = true
    void laden().then((ergebnis) => {
      if (!aktiv) return
      setZustand(ergebnis.art === 'ok' ? { art: 'ok', daten: ergebnis.daten as T } : { art: 'fehler' })
    })
    return () => {
      aktiv = false
    }
  }, [laden])
  return zustand
}

/**
 * Startseite (/) für alle Besucher (AK-20 bis AK-22). Während des Ladens gibt es kein h1, nur einen Status; danach ist
 * der Titel des aktiven Kopfbereichs bzw. „Willkommen bei C.O.I.N.“ das einzige h1. „Zum Katalog“ steht immer da.
 */
export function StartSeite({ darfAnsehen = false, bereit = true }: StartSeiteProps) {
  return (
    <div className="mx-auto grid w-full max-w-5xl justify-items-stretch gap-6 p-6">
      {!bereit ? <Laedt /> : darfAnsehen ? <MitLeserecht /> : <OhneLeserecht />}
      <div>
        <Link to={ROUTEN.coinListe} className={buttonVariants()}>
          Zum Katalog
        </Link>
      </div>
    </div>
  )
}

function Laedt() {
  return (
    <p role="status" className="text-muted-foreground">
      Startseite wird geladen …
    </p>
  )
}

/** Mit coins.read: Blöcke über das Widget; bei einem Fehler Begrüßung und Meldung (AK-21). */
function MitLeserecht() {
  const zustand = useLaden<StartseiteAnsicht>(ladeStartseite)
  if (zustand.art === 'laedt') return <Laedt />
  if (zustand.art === 'fehler') {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">{BEGRUESSUNG}</h1>
        <p role="alert" className="text-destructive">
          {FEHLERTEXT}
        </p>
      </div>
    )
  }
  return <StartseiteBloecke bloecke={zustand.daten.bloecke} ebene={1} />
}

/** Ohne coins.read: aktiver Kopfbereich statt der Begrüßung, sonst (auch bei Fehlern) die statische Seite (AK-22). */
function OhneLeserecht() {
  const zustand = useLaden<KopfAnsicht>(ladeKopf)
  if (zustand.art === 'laedt') return <Laedt />
  if (zustand.art === 'ok' && zustand.daten.aktiv) {
    const kopf = zustand.daten
    return (
      <Kopfbereich
        titel={kopf.titel}
        untertitel={kopf.untertitel}
        logoBereitsteller={kopf.logoBereitsteller}
        logoSoftware={kopf.logoSoftware}
        ebene={1}
      />
    )
  }
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">{BEGRUESSUNG}</h1>
      <p className="text-muted-foreground">{EINLEITUNG}</p>
    </div>
  )
}
