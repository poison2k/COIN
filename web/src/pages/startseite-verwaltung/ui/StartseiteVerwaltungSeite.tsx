import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ladeKonfiguration, useDateiUrl, type Konfiguration } from '@/entities/startseite'
import {
  ausKonfiguration,
  istGeaendert,
  StartseiteFormular,
  zuAnsicht,
  type Formular,
} from '@/features/startseite-konfigurieren'
import { formatiereZeitpunkt } from '@/shared/lib/format'
import { Card, CardContent } from '@/shared/ui/card'
import { Seitenkopf } from '@/shared/ui/seitenkopf'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { Fehlerzustand, Ladeanzeige } from '@/shared/ui/zustaende'
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

/** Beschreibung ohne gespeicherte Konfiguration (startseite-listen-pruefung 4.4). */
const BESCHREIBUNG = 'Blöcke der Startseite ein- und ausschalten, ordnen und mit Inhalt füllen.'

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
    <div className="grid min-w-0 gap-6">
      <Seitenkopf
        titel="Startseite verwalten"
        beschreibung={
          zustand.art === 'ok' && !zustand.konfiguration.standard && zustand.konfiguration.geaendertAm
            ? `Zuletzt gespeichert am ${
                formatiereZeitpunkt(zustand.konfiguration.geaendertAm) || zustand.konfiguration.geaendertAm
              } von ${zustand.konfiguration.geaendertVon ?? 'unbekannt'}`
            : BESCHREIBUNG
        }
      />
      {zustand.art === 'laedt' ? <Ladeanzeige text="Konfiguration wird geladen …" form="karte" /> : null}
      {zustand.art === 'fehler' ? (
        <Fehlerzustand
          meldung="Die Konfiguration der Startseite konnte nicht geladen werden. Bitte später erneut versuchen."
          onErneutVersuchen={neuLaden}
        />
      ) : null}
      {zustand.art === 'ok' && neuLadenFehler ? (
        <Fehlerzustand
          meldung="Die Konfiguration konnte nicht neu geladen werden. Bitte später erneut versuchen."
          onErneutVersuchen={neuLaden}
        />
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
      <TabsContent value="bearbeiten" keepMounted className="min-w-0 pt-4">
        <Card>
          <CardContent>
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
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="vorschau" className="min-w-0 pt-4">
        <Card>
          <CardContent>
            <section aria-label="Vorschau der Startseite" className="min-w-0">
              <StartseiteBloecke bloecke={zuAnsicht(formular, konfiguration.daten, logoUrls)} ebene={2} />
            </section>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
