import { Progress as ProgressPrimitive } from '@base-ui/react/progress'
import { cn } from '@/shared/lib/cn'

// Fortschrittsbalken aus der shadcn-CLI (Base UI Progress), nachbearbeitet (ADR-0009, formulare-detailseiten AK-35):
// `cn` aus `@/shared/lib/cn` statt aus dem Paket `cn`, Balken höher (h-2) und `aria-valuetext` direkt als Prop. Ohne
// `aria-valuetext` nennt Base UI den Anteil als Prozentwert in der Sprache des Browsers.
// Base UI hängt an die Kinder der Wurzel einen visuell versteckten Span mit dem Text „x“ an. Der stünde im Textinhalt
// und im Accessibility-Baum (`progressbar "Verfügbar": x`). Die `render`-Prop rendert die Wurzel deshalb mit den
// eigenen Kindern; die Attribute (Rolle, aria-value*) übernimmt sie unverändert.

function Progress({ className, children, value, ...props }: ProgressPrimitive.Root.Props) {
  const inhalt = (
    <>
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </>
  )
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn('flex flex-wrap gap-3', className)}
      {...props}
      render={(attribute) => <div {...attribute}>{inhalt}</div>}
    />
  )
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn('relative flex h-2 w-full items-center overflow-x-hidden rounded-full bg-muted', className)}
      data-slot="progress-track"
      {...props}
    />
  )
}

function ProgressIndicator({ className, ...props }: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn('h-full bg-primary transition-all', className)}
      {...props}
    />
  )
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label className={cn('text-sm font-medium', className)} data-slot="progress-label" {...props} />
  )
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn('ml-auto text-sm text-muted-foreground tabular-nums', className)}
      data-slot="progress-value"
      {...props}
    />
  )
}

export { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue }
