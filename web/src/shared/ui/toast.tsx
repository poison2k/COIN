import { Toast } from '@base-ui/react/toast'
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon, XIcon, type LucideIcon } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'

// Toast mit Base UI (design-fundament, ADR-0038, AK-22): Region „Benachrichtigungen“, höchstens 3 sichtbar,
// „erfolg“/„info“ verschwinden nach 6 s (Pause bei Hover/Fokus), „warnung“/„fehler“ bleiben stehen. Die Art steht als
// Text für Screenreader vor dem Titel. Toasts enthalten nie Personendaten (ADR-0038 Punkt 3).
//
// Abweichung von ADR-0038 Punkt 2: Base UI blendet Toasts mit `priority: 'high'` per aria-hidden aus und sagt sie über
// eine eigene, versteckte Live-Region an. Der Schließen-Button läge dann in einem aria-hidden-Bereich (axe
// „aria-hidden-focus“) und wäre für Screenreader nicht erreichbar. Alle Arten werden daher höflich angesagt; „warnung“
// und „fehler“ bleiben dafür dauerhaft stehen.

export type ToastArt = 'erfolg' | 'info' | 'warnung' | 'fehler'

export interface ToastDaten {
  titel: string
  beschreibung?: string
  art: ToastArt
}

const ZEITLIMIT_MS = 6000
const HOECHSTENS_SICHTBAR = 3

const PRAEFIX: Readonly<Record<ToastArt, string>> = {
  erfolg: 'Erfolg:',
  info: 'Hinweis:',
  warnung: 'Warnung:',
  fehler: 'Fehler:',
}

const ICON: Readonly<Record<ToastArt, { icon: LucideIcon; farbe: string }>> = {
  erfolg: { icon: CircleCheckIcon, farbe: 'text-success' },
  info: { icon: InfoIcon, farbe: 'text-info' },
  warnung: { icon: TriangleAlertIcon, farbe: 'text-warning' },
  fehler: { icon: CircleAlertIcon, farbe: 'text-destructive' },
}

function istArt(wert: string | undefined): wert is ToastArt {
  return wert === 'erfolg' || wert === 'info' || wert === 'warnung' || wert === 'fehler'
}

function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider timeout={ZEITLIMIT_MS} limit={HOECHSTENS_SICHTBAR}>
      {children}
    </Toast.Provider>
  )
}

function useToast() {
  const manager = Toast.useToastManager()
  const zeige = useCallback(
    ({ titel, beschreibung, art }: ToastDaten) =>
      manager.add({
        title: titel,
        description: beschreibung,
        type: art,
        timeout: art === 'fehler' || art === 'warnung' ? 0 : ZEITLIMIT_MS,
      }),
    [manager],
  )
  return useMemo(() => ({ zeige }), [zeige])
}

function ToastListe() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((toast) => {
    const art = istArt(toast.type) ? toast.type : 'info'
    const { icon: Icon, farbe } = ICON[art]
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        data-art={art}
        className="pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border bg-popover p-4 pr-14 text-sm text-popover-foreground shadow-md transition-opacity duration-200 data-ending-style:opacity-0 data-limited:hidden data-starting-style:opacity-0"
      >
        <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', farbe)} />
        <div className="grid min-w-0 gap-1">
          <Toast.Title className="font-semibold break-words">
            <span className="sr-only">{PRAEFIX[art]} </span>
            {toast.title}
          </Toast.Title>
          {toast.description && (
            <Toast.Description className="break-words text-muted-foreground">{toast.description}</Toast.Description>
          )}
        </div>
        <Toast.Close
          aria-label="Meldung schließen"
          // Base UI blendet den Button im gestapelten Zustand per aria-hidden aus; hier stehen die Meldungen untereinander.
          aria-hidden={false}
          render={<Button variant="ghost" size="icon" className="absolute top-2 right-2" />}
        >
          <XIcon aria-hidden="true" />
        </Toast.Close>
      </Toast.Root>
    )
  })
}

/** Text der Ansage für eine Meldung: Art als Präfix, Titel und Beschreibung. */
function ansageText(toast: { type?: string; title?: ReactNode; description?: ReactNode }): string {
  const art = istArt(toast.type) ? toast.type : 'info'
  const teile = [toast.title, toast.description].filter((t) => typeof t === 'string' && t !== '')
  return `${PRAEFIX[art]} ${teile.join('. ')}`
}

interface AnsageStand {
  /** Ids der Meldungen, die beim letzten Rendern bekannt waren. */
  bekannt: ReadonlySet<string>
  /** Zuletzt angesagte Meldung. */
  angesagt: { id: string; text: string } | null
}

/**
 * Dauerhaft vorhandene, unsichtbare Live-Region, die neue Meldungen ansagt. Sie hat bewusst keine Rolle (weder
 * `region` noch `status`), damit sie weder in der Landmark-Liste noch bei Statusabfragen der Seiten auftaucht.
 * Angesagt wird nur beim Hinzufügen einer Meldung mit bisher unbekannter Id; Schließen oder Ablaufen ändern die Region
 * nicht (sonst würde eine ältere Meldung erneut angesagt). Jede Ansage ist ein neuer Knoten (`key`), damit auch eine
 * zweite gleichlautende Meldung angesagt wird.
 */
function Ansage() {
  const { toasts } = Toast.useToastManager()
  const [stand, setStand] = useState<AnsageStand>({ bekannt: new Set(), angesagt: null })
  // Neueste Meldung steht vorn (Base UI fügt am Anfang ein).
  const neu = toasts.find((toast) => !stand.bekannt.has(toast.id))
  if (neu) {
    // Zustandsaktualisierung während des Renderns (abgeleiteter Zustand), nur wenn eine unbekannte Id auftaucht.
    setStand({ bekannt: new Set(toasts.map((toast) => toast.id)), angesagt: { id: neu.id, text: ansageText(neu) } })
  }
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {stand.angesagt && <div key={stand.angesagt.id}>{stand.angesagt.text}</div>}
    </div>
  )
}

/**
 * Region „Benachrichtigungen“. Ohne Meldung ist sie ausgeblendet (`empty:hidden`), damit sie nicht als leere Region in
 * der Landmark-Liste der Seiten steht. Eine Live-Region, die erst mit ihrem Inhalt sichtbar wird, sagen Screenreader
 * oft nicht an; die Ansage übernimmt deshalb die dauerhaft gerenderte `Ansage`. Base UI setzt am Viewport
 * `aria-live="polite"`; das wird hier auf `off` gestellt, damit nichts doppelt angesagt wird.
 */
function Toaster() {
  return (
    <Toast.Portal>
      <Ansage />
      <Toast.Viewport
        aria-label="Benachrichtigungen"
        aria-live="off"
        className="pointer-events-none fixed right-4 bottom-4 left-4 z-50 flex flex-col gap-2 outline-none empty:hidden sm:left-auto sm:w-96"
      >
        <ToastListe />
      </Toast.Viewport>
    </Toast.Portal>
  )
}

export { ToastProvider, Toaster, useToast }
