import { useEffect, useId, useRef, useState } from 'react'
import { AusgabenTabelle, ladeAusgaben, type Ausgabe } from '@/entities/ausgabe'
import { AusgabeStornieren } from '@/features/ausgabe-stornieren'
import type { ApiErgebnis, Seite } from '@/shared/api'
import { useFokusBeiLadefehler } from '@/shared/lib/hooks'
import { Blaettern, seitenAnzahl } from '@/shared/ui/blaettern'

interface Geladen {
  schluessel: string
  ergebnis: ApiErgebnis<Seite<Ausgabe>>
}

export interface AusgabenHistorieProps {
  coinId: string
  /** Button „Stornieren“ je aktiver Ausgabe (issues.write). */
  darfStornieren: boolean
  /** Nach einem Storno, damit die Kennzahlen neu laden. */
  onGeaendert: () => void
}

/**
 * Abschnitt „Ausgabehistorie“ der Detailseite (coin-ausgaben AK-22, AK-24): Tabelle, Blättern (Seite lokal) und
 * „Stornieren“ je aktiver Zeile. Nach einem Storno erscheint eine Statusmeldung mit Fokus; die Historie lädt neu.
 */
export function AusgabenHistorie({ coinId, darfStornieren, onGeaendert }: AusgabenHistorieProps) {
  const [seite, setSeite] = useState(1)
  const [neuLaden, setNeuLaden] = useState(0)
  const [geladen, setGeladen] = useState<Geladen | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  // Ausgabe, deren Storno-Dialog nach einem Fehler offen ist: Er bleibt nach dem Neuladen stehen, auch wenn sie
  // inzwischen storniert ist (sonst verschwände die Fehlermeldung mit dem Dialog).
  const [offenNachFehler, setOffenNachFehler] = useState<string | null>(null)
  const meldungRef = useRef<HTMLParagraphElement>(null)
  const fokusAufMeldung = useRef(false)
  const anfrage = useRef<{ schluessel: string; ergebnis: Promise<ApiErgebnis<Seite<Ausgabe>>> } | null>(null)
  const ueberschriftId = `${useId()}-ueberschrift`

  const schluessel = JSON.stringify([coinId, seite, neuLaden])

  useEffect(() => {
    if (anfrage.current?.schluessel !== schluessel) {
      anfrage.current = { schluessel, ergebnis: ladeAusgaben(coinId, { seite }) }
    }
    let aktiv = true
    void anfrage.current.ergebnis.then((ergebnis) => {
      if (aktiv) setGeladen({ schluessel, ergebnis })
    })
    return () => {
      aktiv = false
    }
  }, [schluessel, coinId, seite])

  // Nach einem Storno die Statusmeldung fokussieren (der Button der Zeile entfällt).
  useEffect(() => {
    if (meldung && fokusAufMeldung.current) {
      fokusAufMeldung.current = false
      meldungRef.current?.focus()
    }
  }, [meldung])

  const ergebnis = geladen?.schluessel === schluessel ? geladen.ergebnis : null
  const anzeige = ergebnis ?? (geladen?.ergebnis.art === 'ok' ? geladen.ergebnis : null)
  const laedt = ergebnis === null
  const fehlgeschlagen = ergebnis !== null && ergebnis.art !== 'ok'
  const { bereichRef, alarmRef, merkeFokus } = useFokusBeiLadefehler(!laedt, fehlgeschlagen)
  const daten = anzeige?.art === 'ok' ? anzeige.daten : null

  function blaettern(neu: number) {
    merkeFokus()
    setSeite(neu)
  }

  function storniert(ausgabe: Ausgabe) {
    setOffenNachFehler(null)
    fokusAufMeldung.current = true
    setMeldung(`Ausgabe von Exemplar Nr. ${ausgabe.exemplarNummer} wurde storniert.`)
    setNeuLaden((n) => n + 1)
    onGeaendert()
  }

  function stornoFehlgeschlagen(ausgabeId: string) {
    // Z. B. 409 bereits_storniert: Die Historie zeigt danach den aktuellen Stand.
    setOffenNachFehler(ausgabeId)
    setNeuLaden((n) => n + 1)
  }

  return (
    <section aria-labelledby={ueberschriftId} className="grid min-w-0 gap-4">
      <h2 id={ueberschriftId} className="text-lg font-semibold">
        Ausgabehistorie
      </h2>

      <p
        ref={meldungRef}
        role="status"
        tabIndex={-1}
        className="rounded-md text-sm outline-none empty:sr-only focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {meldung ?? (laedt && daten === null ? 'Ausgaben werden geladen …' : '')}
      </p>
      {fehlgeschlagen && (
        <p
          ref={alarmRef}
          role="alert"
          tabIndex={-1}
          className="rounded-md text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Die Ausgaben konnten nicht geladen werden. Bitte später erneut versuchen.
        </p>
      )}

      {daten &&
        (daten.gesamt === 0 ? (
          <p className="text-muted-foreground">Für diesen Coin wurden noch keine Ausgaben erfasst.</p>
        ) : (
          <>
            {daten.eintraege.length > 0 ? (
              <AusgabenTabelle
                ausgaben={daten.eintraege}
                aktion={
                  darfStornieren
                    ? (ausgabe) =>
                        ausgabe.storno === null || ausgabe.id === offenNachFehler ? (
                          <AusgabeStornieren
                            coinId={coinId}
                            ausgabe={ausgabe}
                            onStorniert={storniert}
                            onFehler={() => stornoFehlgeschlagen(ausgabe.id)}
                            onGeschlossen={() => setOffenNachFehler(null)}
                          />
                        ) : null
                    : undefined
                }
              />
            ) : (
              <p className="text-muted-foreground">Auf dieser Seite gibt es keine Ausgaben.</p>
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
        ))}
    </section>
  )
}
