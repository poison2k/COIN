import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ladeKonfiguration, useDateiUrl, type Konfiguration } from '@/entities/startseite'
import {
  ausKonfiguration,
  istGeaendert,
  StartseiteFormular,
  zuAnsicht,
  type Formular,
} from '@/features/startseite-konfigurieren'
import { Button } from '@/shared/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { StartseiteBloecke } from '@/widgets/startseite'

export interface StartseiteVerwaltungSeiteProps {
  /** Meldet, ob ungespeicherte Änderungen vorliegen (AK-32); der Aufrufer sichert damit das Verlassen ab. */
  onGeaendert: (geaendert: boolean) => void
}

/** `ladung` zählt erfolgreiche Ladevorgänge; das Formular wird damit nach „Neu laden“ frisch eingehängt (AK-30). */
type Laden =
  | { art: 'laedt' }
  | { art: 'ok'; konfiguration: Konfiguration; formular: Formular; ladung: number; neuGeladen: boolean }
  | { art: 'fehler' }

const zeitFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
})

function formatiereZeitpunkt(wert: string): string {
  const datum = new Date(wert)
  return Number.isNaN(datum.getTime()) ? wert : `${zeitFormat.format(datum)} Uhr`
}

/**
 * Seite „Startseite verwalten“ (/verwaltung/startseite, AK-26 bis AK-33): lädt die Konfiguration, Tabs „Bearbeiten“
 * (Formular) und „Vorschau“ (dasselbe Widget wie `/`, Basisebene h2). Frei von Router-Hooks; rendert kein `<main>`.
 */
export function StartseiteVerwaltungSeite({ onGeaendert }: StartseiteVerwaltungSeiteProps) {
  const [zustand, setZustand] = useState<Laden>({ art: 'laedt' })
  const [ladeZaehler, setLadeZaehler] = useState(0)
  // „Neu laden“ bei geladenem Formular: Formular bleibt eingehängt und gesperrt, bis der GET antwortet (AK-30).
  const [laedtNeu, setLaedtNeu] = useState(false)
  const [neuLadenFehler, setNeuLadenFehler] = useState(false)
  const laedtNeuRef = useRef(false)

  useEffect(() => {
    let aktiv = true
    void ladeKonfiguration().then((ergebnis) => {
      if (!aktiv) return
      const neu = laedtNeuRef.current
      laedtNeuRef.current = false
      setLaedtNeu(false)
      if (ergebnis.art === 'ok') {
        setZustand({
          art: 'ok',
          konfiguration: ergebnis.daten,
          formular: ausKonfiguration(ergebnis.daten),
          ladung: ladeZaehler,
          neuGeladen: neu,
        })
      } else if (neu) {
        // Formular und ungespeicherte Eingaben bleiben erhalten, die Navigationssperre ebenso.
        setNeuLadenFehler(true)
      } else {
        setZustand({ art: 'fehler' })
      }
    })
    return () => {
      aktiv = false
    }
  }, [ladeZaehler])

  const geaendert = zustand.art === 'ok' && istGeaendert(zustand.formular, zustand.konfiguration)
  useEffect(() => {
    onGeaendert(geaendert)
  }, [geaendert, onGeaendert])

  const neuLaden = useCallback(() => {
    if (laedtNeuRef.current) return
    laedtNeuRef.current = zustand.art === 'ok'
    setLaedtNeu(laedtNeuRef.current)
    setNeuLadenFehler(false)
    setLadeZaehler((n) => n + 1)
  }, [zustand.art])

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 p-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Startseite verwalten</h1>
        {zustand.art === 'ok' && !zustand.konfiguration.standard && zustand.konfiguration.geaendertAm ? (
          <p className="text-sm text-muted-foreground">
            {`Zuletzt gespeichert am ${formatiereZeitpunkt(zustand.konfiguration.geaendertAm)} von ${
              zustand.konfiguration.geaendertVon ?? 'unbekannt'
            }`}
          </p>
        ) : null}
      </div>
      {zustand.art === 'laedt' ? (
        <p role="status" className="text-muted-foreground">
          Konfiguration wird geladen …
        </p>
      ) : null}
      {zustand.art === 'fehler' ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-destructive">
          <p>Die Konfiguration der Startseite konnte nicht geladen werden. Bitte später erneut versuchen.</p>
          <Button type="button" variant="outline" onClick={neuLaden}>
            Erneut versuchen
          </Button>
        </div>
      ) : null}
      {zustand.art === 'ok' && neuLadenFehler ? (
        <p role="alert" className="text-destructive">
          Die Konfiguration konnte nicht neu geladen werden. Bitte später erneut versuchen.
        </p>
      ) : null}
      {zustand.art === 'ok' ? (
        <Bearbeitung
          key={zustand.ladung}
          konfiguration={zustand.konfiguration}
          formular={zustand.formular}
          onFormular={(aendern) =>
            setZustand((alt) => (alt.art === 'ok' ? { ...alt, formular: aendern(alt.formular) } : alt))
          }
          onGespeichert={(neu) =>
            setZustand((alt) => ({
              art: 'ok',
              konfiguration: neu,
              formular: ausKonfiguration(neu),
              ladung: alt.art === 'ok' ? alt.ladung : ladeZaehler,
              neuGeladen: alt.art === 'ok' && alt.neuGeladen,
            }))
          }
          onNeuLaden={neuLaden}
          gesperrt={laedtNeu}
          neuGeladen={zustand.neuGeladen}
        />
      ) : null}
    </div>
  )
}

interface BearbeitungProps {
  konfiguration: Konfiguration
  formular: Formular
  onFormular: (aendern: (alt: Formular) => Formular) => void
  onGespeichert: (konfiguration: Konfiguration) => void
  onNeuLaden: () => void
  gesperrt: boolean
  neuGeladen: boolean
}

/** Tabs mit Formular und Vorschau; Object-URLs neuer Logos werden hier einmal erzeugt und an beide gegeben. */
function Bearbeitung({
  konfiguration,
  formular,
  onFormular,
  onGespeichert,
  onNeuLaden,
  gesperrt,
  neuGeladen,
}: BearbeitungProps) {
  const urlBereitsteller = useDateiUrl(formular.logos.bereitsteller.datei)
  const urlSoftware = useDateiUrl(formular.logos.software.datei)
  const logoUrls = useMemo(
    () => ({ bereitsteller: urlBereitsteller, software: urlSoftware }),
    [urlBereitsteller, urlSoftware],
  )

  return (
    <Tabs defaultValue="bearbeiten" className="min-w-0">
      <TabsList>
        <TabsTrigger value="bearbeiten">Bearbeiten</TabsTrigger>
        <TabsTrigger value="vorschau">Vorschau</TabsTrigger>
      </TabsList>
      <TabsContent value="bearbeiten" keepMounted className="min-w-0 pt-2">
        <StartseiteFormular
          konfiguration={konfiguration}
          formular={formular}
          logoUrls={logoUrls}
          onAendern={onFormular}
          onGespeichert={onGespeichert}
          onNeuLaden={onNeuLaden}
          gesperrt={gesperrt}
          neuGeladen={neuGeladen}
        />
      </TabsContent>
      <TabsContent value="vorschau" className="min-w-0 pt-2">
        <section aria-label="Vorschau der Startseite" className="rounded-xl border p-4">
          <StartseiteBloecke bloecke={zuAnsicht(formular, konfiguration.daten, logoUrls)} ebene={2} />
        </section>
      </TabsContent>
    </Tabs>
  )
}
