import { useRef, type MouseEvent, type ReactNode } from 'react'
import { ThemeUmschalter } from '@/features/theme-umschalten'
import { SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar'
import { Toaster, ToastProvider } from '@/shared/ui/toast'
import { AppSidebar } from './AppSidebar'
import { AnmeldeBereich, type BenutzerZustand } from './Kopfzeile'

export interface AppShellProps {
  /** Anmeldezustand für Kopfzeile (Anmelden bzw. Name und Abmelden) und Seitenleiste (Einträge nach Berechtigung). */
  benutzerZustand: BenutzerZustand
  children: ReactNode
}

/**
 * Layout der App (design-fundament, Abschnitt 6, ADR-0036 Punkt 1): Skip-Link, Seitenleiste, Kopfzeile (das einzige
 * <header>) und `main#inhalt` mit dem Inhaltscontainer. Seiten setzen keinen eigenen Rand und keine eigene Breite.
 */
export function AppShell({ benutzerZustand, children }: AppShellProps) {
  const inhalt = useRef<HTMLElement>(null)

  // Der Skip-Link setzt nur den Fokus; Pfad, Suche und Hash der URL bleiben unverändert (AK-26).
  function zumInhalt(ereignis: MouseEvent<HTMLAnchorElement>) {
    ereignis.preventDefault()
    inhalt.current?.focus()
  }

  return (
    <ToastProvider>
      <SidebarProvider>
        <a
          href="#inhalt"
          onClick={zumInhalt}
          className="sr-only rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground shadow-md outline-none focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        >
          Zum Inhalt springen
        </a>
        <AppSidebar benutzerZustand={benutzerZustand} />
        <div className="relative flex w-full min-w-0 flex-1 flex-col bg-background">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-6">
            <SidebarTrigger />
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <AnmeldeBereich zustand={benutzerZustand} />
              <ThemeUmschalter />
            </div>
          </header>
          <main ref={inhalt} id="inhalt" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
            <div className="mx-auto w-full max-w-page min-w-0 px-4 py-6 md:px-6 md:py-8 lg:px-8">{children}</div>
          </main>
        </div>
      </SidebarProvider>
      <Toaster />
    </ToastProvider>
  )
}
