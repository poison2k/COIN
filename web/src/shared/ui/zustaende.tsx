import { RotateCcwIcon } from 'lucide-react'
import { useRef, type ReactNode, type Ref, type RefObject } from 'react'
import { cn } from '@/shared/lib/cn'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty'
import { Skeleton } from '@/shared/ui/skeleton'

// Einheitliche Zustände (design-fundament, Abschnitt 5 und 7, ADR-0036 Punkt 5, AK-19 bis AK-21).

export interface LeerzustandProps {
  titel: ReactNode
  beschreibung?: ReactNode
  /** Button oder Link. */
  aktion?: ReactNode
  /** Dekoratives Icon; wird für Screenreader ausgeblendet. */
  icon?: ReactNode
  /** Überschriftenebene des Titels (Standard 2). */
  titelEbene?: 1 | 2 | 3 | 4
  className?: string
}

export function Leerzustand({ titel, beschreibung, aktion, icon, titelEbene = 2, className }: LeerzustandProps) {
  const Ueberschrift = `h${titelEbene}` as const
  return (
    <Empty className={cn('rounded-xl border border-dashed', className)}>
      <EmptyHeader>
        {icon && (
          <EmptyMedia variant="icon" aria-hidden="true">
            {icon}
          </EmptyMedia>
        )}
        <EmptyTitle className={titelEbene === 1 ? 'text-2xl md:text-3xl' : undefined}>
          <Ueberschrift className="outline-none">{titel}</Ueberschrift>
        </EmptyTitle>
        {beschreibung && <EmptyDescription>{beschreibung}</EmptyDescription>}
      </EmptyHeader>
      {aktion && <EmptyContent>{aktion}</EmptyContent>}
    </Empty>
  )
}

export interface LadeanzeigeProps {
  /** Text nur für Screenreader, z. B. „Coin wird geladen …“. */
  text: string
  /**
   * `false`, wenn eine eigene Statuszeile den Ladetext schon ansagt (z. B. Katalog, Audit-Log): dann nur die
   * Platzhalter ohne zweite Live-Region (startseite-listen-pruefung, Abschnitt 4.2).
   */
  ansage?: boolean
  form?: 'zeilen' | 'karte' | 'tabelle'
  className?: string
}

function Platzhalter({ form }: { form: NonNullable<LadeanzeigeProps['form']> }) {
  switch (form) {
    case 'karte':
      return (
        <div className="grid gap-4 rounded-xl border p-6">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-10 w-32" />
        </div>
      )
    case 'tabelle':
      return (
        <div className="grid gap-2">
          <Skeleton className="h-10 w-full" />
          {[0, 1, 2, 3, 4].map((zeile) => (
            <Skeleton key={zeile} className="h-8 w-full" />
          ))}
        </div>
      )
    case 'zeilen':
      return (
        <div className="grid gap-3">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )
  }
}

export function Ladeanzeige({ text, form = 'zeilen', ansage = true, className }: LadeanzeigeProps) {
  return (
    <div className={cn('grid w-full gap-4', className)}>
      {ansage && (
        <span role="status" className="sr-only">
          {text}
        </span>
      )}
      <div aria-hidden="true">
        <Platzhalter form={form} />
      </div>
    </div>
  )
}

export interface FehlerzustandProps {
  meldung: ReactNode
  titel?: ReactNode
  /**
   * Zeigt den Button „Erneut versuchen“; der Fokus wird beim Erscheinen nicht verschoben. Beim Klick wandert er vor dem
   * Aufruf ins Fokusziel (ADR-0047 Punkt 2), damit er nicht mit dem Button auf `body` fällt.
   */
  onErneutVersuchen?: () => void
  /**
   * Ziel des Fokus nach „Erneut versuchen“. Ohne Angabe der nächste Vorfahre mit `data-inhaltsbereich`, sonst
   * `main#inhalt`. Fokussiert wird die erste Überschrift (h1–h4) im Ziel außerhalb des Fehlerzustands, sonst das Ziel.
   */
  fokusZiel?: RefObject<HTMLElement | null>
  /**
   * `false`: das Ziel selbst statt seiner ersten Überschrift fokussieren, wenn die Überschrift beim Neuladen
   * ausgehängt oder ersetzt wird (z. B. Startseite).
   */
  fokusUeberschrift?: boolean
  /** Weitere Bedienelemente (z. B. ein Link) neben „Erneut versuchen“. */
  aktion?: ReactNode
  /** Ref auf die Alarm-Wurzel, z. B. für die Fokusführung beim Blättern (`useFokusBeiLadefehler`). */
  ref?: Ref<HTMLDivElement>
  /** Per Skript fokussierbar (`tabIndex={-1}`) mit sichtbarem Fokusring, ohne eigenen Tab-Stopp. */
  fokussierbar?: boolean
  className?: string
}

export function Fehlerzustand({
  meldung,
  titel,
  onErneutVersuchen,
  aktion,
  ref,
  fokussierbar = false,
  fokusZiel,
  fokusUeberschrift = true,
  className,
}: FehlerzustandProps) {
  const eigenerRef = useRef<HTMLDivElement>(null)

  function erneutVersuchen() {
    const wurzel = eigenerRef.current
    if (wurzel) fokussiereInhalt(wurzel, fokusZiel?.current ?? null, fokusUeberschrift)
    onErneutVersuchen?.()
  }

  return (
    <Alert
      ref={(element: HTMLDivElement | null) => {
        eigenerRef.current = element
        if (typeof ref === 'function') ref(element)
        else if (ref) ref.current = element
      }}
      variant="destructive"
      role="alert"
      tabIndex={fokussierbar ? -1 : undefined}
      className={cn(fokussierbar && 'outline-none focus-visible:ring-3 focus-visible:ring-ring', className)}
    >
      {titel && <AlertTitle>{titel}</AlertTitle>}
      <AlertDescription>{meldung}</AlertDescription>
      {(onErneutVersuchen || aktion) && (
        <div className="col-start-2 mt-3 flex flex-wrap items-center gap-2">
          {onErneutVersuchen && (
            <Button type="button" variant="outline" onClick={erneutVersuchen}>
              <RotateCcwIcon aria-hidden="true" />
              Erneut versuchen
            </Button>
          )}
          {aktion}
        </div>
      )}
    </Alert>
  )
}

/** Klassen für einen sichtbaren Fokusring an per Skript fokussierten Zielen (wie `Fehlerzustand fokussierbar`). */
const FOKUS_KLASSEN = ['rounded-md', 'outline-none', 'focus-visible:ring-3', 'focus-visible:ring-ring']

/** Fokus nach „Erneut versuchen“ (ADR-0047 Punkt 2): erste Überschrift im Ziel, sonst das Ziel selbst. */
function fokussiereInhalt(fehlerzustand: HTMLElement, festesZiel: HTMLElement | null, mitUeberschrift: boolean) {
  const ziel =
    festesZiel ??
    fehlerzustand.closest<HTMLElement>('[data-inhaltsbereich]') ??
    document.querySelector<HTMLElement>('main#inhalt')
  if (!ziel) return
  const ueberschrift = mitUeberschrift
    ? Array.from(ziel.querySelectorAll<HTMLElement>('h1, h2, h3, h4')).find(
        (element) => !fehlerzustand.contains(element),
      )
    : undefined
  const element = ueberschrift ?? ziel
  if (!element.hasAttribute('tabindex')) {
    // Nur vorübergehend: Beim Verlassen des Fokus nimmt der Baustein tabindex und Fokusring wieder zurück, damit das
    // von React verwaltete Element keine dauerhaften Fremdattribute behält.
    const neueKlassen = FOKUS_KLASSEN.filter((klasse) => !element.classList.contains(klasse))
    element.setAttribute('tabindex', '-1')
    element.classList.add(...neueKlassen)
    element.addEventListener(
      'blur',
      () => {
        element.removeAttribute('tabindex')
        element.classList.remove(...neueKlassen)
      },
      { once: true },
    )
  }
  element.focus()
}

/**
 * Stabiler Inhaltsbereich einer Seite (ADR-0047 Punkt 2): bleibt beim Laden, im Fehlerfall und mit Inhalt eingehängt und
 * ist per Skript fokussierbar mit sichtbarem Fokusring. Fehlerzustände darin fokussieren ihn nach „Erneut versuchen“
 * (mit `fokusUeberschrift={false}`, wenn das h1 beim Neuladen ausgehängt wird).
 */
export function Inhaltsbereich({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-inhaltsbereich=""
      tabIndex={-1}
      className={cn('min-w-0 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring', className)}
    >
      {children}
    </div>
  )
}
