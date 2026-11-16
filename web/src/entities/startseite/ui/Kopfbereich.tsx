import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
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

/**
 * Logo per `<img src>` (öffentliche URL oder Object-URL), höchstens 96 px hoch, auf heller Fläche (A4). Es verkleinert
 * sich mit seiner Spalte, damit der Titel neben beiden Logos Platz behält (AK-4).
 */
function LogoBild({ logo, className }: { logo: Logo; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full min-w-0 rounded-lg bg-logo-surface p-2', className)}>
      <img
        src={logo.url}
        alt={logo.alternativtext}
        width={logo.breite}
        height={logo.hoehe}
        className="h-auto max-h-24 w-auto max-w-full min-w-0 object-contain"
      />
    </span>
  )
}

/** Hervorgehobene Fläche des Kopfbereichs; auch für die Begrüßung ohne Leserecht (startseite-listen-pruefung, 4.1). */
export function KopfFlaeche({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-xs md:p-8">{children}</div>
}

/**
 * Kopfbereich (AK-20, AK-22, startseite-listen-pruefung AK-4): Logo des Bereitstellers links, Titel und Untertitel
 * mittig, Logo der Software rechts; unter 640 px untereinander und linksbündig. Alle Texte sind reiner Text (React
 * escaped sie, ADR-0031 Punkt 8).
 */
export function Kopfbereich({ titel, untertitel, logoBereitsteller, logoSoftware, ebene }: KopfbereichProps) {
  const mitLogos = logoBereitsteller !== null || logoSoftware !== null
  return (
    <KopfFlaeche>
      {/* Ab 640 px drei Spalten (Logo | Titel | Logo, 1:3:1), die Logos schrumpfen mit ihrer Spalte; ohne Logos nur
          der Titel. Darunter untereinander und linksbündig. */}
      <div
        className={cn(
          'flex flex-col items-start gap-4',
          mitLogos && 'sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,1fr)] sm:items-center sm:gap-6',
        )}
      >
        {logoBereitsteller ? <LogoBild logo={logoBereitsteller} className="sm:justify-self-start" /> : null}
        <div className={cn('grid w-full min-w-0 gap-1', mitLogos && 'sm:col-start-2 sm:text-center')}>
          <Ueberschrift ebene={ebene} className="min-w-0 text-2xl wrap-anywhere hyphens-auto lg:text-3xl">
            {titel}
          </Ueberschrift>
          {untertitel ? <p className="text-lg break-words text-muted-foreground">{untertitel}</p> : null}
        </div>
        {logoSoftware ? <LogoBild logo={logoSoftware} className="sm:col-start-3 sm:justify-self-end" /> : null}
      </div>
    </KopfFlaeche>
  )
}
