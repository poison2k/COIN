import type { ReactNode } from 'react'
import { ThemeUmschalter } from '@/features/theme-umschalten'
import { SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { AnmeldeBereich, type BenutzerZustand } from './Kopfzeile'

export interface AppShellProps {
  /** Anmeldezustand für Kopfzeile (Anmelden bzw. Name und Abmelden) und Seitenleiste (Einträge nach Berechtigung). */
  benutzerZustand: BenutzerZustand
  children: ReactNode
}

/**
 * Layout der App: Seitenleiste, Kopfzeile mit Anmeldung und Umschaltern und Seiteninhalt (AK-14 bis AK-16, AK-30).
 * Die Kopfzeile steht neben dem `main` (eigenes banner-Landmark), damit der Seiteninhalt nur die Seite enthält.
 */
export function AppShell({ benutzerZustand, children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar benutzerZustand={benutzerZustand} />
      <div className="relative flex w-full min-w-0 flex-1 flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <AnmeldeBereich zustand={benutzerZustand} />
            <ThemeUmschalter />
          </div>
        </header>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </SidebarProvider>
  )
}
