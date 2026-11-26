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
 * Logo per `<img src>` (öffentliche URL oder Object-URL) auf heller Fläche (A4). Feste Höhe je Breite (48/72/96 px,
 * nacharbeiten-audit-filter 4.6), Breite aus dem Seitenverhältnis; nie verzerrt oder beschnitten (`object-contain`).
 * Sehr breite Logos (über 2,5 : 1) werden auf die verfügbare Breite verkleinert.
 */
function LogoBild({ logo, className }: { logo: Logo; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full min-w-0 rounded-lg bg-logo-surface p-2', className)}>
      <img
        src={logo.url}
        alt={logo.alternativtext}
        width={logo.breite}
        height={logo.hoehe}
        className="h-12 w-auto max-w-full min-w-0 object-contain md:h-18 lg:h-24"
      />
    </span>
  )
}

/** Hervorgehobene Fläche des Kopfbereichs; auch für die Begrüßung ohne Leserecht (startseite-listen-pruefung, 4.1). */
export function KopfFlaeche({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-xs md:p-8">{children}</div>
}

/**
 * Kopfbereich (AK-20, AK-22, startseite-listen-pruefung AK-4, nacharbeiten-audit-filter 4.6 Variante A): unter 640 px
 * untereinander und linksbündig; von 640 bis 1023 px beide Logos in einer Zeile über dem Titel (Bereitsteller links,
 * Software rechts), Titel und Untertitel darunter über die volle Breite zentriert; ab 1024 px Logo | Titel | Logo. Die
 * DOM-Reihenfolge bleibt, die Anordnung entsteht über die Rasterplätze. Alle Texte sind reiner Text (React escaped sie,
 * ADR-0031 Punkt 8).
 */
export function Kopfbereich({ titel, untertitel, logoBereitsteller, logoSoftware, ebene }: KopfbereichProps) {
  const mitLogos = logoBereitsteller !== null || logoSoftware !== null
  return (
    <KopfFlaeche>
      <div
        className={cn(
          'flex flex-col items-start gap-4',
          mitLogos && 'sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-6',
        )}
      >
        {logoBereitsteller ? (
          <LogoBild logo={logoBereitsteller} className="sm:col-start-1 sm:row-start-1 sm:justify-self-start" />
        ) : null}
        <div
          className={cn(
            'grid w-full min-w-0 gap-1',
            mitLogos && 'sm:col-span-3 sm:row-start-2 sm:text-center lg:col-span-1 lg:col-start-2 lg:row-start-1',
          )}
        >
          <Ueberschrift ebene={ebene} className="min-w-0 text-2xl wrap-anywhere hyphens-auto lg:text-3xl">
            {titel}
          </Ueberschrift>
          {untertitel ? <p className="text-lg break-words text-muted-foreground">{untertitel}</p> : null}
        </div>
        {logoSoftware ? (
          <LogoBild logo={logoSoftware} className="sm:col-start-3 sm:row-start-1 sm:justify-self-end" />
        ) : null}
      </div>
    </KopfFlaeche>
  )
}
