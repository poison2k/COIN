import type { Logo } from '../model/types'
import { Ueberschrift, type Ebene } from './Ueberschrift'

export interface KopfbereichProps {
  titel: string
  untertitel: string
  logoBereitsteller: Logo | null
  logoSoftware: Logo | null
  /** Ebene des Titels: 1 auf `/` (einziges h1, AK-21), 2 in der Vorschau. */
  ebene: Ebene
}

/** Logo per `<img src>` (öffentliche URL oder Object-URL), höchstens 96 px hoch, auf heller Fläche (A4). */
function LogoBild({ logo }: { logo: Logo }) {
  return (
    <span className="inline-flex shrink-0 rounded-lg bg-white p-2">
      <img
        src={logo.url}
        alt={logo.alternativtext}
        width={logo.breite}
        height={logo.hoehe}
        className="h-auto max-h-24 w-auto max-w-full object-contain"
      />
    </span>
  )
}

/**
 * Kopfbereich (AK-20, AK-22): Logo des Bereitstellers links, Titel und Untertitel, Logo der Software rechts; auf
 * schmalen Bildschirmen untereinander. Alle Texte sind reiner Text (React escaped sie, ADR-0031 Punkt 8).
 */
export function Kopfbereich({ titel, untertitel, logoBereitsteller, logoSoftware, ebene }: KopfbereichProps) {
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      {logoBereitsteller ? <LogoBild logo={logoBereitsteller} /> : null}
      <div className="grid min-w-0 flex-1 gap-1">
        <Ueberschrift ebene={ebene} className="text-2xl break-words">
          {titel}
        </Ueberschrift>
        {untertitel ? <p className="text-muted-foreground">{untertitel}</p> : null}
      </div>
      {logoSoftware ? <LogoBild logo={logoSoftware} /> : null}
    </div>
  )
}
