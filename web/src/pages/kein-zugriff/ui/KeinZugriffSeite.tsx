import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import type { Benutzer } from '@/entities/benutzer'
import { AbmeldenButton } from '@/features/anmeldung'
import { ROUTEN } from '@/shared/config'
import { Button, buttonVariants } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'

/** Ergebnis von „Erneut prüfen“ (rollen-benutzerverwaltung Rev. 3, AK-42). */
export type ErneutPruefenErgebnis = 'unveraendert' | 'fehler' | 'geaendert'

type MitPruefung = ({ grund: 'keineRolle'; benutzer: Benutzer } | { grund: 'deaktiviert' }) & {
  /** Lädt den Benutzer neu (/api/me) und meldet, ob sich der Zugriff geändert hat (Rev. 3, AK-41/AK-42). */
  onErneutPruefen: () => Promise<ErneutPruefenErgebnis>
}

/**
 * Warum kein Zugriff besteht: noch keine Rolle (AK-29), Konto deaktiviert (rollen-benutzerverwaltung, AK-32) oder
 * mit Rolle ohne die nötige Berechtigung für die Seite (katalog-seiten, AK-10; ohne „Erneut prüfen“).
 */
export type KeinZugriffSeiteProps = MitPruefung | { grund: 'keineBerechtigung' }

const WEITERHIN: Record<MitPruefung['grund'], string> = {
  deaktiviert: 'Ihr Benutzerkonto ist weiterhin deaktiviert.',
  keineRolle: 'Ihrem Benutzerkonto ist weiterhin keine Rolle zugewiesen.',
}

const FEHLGESCHLAGEN = 'Die Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.'

/** Seite „Kein Zugriff“ (/kein-zugriff). Rendert kein eigenes <main>. */
export function KeinZugriffSeite(props: KeinZugriffSeiteProps) {
  const [prueft, setPrueft] = useState(false)
  const [meldung, setMeldung] = useState<{ art: 'status' | 'alert'; text: string } | null>(null)
  // Synchroner Schutz: Weitere Klicks oder Enter vor dem nächsten Rendern lösen keine zweite Prüfung aus.
  const prueftGerade = useRef(false)

  async function erneutPruefen() {
    if (props.grund === 'keineBerechtigung' || prueftGerade.current) return
    const { grund, onErneutPruefen } = props
    prueftGerade.current = true
    setPrueft(true)
    setMeldung(null)
    try {
      const ergebnis = await onErneutPruefen()
      if (ergebnis === 'unveraendert') setMeldung({ art: 'status', text: WEITERHIN[grund] })
      else if (ergebnis === 'fehler') setMeldung({ art: 'alert', text: FEHLGESCHLAGEN })
    } catch {
      setMeldung({ art: 'alert', text: FEHLGESCHLAGEN })
    } finally {
      prueftGerade.current = false
      setPrueft(false)
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl p-6">
      <Card className="max-w-2xl">
        <CardContent className="grid justify-items-start gap-4">
          <h1 className="text-2xl font-semibold">Kein Zugriff</h1>
          {props.grund === 'deaktiviert' && (
            <p>
              Ihr Benutzerkonto ist deaktiviert. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei
              Fragen an einen Administrator.
            </p>
          )}
          {props.grund === 'keineBerechtigung' && (
            <p>
              Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen.
              Wenden Sie sich bei Fragen an einen Administrator.
            </p>
          )}
          {props.grund === 'keineRolle' && (
            <p>
              Sie sind als {props.benutzer.name} angemeldet, Ihrem Konto ist aber noch keine Rolle zugewiesen. Den
              Coin-Katalog können Sie weiterhin ansehen. Für weitere Funktionen wenden Sie sich bitte an einen
              Administrator.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link to={ROUTEN.coinListe} className={buttonVariants()}>
              Zum Coin-Katalog
            </Link>
            {/* Während der Prüfung fokussierbar (aria-disabled statt disabled), damit der Fokus nicht auf body fällt. */}
            {props.grund !== 'keineBerechtigung' && (
              <Button
                type="button"
                variant="outline"
                disabled={prueft}
                focusableWhenDisabled
                className="aria-disabled:opacity-50"
                onClick={() => void erneutPruefen()}
              >
                {prueft ? 'Wird geprüft …' : 'Erneut prüfen'}
              </Button>
            )}
            <AbmeldenButton />
          </div>
          <p role="status" className="empty:sr-only">
            {meldung?.art === 'status' ? meldung.text : ''}
          </p>
          {meldung?.art === 'alert' && (
            <p role="alert" className="text-destructive">
              {meldung.text}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
