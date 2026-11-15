import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import {
  KopfFlaeche,
  Kopfbereich,
  ladeKopf,
  ladeStartseite,
  type KopfAnsicht,
  type StartseiteAnsicht,
} from '@/entities/startseite'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'
import { Fehlerzustand, Ladeanzeige } from '@/shared/ui/zustaende'
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

/**
 * Lädt beim Einhängen und nach `neuLaden` genau einmal; spätere Antworten nach dem Aushängen bzw. eines überholten
 * Abrufs werden verworfen.
 */
function useLaden<T>(laden: () => Promise<{ art: string; daten?: T }>): [Laden<T>, () => void] {
  const [zustand, setZustand] = useState<Laden<T>>({ art: 'laedt' })
  const [durchlauf, setDurchlauf] = useState(0)
  useEffect(() => {
    let aktiv = true
    void laden().then((ergebnis) => {
      if (!aktiv) return
      setZustand(ergebnis.art === 'ok' ? { art: 'ok', daten: ergebnis.daten as T } : { art: 'fehler' })
    })
    return () => {
      aktiv = false
    }
  }, [laden, durchlauf])
  const neuLaden = useCallback(() => {
    setZustand({ art: 'laedt' })
    setDurchlauf((n) => n + 1)
  }, [])
  return [zustand, neuLaden]
}

/**
 * Startseite (/) für alle Besucher (AK-20 bis AK-22). Während des Ladens gibt es kein h1, nur einen Status; danach ist
 * der Titel des aktiven Kopfbereichs bzw. „Willkommen bei C.O.I.N.“ das einzige h1. „Zum Katalog“ steht immer da.
 */
export function StartSeite({ darfAnsehen = false, bereit = true }: StartSeiteProps) {
  return (
    <div className="grid min-w-0 justify-items-stretch gap-6">
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
  return <Ladeanzeige text="Startseite wird geladen …" />
}

/** Mit coins.read: Blöcke über das Widget; bei einem Fehler Begrüßung, Meldung und „Erneut versuchen“ (AK-8). */
function MitLeserecht() {
  const [zustand, neuLaden] = useLaden<StartseiteAnsicht>(ladeStartseite)
  if (zustand.art === 'laedt') return <Laedt />
  if (zustand.art === 'fehler') {
    return (
      <div className="grid gap-6">
        <h1 className="text-2xl font-semibold md:text-3xl">{BEGRUESSUNG}</h1>
        <Fehlerzustand meldung={FEHLERTEXT} onErneutVersuchen={neuLaden} />
      </div>
    )
  }
  return <StartseiteBloecke bloecke={zustand.daten.bloecke} ebene={1} />
}

/** Ohne coins.read: aktiver Kopfbereich statt der Begrüßung, sonst (auch bei Fehlern) die statische Seite (AK-22). */
function OhneLeserecht() {
  const [zustand] = useLaden<KopfAnsicht>(ladeKopf)
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
    <KopfFlaeche>
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{BEGRUESSUNG}</h1>
        <p className="max-w-reading text-lg text-muted-foreground">{EINLEITUNG}</p>
      </div>
    </KopfFlaeche>
  )
}
