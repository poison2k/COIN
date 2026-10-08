import { Link } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'
import type { Coin } from '@/entities/coin'
import {
  ExemplarTabelle,
  Kennzahlen,
  ladeExemplare,
  type ExemplarSeite,
  type ExemplarStatus,
} from '@/entities/exemplar'
import { AuflageAendern } from '@/features/auflage-aendern'
import type { ApiErgebnis } from '@/shared/api'
import { ROUTEN } from '@/shared/config'
import { useFokusBeiLadefehler } from '@/shared/lib/hooks'
import { Blaettern, seitenAnzahl } from '@/shared/ui/blaettern'
import { buttonVariants } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

type Filter = ExemplarStatus | 'alle'

const FILTER = [
  { value: 'alle', label: 'Alle' },
  { value: 'verfuegbar', label: 'Verfügbar' },
  { value: 'ausgegeben', label: 'Ausgegeben' },
] satisfies Array<{ value: Filter; label: string }>

interface Geladen {
  schluessel: string
  ergebnis: ApiErgebnis<ExemplarSeite>
}

export interface CoinExemplareProps {
  coinId: string
  /** Filter aus der URL; ohne Angabe alle. */
  status?: ExemplarStatus
  /** Seite aus der URL, beginnend bei 1. */
  seite: number
  /** Zähler von außen: Jede Änderung lädt neu (z. B. nach einem Storno in der Historie). */
  neuLaden: number
  /** Link „Ausgabe erfassen“ zeigen (issues.write). */
  darfErfassen: boolean
  /** „Auflage ändern“ zeigen (coins.write). */
  darfAuflageAendern: boolean
  /** Neuer Filter; `undefined` = „Alle“. Die Route beginnt damit wieder auf Seite 1. */
  onStatus: (status?: ExemplarStatus) => void
  onSeite: (seite: number) => void
  /** Nach dem Ändern der Auflage mit dem geänderten Coin (Stammdaten aktualisieren). */
  onAuflageGeaendert?: (coin: Coin) => void
}

/**
 * Abschnitt „Exemplare“ der Detailseite (coin-ausgaben AK-20, AK-23, AK-25): Kennzahlen, Status-Filter, Tabelle und
 * Blättern. Filter und Seite kommen als Props (URL); eine Antwort gilt nur, solange sie zu den Props passt.
 */
export function CoinExemplare({
  coinId,
  status,
  seite,
  neuLaden,
  darfErfassen,
  darfAuflageAendern,
  onStatus,
  onSeite,
  onAuflageGeaendert,
}: CoinExemplareProps) {
  const [geladen, setGeladen] = useState<Geladen | null>(null)
  // Eigener Zähler für „Auflage geändert“; zusammen mit `neuLaden` Teil des Schlüssels.
  const [eigenesNeuLaden, setEigenesNeuLaden] = useState(0)
  const [meldung, setMeldung] = useState<string | null>(null)
  const anfrage = useRef<{ schluessel: string; ergebnis: Promise<ApiErgebnis<ExemplarSeite>> } | null>(null)
  const basis = useId()
  const ueberschriftId = `${basis}-ueberschrift`
  const filterId = `${basis}-filter`

  const schluessel = JSON.stringify([coinId, status ?? null, seite, neuLaden, eigenesNeuLaden])

  useEffect(() => {
    if (anfrage.current?.schluessel !== schluessel) {
      anfrage.current = { schluessel, ergebnis: ladeExemplare(coinId, { status, seite }) }
    }
    let aktiv = true
    void anfrage.current.ergebnis.then((ergebnis) => {
      if (aktiv) setGeladen({ schluessel, ergebnis })
    })
    return () => {
      aktiv = false
    }
  }, [schluessel, coinId, status, seite])

  const ergebnis = geladen?.schluessel === schluessel ? geladen.ergebnis : null
  // Beim Nachladen bleibt die vorige Anzeige stehen, bis die Antwort da ist (Tabelle und Blättern nicht aushängen).
  const anzeige = ergebnis ?? (geladen?.ergebnis.art === 'ok' ? geladen.ergebnis : null)
  const laedt = ergebnis === null
  const fehlgeschlagen = ergebnis !== null && ergebnis.art !== 'ok'
  const { bereichRef, alarmRef, merkeFokus } = useFokusBeiLadefehler(!laedt, fehlgeschlagen)

  const daten = anzeige?.art === 'ok' ? anzeige.daten : null
  const auflageBekannt = daten !== null && daten.kennzahlen.auflage !== null

  function blaettern(neu: number) {
    merkeFokus()
    onSeite(neu)
  }

  function filterGewaehlt(wert: Filter | null) {
    onStatus(wert === 'verfuegbar' || wert === 'ausgegeben' ? wert : undefined)
  }

  function auflageGeaendert(coin: Coin) {
    setMeldung('Auflage wurde geändert.')
    setEigenesNeuLaden((n) => n + 1)
    onAuflageGeaendert?.(coin)
  }

  return (
    <section aria-labelledby={ueberschriftId} className="grid min-w-0 gap-4">
      <h2 id={ueberschriftId} className="text-lg font-semibold">
        Exemplare
      </h2>

      <p role="status" className="text-sm text-muted-foreground empty:sr-only">
        {laedt ? 'Exemplare werden geladen …' : (meldung ?? '')}
      </p>
      {fehlgeschlagen && (
        <p
          ref={alarmRef}
          role="alert"
          tabIndex={-1}
          className="rounded-md text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Die Exemplare konnten nicht geladen werden. Bitte später erneut versuchen.
        </p>
      )}

      {daten && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Kennzahlen kennzahlen={daten.kennzahlen} />
          <div className="flex flex-wrap gap-2">
            {darfAuflageAendern && (
              <AuflageAendern coinId={coinId} auflage={daten.kennzahlen.auflage} onGeaendert={auflageGeaendert} />
            )}
            {darfErfassen && auflageBekannt && (
              <Link to={ROUTEN.coinAusgabeNeu} params={{ coinId }} className={buttonVariants({ size: 'sm' })}>
                Ausgabe erfassen
              </Link>
            )}
          </div>
        </div>
      )}

      {daten &&
        (!auflageBekannt ? (
          <p className="text-muted-foreground">
            Für diesen Coin ist keine Auflage erfasst. Es gibt daher keine Exemplare.
          </p>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor={filterId}>Status</Label>
              <Select<Filter> items={FILTER} value={status ?? 'alle'} onValueChange={filterGewaehlt}>
                <SelectTrigger id={filterId} className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTER.map((eintrag) => (
                    <SelectItem key={eintrag.value} value={eintrag.value}>
                      {eintrag.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {daten.gesamt === 0 ? (
              <p className="text-muted-foreground">Keine Exemplare mit diesem Status.</p>
            ) : (
              <>
                {daten.eintraege.length > 0 ? (
                  <ExemplarTabelle exemplare={daten.eintraege} />
                ) : (
                  <p className="text-muted-foreground">Auf dieser Seite gibt es keine Exemplare.</p>
                )}
                <div ref={bereichRef}>
                  <Blaettern
                    seite={daten.seite}
                    seiten={seitenAnzahl(daten.gesamt, daten.groesse)}
                    onSeite={blaettern}
                    laedt={laedt}
                  />
                </div>
              </>
            )}
          </>
        ))}
    </section>
  )
}
