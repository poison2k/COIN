import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { CoinFormular, type CoinFormularProps } from '@/features/coin-anlegen'
import { StandardvorlageHerunterladen } from '@/features/standardvorlage-herunterladen'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Seitenkopf } from '@/shared/ui/seitenkopf'
import { VerlassenWarnung } from '@/shared/ui/verlassen-warnung'

export type CoinAnlegenSeiteProps = Pick<CoinFormularProps, 'onAngelegt'>

/**
 * Seite „Coin hinzufügen“ (/coins/neu, katalog-seiten AK-21 bis AK-24): Formular mit „Abbrechen“ in der Aktionsleiste
 * und Warnung bei ungespeicherten Änderungen (formulare-detailseiten AK-13), darunter der
 * Abschnitt „Zertifikatsvorlage“ mit dem Download der Standardvorlage (zertifikatsvorlagen, AK-31). Wohin es nach dem
 * Anlegen geht, entscheidet die Route über `onAngelegt`. Rendert kein eigenes <main>.
 */
export function CoinAnlegenSeite({ onAngelegt }: CoinAnlegenSeiteProps) {
  const [geaendert, setGeaendert] = useState(false)
  return (
    <div className="grid min-w-0 gap-6">
      <Seitenkopf titel="Coin hinzufügen" />
      {/* overflow-visible: Die Aktionsleiste klebt unter 768 px am Viewport (sticky), nicht an der Karte. */}
      <Card className="max-w-reading overflow-visible">
        <CardContent>
          <CoinFormular
            onAngelegt={onAngelegt}
            onGeaendert={setGeaendert}
            abbrechen={
              <Link to={ROUTEN.coinListe} className={buttonVariants({ variant: 'outline' })}>
                Abbrechen
              </Link>
            }
          />
        </CardContent>
      </Card>
      <VerlassenWarnung
        aktiv={geaendert}
        beschreibung="Der neue Coin ist nicht gespeichert. Seite trotzdem verlassen?"
      />
      <Card className="max-w-reading">
        <CardContent>
          <section aria-labelledby="coin-anlegen-vorlage" className="grid gap-3">
            <h2 id="coin-anlegen-vorlage" className="text-xl font-semibold">
              Zertifikatsvorlage
            </h2>
            <p>
              Laden Sie die Standardvorlage herunter, um daraus in Word eine Urkunde zu gestalten. Die fertige Vorlage
              laden Sie nach dem Anlegen auf der Detailseite des Coins im Reiter „Zertifikatsvorlage“ hoch.
            </p>
            <StandardvorlageHerunterladen />
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
